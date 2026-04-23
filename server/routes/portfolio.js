import { Router } from "express";
import {
  getPortfolio, getPortfolioSummary, addPosition, sellPosition, syncPortfolio, resetPortfolio, deletePosition,
  getTransactions,
} from "../database.js";
import { fetchCCL, fetchQuote } from "../marketData.js";
import { checkTradeRisk } from "../riskManager.js";
import { toFiniteNumber } from "../utils.js";
import CEDEARS from "../cedears.js";

const router = Router();

function validatePositiveNumber(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return { valid: false, error: `${name} debe ser un número positivo` };
  return { valid: true, value: n };
}

router.get("/db", async (req, res) => {
  try { res.json({ summary: await getPortfolioSummary(), positions: await getPortfolio() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/buy", async (req, res) => {
  try {
    const { ticker, shares: sharesRaw, priceArs: priceRaw, notes } = req.body;
    if (!ticker || sharesRaw == null || priceRaw == null) return res.status(400).json({ error: "Faltan campos" });

    const sharesCheck = validatePositiveNumber(sharesRaw, "shares");
    const priceCheck = validatePositiveNumber(priceRaw, "priceArs");
    if (!sharesCheck.valid) return res.status(400).json({ error: sharesCheck.error });
    if (!priceCheck.valid) return res.status(400).json({ error: priceCheck.error });
    const shares = sharesCheck.value;
    const priceArs = priceCheck.value;

    const upperTicker = ticker.toUpperCase();
    if (!CEDEARS.find((c) => c.ticker === upperTicker)) return res.status(400).json({ error: `Ticker ${upperTicker} no existe` });
    const ccl = await fetchCCL();
    const quote = await fetchQuote(upperTicker).catch(() => null);

    const portfolioSummary = await getPortfolioSummary();
    const cedearInfo = CEDEARS.find((c) => c.ticker === upperTicker);
    const tradeAmount = shares * priceArs;
    const existingTicker = portfolioSummary.find((p) => p.ticker === upperTicker);
    const existingSector = portfolioSummary.filter((p) => {
      const def = CEDEARS.find((c) => c.ticker === p.ticker);
      return def?.sector === cedearInfo?.sector;
    }).reduce((s, p) => s + p.total_shares * p.weighted_avg_price, 0);

    const portfolioValue = portfolioSummary.reduce((s, p) => s + p.total_shares * p.weighted_avg_price, 0) + tradeAmount;
    const riskCheck = checkTradeRisk({ profileId: req.body.profile || "moderate", portfolioValueArs: portfolioValue, tickerValueArs: (existingTicker?.total_shares || 0) * (existingTicker?.weighted_avg_price || 0) + tradeAmount, sectorValueArs: existingSector + tradeAmount, tradeAmountArs: tradeAmount, sector: cedearInfo?.sector });

    await addPosition(upperTicker, shares, priceArs, quote?.price || null, ccl.venta, notes || "");
    res.json({ success: true, message: `Compra: ${shares} ${upperTicker} a $${priceArs}`, riskWarnings: riskCheck.warnings });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/sell", async (req, res) => {
  try {
    const { ticker, shares: sharesRaw, priceArs: priceRaw, notes } = req.body;
    if (!ticker || sharesRaw == null || priceRaw == null) return res.status(400).json({ error: "Faltan campos" });

    const sharesCheck = validatePositiveNumber(sharesRaw, "shares");
    const priceCheck = validatePositiveNumber(priceRaw, "priceArs");
    if (!sharesCheck.valid) return res.status(400).json({ error: sharesCheck.error });
    if (!priceCheck.valid) return res.status(400).json({ error: priceCheck.error });
    const shares = sharesCheck.value;
    const priceArs = priceCheck.value;

    const ccl = await fetchCCL();
    const quote = await fetchQuote(ticker.toUpperCase()).catch(() => null);
    await sellPosition(ticker.toUpperCase(), shares, priceArs, quote?.price || null, ccl.venta, notes || "");
    res.json({ success: true, message: `Venta: ${shares} ${ticker} a $${priceArs}` });
  } catch (err) {
    const isValidation = err.message.startsWith("No tenés");
    res.status(isValidation ? 400 : 500).json({ error: err.message });
  }
});

router.post("/sync", async (req, res) => {
  try {
    const { positions } = req.body;
    if (!Array.isArray(positions) || positions.length === 0) return res.status(400).json({ error: "positions debe ser un array no vacío" });
    for (const p of positions) {
      if (!p.ticker || p.shares == null || p.priceArs == null) return res.status(400).json({ error: "Cada posición necesita ticker, shares y priceArs" });
      const s = Number(p.shares);
      const pr = Number(p.priceArs);
      if (!Number.isFinite(s) || s < 0) return res.status(400).json({ error: `shares inválido en ${p.ticker}` });
      if (!Number.isFinite(pr) || pr < 0) return res.status(400).json({ error: `priceArs inválido en ${p.ticker}` });
    }
    const created = await syncPortfolio(positions);
    res.json({ success: true, created, count: created.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/reset", async (req, res) => {
  try {
    const { positions } = req.body;
    if (!Array.isArray(positions) || positions.length === 0) return res.status(400).json({ error: "positions debe ser un array no vacío" });
    for (const p of positions) {
      if (!p.ticker || p.shares == null || p.priceArs == null) return res.status(400).json({ error: "Cada posición necesita ticker, shares y priceArs" });
      const s = Number(p.shares);
      const pr = Number(p.priceArs);
      if (!Number.isFinite(s) || s <= 0) return res.status(400).json({ error: `shares de ${p.ticker} debe ser mayor a 0` });
      if (!Number.isFinite(pr) || pr < 0) return res.status(400).json({ error: `priceArs inválido en ${p.ticker}` });
    }
    const count = await resetPortfolio(positions);
    res.json({ success: true, count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/:ticker", async (req, res) => {
  try { await deletePosition(req.params.ticker.toUpperCase()); res.json({ success: true, message: `Posición ${req.params.ticker.toUpperCase()} eliminada` }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/transactions", async (req, res) => {
  try { res.json(await getTransactions(req.query.ticker || null, parseInt(req.query.limit) || 50)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
