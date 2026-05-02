import {
  getAdherenceStats, getAllCedearRatios, getBrokerPreference, getCapitalHistory,
  getGovernancePolicySelection, getIntradayMonitorSettings, getLatestPreflightCheckRun, getTrackRecord,
} from "./database.js";
import { calculatePortfolioRiskMetrics } from "./riskMetrics.js";
import { fetchHistory, fetchCCL, getDataProviderStatus } from "./marketData.js";
import { calculateSpyBenchmark, getRealPicksAlpha } from "./performance.js";
import { toFiniteNumber } from "./utils.js";
import { checkMacroCircuitBreakers } from "./macroCircuitBreakers.js";
import { runAllStressTests } from "./stressTest.js";
import { calculateRoundTripCosts } from "./brokerCosts.js";
import { requireTotpForRealCapital } from "./auth.js";
import {
  applyGovernanceSelectionToCapitalPolicy,
  buildEffectiveGovernancePolicy,
  describeGovernanceSelection,
  getGovernanceCooldownStatus,
  getGovernancePolicyCatalog,
  normalizeGovernanceSelection,
} from "./governancePolicies.js";
import db from "./database.js";
import { getRatioCoverage } from "./cedears.js";
import { buildRatioSyncHealth, buildTradeSafetyStatus } from "./tradeSafety.js";
import { assessPreflightReadiness } from "./preflightPolicy.js";

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

