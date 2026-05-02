import { Router } from "express";
import { runBacktest } from "../backtest.js";
import { BACKTEST_CONFIG } from "../config.js";
import { getObservabilitySnapshot } from "../observability.js";
import { getDataProviderStatus, fetchRiesgoPais } from "../marketData.js";
import { getAlertingStatus, getRecentAlerts } from "../alerting.js";
import { getAiBudgetStatus } from "../aiUsage.js";
import { FLAGS } from "../featureFlags.js";
import { getRatioFreshness, getRatioCoverage } from "../cedears.js";
import { getAllCedearRatios } from "../database.js";
import { runRatioSync } from "../jobs.js";
import { getInvestmentReadiness } from "../investmentReadiness.js";
import { getInvestmentAudit } from "../investmentAudit.js";
import { getPreflightStatusPayload, runPreflightHealthCheck } from "../preflightHealth.js";
import { authMiddleware } from "../auth.js";
import { getBrokerPreference, getGovernancePolicyAuditLog, saveBrokerPreference, saveGovernancePolicySelection } from "../database.js";
import { runDailyMaintenanceCycle } from "../jobs.js";
import { BROKER_CONFIGS } from "../brokerCosts.js";
import {
  getIntradayMonitorStatusPayload,
  runIntradayMonitorOnce,
  startIntradayMonitor,
  stopIntradayMonitor,
} from "../intradayMonitor.js";
import { updateIntradayMonitorSettings } from "../database.js";
import CEDEARS from "../cedears.js";
import { sendInternalError } from "../http.js";

const router = Router();

function buildReadinessDiff(currentReadiness, previewReadiness) {
  return {
    scorePctDelta: Number((previewReadiness?.scorePct || 0) - (currentReadiness?.scorePct || 0)),
    currentMode: currentReadiness?.mode || null,
    previewMode: previewReadiness?.mode || null,
    currentStage: currentReadiness?.capitalPolicy?.stage || null,
    previewStage: previewReadiness?.capitalPolicy?.stage || null,
    currentMaxCapitalPct: currentReadiness?.capitalPolicy?.maxCapitalPct ?? null,
    previewMaxCapitalPct: previewReadiness?.capitalPolicy?.maxCapitalPct ?? null,
    blockersDelta: (previewReadiness?.blockers?.length || 0) - (currentReadiness?.blockers?.length || 0),
  };
}

router.get("/health", (req, res) => {
  res.json({ status: "ok", cedears: CEDEARS.length, timestamp: new Date().toISOString() });
});

router.get("/internal/metrics", async (req, res) => {
  try {
    const aiBudget = await getAiBudgetStatus();
    res.json({
      observability: getObservabilitySnapshot({ aiBudget, aiUsageTodayUsd: aiBudget.todayCostUsd }),
      aiBudget,
      marketProviders: getDataProviderStatus(),
      alerting: getAlertingStatus(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) { sendInternalError(res, "system.internalMetrics", err); }
});

router.get("/metrics", async (req, res) => {
  try {
    const mem = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());
    const aiBudget = await getAiBudgetStatus();
    res.json({
      uptimeSeconds: uptimeSec,
      uptimeFormatted: `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`,
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      },
      nodeVersion: process.version,
      pid: process.pid,
      cedearsLoaded: CEDEARS.length,
      aiBudget: { dailyUsd: aiBudget.dailyBudgetUsd, usedTodayUsd: aiBudget.todayCostUsd, remainingUsd: aiBudget.remainingUsd },
      marketProviders: getDataProviderStatus(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) { sendInternalError(res, "system.metrics", err); }
});

router.get("/alerts/recent", async (req, res) => {
  try {
    res.json({ alerts: getRecentAlerts(parseInt(req.query.limit) || 20), timestamp: new Date().toISOString() });
  } catch (err) { sendInternalError(res, "system.alerts", err); }
});

router.get("/system/health", async (req, res) => {
  try {
    const [aiBudget, investmentReadiness, riesgoPais] = await Promise.all([
      getAiBudgetStatus(),
      getInvestmentReadiness(),
      fetchRiesgoPais().catch(() => null),
    ]);
    const obs = getObservabilitySnapshot({ aiBudget, aiUsageTodayUsd: aiBudget.todayCostUsd });
    const mem = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());

    res.json({
      status: "ok",
      uptimeSeconds: uptimeSec,
      uptimeFormatted: `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`,
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      },
      cedearsLoaded: CEDEARS.length,
      aiBudget: {
        dailyUsd: aiBudget.dailyBudgetUsd,
        usedTodayUsd: aiBudget.todayCostUsd,
        remainingUsd: aiBudget.remainingUsd,
        usagePct: aiBudget.usagePct,
        hasBudget: aiBudget.hasBudget,
      },
      marketProviders: getDataProviderStatus(),
      alerting: getAlertingStatus(),
      recentAlerts: getRecentAlerts(5),
      recentWindow: obs.recentWindow,
      selfChecks: obs.selfChecks,
      featureFlags: FLAGS,
      riesgoPais: riesgoPais || undefined,
      investmentReadiness,
      timestamp: new Date().toISOString(),
    });
  } catch (err) { sendInternalError(res, "system.health", err); }
});

router.get("/system/readiness", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    res.json(await getInvestmentReadiness(userId));
  } catch (err) {
    sendInternalError(res, "system.readiness", err);
  }
});

