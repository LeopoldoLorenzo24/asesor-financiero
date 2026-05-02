// ============================================================
// FINANCIAL MODELING PREP (FMP) MARKET DATA PROVIDER
// High-quality fundamentals + quotes + history.
// Free tier: 250 req/day — enough for 226 CEDEARs + margin.
// Requires FMP_API_KEY env var (get one at financialmodelingprep.com).
//
// Used as priority fallback when Yahoo Finance fails, and as
// PRIMARY source for fundamentals (better data quality than Yahoo).
// ============================================================

const FMP_KEY = String(process.env.FMP_API_KEY || "").trim();
const BASE = "https://financialmodelingprep.com/api/v3";

export function isFMPAvailable() {
  return FMP_KEY.length > 0;
}

async function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function fmpGet(endpoint) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${BASE}${endpoint}${sep}apikey=${FMP_KEY}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`FMP ${res.status}: ${res.statusText}`);
  return res.json();
}

// ── QUOTE ──

export async function fetchFMPQuote(ticker) {
  if (!isFMPAvailable()) return null;
  try {
    const data = await fmpGet(`/quote/${encodeURIComponent(ticker)}`);
    const q = Array.isArray(data) ? data[0] : data;
    if (!q?.price) return null;

    return {
      ticker: q.symbol || ticker,
      price: q.price,
      previousClose: q.previousClose ?? null,
      change: q.change ?? null,
      changePercent: q.changesPercentage ?? null,
      dayHigh: q.dayHigh ?? null,
      dayLow: q.dayLow ?? null,
      volume: q.volume ?? null,
      avgVolume: q.avgVolume ?? null,
      marketCap: q.marketCap ?? null,
      fiftyTwoWeekHigh: q.yearHigh ?? null,
      fiftyTwoWeekLow: q.yearLow ?? null,
      trailingPE: q.pe ?? null,
      forwardPE: null,
      epsTrailingTwelveMonths: q.eps ?? null,
      dividendYield: q.lastDiv ? (q.lastDiv / q.price) : null,
      beta: null,
      shortName: q.name || ticker,
      currency: "USD",
      exchange: q.exchange || "US",
      source: "fmp",
      _source: "fmp",
    };
  } catch (err) {
    console.warn(`[FMP] Quote failed for ${ticker}:`, err.message);
    return null;
  }
}

// ── HISTORY ──

