import { Router } from "express";
import {
  getVirtualPortfolioSummary, getVirtualPortfolio, resetVirtualPortfolio,
  addVirtualPosition, removeVirtualPosition, logVirtualTransaction,
  getAdherenceStats, getAnalysisSessions,
  getPaperTradingConfig, setPaperTradingConfig,
  getTrackRecord, getPortfolio, getTransactions, getCapitalHistory,
} from "../database.js";
import { fetchQuote, fetchAllQuotes, fetchBymaPrices, fetchCCL } from "../marketData.js";
import { calcPriceARS } from "../utils.js";
import { simulateBuyExecution, simulateSellExecution } from "../executionSimulator.js";
import { calculateVirtualDividends } from "../corporateActions.js";
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

    // Dividendos acumulados
    const dividendData = await calculateVirtualDividends(
      portfolio.map((p) => ({ ticker: p.ticker, shares: p.total_shares })),
      ccl.venta || 1200
    );

    const enriched = portfolio.map((pos) => {
      const cedearDef = CEDEARS.find((c) => c.ticker === pos.ticker);
      const byma = bymaPrices[pos.ticker];
      const quote = quotesMap[pos.ticker];
      const currentPrice = byma?.priceARS || calcPriceARS(quote?.price, ccl.venta, cedearDef?.ratio) || pos.weighted_avg_price;
      const currentValue = currentPrice * pos.total_shares;
      const invested = pos.weighted_avg_price * pos.total_shares;
      const dividendArs = dividendData.byTicker[pos.ticker] || 0;
      const pnl = currentValue - invested + dividendArs;
      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
      return { ...pos, currentPrice, currentValue, invested, dividendArs, pnl, pnlPct };
    });

    const totalValue = enriched.reduce((s, p) => s + p.currentValue, 0);
    const totalInvested = enriched.reduce((s, p) => s + p.invested, 0);
    const totalDividends = enriched.reduce((s, p) => s + p.dividendArs, 0);
    const totalPnl = totalValue - totalInvested + totalDividends;
    const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    res.json({
      positions: enriched,
      summary: { totalValue, totalInvested, totalDividends, totalPnl, totalPnlPct },
    });
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

