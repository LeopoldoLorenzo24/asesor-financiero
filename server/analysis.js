/** @format */
// ============================================================
// ANALYSIS ENGINE v2
// Technical, Fundamental & Composite Scoring
// Uses centralized config, adds JSDoc types
// ============================================================

import { TECHNICAL_CONFIG, SCORING_CONFIG } from "./config.js";
import { toFiniteNumber } from "./utils.js";

// ── TECHNICAL INDICATORS ──

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

export function calcRSI(prices, period = TECHNICAL_CONFIG.rsiPeriod) {
  if (prices.length < period + 1) return 50;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i].close - prices[i - 1].close;
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;

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

  const macdValues = [];
  for (let i = 0; i < prices.length; i++) {
    if (i >= 12) ema12 = prices[i].close * k12 + ema12 * (1 - k12);
    if (i >= 26) {
      ema26 = prices[i].close * k26 + ema26 * (1 - k26);
      macdValues.push(ema12 - ema26);
    }
  }

  if (macdValues.length === 0) return { macd: 0, signal: 0, histogram: 0 };

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

export function calcBollingerBands(prices, period = TECHNICAL_CONFIG.bollingerPeriod) {
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

export function calcATR(prices, period = TECHNICAL_CONFIG.atrPeriod) {
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

export function calcStochastic(prices, kPeriod = TECHNICAL_CONFIG.stochasticK, dPeriod = TECHNICAL_CONFIG.stochasticD) {
  if (prices.length < kPeriod + dPeriod) return { k: 50, d: 50 };

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
  return { k: Math.round(latestK * 10) / 10, d: Math.round(d * 10) / 10 };
}

export function calcVolumeProfile(prices, lookback = TECHNICAL_CONFIG.volumeLookback) {
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

export function calcSupportResistance(prices, lookback = TECHNICAL_CONFIG.supportResistanceLookback) {
  if (prices.length < lookback) return { support: null, resistance: null };
  const slice = prices.slice(-lookback);
  const closes = slice.map((p) => p.close).sort((a, b) => a - b);
  return {
    support: Math.round(closes[Math.floor(closes.length * 0.1)] * 100) / 100,
    resistance: Math.round(closes[Math.floor(closes.length * 0.9)] * 100) / 100,
  };
}

export function calcPerformance(prices) {
  if (prices.length < 2) return {};
  const current = prices[prices.length - 1].close;
  const calc = (days) => {
    if (prices.length < days) return null;
    const past = prices[prices.length - days].close;
    return Math.round(((current - past) / past) * 10000) / 100;
  };
  return {
    day1: calc(TECHNICAL_CONFIG.performancePeriods.day1),
    week1: calc(TECHNICAL_CONFIG.performancePeriods.week1),
    month1: calc(TECHNICAL_CONFIG.performancePeriods.month1),
    month3: calc(TECHNICAL_CONFIG.performancePeriods.month3),
    month6: prices.length >= TECHNICAL_CONFIG.performancePeriods.month6
      ? calc(TECHNICAL_CONFIG.performancePeriods.month6)
      : calc(prices.length - 1),
  };
}

export function technicalAnalysis(prices) {
  if (!prices || prices.length < 30) {
    return { score: 50, indicators: {}, signals: [] };
  }

  const cfg = TECHNICAL_CONFIG.smaPeriods;
  const rsi = calcRSI(prices);
  const macd = calcMACD(prices);
  const sma20 = calcSMA(prices, cfg.short);
  const sma50 = calcSMA(prices, cfg.medium);
  const sma200 = calcSMA(prices, cfg.long);
  const ema12 = calcEMA(prices, TECHNICAL_CONFIG.emaPeriods.fast);
  const ema26 = calcEMA(prices, TECHNICAL_CONFIG.emaPeriods.slow);
  const bb = calcBollingerBands(prices);
  const atr = calcATR(prices);
  const stoch = calcStochastic(prices);
  const volume = calcVolumeProfile(prices);
  const sr = calcSupportResistance(prices);
  const perf = calcPerformance(prices);
  const currentPrice = prices[prices.length - 1].close;

  let score = 50;
  const signals = [];

  const aboveSMA200 = sma200 && currentPrice > sma200;

  // RSI scoring
  if (rsi < 30) {
    if (aboveSMA200) {
      score += 18;
      signals.push({ type: "bullish", text: `RSI sobrevendido (${rsi}) sobre SMA200 — potencial rebote` });
    } else {
      score += 4;
      signals.push({ type: "bearish", text: `RSI sobrevendido (${rsi}) bajo SMA200 — cuidado con trampa bajista` });
    }
  } else if (rsi < 40) {
    score += 8;
    signals.push({ type: "bullish", text: `RSI bajo (${rsi})` });
  } else if (rsi > 70) {
    score -= 15;
    signals.push({ type: "bearish", text: `RSI sobrecomprado (${rsi})` });
  } else if (rsi > 60) {
    score -= 3;
  } else {
    score += 5;
  }

  // Moving averages
  if (sma20 && sma50) {
    if (sma20 > sma50) {
      score += 12;
      signals.push({ type: "bullish", text: "SMA20 > SMA50 (tendencia alcista)" });
    } else {
      score -= 8;
      signals.push({ type: "bearish", text: "SMA20 < SMA50 (tendencia bajista)" });
    }
  }
  if (sma50 && sma200) {
    if (sma50 > sma200) {
      score += 8;
      signals.push({ type: "bullish", text: "Golden cross (SMA50 > SMA200)" });
    } else {
      score -= 8;
      signals.push({ type: "bearish", text: "Death cross (SMA50 < SMA200)" });
    }
  }
  if (sma20 && currentPrice > sma20) score += 5;
  else if (sma20) score -= 5;

  // MACD
  if (macd.histogram > 0) {
    score += 8;
    signals.push({ type: "bullish", text: "MACD positivo" });
  } else {
    score -= 5;
    signals.push({ type: "bearish", text: "MACD negativo" });
  }

  // Bollinger Bands
  if (bb) {
    if (currentPrice < bb.lower) {
      if (aboveSMA200) {
        score += 10;
        signals.push({ type: "bullish", text: "Precio bajo banda inferior de Bollinger (uptrend)" });
      } else {
        score += 3;
        signals.push({ type: "neutral", text: "Precio bajo BB inferior — tendencia bajista de largo plazo" });
      }
    } else if (currentPrice > bb.upper) {
      score -= 8;
      signals.push({ type: "bearish", text: "Precio sobre banda superior de Bollinger" });
    }
  }

  // Stochastic
  if (stoch.k < 20) {
    score += 6;
    signals.push({ type: "bullish", text: `Estocástico sobrevendido (${stoch.k})` });
  } else if (stoch.k > 80) {
    score -= 5;
    signals.push({ type: "bearish", text: `Estocástico sobrecomprado (${stoch.k})` });
  }

  // Volume confirmation
  if (volume.volumeTrend > 30 && perf.month1 > 0) {
    score += 5;
    signals.push({ type: "bullish", text: "Volumen creciente con precio alcista" });
  }

  // Momentum / performance
  if (perf.month1 > 5 && perf.month3 > 10) score += 5;
  if (perf.month1 < -10) {
    if (aboveSMA200) {
      score += 6;
      signals.push({ type: "neutral", text: `Posible rebote tras caída fuerte (${perf.month1?.toFixed(1)}% en 1M) — tendencia alcista de fondo` });
    } else {
      score -= 4;
      signals.push({ type: "bearish", text: `Caída de ${perf.month1?.toFixed(1)}% en 1M bajo SMA200 — tendencia bajista confirmada` });
    }
  }

  // Long-term downtrend penalty
  const deathCross = sma50 && sma200 && sma50 < sma200;
  if (!aboveSMA200 && deathCross) {
    score -= 8;
    signals.push({ type: "bearish", text: "Tendencia bajista de largo plazo confirmada (Death Cross + bajo SMA200)" });
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

// ── FUNDAMENTAL ANALYSIS ──

export function fundamentalAnalysis(financials, quote) {
  let score = 50;
  const signals = [];

  if (!financials && !quote) return { score: 50, signals: [] };

  const fd = financials || {};
  const pe = fd.pe || quote?.trailingPE;
  const forwardPE = fd.forwardPE || quote?.forwardPE;
  const epsGrowth = fd.epsGrowth;
  const revenueGrowth = fd.revenueGrowth;
  const divYield = quote?.dividendYield || 0;
  const profitMargin = fd.profitMargin;
  const roe = fd.returnOnEquity;
  const debtToEquity = fd.debtToEquity;
  const pegRatio = fd.pegRatio;
  const analystTarget = fd.targetMeanPrice;
  const analystRec = fd.recommendationMean;
  const currentPrice = quote?.price;

  if (pe !== null && pe !== undefined) {
    if (pe > 0 && pe < 15) {
      score += 18;
      signals.push({ type: "bullish", text: `P/E bajo (${pe.toFixed(1)}) - potencialmente subvaluado` });
    } else if (pe >= 15 && pe < 25) {
      score += 10;
      signals.push({ type: "bullish", text: `P/E razonable (${pe.toFixed(1)})` });
    } else if (pe >= 25 && pe < 40) {
      score += 2;
    } else if (pe >= 40 && pe < 80) {
      score -= 5;
      signals.push({ type: "bearish", text: `P/E elevado (${pe.toFixed(1)})` });
    } else if (pe >= 80) {
      score -= 12;
      signals.push({ type: "bearish", text: `P/E muy alto (${pe.toFixed(1)}) - caro` });
    } else if (pe < 0) {
      score -= 15;
      signals.push({ type: "bearish", text: "P/E negativo - empresa sin ganancias" });
    }
  }

  if (pegRatio !== null && pegRatio !== undefined && pegRatio > 0) {
    if (pegRatio < 1) {
      score += 12;
      signals.push({ type: "bullish", text: `PEG < 1 (${pegRatio.toFixed(2)}) - crecimiento subvaluado` });
    } else if (pegRatio < 1.5) {
      score += 5;
    } else if (pegRatio > 2.5) {
      score -= 5;
    }
  }

  if (epsGrowth !== null && epsGrowth !== undefined) {
    if (epsGrowth > 50) {
      score += 20;
      signals.push({ type: "bullish", text: `Crecimiento EPS excepcional (+${epsGrowth.toFixed(1)}%)` });
    } else if (epsGrowth > 25) {
      score += 14;
      signals.push({ type: "bullish", text: `Fuerte crecimiento EPS (+${epsGrowth.toFixed(1)}%)` });
    } else if (epsGrowth > 10) {
      score += 8;
    } else if (epsGrowth > 0) {
      score += 3;
    } else {
      score -= 10;
      signals.push({ type: "bearish", text: `EPS en declive (${epsGrowth.toFixed(1)}%)` });
    }
  }

  if (revenueGrowth !== null && revenueGrowth !== undefined) {
    if (revenueGrowth > 20) {
      score += 10;
      signals.push({ type: "bullish", text: `Ingresos creciendo +${revenueGrowth.toFixed(1)}%` });
    } else if (revenueGrowth > 5) {
      score += 5;
    } else if (revenueGrowth < -5) {
      score -= 8;
      signals.push({ type: "bearish", text: `Ingresos cayendo ${revenueGrowth.toFixed(1)}%` });
    }
  }

  if (divYield > 3) {
    score += 8;
    signals.push({ type: "bullish", text: `Buen dividendo (${divYield.toFixed(2)}%)` });
  } else if (divYield > 1.5) {
    score += 4;
  }

  if (profitMargin !== null && profitMargin !== undefined) {
    if (profitMargin > 25) {
      score += 8;
      signals.push({ type: "bullish", text: `Margen neto alto (${profitMargin.toFixed(1)}%)` });
    } else if (profitMargin > 10) {
      score += 4;
    } else if (profitMargin < 0) {
      score -= 8;
      signals.push({ type: "bearish", text: "Empresa no rentable" });
    }
  }

  if (roe !== null && roe !== undefined) {
    if (roe > 25) score += 6;
    else if (roe > 15) score += 3;
    else if (roe < 5) score -= 5;
  }

  if (debtToEquity !== null && debtToEquity !== undefined) {
    if (debtToEquity > 200) {
      score -= 8;
      signals.push({ type: "bearish", text: `Deuda alta (D/E: ${debtToEquity.toFixed(0)}%)` });
    } else if (debtToEquity < 50) {
      score += 5;
    }
  }

  if (analystRec) {
    if (analystRec <= 2) {
      score += 8;
      signals.push({ type: "bullish", text: "Consenso de analistas: Comprar" });
    } else if (analystRec <= 2.5) {
      score += 4;
    } else if (analystRec > 3.5) {
      score -= 5;
      signals.push({ type: "bearish", text: "Consenso de analistas: Vender" });
    }
  }

  if (analystTarget && currentPrice && currentPrice > 0) {
    const upside = ((analystTarget - currentPrice) / currentPrice) * 100;
    if (upside > 20) {
      score += 10;
      signals.push({ type: "bullish", text: `Upside ${upside.toFixed(1)}% vs precio objetivo analistas` });
    } else if (upside > 10) {
      score += 5;
    } else if (upside < -10) {
      score -= 5;
      signals.push({ type: "bearish", text: `Downside ${upside.toFixed(1)}% vs precio objetivo` });
    }
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

// ── RELATIVE STRENGTH vs SPY ──

export function calcRelativeStrength(tickerPerf, spyPerf) {
  if (!tickerPerf || !spyPerf) return null;

  const periods = [
    { key: "month3", weight: 4 },
    { key: "month1", weight: 2 },
    { key: "month6", weight: 1 },
  ];

  let weightedSum = 0;
  let totalWeight = 0;

  for (const { key, weight } of periods) {
    const tPerf = tickerPerf[key];
    const sPerf = spyPerf[key];
    if (tPerf == null || sPerf == null) continue;
    const denom = 1 + (sPerf !== 0 ? sPerf / 100 : 0.001);
    if (denom <= 0) continue;
    const ratio = (1 + tPerf / 100) / denom;
    weightedSum += ratio * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;
  return Math.round((weightedSum / totalWeight) * 1000) / 1000;
}

// ── COMPOSITE SCORING ──

export function compositeScore(techAnalysis, fundAnalysis, quote, sector = "", profileId = "moderate", rsRating = null) {
  const weights = SCORING_CONFIG.weights[profileId] || SCORING_CONFIG.weights.moderate;
  const tech = techAnalysis?.score || 50;
  const fund = fundAnalysis?.score || 50;

  let sentiment = 50;
  const perf = techAnalysis?.indicators?.performance || {};
  if (perf.month1 > 5) sentiment += 10;
  if (perf.month3 > 10) sentiment += 10;
  if (perf.month1 > 0 && perf.month3 > 0) sentiment += 5;
  if (perf.month1 < -15) sentiment -= 10;
  if (fundAnalysis?.data?.analystRec && fundAnalysis.data.analystRec <= 2) sentiment += 10;
  const volTrend = techAnalysis?.indicators?.volume?.volumeTrend || 0;
  if (volTrend > 20) sentiment += 5;

  if (rsRating != null) {
    if (rsRating >= 90) sentiment += 12;
    else if (rsRating >= 75) sentiment += 7;
    else if (rsRating >= 60) sentiment += 3;
    else if (rsRating <= 25) sentiment -= 8;
    else if (rsRating <= 40) sentiment -= 4;
  }

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

  // Downtrend cap
  const sma50c = techAnalysis?.indicators?.sma50;
  const sma200c = techAnalysis?.indicators?.sma200;
  const currentPriceC = techAnalysis?.indicators?.currentPrice;
  const confirmedDowntrend = sma50c && sma200c && currentPriceC && sma50c < sma200c && currentPriceC < sma200c;
  if (confirmedDowntrend) {
    composite = Math.min(composite, SCORING_CONFIG.confirmedDowntrendCap);
  }

  const t = SCORING_CONFIG.thresholds;
  let signal, signalColor;
  if (composite >= t.strongBuy) { signal = "COMPRA FUERTE"; signalColor = "#10b981"; }
  else if (composite >= t.buy) { signal = "COMPRA"; signalColor = "#34d399"; }
  else if (composite >= t.hold) { signal = "HOLD"; signalColor = "#f59e0b"; }
  else if (composite >= t.caution) { signal = "PRECAUCIÓN"; signalColor = "#f97316"; }
  else { signal = "VENTA"; signalColor = "#ef4444"; }

  let horizon = "Mediano plazo (1-6 meses)";
  const rsi = techAnalysis?.indicators?.rsi || 50;
  const macdHist = techAnalysis?.indicators?.macd?.histogram || 0;
  const epsGrowth = fundAnalysis?.data?.epsGrowth;
  const divYield = fundAnalysis?.data?.divYield || 0;

  if (rsi < 30 && macdHist > 0) horizon = "Corto plazo (rebote técnico)";
  else if (epsGrowth && epsGrowth > 20 && fund > 60) horizon = "Largo plazo (crecimiento)";
  else if (divYield > 3 && fund > 55) horizon = "Largo plazo (dividendos + valor)";
  else if (tech > 65 && perf.month1 > 5) horizon = "Corto-mediano plazo (momentum)";

  const defensiveSectors = ["Consumer Defensive", "Healthcare", "ETF - Dividendos", "ETF - Commodities"];
  const growthSectors = ["Technology", "Consumer Cyclical", "E-Commerce"];
  const hedgeSectors = ["Materials", "Energy", "ETF - Commodities"];

  return {
    composite: Math.max(0, Math.min(100, composite)),
    techScore: tech,
    fundScore: fund,
    sentScore: sentiment,
    signal,
    signalColor,
    horizon,
    sectorTag: {
      isDefensive: defensiveSectors.some((s) => sector === s),
      isGrowth: growthSectors.some((s) => sector === s),
      isHedge: hedgeSectors.some((s) => sector === s),
    },
  };
}