router.get("/system/investment-audit", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    res.json(await getInvestmentAudit(userId));
  } catch (err) {
    sendInternalError(res, "system.investmentAudit", err);
  }
});

router.get("/system/preflight-status", authMiddleware, async (req, res) => {
  try {
    res.json(await getPreflightStatusPayload());
  } catch (err) {
    sendInternalError(res, "system.preflightStatus", err);
  }
});

router.post("/system/preflight/run-now", authMiddleware, async (req, res) => {
  try {
    res.json(await runPreflightHealthCheck({ source: "manual", force: true }));
  } catch (err) {
    sendInternalError(res, "system.preflightRunNow", err);
  }
});

router.get("/system/policies", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const [readiness, auditLog] = await Promise.all([
      getInvestmentReadiness(userId),
      getGovernancePolicyAuditLog(userId, 10),
    ]);
    res.json({
      currentSelection: readiness.policySelection,
      catalog: readiness.policyCatalog,
      cooldown: readiness.policyCooldown,
      thresholds: readiness.policyThresholds,
      auditLog,
      readiness,
    });
  } catch (err) {
    sendInternalError(res, "system.policies", err);
  }
});

router.get("/system/broker-settings", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const preference = await getBrokerPreference(userId);
    res.json({
      current: preference,
      catalog: Object.entries(BROKER_CONFIGS).map(([key, cfg]) => ({
        key,
        name: cfg.name,
        commissionPct: cfg.commissionPct,
        commissionMinArs: cfg.commissionMinArs,
        marketRightsPct: cfg.marketRightsPct,
        selladoPct: cfg.selladoPct,
        clearingPct: cfg.clearingPct,
        otherPct: cfg.otherPct,
      })),
    });
  } catch (err) {
    sendInternalError(res, "system.brokerSettings", err);
  }
});

router.post("/system/broker-settings", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const brokerKey = String(req.body?.brokerKey || "").trim();
    if (!brokerKey || !BROKER_CONFIGS[brokerKey]) {
      return res.status(400).json({ error: "brokerKey inválido" });
    }
    const saved = await saveBrokerPreference(userId, brokerKey);
    const readiness = await getInvestmentReadiness(userId, { brokerKeyOverride: brokerKey });
    res.json({ success: true, current: saved, readiness });
  } catch (err) {
    sendInternalError(res, "system.saveBrokerSettings", err);
  }
});

