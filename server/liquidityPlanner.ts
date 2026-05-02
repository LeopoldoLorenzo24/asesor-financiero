import { calculateBrokerCosts } from "./brokerCosts.js";
import { getCedearLotSize } from "./cedears.js";
import { roundMoney, toFiniteNumber } from "./utils.js";

type PortfolioRow = {
  ticker: string;
  total_shares: number;
  weighted_avg_price: number;
};

type CedearDef = {
  ticker?: string;
  sector?: string;
};

type LatestAnalysis = {
  decision_mensual?: {
    core_etf?: string;
  };
  acciones_cartera_actual?: Array<{
    ticker?: string;
    accion?: string;
    razon?: string;
    urgencia?: string;
  }>;
};

function normalizeAction(action: unknown): string {
  return String(action || "").trim().toUpperCase();
}

function buildActionMap(latestAnalysis: LatestAnalysis | null | undefined) {
  const map = new Map<string, { action: string; reason: string | null; urgency: string | null }>();
  const rows = Array.isArray(latestAnalysis?.acciones_cartera_actual)
    ? latestAnalysis.acciones_cartera_actual
    : [];

  for (const row of rows) {
    const ticker = String(row?.ticker || "").toUpperCase();
    const action = normalizeAction(row?.accion);
    if (!ticker || !action) continue;
    map.set(ticker, {
      action,
      reason: row?.razon ? String(row.razon) : null,
      urgency: row?.urgencia ? String(row.urgencia) : null,
    });
  }

  return map;
}

function isPrimaryCore(ticker: string, coreEtf: string | null, sector: string | null) {
  const upperTicker = String(ticker || "").toUpperCase();
  const upperCore = String(coreEtf || "").toUpperCase();
  if (upperTicker && upperCore && upperTicker === upperCore) return true;
  if (upperTicker === "SPY" || upperTicker === "QQQ") return true;
  return false;
}

