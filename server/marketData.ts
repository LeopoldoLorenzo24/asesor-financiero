/** @format */
// ============================================================
// MARKET DATA SERVICE v2
// Persistent cache + multi-provider fallback + centralized config
// ============================================================

import YahooFinance from "yahoo-finance2";
import NodeCache from "node-cache";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { fetchStooqQuote, fetchStooqHistory } from "./marketFallback.js";
import { fetchFinnhubQuote, fetchFinnhubHistory, fetchFinnhubFinancials, isFinnhubAvailable } from "./marketFinnhub.js";
import { recordCacheLookup } from "./observability.js";
import { MARKET_DATA_CONFIG, APP_CONFIG } from "./config.js";
import { sleep } from "./utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, "data", "cache");
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const cache = new NodeCache({ stdTTL: APP_CONFIG.cacheTtlSeconds });

function fileCachePath(key: string): string {
  return join(CACHE_DIR, `${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
}

function readFileCache(key: string): unknown | null {
  try {
    const p = fileCachePath(key);
    if (!existsSync(p)) return null;
    const data = JSON.parse(readFileSync(p, "utf-8")) as { _expiresAt?: number; value?: unknown };
    if (!data?._expiresAt || Date.now() > data._expiresAt) return null;
    return data.value;
  } catch {
    return null;
  }
}

async function writeFileCache(key: string, value: unknown, ttlMs: number) {
  try {
    const p = fileCachePath(key);
    await writeFile(p, JSON.stringify({ _expiresAt: Date.now() + ttlMs, value }));
  } catch (e: any) {
    console.warn("[fileCache] write failed:", e.message);
  }
}

interface ProviderState {
  yahooSuccess: number;
  yahooFailures: number;
  finnhubSuccess: number;
  finnhubFailures: number;
  fallbackSuccess: number;
  fallbackFailures: number;
  lastYahooError: string | null;
  lastFinnhubError: string | null;
  lastFallbackAt: string | null;
}

const providerState: ProviderState = {
  yahooSuccess: 0,
  yahooFailures: 0,
  finnhubSuccess: 0,
  finnhubFailures: 0,
  fallbackSuccess: 0,
  fallbackFailures: 0,
  lastYahooError: null,
  lastFinnhubError: null,
  lastFallbackAt: null,
};

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

async function withRetry<T>(fn: () => Promise<T>, { attempts = MARKET_DATA_CONFIG.maxRetries, baseMs = 800 } = {}): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || "").toLowerCase();
      if (msg.includes("no data") || msg.includes("not found") || msg.includes("invalid symbol")) {
        throw err;
      }
      if (i < attempts - 1) await sleep(baseMs * Math.pow(2, i));
    }
  }
  throw lastErr;
}

async function withTimeout<T>(promise: Promise<T>, ms = MARKET_DATA_CONFIG.requestTimeoutMs): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Request timeout")), ms)),
  ]);
}

export function getDataProviderStatus() {
  const totalYahoo = providerState.yahooSuccess + providerState.yahooFailures;
  const totalFinnhub = providerState.finnhubSuccess + providerState.finnhubFailures;
  const totalFallback = providerState.fallbackSuccess + providerState.fallbackFailures;
  return {
    yahoo: {
      success: providerState.yahooSuccess,
      failures: providerState.yahooFailures,
      failureRatePct: totalYahoo > 0 ? Math.round((providerState.yahooFailures / totalYahoo) * 10000) / 100 : 0,
      lastError: providerState.lastYahooError,
    },
    finnhub: {
      available: isFinnhubAvailable(),
      success: providerState.finnhubSuccess,
      failures: providerState.finnhubFailures,
      failureRatePct: totalFinnhub > 0 ? Math.round((providerState.finnhubFailures / totalFinnhub) * 10000) / 100 : 0,
      lastError: providerState.lastFinnhubError,
    },
    stooq: {
      success: providerState.fallbackSuccess,
      failures: providerState.fallbackFailures,
      hitRatePct: totalFallback > 0 ? Math.round((providerState.fallbackSuccess / totalFallback) * 10000) / 100 : 0,
      lastUsedAt: providerState.lastFallbackAt,
    },
    degraded: providerState.yahooFailures > providerState.yahooSuccess && providerState.fallbackSuccess > 0,
  };
}

function getCached(key: string): unknown | null {
  const mem = cache.get(key);
  if (mem) {
    recordCacheLookup(key.split("_")[0], true);
    return mem;
  }
  const file = readFileCache(key);
  if (file) {
    cache.set(key, file);
    recordCacheLookup(key.split("_")[0], true);
    return file;
  }
  recordCacheLookup(key.split("_")[0], false);
  return null;
}

async function setCached(key: string, value: unknown, ttlSeconds = APP_CONFIG.cacheTtlSeconds) {
  cache.set(key, value, ttlSeconds);
  const isHistorical = key.startsWith("history_");
  if (isHistorical) {
    await writeFileCache(key, value, 24 * 60 * 60 * 1000);
  }
}

export async function fetchCCL() {
  const key = "ccl";
  const cached = getCached(key);
  if (cached) return cached as { compra: number; venta: number; fecha: string };

  try {
    const res = await withTimeout(fetch(MARKET_DATA_CONFIG.cclApiUrl));
    if (!res.ok) throw new Error(`CCL API returned ${res.status}`);
    const data = await res.json() as { compra: number; venta: number; fechaActualizacion: string };
    const ccl = { compra: data.compra, venta: data.venta, fecha: data.fechaActualizacion };
    await setCached(key, ccl, 300);
    return ccl;
  } catch (err: any) {
    console.error("[marketData] CCL fetch failed:", err.message);
    const last = readFileCache(key) as { compra: number; venta: number; fecha: string } | null;
    if (last) {
      console.warn("[marketData] CCL fallback to stale file cache");
      return { ...last, _stale: true };
    }
    throw new Error(`CCL no disponible: ${err.message}`);
  }
}

interface YahooQuoteRaw {
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  averageDailyVolume3Month?: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  trailingPE?: number;
  forwardPE?: number;
  epsTrailingTwelveMonths?: number;
  dividendYield?: number;
  beta?: number;
  shortName?: string;
  currency?: string;
  exchange?: string;
}

export interface NormalizedQuote {
  ticker: string;
  price: number | null;
  previousClose: number | null | undefined;
  change: number | null | undefined;
  changePercent: number | null | undefined;
  dayHigh: number | null | undefined;
  dayLow: number | null | undefined;
  volume: number | null | undefined;
  avgVolume: number | null | undefined;
  marketCap: number | null | undefined;
  fiftyTwoWeekHigh: number | null | undefined;
  fiftyTwoWeekLow: number | null | undefined;
  trailingPE: number | null;
  forwardPE: number | null;
  epsTrailingTwelveMonths: number | null;
  dividendYield: number;
  beta: number | null;
  shortName: string | null | undefined;
  currency: string | null | undefined;
  exchange: string | null | undefined;
  source: string;
}

function normalizeYahooQuote(q: YahooQuoteRaw, ticker: string): NormalizedQuote {
  const price = typeof q.regularMarketPrice === "number" && q.regularMarketPrice > 0 ? q.regularMarketPrice : null;
  if (price === null) {
    console.warn(`[normalizeYahooQuote] ${ticker}: precio inválido (${q.regularMarketPrice})`);
  }
  return {
    ticker,
    price,
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
    source: "yahoo",
  };
}

export async function fetchQuote(ticker: string): Promise<NormalizedQuote | null> {
  const key = `quote_${ticker}`;
  const cached = getCached(key);
  if (cached) return cached as NormalizedQuote;

  try {
    const quote = await withRetry(() => yahooFinance.quote(ticker));
    providerState.yahooSuccess += 1;
    const result = normalizeYahooQuote(quote as YahooQuoteRaw, ticker);
    await setCached(key, result);
    return result;
  } catch (err: any) {
    providerState.yahooFailures += 1;
    providerState.lastYahooError = `${new Date().toISOString()} | ${ticker} | ${err.message}`;
    console.warn(`[marketData] Yahoo falló para ${ticker}: ${err.message}`);

    const isBATicker = /\.BA$/i.test(ticker);

    if (isFinnhubAvailable() && !isBATicker) {
      try {
        const finnhubResult = await fetchFinnhubQuote(ticker);
        if (finnhubResult?.price) {
          providerState.finnhubSuccess += 1;
          await setCached(key, finnhubResult, 300);
          return finnhubResult as NormalizedQuote;
        }
      } catch (finnhubErr: any) {
        providerState.finnhubFailures += 1;
        providerState.lastFinnhubError = `${new Date().toISOString()} | ${ticker} | ${finnhubErr.message}`;
        console.warn(`[marketData] Finnhub falló para ${ticker}: ${finnhubErr.message}`);
      }
    }

    const fallbackTicker = String(ticker || "").replace(/\.BA$/i, "");
    const stooqResult = await fetchStooqQuote(fallbackTicker).catch(() => null);
    if (stooqResult?.price) {
      providerState.fallbackSuccess += 1;
      providerState.lastFallbackAt = new Date().toISOString();
      await setCached(key, stooqResult, 300);
      return stooqResult as NormalizedQuote;
    }
    providerState.fallbackFailures += 1;
    return null;
  }
}

export interface HistoryPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | undefined;
}

export async function fetchHistory(ticker: string, months = 6): Promise<HistoryPoint[]> {
  const key = `history_${ticker}_${months}`;
  const cached = getCached(key);
  if (cached) return cached as HistoryPoint[];

  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const result = await withRetry(() =>
      yahooFinance.chart(ticker, {
        period1: startDate.toISOString().split("T")[0],
        period2: endDate.toISOString().split("T")[0],
        interval: "1d",
      })
    );

    const quotes = (result as any).quotes || [];
    const prices = quotes
      .filter((q: any) => q.close !== null)
      .map((q: any) => ({
        date: new Date(q.date).toISOString().split("T")[0],
        open: Math.round(q.open * 100) / 100,
        high: Math.round(q.high * 100) / 100,
        low: Math.round(q.low * 100) / 100,
        close: Math.round(q.close * 100) / 100,
        volume: q.volume,
      }));

    await setCached(key, prices, 86400);
    providerState.yahooSuccess += 1;
    return prices;
  } catch (err: any) {
    providerState.yahooFailures += 1;
    providerState.lastYahooError = `${new Date().toISOString()} | history:${ticker} | ${err.message}`;
    console.warn(`[marketData] Yahoo historial falló para ${ticker}: ${err.message}`);

    const isBATicker = /\.BA$/i.test(ticker);

    if (isFinnhubAvailable() && !isBATicker) {
      try {
        const finnhubHistory = await fetchFinnhubHistory(ticker, months);
        if (finnhubHistory.length > 0) {
          providerState.finnhubSuccess += 1;
          await setCached(key, finnhubHistory, 86400);
          return finnhubHistory as HistoryPoint[];
        }
      } catch (finnhubErr: any) {
        providerState.finnhubFailures += 1;
        providerState.lastFinnhubError = `${new Date().toISOString()} | history:${ticker} | ${finnhubErr.message}`;
      }
    }

    const fallbackTicker = String(ticker || "").replace(/\.BA$/i, "");
    const fallbackHistory = await fetchStooqHistory(fallbackTicker, months).catch(() => []);
    if (fallbackHistory.length > 0) {
      providerState.fallbackSuccess += 1;
      providerState.lastFallbackAt = new Date().toISOString();
      await setCached(key, fallbackHistory, 86400);
      return fallbackHistory as HistoryPoint[];
    }
    providerState.fallbackFailures += 1;
    return [];
  }
}

interface FinancialsResult {
  pe: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  epsGrowth: number | null;
  revenueGrowth: number | null;
  profitMargin: number | null;
  operatingMargin: number | null;
  returnOnEquity: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  freeCashflow: number | null;
  targetMeanPrice: number | null;
  recommendationMean: number | null;
  recommendationKey: string | null;
  numberOfAnalystOpinions: number | null;
  nextEarningsDate: string | null;
  epsRevisionDirection: string | null;
  epsEstimateGrowthQ: number | null;
  _source: string;
}

function financialsFromQuote(q: NormalizedQuote | null): FinancialsResult {
  return {
    pe: q?.trailingPE || q?.forwardPE || null,
    forwardPE: q?.forwardPE || null,
    pegRatio: null,
    priceToBook: null,
    priceToSales: null,
    epsGrowth: null,
    revenueGrowth: null,
    profitMargin: null,
    operatingMargin: null,
    returnOnEquity: null,
    debtToEquity: null,
    currentRatio: null,
    freeCashflow: null,
    targetMeanPrice: null,
    recommendationMean: null,
    recommendationKey: null,
    numberOfAnalystOpinions: null,
    nextEarningsDate: null,
    epsRevisionDirection: null,
    epsEstimateGrowthQ: null,
    _source: "quote_fallback",
  };
}

export async function fetchFinancials(ticker: string): Promise<FinancialsResult | { ticker: string }> {
  const key = `financials_${ticker}`;
  const cached = getCached(key);
  if (cached) return cached as FinancialsResult;

  try {
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: ["defaultKeyStatistics", "financialData", "earningsTrend", "calendarEvents"],
    }).catch(() => ({}));

    const keyStats = (summary as any)?.defaultKeyStatistics || {};
    const financial = (summary as any)?.financialData || {};
    const earningsTrend = (summary as any)?.earningsTrend?.trend || [];

    let nextEarningsDate: string | null = null;
    try {
      const earningsDates = (summary as any)?.calendarEvents?.earnings?.earningsDate || [];
      const now = new Date();
      const future = earningsDates
        .map((d: string) => new Date(d))
        .filter((d: Date) => d >= now)
        .sort((a: Date, b: Date) => a.getTime() - b.getTime());
      if (future.length > 0) nextEarningsDate = future[0].toISOString().split("T")[0];
    } catch { /* ignore */ }

    const currentEps = earningsTrend.find((t: any) => t.period === "0y");
    let epsGrowth: number | null = null;
    if (currentEps?.growth) epsGrowth = Math.round(currentEps.growth * 10000) / 100;

    let epsRevisionDirection: string | null = null;
    let epsEstimateGrowthQ: number | null = null;
    try {
      const qTrend = earningsTrend.find((t: any) => t.period === "0q") || earningsTrend.find((t: any) => t.period === "+1q");
      if (qTrend) {
        const ups = (qTrend.epsRevisions?.upLast30days ?? 0) + (qTrend.epsRevisions?.upLast7days ?? 0);
        const downs = (qTrend.epsRevisions?.downLast30days ?? 0) + (qTrend.epsRevisions?.downLast7days ?? 0);
        if (ups > downs) epsRevisionDirection = "up";
        else if (downs > ups) epsRevisionDirection = "down";
        else if (ups > 0 || downs > 0) epsRevisionDirection = "neutral";
        if (qTrend.epsEstimate?.growth != null) {
          epsEstimateGrowthQ = Math.round(qTrend.epsEstimate.growth * 10000) / 100;
        }
      }
    } catch { /* ignore */ }

    const pe = keyStats.trailingPE || keyStats.forwardPE || null;

    if (!pe && !financial.profitMargins && !financial.returnOnEquity && !epsGrowth) {
      console.log(`⚠ quoteSummary empty for ${ticker} — trying Finnhub fallback`);
      // Fallback 1: Finnhub basic financials
      if (isFinnhubAvailable()) {
        try {
          const finn = await fetchFinnhubFinancials(ticker);
          if (finn.pe || finn.epsGrowth || finn.revenueGrowth) {
            const result: FinancialsResult = {
              pe: finn.pe,
              forwardPE: finn.forwardPE,
              pegRatio: finn.pegRatio,
              priceToBook: finn.priceToBook,
              priceToSales: finn.priceToSales,
              epsGrowth: finn.epsGrowth,
              revenueGrowth: finn.revenueGrowth,
              profitMargin: finn.profitMargin,
              operatingMargin: finn.operatingMargin,
              returnOnEquity: finn.returnOnEquity,
              debtToEquity: finn.debtToEquity,
              currentRatio: finn.currentRatio,
              freeCashflow: finn.freeCashflow,
              targetMeanPrice: finn.targetMeanPrice,
              recommendationMean: finn.recommendationMean,
              recommendationKey: finn.recommendationKey,
              numberOfAnalystOpinions: finn.numberOfAnalystOpinions,
              nextEarningsDate: null,
              epsRevisionDirection: null,
              epsEstimateGrowthQ: null,
              _source: "finnhub_metric",
            };
            await setCached(key, result, 3600);
            return result;
          }
        } catch (finnErr: any) {
          console.warn(`[marketData] Finnhub financials falló para ${ticker}:`, finnErr.message);
        }
      }
      // Fallback 2: quote data
      const q = await fetchQuote(ticker).catch(() => null);
      const result = financialsFromQuote(q);
      await setCached(key, result, 3600);
      return result;
    }

    const result: FinancialsResult = {
      pe,
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
      nextEarningsDate,
      epsRevisionDirection,
      epsEstimateGrowthQ,
      _source: "yahoo_quoteSummary",
    };

    await setCached(key, result, 3600);
    return result;
  } catch (err: any) {
    console.error(`[marketData] Error fetching financials for ${ticker}:`, err.message);
    try {
      const q = await fetchQuote(ticker).catch(() => null);
      const result = financialsFromQuote(q);
      await setCached(key, result, 3600);
      return result;
    } catch {
      return { ticker };
    }
  }
}

export async function fetchAllQuotes(tickers: string[]): Promise<Record<string, NormalizedQuote | null>> {
  const results = await Promise.allSettled(
    tickers.map(async (t) => {
      const key = `quote_${t}`;
      const cached = getCached(key);
      if (cached) return cached as NormalizedQuote;
      const q = await yahooFinance.quoteCombine(t);
      providerState.yahooSuccess += 1;
      const result = normalizeYahooQuote(q as YahooQuoteRaw, t);
      await setCached(key, result);
      return result;
    })
  );

  const map: Record<string, NormalizedQuote | null> = {};
  for (let i = 0; i < tickers.length; i++) {
    map[tickers[i]] = results[i].status === "fulfilled" ? (results[i] as PromiseFulfilledResult<NormalizedQuote>).value : null;
  }

  const failedTickers = tickers.filter((_, i) => results[i].status !== "fulfilled");
  if (failedTickers.length > 0) {
    providerState.yahooFailures += failedTickers.length;
    providerState.lastYahooError = `${new Date().toISOString()} | batch quote failed for ${failedTickers.join(",")}`;

    const fallbackResults = await Promise.allSettled(failedTickers.map((t) => fetchStooqQuote(t)));
    for (let idx = 0; idx < fallbackResults.length; idx++) {
      const r = fallbackResults[idx];
      const ticker = failedTickers[idx];
      if (r.status === "fulfilled" && (r as PromiseFulfilledResult<any>).value?.price) {
        providerState.fallbackSuccess += 1;
        providerState.lastFallbackAt = new Date().toISOString();
        map[ticker] = (r as PromiseFulfilledResult<any>).value as NormalizedQuote;
        await setCached(`quote_${ticker}`, (r as PromiseFulfilledResult<any>).value, 300);
      } else {
        providerState.fallbackFailures += 1;
      }
    }
  }

  return map;
}

export async function fetchBymaPrices(tickers: string[]) {
  const key = "byma_prices";
  const cached = getCached(key);
  if (cached) return cached as Record<string, { priceARS: number; change: number; changePercent: number; volume: number; previousClose: number }>;

  const baTickers = tickers.map((t) => `${t}.BA`);
  const results = await Promise.allSettled(baTickers.map((t) => yahooFinance.quoteCombine(t)));

  const priceMap: Record<string, { priceARS: number; change: number; changePercent: number; volume: number; previousClose: number }> = {};
  const failedIndexes: number[] = [];

  results.forEach((r, i) => {
    if (r.status === "fulfilled" && (r as PromiseFulfilledResult<any>).value?.regularMarketPrice) {
      const q = (r as PromiseFulfilledResult<any>).value;
      priceMap[tickers[i]] = {
        priceARS: q.regularMarketPrice,
        change: q.regularMarketChange,
        changePercent: q.regularMarketChangePercent,
        volume: q.regularMarketVolume,
        previousClose: q.regularMarketPreviousClose,
      };
    } else {
      failedIndexes.push(i);
    }
  });

  if (failedIndexes.length > 0 && failedIndexes.length < tickers.length) {
    console.log(`🔄 Retrying ${failedIndexes.length} failed BYMA tickers...`);
    await sleep(1000);
    const retryResults = await Promise.allSettled(
      failedIndexes.map((i) => yahooFinance.quoteCombine(`${tickers[i]}.BA`))
    );
    retryResults.forEach((r, j) => {
      const origIdx = failedIndexes[j];
      if (r.status === "fulfilled" && (r as PromiseFulfilledResult<any>).value?.regularMarketPrice) {
        const q = (r as PromiseFulfilledResult<any>).value;
        priceMap[tickers[origIdx]] = {
          priceARS: q.regularMarketPrice,
          change: q.regularMarketChange,
          changePercent: q.regularMarketChangePercent,
          volume: q.regularMarketVolume,
          previousClose: q.regularMarketPreviousClose,
        };
      }
    });
  }

  await setCached(key, priceMap);
  return priceMap;
}

export async function fetchVIX() {
  const key = "vix";
  const cached = getCached(key);
  if (cached) return cached as { price: number; changePct: number; regime: string } | null;

  try {
    const quote = await withRetry(() => yahooFinance.quote("^VIX"));
    if (!quote || typeof (quote as any).regularMarketPrice !== "number") throw new Error("VIX quote missing price");
    const price = Math.round((quote as any).regularMarketPrice * 100) / 100;
    const result = {
      price,
      changePct: Math.round(((quote as any).regularMarketChangePercent || 0) * 100) / 100,
      regime: price >= 35 ? "crisis" : price >= 25 ? "elevated" : price >= 15 ? "normal" : "complacency",
    };
    await setCached(key, result, 3600);
    return result;
  } catch (err: any) {
    console.warn("[marketData] VIX fetch failed:", err.message);
    return null;
  }
}

export async function fetchFullData(ticker: string) {
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
