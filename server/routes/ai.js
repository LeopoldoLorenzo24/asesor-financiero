import { Router } from "express";
import { appState } from "../state.js";
import { AI_CONFIG, RANKING_CONFIG } from "../config.js";
import {
  generateAnalysis, analyzeSingle, extractJSON, getClient,
} from "../aiAdvisor.js";
import { runAiAnalyzeSelfCheck } from "../selfCheck.js";
import {
  getPredictions, evaluatePredictionsForTicker, getPredictionById,
  getPortfolioSummary, savePostMortem, getPostMortems, getLatestLessons,
  getAnalysisSessions,
} from "../database.js";
import { assertAiBudgetAvailable, recordAnthropicUsage } from "../aiUsage.js";
import { recordSelfCheckResult } from "../observability.js";
import { runAutoPaperTrading } from "../jobs.js";
import { applyDeploymentGovernance, getInvestmentReadiness } from "../investmentReadiness.js";
import { fetchCCL, fetchFullData, fetchQuote, fetchAllQuotes } from "../marketData.js";
import {
  technicalAnalysis, fundamentalAnalysis, compositeScore,
} from "../analysis.js";
import { diversifiedSelection } from "../diversifier.js";
import { sanitizePicksWithRiskLimits } from "../riskManager.js";
import { safeJsonParse } from "../utils.js";
import CEDEARS from "../cedears.js";

const router = Router();

