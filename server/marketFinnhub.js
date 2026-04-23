// ============================================================
// FINNHUB MARKET DATA PROVIDER
// Segunda fuente de datos para US quotes e historial.
// Usar si Yahoo Finance falla — requiere FINNHUB_API_KEY (gratis en finnhub.io).
//
// Límites free tier: 60 llamadas/minuto, sin límite diario.
// Endpoints usados:
//   GET /quote              → precio actual
//   GET /stock/candle       → OHLCV diario histórico
// ============================================================

const FINNHUB_KEY = String(process.env.FINNHUB_API_KEY || "").trim();
const BASE = "https://finnhub.io/api/v1";

export function isFinnhubAvailable() {
  return FINNHUB_KEY.length > 0;
}

// Fetch con timeout para no bloquear indefinidamente
async function fetchWithTimeout(url, timeoutMs = 8000) {
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

// Mapea la respuesta cruda de Finnhub /quote al schema unificado.
// Exportada para permitir tests unitarios sin necesidad de mockear fetch.
export function normalizeFinnhubQuote(ticker, data) {
  return {
    ticker,
    price: data.c,
    previousClose: data.pc ?? null,
    change: data.d ?? null,
    changePercent: data.dp ?? null,
    dayHigh: data.h ?? null,
    dayLow: data.l ?? null,
    volume: null,       // no incluido en /quote básico
    avgVolume: null,
    marketCap: null,
    fiftyTwoWeekHigh: data["52WeekHigh"] ?? null,
    fiftyTwoWeekLow: data["52WeekLow"] ?? null,
    trailingPE: null,   // necesita /stock/metric
    forwardPE: null,
    dividendYield: 0,
    beta: null,
    source: "finnhub",
  };
}

// --- Quote actual ---
export async function fetchFinnhubQuote(ticker) {
  if (!FINNHUB_KEY) throw new Error("FINNHUB_API_KEY no configurada");
  const res = await fetchWithTimeout(
    `${BASE}/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_KEY}`
  );
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status} para ${ticker}`);
  const data = await res.json();
  // c = current price, 0 means no data
  if (!data.c || data.c === 0) throw new Error(`Finnhub: sin datos de precio para ${ticker}`);
  return normalizeFinnhubQuote(ticker, data);
}

// --- Historial OHLCV diario ---
export async function fetchFinnhubHistory(ticker, months = 6) {
  if (!FINNHUB_KEY) throw new Error("FINNHUB_API_KEY no configurada");
  const to = Math.floor(Date.now() / 1000);
  const from = to - Math.ceil(months * 30.44 * 24 * 3600);
  const res = await fetchWithTimeout(
    `${BASE}/stock/candle?symbol=${encodeURIComponent(ticker)}&resolution=D&from=${from}&to=${to}&token=${FINNHUB_KEY}`
  );
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status} historial ${ticker}`);
  const data = await res.json();
  if (data.s !== "ok" || !Array.isArray(data.c) || data.c.length === 0) {
    throw new Error(`Finnhub historial: sin datos para ${ticker}`);
  }
  return data.t.map((ts, i) => ({
    date: new Date(ts * 1000).toISOString().slice(0, 10),
    open:   Math.round((data.o[i] ?? 0) * 100) / 100,
    high:   Math.round((data.h[i] ?? 0) * 100) / 100,
    low:    Math.round((data.l[i] ?? 0) * 100) / 100,
    close:  Math.round((data.c[i] ?? 0) * 100) / 100,
    volume: data.v[i] ?? 0,
  })).filter(row => row.close > 0);
}

// --- Basic Financials (mejora datos fundamentalistas) ---
export async function fetchFinnhubFinancials(ticker) {
  if (!FINNHUB_KEY) throw new Error("FINNHUB_API_KEY no configurada");
  const res = await fetchWithTimeout(
    `${BASE}/stock/metric?symbol=${encodeURIComponent(ticker)}&metric=all&token=${FINNHUB_KEY}`
  );
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status} metric ${ticker}`);
  const data = await res.json();
  const m = data.metric || {};
  return {
    pe: m.peBasicExclExtraTTM ?? m.peNormalizedAnnual ?? null,
    forwardPE: m.peForward ?? m.peExclExtraAnnual ?? null,
    pegRatio: m.pegRatio ?? null,
    priceToBook: m.pbQuarterly ?? m.ptbvAnnual ?? null,
    priceToSales: m.psTTM ?? null,
    epsGrowth: m.epsGrowth5Y ?? m.epsGrowthQuarterlyYoy ?? null,
    revenueGrowth: m.revenueGrowth5Y ?? m.revenueGrowthQuarterlyYoy ?? null,
    profitMargin: m.netProfitMarginAnnual ?? m.netProfitMarginTTM ?? null,
    operatingMargin: m.operatingMarginAnnual ?? m.operatingMarginTTM ?? null,
    returnOnEquity: m.roeRfy ?? m.roeTTM ?? null,
    debtToEquity: m.totalDebtToEquityAnnual ?? m.totalDebtToEquityQuarterly ?? null,
    currentRatio: m.currentRatioAnnual ?? m.currentRatioQuarterly ?? null,
    freeCashflow: m.freeCashFlowPerShareTTM ?? null,
    targetMeanPrice: m.targetMeanPrice ?? null,
    recommendationMean: m.recommendationMean ?? null,
    recommendationKey: m.recommendationKey ?? null,
    numberOfAnalystOpinions: m.numberOfAnalystOpinions ?? null,
    dividendYield: m.dividendYieldIndicatedAnnual ?? m.dividendYieldTTM ?? null,
    beta: m.beta ?? null,
    _source: "finnhub_metric",
  };
}
