// ============================================================
// MARKET DATA SERVICE
// Fetches real financial data from Yahoo Finance & Dolar API
// ============================================================

import YahooFinance from "yahoo-finance2";
import NodeCache from "node-cache";

const cache = new NodeCache({ stdTTL: parseInt(process.env.CACHE_TTL || "300") });

// yahoo-finance2 v3 exports a class
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Simple delay helper for rate limiting
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Fetch CCL exchange rate ---
export async function fetchCCL() {
  const cached = cache.get("ccl");
  if (cached) return cached;

  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/contadoconliqui");
    const data = await res.json();
    const ccl = { compra: data.compra, venta: data.venta, fecha: data.fechaActualizacion };
    cache.set("ccl", ccl);
    return ccl;
  } catch (err) {
    console.error("Error fetching CCL:", err.message);
    // Fallback to a reasonable estimate if API fails
    return { compra: 1200, venta: 1220, fecha: new Date().toISOString() };
  }
}

// --- Fetch full quote for a single ticker ---
export async function fetchQuote(ticker) {
  const cacheKey = `quote_${ticker}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const quote = await yahooFinance.quote(ticker);
    const result = {
      ticker,
      price: quote.regularMarketPrice,
      previousClose: quote.regularMarketPreviousClose,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      dayHigh: quote.regularMarketDayHigh,
      dayLow: quote.regularMarketDayLow,
      volume: quote.regularMarketVolume,
      avgVolume: quote.averageDailyVolume3Month,
      marketCap: quote.marketCap,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      trailingPE: quote.trailingPE || null,
      forwardPE: quote.forwardPE || null,
      epsTrailingTwelveMonths: quote.epsTrailingTwelveMonths || null,
      dividendYield: quote.dividendYield || 0,
      beta: quote.beta || null,
      shortName: quote.shortName,
      currency: quote.currency,
      exchange: quote.exchange,
    };
    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`Error fetching quote for ${ticker}:`, err.message);
    return null;
  }
}

// --- Fetch historical prices ---
export async function fetchHistory(ticker, months = 6) {
  const cacheKey = `history_${ticker}_${months}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const result = await yahooFinance.chart(ticker, {
      period1: startDate.toISOString().split("T")[0],
      period2: endDate.toISOString().split("T")[0],
      interval: "1d",
    });

    const prices = result.quotes
      .filter((q) => q.close !== null)
      .map((q) => ({
        date: new Date(q.date).toISOString().split("T")[0],
        open: Math.round(q.open * 100) / 100,
        high: Math.round(q.high * 100) / 100,
        low: Math.round(q.low * 100) / 100,
        close: Math.round(q.close * 100) / 100,
        volume: q.volume,
      }));

    cache.set(cacheKey, prices);
    return prices;
  } catch (err) {
    console.error(`Error fetching history for ${ticker}:`, err.message);
    return [];
  }
}

