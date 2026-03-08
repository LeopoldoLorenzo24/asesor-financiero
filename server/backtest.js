import { fetchHistory, fetchQuote, fetchFinancials } from "./marketData.js";
import { technicalAnalysis, fundamentalAnalysis, compositeScore } from "./analysis.js";
import CEDEARS from "./cedears.js";

// ── Sector categories for strict slot-based diversification ──
const CATEGORIES = {
  growth: ["Technology", "Consumer Cyclical", "E-Commerce", "Communication", "Crypto"],
  defensive: ["Consumer Defensive", "Healthcare", "Financial"],
  hedge: ["Energy", "Materials"],
  index: ["ETF - Índices", "ETF - Internacional", "ETF - Sectorial", "ETF - Commodities", "ETF - Temático", "ETF - Dividendos", "ETF - Crypto"],
};

function getCategory(sector) {
  for (const [cat, sectors] of Object.entries(CATEGORIES)) {
    if (sectors.includes(sector)) return cat;
  }
  return "other";
}

// ── Select candidates ensuring sector coverage ──
function selectBacktestCandidates(allCedears, maxPerSector = 6, maxTotal = 60) {
  const bySector = {};
  for (const c of allCedears) {
    if (c.sector.startsWith("ETF")) continue;
    if (!bySector[c.sector]) bySector[c.sector] = [];
    bySector[c.sector].push(c);
  }
  const selected = [];
  for (const tickers of Object.values(bySector)) {
    selected.push(...tickers.slice(0, maxPerSector));
  }
  return selected.slice(0, maxTotal);
}

// ── Enhanced scoring for backtest — uses FULL technical analysis ──
function backtestScore(cutHistory, sector, profile) {
  const tech = technicalAnalysis(cutHistory);
  const scores = compositeScore(tech, { score: 50, signals: [] }, null, sector, profile);
  const indicators = tech.indicators || {};
  const rsi = indicators.rsi || 50;
  const macdHist = indicators.macd?.histogram || 0;
  const sma20 = indicators.sma20;
  const sma50 = indicators.sma50;
  const currentPrice = cutHistory[cutHistory.length - 1].close;
  const perf = indicators.performance || {};

  let enhancedScore = scores.composite;

  // ── MOMENTUM FILTER: Price must be above SMA20 ──
  if (sma20 && currentPrice < sma20) {
    enhancedScore -= 20; // Strong penalty for being below short-term trend
  }

  // ── TREND FILTER: Price should be above SMA50 ──
  if (sma50 && currentPrice > sma50) {
    enhancedScore += 10; // Reward for being in uptrend
  } else if (sma50) {
    enhancedScore -= 15; // Penalty for being below medium-term trend
  }

  // ── RSI FILTER: Avoid overbought, reward oversold bouncing ──
  if (rsi > 75) {
    enhancedScore -= 20; // Heavily penalize overbought
  } else if (rsi > 65) {
    enhancedScore -= 8;
  } else if (rsi < 35 && macdHist > 0) {
    enhancedScore += 15; // Oversold + MACD turning positive = great entry
  } else if (rsi < 40 && rsi > 30) {
    enhancedScore += 8; // Approaching oversold
  }

  // ── MACD CONFIRMATION: Positive histogram = momentum building ──
  if (macdHist > 0) {
    enhancedScore += 8;
  } else {
    enhancedScore -= 5;
  }

  // ── RECENT PERFORMANCE: Require positive 1-month momentum ──
  if (perf.month1 != null) {
    if (perf.month1 > 5) enhancedScore += 10; // Strong recent performance
    else if (perf.month1 > 0) enhancedScore += 3;
    else if (perf.month1 < -15) enhancedScore -= 12; // Big recent drop = risky
    else if (perf.month1 < -5) enhancedScore -= 5;
  }

  // ── BOLLINGER: Buy near lower band ──
  const bb = indicators.bollingerBands;
  if (bb) {
    const bbPosition = (currentPrice - bb.lower) / (bb.upper - bb.lower);
    if (bbPosition < 0.2) enhancedScore += 10; // Near lower band = potential buy
    else if (bbPosition > 0.85) enhancedScore -= 8; // Near upper band = risky
  }

  // ── VOLUME CONFIRMATION ──
  const volTrend = indicators.volume?.volumeTrend || 0;
  if (volTrend > 20 && perf.month1 > 0) enhancedScore += 5; // Rising volume + price up

  return {
    composite: Math.max(0, Math.min(100, Math.round(enhancedScore))),
    signal: enhancedScore >= 70 ? "COMPRA FUERTE" : enhancedScore >= 55 ? "COMPRA" : enhancedScore >= 40 ? "HOLD" : "PRECAUCIÓN",
    passesMomentumFilter: sma20 ? currentPrice > sma20 : true,
    passesTrendFilter: sma50 ? currentPrice > sma50 : true,
    rsi,
    macdHist,
    perf1m: perf.month1,
  };
}

