import { getCapitalHistory, getTrackRecord } from "./database.js";
import { calculatePortfolioRiskMetrics } from "./riskMetrics.js";
import { fetchHistory, fetchCCL } from "./marketData.js";
import { calculateSpyBenchmark, getRealPicksAlpha } from "./performance.js";
import { toFiniteNumber } from "./utils.js";
import { checkMacroCircuitBreakers } from "./macroCircuitBreakers.js";
import { runAllStressTests } from "./stressTest.js";
import { calculateRoundTripCosts } from "./brokerCosts.js";
import { requireTotpForRealCapital } from "./auth.js";
import db from "./database.js";

interface ReadinessRule {
  name: string;
  passed: boolean;
  value: number | null;
  threshold: number | null;
  message: string;
}

interface SeriesPoint {
  date?: string;
  virtual_value_ars?: number;
  spy_value_ars?: number;
}

interface CapitalHistoryPoint {
  total_value_ars?: number;
  date?: string;
  ccl_rate?: number;
}

interface MarketRegime {
  regime: "bullish" | "bearish" | "sideways" | "unknown";
  spy1mPct: number | null;
  spy3mPct: number | null;
  trendStrength: number | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function calcSeriesReturnPct(values: number[]): number | null {
  if (!values || values.length < 2) return null;
  const start = values[0];
  const end = values[values.length - 1];
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0) return null;
  return Math.round((((end - start) / start) * 100) * 100) / 100;
}

function gradeFromScore(scorePct: number): string {
  if (scorePct >= 85) return "A";
  if (scorePct >= 70) return "B";
  if (scorePct >= 55) return "C";
  if (scorePct >= 40) return "D";
  return "F";
}

function summarizeRules(rules: ReadinessRule[]): string[] {
  return rules.filter((rule) => !rule.passed).map((rule) => rule.message);
}

async function detectMarketRegime(): Promise<MarketRegime> {
  const spyHistory = await fetchHistory("SPY.BA", 8).catch(() => fetchHistory("SPY", 8).catch(() => []));
  if (!spyHistory || spyHistory.length < 70) {
    return { regime: "unknown", spy1mPct: null, spy3mPct: null, trendStrength: null };
  }

  const closes = spyHistory.map((row) => toFiniteNumber(row.close, 0)).filter((value) => value > 0);
  const last = closes[closes.length - 1];
  const monthAgo = closes[Math.max(0, closes.length - 22)];
  const threeMonthsAgo = closes[Math.max(0, closes.length - 64)];
  const sma20 = closes.slice(-20).reduce((sum, value) => sum + value, 0) / 20;
  const sma60 = closes.slice(-60).reduce((sum, value) => sum + value, 0) / 60;

  const spy1mPct = monthAgo > 0 ? round2(((last - monthAgo) / monthAgo) * 100) : null;
  const spy3mPct = threeMonthsAgo > 0 ? round2(((last - threeMonthsAgo) / threeMonthsAgo) * 100) : null;
  const trendStrength = sma60 > 0 ? round2(((sma20 - sma60) / sma60) * 100) : null;

  if ((spy1mPct ?? 0) > 3 && (trendStrength ?? 0) > 2) {
    return { regime: "bullish", spy1mPct, spy3mPct, trendStrength };
  }
  if ((spy1mPct ?? 0) < -3 && (trendStrength ?? 0) < -2) {
    return { regime: "bearish", spy1mPct, spy3mPct, trendStrength };
  }
  return { regime: "sideways", spy1mPct, spy3mPct, trendStrength };
}

