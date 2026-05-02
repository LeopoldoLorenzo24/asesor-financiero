import { getAnalysisSessions, getAdherenceStats, getMonthlyTrackRecord, getTrackRecordWithMetrics } from "./database.js";
import { getInvestmentReadiness } from "./investmentReadiness.js";
import { getDataProviderStatus } from "./marketData.js";
import { getRatioCoverage, getRatioFreshness } from "./cedears.js";
import { getAiBudgetStatus } from "./aiUsage.js";
import { safeJsonParse, toFiniteNumber } from "./utils.js";

type LatestAnalysisSummary = {
  sessionDate: string | null;
  coreETF: string | null;
  corePct: number | null;
  satellitePct: number | null;
  picksCount: number;
  pickTickers: string[];
  planSteps: number;
  hasCircuitBreaker: boolean;
  hasPriceDataWarning: boolean;
  hasFreshnessWarning: boolean;
  guardrailNotesCount: number;
  riskNotesCount: number;
  consistencyNotesCount: number;
  warnings: string[];
};

export function summarizeLatestAnalysisSession(row: any): LatestAnalysisSummary | null {
  if (!row) return null;
  const fullResponse = safeJsonParse<any>(row.full_response, null);
  const decision = fullResponse?.decision_mensual || {};
  const dist = decision?.distribucion || {};
  const picks = Array.isArray(decision?.picks_activos) ? decision.picks_activos : [];
  const plan = Array.isArray(fullResponse?.plan_ejecucion) ? fullResponse.plan_ejecucion : [];
  const warnings = [
    fullResponse?._price_data_warning,
    fullResponse?._data_freshness_warning,
    ...(Array.isArray(fullResponse?._macro_warnings) ? fullResponse._macro_warnings : []),
  ].filter((value) => typeof value === "string" && value.trim().length > 0);

  return {
    sessionDate: row.session_date || null,
    coreETF: decision?.core_etf ? String(decision.core_etf).toUpperCase() : null,
    corePct: Number.isFinite(Number(dist?.core_pct)) ? Number(dist.core_pct) : null,
    satellitePct: Number.isFinite(Number(dist?.satellite_pct)) ? Number(dist.satellite_pct) : null,
    picksCount: picks.length,
    pickTickers: picks.map((pick: any) => String(pick?.ticker || "").toUpperCase()).filter(Boolean),
    planSteps: plan.length,
    hasCircuitBreaker: Boolean(fullResponse?._circuit_breaker?.triggered),
    hasPriceDataWarning: Boolean(fullResponse?._price_data_warning),
    hasFreshnessWarning: Boolean(fullResponse?._data_freshness_warning),
    guardrailNotesCount: Array.isArray(fullResponse?._guardrail_notes) ? fullResponse._guardrail_notes.length : 0,
    riskNotesCount: Array.isArray(fullResponse?._risk_notes) ? fullResponse._risk_notes.length : 0,
    consistencyNotesCount: Array.isArray(fullResponse?._consistency_notes) ? fullResponse._consistency_notes.length : 0,
    warnings,
  };
}