// ── Strict slot-based diversification for backtest picks ──
function selectDiversifiedPicks(scored, numPicks = 4) {
  const picks = [];
  const usedTickers = new Set();
  const usedSectors = {};

  function tryAdd(item) {
    const ticker = item.cedear?.ticker || item.ticker;
    if (usedTickers.has(ticker)) return false;
    const sector = item.cedear?.sector || item.sector;
    usedTickers.add(ticker);
    usedSectors[sector] = (usedSectors[sector] || 0) + 1;
    picks.push(item);
    return true;
  }

  // Only consider picks that pass the momentum filter
  const qualityPicks = scored.filter(s => s.scores.passesMomentumFilter && s.scores.composite >= 50);
  const fallbackPicks = scored.filter(s => s.scores.composite >= 45);
  const pool = qualityPicks.length >= numPicks ? qualityPicks : (fallbackPicks.length >= numPicks ? fallbackPicks : scored);

  // SLOT 1: Best growth
  for (const item of pool) {
    if (picks.length >= 1) break;
    if (getCategory(item.cedear?.sector || item.sector) === "growth") tryAdd(item);
  }

  // SLOT 2: Best defensive
  for (const item of pool) {
    if (picks.length >= 2) break;
    if (getCategory(item.cedear?.sector || item.sector) === "defensive") tryAdd(item);
  }

  // SLOT 3: Best hedge
  for (const item of pool) {
    if (picks.length >= 3) break;
    if (getCategory(item.cedear?.sector || item.sector) === "hedge") tryAdd(item);
  }

  // REMAINING SLOTS: Fill with best that don't repeat sector
  for (const item of pool) {
    if (picks.length >= numPicks) break;
    const ticker = item.cedear?.ticker || item.ticker;
    const sector = item.cedear?.sector || item.sector;
    if (usedTickers.has(ticker)) continue;
    if ((usedSectors[sector] || 0) >= 1 && picks.length < numPicks - 1) continue;
    tryAdd(item);
  }

  // FALLBACK: If still not enough
  for (const item of scored) {
    if (picks.length >= numPicks) break;
    const ticker = item.cedear?.ticker || item.ticker;
    if (!usedTickers.has(ticker)) tryAdd(item);
  }

  return picks;
}

// ── Core/Satellite allocation per profile ──
const CORE_ALLOCATION = {
  conservative: { corePct: 0.80, coreETF: "SPY" },
  moderate:     { corePct: 0.50, coreETF: "SPY" },
  aggressive:   { corePct: 0.30, coreETF: "QQQ" },
};

// ── STOP-LOSS & TAKE-PROFIT CONFIG ──
const RISK_MANAGEMENT = {
  stopLossPct: -0.12,     // Sell if drops 12% from entry
  takeProfitPct: 0.25,    // Partial sell if gains 25%
  takeProfitSellPct: 0.5, // Sell 50% at take-profit
};

