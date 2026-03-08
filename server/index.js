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
import { canRegister, register, login, authMiddleware } from "./auth.js";
import { calculateBenchmarks } from "./benchmarks.js";
import { runBacktest } from "./backtest.js";
import {
  initDb,
  getPortfolio, getPortfolioSummary, addPosition, sellPosition,
  getTransactions, getPredictions, getPredictionById, evaluatePredictionsForTicker,
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

// ---- Auth routes (public) ----
app.get("/api/auth/status", async (req, res) => {
  res.json({ canRegister: await canRegister() });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const token = await register(email, password);
    res.json({ token, email });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const token = await login(email, password);
    res.json({ token, email });
  } catch (err) { res.status(401).json({ error: err.message }); }
});

// Protect all /api/ routes except /api/auth/*
app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth")) return next();
  authMiddleware(req, res, next);
});

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
    const profileId = req.query.profile || "moderate";

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
      const scores = compositeScore(tech, fund, quote, cedear.sector, profileId);

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
    const profileId = req.query.profile || "moderate";
    const scores = compositeScore(tech, fund, quote, cedear.sector, profileId);
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

    const { portfolio = [], capital = 0, profile: profileId = "moderate" } = req.body;
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
    const portfolioPositions = await getPortfolioSummary();
    const { picks: topPicks, diversification, warnings } = diversifiedSelection(rankedResults, portfolioPositions, profileId);

    console.log(`🎯 Diversifier: ${topPicks.length} picks across ${diversification.sectorsRepresented} sectors`);
    if (warnings.length) console.log(`⚠️ Warnings: ${warnings.join(' | ')}`);

    const analysis = await generateAnalysis({ topPicks, portfolio, capital, ccl, diversification, warnings, ranking: rankedResults, profileId });
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