function findMinimalSharesForTargetNet({
  maxShares,
  priceArs,
  targetNetArs,
  lotSize,
  brokerKey,
}: {
  maxShares: number;
  priceArs: number;
  targetNetArs: number;
  lotSize: number;
  brokerKey: string;
}) {
  const lotsAvailable = Math.floor(maxShares / lotSize);
  if (lotsAvailable <= 0) return 0;

  let low = 1;
  let high = lotsAvailable;
  let bestLots = lotsAvailable;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const shares = mid * lotSize;
    const net = calculateBrokerCosts(shares * priceArs, brokerKey).netAmount;
    if (net >= targetNetArs) {
      bestLots = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return bestLots * lotSize;
}

export function buildLiquidityPlan({
  targetNetArs,
  availableCashArs = 0,
  portfolioSummary,
  pricesByTicker,
  cedearDefs,
  latestAnalysis = null,
  brokerKey = "default",
}: {
  targetNetArs: number;
  availableCashArs?: number;
  portfolioSummary: PortfolioRow[];
  pricesByTicker: Record<string, number>;
  cedearDefs: Record<string, CedearDef>;
  latestAnalysis?: LatestAnalysis | null;
  brokerKey?: string;
}) {
  const target = roundMoney(targetNetArs);
  const availableCash = roundMoney(availableCashArs);
  const targetFromSales = Math.max(0, target - availableCash);

  if (target <= 0) {
    return {
      feasible: false,
      targetNetArs: target,
      availableCashArs: availableCash,
      targetNetFromSalesArs: targetFromSales,
      summary: {
        netPlannedArs: 0,
        grossPlannedArs: 0,
        estimatedCostsArs: 0,
        positionsUsed: 0,
        remainingGapArs: target,
      },
      recommendations: [],
      notes: ["Ingresá un objetivo de caja mayor a 0."],
    };
  }

  if (availableCash >= target) {
    return {
      feasible: true,
      targetNetArs: target,
      availableCashArs: availableCash,
      targetNetFromSalesArs: 0,
      summary: {
        netPlannedArs: 0,
        grossPlannedArs: 0,
        estimatedCostsArs: 0,
        positionsUsed: 0,
        remainingGapArs: 0,
      },
      recommendations: [],
      notes: ["Ya tenés caja suficiente. No hace falta vender posiciones para llegar al objetivo."],
    };
  }

  const actionMap = buildActionMap(latestAnalysis);
  const coreEtf = latestAnalysis?.decision_mensual?.core_etf
    ? String(latestAnalysis.decision_mensual.core_etf).toUpperCase()
    : "SPY";

  const totalPortfolioValue = portfolioSummary.reduce((sum, row) => {
    const ticker = String(row.ticker || "").toUpperCase();
    const price = toFiniteNumber(pricesByTicker[ticker], toFiniteNumber(row.weighted_avg_price, 0));
    return sum + price * toFiniteNumber(row.total_shares, 0);
  }, 0);

  const candidates = portfolioSummary
    .map((row) => {
      const ticker = String(row.ticker || "").toUpperCase();
      const shares = toFiniteNumber(row.total_shares, 0);
      const avgPrice = toFiniteNumber(row.weighted_avg_price, 0);
      const currentPrice = toFiniteNumber(pricesByTicker[ticker], avgPrice);
      const sector = String(cedearDefs[ticker]?.sector || "");
      const currentValue = shares * currentPrice;
      const pnlPct = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
      const weightPct = totalPortfolioValue > 0 ? (currentValue / totalPortfolioValue) * 100 : 0;
      const latestAction = actionMap.get(ticker) || null;
      const primaryCore = isPrimaryCore(ticker, coreEtf, sector || null);
      const isEtf = sector.startsWith("ETF");

      let priority = 0;
      const reasons: string[] = [];

      if (latestAction?.action === "VENDER TODO") {
        priority += 120;
        reasons.push("El último análisis ya sugería salir completo.");
      } else if (latestAction?.action === "VENDER" || latestAction?.action === "REDUCIR") {
        priority += 90;
        reasons.push("El último análisis ya sugería reducir o vender.");
      }

      if (!primaryCore && !isEtf) {
        priority += 30;
        reasons.push("Es una posición satellite, no el núcleo defensivo.");
      } else if (!primaryCore && isEtf) {
        priority += 10;
        reasons.push("Es ETF, pero no el core principal.");
      } else {
        reasons.push("Se preserva al final por ser parte del core.");
      }

      if (weightPct >= 20) {
        priority += 22;
        reasons.push(`Concentra ${weightPct.toFixed(1)}% del portfolio.`);
      } else if (weightPct >= 10) {
        priority += 12;
        reasons.push(`Tiene peso relevante (${weightPct.toFixed(1)}%).`);
      }

      if (pnlPct < 0) {
        priority += Math.min(18, Math.abs(pnlPct) / 2);
        reasons.push(`Va perdiendo ${Math.abs(pnlPct).toFixed(1)}%.`);
      } else if (pnlPct > 20) {
        priority += 6;
        reasons.push(`Tiene ganancia disponible para monetizar (${pnlPct.toFixed(1)}%).`);
      }

      if (currentPrice <= 0 || shares <= 0 || currentValue <= 0) return null;

      return {
        ticker,
        shares,
        avgPriceArs: roundMoney(avgPrice),
        currentPriceArs: roundMoney(currentPrice),
        currentValueArs: roundMoney(currentValue),
        pnlPct: Math.round(pnlPct * 100) / 100,
        weightPct: Math.round(weightPct * 100) / 100,
        sector,
        latestAction: latestAction?.action || null,
        latestActionReason: latestAction?.reason || null,
        priorityScore: Math.round(priority * 100) / 100,
        reasons,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      return b.currentValueArs - a.currentValueArs;
    });

  let remainingNet = targetFromSales;
  let netPlannedArs = 0;
  let grossPlannedArs = 0;
  let estimatedCostsArs = 0;

  const recommendations = [];
  for (const candidate of candidates) {
    if (remainingNet <= 0) break;

    const lotSize = getCedearLotSize(candidate.ticker) ?? 1;
    const fullSaleCosts = calculateBrokerCosts(candidate.shares * candidate.currentPriceArs, brokerKey);
    if (fullSaleCosts.netAmount <= 0) continue;

    let sharesToSell = candidate.shares;
    if (fullSaleCosts.netAmount > remainingNet) {
      sharesToSell = findMinimalSharesForTargetNet({
        maxShares: candidate.shares,
        priceArs: candidate.currentPriceArs,
        targetNetArs: remainingNet,
        lotSize,
        brokerKey,
      });
    }

    if (sharesToSell <= 0) continue;

    const grossAmountArs = roundMoney(sharesToSell * candidate.currentPriceArs);
    const sellCosts = calculateBrokerCosts(grossAmountArs, brokerKey);
    const netAmountArs = roundMoney(sellCosts.netAmount);

    recommendations.push({
      ticker: candidate.ticker,
      sharesToSell,
      sharesAvailable: candidate.shares,
      currentPriceArs: candidate.currentPriceArs,
      avgPriceArs: candidate.avgPriceArs,
      grossAmountArs,
      estimatedCostsArs: roundMoney(sellCosts.totalCosts),
      estimatedNetAmountArs: netAmountArs,
      pnlPct: candidate.pnlPct,
      weightPct: candidate.weightPct,
      sector: candidate.sector,
      latestAction: candidate.latestAction,
      latestActionReason: candidate.latestActionReason,
      priorityScore: candidate.priorityScore,
      reasons: candidate.reasons,
    });

    netPlannedArs += netAmountArs;
    grossPlannedArs += grossAmountArs;
    estimatedCostsArs += roundMoney(sellCosts.totalCosts);
    remainingNet = Math.max(0, targetFromSales - netPlannedArs);
  }

  return {
    feasible: remainingNet <= 0,
    targetNetArs: target,
    availableCashArs: availableCash,
    targetNetFromSalesArs: targetFromSales,
    summary: {
      netPlannedArs: roundMoney(netPlannedArs),
      grossPlannedArs: roundMoney(grossPlannedArs),
      estimatedCostsArs: roundMoney(estimatedCostsArs),
      positionsUsed: recommendations.length,
      remainingGapArs: roundMoney(remainingNet),
    },
    recommendations,
    notes: [
      "Prioriza ventas que ya venían flojas o ya estaban marcadas para reducir/salir.",
      "Preserva el core ETF para el final salvo que no alcance con posiciones satellite.",
      "Los montos son estimados y descuentan costos de venta.",
    ],
  };
}