export function buildOperationalVerdict({
  readiness,
  marketProviders,
  ratioFreshness,
  latestAnalysis,
  aiBudget,
  trackMetrics,
  adherence,
  tradeSafety,
}: {
  readiness: any;
  marketProviders: any;
  ratioFreshness: any;
  latestAnalysis: LatestAnalysisSummary | null;
  aiBudget: any;
  trackMetrics: any;
  adherence: any;
  tradeSafety?: any;
}) {
  const blockers: string[] = [];
  const cautions: string[] = [];
  const strengths: string[] = [];

  if (!readiness?.readyForRealCapital) {
    blockers.push(`Readiness en ${readiness?.mode || "desconocido"} (${readiness?.scorePct ?? 0}%).`);
  } else {
    strengths.push(`Readiness operativo: ${readiness.scorePct}% (${readiness.grade}).`);
  }

  if (tradeSafety?.mustStandAside) {
    blockers.push(...(tradeSafety.blockers || []));
  } else if ((tradeSafety?.cautions || []).length > 0) {
    cautions.push(...tradeSafety.cautions);
  } else {
    strengths.push("Integridad de datos operativa para decisiones accionables.");
  }

  if (latestAnalysis?.hasPriceDataWarning) {
    blockers.push("El ultimo analisis no pudo validar suficientes precios reales.");
  }

  if (latestAnalysis?.hasFreshnessWarning) {
    cautions.push("El ultimo analisis uso datos de mercado con frescura limitada.");
  }

  if (latestAnalysis?.hasCircuitBreaker) {
    cautions.push("El ultimo analisis cayo en circuit breaker; el regimen actual sigue delicado.");
  }

  if (ratioFreshness?.stale) {
    cautions.push(ratioFreshness.warning || "Ratios de CEDEAR potencialmente desactualizados.");
  }

  if (marketProviders?.degraded && !tradeSafety?.mustStandAside) {
    cautions.push("Proveedores de mercado con degradacion parcial reciente.");
  }

  if ((readiness?.evidence?.alphaStats?.avgAlpha ?? null) != null) {
    const avgAlpha = Number(readiness.evidence.alphaStats.avgAlpha);
    if (avgAlpha <= 0) {
      cautions.push(`El alpha promedio de picks evaluados no es positivo (${avgAlpha}%).`);
    } else {
      strengths.push(`Alpha promedio de picks evaluados positivo (${avgAlpha}%).`);
    }
  }

  if ((trackMetrics?.alphaPct ?? null) != null) {
    const trackAlpha = Number(trackMetrics.alphaPct);
    if (trackAlpha <= 0) {
      cautions.push(`El track record virtual no supera al benchmark (${trackAlpha}%).`);
    } else {
      strengths.push(`Track record virtual por encima del benchmark (${trackAlpha}%).`);
    }
  }

  if (toFiniteNumber(adherence?.pending, 0) > 0) {
    cautions.push(`Hay ${adherence.pending} pasos de ejecucion todavia pendientes de cerrar.`);
  }

  if (toFiniteNumber(adherence?.avgDiscrepancyPct, 0) > 15) {
    cautions.push(`La ejecucion real se desvia demasiado del plan (${adherence.avgDiscrepancyPct}%).`);
  } else if (toFiniteNumber(adherence?.resolved, 0) > 0) {
    strengths.push(`Disciplina de ejecucion razonable (${adherence.avgDiscrepancyPct}% de discrepancia promedio).`);
  }

  if (aiBudget?.hasBudget && toFiniteNumber(aiBudget.usagePct, 0) >= 90) {
    cautions.push(`Presupuesto de IA muy consumido (${aiBudget.usagePct}%).`);
  }

  let verdict: "blocked" | "caution" | "ready_incremental" = "ready_incremental";
  if (blockers.length > 0) verdict = "blocked";
  else if (cautions.length > 0) verdict = "caution";

  const recommendedCapitalPct = verdict === "blocked"
    ? 0
    : verdict === "caution"
      ? Math.min(10, toFiniteNumber(readiness?.capitalPolicy?.maxCapitalPct, 10))
      : toFiniteNumber(readiness?.capitalPolicy?.maxCapitalPct, 0);

  return {
    verdict,
    blockers,
    cautions,
    strengths,
    recommendedCapitalPct,
    summary:
      verdict === "blocked"
        ? "No operar capital real nuevo hasta resolver los bloqueos."
        : verdict === "caution"
          ? "Operar solo capital incremental chico y bajo disciplina estricta."
          : "El sistema puede operar capital incremental dentro de los limites de politica vigentes.",
  };
}

export async function getInvestmentAudit(userId?: number | null) {
  const [readiness, providers, ratioFreshness, ratioCoverage, aiBudget, latestSessionRows, adherence, trackRecord, monthlyTrackRecord] = await Promise.all([
    getInvestmentReadiness(userId),
    Promise.resolve(getDataProviderStatus()),
    Promise.resolve(getRatioFreshness()),
    Promise.resolve(getRatioCoverage()),
    getAiBudgetStatus(),
    getAnalysisSessions(1),
    getAdherenceStats(90),
    getTrackRecordWithMetrics(365),
    getMonthlyTrackRecord(6),
  ]);

  const latestAnalysis = summarizeLatestAnalysisSession(latestSessionRows?.[0]);
  const operational = buildOperationalVerdict({
    readiness,
    marketProviders: providers,
    ratioFreshness,
    latestAnalysis,
    aiBudget,
    trackMetrics: trackRecord?.metrics,
    adherence,
    tradeSafety: readiness?.dataIntegrity,
  });

  return {
    verdict: operational.verdict,
    summary: operational.summary,
    recommendedCapitalPct: operational.recommendedCapitalPct,
    blockers: operational.blockers,
    cautions: operational.cautions,
    strengths: operational.strengths,
    readiness: {
      mode: readiness.mode,
      readyForRealCapital: readiness.readyForRealCapital,
      scorePct: readiness.scorePct,
      grade: readiness.grade,
      summary: readiness.summary,
      capitalPolicy: readiness.capitalPolicy,
      degradationSignals: readiness.degradationSignals,
      blockers: readiness.blockers,
      dataIntegrity: readiness.dataIntegrity || null,
      preflight: readiness.preflight || null,
    },
    dataQuality: {
      marketProviders: providers,
      ratioFreshness,
      ratioCoverage,
      ratioHealth: readiness?.evidence?.ratioHealth || null,
      tradeSafety: readiness?.dataIntegrity || null,
      preflight: readiness?.preflight || null,
      latestAnalysisWarnings: latestAnalysis?.warnings || [],
    },
    evidence: {
      alphaStats: readiness?.evidence?.alphaStats || null,
      benchmark: readiness?.evidence?.benchmark || null,
      trackRecordMetrics: trackRecord?.metrics || null,
      monthlyTrackRecord,
      adherence,
    },
    latestAnalysis,
    aiBudget: {
      dailyBudgetUsd: aiBudget.dailyBudgetUsd,
      usedTodayUsd: aiBudget.todayCostUsd,
      remainingUsd: aiBudget.remainingUsd,
      usagePct: aiBudget.usagePct,
      hasBudget: aiBudget.hasBudget,
    },
    generatedAt: new Date().toISOString(),
  };
}
