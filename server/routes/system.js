import { Router } from "express";
import { runBacktest } from "../backtest.js";
import { BACKTEST_CONFIG } from "../config.js";
import { getObservabilitySnapshot } from "../observability.js";
import { getDataProviderStatus } from "../marketData.js";
import { getAlertingStatus, getRecentAlerts } from "../alerting.js";
import { getAiBudgetStatus } from "../aiUsage.js";
import { FLAGS } from "../featureFlags.js";
import { getInvestmentReadiness } from "../investmentReadiness.js";
import { authMiddleware } from "../auth.js";
import CEDEARS from "../cedears.js";

const router = Router();

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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/alerts/recent", async (req, res) => {
  try {
    res.json({ alerts: getRecentAlerts(parseInt(req.query.limit) || 20), timestamp: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/system/health", async (req, res) => {
  try {
    const aiBudget = await getAiBudgetStatus();
    const investmentReadiness = await getInvestmentReadiness();
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
      investmentReadiness,
      timestamp: new Date().toISOString(),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/system/readiness", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    res.json(await getInvestmentReadiness(userId));
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    console.error("Backtest error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