export async function runBacktest({ months = 6, monthlyDeposit = 1000000, profile = "moderate", picksPerMonth = 4 } = {}) {
  const candidates = selectBacktestCandidates(CEDEARS);
  const { corePct, coreETF } = CORE_ALLOCATION[profile] || CORE_ALLOCATION.moderate;
  const satellitePct = 1 - corePct;

  const totalMonths = months + 7;

  // Fetch all histories (including core ETF)
  const historyMap = {};
  const batchSize = 8;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(c => fetchHistory(`${c.ticker}.BA`, totalMonths).then(h => ({ ticker: c.ticker, h })))
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.h.length > 30) {
        historyMap[r.value.ticker] = r.value.h;
      }
    }
  }

  // Fetch core ETF history
  let coreHistory = null;
  try {
    coreHistory = await fetchHistory(`${coreETF}.BA`, totalMonths);
    if (coreHistory.length < 30) coreHistory = null;
  } catch {
    try { coreHistory = await fetchHistory(coreETF, totalMonths); } catch { /* ignore */ }
  }

  // ── Simulate month by month with RISK MANAGEMENT ──
  const activeHoldings = []; // Active satellite positions with tracking
  const closedHoldings = []; // Positions closed by stop-loss or take-profit
  const coreHoldings = [];
  const meses = [];
  let stoplossRecoveredCapital = 0; // Capital recovered from stop-losses

  for (let m = months; m >= 1; m--) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - m);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);
    const monthLabel = cutoffDate.toLocaleDateString("es-AR", { year: "numeric", month: "short" });

    // ── CHECK STOP-LOSS / TAKE-PROFIT for existing active holdings ──
    const stopLossEvents = [];
    const takeProfitEvents = [];
    const holdingsToRemove = new Set();

    for (let i = 0; i < activeHoldings.length; i++) {
      const h = activeHoldings[i];
      const fullHistory = historyMap[h.ticker];
      if (!fullHistory) continue;

      // Get price at current cutoff
      const cutPrices = fullHistory.filter(p => p.date <= cutoffStr);
      if (cutPrices.length === 0) continue;
      const currentPrice = cutPrices[cutPrices.length - 1].close;
      const changePct = (currentPrice - h.priceAtEntry) / h.priceAtEntry;

      // Check all daily prices since entry for intraperiod triggers
      const pricesSinceEntry = fullHistory.filter(p => p.date > h.boughtMonth && p.date <= cutoffStr);
      let hitStopLoss = false;
      let hitTakeProfit = false;

      for (const dayPrice of pricesSinceEntry) {
        const dayChange = (dayPrice.close - h.priceAtEntry) / h.priceAtEntry;
        if (dayChange <= RISK_MANAGEMENT.stopLossPct) {
          hitStopLoss = true;
          break;
        }
        if (dayChange >= RISK_MANAGEMENT.takeProfitPct && !h.tookProfit) {
          hitTakeProfit = true;
          break;
        }
      }

      if (hitStopLoss) {
        const sellPrice = h.priceAtEntry * (1 + RISK_MANAGEMENT.stopLossPct);
        const recovered = h.shares * sellPrice;
        stoplossRecoveredCapital += recovered;
        closedHoldings.push({
          ...h,
          priceAtExit: Math.round(sellPrice * 100) / 100,
          exitReason: "STOP-LOSS",
          exitMonth: cutoffStr,
          exitValue: Math.round(recovered),
          returnPct: Math.round(RISK_MANAGEMENT.stopLossPct * 10000) / 100,
        });
        holdingsToRemove.add(i);
        stopLossEvents.push({ ticker: h.ticker, pct: RISK_MANAGEMENT.stopLossPct * 100 });
      } else if (hitTakeProfit) {
        const sellShares = Math.floor(h.shares * RISK_MANAGEMENT.takeProfitSellPct);
        if (sellShares > 0) {
          const sellPrice = h.priceAtEntry * (1 + RISK_MANAGEMENT.takeProfitPct);
          const recovered = sellShares * sellPrice;
          stoplossRecoveredCapital += recovered;
          activeHoldings[i] = { ...h, shares: h.shares - sellShares, tookProfit: true };
          takeProfitEvents.push({ ticker: h.ticker, sharesSold: sellShares, pct: RISK_MANAGEMENT.takeProfitPct * 100 });
        }
      }
    }

    // Remove stop-lossed positions
    for (const idx of [...holdingsToRemove].sort((a, b) => b - a)) {
      activeHoldings.splice(idx, 1);
    }

    // ── CORE: Buy ETF (including any recovered capital) ──
    const extraForCore = stoplossRecoveredCapital;
    stoplossRecoveredCapital = 0;
    const coreBudget = monthlyDeposit * corePct + extraForCore;
    let coreBought = null;
    if (coreHistory && coreBudget > 0) {
      const coreCut = coreHistory.filter(p => p.date <= cutoffStr);
      if (coreCut.length > 0) {
        const corePrice = coreCut[coreCut.length - 1].close;
        const coreShares = Math.floor(coreBudget / corePrice);
        if (coreShares > 0) {
          coreHoldings.push({
            ticker: coreETF, name: `${coreETF} ETF`, sector: "ETF - Índices",
            priceAtEntry: Math.round(corePrice * 100) / 100,
            shares: coreShares,
            invested: Math.round(coreShares * corePrice),
            boughtMonth: cutoffStr,
          });
          coreBought = { ticker: coreETF, shares: coreShares, invested: Math.round(coreShares * corePrice) };
        }
      }
    }

    // ── SATELLITE: Enhanced score and pick CEDEARs ──
    const satelliteBudget = monthlyDeposit * satellitePct;

    const scored = [];
    for (const c of candidates) {
      const fullHistory = historyMap[c.ticker];
      if (!fullHistory) continue;
      const cutHistory = fullHistory.filter(p => p.date <= cutoffStr);
      if (cutHistory.length < 30) continue;

      const enhancedScores = backtestScore(cutHistory, c.sector, profile);
      const priceAtCut = cutHistory[cutHistory.length - 1].close;

      scored.push({
        cedear: c,
        ticker: c.ticker,
        name: c.name,
        sector: c.sector,
        scores: enhancedScores,
        priceAtEntry: priceAtCut,
      });
    }

    scored.sort((a, b) => b.scores.composite - a.scores.composite);

    // ── Dynamic allocation: if few quality picks, shift more to core ──
    const qualityCount = scored.filter(s => s.scores.passesMomentumFilter && s.scores.composite >= 55).length;
    let actualSatBudget = satelliteBudget;
    let actualCoreBudget = 0;
    if (qualityCount < picksPerMonth) {
      // Shift some satellite budget to core
      const shiftPct = 1 - (qualityCount / picksPerMonth);
      const shifted = satelliteBudget * shiftPct * 0.5; // Shift half of the difference
      actualSatBudget -= shifted;
      actualCoreBudget = shifted;

      // Buy more core with the shifted capital
      if (coreHistory && actualCoreBudget > 0) {
        const coreCut = coreHistory.filter(p => p.date <= cutoffStr);
        if (coreCut.length > 0) {
          const corePrice = coreCut[coreCut.length - 1].close;
          const extraShares = Math.floor(actualCoreBudget / corePrice);
          if (extraShares > 0) {
            coreHoldings.push({
              ticker: coreETF, name: `${coreETF} ETF`, sector: "ETF - Índices",
              priceAtEntry: Math.round(corePrice * 100) / 100,
              shares: extraShares,
              invested: Math.round(extraShares * corePrice),
              boughtMonth: cutoffStr,
            });
          }
        }
      }
    }

    const monthPicks = selectDiversifiedPicks(scored, picksPerMonth);

    console.log(`[Backtest ${monthLabel}] Core: ${coreETF} $${Math.round(coreBudget).toLocaleString()} | Quality: ${qualityCount}/${scored.length} | Satellite: ${monthPicks.map(p => `${p.ticker}(${p.scores.composite})`).join(", ")} | SL events: ${stopLossEvents.length} | TP events: ${takeProfitEvents.length}`);

    const bought = [];
    const satellitePicks = [];
    if (coreBought) bought.push({ ticker: coreBought.ticker, sector: "ETF - Índices", isCore: true });

    if (monthPicks.length > 0 && actualSatBudget > 0) {
      const perPick = actualSatBudget / monthPicks.length;

      for (const pick of monthPicks) {
        const ticker = pick.cedear?.ticker || pick.ticker;
        const sector = pick.cedear?.sector || pick.sector;
        const name = pick.cedear?.name || pick.name;
        const priceAtEntry = pick.priceAtEntry || 0;
        if (priceAtEntry <= 0) continue;

        const shares = Math.floor(perPick / priceAtEntry);
        if (shares <= 0) continue;

        activeHoldings.push({
          ticker, name, sector,
          scoreAtEntry: pick.scores?.composite ?? 0,
          signal: pick.scores?.signal || "?",
          priceAtEntry: Math.round(priceAtEntry * 100) / 100,
          shares,
          invested: Math.round(shares * priceAtEntry),
          boughtMonth: cutoffStr,
          tookProfit: false,
          momentumOk: pick.scores?.passesMomentumFilter,
          trendOk: pick.scores?.passesTrendFilter,
          rsiAtEntry: pick.scores?.rsi,
        });

        bought.push({ ticker, sector, isCore: false, score: pick.scores?.composite });
        satellitePicks.push({ ticker, sector, score: pick.scores?.composite ?? 0 });
      }
    }

    meses.push({
      month: monthLabel,
      date: cutoffStr,
      bought,
      core: { ticker: coreETF, shares: coreBought?.shares || 0, monto: Math.round(coreBudget) },
      satellite: satellitePicks,
      corePct: Math.round(corePct * 100),
      satellitePct: Math.round(satellitePct * 100),
      holdingsCount: activeHoldings.length + coreHoldings.length,
      stopLossEvents: stopLossEvents.length,
      takeProfitEvents: takeProfitEvents.length,
      qualityPicksAvailable: qualityCount,
    });
  }

  if (activeHoldings.length === 0 && coreHoldings.length === 0 && closedHoldings.length === 0) {
    return { error: "No hay suficientes datos históricos para el backtest." };
  }

  // Calculate current values for active satellite holdings
  const holdings = [];
  for (const h of activeHoldings) {
    const fullHistory = historyMap[h.ticker];
    const currentPrice = fullHistory ? fullHistory[fullHistory.length - 1].close : h.priceAtEntry;
    const currentValue = h.shares * currentPrice;
    const returnPct = h.invested > 0 ? ((currentValue - h.invested) / h.invested) * 100 : 0;

    holdings.push({
      ...h,
      priceNow: Math.round(currentPrice * 100) / 100,
      currentValue: Math.round(currentValue),
      returnPct: Math.round(returnPct * 100) / 100,
      status: "ACTIVE",
    });
  }

  // Add closed holdings to the calculation
  for (const h of closedHoldings) {
    holdings.push({
      ...h,
      priceNow: h.priceAtExit,
      currentValue: h.exitValue,
      status: h.exitReason,
    });
  }

  // Calculate current values for core holdings
  const coreCurrentPrice = coreHistory ? coreHistory[coreHistory.length - 1].close : 0;
  let coreInvested = 0, coreCurrent = 0;
  for (const h of coreHoldings) {
    const value = h.shares * coreCurrentPrice;
    coreInvested += h.invested;
    coreCurrent += value;
  }
  const coreReturnPct = coreInvested > 0 ? Math.round(((coreCurrent - coreInvested) / coreInvested) * 10000) / 100 : 0;

  const satelliteInvested = holdings.reduce((s, h) => s + h.invested, 0);
  const satelliteCurrent = holdings.reduce((s, h) => s + h.currentValue, 0);
  const satelliteReturnPct = satelliteInvested > 0 ? Math.round(((satelliteCurrent - satelliteInvested) / satelliteInvested) * 10000) / 100 : 0;

  const totalInvested = coreInvested + satelliteInvested;
  const totalCurrent = coreCurrent + satelliteCurrent;
  const totalReturn = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

  // SPY benchmark for same period (pure SPY buy-and-hold)
  let spyReturn = null;
  try {
    const spyHistory = coreETF === "SPY" && coreHistory ? coreHistory : await fetchHistory("SPY.BA", totalMonths);
    const startCutoff = new Date();
    startCutoff.setMonth(startCutoff.getMonth() - months);
    const startStr = startCutoff.toISOString().slice(0, 10);
    const spyCut = spyHistory.filter(p => p.date <= startStr);
    if (spyCut.length > 0 && spyHistory.length > 0) {
      const spyEntry = spyCut[spyCut.length - 1].close;
      const spyNow = spyHistory[spyHistory.length - 1].close;
      spyReturn = Math.round(((spyNow - spyEntry) / spyEntry) * 10000) / 100;
    }
  } catch (e) {
    try {
      const spyH = await fetchHistory("SPY", totalMonths);
      const startCutoff = new Date();
      startCutoff.setMonth(startCutoff.getMonth() - months);
      const startStr = startCutoff.toISOString().slice(0, 10);
      const spyCut = spyH.filter(p => p.date <= startStr);
      if (spyCut.length > 0 && spyH.length > 0) {
        spyReturn = Math.round(((spyH[spyH.length - 1].close - spyCut[spyCut.length - 1].close) / spyCut[spyCut.length - 1].close) * 10000) / 100;
      }
    } catch {}
  }

  holdings.sort((a, b) => (b.returnPct || 0) - (a.returnPct || 0));
  const spyVal = spyReturn || 0;
  const beatsSPY = spyReturn != null ? totalReturn > spyReturn : null;

  const entryDate = new Date();
  entryDate.setMonth(entryDate.getMonth() - months);

  const returnPctRounded = Math.round(totalReturn * 100) / 100;
  const spyRounded = spyReturn != null ? Math.round(spyReturn * 100) / 100 : null;

  const corePnl = Math.round(coreCurrent - coreInvested);
  const satellitePnl = Math.round(satelliteCurrent - satelliteInvested);
  const satelliteGeneraAlfa = spyReturn != null ? satelliteReturnPct > spyReturn : null;
  const satelliteAlpha = spyReturn != null ? Math.round((satelliteReturnPct - spyReturn) * 100) / 100 : null;

  // Aggregate satellite holdings by ticker for the detail table
  const satByTicker = {};
  for (const h of holdings) {
    if (!satByTicker[h.ticker]) {
      satByTicker[h.ticker] = { ticker: h.ticker, sector: h.sector, shares: 0, invested: 0, currentValue: 0, stopLossed: false, tookProfit: false };
    }
    satByTicker[h.ticker].shares += h.shares;
    satByTicker[h.ticker].invested += h.invested;
    satByTicker[h.ticker].currentValue += h.currentValue;
    if (h.status === "STOP-LOSS") satByTicker[h.ticker].stopLossed = true;
    if (h.tookProfit) satByTicker[h.ticker].tookProfit = true;
  }
  const satDetails = Object.values(satByTicker).map(d => ({
    ...d,
    returnPct: d.invested > 0 ? Math.round(((d.currentValue - d.invested) / d.invested) * 10000) / 100 : 0,
  }));
  satDetails.sort((a, b) => b.returnPct - a.returnPct);

  // Risk management stats
  const totalStopLosses = closedHoldings.filter(h => h.exitReason === "STOP-LOSS").length;
  const capitalSavedByStopLoss = closedHoldings
    .filter(h => h.exitReason === "STOP-LOSS")
    .reduce((sum, h) => {
      // How much MORE would have been lost without stop-loss
      const fullHistory = historyMap[h.ticker];
      if (!fullHistory) return sum;
      const finalPrice = fullHistory[fullHistory.length - 1].close;
      const wouldHaveLost = h.shares * (h.priceAtEntry - finalPrice);
      const actuallyLost = h.shares * (h.priceAtEntry - h.priceAtExit);
      return sum + Math.max(0, wouldHaveLost - actuallyLost);
    }, 0);

  // Pick analysis — which picks beat SPY?
  const picksVsSpy = satDetails.map(d => ({
    ticker: d.ticker,
    sector: d.sector,
    returnPct: d.returnPct,
    vsSpy: spyReturn != null ? Math.round((d.returnPct - spyReturn) * 100) / 100 : null,
    beatsSpy: spyReturn != null ? d.returnPct > spyReturn : null,
  }));
  const picksThatBeatSpy = picksVsSpy.filter(p => p.beatsSpy).length;

  function generateVerdict(total, spy, core, sat) {
    const s = spy || 0;
    if (total > s + 0.5) {
      return `GANAMOS: El portfolio combinado (+${total}%) le ganó a SPY (+${s}%). El stock picking del satellite sumó valor. ${picksThatBeatSpy}/${satDetails.length} picks individuales superaron a SPY.`;
    }
    if (sat > s + 0.5) {
      return `SATELLITE GANA: Los picks del bot (+${sat}%) superaron a SPY (+${s}%), pero el mix con core diluyó el resultado total a +${total}%.`;
    }
    if (Math.abs(total - s) <= 3) {
      return `EMPATE TÉCNICO: Portfolio +${total}% vs SPY +${s}%. La estrategia core protegió contra una caída mayor del satellite. ${totalStopLosses} stop-losses ejecutados protegieron capital.`;
    }
    if (core > sat) {
      return `CORE GANÓ: La parte ${coreETF} (+${core}%) rindió más que los picks del bot (+${sat}%). El satellite no generó alfa este periodo. Considerar aumentar el % core.`;
    }
    return `SPY GANÓ: +${s}% vs portfolio +${total}%. El satellite (+${sat}%) no superó al mercado. ${totalStopLosses} stop-losses limitaron pérdidas mayores.`;
  }

  // Strategy explanation
  const strategyExplanation = {
    que_hace: `Estrategia Core/Satellite con gestión de riesgo activa. Core: ${Math.round(corePct * 100)}% en ${coreETF}. Satellite: ${Math.round(satellitePct * 100)}% en ${picksPerMonth} picks por mes.`,
    filtros_aplicados: [
      "Filtro de momentum: solo compra si precio > SMA20 (tendencia corta alcista)",
      "Filtro de tendencia: bonus si precio > SMA50 (tendencia media alcista)",
      "Filtro RSI: penaliza sobrecomprados (>70), premia oversold rebotando (<35 + MACD positivo)",
      "Confirmación MACD: requiere histograma positivo",
      "Diversificación: slots forzados por categoría (growth, defensive, hedge)",
      "Si no hay suficientes picks de calidad, reasigna capital al core ETF",
    ],
    gestion_riesgo: [
      `Stop-loss: -${Math.abs(RISK_MANAGEMENT.stopLossPct * 100)}% desde precio de entrada → vende todo`,
      `Take-profit parcial: +${RISK_MANAGEMENT.takeProfitPct * 100}% → vende ${RISK_MANAGEMENT.takeProfitSellPct * 100}%`,
      "Capital recuperado de stop-losses se reinvierte en core ETF",
    ],
    resultados_riesgo: {
      stopLossesEjecutados: totalStopLosses,
      capitalProtegido: Math.round(capitalSavedByStopLoss),
      picksBeatSpy: `${picksThatBeatSpy}/${satDetails.length}`,
    },
    por_que_estos_picks: satDetails.slice(0, 5).map(d => {
      const vsSpy = spyReturn != null ? d.returnPct - spyReturn : 0;
      return `${d.ticker} (${d.sector}): ${d.returnPct >= 0 ? "+" : ""}${d.returnPct}% ${vsSpy > 0 ? `— LE GANÓ a SPY por +${vsSpy.toFixed(1)}pp` : `— no superó a SPY por ${vsSpy.toFixed(1)}pp`}${d.stopLossed ? " (fue cortado por stop-loss)" : ""}`;
    }),
  };

  return {
    config: { months, monthlyDeposit, profile, picksPerMonth, corePct: Math.round(corePct * 100) },
    entryDate: entryDate.toISOString().slice(0, 10),

    resultado: {
      totalInvertido: Math.round(totalInvested),
      valorFinal: Math.round(totalCurrent),
      returnPct: returnPctRounded,
      spyReturnPct: spyRounded,
      beatsSPY,
      alpha: spyReturn != null ? Math.round((totalReturn - spyReturn) * 100) / 100 : null,
    },

    core: {
      etf: coreETF,
      invertido: Math.round(coreInvested),
      valorActual: Math.round(coreCurrent),
      returnPct: coreReturnPct,
      pnl: corePnl,
      holdings: Object.entries(
        coreHoldings.reduce((acc, h) => {
          if (!acc[h.ticker]) acc[h.ticker] = { ticker: h.ticker, shares: 0 };
          acc[h.ticker].shares += h.shares;
          return acc;
        }, {})
      ).map(([, v]) => v),
    },

    satellite: {
      invertido: Math.round(satelliteInvested),
      valorActual: Math.round(satelliteCurrent),
      returnPct: satelliteReturnPct,
      pnl: satellitePnl,
      generaAlfa: satelliteGeneraAlfa,
      alpha: satelliteAlpha,
      holdings: satDetails,
      mejorPick: satDetails[0] || null,
      peorPick: satDetails[satDetails.length - 1] || null,
    },

    riskManagement: {
      stopLosses: totalStopLosses,
      capitalProtegido: Math.round(capitalSavedByStopLoss),
      takeProfitEvents: closedHoldings.filter(h => h.exitReason !== "STOP-LOSS").length,
      picksVsSpy,
    },

    estrategia: strategyExplanation,

    meses,

    veredicto: generateVerdict(returnPctRounded, spyRounded, coreReturnPct, satelliteReturnPct),
  };
}
