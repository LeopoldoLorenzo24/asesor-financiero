import { dispatchAlerts } from "./alerting.js";
import {
  getIntradayMonitorSettings,
  getLatestPreflightCheckRun,
  getPreflightCheckRunByDate,
  getPreflightCheckRuns,
  savePreflightCheckRun,
} from "./database.js";
import { getInvestmentAudit } from "./investmentAudit.js";
import { runRatioSync } from "./jobs.js";
import { assessPreflightReadiness, getPreflightWindowState } from "./preflightPolicy.js";

function buildAlertPayload(run: any) {
  if (!run) return [];
  if (run.status === "blocked") {
    return [{
      level: "critical",
      code: `preflight_blocked_${run.runDateLocal}`,
      message: `Preflight bloqueado ${run.runDateLocal}: ${run.summary || "sin resumen"}`,
    }];
  }
  if (run.status === "caution") {
    return [{
      level: "warning",
      code: `preflight_caution_${run.runDateLocal}`,
      message: `Preflight con cautela ${run.runDateLocal}: ${run.summary || "sin resumen"}`,
    }];
  }
  return [];
}

export async function runPreflightHealthCheck({
  source = "manual",
  force = false,
}: {
  source?: string;
  force?: boolean;
} = {}) {
  const settings = await getIntradayMonitorSettings();
  const window = getPreflightWindowState({
    timezone: settings.timezone,
    marketOpenLocal: settings.marketOpenLocal,
  });

  if (!force && source === "scheduled" && !window.isEligibleNow) {
    return {
      skipped: true,
      reason: window.isWeekend ? "weekend" : "outside_window",
      window,
      latestRun: await getLatestPreflightCheckRun(),
    };
  }

  const todayRun = await getPreflightCheckRunByDate(window.runDateLocal);
  if (!force && source === "scheduled" && todayRun) {
    return {
      skipped: true,
      reason: "already_ran_today",
      window,
      latestRun: todayRun,
    };
  }

  let ratioSyncResult: { updated?: number; skipped?: number; warnings?: string[] } | null = null;
  let ratioSyncError: string | null = null;
  try {
    ratioSyncResult = await runRatioSync();
    if (!ratioSyncResult) {
      throw new Error("ratio sync devolvio resultado vacio");
    }
  } catch (err: any) {
    ratioSyncError = err.message || "ratio sync failed";
  }

  const audit = await getInvestmentAudit().catch((err: any) => ({
    verdict: "blocked",
    summary: `No se pudo construir investment audit: ${err.message}`,
    blockers: [`Investment audit fallo: ${err.message}`],
    cautions: [],
    strengths: [],
    recommendedCapitalPct: 0,
  }));

  const status = ratioSyncError
    ? "blocked"
    : audit.verdict === "blocked"
      ? "blocked"
      : audit.verdict === "caution"
        ? "caution"
        : "ready";

  const blockers = [
    ...(ratioSyncError ? [`Ratio sync fallo: ${ratioSyncError}`] : []),
    ...((audit.blockers || []).map((item: unknown) => String(item))),
  ];
  const cautions = [
    ...(((ratioSyncResult?.warnings || []) as string[]).slice(0, 10)),
    ...((audit.cautions || []).map((item: unknown) => String(item))),
  ];
  const strengths = (audit.strengths || []).map((item: unknown) => String(item));
  const summary = ratioSyncError
    ? `Preflight bloqueado: fallo el ratio sync y el sistema no debe operar nuevo capital.`
    : audit.summary || "Preflight ejecutado.";

  const savedRun = await savePreflightCheckRun({
    runDateLocal: window.runDateLocal,
    source,
    status,
    verdict: audit.verdict || null,
    summary,
    timezone: window.timezone,
    marketOpenLocal: window.marketOpenLocal,
    windowStartLocal: window.windowStartLocal,
    windowEndLocal: window.windowEndLocal,
    ratioSyncUpdated: Number(ratioSyncResult?.updated || 0),
    ratioSyncSkipped: Number(ratioSyncResult?.skipped || 0),
    ratioSyncWarningCount: Array.isArray(ratioSyncResult?.warnings) ? ratioSyncResult.warnings.length : 0,
    blockers,
    cautions,
    strengths,
    audit: {
      verdict: audit.verdict,
      summary: audit.summary,
      recommendedCapitalPct: audit.recommendedCapitalPct,
      blockers: audit.blockers,
      cautions: audit.cautions,
      strengths: audit.strengths,
    },
  });

  const alerts = buildAlertPayload(savedRun);
  if (alerts.length > 0) {
    await dispatchAlerts(alerts, { source: "preflight-health" }).catch(() => {});
  }

  return {
    skipped: false,
    window,
    ratioSync: ratioSyncResult,
    ratioSyncError,
    audit,
    run: savedRun,
  };
}

export async function runScheduledPreflightCheck() {
  return runPreflightHealthCheck({ source: "scheduled", force: false });
}

export async function getPreflightStatusPayload() {
  const settings = await getIntradayMonitorSettings();
  const window = getPreflightWindowState({
    timezone: settings.timezone,
    marketOpenLocal: settings.marketOpenLocal,
    marketCloseLocal: settings.marketCloseLocal,
  });
  const [latestRun, recentRuns] = await Promise.all([
    getLatestPreflightCheckRun(),
    getPreflightCheckRuns(10),
  ]);
  const assessment = assessPreflightReadiness({
    latestRun,
    settings: {
      timezone: settings.timezone,
      marketOpenLocal: settings.marketOpenLocal,
      marketCloseLocal: settings.marketCloseLocal,
    },
  });

  return {
    window,
    assessment,
    latestRun,
    recentRuns,
  };
}
