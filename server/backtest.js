import { fetchHistory, fetchQuote } from "./marketData.js";
import { technicalAnalysis, fundamentalAnalysis, compositeScore } from "./analysis.js";
import CEDEARS from "./cedears.js";

// Simulated diversified selection for backtest
function backtestPicks(scored) {
  const CATS = {
    growth: ["Technology", "Consumer Cyclical", "E-Commerce", "Crypto"],
    defensive: ["Consumer Defensive", "Healthcare", "ETF - Dividendos", "ETF - Índices"],
    hedge: ["Materials", "Energy"],
  };
  function cat(sector) {
    for (const [c, secs] of Object.entries(CATS)) if (secs.includes(sector)) return c;
    return "neutral";
  }
  const buckets = { growth: [], defensive: [], hedge: [], neutral: [] };
  for (const r of scored) buckets[cat(r.sector)].push(r);
  for (const c of Object.keys(buckets)) buckets[c].sort((a, b) => b.score - a.score);

  const picks = [];
  const used = new Set();
  function add(bucket, n) {
    for (const item of bucket) {
      if (picks.length >= 4 || n <= 0) break;
      if (used.has(item.ticker)) continue;
      used.add(item.ticker);
      picks.push(item);
      n--;
    }
  }
  add(buckets.growth, 1);
  add(buckets.defensive, 1);
  add(buckets.hedge, 1);
  // Fill rest from best overall
  const rest = scored.filter(s => !used.has(s.ticker));
  add(rest, 4 - picks.length);
  return picks;
}

export async function runBacktest(months = 6) {
  const BUDGET_ARS = 1000000;
  const topN = 35;

  // Pick a subset of liquid/common CEDEARs for speed
  const candidates = CEDEARS.filter(c =>
    !c.sector.startsWith("ETF") || c.ticker === "SPY" || c.ticker === "QQQ"
  ).slice(0, topN);

  // We need history going back (months) + a buffer for indicators (~6 months)
  const totalMonths = months + 7;

  // Fetch all histories
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

  // Cut history to the start date (months ago)
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  // Score each CEDEAR with data up to cutoff
  const scored = [];
  for (const c of candidates) {
    const fullHistory = historyMap[c.ticker];
    if (!fullHistory) continue;
    const cutHistory = fullHistory.filter(p => p.date <= cutoffStr);
    if (cutHistory.length < 30) continue;

    const tech = technicalAnalysis(cutHistory);
    const scores = compositeScore(tech, { score: 50, signals: [] }, null, c.sector);
    const priceAtCut = cutHistory[cutHistory.length - 1].close;

    scored.push({
      ticker: c.ticker,
      name: c.name,
      sector: c.sector,
      score: scores.composite,
      signal: scores.signal,
      priceAtEntry: priceAtCut,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // Select top 4 diversified picks
  const picks = backtestPicks(scored);
  if (picks.length === 0) {
    return { error: "No hay suficientes datos históricos para el backtest." };
  }

  const perPick = BUDGET_ARS / picks.length;

  // Get current prices for each pick
  const holdings = [];
  for (const pick of picks) {
    const fullHistory = historyMap[pick.ticker];
    const currentPrice = fullHistory ? fullHistory[fullHistory.length - 1].close : pick.priceAtEntry;

    const sharesSimulated = Math.floor(perPick / pick.priceAtEntry);
    const invested = sharesSimulated * pick.priceAtEntry;
    const currentValue = sharesSimulated * currentPrice;
    const returnPct = ((currentValue - invested) / invested) * 100;

    holdings.push({
      ticker: pick.ticker,
      name: pick.name,
      sector: pick.sector,
      scoreAtEntry: pick.score,
      signal: pick.signal,
      priceAtEntry: Math.round(pick.priceAtEntry * 100) / 100,
      priceNow: Math.round(currentPrice * 100) / 100,
      shares: sharesSimulated,
      invested: Math.round(invested),
      currentValue: Math.round(currentValue),
      returnPct: Math.round(returnPct * 100) / 100,
    });
  }

  const totalInvested = holdings.reduce((s, h) => s + h.invested, 0);
  const totalCurrent = holdings.reduce((s, h) => s + h.currentValue, 0);
  const totalReturn = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

  // SPY benchmark for same period
  let spyReturn = null;
  try {
    const spyHistory = await fetchHistory("SPY.BA", totalMonths);
    const spyCut = spyHistory.filter(p => p.date <= cutoffStr);
    if (spyCut.length > 0 && spyHistory.length > 0) {
      const spyEntry = spyCut[spyCut.length - 1].close;
      const spyNow = spyHistory[spyHistory.length - 1].close;
      spyReturn = Math.round(((spyNow - spyEntry) / spyEntry) * 10000) / 100;
    }
  } catch (e) {
    // Fallback: use USD SPY
    try {
      const spyH = await fetchHistory("SPY", totalMonths);
      const spyCut = spyH.filter(p => p.date <= cutoffStr);
      if (spyCut.length > 0 && spyH.length > 0) {
        spyReturn = Math.round(((spyH[spyH.length - 1].close - spyCut[spyCut.length - 1].close) / spyCut[spyCut.length - 1].close) * 10000) / 100;
      }
    } catch {}
  }

  holdings.sort((a, b) => b.returnPct - a.returnPct);
  const best = holdings[0];
  const worst = holdings[holdings.length - 1];

  return {
    months,
    entryDate: cutoffStr,
    budget: BUDGET_ARS,
    holdings,
    summary: {
      totalInvested,
      totalCurrent,
      totalReturnPct: Math.round(totalReturn * 100) / 100,
      spyReturnPct: spyReturn,
      alpha: spyReturn != null ? Math.round((totalReturn - spyReturn) * 100) / 100 : null,
      bestPick: best ? { ticker: best.ticker, returnPct: best.returnPct } : null,
      worstPick: worst ? { ticker: worst.ticker, returnPct: worst.returnPct } : null,
    },
  };
}