// --- Fetch key financial stats ---
export async function fetchFinancials(ticker) {
  const cacheKey = `financials_${ticker}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const [summary, stats] = await Promise.all([
      yahooFinance.quoteSummary(ticker, {
        modules: ["defaultKeyStatistics", "financialData", "earningsTrend"],
      }).catch(() => ({})),
      yahooFinance.quoteSummary(ticker, {
        modules: ["incomeStatementHistory"],
      }).catch(() => ({})),
    ]);

    const keyStats = summary?.defaultKeyStatistics || {};
    const financial = summary?.financialData || {};
    const earningsTrend = summary?.earningsTrend?.trend || [];

    // Calculate EPS growth from earnings trend
    const currentEps = earningsTrend.find((t) => t.period === "0y");
    const nextEps = earningsTrend.find((t) => t.period === "+1y");
    let epsGrowth = null;
    if (currentEps?.growth) {
      epsGrowth = Math.round(currentEps.growth * 10000) / 100;
    }

    const result = {
      ticker,
      pe: keyStats.trailingPE || keyStats.forwardPE || null,
      forwardPE: keyStats.forwardPE || null,
      pegRatio: keyStats.pegRatio || null,
      priceToBook: keyStats.priceToBook || null,
      priceToSales: keyStats.priceToSalesTrailing12Months || null,
      epsGrowth,
      revenueGrowth: financial.revenueGrowth ? Math.round(financial.revenueGrowth * 10000) / 100 : null,
      profitMargin: financial.profitMargins ? Math.round(financial.profitMargins * 10000) / 100 : null,
      operatingMargin: financial.operatingMargins ? Math.round(financial.operatingMargins * 10000) / 100 : null,
      returnOnEquity: financial.returnOnEquity ? Math.round(financial.returnOnEquity * 10000) / 100 : null,
      debtToEquity: financial.debtToEquity || null,
      currentRatio: financial.currentRatio || null,
      freeCashflow: financial.freeCashflow || null,
      targetMeanPrice: financial.targetMeanPrice || null,
      recommendationMean: financial.recommendationMean || null,
      recommendationKey: financial.recommendationKey || null,
      numberOfAnalystOpinions: financial.numberOfAnalystOpinions || null,
    };

    cache.set(cacheKey, result, 3600); // Cache financials for 1 hour
    return result;
  } catch (err) {
    console.error(`Error fetching financials for ${ticker}:`, err.message);
    return { ticker };
  }
}

// --- Batch fetch quotes using quoteCombine (efficient, batches into 1-2 API calls) ---
export async function fetchAllQuotes(tickers) {
  const results = await Promise.allSettled(
    tickers.map((t) => {
      const cacheKey = `quote_${t}`;
      const cached = cache.get(cacheKey);
      if (cached) return Promise.resolve(cached);
      return yahooFinance.quoteCombine(t).then((q) => {
        const result = {
          ticker: t,
          price: q.regularMarketPrice,
          previousClose: q.regularMarketPreviousClose,
          change: q.regularMarketChange,
          changePercent: q.regularMarketChangePercent,
          dayHigh: q.regularMarketDayHigh,
          dayLow: q.regularMarketDayLow,
          volume: q.regularMarketVolume,
          avgVolume: q.averageDailyVolume3Month,
          marketCap: q.marketCap,
          fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: q.fiftyTwoWeekLow,
          trailingPE: q.trailingPE || null,
          forwardPE: q.forwardPE || null,
          epsTrailingTwelveMonths: q.epsTrailingTwelveMonths || null,
          dividendYield: q.dividendYield || 0,
          beta: q.beta || null,
          shortName: q.shortName,
          currency: q.currency,
          exchange: q.exchange,
        };
        cache.set(cacheKey, result);
        return result;
      });
    })
  );
  return Object.fromEntries(
    results
      .map((r, i) => [tickers[i], r.status === "fulfilled" ? r.value : null])
  );
}

// --- Batch fetch BYMA CEDEAR prices (real ARS prices from Buenos Aires exchange) ---
export async function fetchBymaPrices(tickers) {
  const cacheKey = "byma_prices";
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const baTickers = tickers.map((t) => `${t}.BA`);
  const results = await Promise.allSettled(
    baTickers.map((t) => yahooFinance.quoteCombine(t))
  );
  const priceMap = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) {
      priceMap[tickers[i]] = {
        priceARS: r.value.regularMarketPrice,
        change: r.value.regularMarketChange,
        changePercent: r.value.regularMarketChangePercent,
        volume: r.value.regularMarketVolume,
        previousClose: r.value.regularMarketPreviousClose,
      };
    }
  });
  cache.set(cacheKey, priceMap);
  return priceMap;
}

// --- Batch fetch everything for a single ticker ---
export async function fetchFullData(ticker) {
  const [quote, history, financials] = await Promise.allSettled([
    fetchQuote(ticker),
    fetchHistory(ticker, 6).catch(() => []),
    fetchFinancials(ticker).catch(() => ({ ticker })),
  ]);
  return {
    quote: quote.status === "fulfilled" ? quote.value : null,
    history: history.status === "fulfilled" ? history.value : [],
    financials: financials.status === "fulfilled" ? financials.value : { ticker },
  };
}
