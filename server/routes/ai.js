import { Router } from "express";
import { appState } from "../state.js";
import { AI_CONFIG, PROFILE_CONFIG, RANKING_CONFIG } from "../config.js";
import {
  generateAnalysis, analyzeSingle,
} from "../aiAdvisor.js";
import { runAiAnalyzeSelfCheck } from "../selfCheck.js";
import {
  createExecutionTradeTicket, countCriticalExecutionAlertsToday, getBrokerPreference, getExecutionAssistantSettings, getExecutionTradeTickets, markAdherenceSessionPaperOnly, markExecutionTicketAlertSent, getPortfolioSummary,
} from "../database.js";
import { recordSelfCheckResult } from "../observability.js";
import { runAutoPaperTrading } from "../jobs.js";
import { applyDeploymentGovernance, getInvestmentReadiness } from "../investmentReadiness.js";
import { fetchCCL, fetchFullData, fetchAllQuotes, fetchRiesgoPais } from "../marketData.js";
import {
  technicalAnalysis, fundamentalAnalysis, compositeScore,
} from "../analysis.js";
import { diversifiedSelection } from "../diversifier.js";
import { sanitizePicksWithRiskLimits } from "../riskManager.js";
import CEDEARS from "../cedears.js";
import { getAiBudgetStatus } from "../aiUsage.js";
import { sendInternalError } from "../http.js";
import { buildStandAsideAnalysis } from "../tradeSafety.js";
import { dispatchAlerts } from "../alerting.js";
import { buildExecutionAssistantPayload, buildTradeTicketsFromAnalysis } from "../executionAssistant.js";

const router = Router();

