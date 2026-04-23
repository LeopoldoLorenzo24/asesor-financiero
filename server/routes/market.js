import { Router } from "express";
import {
  fetchCCL, fetchQuote, fetchHistory, fetchFinancials, fetchAllQuotes, fetchBymaPrices,
} from "../marketData.js";
import {
  technicalAnalysis, fundamentalAnalysis, compositeScore, calcRelativeStrength, calcPerformance,
} from "../analysis.js";
import { diversifiedSelection, portfolioExposure } from "../diversifier.js";
import { RANKING_CONFIG } from "../config.js";
import { calcPriceARS, chunkArray, sleep } from "../utils.js";
import CEDEARS from "../cedears.js";

const router = Router();

router.get("/ccl", async (req, res) => {
  try { res.json(await fetchCCL()); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/cedears", (req, res) => { res.json(CEDEARS); });

router.get("/ranking", async (req, res) => {
  try {
    const ccl = await fetchCCL();
    const limit = parseInt(req.query.limit) || CEDEARS.length;
    const sector = req.query.sector || null;
    const profileId = req.query.profile || RANKING_CONFIG.defaultProfile;

    let cedearsToProcess = sector ? CEDEARS.filter((c) => c.sector === sector) : CEDEARS;
    const tickers = cedearsToProcess.map((c) => c.ticker);
    const [quotesMap, bymaPrices] = await Promise.all([fetchAllQuotes(tickers), fetchBymaPrices(tickers)]);
    const spyHistoryPromise = fetchHistory("SPY.BA", RANKING_CONFIG.spyHistoryMonths).catch(() => []);

    const historyMap = {};
    const financialsMap = {};
    const batches = chunkArray(tickers, 10);
    for (const batch of batches) {
      const [histBatch, finBatch] = await Promise.all([
        Promise.allSettled(batch.map((t) => fetchHistory(`${t}.BA`, RANKING_CONFIG.historyMonths).then((h) => ({ ticker: t, history: h })))),
        Promise.allSettled(batch.map((t) => fetchFinancials(t).then((f) => ({ ticker: t, financials: f })))),
      ]);
      for (const r of histBatch) if (r.status === "fulfilled") historyMap[r.value.ticker] = r.value.history;
      for (const r of finBatch) if (r.status === "fulfilled") financialsMap[r.value.ticker] = r.value.financials;
    }

    const spyHistory = await spyHistoryPromise;
    const spyPerf = spyHistory.length >= 2 ? calcPerformance(spyHistory) : null;

    const rawResults = cedearsToProcess.map((cedear) => {
      const quote = quotesMap[cedear.ticker];
      const byma = bymaPrices[cedear.ticker];
      const history = historyMap[cedear.ticker] || [];
      const financials = financialsMap[cedear.ticker] || null;
      const tech = technicalAnalysis(history);
      const fund = fundamentalAnalysis(financials, quote);
      const tickerPerf = tech?.indicators?.performance || null;
      const rsRatio = spyPerf ? calcRelativeStrength(tickerPerf, spyPerf) : null;
      return {
        cedear, quote, technical: tech, fundamentals: fund, byma, rsRatio,
        priceARS: byma?.priceARS || calcPriceARS(quote?.price, ccl.venta, cedear.ratio),
      };
    });

    const validRatios = rawResults.map((r) => r.rsRatio).filter((v) => v != null).sort((a, b) => a - b);
    const results = rawResults.map((r) => {
      let rsRating = null;
      if (r.rsRatio != null && validRatios.length > 0) {
        const rank = validRatios.lastIndexOf(r.rsRatio);
        rsRating = Math.round(1 + (rank / Math.max(validRatios.length - 1, 1)) * 98);
      }
      const scores = compositeScore(r.technical, r.fundamentals, r.quote, r.cedear.sector, profileId, rsRating);
      return { cedear: r.cedear, quote: r.quote, technical: r.technical, fundamentals: r.fundamentals, scores, rsRating, priceARS: r.priceARS };
    });

    results.sort((a, b) => b.scores.composite - a.scores.composite);
    res.json({ ccl, timestamp: new Date().toISOString(), count: results.length, ranking: results.slice(0, limit) });
  } catch (err) {
    console.error("Ranking error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/cedear/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const cedear = CEDEARS.find((c) => c.ticker === ticker);
    if (!cedear) return res.status(404).json({ error: `CEDEAR ${ticker} no encontrado` });

    const ccl = await fetchCCL();
    const [quote, history, financials, bymaPrices] = await Promise.all([
      fetchQuote(ticker), fetchHistory(ticker, RANKING_CONFIG.detailHistoryMonths),
      fetchFinancials(ticker), fetchBymaPrices([ticker]),
    ]);
    const tech = technicalAnalysis(history);
    const fund = fundamentalAnalysis(financials, quote);
    const profileId = req.query.profile || RANKING_CONFIG.defaultProfile;
    const scores = compositeScore(tech, fund, quote, cedear.sector, profileId);
    const byma = bymaPrices[ticker];

    res.json({
      cedear, quote, history, technical: tech, fundamentals: fund, scores, ccl,
      priceARS: byma?.priceARS || calcPriceARS(quote?.price, ccl.venta, cedear.ratio),
    });
  } catch (err) {
    console.error(`Detail error for ${req.params.ticker}:`, err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/history/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const months = parseInt(req.query.months) || RANKING_CONFIG.historyMonths;
    const history = await fetchHistory(ticker, months);
    res.json({ ticker, months, count: history.length, prices: history });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/benchmarks", async (req, res) => {
  try {
    const tickers = CEDEARS.map((c) => c.ticker);
    const [quotesMap, bymaPrices, ccl] = await Promise.all([fetchAllQuotes(tickers), fetchBymaPrices(tickers), fetchCCL()]);
    const rankingForBench = CEDEARS.map((cedear) => {
      const quote = quotesMap[cedear.ticker];
      const byma = bymaPrices[cedear.ticker];
      return { cedear, quote, priceARS: byma?.priceARS || calcPriceARS(quote?.price, ccl.venta, cedear.ratio) };
    });
    const { calculateBenchmarks } = await import("../benchmarks.js");
    res.json(await calculateBenchmarks(rankingForBench));
  } catch (err) {
    console.error("Benchmarks error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/sectors", (req, res) => {
  const sectors = [...new Set(CEDEARS.map((c) => c.sector))].sort();
  res.json(sectors.map((s) => ({ sector: s, count: CEDEARS.filter((c) => c.sector === s).length })));
});

router.get("/portfolio/exposure", async (req, res) => {
  try {
    const tickers = CEDEARS.map((c) => c.ticker);
    const [quotesMap, bymaPrices, ccl] = await Promise.all([fetchAllQuotes(tickers), fetchBymaPrices(tickers), fetchCCL()]);
    res.json(await portfolioExposure(quotesMap, bymaPrices, ccl.venta));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