function computeCapitalPolicy({
  readyForRealCapital,
  scorePct,
  degradationCount,
  marketRegime,
}: {
  readyForRealCapital: boolean;
  scorePct: number;
  degradationCount: number;
  marketRegime: MarketRegime["regime"];
}) {
  if (!readyForRealCapital) {
    return {
      paperTradingOnly: true,
      maxCapitalPct: 0,
      stage: "paper_only",
      summary: "Solo paper trading. No hay permiso para capital real todavía.",
    };
  }

  let maxCapitalPct = scorePct >= 95 ? 100
    : scorePct >= 85 ? 50
    : scorePct >= 75 ? 25
    : scorePct >= 65 ? 10
    : 5;

  if (degradationCount >= 3) maxCapitalPct = Math.min(maxCapitalPct, 5);
  else if (degradationCount >= 2) maxCapitalPct = Math.min(maxCapitalPct, 10);
  else if (degradationCount >= 1) maxCapitalPct = Math.min(maxCapitalPct, 25);

  if (marketRegime === "bearish") {
    maxCapitalPct = Math.min(maxCapitalPct, 10);
  } else if (marketRegime === "sideways") {
    maxCapitalPct = Math.min(maxCapitalPct, 25);
  }

  const stage = maxCapitalPct >= 100 ? "full"
    : maxCapitalPct >= 50 ? "scaled"
    : maxCapitalPct >= 25 ? "cautious"
    : maxCapitalPct >= 10 ? "pilot"
    : "minimal";

  return {
    paperTradingOnly: false,
    maxCapitalPct,
    stage,
    summary: `Capital real permitido con despliegue ${stage} y tope de ${maxCapitalPct}% del capital libre.`,
  };
}

function scaleActionableItems(analysis: any, allowedBuyBudgetArs: number | null) {
  if (!analysis || allowedBuyBudgetArs == null || allowedBuyBudgetArs <= 0) return [];
  const notes: string[] = [];
  const plan: any[] = Array.isArray(analysis.plan_ejecucion) ? analysis.plan_ejecucion : [];
  const buySteps = plan.filter((step: any) => step?.tipo === "COMPRAR");
  const currentTotal = buySteps.reduce((sum: number, step: any) => sum + toFiniteNumber(step?.monto_estimado_ars, 0), 0);
  if (currentTotal <= 0 || currentTotal <= allowedBuyBudgetArs) return notes;

  const scale = allowedBuyBudgetArs / currentTotal;
  notes.push(`Gobernanza: compras escaladas al ${(scale * 100).toFixed(1)}% para respetar el tope de capital real.`);

  for (const step of buySteps) {
    const originalAmount = toFiniteNumber(step.monto_estimado_ars, 0);
    const price = Math.max(1, toFiniteNumber(step.precio_aprox_ars ?? step.price ?? 0, 0));
    const scaledAmount = Math.max(0, Math.floor(originalAmount * scale));
    const scaledQty = Math.max(0, Math.floor(scaledAmount / price));
    step.cantidad_cedears = scaledQty;
    step.monto_estimado_ars = scaledQty * price;
    step._governance_scaled = true;
  }

  const picks = analysis?.decision_mensual?.picks_activos;
  if (Array.isArray(picks)) {
    for (const pick of picks) {
      const originalAmount = toFiniteNumber(pick.monto_total_ars, 0);
      const price = Math.max(1, toFiniteNumber(pick.precio_aprox_ars, 0));
      const scaledAmount = Math.max(0, Math.floor(originalAmount * scale));
      const scaledQty = Math.max(0, Math.floor(scaledAmount / price));
      pick.cantidad_cedears = scaledQty;
      pick.monto_total_ars = scaledQty * price;
      pick._governance_scaled = true;
    }
    analysis.decision_mensual.picks_activos = picks.filter((pick: any) => toFiniteNumber(pick.cantidad_cedears, 0) > 0);
  }

  analysis.plan_ejecucion = plan.filter((step: any) => step?.tipo !== "COMPRAR" || toFiniteNumber(step?.cantidad_cedears, 0) > 0);
  return notes;
}

