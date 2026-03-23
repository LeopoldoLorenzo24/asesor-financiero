// ============================================================
// ANALYSIS ENGINE
// Technical, Fundamental & Composite Scoring
// ============================================================

// ---- TECHNICAL INDICATORS ----

export function calcSMA(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((sum, p) => sum + p.close, 0) / period;
}

export function calcEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((s, p) => s + p.close, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i].close * k + ema * (1 - k);
  }
  return ema;
}

export function calcRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;

  // Step 1: seed with simple average of first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i].close - prices[i - 1].close;
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;

  // Step 2: Wilder's smoothing for the remaining periods
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i].close - prices[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

export function calcMACD(prices) {
  if (prices.length < 26) return { macd: 0, signal: 0, histogram: 0 };

  const k12 = 2 / 13;
  const k26 = 2 / 27;
  const k9 = 2 / 10;

  let ema12 = prices.slice(0, 12).reduce((s, p) => s + p.close, 0) / 12;
  let ema26 = prices.slice(0, 26).reduce((s, p) => s + p.close, 0) / 26;

  // Build MACD line for every day from index 26 onward
  const macdValues = [];
  for (let i = 0; i < prices.length; i++) {
    if (i >= 12) ema12 = prices[i].close * k12 + ema12 * (1 - k12);
    if (i >= 26) {
      ema26 = prices[i].close * k26 + ema26 * (1 - k26);
      macdValues.push(ema12 - ema26);
    }
  }

  if (macdValues.length === 0) return { macd: 0, signal: 0, histogram: 0 };

  // Signal line = EMA-9 of the MACD line
  let signal = macdValues.slice(0, 9).reduce((s, v) => s + v, 0) / Math.min(9, macdValues.length);
  for (let i = 9; i < macdValues.length; i++) {
    signal = macdValues[i] * k9 + signal * (1 - k9);
  }

  const macdLine = macdValues[macdValues.length - 1];
  return {
    macd: Math.round(macdLine * 100) / 100,
    signal: Math.round(signal * 100) / 100,
    histogram: Math.round((macdLine - signal) * 100) / 100,
  };
}

export function calcBollingerBands(prices, period = 20) {
  if (prices.length < period) return null;
  const sma = calcSMA(prices, period);
  const slice = prices.slice(-period);
  const variance = slice.reduce((sum, p) => sum + Math.pow(p.close - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  return {
    upper: Math.round((sma + 2 * stdDev) * 100) / 100,
    middle: Math.round(sma * 100) / 100,
    lower: Math.round((sma - 2 * stdDev) * 100) / 100,
    bandwidth: Math.round(((4 * stdDev) / sma) * 10000) / 100,
  };
}

export function calcATR(prices, period = 14) {
  if (prices.length < period + 1) return null;
  let atrSum = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const tr = Math.max(
      prices[i].high - prices[i].low,
      Math.abs(prices[i].high - prices[i - 1].close),
      Math.abs(prices[i].low - prices[i - 1].close)
    );
    atrSum += tr;
  }
  return Math.round((atrSum / period) * 100) / 100;
}

export function calcStochastic(prices, kPeriod = 14, dPeriod = 3) {
  if (prices.length < kPeriod + dPeriod) return { k: 50, d: 50 };

  // Calculate %K for each of the last dPeriod days
  const kValues = [];
  for (let offset = 0; offset < dPeriod; offset++) {
    const end = prices.length - offset;
    const start = end - kPeriod;
    const slice = prices.slice(start, end);
    const high = Math.max(...slice.map((p) => p.high));
    const low = Math.min(...slice.map((p) => p.low));
    const close = prices[end - 1].close;
    kValues.push(high === low ? 50 : ((close - low) / (high - low)) * 100);
  }

  const latestK = kValues[0];
  const d = kValues.reduce((sum, v) => sum + v, 0) / kValues.length;
  return {
    k: Math.round(latestK * 10) / 10,
    d: Math.round(d * 10) / 10,
  };
}

export function calcVolumeProfile(prices, lookback = 20) {
  if (prices.length < lookback) return { avgVolume: 0, volumeTrend: 0 };
  const recent = prices.slice(-lookback);
  const older = prices.slice(-lookback * 2, -lookback);
  const avgRecent = recent.reduce((s, p) => s + p.volume, 0) / recent.length;
  const avgOlder = older.length > 0 ? older.reduce((s, p) => s + p.volume, 0) / older.length : avgRecent;
  return {
    avgVolume: Math.round(avgRecent),
    volumeTrend: avgOlder > 0 ? Math.round(((avgRecent - avgOlder) / avgOlder) * 100) : 0,
  };
}

// ---- SUPPORT & RESISTANCE ----
export function calcSupportResistance(prices, lookback = 60) {
  if (prices.length < lookback) return { support: null, resistance: null };
  const slice = prices.slice(-lookback);
  const closes = slice.map((p) => p.close).sort((a, b) => a - b);
  const q1 = closes[Math.floor(closes.length * 0.1)];
  const q3 = closes[Math.floor(closes.length * 0.9)];
  return {
    support: Math.round(q1 * 100) / 100,
    resistance: Math.round(q3 * 100) / 100,
  };
}

// ---- PERFORMANCE METRICS ----
export function calcPerformance(prices) {
  if (prices.length < 2) return {};
  const current = prices[prices.length - 1].close;
  const calc = (days) => {
    if (prices.length < days) return null;
    const past = prices[prices.length - days].close;
    return Math.round(((current - past) / past) * 10000) / 100;
  };
  return {
    day1: calc(2),
    week1: calc(5),
    month1: calc(21),
    month3: calc(63),
    month6: prices.length >= 126 ? calc(126) : calc(prices.length - 1),
  };
}

// ---- FULL TECHNICAL ANALYSIS ----
export function technicalAnalysis(prices) {
  if (!prices || prices.length < 30) {
    return { score: 50, indicators: {}, signals: [] };
  }

  const rsi = calcRSI(prices);
  const macd = calcMACD(prices);
  const sma20 = calcSMA(prices, 20);
  const sma50 = calcSMA(prices, 50);
  const sma200 = calcSMA(prices, 200);
  const ema12 = calcEMA(prices, 12);
  const ema26 = calcEMA(prices, 26);
  const bb = calcBollingerBands(prices);
  const atr = calcATR(prices);
  const stoch = calcStochastic(prices);
  const volume = calcVolumeProfile(prices);
  const sr = calcSupportResistance(prices);
  const perf = calcPerformance(prices);
  const currentPrice = prices[prices.length - 1].close;

  let score = 50;
  const signals = [];

  // RSI scoring — context-aware: oversold in uptrend ≠ oversold in downtrend
  const aboveSMA200 = sma200 && currentPrice > sma200;
  if (rsi < 30) {
    if (aboveSMA200) {
      // Oversold in long-term uptrend → strong contrarian buy signal
      score += 18; signals.push({ type: "bullish", text: `RSI sobrevendido (${rsi}) sobre SMA200 — potencial rebote` });
    } else {
      // Oversold BELOW SMA200 → may be a falling knife, be cautious
      score += 4; signals.push({ type: "bearish", text: `RSI sobrevendido (${rsi}) bajo SMA200 — cuidado con trampa bajista` });
    }
  }
  else if (rsi < 40) { score += 8; signals.push({ type: "bullish", text: `RSI bajo (${rsi})` }); }
  else if (rsi > 70) { score -= 15; signals.push({ type: "bearish", text: `RSI sobrecomprado (${rsi})` }); }
  else if (rsi > 60) { score -= 3; }
  else { score += 5; }

  // Moving averages
  if (sma20 && sma50) {
    if (sma20 > sma50) { score += 12; signals.push({ type: "bullish", text: "SMA20 > SMA50 (tendencia alcista)" }); }
    else { score -= 8; signals.push({ type: "bearish", text: "SMA20 < SMA50 (tendencia bajista)" }); }
  }
  if (sma50 && sma200) {
    if (sma50 > sma200) { score += 8; signals.push({ type: "bullish", text: "Golden cross (SMA50 > SMA200)" }); }
    else { score -= 8; signals.push({ type: "bearish", text: "Death cross (SMA50 < SMA200)" }); }
  }
  if (sma20 && currentPrice > sma20) score += 5;
  else if (sma20) score -= 5;

  // MACD
  if (macd.histogram > 0) { score += 8; signals.push({ type: "bullish", text: "MACD positivo" }); }
  else { score -= 5; signals.push({ type: "bearish", text: "MACD negativo" }); }

  // Bollinger Bands — only strong buy signal if also above SMA200
  if (bb) {
    if (currentPrice < bb.lower) {
      if (aboveSMA200) { score += 10; signals.push({ type: "bullish", text: "Precio bajo banda inferior de Bollinger (uptrend)" }); }
      else { score += 3; signals.push({ type: "neutral", text: "Precio bajo BB inferior — tendencia bajista de largo plazo" }); }
    }
    else if (currentPrice > bb.upper) { score -= 8; signals.push({ type: "bearish", text: "Precio sobre banda superior de Bollinger" }); }
  }

  // Stochastic
  if (stoch.k < 20) { score += 6; signals.push({ type: "bullish", text: `Estocástico sobrevendido (${stoch.k})` }); }
  else if (stoch.k > 80) { score -= 5; signals.push({ type: "bearish", text: `Estocástico sobrecomprado (${stoch.k})` }); }

  // Volume confirmation
  if (volume.volumeTrend > 30 && perf.month1 > 0) { score += 5; signals.push({ type: "bullish", text: "Volumen creciente con precio alcista" }); }

  // Momentum / performance
  if (perf.month1 > 5 && perf.month3 > 10) score += 5;
  if (perf.month1 < -10) {
    if (aboveSMA200) {
      // Big drop but long-term uptrend intact → contrarian buy
      score += 6; signals.push({ type: "neutral", text: `Posible rebote tras caída fuerte (${perf.month1?.toFixed(1)}% en 1M) — tendencia alcista de fondo` });
    } else {
      // Big drop AND below SMA200 → ongoing downtrend, don't treat as bounce opportunity
      score -= 4; signals.push({ type: "bearish", text: `Caída de ${perf.month1?.toFixed(1)}% en 1M bajo SMA200 — tendencia bajista confirmada` });
    }
  }

  // Long-term downtrend penalty: death cross + price below SMA200 = confirmed bearish regime
  const deathCross = sma50 && sma200 && sma50 < sma200;
  if (!aboveSMA200 && deathCross) {
    score -= 8; signals.push({ type: "bearish", text: "Tendencia bajista de largo plazo confirmada (Death Cross + bajo SMA200)" });
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    indicators: {
      rsi, macd, sma20, sma50, sma200, ema12, ema26,
      bollingerBands: bb, atr, stochastic: stoch,
      volume, supportResistance: sr, performance: perf,
      currentPrice,
    },
    signals,
  };
}

// ---- FUNDAMENTAL ANALYSIS ----
export function fundamentalAnalysis(financials, quote) {
  let score = 50;
  const signals = [];

  if (!financials && !quote) return { score: 50, signals: [] };

  const pe = financials?.pe || quote?.trailingPE;
  const forwardPE = financials?.forwardPE || quote?.forwardPE;
  const epsGrowth = financials?.epsGrowth;
  const revenueGrowth = financials?.revenueGrowth;
  const divYield = quote?.dividendYield || 0;
  const profitMargin = financials?.profitMargin;
  const roe = financials?.returnOnEquity;
  const debtToEquity = financials?.debtToEquity;
  const pegRatio = financials?.pegRatio;
  const analystTarget = financials?.targetMeanPrice;
  const analystRec = financials?.recommendationMean;
  const currentPrice = quote?.price;

  // P/E valuation
  if (pe !== null && pe !== undefined) {
    if (pe > 0 && pe < 15) { score += 18; signals.push({ type: "bullish", text: `P/E bajo (${pe.toFixed(1)}) - potencialmente subvaluado` }); }
    else if (pe >= 15 && pe < 25) { score += 10; signals.push({ type: "bullish", text: `P/E razonable (${pe.toFixed(1)})` }); }
    else if (pe >= 25 && pe < 40) { score += 2; }
    else if (pe >= 40 && pe < 80) { score -= 5; signals.push({ type: "bearish", text: `P/E elevado (${pe.toFixed(1)})` }); }
    else if (pe >= 80) { score -= 12; signals.push({ type: "bearish", text: `P/E muy alto (${pe.toFixed(1)}) - caro` }); }
    else if (pe < 0) { score -= 15; signals.push({ type: "bearish", text: "P/E negativo - empresa sin ganancias" }); }
  }

  // PEG ratio (Growth at Reasonable Price)
  if (pegRatio !== null && pegRatio !== undefined && pegRatio > 0) {
    if (pegRatio < 1) { score += 12; signals.push({ type: "bullish", text: `PEG < 1 (${pegRatio.toFixed(2)}) - crecimiento subvaluado` }); }
    else if (pegRatio < 1.5) { score += 5; }
    else if (pegRatio > 2.5) { score -= 5; }
  }

  // EPS Growth
  if (epsGrowth !== null && epsGrowth !== undefined) {
    if (epsGrowth > 50) { score += 20; signals.push({ type: "bullish", text: `Crecimiento EPS excepcional (+${epsGrowth.toFixed(1)}%)` }); }
    else if (epsGrowth > 25) { score += 14; signals.push({ type: "bullish", text: `Fuerte crecimiento EPS (+${epsGrowth.toFixed(1)}%)` }); }
    else if (epsGrowth > 10) { score += 8; }
    else if (epsGrowth > 0) { score += 3; }
    else { score -= 10; signals.push({ type: "bearish", text: `EPS en declive (${epsGrowth.toFixed(1)}%)` }); }
  }

  // Revenue Growth
  if (revenueGrowth !== null && revenueGrowth !== undefined) {
    if (revenueGrowth > 20) { score += 10; signals.push({ type: "bullish", text: `Ingresos creciendo +${revenueGrowth.toFixed(1)}%` }); }
    else if (revenueGrowth > 5) { score += 5; }
    else if (revenueGrowth < -5) { score -= 8; signals.push({ type: "bearish", text: `Ingresos cayendo ${revenueGrowth.toFixed(1)}%` }); }
  }

  // Dividends
  if (divYield > 3) { score += 8; signals.push({ type: "bullish", text: `Buen dividendo (${divYield.toFixed(2)}%)` }); }
  else if (divYield > 1.5) { score += 4; }

  // Profitability
  if (profitMargin !== null && profitMargin !== undefined) {
    if (profitMargin > 25) { score += 8; signals.push({ type: "bullish", text: `Margen neto alto (${profitMargin.toFixed(1)}%)` }); }
    else if (profitMargin > 10) score += 4;
    else if (profitMargin < 0) { score -= 8; signals.push({ type: "bearish", text: "Empresa no rentable" }); }
  }

  // ROE
  if (roe !== null && roe !== undefined) {
    if (roe > 25) score += 6;
    else if (roe > 15) score += 3;
    else if (roe < 5) score -= 5;
  }

  // Debt
  if (debtToEquity !== null && debtToEquity !== undefined) {
    if (debtToEquity > 200) { score -= 8; signals.push({ type: "bearish", text: `Deuda alta (D/E: ${debtToEquity.toFixed(0)}%)` }); }
    else if (debtToEquity < 50) { score += 5; }
  }

  // Analyst consensus
  if (analystRec) {
    if (analystRec <= 2) { score += 8; signals.push({ type: "bullish", text: "Consenso de analistas: Comprar" }); }
    else if (analystRec <= 2.5) score += 4;
    else if (analystRec > 3.5) { score -= 5; signals.push({ type: "bearish", text: "Consenso de analistas: Vender" }); }
  }

  // Price vs analyst target
  if (analystTarget && currentPrice && currentPrice > 0) {
    const upside = ((analystTarget - currentPrice) / currentPrice) * 100;
    if (upside > 20) { score += 10; signals.push({ type: "bullish", text: `Upside ${upside.toFixed(1)}% vs precio objetivo analistas` }); }
    else if (upside > 10) score += 5;
    else if (upside < -10) { score -= 5; signals.push({ type: "bearish", text: `Downside ${upside.toFixed(1)}% vs precio objetivo` }); }
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    data: {
      pe, forwardPE, epsGrowth, revenueGrowth, divYield, profitMargin,
      roe, debtToEquity, pegRatio, analystTarget, analystRec,
      recommendationKey: financials?.recommendationKey,
      numberOfAnalysts: financials?.numberOfAnalystOpinions,
    },
    signals,
  };
}

// ---- COMPOSITE SCORING ----
// Profile: Moderate-Aggressive (35% technical, 40% fundamental, 25% sentiment/momentum)
// Profile weight presets
const PROFILE_WEIGHTS = {
  conservative: { tech: 0.25, fund: 0.50, sent: 0.25 },
  moderate:     { tech: 0.35, fund: 0.40, sent: 0.25 },
  aggressive:   { tech: 0.45, fund: 0.30, sent: 0.25 },
};

export function compositeScore(techAnalysis, fundAnalysis, quote, sector = "", profileId = "moderate") {
  const weights = PROFILE_WEIGHTS[profileId] || PROFILE_WEIGHTS.moderate;
  const tech = techAnalysis?.score || 50;
  const fund = fundAnalysis?.score || 50;

  // Sentiment proxy from momentum + analyst consensus + volume
  let sentiment = 50;
  const perf = techAnalysis?.indicators?.performance || {};
  if (perf.month1 > 5) sentiment += 10;
  if (perf.month3 > 10) sentiment += 10;
  if (perf.month1 > 0 && perf.month3 > 0) sentiment += 5;
  if (perf.month1 < -15) sentiment -= 10;
  if (fundAnalysis?.data?.analystRec && fundAnalysis.data.analystRec <= 2) sentiment += 10;
  const volTrend = techAnalysis?.indicators?.volume?.volumeTrend || 0;
  if (volTrend > 20) sentiment += 5;

  // Beta adjustment per profile
  const beta = quote?.beta || 1;
  if (profileId === "conservative") {
    if (beta > 1.2) sentiment -= 10;
    if (beta > 1.5) sentiment -= 5;
    if (beta < 0.8) sentiment += 5;
  } else if (profileId === "aggressive") {
    if (beta > 2.0) sentiment -= 3;
    if (beta < 0.5) sentiment -= 5;
  } else {
    if (beta > 1.8) sentiment -= 5;
    if (beta < 0.5) sentiment -= 3;
  }

  sentiment = Math.max(0, Math.min(100, sentiment));

  let composite = Math.round(tech * weights.tech + fund * weights.fund + sentiment * weights.sent);

  // Long-term downtrend penalty at composite level:
  // If stock has a confirmed death cross AND is below SMA200, cap conviction
  const sma50c = techAnalysis?.indicators?.sma50;
  const sma200c = techAnalysis?.indicators?.sma200;
  const currentPriceC = techAnalysis?.indicators?.currentPrice;
  const confirmedDowntrend = sma50c && sma200c && currentPriceC && sma50c < sma200c && currentPriceC < sma200c;
  if (confirmedDowntrend) {
    composite = Math.min(composite, 68); // Cap at COMPRA (just below COMPRA FUERTE) when in confirmed downtrend
  }

  // Generate signal
  let signal, signalColor;
  if (composite >= 72) { signal = "COMPRA FUERTE"; signalColor = "#10b981"; }
  else if (composite >= 60) { signal = "COMPRA"; signalColor = "#34d399"; }
  else if (composite >= 45) { signal = "HOLD"; signalColor = "#f59e0b"; }
  else if (composite >= 35) { signal = "PRECAUCIÓN"; signalColor = "#f97316"; }
  else { signal = "VENTA"; signalColor = "#ef4444"; }

  // Determine suggested horizon
  let horizon = "Mediano plazo (1-6 meses)";
  const rsi = techAnalysis?.indicators?.rsi || 50;
  const macdHist = techAnalysis?.indicators?.macd?.histogram || 0;
  const epsGrowth = fundAnalysis?.data?.epsGrowth;
  const divYield = fundAnalysis?.data?.divYield || 0;

  if (rsi < 30 && macdHist > 0) horizon = "Corto plazo (rebote técnico)";
  else if (epsGrowth && epsGrowth > 20 && fund > 60) horizon = "Largo plazo (crecimiento)";
  else if (divYield > 3 && fund > 55) horizon = "Largo plazo (dividendos + valor)";
  else if (tech > 65 && perf.month1 > 5) horizon = "Corto-mediano plazo (momentum)";

  // Sector diversification hints for moderate-aggressive profile
  const defensiveSectors = ["Consumer Defensive", "Healthcare", "ETF - Dividendos", "ETF - Commodities"];
  const growthSectors = ["Technology", "Consumer Cyclical", "E-Commerce"];
  const hedgeSectors = ["Materials", "Energy", "ETF - Commodities"];

  const sectorTag = {
    isDefensive: defensiveSectors.some(s => sector === s),
    isGrowth: growthSectors.some(s => sector === s),
    isHedge: hedgeSectors.some(s => sector === s),
  };

  return {
    composite: Math.max(0, Math.min(100, composite)),
    techScore: tech,
    fundScore: fund,
    sentScore: sentiment,
    signal,
    signalColor,
    horizon,
    sectorTag,
  };
}