router.post("/analyze", async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(400).json({ error: "ANTHROPIC_API_KEY no configurada" });
    }

    // Check AI budget BEFORE doing any expensive work
    const budgetCheck = await getAiBudgetStatus();
    if (budgetCheck.exceeded) {
      return res.status(429).json({
        error: `Límite diario de IA alcanzado ($${budgetCheck.todayCostUsd.toFixed(2)} / $${budgetCheck.dailyBudgetUsd} USD). Intentá mañana.`,
        budget: budgetCheck,
      });
    }
    if (budgetCheck.hasBudget && budgetCheck.usagePct > 80) {
      console.warn(`[ai] Budget usage at ${budgetCheck.usagePct}% ($${budgetCheck.todayCostUsd.toFixed(2)} / $${budgetCheck.dailyBudgetUsd})`);
    }

    const selfCheck = await runAiAnalyzeSelfCheck();
    recordSelfCheckResult(selfCheck);
    if (!selfCheck.ok) {
      console.error("[self-check] Falló:", selfCheck.failedChecks.join(", "));
      if (selfCheck.mode === "strict") {
        return res.status(503).json({ error: "Self-check del motor falló.", selfCheck });
      }
    }

    const userId = req.user?.userId;
    const cooldownKey = userId ? `user:${userId}` : "global";
    const now = Date.now();
    const lastAnalysisTimestamp = appState.getLastAnalysisTimestamp(cooldownKey);
    const elapsed = now - lastAnalysisTimestamp;
    if (elapsed < AI_CONFIG.analysisCooldownMs) {
      const minutesLeft = Math.ceil((AI_CONFIG.analysisCooldownMs - elapsed) / 60000);
      return res.status(429).json({
        error: `Esperá ${minutesLeft} minutos antes de correr otro análisis.`,
        cooldownMinutes: minutesLeft,
        lastAnalysis: new Date(lastAnalysisTimestamp).toISOString(),
      });
    }

    const { capital = 0, profile: profileId = RANKING_CONFIG.defaultProfile } = req.body;
    const [ccl, riesgoPais] = await Promise.all([
      fetchCCL(),
      fetchRiesgoPais().catch(() => null),
    ]);
    // Guard against stale CCL data (>4 hours old)
    if (ccl._stale) {
      console.warn("[ai] CCL data is stale (from file cache). Proceeding with warning.");
    }
    const investmentReadiness = await getInvestmentReadiness(userId);
    const executionAssistantSettings = await getExecutionAssistantSettings(userId);
    const brokerPreference = await getBrokerPreference(userId);
    const dataIntegrity = investmentReadiness?.dataIntegrity;
    const profileConfig = PROFILE_CONFIG[profileId] || PROFILE_CONFIG.moderate;

    if (dataIntegrity?.mustStandAside) {
      const analysis = buildStandAsideAnalysis({
        capital,
        coreETF: profileConfig.coreETF,
        tradeSafety: dataIntegrity,
      });
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

      return res.json({
        analysis,
        diversification: { picksCount: 0, sectorsRepresented: 0 },
        warnings: dataIntegrity.blockers || [],
        ccl,
        riesgoPais: riesgoPais || undefined,
        investmentReadiness,
        dataQualityWarnings: [...(dataIntegrity.blockers || []), ...(dataIntegrity.cautions || [])],
        timestamp: new Date().toISOString(),
        selfCheck: {
          ok: selfCheck.ok,
          skipped: selfCheck.skipped,
          reason: selfCheck.reason || null,
          failedChecks: selfCheck.failedChecks || [],
          ranAt: selfCheck.ranAt,
        },
        tradeTickets: [],
        executionAssistant: buildExecutionAssistantPayload(executionAssistantSettings, []),
      });
    }

    const tickers = CEDEARS.map((c) => c.ticker);
    const quotesMap = await fetchAllQuotes(tickers);

    const preRanked = CEDEARS.map((c) => ({
      cedear: c,
      quote: quotesMap[c.ticker],
      basicScore: fundamentalAnalysis(null, quotesMap[c.ticker], c.sector).score,
    }))
      .sort((a, b) => b.basicScore - a.basicScore)
      .slice(0, RANKING_CONFIG.preRankLimit);

    const rankedResults = [];
    const { chunkArray, sleep } = await import("../utils.js");
    const batches = chunkArray(preRanked, RANKING_CONFIG.fullAnalysisBatchSize);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchResults = await Promise.allSettled(
        batch.map(async ({ cedear, quote }) => {
          const data = await fetchFullData(cedear.ticker);
          const tech = technicalAnalysis(data.history);
          const fund = fundamentalAnalysis(data.financials, data.quote || quote, cedear.sector, tech?.indicators);
          const scores = compositeScore(tech, fund, data.quote || quote, cedear.sector, profileId);
          return { cedear, quote: data.quote || quote, technical: tech, fundamentals: fund, scores };
        })
      );
      for (const result of batchResults) {
        if (result.status === "fulfilled" && result.value) {
          rankedResults.push(result.value);
        }
      }
      if (i < batches.length - 1) {
        await sleep(RANKING_CONFIG.fullAnalysisDelayMs);
      }
    }

    rankedResults.sort((a, b) => b.scores.composite - a.scores.composite);

    const portfolioSummary = await getPortfolioSummary();
    const { picks: topPicks, diversification, warnings } = diversifiedSelection(
      rankedResults,
      portfolioSummary,
      profileId
    );

    console.log(`Diversifier: ${topPicks.length} picks across ${diversification.sectorsRepresented} sectors`);
    if (warnings.length) {
      console.log(`Warnings: ${warnings.join(" | ")}`);
    }

    const analysis = await generateAnalysis({
      topPicks,
      capital,
      ccl,
      diversification,
      warnings,
      ranking: rankedResults,
      profileId,
      brokerKey: brokerPreference?.brokerKey || "default",
    });
    if (!analysis?.error) {
      appState.setLastAnalysisTimestamp(cooldownKey, now);
    }

    if (analysis?.decision_mensual?.picks_activos?.length > 0) {
      const cedearDefs = Object.fromEntries(CEDEARS.map((c) => [c.ticker, c]));
      const { sanitizedPicks, riskNotes } = sanitizePicksWithRiskLimits(
        analysis.decision_mensual.picks_activos,
        portfolioSummary,
        cedearDefs,
        profileId,
        analysis?._circuit_breaker
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

    if (investmentReadiness.mode === "paper_only" && Number(analysis?._session_id) > 0) {
      await markAdherenceSessionPaperOnly(Number(analysis._session_id)).catch((err) => {
        console.error("[adherence] Error marcando sesión como paper_only:", err.message);
      });
    }

    runAutoPaperTrading(analysis, userId).catch((err) => {
      console.error("[ai] Auto paper trading falló:", err.message);
    });

    if (userId != null) {
      const ticketBuild = buildTradeTicketsFromAnalysis({
        analysis,
        investmentReadiness,
        suggestionMode: executionAssistantSettings.suggestionMode,
      });
      for (const ticket of ticketBuild.tickets) {
        await createExecutionTradeTicket({
          userId,
          analysisSessionId: Number(analysis?._session_id) || null,
          source: "analysis",
          suggestionMode: executionAssistantSettings.suggestionMode,
          priority: ticket.priority,
          action: ticket.action,
          ticker: ticket.ticker,
          name: ticket.name,
          sector: ticket.sector,
          subtype: ticket.subtype,
          shares: ticket.shares,
          limitPriceArs: ticket.limitPriceArs,
          estimatedAmountArs: ticket.estimatedAmountArs,
          targetPct: ticket.targetPct,
          stopLossPct: ticket.stopLossPct,
          conviction: ticket.conviction,
          rationale: ticket.rationale,
          executionNote: ticket.executionNote,
          expiresAt: ticket.expiresAt,
          payload: ticket.payload,
        });
      }

      if (executionAssistantSettings.suggestionMode === "critical_alerts") {
        const alertsSentToday = await countCriticalExecutionAlertsToday(userId);
        const remainingQuota = Math.max(0, executionAssistantSettings.maxCriticalAlertsPerDay - alertsSentToday);
        const openTicketsForAlerts = await getExecutionTradeTickets(userId, ["pending_confirmation", "confirmed"], 20);
        const alertCandidates = openTicketsForAlerts
          .filter((ticket) => ticket?.priority === "critical" && !ticket?.alert_sent_at)
          .slice(0, remainingQuota);

        if (alertCandidates.length > 0) {
          await dispatchAlerts(
            alertCandidates.map((ticket) => ({
              level: ticket.action === "SELL" ? "warning" : "info",
              code: `trade_ticket_${ticket.id}`,
              message: `${ticket.action === "BUY" ? "Oportunidad crítica" : "Riesgo crítico"} ${ticket.action} ${ticket.ticker}: ${ticket.rationale || ticket.execution_note || "revisar y confirmar manualmente."}`,
            })),
            { source: "execution-assistant" }
          ).catch(() => {});

          for (const ticket of alertCandidates) {
            await markExecutionTicketAlertSent(userId, Number(ticket.id));
          }
        }
      }
    }

    const openTickets = userId != null
      ? await getExecutionTradeTickets(userId, ["pending_confirmation", "confirmed"], 20)
      : [];

    const dataQualityWarnings = [];
    if (ccl._stale) dataQualityWarnings.push("CCL: usando datos en caché (no en tiempo real).");
    if (analysis?._price_data_warning) dataQualityWarnings.push(analysis._price_data_warning);
    if (analysis?._data_freshness_warning) dataQualityWarnings.push(analysis._data_freshness_warning);

    res.json({
      analysis,
      diversification,
      warnings,
      ccl,
      riesgoPais: riesgoPais || undefined,
      investmentReadiness,
      dataQualityWarnings: dataQualityWarnings.length > 0 ? dataQualityWarnings : undefined,
      timestamp: new Date().toISOString(),
      selfCheck: {
        ok: selfCheck.ok,
        skipped: selfCheck.skipped,
        reason: selfCheck.reason || null,
        failedChecks: selfCheck.failedChecks || [],
        ranAt: selfCheck.ranAt,
      },
      tradeTickets: openTickets,
      executionAssistant: buildExecutionAssistantPayload(executionAssistantSettings, openTickets),
    });
  } catch (err) {
    sendInternalError(res, "ai.analyze", err);
  }
});