// ---- Benchmarks ----
app.get("/api/benchmarks", async (req, res) => {
  try {
    // Get latest ranking for portfolio valuation
    const tickers = CEDEARS.map(c => c.ticker);
    const [quotesMap, bymaPrices] = await Promise.all([fetchAllQuotes(tickers), fetchBymaPrices(tickers)]);
    const ccl = await fetchCCL();
    const rankingForBench = CEDEARS.map(cedear => {
      const quote = quotesMap[cedear.ticker];
      const byma = bymaPrices[cedear.ticker];
      return { cedear, quote, priceARS: byma?.priceARS || (quote?.price ? Math.round((quote.price * ccl.venta) / cedear.ratio) : null) };
    });
    const result = await calculateBenchmarks(rankingForBench);
    res.json(result);
  } catch (err) {
    console.error("Benchmarks error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Backtest ----
app.get("/api/backtest", async (req, res) => {
  try {
    const months = Math.min(12, Math.max(1, parseInt(req.query.months) || 6));
    const monthlyDeposit = parseInt(req.query.deposit) || 1000000;
    const profile = req.query.profile || "moderate";
    const picksPerMonth = Math.min(8, Math.max(2, parseInt(req.query.picks) || 4));
    const result = await runBacktest({ months, monthlyDeposit, profile, picksPerMonth });
    res.json(result);
  } catch (err) {
    console.error("Backtest error:", err);
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
app.get("/api/portfolio/exposure", async (req, res) => {
  try {
    res.json(await portfolioExposure());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Auto-seed portfolio if DB is empty ----
async function seedIfEmpty() {
  const summary = await getPortfolioSummary();
  if (summary.length > 0) return;
  console.log("⚡ DB vacía — seeding portfolio inicial...");
  const PORTFOLIO = [
    { ticker: "ABBV", shares: 5, priceArs: 34830.26, notes: "Compra mes 1-2 - Healthcare defensivo" },
    { ticker: "AMZN", shares: 120, priceArs: 2197.24, notes: "Compra mes 1-2 - E-commerce/cloud growth" },
    { ticker: "COIN", shares: 9, priceArs: 11054.19, notes: "Compra mes 1-2 - Crypto exposure" },
    { ticker: "COST", shares: 5, priceArs: 30441.25, notes: "Compra mes 1-2 - Consumer defensive" },
    { ticker: "GOOGL", shares: 12, priceArs: 8128.74, notes: "Compra mes 1-2 - Big tech / AI" },
    { ticker: "MSFT", shares: 10, priceArs: 20867.96, notes: "Compra mes 1-2 - Big tech / cloud" },
    { ticker: "NVDA", shares: 13, priceArs: 11697.33, notes: "Compra mes 1-2 - AI / semiconductors" },
    { ticker: "QCOM", shares: 7, priceArs: 18381.52, notes: "Compra mes 1-2 - Semiconductors / mobile" },
    { ticker: "QQQ", shares: 2, priceArs: 45561.21, notes: "Compra mes 1-2 - ETF Nasdaq 100" },
    { ticker: "SPY", shares: 5, priceArs: 51440.07, notes: "Compra mes 1-2 - ETF S&P 500" },
    { ticker: "UNH", shares: 15, priceArs: 12985.85, notes: "Compra mes 1-2 - Healthcare" },
    { ticker: "V", shares: 7, priceArs: 26400.25, notes: "Compra mes 1-2 - Financial / pagos" },
  ];
  for (const pos of PORTFOLIO) {
    try { await addPosition(pos.ticker, pos.shares, pos.priceArs, null, null, pos.notes); } catch (e) { console.error(`Seed error ${pos.ticker}:`, e.message); }
  }
  await logCapital(35170, 1964830, null, 1000000);
  console.log(`✓ Portfolio seeded: ${PORTFOLIO.length} posiciones`);
}

// ---- Start server ----
async function startServer() {
  await initDb();
  await seedIfEmpty();
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
}
startServer();

// ============================================================
// DATABASE-BACKED ROUTES (Portfolio, Predictions, Performance)
// ============================================================

// ---- Portfolio CRUD ----
app.get("/api/portfolio/db", async (req, res) => {
  try {
    const summary = await getPortfolioSummary();
    const positions = await getPortfolio();
    res.json({ summary, positions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/portfolio/buy", async (req, res) => {
  try {
    const { ticker, shares, priceArs, notes } = req.body;
    if (!ticker || !shares || !priceArs) return res.status(400).json({ error: "Faltan campos" });
    const ccl = await fetchCCL();
    const quote = await fetchQuote(ticker).catch(() => null);
    await addPosition(ticker.toUpperCase(), shares, priceArs, quote?.price || null, ccl.venta, notes || "");
    res.json({ success: true, message: `Compra: ${shares} ${ticker} a $${priceArs}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/portfolio/sell", async (req, res) => {
  try {
    const { ticker, shares, priceArs, notes } = req.body;
    if (!ticker || !shares || !priceArs) return res.status(400).json({ error: "Faltan campos" });
    const ccl = await fetchCCL();
    const quote = await fetchQuote(ticker).catch(() => null);
    await sellPosition(ticker.toUpperCase(), shares, priceArs, quote?.price || null, ccl.venta, notes || "");
    res.json({ success: true, message: `Venta: ${shares} ${ticker} a $${priceArs}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- Transactions ----
app.get("/api/transactions", async (req, res) => {
  try { res.json(await getTransactions(req.query.ticker || null, parseInt(req.query.limit) || 50)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- Predictions ----
app.get("/api/predictions", async (req, res) => {
  try { res.json(await getPredictions(req.query.ticker || null, req.query.unevaluated === "true", parseInt(req.query.limit) || 100)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/predictions/evaluate", async (req, res) => {
  try {
    const { ticker } = req.body;
    if (!ticker) return res.status(400).json({ error: "Falta ticker" });
    const quote = await fetchQuote(ticker.toUpperCase());
    if (!quote) return res.status(404).json({ error: "No se pudo obtener precio" });
    const results = await evaluatePredictionsForTicker(ticker.toUpperCase(), quote.price);
    res.json({ ticker, currentPriceUsd: quote.price, evaluated: results.length, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/predictions/evaluate-all", async (req, res) => {
  try {
    const pending = await getPredictions(null, true);
    const tickers = [...new Set(pending.map((p) => p.ticker))];
    const allResults = [];
    for (const t of tickers) {
      try {
        const q = await fetchQuote(t);
        if (q) allResults.push(...await evaluatePredictionsForTicker(t, q.price));
      } catch (e) { console.error(`Eval error ${t}:`, e.message); }
    }
    res.json({ tickersProcessed: tickers.length, totalEvaluated: allResults.length, results: allResults });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/predictions/:id/conclude", async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(400).json({ error: "ANTHROPIC_API_KEY no configurada" });
    }
    const predictionId = parseInt(req.params.id);
    if (isNaN(predictionId)) return res.status(400).json({ error: "ID inválido" });

    const prediction = await getPredictionById(predictionId);
    if (!prediction) return res.status(404).json({ error: "Predicción no encontrada" });

    const quote = await fetchQuote(prediction.ticker);
    if (!quote) return res.status(500).json({ error: `No se pudo obtener precio de ${prediction.ticker}` });

    const currentPriceUsd = quote.price;
    const predictionPriceUsd = prediction.price_usd_at_prediction;
    const changePct = predictionPriceUsd > 0
      ? Math.round(((currentPriceUsd - predictionPriceUsd) / predictionPriceUsd) * 10000) / 100
      : null;
    const daysSince = Math.floor((Date.now() - new Date(prediction.prediction_date).getTime()) / 86400000);

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `Sos un asesor financiero que está revisando una predicción que hiciste.

PREDICCIÓN ORIGINAL:
- Fecha: ${prediction.prediction_date?.slice(0, 10)}
- Ticker: ${prediction.ticker}
- Acción recomendada: ${prediction.action}
- Confianza: ${prediction.confidence}%
- Tu razón: "${prediction.reasoning}"
- Precio USD al momento: $${predictionPriceUsd?.toFixed(2) || "N/A"}
- RSI al momento: ${prediction.rsi_at_prediction || "N/A"}
- Score al momento: ${prediction.score_composite || "N/A"}/100
- Horizonte: ${prediction.horizon || "N/A"}
- Target: ${prediction.target_pct ? `+${prediction.target_pct}%` : "N/A"}
- Stop loss: ${prediction.stop_loss_pct ? `${prediction.stop_loss_pct}%` : "N/A"}
- Contexto de noticias: "${prediction.news_context || "N/A"}"

QUÉ PASÓ EN LA REALIDAD (${daysSince} días después):
- Precio actual USD: $${currentPriceUsd.toFixed(2)}
- Cambio desde la predicción: ${changePct !== null ? `${changePct >= 0 ? "+" : ""}${changePct}%` : "N/A"}
- ${changePct !== null && prediction.target_pct ? (changePct >= prediction.target_pct ? "ALCANZÓ el target" : "NO alcanzó el target aún") : ""}
- ${changePct !== null && prediction.stop_loss_pct ? (changePct <= prediction.stop_loss_pct ? "TOCÓ el stop loss" : "No tocó stop loss") : ""}

Buscá noticias recientes de ${prediction.ticker} para entender qué pasó.

Respondé SOLO con JSON válido (sin markdown, sin backticks):
{
  "le_pegue": true/false,
  "resumen": "2-3 oraciones analizando si tu predicción fue correcta y por qué",
  "que_paso": "Qué pasó con la empresa/sector desde tu predicción (noticias, earnings, macro)",
  "que_aprendo": "1-2 oraciones sobre qué aprendés de esto para futuras predicciones",
  "accion_sugerida_ahora": "MANTENER|VENDER|AUMENTAR — qué harías HOY con esta posición",
  "confianza_actual": 70
}`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: "Sos un asesor financiero revisando tus predicciones pasadas. Sé honesto: si te equivocaste, decilo. Buscá noticias del ticker. Respondé SOLO JSON.",
      messages: [{ role: "user", content: prompt }],
    });

    const textParts = response.content.filter(b => b.type === "text").map(b => b.text);
    const clean = textParts.join("").replace(/```json|```/g, "").trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    let conclusion = null;
    if (jsonMatch) {
      try { conclusion = JSON.parse(jsonMatch[0]); } catch (e) { console.error("JSON parse error:", e.message); }
    }

    res.json({
      prediction: {
        id: prediction.id,
        ticker: prediction.ticker,
        action: prediction.action,
        confidence: prediction.confidence,
        reasoning: prediction.reasoning,
        date: prediction.prediction_date,
        priceAtPrediction: predictionPriceUsd,
      },
      actual: { currentPrice: currentPriceUsd, changePct, daysSince },
      conclusion,
    });
  } catch (err) {
    console.error("Conclusion error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Bot Performance ----
app.get("/api/performance", async (req, res) => {
  try { res.json(await calculateBotPerformance(parseInt(req.query.days) || 30)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- Analysis sessions ----
app.get("/api/analysis-sessions", async (req, res) => {
  try {
    const sessions = await getAnalysisSessions(parseInt(req.query.limit) || 20);
    res.json(sessions.map((s) => ({ ...s, risks: s.risks ? JSON.parse(s.risks) : [], full_response: s.full_response ? JSON.parse(s.full_response) : null })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- Capital tracking ----
app.get("/api/capital", async (req, res) => {
  try { res.json(await getCapitalHistory(parseInt(req.query.limit) || 90)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/capital", async (req, res) => {
  try {
    const { capitalArs, portfolioValueArs, monthlyDeposit } = req.body;
    if (capitalArs == null) return res.status(400).json({ error: "Falta capitalArs" });
    const ccl = await fetchCCL();
    await logCapital(capitalArs, portfolioValueArs || 0, ccl.venta, monthlyDeposit || 1000000);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// SPA fallback - serve index.html for non-API routes (production)
if (existsSync(clientDist)) {
  app.get("*", (req, res) => {
    res.sendFile(join(clientDist, "index.html"));
  });
}