interface EvidenceQualitySnapshot {
  analysisSessions: number;
  auditedAnalyses: number;
  auditCoveragePct: number;
  adherenceTracked: number;
  adherenceResolved: number;
  adherencePending: number;
  adherencePaperOnly: number;
  adherenceResolutionPct: number;
  strictExecutionPct: number;
  effectiveExecutionPct: number;
  avgDiscrepancyPct: number;
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

async function getEvidenceQualitySnapshot(days = 365): Promise<EvidenceQualitySnapshot> {
  const [analysisRows, auditRows, adherence] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(*) as total
            FROM analysis_sessions
            WHERE created_at >= datetime('now', '-' || ? || ' days')`,
      args: [days],
    }).catch(() => ({ rows: [{ total: 0 }] })),
    db.execute({
      sql: `SELECT COUNT(*) as total
            FROM decision_audit_logs
            WHERE route = '/api/ai/analyze'
              AND created_at >= datetime('now', '-' || ? || ' days')`,
      args: [days],
    }).catch(() => ({ rows: [{ total: 0 }] })),
    getAdherenceStats(days).catch(() => ({
      total: 0,
      resolved: 0,
      pending: 0,
      paperOnly: 0,
      resolutionPct: 0,
      executionPct: 0,
      effectiveExecutionPct: 0,
      avgDiscrepancyPct: 0,
    })),
  ]);

  const analysisSessions = Number((analysisRows.rows[0] as any)?.total || 0);
  const auditedAnalyses = Number((auditRows.rows[0] as any)?.total || 0);
  const auditCoveragePct = analysisSessions > 0
    ? Math.min(100, Math.round((auditedAnalyses / analysisSessions) * 10000) / 100)
    : 0;

  return {
    analysisSessions,
    auditedAnalyses,
    auditCoveragePct,
    adherenceTracked: Number((adherence as any).total || 0),
    adherenceResolved: Number((adherence as any).resolved || 0),
    adherencePending: Number((adherence as any).pending || 0),
    adherencePaperOnly: Number((adherence as any).paperOnly || 0),
    adherenceResolutionPct: Number((adherence as any).resolutionPct || 0),
    strictExecutionPct: Number((adherence as any).executionPct || 0),
    effectiveExecutionPct: Number((adherence as any).effectiveExecutionPct || 0),
    avgDiscrepancyPct: Number((adherence as any).avgDiscrepancyPct || 0),
  };
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

export async function getInvestmentReadiness(
  userId?: number,
  options: {
    policySelectionOverride?: {
      overlayKey?: string;
      deploymentMode?: string;
    } | null;
    brokerKeyOverride?: string | null;
  } = {}
) {
  const alphaStats = await getRealPicksAlpha().catch(() => null);
  const trackRecord = await getTrackRecord(365).catch(() => []);
  const typedCapitalHistory = await getCapitalHistory(120).catch(() => []) as CapitalHistoryPoint[];
  const evidenceQuality = await getEvidenceQualitySnapshot(365);
  const storedPolicySelection = await getGovernancePolicySelection(userId ?? null).catch(() => ({
    ...normalizeGovernanceSelection(),
    reason: null,
    updatedAt: null,
  }));
  const normalizedPolicySelection = normalizeGovernanceSelection({
    overlayKey: options.policySelectionOverride?.overlayKey ?? storedPolicySelection.overlayKey,
    deploymentMode: options.policySelectionOverride?.deploymentMode ?? storedPolicySelection.deploymentMode,
  });
  const storedBrokerPreference = await getBrokerPreference(userId ?? null).catch(() => ({
    brokerKey: "default",
    updatedAt: null,
  }));
  const brokerKey = String(options.brokerKeyOverride || storedBrokerPreference.brokerKey || "default");
  const effectiveGovernancePolicy = buildEffectiveGovernancePolicy(normalizedPolicySelection);
  const governanceCooldown = getGovernanceCooldownStatus(storedPolicySelection.updatedAt);
  const governanceCatalog = getGovernancePolicyCatalog();
  const spyHistory = await fetchHistory("SPY.BA", 14).catch(() => fetchHistory("SPY", 14).catch(() => null));
  const marketRegime = await detectMarketRegime();
  const riskMetrics = await calculatePortfolioRiskMetrics(typedCapitalHistory, spyHistory);
  const macroCB = await checkMacroCircuitBreakers().catch(() => ({ severity: "none" as const, shouldHaltNewCapital: false, reason: null, cclSpikePct: null, estimatedGapPct: null, marketFrozen: false, cclVolatilityHigh: false, exchangeRateGapHigh: false }));

  const cclNow = await fetchCCL().catch(() => null);
  const marketProviders = getDataProviderStatus();
  const ratioCoverage = getRatioCoverage();
  const dynamicRatios = await getAllCedearRatios().catch(() => ({}));
  const ratioHealth = buildRatioSyncHealth({ ratios: dynamicRatios, coverage: ratioCoverage });
  const [intradaySettings, latestPreflightRun] = await Promise.all([
    getIntradayMonitorSettings().catch(() => ({
      timezone: "America/Argentina/Cordoba",
      marketOpenLocal: "10:30",
      marketCloseLocal: "17:00",
    })),
    getLatestPreflightCheckRun().catch(() => null),
  ]);
  const preflightAssessment = assessPreflightReadiness({
    latestRun: latestPreflightRun,
    settings: {
      timezone: intradaySettings.timezone,
      marketOpenLocal: intradaySettings.marketOpenLocal,
      marketCloseLocal: intradaySettings.marketCloseLocal,
    },
  });
  const tradeSafety = buildTradeSafetyStatus({
    ccl: cclNow,
    marketProviders,
    ratioHealth,
    preflightStatus: preflightAssessment,
  });
  const currentPortfolioValue = typedCapitalHistory.length > 0 ? toFiniteNumber(typedCapitalHistory[0]?.total_value_ars, 0) : 0;

  // Stress tests
  const stressResults = await runAllStressTests(currentPortfolioValue, cclNow?.venta || 1000).catch(() => []);
  const allStressSurvived = stressResults.length > 0 && stressResults.every((r) => r.survived);
  const worstStressDrawdown = stressResults.length > 0
    ? Math.min(...stressResults.map((r) => r.maxDrawdownPct))
    : null;

  // Transaction costs viability
  const sampleTradeAmount = 100_000; // $100k ARS sample
  const roundTrip = calculateRoundTripCosts(sampleTradeAmount, brokerKey);
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
  const thresholds = effectiveGovernancePolicy.thresholds;

  const rules: ReadinessRule[] = [
    {
      name: "evaluated_predictions",
      passed: (alphaStats?.count || 0) >= thresholds.evaluatedPredictions,
      value: alphaStats?.count || 0,
      threshold: thresholds.evaluatedPredictions,
      message: `Muy pocas predicciones evaluadas (${alphaStats?.count || 0}/${thresholds.evaluatedPredictions}). Necesitás al menos ${thresholds.evaluatedPredictions} picks evaluados para considerar edge estadístico.`,
    },
    {
      name: "win_rate_vs_spy",
      passed: (alphaStats?.winRateVsSpy || 0) >= thresholds.winRateVsSpyPct,
      value: alphaStats?.winRateVsSpy ?? null,
      threshold: thresholds.winRateVsSpyPct,
      message: `La tasa de acierto vs SPY es baja (${alphaStats?.winRateVsSpy ?? 0}% < ${thresholds.winRateVsSpyPct}%). Con costos de broker realistas necesitás >${thresholds.winRateVsSpyPct}%.`,
    },
    {
      name: "average_alpha",
      passed: (alphaStats?.avgAlpha || 0) > thresholds.averageAlphaPct,
      value: alphaStats?.avgAlpha ?? null,
      threshold: thresholds.averageAlphaPct,
      message: `El alpha promedio no cubre costos (${alphaStats?.avgAlpha ?? 0}% <= ${thresholds.averageAlphaPct}%). Con comisiones reales necesitás >${thresholds.averageAlphaPct}% de alpha promedio.`,
    },
    {
      name: "track_record_days",
      passed: trackRecord.length >= thresholds.trackRecordDays,
      value: trackRecord.length,
      threshold: thresholds.trackRecordDays,
      message: `El track record es corto (${trackRecord.length}/${thresholds.trackRecordDays} días). Necesitás al menos ${thresholds.trackRecordDays} días de operación consistente.`,
    },
    {
      name: "track_record_alpha",
      passed: (trackAlphaPct || 0) > thresholds.trackRecordAlphaPct,
      value: trackAlphaPct,
      threshold: thresholds.trackRecordAlphaPct,
      message: `El portfolio virtual no supera al benchmark por margen suficiente (${trackAlphaPct ?? 0}% <= ${thresholds.trackRecordAlphaPct}%).`,
    },
    {
      name: "max_drawdown",
      passed: riskMetrics.maxDrawdownPct == null || riskMetrics.maxDrawdownPct <= thresholds.maxDrawdownPct,
      value: riskMetrics.maxDrawdownPct,
      threshold: thresholds.maxDrawdownPct,
      message: `El drawdown máximo es demasiado alto (${riskMetrics.maxDrawdownPct ?? "N/A"}% > ${thresholds.maxDrawdownPct}%). Para este overlay no toleramos más de ${thresholds.maxDrawdownPct}%.`,
    },
    {
      name: "sharpe_ratio",
      passed: riskMetrics.sharpeRatio == null || riskMetrics.sharpeRatio >= thresholds.sharpeRatio,
      value: riskMetrics.sharpeRatio,
      threshold: thresholds.sharpeRatio,
      message: `El Sharpe ratio no es convincente (${riskMetrics.sharpeRatio ?? "N/A"} < ${thresholds.sharpeRatio}). Con costos reales necesitás ≥${thresholds.sharpeRatio}.`,
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
      name: "critical_data_integrity",
      passed: !tradeSafety.mustStandAside,
      value: tradeSafety.mustStandAside ? 1 : 0,
      threshold: 0,
      message: tradeSafety.mustStandAside
        ? tradeSafety.summary
        : "Integridad de datos operativa.",
    },
    {
      name: "daily_preflight_check",
      passed: !preflightAssessment.blocksNewTrading,
      value: preflightAssessment.hasRunToday ? 1 : 0,
      threshold: 1,
      message: preflightAssessment.summary,
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
    {
      name: "analysis_session_cadence",
      passed: evidenceQuality.analysisSessions >= 12,
      value: evidenceQuality.analysisSessions,
      threshold: 12,
      message: `Todavía hay pocas sesiones de análisis auditables (${evidenceQuality.analysisSessions}/12 en 12 meses). Necesitás al menos un ciclo mensual sostenido.`,
    },
    {
      name: "decision_audit_coverage",
      passed: evidenceQuality.auditCoveragePct >= thresholds.auditCoveragePct,
      value: evidenceQuality.auditCoveragePct,
      threshold: thresholds.auditCoveragePct,
      message: `La cobertura de auditoría de decisiones es insuficiente (${evidenceQuality.auditCoveragePct}% < ${thresholds.auditCoveragePct}%). Sin trazabilidad no hay evidencia confiable.`,
    },
    {
      name: "adherence_sample_size",
      passed: evidenceQuality.adherenceTracked >= thresholds.adherenceSampleSize,
      value: evidenceQuality.adherenceTracked,
      threshold: thresholds.adherenceSampleSize,
      message: `Hay muy poca evidencia de adherencia ejecutable (${evidenceQuality.adherenceTracked}/${thresholds.adherenceSampleSize}). Antes de escalar necesitás ver si las recomendaciones realmente se ejecutan.`,
    },
    {
      name: "adherence_resolution",
      passed: evidenceQuality.adherenceResolutionPct >= thresholds.adherenceResolutionPct,
      value: evidenceQuality.adherenceResolutionPct,
      threshold: thresholds.adherenceResolutionPct,
      message: `La resolución de recomendaciones ejecutables es baja (${evidenceQuality.adherenceResolutionPct}% < ${thresholds.adherenceResolutionPct}%). Hay demasiado plan sin cerrar.`,
    },
    {
      name: "adherence_discipline",
      passed: evidenceQuality.adherenceTracked < 5 || evidenceQuality.avgDiscrepancyPct <= thresholds.adherenceMaxDiscrepancyPct,
      value: evidenceQuality.avgDiscrepancyPct,
      threshold: thresholds.adherenceMaxDiscrepancyPct,
      message: `La ejecución real se desvía demasiado del plan (${evidenceQuality.avgDiscrepancyPct}% > ${thresholds.adherenceMaxDiscrepancyPct}%). Con esa fricción no podés validar edge de forma limpia.`,
    },
  ];

  const passedRules = rules.filter((rule) => rule.passed).length;
  const scorePct = Math.round((passedRules / rules.length) * 10000) / 100;
  const readyForRealCapital = rules.every((rule) => rule.passed);
  const mode = readyForRealCapital ? "real_capital_ok" : "paper_only";
  const degradationSignals = [
    riskMetrics.maxDrawdownPct != null && riskMetrics.maxDrawdownPct > thresholds.maxDrawdownPct ? `drawdown_alto:${riskMetrics.maxDrawdownPct}%` : null,
    riskMetrics.sharpeRatio != null && riskMetrics.sharpeRatio < thresholds.sharpeRatio ? `sharpe_bajo:${riskMetrics.sharpeRatio}` : null,
    alphaStats?.avgAlpha != null && alphaStats.avgAlpha <= 0 ? `alpha_no_positivo:${alphaStats.avgAlpha}%` : null,
    trackAlphaPct != null && trackAlphaPct <= 0 ? `track_record_no_supera_benchmark:${trackAlphaPct}%` : null,
    benchmark?.beatsSpy === false ? `cartera_real_bajo_spy:${benchmark.alphaArs}` : null,
    macroCB.severity === "critical" ? `macro_crisis:${macroCB.reason}` : null,
    tradeSafety.cclStale ? "ccl_stale" : null,
    tradeSafety.providersDegraded ? "market_providers_degraded" : null,
    tradeSafety.ratioHealth?.severity === "critical" ? `ratio_sync_critical:${tradeSafety.ratioHealth.summary}` : null,
    tradeSafety.ratioHealth?.severity === "warning" ? `ratio_sync_warning:${tradeSafety.ratioHealth.summary}` : null,
    preflightAssessment.status === "blocked" ? `preflight_blocked:${preflightAssessment.summary}` : null,
    preflightAssessment.status === "caution" ? `preflight_caution:${preflightAssessment.summary}` : null,
    !allStressSurvived ? `stress_test_failed:${worstStressDrawdown}%` : null,
    !costsViable ? `costos_alto:${roundTrip.totalEffectiveCostPct}%` : null,
    evidenceQuality.analysisSessions < 12 ? `pocas_sesiones_auditables:${evidenceQuality.analysisSessions}` : null,
    evidenceQuality.auditCoveragePct < thresholds.auditCoveragePct ? `audit_trail_incompleto:${evidenceQuality.auditCoveragePct}%` : null,
    evidenceQuality.adherenceTracked < thresholds.adherenceSampleSize ? `poca_evidencia_de_adherencia:${evidenceQuality.adherenceTracked}` : null,
    evidenceQuality.adherenceResolutionPct < thresholds.adherenceResolutionPct ? `adherencia_sin_cerrar:${evidenceQuality.adherenceResolutionPct}%` : null,
    evidenceQuality.avgDiscrepancyPct > thresholds.adherenceMaxDiscrepancyPct ? `ejecucion_desviada:${evidenceQuality.avgDiscrepancyPct}%` : null,
  ].filter(Boolean);

  // Si hay circuit breaker macro crítico, forzar paper_only sin importar score
  const systemReadyForRealCapital = readyForRealCapital && macroCB.severity !== "critical";

  const baseCapitalPolicy = computeCapitalPolicy({
    readyForRealCapital: systemReadyForRealCapital,
    scorePct,
    degradationCount: degradationSignals.length,
    marketRegime: marketRegime.regime,
  });
  const capitalPolicy = applyGovernanceSelectionToCapitalPolicy(baseCapitalPolicy, effectiveGovernancePolicy);
  const effectiveReadyForReal = systemReadyForRealCapital && !capitalPolicy.paperTradingOnly;
  const effectiveMode = effectiveReadyForReal ? "real_capital_ok" : "paper_only";
  const policySelection = describeGovernanceSelection(
    normalizedPolicySelection,
    options.policySelectionOverride ? null : storedPolicySelection.updatedAt
  );
  const summary = systemReadyForRealCapital && capitalPolicy.paperTradingOnly
    ? "El sistema ya pasó sus controles, pero la política seleccionada todavía mantiene el despliegue en paper trading o con un cap más bajo."
    : effectiveReadyForReal
      ? "El sistema ya muestra evidencia suficiente para considerar capital real incremental."
      : "El sistema todavía debe operar en paper trading o con capital mínimo hasta validar edge y estabilidad.";

  return {
    mode: effectiveMode,
    readyForRealCapital: effectiveReadyForReal,
    systemReadyForRealCapital,
    scorePct,
    grade: gradeFromScore(scorePct),
    summary,
    blockers: summarizeRules(rules),
    rules,
    degradationSignals,
    marketRegime,
    capitalPolicy,
    policySelection,
    policyCatalog: governanceCatalog,
    policyCooldown: governanceCooldown,
    policyThresholds: thresholds,
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
      brokerKey,
      sampleAmount: sampleTradeAmount,
      roundTripCostPct: roundTrip.totalEffectiveCostPct,
      requiredReturnToBreakEven: roundTrip.requiredReturnToBreakEvenPct,
      viable: costsViable,
    },
    brokerPreference: {
      brokerKey,
      updatedAt: storedBrokerPreference.updatedAt,
    },
    dataIntegrity: tradeSafety,
    preflight: preflightAssessment,
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
      evidenceQuality,
      marketProviders,
      ratioCoverage,
      ratioHealth,
      latestPreflightRun,
    },
    generatedAt: new Date().toISOString(),
  };
}
