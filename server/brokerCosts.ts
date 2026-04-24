// ============================================================
// BROKER COSTS MODEL — Realistic Argentine Broker Fee Structure
// Models all-in transaction costs for CEDEARs in Argentina
// ============================================================

export interface BrokerCostBreakdown {
  grossAmount: number;
  commission: number;
  marketRights: number;      // Derechos de mercado BYMA
  ivaOnCommission: number;   // IVA 21% sobre comisión
  sellado: number;           // Impuesto de sellado (varía por provincia, ~1%)
  clearing: number;          // Gastos de compensación y liquidación
  other: number;             // Otros gastos (ingresos brutos, etc.)
  totalCosts: number;
  netAmount: number;
  effectiveCostPct: number;
}

export interface BrokerFeeConfig {
  name: string;
  commissionPct: number;        // Comisión del broker (ej: 0.004 = 0.4%)
  commissionMinArs: number;     // Mínimo por operación
  marketRightsPct: number;      // Derechos de mercado BYMA (~0.03%)
  ivaOnCommission: boolean;     // Si aplica IVA sobre comisión
  selladoPct: number;           // Sellado (CABA ~1%, otras provincias varía)
  clearingPct: number;          // Gastos de compensación (~0.01%)
  otherPct: number;             // Otros (~0.02%)
}

// Configuraciones basadas en brokers argentinos representativos
// Nota: Las comisiones reales varían y pueden incluir planes flat.
// Estos valores son conservadores para CEDEARs.
export const BROKER_CONFIGS: Record<string, BrokerFeeConfig> = {
  default: {
    name: "Broker Argentino Promedio",
    commissionPct: 0.004,      // 0.4% comisión
    commissionMinArs: 300,     // mínimo $300 ARS por operación
    marketRightsPct: 0.0003,   // ~0.03% derechos BYMA
    ivaOnCommission: true,
    selladoPct: 0.01,          // ~1% sellado (CABA)
    clearingPct: 0.0001,       // ~0.01% compensación
    otherPct: 0.0002,          // ~0.02% otros
  },
  balanz: {
    name: "Balanz",
    commissionPct: 0.004,
    commissionMinArs: 250,
    marketRightsPct: 0.0003,
    ivaOnCommission: true,
    selladoPct: 0.01,
    clearingPct: 0.0001,
    otherPct: 0.0002,
  },
  iol: {
    name: "InvertirOnline",
    commissionPct: 0.0035,
    commissionMinArs: 200,
    marketRightsPct: 0.0003,
    ivaOnCommission: true,
    selladoPct: 0.01,
    clearingPct: 0.0001,
    otherPct: 0.0002,
  },
  ppi: {
    name: "PPI",
    commissionPct: 0.0045,
    commissionMinArs: 350,
    marketRightsPct: 0.0003,
    ivaOnCommission: true,
    selladoPct: 0.01,
    clearingPct: 0.0001,
    otherPct: 0.0002,
  },
};

const IVA_PCT = 0.21;

export function calculateBrokerCosts(
  grossAmountArs: number,
  brokerKey = "default"
): BrokerCostBreakdown {
  const config = BROKER_CONFIGS[brokerKey] || BROKER_CONFIGS.default;
  const gross = Math.max(0, grossAmountArs);

  let commission = gross * config.commissionPct;
  if (commission < config.commissionMinArs) {
    commission = config.commissionMinArs;
  }

  const ivaOnCommission = config.ivaOnCommission ? commission * IVA_PCT : 0;
  const marketRights = gross * config.marketRightsPct;
  const sellado = gross * config.selladoPct;
  const clearing = gross * config.clearingPct;
  const other = gross * config.otherPct;

  const totalCosts = commission + ivaOnCommission + marketRights + sellado + clearing + other;
  const netAmount = gross - totalCosts;
  const effectiveCostPct = gross > 0 ? (totalCosts / gross) * 100 : 0;

  return {
    grossAmount: gross,
    commission: Math.round(commission * 100) / 100,
    marketRights: Math.round(marketRights * 100) / 100,
    ivaOnCommission: Math.round(ivaOnCommission * 100) / 100,
    sellado: Math.round(sellado * 100) / 100,
    clearing: Math.round(clearing * 100) / 100,
    other: Math.round(other * 100) / 100,
    totalCosts: Math.round(totalCosts * 100) / 100,
    netAmount: Math.round(netAmount * 100) / 100,
    effectiveCostPct: Math.round(effectiveCostPct * 100) / 100,
  };
}

/**
 * Calcula el costo total de IDA Y VUELTA (compra + venta futura).
 * Esto es lo que realmente importa para evaluar si un trade vale la pena.
 */
export function calculateRoundTripCosts(grossAmountArs: number, brokerKey = "default"): {
  buyCosts: BrokerCostBreakdown;
  sellCosts: BrokerCostBreakdown;
  totalEffectiveCostPct: number;
  requiredReturnToBreakEvenPct: number;
} {
  const buyCosts = calculateBrokerCosts(grossAmountArs, brokerKey);
  // Asumimos que vendemos al mismo monto bruto (break-even price)
  const sellCosts = calculateBrokerCosts(grossAmountArs, brokerKey);
  const totalCosts = buyCosts.totalCosts + sellCosts.totalCosts;
  const totalEffectiveCostPct = grossAmountArs > 0 ? (totalCosts / grossAmountArs) * 100 : 0;

  // Cuánto tiene que subir el activo solo para cubrir costos
  // Si compro $100, pago $X en costos, necesito que al vender valga $100 + $X + costos de venta
  const requiredReturnToBreakEvenPct =
    grossAmountArs > 0 ? (totalCosts / (grossAmountArs - buyCosts.totalCosts)) * 100 : 0;

  return {
    buyCosts,
    sellCosts,
    totalEffectiveCostPct: Math.round(totalEffectiveCostPct * 100) / 100,
    requiredReturnToBreakEvenPct: Math.round(requiredReturnToBreakEvenPct * 100) / 100,
  };
}

/**
 * Determina si un trade es viable considerando costos reales.
 * Un trade de $10.000 ARS puede tener 3-4% de costos totales ida y vuelta.
 */
export function isTradeViable(
  grossAmountArs: number,
  expectedReturnPct: number,
  brokerKey = "default"
): { viable: boolean; reason: string | null; roundTrip: ReturnType<typeof calculateRoundTripCosts> } {
  const roundTrip = calculateRoundTripCosts(grossAmountArs, brokerKey);

  if (grossAmountArs < 5000) {
    return {
      viable: false,
      reason: `Monto muy bajo ($${grossAmountArs.toLocaleString("es-AR")}): costos fijos del broker comen demasiado (${roundTrip.totalEffectiveCostPct}% ida y vuelta). Mínimo recomendado: $10.000 ARS por operación.`,
      roundTrip,
    };
  }

  if (roundTrip.requiredReturnToBreakEvenPct > expectedReturnPct * 0.5) {
    return {
      viable: false,
      reason: `Costos de transacción (${roundTrip.totalEffectiveCostPct}% ida y vuelta) consumen más del 50% del retorno esperado (${expectedReturnPct}%).`,
      roundTrip,
    };
  }

  return { viable: true, reason: null, roundTrip };
}