router.get("/analyze/:ticker", async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(400).json({ error: "ANTHROPIC_API_KEY no configurada" });
    }

    const ticker = req.params.ticker.toUpperCase();
    const cedear = CEDEARS.find((c) => c.ticker === ticker);
    if (!cedear) {
      return res.status(404).json({ error: `CEDEAR ${ticker} no encontrado` });
    }

    const ccl = await fetchCCL();
    const data = await fetchFullData(ticker);
    const tech = technicalAnalysis(data.history);
    const fund = fundamentalAnalysis(data.financials, data.quote, cedear.sector, tech?.indicators);
    const profileId = req.query.profile || RANKING_CONFIG.defaultProfile;
    const scores = compositeScore(tech, fund, data.quote, cedear.sector, profileId);

    const portfolioSummary = await getPortfolioSummary();
    const currentPosition = portfolioSummary.find((p) => p.ticker === ticker);
    const portfolioContext = currentPosition
      ? `\nCONTEXTO DE CARTERA: El inversor YA TIENE ${currentPosition.total_shares} CEDEARs de ${ticker}, comprados a un promedio de $${currentPosition.weighted_avg_price} ARS.`
      : `\nCONTEXTO DE CARTERA: El inversor NO tiene ${ticker} en su cartera.`;

    const aiResult = await analyzeSingle({
      ticker: cedear.ticker,
      name: cedear.name,
      sector: cedear.sector,
      scores: { ...scores, ratio: cedear.ratio },
      technical: tech,
      fundamentals: fund,
      quote: data.quote,
      ccl,
      portfolioContext,
    });

    res.json({ ticker, aiAnalysis: aiResult, scores, ccl });
  } catch (err) {
    sendInternalError(res, `ai.analyzeSingle.${req.params.ticker}`, err);
  }
});

router.get("/usage", async (req, res) => {
  const { getAiUsageReport } = await import("../aiUsage.js");
  try {
    res.json(await getAiUsageReport(parseInt(req.query.days) || 30));
  } catch (err) {
    sendInternalError(res, "ai.usage", err);
  }
});

export default router;