export async function fetchFMPHistory(ticker, months = 6) {
  if (!isFMPAvailable()) return [];
  try {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    const from = startDate.toISOString().split("T")[0];
    const to = new Date().toISOString().split("T")[0];

    const data = await fmpGet(`/historical-price-full/${encodeURIComponent(ticker)}?from=${from}&to=${to}`);
    const historicals = data?.historical || [];
    if (!historicals.length) return [];

    return historicals
      .map(h => ({
        date: h.date,
        open: Math.round(h.open * 100) / 100,
        high: Math.round(h.high * 100) / 100,
        low: Math.round(h.low * 100) / 100,
        close: Math.round(h.close * 100) / 100,
        volume: h.volume,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)); // chronological
  } catch (err) {
    console.warn(`[FMP] History failed for ${ticker}:`, err.message);
    return [];
  }
}

// ── FINANCIALS (the main value of FMP) ──

export async function fetchFMPFinancials(ticker) {
  if (!isFMPAvailable()) return null;
  try {
    // Fetch multiple endpoints in parallel for comprehensive data
    const [profileArr, ratiosArr, analystArr, earningsArr] = await Promise.all([
      fmpGet(`/profile/${encodeURIComponent(ticker)}`).catch(() => []),
      fmpGet(`/ratios-ttm/${encodeURIComponent(ticker)}`).catch(() => []),
      fmpGet(`/analyst-estimates/${encodeURIComponent(ticker)}?limit=1`).catch(() => []),
      fmpGet(`/earnings-surprises/${encodeURIComponent(ticker)}?limit=4`).catch(() => []),
    ]);

    const profile = Array.isArray(profileArr) ? profileArr[0] : profileArr;
    const ratios = Array.isArray(ratiosArr) ? ratiosArr[0] : ratiosArr;
    const analyst = Array.isArray(analystArr) ? analystArr[0] : null;
    const earnings = Array.isArray(earningsArr) ? earningsArr : [];

    if (!profile && !ratios) return null;

    // Calculate earnings surprise track record
    let earningsSurpriseDirection = null;
    let earningsBeatCount = 0;
    if (earnings.length > 0) {
      earningsBeatCount = earnings.filter(e =>
        e.actualEarningResult != null && e.estimatedEarning != null &&
        e.actualEarningResult > e.estimatedEarning
      ).length;
      if (earningsBeatCount >= 3) earningsSurpriseDirection = "consistently_beats";
      else if (earningsBeatCount >= 2) earningsSurpriseDirection = "mostly_beats";
      else if (earningsBeatCount <= 1 && earnings.length >= 3) earningsSurpriseDirection = "mostly_misses";
    }

    // EPS growth from ratios
    const epsGrowth = ratios?.netIncomePerShareTTM && profile?.eps
      ? null // TTM ratios don't give growth directly
      : null;

    const result = {
      pe: ratios?.peRatioTTM ?? profile?.peRatio ?? null,
      forwardPE: null, // FMP free doesn't have forward PE
      pegRatio: ratios?.pegRatioTTM ?? null,
      priceToBook: ratios?.priceToBookRatioTTM ?? null,
      priceToSales: ratios?.priceToSalesRatioTTM ?? null,
      epsGrowth: epsGrowth,
      revenueGrowth: null, // requires income statement endpoint
      profitMargin: ratios?.netProfitMarginTTM != null
        ? Math.round(ratios.netProfitMarginTTM * 100) / 100
        : null,
      operatingMargin: ratios?.operatingProfitMarginTTM != null
        ? Math.round(ratios.operatingProfitMarginTTM * 100) / 100
        : null,
      returnOnEquity: ratios?.returnOnEquityTTM != null
        ? Math.round(ratios.returnOnEquityTTM * 10000) / 100
        : null,
      debtToEquity: ratios?.debtEquityRatioTTM != null
        ? Math.round(ratios.debtEquityRatioTTM * 100) / 100
        : null,
      currentRatio: ratios?.currentRatioTTM ?? null,
      freeCashflow: ratios?.freeCashFlowPerShareTTM != null && profile?.mktCap
        ? Math.round(ratios.freeCashFlowPerShareTTM * (profile.mktCap / (profile.price || 1)))
        : null,
      targetMeanPrice: profile?.targetMeanPrice ?? null,
      recommendationMean: null,
      recommendationKey: profile?.recommendation ?? null,
      numberOfAnalystOpinions: profile?.numberOfAnalysts ?? null,
      nextEarningsDate: null,
      // FMP extras not available in Yahoo/Finnhub
      dividendYield: profile?.lastDiv && profile?.price
        ? Math.round((profile.lastDiv / profile.price) * 10000) / 100
        : null,
      beta: profile?.beta ?? null,
      sector: profile?.sector ?? null,
      industry: profile?.industry ?? null,
      // Earnings quality metrics
      earningsSurpriseDirection,
      earningsBeatCount,
      earningsSurprises: earnings.length,
      _source: "fmp",
    };

    return result;
  } catch (err) {
    console.warn(`[FMP] Financials failed for ${ticker}:`, err.message);
    return null;
  }
}

// ── BATCH QUOTES (efficient for ranking) ──

export async function fetchFMPBatchQuotes(tickers) {
  if (!isFMPAvailable() || !tickers.length) return {};
  try {
    // FMP allows comma-separated tickers (up to ~50 per request)
    const chunks = [];
    for (let i = 0; i < tickers.length; i += 40) {
      chunks.push(tickers.slice(i, i + 40));
    }

    const results = {};
    for (const chunk of chunks) {
      const list = chunk.map(t => encodeURIComponent(t)).join(",");
      const data = await fmpGet(`/quote/${list}`);
      if (Array.isArray(data)) {
        for (const q of data) {
          if (q?.symbol && q?.price) {
            results[q.symbol] = {
              ticker: q.symbol,
              price: q.price,
              previousClose: q.previousClose ?? null,
              change: q.change ?? null,
              changePercent: q.changesPercentage ?? null,
              dayHigh: q.dayHigh ?? null,
              dayLow: q.dayLow ?? null,
              volume: q.volume ?? null,
              avgVolume: q.avgVolume ?? null,
              marketCap: q.marketCap ?? null,
              fiftyTwoWeekHigh: q.yearHigh ?? null,
              fiftyTwoWeekLow: q.yearLow ?? null,
              trailingPE: q.pe ?? null,
              forwardPE: null,
              epsTrailingTwelveMonths: q.eps ?? null,
              dividendYield: q.lastDiv ? (q.lastDiv / q.price) : null,
              beta: null,
              shortName: q.name || q.symbol,
              currency: "USD",
              exchange: q.exchange || "US",
              source: "fmp_batch",
              _source: "fmp_batch",
            };
          }
        }
      }
    }
    return results;
  } catch (err) {
    console.warn("[FMP] Batch quotes failed:", err.message);
    return {};
  }
}
