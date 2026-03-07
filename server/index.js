// ============================================================
// CEDEAR ADVISOR - API SERVER
// Express backend with Yahoo Finance + Claude AI integration
// ============================================================

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, ".env") });
import express from "express";
import cors from "cors";
import CEDEARS from "./cedears.js";
import {
  fetchCCL,
  fetchQuote,
  fetchHistory,
  fetchFinancials,
  fetchAllQuotes,
  fetchBymaPrices,
  fetchFullData,
} from "./marketData.js";
import {
  technicalAnalysis,
  fundamentalAnalysis,
  compositeScore,
} from "./analysis.js";
import { generateAnalysis, analyzeSingle } from "./aiAdvisor.js";
import { diversifiedSelection, portfolioExposure } from "./diversifier.js";
import {
  getPortfolio, getPortfolioSummary, addPosition, sellPosition,
  getTransactions, getPredictions, evaluatePredictionsForTicker,
  calculateBotPerformance, getCapitalHistory, logCapital,
  getAnalysisSessions,
} from "./database.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json());

// Serve static frontend build (production)
const clientDist = join(__dirname, "..", "client", "dist");
import { existsSync } from "fs";
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// ---- Health check ----
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", cedears: CEDEARS.length, timestamp: new Date().toISOString() });
});

// ---- Get CCL exchange rate ----
app.get("/api/ccl", async (req, res) => {
  try {
    const ccl = await fetchCCL();
    res.json(ccl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- List all available CEDEARs ----
app.get("/api/cedears", (req, res) => {
  res.json(CEDEARS);
});

// ---- Get full ranking with scores ----
app.get("/api/ranking", async (req, res) => {
  try {
    const ccl = await fetchCCL();
    const limit = parseInt(req.query.limit) || CEDEARS.length;
    const sector = req.query.sector || null;

    let cedearsToProcess = sector
      ? CEDEARS.filter((c) => c.sector === sector)
      : CEDEARS;

    // Fetch US quotes + BYMA ARS prices in parallel (fast, ~1-2 API calls each)
    const tickers = cedearsToProcess.map((c) => c.ticker);
    const [quotesMap, bymaPrices] = await Promise.all([
      fetchAllQuotes(tickers),
      fetchBymaPrices(tickers),
    ]);

    // Fetch .BA history + financials in batches for full analysis
    const historyMap = {};
    const financialsMap = {};
    const batchSize = 10;
    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      const [histBatch, finBatch] = await Promise.all([
        Promise.allSettled(
          batch.map((t) => fetchHistory(`${t}.BA`, 6)
            .then((h) => ({ ticker: t, history: h })))
        ),
        Promise.allSettled(
          batch.map((t) => fetchFinancials(t)
            .then((f) => ({ ticker: t, financials: f })))
        ),
      ]);
      for (const r of histBatch) {
        if (r.status === "fulfilled") historyMap[r.value.ticker] = r.value.history;
      }
      for (const r of finBatch) {
        if (r.status === "fulfilled") financialsMap[r.value.ticker] = r.value.financials;
      }
    }

    const results = cedearsToProcess.map((cedear) => {
      const quote = quotesMap[cedear.ticker];
      const byma = bymaPrices[cedear.ticker];
      const history = historyMap[cedear.ticker] || [];
      const financials = financialsMap[cedear.ticker] || null;
      const tech = technicalAnalysis(history);
      const fund = fundamentalAnalysis(financials, quote);
      const scores = compositeScore(tech, fund, quote, cedear.sector);

      return {
        cedear,
        quote,
        technical: tech,
        fundamentals: fund,
        scores,
        priceARS: byma?.priceARS || (quote?.price
          ? Math.round((quote.price * ccl.venta) / cedear.ratio)
          : null),
      };
    });

    // Sort by composite score
    results.sort((a, b) => b.scores.composite - a.scores.composite);

    res.json({
      ccl,
      timestamp: new Date().toISOString(),
      count: results.length,
      ranking: results.slice(0, limit),
    });
  } catch (err) {
    console.error("Ranking error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Get detail for a single CEDEAR ----
app.get("/api/cedear/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const cedear = CEDEARS.find((c) => c.ticker === ticker);
    if (!cedear) return res.status(404).json({ error: `CEDEAR ${ticker} no encontrado` });

    const ccl = await fetchCCL();
    const [quote, history, financials, bymaPrices] = await Promise.all([
      fetchQuote(ticker),
      fetchHistory(ticker, 12), // 12 months of history for detail
      fetchFinancials(ticker),
      fetchBymaPrices([ticker]),
    ]);

    const tech = technicalAnalysis(history);
    const fund = fundamentalAnalysis(financials, quote);
    const scores = compositeScore(tech, fund, quote, cedear.sector);
    const byma = bymaPrices[ticker];

    res.json({
      cedear,
      quote,
      history,
      technical: tech,
      fundamentals: fund,
      scores,
      ccl,
      priceARS: byma?.priceARS || (quote?.price ? Math.round((quote.price * ccl.venta) / cedear.ratio) : null),
    });
  } catch (err) {
    console.error(`Detail error for ${req.params.ticker}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Get price history ----
app.get("/api/history/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const months = parseInt(req.query.months) || 6;
    const history = await fetchHistory(ticker, months);
    res.json({ ticker, months, count: history.length, prices: history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- AI Analysis endpoint ----
app.post("/api/ai/analyze", async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(400).json({ error: "ANTHROPIC_API_KEY no configurada" });
    }

    const { portfolio = [], capital = 0 } = req.body;
    const ccl = await fetchCCL();

    // Get top picks: fetch quotes first (fast), then full data for top 20
    const tickers = CEDEARS.map((c) => c.ticker);
    const quotesMap = await fetchAllQuotes(tickers);

    // Pre-rank by basic fundamentals from quotes
    const preRanked = CEDEARS.map((c) => ({
      cedear: c,
      quote: quotesMap[c.ticker],
      basicScore: fundamentalAnalysis(null, quotesMap[c.ticker]).score,
    }))
      .sort((a, b) => b.basicScore - a.basicScore)
      .slice(0, 20);

    // Full analysis only for top 20 (with delays)
    const rankedResults = [];
    for (let i = 0; i < preRanked.length; i += 3) {
      const batch = preRanked.slice(i, i + 3);
      const batchResults = await Promise.allSettled(
        batch.map(async ({ cedear, quote }) => {
          const data = await fetchFullData(cedear.ticker);
          const tech = technicalAnalysis(data.history);
          const fund = fundamentalAnalysis(data.financials, data.quote || quote);
          const scores = compositeScore(tech, fund, data.quote || quote, cedear.sector);
          return { cedear, quote: data.quote || quote, technical: tech, fundamentals: fund, scores };
        })
      );
      for (const r of batchResults) {
        if (r.status === "fulfilled" && r.value) rankedResults.push(r.value);
      }
      if (i + 3 < preRanked.length) await new Promise((r) => setTimeout(r, 500));
    }

    rankedResults.sort((a, b) => b.scores.composite - a.scores.composite);

    // Algorithmic diversification: pre-filter before AI
    const portfolioPositions = getPortfolioSummary();
    const { picks: topPicks, diversification, warnings } = diversifiedSelection(rankedResults, portfolioPositions);

    console.log(`🎯 Diversifier: ${topPicks.length} picks across ${diversification.sectorsRepresented} sectors`);
    if (warnings.length) console.log(`⚠️ Warnings: ${warnings.join(' | ')}`);

    const analysis = await generateAnalysis({ topPicks, portfolio, capital, ccl, diversification, warnings, ranking: rankedResults });
    res.json({ analysis, diversification, warnings, ccl, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("AI analyze error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---- AI Single CEDEAR analysis ----
app.get("/api/ai/analyze/:ticker", async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(400).json({ error: "ANTHROPIC_API_KEY no configurada" });
    }

    const ticker = req.params.ticker.toUpperCase();
    const cedear = CEDEARS.find((c) => c.ticker === ticker);
    if (!cedear) return res.status(404).json({ error: `CEDEAR ${ticker} no encontrado` });

    const ccl = await fetchCCL();
    const data = await fetchFullData(ticker);
    const tech = technicalAnalysis(data.history);
    const fund = fundamentalAnalysis(data.financials, data.quote);
    const scores = compositeScore(tech, fund, data.quote, cedear.sector);

    const aiResult = await analyzeSingle({
      ticker: cedear.ticker,
      name: cedear.name,
      sector: cedear.sector,
      scores: { ...scores, ratio: cedear.ratio },
      technical: tech,
      fundamentals: fund,
      quote: data.quote,
      ccl,
    });

    res.json({ ticker, aiAnalysis: aiResult, scores, ccl });
  } catch (err) {
    console.error(`AI single error for ${req.params.ticker}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Sectors list ----
app.get("/api/sectors", (req, res) => {
  const sectors = [...new Set(CEDEARS.map((c) => c.sector))].sort();
  const counts = sectors.map((s) => ({
    sector: s,
    count: CEDEARS.filter((c) => c.sector === s).length,
  }));
  res.json(counts);
});

// ---- Portfolio exposure by sector ----
app.get("/api/portfolio/exposure", (req, res) => {
  try {
    res.json(portfolioExposure());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Start server ----
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║     CEDEAR ADVISOR API - v1.0                ║
║     Running on port ${PORT}                     ║
║     CEDEARs loaded: ${CEDEARS.length}                      ║
║     AI: ${process.env.ANTHROPIC_API_KEY ? "✓ Configured" : "✗ Missing API key"}               ║
╚══════════════════════════════════════════════╝
  `);
});

// ============================================================
// DATABASE-BACKED ROUTES (Portfolio, Predictions, Performance)
// ============================================================

// ---- Portfolio CRUD ----
app.get("/api/portfolio/db", (req, res) => {
  try {
    const summary = getPortfolioSummary();
    const positions = getPortfolio();
    res.json({ summary, positions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/portfolio/buy", async (req, res) => {
  try {
    const { ticker, shares, priceArs, notes } = req.body;
    if (!ticker || !shares || !priceArs) return res.status(400).json({ error: "Faltan campos" });
    const ccl = await fetchCCL();
    const quote = await fetchQuote(ticker).catch(() => null);
    addPosition(ticker.toUpperCase(), shares, priceArs, quote?.price || null, ccl.venta, notes || "");
    res.json({ success: true, message: `Compra: ${shares} ${ticker} a $${priceArs}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/portfolio/sell", async (req, res) => {
  try {
    const { ticker, shares, priceArs, notes } = req.body;
    if (!ticker || !shares || !priceArs) return res.status(400).json({ error: "Faltan campos" });
    const ccl = await fetchCCL();
    const quote = await fetchQuote(ticker).catch(() => null);
    sellPosition(ticker.toUpperCase(), shares, priceArs, quote?.price || null, ccl.venta, notes || "");
    res.json({ success: true, message: `Venta: ${shares} ${ticker} a $${priceArs}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- Transactions ----
app.get("/api/transactions", (req, res) => {
  try { res.json(getTransactions(req.query.ticker || null, parseInt(req.query.limit) || 50)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- Predictions ----
app.get("/api/predictions", (req, res) => {
  try { res.json(getPredictions(req.query.ticker || null, req.query.unevaluated === "true", parseInt(req.query.limit) || 100)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/predictions/evaluate", async (req, res) => {
  try {
    const { ticker } = req.body;
    if (!ticker) return res.status(400).json({ error: "Falta ticker" });
    const quote = await fetchQuote(ticker.toUpperCase());
    if (!quote) return res.status(404).json({ error: "No se pudo obtener precio" });
    const results = evaluatePredictionsForTicker(ticker.toUpperCase(), quote.price);
    res.json({ ticker, currentPriceUsd: quote.price, evaluated: results.length, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/predictions/evaluate-all", async (req, res) => {
  try {
    const pending = getPredictions(null, true);
    const tickers = [...new Set(pending.map((p) => p.ticker))];
    const allResults = [];
    for (const t of tickers) {
      try {
        const q = await fetchQuote(t);
        if (q) allResults.push(...evaluatePredictionsForTicker(t, q.price));
      } catch (e) { console.error(`Eval error ${t}:`, e.message); }
    }
    res.json({ tickersProcessed: tickers.length, totalEvaluated: allResults.length, results: allResults });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- Bot Performance ----
app.get("/api/performance", (req, res) => {
  try { res.json(calculateBotPerformance(parseInt(req.query.days) || 30)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- Analysis sessions ----
app.get("/api/analysis-sessions", (req, res) => {
  try {
    const sessions = getAnalysisSessions(parseInt(req.query.limit) || 20);
    res.json(sessions.map((s) => ({ ...s, risks: s.risks ? JSON.parse(s.risks) : [], full_response: s.full_response ? JSON.parse(s.full_response) : null })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- Capital tracking ----
app.get("/api/capital", (req, res) => {
  try { res.json(getCapitalHistory(parseInt(req.query.limit) || 90)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/capital", async (req, res) => {
  try {
    const { capitalArs, portfolioValueArs, monthlyDeposit } = req.body;
    if (capitalArs == null) return res.status(400).json({ error: "Falta capitalArs" });
    const ccl = await fetchCCL();
    logCapital(capitalArs, portfolioValueArs || 0, ccl.venta, monthlyDeposit || 1000000);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// SPA fallback - serve index.html for non-API routes (production)
if (existsSync(clientDist)) {
  app.get("*", (req, res) => {
    res.sendFile(join(clientDist, "index.html"));
  });
}
