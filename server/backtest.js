/** @format */
import { fetchHistory } from "./marketData.js";
import { technicalAnalysis, compositeScore } from "./analysis.js";
import CEDEARS from "./cedears.js";
import { BACKTEST_CONFIG, SECTOR_CATEGORIES } from "./config.js";
import { chunkArray, sleep } from "./utils.js";
import { calculateBrokerCosts } from "./brokerCosts.js";
import { getCedearLotSize } from "./cedears.js";

function getCategory(sector) {
  for (const [cat, sectors] of Object.entries(SECTOR_CATEGORIES)) {
    if (sectors.includes(sector)) return cat;
  }
  return "other";
}

function selectBacktestCandidates(allCedears, maxPerSector = BACKTEST_CONFIG.maxPerSector, maxTotal = BACKTEST_CONFIG.maxTotalCandidates) {
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

  if (sma20 && currentPrice < sma20) enhancedScore -= 20;
  if (sma50 && currentPrice > sma50) enhancedScore += 10;
  else if (sma50) enhancedScore -= 15;

  if (rsi > 75) enhancedScore -= 20;
  else if (rsi > 65) enhancedScore -= 8;
  else if (rsi < 35 && macdHist > 0) enhancedScore += 15;
  else if (rsi < 40 && rsi > 30) enhancedScore += 8;

  if (macdHist > 0) enhancedScore += 8;
  else enhancedScore -= 5;

  if (perf.month1 != null) {
    if (perf.month1 > 5) enhancedScore += 10;
    else if (perf.month1 > 0) enhancedScore += 3;
    else if (perf.month1 < -15) enhancedScore -= 12;
    else if (perf.month1 < -5) enhancedScore -= 5;
  }

  const bb = indicators.bollingerBands;
  if (bb) {
    const bbPosition = (currentPrice - bb.lower) / (bb.upper - bb.lower);
    if (bbPosition < 0.2) enhancedScore += 10;
    else if (bbPosition > 0.85) enhancedScore -= 8;
  }

  const volTrend = indicators.volume?.volumeTrend || 0;
  if (volTrend > 20 && perf.month1 > 0) enhancedScore += 5;

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

function selectDiversifiedPicks(scored, numPicks = BACKTEST_CONFIG.defaultPicksPerMonth) {
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

  const qualityPicks = scored.filter((s) => s.scores.passesMomentumFilter && s.scores.composite >= 50);
  const fallbackPicks = scored.filter((s) => s.scores.composite >= 45);
  const pool = qualityPicks.length >= numPicks ? qualityPicks : fallbackPicks.length >= numPicks ? fallbackPicks : scored;

  for (const item of pool) {
    if (picks.length >= 1) break;
    if (getCategory(item.cedear?.sector || item.sector) === "growth") tryAdd(item);
  }
  for (const item of pool) {
    if (picks.length >= 2) break;
    if (getCategory(item.cedear?.sector || item.sector) === "defensive") tryAdd(item);
  }
  for (const item of pool) {
    if (picks.length >= 3) break;
    if (getCategory(item.cedear?.sector || item.sector) === "hedge") tryAdd(item);
  }
  for (const item of pool) {
    if (picks.length >= numPicks) break;
    const ticker = item.cedear?.ticker || item.ticker;
    const sector = item.cedear?.sector || item.sector;
    if (usedTickers.has(ticker)) continue;
    if ((usedSectors[sector] || 0) >= 1 && picks.length < numPicks - 1) continue;
    tryAdd(item);
  }
  for (const item of scored) {
    if (picks.length >= numPicks) break;
    const ticker = item.cedear?.ticker || item.ticker;
    if (!usedTickers.has(ticker)) tryAdd(item);
  }

  return picks;
}

const CORE_ALLOCATION = {
  conservative: { corePct: 0.80, coreETF: "SPY" },
  moderate: { corePct: 0.50, coreETF: "SPY" },
  aggressive: { corePct: 0.30, coreETF: "QQQ" },
};

const RISK = {
  stopLossPct: BACKTEST_CONFIG.stopLossPct,
  takeProfitPct: BACKTEST_CONFIG.takeProfitPct,
  takeProfitSellPct: BACKTEST_CONFIG.takeProfitSellPct,
};
const COMMISSION = BACKTEST_CONFIG.commissionPct || 0;
const SLIPPAGE = BACKTEST_CONFIG.slippagePct || 0;

function applyBrokerCosts(grossAmount) {
  const costs = calculateBrokerCosts(grossAmount);
  return costs.totalCosts;
}

function applyLotSize(ticker, rawShares) {
  const lot = getCedearLotSize(ticker);
  return Math.floor(rawShares / lot) * lot;
}

function historyDateKey(point) {
  const raw = point?.date;
  if (!raw) return "";
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return String(raw).slice(0, 10);
}

function isHistoryOnOrBefore(point, cutoffStr) {
  const key = historyDateKey(point);
  return key.length > 0 && key <= cutoffStr;
}

function isHistoryAfter(point, cutoffStr) {
  const key = historyDateKey(point);
  return key.length > 0 && key > cutoffStr;
}

/**
 * Detecta look-ahead bias para un período de backtest dado.
 * Verifica que los datos pasados a scoring/selección NO contengan precios
 * posteriores al cutoff. Si se detecta bias, el mes debe ser excluido.
 *
 * @param {Object} historyMap - Mapa ticker → array de precios
 * @param {string} cutoffStr - Fecha de corte ISO "YYYY-MM-DD"
 * @returns {{ clean: boolean, tickers: string[] }} - clean=false si hay bias; tickers afectados
 */
function checkLookAheadBias(historyMap, cutoffStr) {
  const biasedTickers = [];
  for (const [ticker, history] of Object.entries(historyMap)) {
    const futureData = history.filter((p) => isHistoryAfter(p, cutoffStr));
    if (futureData.length > 0) {
      console.warn(`[backtest] LOOK-AHEAD BIAS detectado en ${ticker}: ${futureData.length} puntos futuros respecto a cutoff ${cutoffStr}`);
      biasedTickers.push(ticker);
    }
  }
  return { clean: biasedTickers.length === 0, tickers: biasedTickers };
}

export async function runBacktest({ months = BACKTEST_CONFIG.defaultMonths, monthlyDeposit = BACKTEST_CONFIG.defaultMonthlyDeposit, profile = "moderate", picksPerMonth = BACKTEST_CONFIG.defaultPicksPerMonth } = {}) {
  const candidates = selectBacktestCandidates(CEDEARS);
  const { corePct, coreETF } = CORE_ALLOCATION[profile] || CORE_ALLOCATION.moderate;
  const satellitePct = 1 - corePct;
  const totalMonths = months + BACKTEST_CONFIG.historyBufferMonths;

  const historyMap = {};
  const batches = chunkArray(candidates, BACKTEST_CONFIG.batchSize);
  for (const batch of batches) {
    const results = await Promise.allSettled(
      batch.map((c) => fetchHistory(`${c.ticker}.BA`, totalMonths).then((h) => ({ ticker: c.ticker, h })))
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.h.length > 30) {
        historyMap[r.value.ticker] = r.value.h;
      }
    }
  }

  let coreHistory = null;
  try {
    coreHistory = await fetchHistory(`${coreETF}.BA`, totalMonths);
    if (coreHistory.length < 30) coreHistory = null;
  } catch (e) {
    console.warn("[backtest] coreHistory .BA fetch failed:", e.message);
    try {
      coreHistory = await fetchHistory(coreETF, totalMonths);
    } catch (e2) {
      console.warn("[backtest] coreHistory fallback fetch failed:", e2.message);
    }
  }

  const activeHoldings = [];
  const closedHoldings = [];
  const coreHoldings = [];
  const meses = [];
  let stoplossRecoveredCapital = 0;
  const backtestWarnings = [];
  let biasFreePeriods = 0;
  const totalPeriods = months;

  for (let m = months; m >= 1; m--) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - m);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);
    const monthLabel = cutoffDate.toLocaleDateString("es-AR", { year: "numeric", month: "short" });

    // Per-month look-ahead bias check: build a filtered historyMap up to cutoff
    const cutoffHistoryMap = {};
    let monthHasBias = false;
    for (const [ticker, history] of Object.entries(historyMap)) {
      const cutHistory = history.filter((p) => isHistoryOnOrBefore(p, cutoffStr));
      cutoffHistoryMap[ticker] = cutHistory;
    }
    // Verify no future data leaked into the cut history
    const biasCheck = checkLookAheadBias(cutoffHistoryMap, cutoffStr);
    if (!biasCheck.clean) {
      monthHasBias = true;
      backtestWarnings.push(`Look-ahead bias detectado en mes ${monthLabel}. Resultados de ese período excluidos.`);
      meses.push({
        month: monthLabel, date: cutoffStr, bought: [],
        skipped: true, skipReason: 'look-ahead bias',
        core: { ticker: coreETF, shares: 0, monto: 0 },
        satellite: [],
        corePct: Math.round(corePct * 100),
        satellitePct: Math.round(satellitePct * 100),
        holdingsCount: activeHoldings.length + coreHoldings.length,
        stopLossEvents: 0, takeProfitEvents: 0, qualityPicksAvailable: 0,
      });
      continue;
    }
    biasFreePeriods++;

    // Check stop-loss / take-profit
    const stopLossEvents = [];
    const takeProfitEvents = [];
    const holdingsToRemove = new Set();

    for (let i = 0; i < activeHoldings.length; i++) {
      const h = activeHoldings[i];
      const fullHistory = historyMap[h.ticker];
      if (!fullHistory) continue;

      const cutPrices = fullHistory.filter((p) => isHistoryOnOrBefore(p, cutoffStr));
      if (cutPrices.length === 0) continue;
      const currentPrice = cutPrices[cutPrices.length - 1].close;

      const pricesSinceEntry = fullHistory.filter((p) => isHistoryAfter(p, h.boughtMonth) && isHistoryOnOrBefore(p, cutoffStr));
      let hitStopLoss = false;
      let hitTakeProfit = false;

      for (const dayPrice of pricesSinceEntry) {
        const dayChange = (dayPrice.close - h.priceAtEntry) / h.priceAtEntry;
        if (dayChange <= RISK.stopLossPct) {
          hitStopLoss = true;
          break;
        }
        if (dayChange >= RISK.takeProfitPct && !h.tookProfit) {
          hitTakeProfit = true;
          break;
        }
      }

      if (hitStopLoss) {
        const sellPrice = h.priceAtEntry * (1 + RISK.stopLossPct) * (1 - SLIPPAGE);
        const grossRecovered = h.shares * sellPrice;
        const commission = applyBrokerCosts(grossRecovered);
        const recovered = grossRecovered - commission;
        stoplossRecoveredCapital += recovered;
        const returnPct = h.invested > 0 ? ((recovered - h.invested) / h.invested) * 100 : 0;
        closedHoldings.push({
          ...h,
          priceAtExit: Math.round(sellPrice * 100) / 100,
          exitReason: "STOP-LOSS",
          exitMonth: cutoffStr,
          exitValue: Math.round(recovered),
          returnPct: Math.round(returnPct * 100) / 100,
        });
        holdingsToRemove.add(i);
        stopLossEvents.push({ ticker: h.ticker, pct: RISK.stopLossPct * 100 });
      } else if (hitTakeProfit) {
        const sellSharesRaw = Math.floor(h.shares * RISK.takeProfitSellPct);
        const sellShares = applyLotSize(h.ticker, sellSharesRaw);
        if (sellShares > 0) {
          const sellPrice = h.priceAtEntry * (1 + RISK.takeProfitPct) * (1 - SLIPPAGE);
          const grossRecovered = sellShares * sellPrice;
          const commission = applyBrokerCosts(grossRecovered);
          const recovered = grossRecovered - commission;
          stoplossRecoveredCapital += recovered;
          activeHoldings[i] = { ...h, shares: h.shares - sellShares, tookProfit: true };
          takeProfitEvents.push({ ticker: h.ticker, sharesSold: sellShares, pct: RISK.takeProfitPct * 100 });
        }
        // Si sellShares === 0, NO marcar tookProfit para permitir futuros take-profits
      }
    }

    for (const idx of [...holdingsToRemove].sort((a, b) => b - a)) {
      activeHoldings.splice(idx, 1);
    }

    // Core purchase
    const extraForCore = stoplossRecoveredCapital;
    stoplossRecoveredCapital = 0;
    const coreBudget = monthlyDeposit * corePct + extraForCore;
    let coreBought = null;
    if (coreHistory && coreBudget > 0) {
      const coreCut = coreHistory.filter((p) => isHistoryOnOrBefore(p, cutoffStr));
      if (coreCut.length > 0) {
        const rawCorePrice = coreCut[coreCut.length - 1].close;
        const corePrice = rawCorePrice * (1 + SLIPPAGE);
        const rawShares = Math.floor(coreBudget / corePrice);
        const coreShares = applyLotSize(coreETF, rawShares);
        if (coreShares > 0) {
          const invested = coreShares * corePrice;
          const commission = applyBrokerCosts(invested);
          coreHoldings.push({
            ticker: coreETF, name: `${coreETF} ETF`, sector: "ETF - Índices",
            priceAtEntry: Math.round(corePrice * 100) / 100,
            shares: coreShares,
            invested: Math.round(invested + commission),
            boughtMonth: cutoffStr,
          });
          coreBought = { ticker: coreETF, shares: coreShares, invested: Math.round(invested + commission) };
        }
      }
    }

    // Satellite scoring
    const satelliteBudget = monthlyDeposit * satellitePct;
    const scored = [];
    for (const c of candidates) {
      const fullHistory = historyMap[c.ticker];
      if (!fullHistory) continue;
      const cutHistory = fullHistory.filter((p) => isHistoryOnOrBefore(p, cutoffStr));
      if (cutHistory.length < 30) continue;

      const enhancedScores = backtestScore(cutHistory, c.sector, profile);
      const priceAtCut = cutHistory[cutHistory.length - 1].close;
      scored.push({ cedear: c, ticker: c.ticker, name: c.name, sector: c.sector, scores: enhancedScores, priceAtEntry: priceAtCut });
    }

    scored.sort((a, b) => b.scores.composite - a.scores.composite);

    // Dynamic allocation: if few quality picks, shift more to core
    const qualityCount = scored.filter((s) => s.scores.passesMomentumFilter && s.scores.composite >= 55).length;
    let actualSatBudget = satelliteBudget;
    let actualCoreBudget = 0;
    if (qualityCount < picksPerMonth) {
      const shiftPct = 1 - qualityCount / picksPerMonth;
      const shifted = satelliteBudget * shiftPct * 0.5;
      actualSatBudget -= shifted;
      actualCoreBudget = shifted;

      if (coreHistory && actualCoreBudget > 0) {
        const coreCut = coreHistory.filter((p) => isHistoryOnOrBefore(p, cutoffStr));
        if (coreCut.length > 0) {
          const corePrice = coreCut[coreCut.length - 1].close;
          const rawShares = Math.floor(actualCoreBudget / corePrice);
          const extraShares = applyLotSize(coreETF, rawShares);
          if (extraShares > 0) {
            const invested = extraShares * corePrice;
            const commission = applyBrokerCosts(invested);
            coreHoldings.push({
              ticker: coreETF, name: `${coreETF} ETF`, sector: "ETF - Índices",
              priceAtEntry: Math.round(corePrice * 100) / 100,
              shares: extraShares,
              invested: Math.round(invested + commission),
              boughtMonth: cutoffStr,
            });
          }
        }
      }
    }

    const monthPicks = selectDiversifiedPicks(scored, picksPerMonth);
    console.log(`[Backtest ${monthLabel}] Core: ${coreETF} $${Math.round(coreBudget).toLocaleString()} | Quality: ${qualityCount}/${scored.length} | Satellite: ${monthPicks.map((p) => `${p.ticker}(${p.scores.composite})`).join(", ")} | SL: ${stopLossEvents.length} | TP: ${takeProfitEvents.length}`);

    const bought = [];
    const satellitePicks = [];
    if (coreBought) bought.push({ ticker: coreBought.ticker, sector: "ETF - Índices", isCore: true });

    if (monthPicks.length > 0 && actualSatBudget > 0) {
      const perPick = actualSatBudget / monthPicks.length;
      for (const pick of monthPicks) {
        const ticker = pick.cedear?.ticker || pick.ticker;
        const sector = pick.cedear?.sector || pick.sector;
        const name = pick.cedear?.name || pick.name;
        const rawPrice = pick.priceAtEntry || 0;
        if (rawPrice <= 0) continue;
        const priceAtEntry = rawPrice * (1 + SLIPPAGE);
        const rawShares = Math.floor(perPick / priceAtEntry);
        const shares = applyLotSize(ticker, rawShares);
        if (shares <= 0) continue;
        const invested = shares * priceAtEntry;
        const commission = applyBrokerCosts(invested);

        activeHoldings.push({
          ticker, name, sector,
          scoreAtEntry: pick.scores?.composite ?? 0,
          signal: pick.scores?.signal || "?",
          priceAtEntry: Math.round(priceAtEntry * 100) / 100,
          shares,
          invested: Math.round(invested + commission),
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
      month: monthLabel, date: cutoffStr, bought,
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

  // Look-ahead bias reliability assessment
  const biasPct = totalPeriods > 0 ? ((totalPeriods - biasFreePeriods) / totalPeriods) * 100 : 0;
  const biasReliability = {
    biasFreePeriods,
    totalPeriods,
    biasPct: Math.round(biasPct * 100) / 100,
    reliable: biasPct <= 30,
  };
  if (!biasReliability.reliable) {
    backtestWarnings.push(`Backtest no confiable: >${Math.round(biasPct)}% de períodos con look-ahead bias.`);
  }

  if (activeHoldings.length === 0 && coreHoldings.length === 0 && closedHoldings.length === 0) {
    return { error: "No hay suficientes datos históricos para el backtest." };
  }

  const holdings = [];
  for (const h of activeHoldings) {
    const fullHistory = historyMap[h.ticker];
    const currentPrice = fullHistory ? fullHistory[fullHistory.length - 1].close : h.priceAtEntry;
    const currentValue = h.shares * currentPrice;
    const returnPct = h.invested > 0 ? ((currentValue - h.invested) / h.invested) * 100 : 0;
    holdings.push({ ...h, priceNow: Math.round(currentPrice * 100) / 100, currentValue: Math.round(currentValue), returnPct: Math.round(returnPct * 100) / 100, status: "ACTIVE" });
  }
  for (const h of closedHoldings) {
    holdings.push({ ...h, priceNow: h.priceAtExit, currentValue: h.exitValue, status: h.exitReason });
  }

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

  // SPY benchmark: DCA mensual con comisiones y slippage
  let spyReturn = null;
  let spyDcaInvested = 0;
  let spyDcaShares = 0;
  let spyHistory = null;
  try {
    spyHistory = coreETF === "SPY" && coreHistory ? coreHistory : await fetchHistory("SPY.BA", totalMonths);
    // Simular DCA mensual en SPY con comisiones
    for (let m = months; m >= 1; m--) {
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - m);
      const cutoffStr = cutoffDate.toISOString().slice(0, 10);
      const spyCut = spyHistory.filter((p) => isHistoryOnOrBefore(p, cutoffStr));
        if (spyCut.length > 0) {
          const rawPrice = spyCut[spyCut.length - 1].close;
          const price = rawPrice * (1 + SLIPPAGE);
          const rawShares = Math.floor(monthlyDeposit / price);
          const shares = applyLotSize("SPY", rawShares);
          if (shares > 0) {
            const invested = shares * price;
            const commission = applyBrokerCosts(invested);
            spyDcaShares += shares;
            spyDcaInvested += invested + commission;
          }
        }
    }
    const spyNow = spyHistory[spyHistory.length - 1].close;
    const spyCurrentValue = spyDcaShares * spyNow * (1 - SLIPPAGE) * (1 - COMMISSION);
    spyReturn = spyDcaInvested > 0 ? Math.round(((spyCurrentValue - spyDcaInvested) / spyDcaInvested) * 10000) / 100 : 0;
  } catch (e) {
    console.warn("[backtest] SPY.BA history fetch failed:", e.message);
    try {
      const spyH = await fetchHistory("SPY", totalMonths);
      spyHistory = spyH;
      spyDcaInvested = 0; spyDcaShares = 0;
      for (let m = months; m >= 1; m--) {
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - m);
        const cutoffStr = cutoffDate.toISOString().slice(0, 10);
        const spyCut = spyH.filter((p) => isHistoryOnOrBefore(p, cutoffStr));
        if (spyCut.length > 0) {
          const rawPrice = spyCut[spyCut.length - 1].close;
          const price = rawPrice * (1 + SLIPPAGE);
          const rawShares = Math.floor(monthlyDeposit / price);
          const shares = applyLotSize("SPY", rawShares);
          if (shares > 0) {
            const invested = shares * price;
            const commission = applyBrokerCosts(invested);
            spyDcaShares += shares;
            spyDcaInvested += invested + commission;
          }
        }
      }
      const spyNow = spyH[spyH.length - 1].close;
      const spyCurrentValue = spyDcaShares * spyNow * (1 - SLIPPAGE) * (1 - COMMISSION);
      spyReturn = spyDcaInvested > 0 ? Math.round(((spyCurrentValue - spyDcaInvested) / spyDcaInvested) * 10000) / 100 : 0;
    } catch (e2) {
      console.warn("[backtest] SPY history fallback failed:", e2.message);
    }
  }

  holdings.sort((a, b) => (b.returnPct || 0) - (a.returnPct || 0));
  const beatsSPY = spyReturn != null ? totalReturn > spyReturn : null;

  const entryDate = new Date();
  entryDate.setMonth(entryDate.getMonth() - months);

  const returnPctRounded = Math.round(totalReturn * 100) / 100;
  const spyRounded = spyReturn != null ? Math.round(spyReturn * 100) / 100 : null;

  const corePnl = Math.round(coreCurrent - coreInvested);
  const satellitePnl = Math.round(satelliteCurrent - satelliteInvested);
  const satelliteGeneraAlfa = spyReturn != null ? satelliteReturnPct > spyReturn : null;
  const satelliteAlpha = spyReturn != null ? Math.round((satelliteReturnPct - spyReturn) * 100) / 100 : null;

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
  const satDetails = Object.values(satByTicker).map((d) => ({
    ...d,
    returnPct: d.invested > 0 ? Math.round(((d.currentValue - d.invested) / d.invested) * 10000) / 100 : 0,
  }));
  satDetails.sort((a, b) => b.returnPct - a.returnPct);

  const spyDcaCurrentValue = spyDcaShares * (spyHistory ? spyHistory[spyHistory.length - 1].close : 0) * (1 - SLIPPAGE) * (1 - COMMISSION);
  const totalStopLosses = closedHoldings.filter((h) => h.exitReason === "STOP-LOSS").length;
  const capitalSavedByStopLoss = closedHoldings
    .filter((h) => h.exitReason === "STOP-LOSS")
    .reduce((sum, h) => {
      const fullHistory = historyMap[h.ticker];
      if (!fullHistory) return sum;
      const finalPrice = fullHistory[fullHistory.length - 1].close;
      const wouldHaveLost = h.shares * (h.priceAtEntry - finalPrice);
      const actuallyLost = h.shares * (h.priceAtEntry - h.priceAtExit);
      return sum + Math.max(0, wouldHaveLost - actuallyLost);
    }, 0);

  const picksVsSpy = satDetails.map((d) => ({
    ticker: d.ticker,
    sector: d.sector,
    returnPct: d.returnPct,
    vsSpy: spyReturn != null ? Math.round((d.returnPct - spyReturn) * 100) / 100 : null,
    beatsSpy: spyReturn != null ? d.returnPct > spyReturn : null,
  }));
  const picksThatBeatSpy = picksVsSpy.filter((p) => p.beatsSpy).length;

  function generateVerdict(total, spy, core, sat) {
    const s = spy || 0;
    if (total > s + 0.5) {
      return `GANAMOS: Portfolio combinado (+${total}%) le ganó a SPY (+${s}%). ${picksThatBeatSpy}/${satDetails.length} picks superaron a SPY.`;
    }
    if (sat > s + 0.5) {
      return `SATELLITE GANA: Picks (+${sat}%) superaron a SPY (+${s}%), pero el mix con core diluyó a +${total}%.`;
    }
    if (Math.abs(total - s) <= 3) {
      return `EMPATE TÉCNICO: Portfolio +${total}% vs SPY +${s}%. ${totalStopLosses} stop-losses ejecutados protegieron capital.`;
    }
    if (core > sat) {
      return `CORE GANÓ: ${coreETF} (+${core}%) rindió más que los picks (+${sat}%). Considerar aumentar % core.`;
    }
    return `SPY GANÓ: +${s}% vs portfolio +${total}%. El satellite (+${sat}%) no superó al mercado. ${totalStopLosses} stop-losses limitaron pérdidas.`;
  }

  return {
    config: { months, monthlyDeposit, profile, picksPerMonth, corePct: Math.round(corePct * 100) },
    entryDate: entryDate.toISOString().slice(0, 10),
    warnings: backtestWarnings,
    biasReliability,
    resultado: {
      totalInvertido: Math.round(totalInvested),
      valorFinal: Math.round(totalCurrent),
      returnPct: returnPctRounded,
      spyReturnPct: spyRounded,
      beatsSPY,
      alpha: spyReturn != null ? Math.round((totalReturn - spyReturn) * 100) / 100 : null,
      spyDca: {
        invertido: Math.round(spyDcaInvested),
        valorFinal: Math.round(spyDcaCurrentValue),
        returnPct: spyRounded,
      },
      costs: {
        commissionPct: COMMISSION * 100,
        slippagePct: SLIPPAGE * 100,
      },
    },
    core: {
      etf: coreETF,
      invertido: Math.round(coreInvested),
      valorActual: Math.round(coreCurrent),
      returnPct: coreReturnPct,
      pnl: corePnl,
      holdings: Object.entries(coreHoldings.reduce((acc, h) => {
        if (!acc[h.ticker]) acc[h.ticker] = { ticker: h.ticker, shares: 0 };
        acc[h.ticker].shares += h.shares;
        return acc;
      }, {})).map(([, v]) => v),
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
      takeProfitEvents: closedHoldings.filter((h) => h.exitReason !== "STOP-LOSS").length,
      picksVsSpy,
    },
    estrategia: {
      que_hace: `Estrategia Core/Satellite con gestión de riesgo activa. Core: ${Math.round(corePct * 100)}% en ${coreETF}. Satellite: ${Math.round(satellitePct * 100)}% en ${picksPerMonth} picks por mes.`,
      filtros_aplicados: [
        "Filtro de momentum: solo compra si precio > SMA20",
        "Filtro de tendencia: bonus si precio > SMA50",
        "Filtro RSI: penaliza sobrecomprados (>70), premia oversold rebotando (<35 + MACD positivo)",
        "Confirmación MACD: requiere histograma positivo",
        "Diversificación: slots forzados por categoría (growth, defensive, hedge)",
        "Si no hay suficientes picks de calidad, reasigna capital al core ETF",
      ],
      gestion_riesgo: [
        `Stop-loss: ${Math.abs(RISK.stopLossPct * 100)}% desde entrada → vende todo`,
        `Take-profit parcial: +${RISK.takeProfitPct * 100}% → vende ${RISK.takeProfitSellPct * 100}%`,
        "Capital recuperado de stop-losses se reinvierte en core ETF",
      ],
      resultados_riesgo: {
        stopLossesEjecutados: totalStopLosses,
        capitalProtegido: Math.round(capitalSavedByStopLoss),
        picksBeatSpy: `${picksThatBeatSpy}/${satDetails.length}`,
      },
      por_que_estos_picks: satDetails.slice(0, 5).map((d) => {
        const vsSpy = spyReturn != null ? d.returnPct - spyReturn : 0;
        return `${d.ticker} (${d.sector}): ${d.returnPct >= 0 ? "+" : ""}${d.returnPct}% ${vsSpy > 0 ? `— LE GANÓ a SPY por +${vsSpy.toFixed(1)}pp` : `— no superó a SPY por ${vsSpy.toFixed(1)}pp`}${d.stopLossed ? " (fue cortado por stop-loss)" : ""}`;
      }),
    },
    meses,
    veredicto: generateVerdict(returnPctRounded, spyRounded, coreReturnPct, satelliteReturnPct),
  };
}
