import { Router } from "express";
import {
  getVirtualPortfolioSummary, resetVirtualPortfolio,
  addVirtualPosition, removeVirtualPosition,
  getAdherenceStats, getAnalysisSessions,
  getPaperTradingConfig, setPaperTradingConfig,
  getTrackRecord,
} from "../database.js";
import { fetchQuote, fetchAllQuotes, fetchBymaPrices, fetchCCL } from "../marketData.js";
import { calcPriceARS } from "../utils.js";
import CEDEARS from "../cedears.js";

const router = Router();

// GET /api/virtual-portfolio — paper trading summary
router.get("/virtual-portfolio", async (req, res) => {
  try {
    const portfolio = await getVirtualPortfolioSummary();
    const ccl = await fetchCCL().catch(() => ({ venta: 0 }));
    const tickers = portfolio.map((p) => p.ticker);
    const quotesMap = await fetchAllQuotes(tickers).catch(() => ({}));
    const bymaPrices = tickers.length > 0 ? await fetchBymaPrices(tickers).catch(() => ({})) : {};

    const enriched = portfolio.map((pos) => {
      const cedearDef = CEDEARS.find((c) => c.ticker === pos.ticker);
      const byma = bymaPrices[pos.ticker];
      const quote = quotesMap[pos.ticker];
      const currentPrice = byma?.priceARS || calcPriceARS(quote?.price, ccl.venta, cedearDef?.ratio) || pos.weighted_avg_price;
      const currentValue = currentPrice * pos.total_shares;
      const invested = pos.weighted_avg_price * pos.total_shares;
      const pnl = currentValue - invested;
      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
      return { ...pos, currentPrice, currentValue, pnl, pnlPct };
    });

    const totalValue = enriched.reduce((s, p) => s + p.currentValue, 0);
    const totalInvested = enriched.reduce((s, p) => s + (p.weighted_avg_price * p.total_shares), 0);
    const totalPnl = totalValue - totalInvested;
    const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    res.json({ positions: enriched, summary: { totalValue, totalInvested, totalPnl, totalPnlPct } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/virtual-portfolio/reset — reset virtual portfolio
router.post("/virtual-portfolio/reset", async (req, res) => {
  try {
    const { positions } = req.body;
    if (!Array.isArray(positions)) return res.status(400).json({ error: "positions debe ser array" });
    const count = await resetVirtualPortfolio(positions);
    res.json({ reset: true, positions: count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/virtual-portfolio/sync — sync from AI analysis picks
router.post("/virtual-portfolio/sync", async (req, res) => {
  try {
    const { picks } = req.body;
    if (!Array.isArray(picks)) return res.status(400).json({ error: "picks debe ser array" });
    await resetVirtualPortfolio([]);
    for (const pick of picks) {
      if (pick.ticker && pick.cantidad_cedears > 0 && pick.precio_aprox_ars > 0) {
        await addVirtualPosition(pick.ticker, pick.cantidad_cedears, pick.precio_aprox_ars, pick.nombre || "");
      }
    }
    res.json({ synced: true, positions: picks.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/adherence/stats
router.get("/adherence/stats", async (req, res) => {
  try {
    res.json(await getAdherenceStats(parseInt(String(req.query.days)) || 90));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/adherence/sessions/:id
router.get("/adherence/sessions/:id", async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) return res.status(400).json({ error: "ID inválido" });
    const { getAdherenceBySession } = await import("../database.js");
    res.json(await getAdherenceBySession(sessionId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/virtual-portfolio/regret — compare virtual vs real
router.get("/virtual-portfolio/regret", async (req, res) => {
  try {
    const { getPortfolioSummary, getCapitalHistory } = await import("../database.js");
    const [realPortfolio, virtualPortfolio, capitalHist] = await Promise.all([
      getPortfolioSummary(),
      getVirtualPortfolioSummary(),
      getCapitalHistory(1),
    ]);

    const ccl = await fetchCCL().catch(() => ({ venta: 0 }));
    const tickers = [...new Set([...realPortfolio.map((p) => p.ticker), ...virtualPortfolio.map((p) => p.ticker)])];
    const quotesMap = tickers.length > 0 ? await fetchAllQuotes(tickers).catch(() => ({})) : {};

    let realValue = 0;
    for (const pos of realPortfolio) {
      const cedearDef = CEDEARS.find((c) => c.ticker === pos.ticker);
      const quote = quotesMap[pos.ticker];
      const price = calcPriceARS(quote?.price, ccl.venta, cedearDef?.ratio) || pos.weighted_avg_price;
      realValue += price * pos.total_shares;
    }

    let virtualValue = 0;
    for (const pos of virtualPortfolio) {
      const cedearDef = CEDEARS.find((c) => c.ticker === pos.ticker);
      const quote = quotesMap[pos.ticker];
      const price = calcPriceARS(quote?.price, ccl.venta, cedearDef?.ratio) || pos.weighted_avg_price;
      virtualValue += price * pos.total_shares;
    }

    const capital = capitalHist.length > 0 ? capitalHist[0].capital_available_ars : 0;
    const regret = virtualValue - realValue;

    res.json({ realValue, virtualValue, regret, capital, totalReal: realValue + capital });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/virtual-portfolio/config
router.get("/virtual-portfolio/config", async (req, res) => {
  try { res.json(await getPaperTradingConfig()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/virtual-portfolio/config
router.post("/virtual-portfolio/config", async (req, res) => {
  try {
    const { autoSyncEnabled } = req.body;
    await setPaperTradingConfig(Boolean(autoSyncEnabled));
    res.json({ success: true, autoSyncEnabled: Boolean(autoSyncEnabled) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/track-record
router.get("/track-record", async (req, res) => {
  try {
    const rows = await getTrackRecord(parseInt(req.query.days) || 365);
    res.json({ series: rows, days: parseInt(req.query.days) || 365 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