router.post("/system/policies/preview", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { overlayKey, deploymentMode } = req.body || {};
    const [currentReadiness, previewReadiness, auditLog] = await Promise.all([
      getInvestmentReadiness(userId),
      getInvestmentReadiness(userId, {
        policySelectionOverride: {
          overlayKey,
          deploymentMode,
        },
      }),
      getGovernancePolicyAuditLog(userId, 5),
    ]);

    res.json({
      currentSelection: currentReadiness.policySelection,
      proposedSelection: previewReadiness.policySelection,
      cooldown: currentReadiness.policyCooldown,
      currentReadiness,
      previewReadiness,
      impact: buildReadinessDiff(currentReadiness, previewReadiness),
      auditLog,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/system/policies/apply", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const reason = String(req.body?.reason || "").trim();
    const { overlayKey, deploymentMode } = req.body || {};
    const currentReadiness = await getInvestmentReadiness(userId);
    const previewReadiness = await getInvestmentReadiness(userId, {
      policySelectionOverride: {
        overlayKey,
        deploymentMode,
      },
    });

    const changed = (
      currentReadiness.policySelection?.overlayKey !== previewReadiness.policySelection?.overlayKey ||
      currentReadiness.policySelection?.deploymentMode !== previewReadiness.policySelection?.deploymentMode
    );

    if (!changed) {
      return res.json({
        success: true,
        changed: false,
        readiness: currentReadiness,
        selection: currentReadiness.policySelection,
        cooldown: currentReadiness.policyCooldown,
      });
    }

    if (currentReadiness.policyCooldown?.active) {
      return res.status(409).json({
        error: `Cooldown activo. Podés volver a cambiar la política en ${currentReadiness.policyCooldown.remainingDays} día(s).`,
        cooldown: currentReadiness.policyCooldown,
      });
    }
    if (!reason) {
      return res.status(400).json({ error: "Debes indicar un motivo breve para cambiar la política." });
    }

    const impact = buildReadinessDiff(currentReadiness, previewReadiness);
    const selection = await saveGovernancePolicySelection({
      userId,
      overlayKey: previewReadiness.policySelection.overlayKey,
      deploymentMode: previewReadiness.policySelection.deploymentMode,
      reason,
      impactPreview: {
        impact,
        scorePct: previewReadiness.scorePct,
        blockers: previewReadiness.blockers,
        capitalPolicy: previewReadiness.capitalPolicy,
      },
    });
    const readiness = await getInvestmentReadiness(userId);
    const auditLog = await getGovernancePolicyAuditLog(userId, 10);

    res.json({
      success: true,
      changed: true,
      selection,
      readiness,
      cooldown: readiness.policyCooldown,
      impact,
      auditLog,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/system/monitor/status", authMiddleware, async (req, res) => {
  try {
    res.json(await getIntradayMonitorStatusPayload());
  } catch (err) {
    sendInternalError(res, "system.monitor.status", err);
  }
});

router.post("/system/monitor/settings", authMiddleware, async (req, res) => {
  try {
    const statusBefore = await getIntradayMonitorStatusPayload();
    const nextSettings = await updateIntradayMonitorSettings({
      enabled: typeof req.body?.enabled === "boolean" ? req.body.enabled : undefined,
      intervalMinutes: req.body?.intervalMinutes,
      marketOpenLocal: req.body?.marketOpenLocal,
      marketCloseLocal: req.body?.marketCloseLocal,
      timezone: req.body?.timezone,
    });

    if (statusBefore.runtime.running && nextSettings.enabled) {
      await stopIntradayMonitor({ reason: "settings_updated", disable: false });
      await startIntradayMonitor({ startedBy: "settings_update", runImmediately: false, persistEnabled: false });
    } else if (statusBefore.runtime.running && !nextSettings.enabled) {
      await stopIntradayMonitor({ reason: "settings_disabled", disable: false });
    }

    res.json({
      success: true,
      settings: nextSettings,
      status: await getIntradayMonitorStatusPayload(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/system/monitor/start", authMiddleware, async (req, res) => {
  try {
    const status = await startIntradayMonitor({
      startedBy: req.user?.email || `user:${req.user?.userId || "unknown"}`,
      runImmediately: req.body?.runImmediately !== false,
      persistEnabled: true,
    });
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/system/monitor/stop", authMiddleware, async (req, res) => {
  try {
    const status = await stopIntradayMonitor({
      reason: String(req.body?.reason || "user_stop"),
      disable: req.body?.disable !== false,
    });
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/system/monitor/run-now", authMiddleware, async (req, res) => {
  try {
    const run = await runIntradayMonitorOnce({ source: "manual" });
    res.json({
      success: true,
      run,
      status: await getIntradayMonitorStatusPayload(),
    });
  } catch (err) {
    sendInternalError(res, "system.monitor.runNow", err);
  }
});

router.post("/system/run-maintenance", async (req, res) => {
  const secret = req.headers["x-maintenance-secret"];
  const expected = process.env.MAINTENANCE_SECRET;
  if (!expected || secret !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    console.log("[maintenance] Ciclo diario disparado externamente");
    runDailyMaintenanceCycle().catch((err) => console.error("[maintenance] Error:", err.message));
    res.json({ ok: true, message: "Mantenimiento diario iniciado", timestamp: new Date().toISOString() });
  } catch (err) {
    sendInternalError(res, "system.runMaintenance", err);
  }
});

// ── CEDEAR Ratios ──

router.get("/system/ratios", authMiddleware, async (req, res) => {
  try {
    const freshness = getRatioFreshness();
    const coverage = getRatioCoverage();
    const ratios = await getAllCedearRatios();
    res.json({ freshness, coverage, ratios });
  } catch (err) {
    sendInternalError(res, "system.ratios", err);
  }
});

router.post("/system/ratios/sync", authMiddleware, async (req, res) => {
  try {
    const result = await runRatioSync();
    const coverage = getRatioCoverage();
    res.json({ success: true, ...result, coverage });
  } catch (err) {
    sendInternalError(res, "system.ratios.sync", err);
  }
});

router.get("/backtest", async (req, res) => {
  try {
    const months = Math.min(BACKTEST_CONFIG.maxMonths, Math.max(BACKTEST_CONFIG.minMonths, parseInt(req.query.months) || BACKTEST_CONFIG.defaultMonths));
    const monthlyDeposit = parseInt(req.query.deposit) || BACKTEST_CONFIG.defaultMonthlyDeposit;
    const profile = req.query.profile || "moderate";
    const picksPerMonth = Math.min(BACKTEST_CONFIG.maxPicksPerMonth, Math.max(BACKTEST_CONFIG.minPicksPerMonth, parseInt(req.query.picks) || BACKTEST_CONFIG.defaultPicksPerMonth));
    res.json(await runBacktest({ months, monthlyDeposit, profile, picksPerMonth }));
  } catch (err) {
    sendInternalError(res, "system.backtest", err);
  }
});

export default router;