router.post("/analyze", async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: "ANTHROPIC_API_KEY no configurada" });

    const selfCheck = await runAiAnalyzeSelfCheck();
    recordSelfCheckResult(selfCheck);
    if (!selfCheck.ok) {
      console.error("[self-check] Falló:", selfCheck.failedChecks.join(", "));
      if (selfCheck.mode === "strict") return res.status(503).json({ error: "Self-check del motor falló.", selfCheck });
    }

    const now = Date.now();
    const elapsed = now - appState.lastAnalysisTimestamp;
    if (elapsed < AI_CONFIG.analysisCooldownMs) {
      const minutesLeft = Math.ceil((AI_CONFIG.analysisCooldownMs - elapsed) / 60000);
      return res.status(429).json({ error: `Esperá ${minutesLeft} minutos antes de correr otro análisis.`, cooldownMinutes: minutesLeft, lastAnalysis: new Date(appState.lastAnalysisTimestamp).toISOString() });
    }

    const { capital = 0, profile: profileId = RANKING_CONFIG.defaultProfile } = req.body;
    const ccl = await fetchCCL();
    const userId = req.user?.userId;
    const investmentReadiness = await getInvestmentReadiness(userId);

    const tickers = CEDEARS.map((c) => c.ticker);
    const quotesMap = await fetchAllQuotes(tickers);

    const preRanked = CEDEARS.map((c) => ({
      cedear: c, quote: quotesMap[c.ticker],
      basicScore: fundamentalAnalysis(null, quotesMap[c.ticker]).score,
    })).sort((a, b) => b.basicScore - a.basicScore).slice(0, RANKING_CONFIG.preRankLimit);

    const rankedResults = [];
    const { chunkArray, sleep } = await import("../utils.js");
    const batches = chunkArray(preRanked, RANKING_CONFIG.fullAnalysisBatchSize);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchResults = await Promise.allSettled(
        batch.map(async ({ cedear, quote }) => {
          const data = await fetchFullData(cedear.ticker);
          const tech = technicalAnalysis(data.history);
          const fund = fundamentalAnalysis(data.financials, data.quote || quote);
          const scores = compositeScore(tech, fund, data.quote || quote, cedear.sector, profileId);
          return { cedear, quote: data.quote || quote, technical: tech, fundamentals: fund, scores };
        })
      );
      for (const r of batchResults) if (r.status === "fulfilled" && r.value) rankedResults.push(r.value);
      if (i < batches.length - 1) await sleep(RANKING_CONFIG.fullAnalysisDelayMs);
    }

    rankedResults.sort((a, b) => b.scores.composite - a.scores.composite);

    const portfolioSummary = await getPortfolioSummary();
    const { picks: topPicks, diversification, warnings } = diversifiedSelection(rankedResults, portfolioSummary, profileId);

    console.log(`🎯 Diversifier: ${topPicks.length} picks across ${diversification.sectorsRepresented} sectors`);
    if (warnings.length) console.log(`⚠️ Warnings: ${warnings.join(" | ")}`);

    const analysis = await generateAnalysis({ topPicks, capital, ccl, diversification, warnings, ranking: rankedResults, profileId });
    if (!analysis?.error) appState.lastAnalysisTimestamp = now;

    if (analysis?.decision_mensual?.picks_activos?.length > 0) {
      const cedearDefs = Object.fromEntries(CEDEARS.map((c) => [c.ticker, c]));
      const { sanitizedPicks, riskNotes } = sanitizePicksWithRiskLimits(
        analysis.decision_mensual.picks_activos,
        portfolioSummary,
        cedearDefs,
        profileId
      );
      analysis.decision_mensual.picks_activos = sanitizedPicks;
      if (riskNotes.length) {
        analysis._risk_notes = riskNotes;
        console.log("[risk] Ajustes aplicados:", riskNotes);
      }
    }

    analysis._deployment_policy = {
      mode: investmentReadiness.mode,
      readyForRealCapital: investmentReadiness.readyForRealCapital,
      scorePct: investmentReadiness.scorePct,
      grade: investmentReadiness.grade,
      blockers: investmentReadiness.blockers,
      summary: investmentReadiness.summary,
      capitalPolicy: investmentReadiness.capitalPolicy,
      marketRegime: investmentReadiness.marketRegime,
      degradationSignals: investmentReadiness.degradationSignals,
    };

    applyDeploymentGovernance({
      analysis,
      investmentReadiness,
      availableCapitalArs: capital,
    });

    // Auto paper trading si está habilitado
    runAutoPaperTrading(analysis).catch((e) => console.error("[ai] Auto paper trading falló:", e.message));

    res.json({
      analysis,
      diversification,
      warnings,
      ccl,
      investmentReadiness,
      timestamp: new Date().toISOString(),
      selfCheck: {
        ok: selfCheck.ok,
        skipped: selfCheck.skipped,
        reason: selfCheck.reason || null,
        failedChecks: selfCheck.failedChecks || [],
        ranAt: selfCheck.ranAt,
      },
    });
  } catch (err) {
    console.error("AI analyze error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/analyze/:ticker", async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: "ANTHROPIC_API_KEY no configurada" });
    const ticker = req.params.ticker.toUpperCase();
    const cedear = CEDEARS.find((c) => c.ticker === ticker);
    if (!cedear) return res.status(404).json({ error: `CEDEAR ${ticker} no encontrado` });

    const ccl = await fetchCCL();
    const data = await fetchFullData(ticker);
    const tech = technicalAnalysis(data.history);
    const fund = fundamentalAnalysis(data.financials, data.quote);
    const profileId = req.query.profile || RANKING_CONFIG.defaultProfile;
    const scores = compositeScore(tech, fund, data.quote, cedear.sector, profileId);

    const portfolioSummary = await getPortfolioSummary();
    const currentPosition = portfolioSummary.find((p) => p.ticker === ticker);
    const portfolioContext = currentPosition
      ? `\nCONTEXTO DE CARTERA: El inversor YA TIENE ${currentPosition.total_shares} CEDEARs de ${ticker}, comprados a un promedio de $${currentPosition.weighted_avg_price} ARS.`
      : `\nCONTEXTO DE CARTERA: El inversor NO tiene ${ticker} en su cartera.`;

    const aiResult = await analyzeSingle({ ticker: cedear.ticker, name: cedear.name, sector: cedear.sector, scores: { ...scores, ratio: cedear.ratio }, technical: tech, fundamentals: fund, quote: data.quote, ccl, portfolioContext });
    res.json({ ticker, aiAnalysis: aiResult, scores, ccl });
  } catch (err) {
    console.error(`AI single error for ${req.params.ticker}:`, err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/usage", async (req, res) => {
  const { getAiUsageReport } = await import("../aiUsage.js");
  try { res.json(await getAiUsageReport(parseInt(req.query.days) || 30)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