export function applyDeploymentGovernance({
  analysis,
  investmentReadiness,
  availableCapitalArs,
}: {
  analysis: any;
  investmentReadiness: any;
  availableCapitalArs: number;
}) {
  if (!analysis || !investmentReadiness) return analysis;

  const governanceWarnings: string[] = [];
  const policy = investmentReadiness.capitalPolicy || { paperTradingOnly: true, maxCapitalPct: 0, stage: "paper_only" };

  if (policy.paperTradingOnly) {
    analysis._paper_plan_ejecucion = Array.isArray(analysis.plan_ejecucion) ? analysis.plan_ejecucion : [];
    analysis.plan_ejecucion = [];
    analysis._paper_only_reason = investmentReadiness.blockers || [];
    governanceWarnings.push("Modo paper_only: se bloqueó el plan ejecutable con capital real.");
  } else {
    const allowedBuyBudgetArs = Math.floor(toFiniteNumber(availableCapitalArs, 0) * (toFiniteNumber(policy.maxCapitalPct, 0) / 100));
    governanceWarnings.push(...scaleActionableItems(analysis, allowedBuyBudgetArs));
    analysis._capital_limits = {
      requestedCapitalArs: Math.floor(toFiniteNumber(availableCapitalArs, 0)),
      allowedCapitalPct: policy.maxCapitalPct,
      allowedCapitalArs: allowedBuyBudgetArs,
      stage: policy.stage,
    };
  }

  analysis._governance = {
    mode: investmentReadiness.mode,
    readyForRealCapital: investmentReadiness.readyForRealCapital,
    scorePct: investmentReadiness.scorePct,
    grade: investmentReadiness.grade,
    blockers: investmentReadiness.blockers,
    degradationSignals: investmentReadiness.degradationSignals,
    marketRegime: investmentReadiness.marketRegime,
    capitalPolicy: investmentReadiness.capitalPolicy,
  };

  if (governanceWarnings.length) {
    analysis._warnings = [...new Set([...(analysis._warnings || []), ...governanceWarnings])];
  }

  return analysis;
}

