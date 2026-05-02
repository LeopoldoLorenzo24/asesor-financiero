import { Router } from "express";
import {
  getCapitalHistory, logCapital, calculateBotPerformance,
} from "../database.js";
import { calculateSpyBenchmark, getRealPicksAlpha } from "../performance.js";
import { fetchCCL } from "../marketData.js";
import { toFiniteNumber } from "../utils.js";
import { BACKTEST_CONFIG } from "../config.js";
import { calculatePortfolioRiskMetrics } from "../riskMetrics.js";
import { fetchHistory } from "../marketData.js";
import { sendInternalError } from "../http.js";

const router = Router();

router.get("/performance", async (req, res) => {
  try { res.json(await calculateBotPerformance(parseInt(req.query.days) || 30)); }
  catch (err) { sendInternalError(res, "capital.performance", err); }
});

router.get("/analysis-sessions", async (req, res) => {
  try {
    const { getAnalysisSessions } = await import("../database.js");
    const { safeJsonParse } = await import("../utils.js");
    const sessions = await getAnalysisSessions(parseInt(req.query.limit) || 20);
    res.json(sessions.map((s) => ({ ...s, risks: safeJsonParse(s.risks, []), full_response: safeJsonParse(s.full_response, null) })));
  } catch (err) { sendInternalError(res, "capital.analysisSessions", err); }
});

router.get("/capital", async (req, res) => {
  try { res.json(await getCapitalHistory(parseInt(req.query.limit) || 90)); }
  catch (err) { sendInternalError(res, "capital.history", err); }
});

router.get("/capital-history", async (req, res) => {
  try { res.json(await getCapitalHistory(parseInt(req.query.limit) || 90)); }
  catch (err) { sendInternalError(res, "capital.historyLegacy", err); }
});

router.get("/performance-analytics", async (req, res) => {
  try {
    const ccl = await fetchCCL().catch(() => null);
    const [spyBenchmark, realAlpha] = await Promise.all([
      calculateSpyBenchmark(ccl?.venta || null).catch(() => null),
      getRealPicksAlpha().catch(() => null),
    ]);
    res.json({ spyBenchmark, realAlpha, ccl: ccl?.venta || null, generatedAt: new Date().toISOString() });
  } catch (err) { sendInternalError(res, "capital.analytics", err); }
});

router.post("/capital", async (req, res) => {
  try {
    const { capitalArs, portfolioValueArs, cclRate, monthlyDeposit } = req.body;
    await logCapital(toFiniteNumber(capitalArs, 0), toFiniteNumber(portfolioValueArs, 0), toFiniteNumber(cclRate, 0), toFiniteNumber(monthlyDeposit, BACKTEST_CONFIG.defaultMonthlyDeposit));
    res.json({ success: true });
  } catch (err) { sendInternalError(res, "capital.log", err); }
});

router.get("/risk-metrics", async (req, res) => {
  try {
    const history = await getCapitalHistory(120);
    const spyHistory = await fetchHistory("SPY.BA", 14).catch(() => fetchHistory("SPY", 14).catch(() => null));
    const metrics = await calculatePortfolioRiskMetrics(history, spyHistory);
    res.json({ metrics, generatedAt: new Date().toISOString() });
  } catch (err) { sendInternalError(res, "capital.riskMetrics", err); }
});

export default router;
