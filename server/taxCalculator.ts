// ============================================================
// TAX CALCULATOR — Argentine Tax Impact on CEDEAR Returns
// Computes net-of-tax returns for realistic capital deployment
// ============================================================

export interface TaxBreakdown {
  grossReturnArs: number;
  gananciasTax: number;       // Impuesto a las ganancias sobre renta financiera
  selladoTax: number;         // Impuesto de sellado (ya en broker costs)
  dividendWithholding: number; // Retención dividendos CEDEAR (~15-35%)
  bienesPersonalesEstimate: number; // Estimativo anual si aplica
  netReturnArs: number;
  netReturnPct: number;
  effectiveTaxPct: number;
}

const GANANCIAS_THRESHOLD_ARS = 111_571; // Ajustable: mínimo no imponible renta financiera
const GANANCIAS_RATE = 0.15;             // 15% sobre excedente
const DIVIDEND_CEDEARS_NET_PCT = 0.85;   // Aprox neto que llega al tenedor (varía)
const DIVIDEND_WITHHOLDING_PCT = 0.15;   // Retención aprox (~15-35% dependiendo convenio)

/**
 * Calcula retorno neto de impuestos para una inversión en CEDEARs.
 * Nota: Este es un modelo educativo. Consultar contador para situación real.
 */
export function calculateNetReturn(
  initialCapitalArs: number,
  grossFinalValueArs: number,
  holdingMonths: number,
  annualBienesPersonalesEstimateArs = 0,
  receivedDividendsArs = 0
): TaxBreakdown {
  const grossReturnArs = grossFinalValueArs - initialCapitalArs;
  const grossReturnPct = initialCapitalArs > 0 ? (grossReturnArs / initialCapitalArs) * 100 : 0;

  // 1. Impuesto a las ganancias (solo si supera mínimo no imponible anual)
  let gananciasTax = 0;
  if (grossReturnArs > GANANCIAS_THRESHOLD_ARS) {
    gananciasTax = (grossReturnArs - GANANCIAS_THRESHOLD_ARS) * GANANCIAS_RATE;
  }

  // 2. Retención sobre dividendos (si aplica)
  let dividendWithholding = 0;
  if (receivedDividendsArs > 0) {
    dividendWithholding = receivedDividendsArs * DIVIDEND_WITHHOLDING_PCT;
  }

  // 3. Bienes personales (estimativo prorrateado al período)
  const bienesPersonalesEstimate =
    annualBienesPersonalesEstimateArs > 0
      ? (annualBienesPersonalesEstimateArs * (holdingMonths / 12))
      : 0;

  // 4. Sellado ya está en broker costs, no lo duplicamos aquí
  const selladoTax = 0;

  const totalTaxes = gananciasTax + dividendWithholding + bienesPersonalesEstimate;
  const netReturnArs = grossReturnArs - totalTaxes;
  const netReturnPct = initialCapitalArs > 0 ? (netReturnArs / initialCapitalArs) * 100 : 0;
  const effectiveTaxPct = grossReturnArs > 0 ? (totalTaxes / grossReturnArs) * 100 : 0;

  return {
    grossReturnArs: Math.round(grossReturnArs * 100) / 100,
    gananciasTax: Math.round(gananciasTax * 100) / 100,
    selladoTax,
    dividendWithholding: Math.round(dividendWithholding * 100) / 100,
    bienesPersonalesEstimate: Math.round(bienesPersonalesEstimate * 100) / 100,
    netReturnArs: Math.round(netReturnArs * 100) / 100,
    netReturnPct: Math.round(netReturnPct * 100) / 100,
    effectiveTaxPct: Math.round(effectiveTaxPct * 100) / 100,
  };
}

/**
 * Ajusta el retorno de backtest por impuestos.
 */
export function adjustBacktestReturnForTaxes(
  backtestReturnPct: number,
  months: number,
  initialCapitalArs: number
): { netReturnPct: number; taxImpactExplanation: string } {
  const grossFinal = initialCapitalArs * (1 + backtestReturnPct / 100);
  const taxBreakdown = calculateNetReturn(initialCapitalArs, grossFinal, months);

  let explanation = `Retorno bruto: ${backtestReturnPct.toFixed(2)}%. `;
  if (taxBreakdown.gananciasTax > 0) {
    explanation += `Impuesto a las ganancias: $${taxBreakdown.gananciasTax.toLocaleString("es-AR")}. `;
  }
  if (taxBreakdown.dividendWithholding > 0) {
    explanation += `Retención dividendos: $${taxBreakdown.dividendWithholding.toLocaleString("es-AR")}. `;
  }
  explanation += `Retorno neto estimado: ${taxBreakdown.netReturnPct.toFixed(2)}%. `;
  explanation += `Carga impositiva efectiva: ${taxBreakdown.effectiveTaxPct.toFixed(1)}%.`;

  return {
    netReturnPct: taxBreakdown.netReturnPct,
    taxImpactExplanation: explanation,
  };
}
