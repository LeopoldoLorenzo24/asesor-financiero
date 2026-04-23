import { Router } from "express";
import { generateTradingSignals, checkTradingExit, validateTradingTrade } from "../tradingEngine.js";
import { fetchQuote } from "../marketData.js";
import { getPortfolioSummary } from "../database.js";
import CEDEARS from "../cedears.js";

const router = Router();

// GET /api/trading/signals — señales de trading intraday/swing
router.get("/signals", async (req, res) => {
  try {
    const tickers = req.query.tickers
      ? String(req.query.tickers).split(",").map((t) => t.trim().toUpperCase())
      : CEDEARS.slice(0, 15).map((c) => c.ticker); // top 15 por volumen/liquidez
    const profile = String(req.query.profile || "moderate");
    const signals = await generateTradingSignals(tickers, profile);
    res.json({ signals, generatedAt: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/trading/validate — validar trade contra reglas de riesgo
router.post("/validate", async (req, res) => {
  try {
    const { ticker, tradeAmount } = req.body;
    const summary = await getPortfolioSummary();
    const portfolioValue = summary.reduce((s, p) => s + p.weighted_avg_price * p.total_shares, 0);
    const existing = {};
    for (const p of summary) existing[p.ticker] = p.weighted_avg_price * p.total_shares;
    const result = validateTradingTrade({ ticker: String(ticker).toUpperCase(), tradeAmount: parseFloat(tradeAmount) || 0, portfolioValue, existingPositions: existing });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/trading/check-exit — verificar si una posición debe cerrarse
router.post("/check-exit", async (req, res) => {
  try {
    const { ticker, entryPrice, stopLoss, takeProfit, maxUnrealizedPnlPct = 0 } = req.body;
    const quote = await fetchQuote(String(ticker).toUpperCase()).catch(() => null);
    if (!quote?.price) return res.status(404).json({ error: "No se pudo obtener precio" });
    const position = { ticker, shares: 0, entryPrice: parseFloat(entryPrice), entryDate: "", stopLoss: parseFloat(stopLoss), takeProfit: parseFloat(takeProfit), unrealizedPnlPct: 0, maxUnrealizedPnlPct: parseFloat(maxUnrealizedPnlPct) || 0, status: "open" };
    const exit = checkTradingExit(position, quote.price);
    res.json({ ...exit, currentPrice: quote.price });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