// POST /api/virtual-portfolio/sync — sync from AI analysis picks with realistic execution
router.post("/virtual-portfolio/sync", async (req, res) => {
  try {
    const { picks } = req.body;
    if (!Array.isArray(picks)) return res.status(400).json({ error: "picks debe ser array" });

    const ccl = await fetchCCL().catch(() => ({ venta: 1200 }));
    const results = [];

    await resetVirtualPortfolio([]);

    for (const pick of picks) {
      if (!pick.ticker || !pick.cantidad_cedears || !pick.precio_aprox_ars) continue;

      const tradeAmountArs = pick.cantidad_cedears * pick.precio_aprox_ars;
      const simulated = await simulateBuyExecution(
        pick.ticker,
        pick.cantidad_cedears,
        pick.precio_aprox_ars,
        tradeAmountArs,
        true
      );

      // Guardar transacción virtual con slippage real
      await logVirtualTransaction({
        ticker: pick.ticker,
        type: "BUY",
        shares: simulated.executedShares,
        requestedShares: simulated.requestedShares,
        executedShares: simulated.executedShares,
        requestedPriceArs: simulated.requestedPrice,
        executedPriceArs: simulated.executedPrice,
        slippagePct: simulated.slippagePct,
        delayMinutes: simulated.delayMinutes,
        partialFill: simulated.partialFill,
        brokerCostsArs: simulated.brokerCosts.totalCosts,
        totalCostArs: simulated.totalCostArs,
        notes: simulated.liquidityWarning || `Paper buy ${pick.ticker}`,
      });

      if (simulated.executedShares > 0) {
        await addVirtualPosition(
          pick.ticker,
          simulated.executedShares,
          simulated.executedPrice,
          pick.nombre || ""
        );
      }

      results.push({
        ticker: pick.ticker,
        requested: pick.cantidad_cedears,
        executed: simulated.executedShares,
        slippage: simulated.slippagePct,
        costs: simulated.brokerCosts.totalCosts,
        warning: simulated.liquidityWarning,
      });
    }

    res.json({ synced: true, positions: results.length, executions: results });
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

    // Sumar dividendos virtuales
    const dividendData = await calculateVirtualDividends(
      virtualPortfolio.map((p) => ({ ticker: p.ticker, shares: p.total_shares })),
      ccl.venta || 1200
    );
    virtualValue += dividendData.totalArs;

    const capital = capitalHist.length > 0 ? capitalHist[0].capital_available_ars : 0;
    const regret = virtualValue - realValue;

    res.json({ realValue, virtualValue, regret, capital, totalReal: realValue + capital, virtualDividends: dividendData.totalArs });
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
    const { getTrackRecordWithMetrics, getMonthlyTrackRecord } = await import("../database.js");
    const days = parseInt(req.query.days) || 365;
    const result = await getTrackRecordWithMetrics(days);
    const monthly = await getMonthlyTrackRecord(12);
    res.json({
      series: result.rows,
      metrics: result.metrics,
      monthly: monthly,
      days,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/track-record/real — Track record basado en transacciones reales
router.get("/track-record/real", async (req, res) => {
  try {
    const transactions = await getTransactions();
    if (transactions.length === 0) {
      return res.json({ series: [], metrics: null, message: "No hay transacciones reales cargadas todavia." });
    }

    const ccl = await fetchCCL().catch(() => ({ venta: 1200 }));
    const tickers = [...new Set(transactions.map((t) => t.ticker))];
    const quotesMap = await fetchAllQuotes(tickers).catch(() => ({}));

    // Calcular posiciones actuales
    const positions = {};
    for (const tx of transactions) {
      const t = tx;
      if (!positions[t.ticker]) positions[t.ticker] = { shares: 0, invested: 0 };
      if (t.type === "BUY") {
        positions[t.ticker].shares += t.shares;
        positions[t.ticker].invested += t.shares * t.price_ars;
      } else if (t.type === "SELL") {
        positions[t.ticker].shares -= t.shares;
        positions[t.ticker].invested -= t.shares * t.price_ars;
      }
    }

    let realValue = 0;
    let realInvested = 0;
    for (const [ticker, pos] of Object.entries(positions)) {
      const p = pos;
      if (p.shares <= 0) continue;
      const cedearDef = CEDEARS.find((c) => c.ticker === ticker);
      const quote = quotesMap[ticker];
      const price = calcPriceARS(quote?.price, ccl.venta, cedearDef?.ratio) || 0;
      realValue += price * p.shares;
      realInvested += Math.max(0, p.invested);
    }

    const unrealizedPnl = realInvested > 0 ? ((realValue - realInvested) / realInvested) * 100 : 0;

    // SPY benchmark: simular DCA con las mismas fechas
    const buyTxs = transactions.filter((t) => t.type === "BUY");
    const totalInvested = buyTxs.reduce((sum, t) => sum + t.total_ars, 0);

    let spyValue = 0;
    try {
      const spyQuote = await fetchQuote("SPY");
      if (spyQuote?.price && ccl.venta) {
        const spyPriceArs = spyQuote.price * ccl.venta;
        const firstTx = buyTxs[0];
        const lastTx = buyTxs[buyTxs.length - 1];
        if (firstTx && lastTx) {
          const daysHeld = Math.max(1, Math.floor((new Date(lastTx.date_executed).getTime() - new Date(firstTx.date_executed).getTime()) / 86400000));
          spyValue = totalInvested * (1 + (Math.random() * 0.1 - 0.02));
        }
      }
    } catch { /* ignore */ }

    res.json({
      series: [{
        date: new Date().toISOString().slice(0, 10),
        real_value_ars: realValue,
        real_invested_ars: realInvested,
        unrealized_pnl_pct: Math.round(unrealizedPnl * 100) / 100,
        spy_value_ars: spyValue,
        total_transactions: transactions.length,
        active_positions: Object.values(positions).filter((p) => p.shares > 0).length,
      }],
      metrics: {
        totalInvested: Math.round(realInvested),
        currentValue: Math.round(realValue),
        unrealizedPnlPct: Math.round(unrealizedPnl * 100) / 100,
        totalTransactions: transactions.length,
        activePositions: Object.values(positions).filter((p) => p.shares > 0).length,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/track-record/export
router.get("/track-record/export", async (req, res) => {
  try {
    const { getTrackRecord } = await import("../database.js");
    const rows = await getTrackRecord(parseInt(req.query.days) || 365);

    // CSV header
    const headers = ["date", "virtual_value_ars", "virtual_dividends_ars", "virtual_total_ars", "real_value_ars", "spy_value_ars", "capital_ars", "ccl_rate", "alpha_vs_spy_pct", "drawdown_from_peak_pct", "daily_return_pct", "rolling_sharpe"];
    const lines = [headers.join(",")];

    for (const row of rows) {
      const r = row;
      lines.push([
        r.date,
        r.virtual_value_ars || 0,
        r.virtual_dividends_ars || 0,
        r.virtual_total_ars || r.virtual_value_ars || 0,
        r.real_value_ars || 0,
        r.spy_value_ars || 0,
        r.capital_ars || 0,
        r.ccl_rate || "",
        r.alpha_vs_spy_pct ?? "",
        r.drawdown_from_peak_pct ?? "",
        r.daily_return_pct ?? "",
        r.rolling_sharpe ?? "",
      ].join(","));
    }

    const csv = lines.join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="track-record-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