export async function getInvestmentReadiness(userId?: number) {
  const alphaStats = await getRealPicksAlpha().catch(() => null);
  const trackRecord = await getTrackRecord(365).catch(() => []);
  const typedCapitalHistory = await getCapitalHistory(120).catch(() => []) as CapitalHistoryPoint[];
  const spyHistory = await fetchHistory("SPY.BA", 14).catch(() => fetchHistory("SPY", 14).catch(() => null));
  const marketRegime = await detectMarketRegime();
  const riskMetrics = await calculatePortfolioRiskMetrics(typedCapitalHistory, spyHistory);
  const macroCB = await checkMacroCircuitBreakers().catch(() => ({ severity: "none" as const, shouldHaltNewCapital: false, reason: null, cclSpikePct: null, estimatedGapPct: null, marketFrozen: false, cclVolatilityHigh: false, exchangeRateGapHigh: false }));

  const cclNow = await fetchCCL().catch(() => null);
  const currentPortfolioValue = typedCapitalHistory.length > 0 ? toFiniteNumber(typedCapitalHistory[0]?.total_value_ars, 0) : 0;

  // Stress tests
  const stressResults = await runAllStressTests(currentPortfolioValue, cclNow?.venta || 1000).catch(() => []);
  const allStressSurvived = stressResults.length > 0 && stressResults.every((r) => r.survived);
  const worstStressDrawdown = stressResults.length > 0
    ? Math.min(...stressResults.map((r) => r.maxDrawdownPct))
    : null;

  // Transaction costs viability
  const sampleTradeAmount = 100_000; // $100k ARS sample
  const roundTrip = calculateRoundTripCosts(sampleTradeAmount);
  const costsViable = roundTrip.totalEffectiveCostPct <= 3.0;

  // 2FA check
  let has2FA = false;
  if (userId != null) {
    try {
      const userRow = (await db.execute({ sql: "SELECT totp_secret FROM users WHERE id = ?", args: [userId] })).rows[0] as unknown as { totp_secret?: string } | undefined;
      has2FA = !!userRow?.totp_secret;
    } catch { /* ignore */ }
  }
  const requires2FA = await requireTotpForRealCapital();

  const virtualValues = (trackRecord as SeriesPoint[])
    .map((row) => toFiniteNumber(row.virtual_value_ars, 0))
    .filter((value) => value > 0);
  const spyValues = (trackRecord as SeriesPoint[])
    .map((row) => toFiniteNumber(row.spy_value_ars, 0))
    .filter((value) => value > 0);

  const trackVirtualReturnPct = calcSeriesReturnPct(virtualValues);
  const trackSpyReturnPct = calcSeriesReturnPct(spyValues);
  const trackAlphaPct = (
    trackVirtualReturnPct != null &&
    trackSpyReturnPct != null
  ) ? Math.round((trackVirtualReturnPct - trackSpyReturnPct) * 100) / 100 : null;

  const benchmark = typedCapitalHistory.length >= 2
    ? await calculateSpyBenchmark(typedCapitalHistory[0]?.ccl_rate || null).catch(() => null)
    : null;

  const rules: ReadinessRule[] = [
    {
      name: "evaluated_predictions",
      passed: (alphaStats?.count || 0) >= 25,
      value: alphaStats?.count || 0,
      threshold: 25,
      message: `Muy pocas predicciones evaluadas (${alphaStats?.count || 0}/25).`,
    },
    {
      name: "win_rate_vs_spy",
      passed: (alphaStats?.winRateVsSpy || 0) >= 55,
      value: alphaStats?.winRateVsSpy ?? null,
      threshold: 55,
      message: `La tasa de acierto vs SPY es baja (${alphaStats?.winRateVsSpy ?? 0}% < 55%).`,
    },
    {
      name: "average_alpha",
      passed: (alphaStats?.avgAlpha || 0) > 0,
      value: alphaStats?.avgAlpha ?? null,
      threshold: 0,
      message: `El alpha promedio aún no es positivo (${alphaStats?.avgAlpha ?? 0}%).`,
    },
    {
      name: "track_record_days",
      passed: trackRecord.length >= 60,
      value: trackRecord.length,
      threshold: 60,
      message: `El track record es corto (${trackRecord.length}/60 días).`,
    },
    {
      name: "track_record_alpha",
      passed: (trackAlphaPct || 0) > 0,
      value: trackAlphaPct,
      threshold: 0,
      message: `El portfolio virtual no supera al benchmark en track record (${trackAlphaPct ?? 0}%).`,
    },
    {
      name: "max_drawdown",
      passed: riskMetrics.maxDrawdownPct == null || riskMetrics.maxDrawdownPct <= 20,
      value: riskMetrics.maxDrawdownPct,
      threshold: 20,
      message: `El drawdown máximo es demasiado alto (${riskMetrics.maxDrawdownPct ?? "N/A"}% > 20%).`,
    },
    {
      name: "sharpe_ratio",
      passed: riskMetrics.sharpeRatio == null || riskMetrics.sharpeRatio >= 0.75,
      value: riskMetrics.sharpeRatio,
      threshold: 0.75,
      message: `El Sharpe ratio todavía no es convincente (${riskMetrics.sharpeRatio ?? "N/A"} < 0.75).`,
    },
    {
      name: "real_vs_spy_dca",
      passed: benchmark == null || benchmark.beatsSpy === true,
      value: benchmark?.alphaArs ?? null,
      threshold: 0,
      message: `La cartera real no supera todavía al benchmark DCA contra SPY (alpha ARS ${benchmark?.alphaArs ?? 0}).`,
    },
    {
      name: "macro_circuit_breakers",
      passed: macroCB.severity !== "critical",
      value: macroCB.severity === "critical" ? 1 : 0,
      threshold: 0,
      message: macroCB.reason || `Circuit breaker macro activo: ${macroCB.severity}.`,
    },
    {
      name: "stress_tests",
      passed: allStressSurvived,
      value: worstStressDrawdown,
      threshold: -40,
      message: stressResults.length === 0
        ? "No se pudieron ejecutar stress tests."
        : `Stress test fallido: peor drawdown simulado ${worstStressDrawdown}%.`,
    },
    {
      name: "transaction_costs_viable",
      passed: costsViable,
      value: roundTrip.totalEffectiveCostPct,
      threshold: 3.0,
      message: `Costos de transacción ida y vuelta muy altos (${roundTrip.totalEffectiveCostPct}% para $100k ARS). Operar con montos mayores o reducir frecuencia.`,
    },
    {
      name: "two_factor_authentication",
      passed: !requires2FA || has2FA,
      value: has2FA ? 1 : 0,
      threshold: 1,
      message: requires2FA && !has2FA
        ? "2FA requerido para capital real. Habilitá autenticación de dos factores en tu perfil."
        : "2FA no habilitado.",
    },
  ];

  const passedRules = rules.filter((rule) => rule.passed).length;
  const scorePct = Math.round((passedRules / rules.length) * 10000) / 100;
  const readyForRealCapital = rules.every((rule) => rule.passed);
  const mode = readyForRealCapital ? "real_capital_ok" : "paper_only";
  const degradationSignals = [
    riskMetrics.maxDrawdownPct != null && riskMetrics.maxDrawdownPct > 15 ? `drawdown_alto:${riskMetrics.maxDrawdownPct}%` : null,
    riskMetrics.sharpeRatio != null && riskMetrics.sharpeRatio < 0.75 ? `sharpe_bajo:${riskMetrics.sharpeRatio}` : null,
    alphaStats?.avgAlpha != null && alphaStats.avgAlpha <= 0 ? `alpha_no_positivo:${alphaStats.avgAlpha}%` : null,
    trackAlphaPct != null && trackAlphaPct <= 0 ? `track_record_no_supera_benchmark:${trackAlphaPct}%` : null,
    benchmark?.beatsSpy === false ? `cartera_real_bajo_spy:${benchmark.alphaArs}` : null,
    macroCB.severity === "critical" ? `macro_crisis:${macroCB.reason}` : null,
    !allStressSurvived ? `stress_test_failed:${worstStressDrawdown}%` : null,
    !costsViable ? `costos_alto:${roundTrip.totalEffectiveCostPct}%` : null,
  ].filter(Boolean);

  // Si hay circuit breaker macro crítico, forzar paper_only sin importar score
  const effectiveReadyForReal = readyForRealCapital && macroCB.severity !== "critical";
  const effectiveMode = effectiveReadyForReal ? "real_capital_ok" : "paper_only";

  const capitalPolicy = computeCapitalPolicy({
    readyForRealCapital: effectiveReadyForReal,
    scorePct,
    degradationCount: degradationSignals.length,
    marketRegime: marketRegime.regime,
  });

  return {
    mode: effectiveMode,
    readyForRealCapital: effectiveReadyForReal,
    scorePct,
    grade: gradeFromScore(scorePct),
    summary: effectiveReadyForReal
      ? "El sistema ya muestra evidencia suficiente para considerar capital real incremental."
      : "El sistema todavía debe operar en paper trading o con capital mínimo hasta validar edge y estabilidad.",
    blockers: summarizeRules(rules),
    rules,
    degradationSignals,
    marketRegime,
    capitalPolicy,
    macroCircuitBreakers: {
      severity: macroCB.severity,
      reason: macroCB.reason,
      cclSpikePct: macroCB.cclSpikePct,
      estimatedGapPct: macroCB.estimatedGapPct,
    },
    stressTests: {
      allSurvived: allStressSurvived,
      worstDrawdown: worstStressDrawdown,
      results: stressResults,
    },
    transactionCosts: {
      sampleAmount: sampleTradeAmount,
      roundTripCostPct: roundTrip.totalEffectiveCostPct,
      requiredReturnToBreakEven: roundTrip.requiredReturnToBreakEvenPct,
      viable: costsViable,
    },
    evidence: {
      alphaStats,
      trackRecord: {
        points: trackRecord.length,
        virtualReturnPct: trackVirtualReturnPct,
        spyReturnPct: trackSpyReturnPct,
        alphaPct: trackAlphaPct,
      },
      benchmark,
      riskMetrics,
    },
    generatedAt: new Date().toISOString(),
  };
}
