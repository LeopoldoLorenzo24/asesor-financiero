import { fetchHistory, fetchQuote } from "./marketData.js";
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

  // SLOT 1: Best growth (tech, consumer cyclical, e-commerce, communication)
  for (const item of scored) {
    if (picks.length >= 1) break;
    if (getCategory(item.cedear?.sector || item.sector) === "growth") tryAdd(item);
  }

  // SLOT 2: Best defensive (consumer defensive, healthcare, financial)
  for (const item of scored) {
    if (picks.length >= 2) break;
    if (getCategory(item.cedear?.sector || item.sector) === "defensive") tryAdd(item);
  }

  // SLOT 3: Best hedge (energy, materials)
  for (const item of scored) {
    if (picks.length >= 3) break;
    if (getCategory(item.cedear?.sector || item.sector) === "hedge") tryAdd(item);
  }

  // REMAINING SLOTS: Fill with best that don't repeat sector
  for (const item of scored) {
    if (picks.length >= numPicks) break;
    const ticker = item.cedear?.ticker || item.ticker;
    const sector = item.cedear?.sector || item.sector;
    if (usedTickers.has(ticker)) continue;
    if ((usedSectors[sector] || 0) >= 1 && picks.length < numPicks - 1) continue;
    tryAdd(item);
  }

  // FALLBACK: If still not enough, fill from any remaining
  for (const item of scored) {
    if (picks.length >= numPicks) break;
    const ticker = item.cedear?.ticker || item.ticker;
    if (!usedTickers.has(ticker)) tryAdd(item);
  }

  return picks;
}

export async function runBacktest({ months = 6, monthlyDeposit = 1000000, profile = "moderate", picksPerMonth = 4 } = {}) {
  const candidates = selectBacktestCandidates(CEDEARS);

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

  // Simulate month by month
  const allHoldings = []; // accumulated positions
  const meses = []; // month-by-month breakdown
  const now = new Date();

  for (let m = months; m >= 1; m--) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - m);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);
    const monthLabel = cutoffDate.toLocaleDateString("es-AR", { year: "numeric", month: "short" });

    // Score each CEDEAR with data up to this cutoff
    const scored = [];
    for (const c of candidates) {
      const fullHistory = historyMap[c.ticker];
      if (!fullHistory) continue;
      const cutHistory = fullHistory.filter(p => p.date <= cutoffStr);
      if (cutHistory.length < 30) continue;

      const tech = technicalAnalysis(cutHistory);
      const scores = compositeScore(tech, { score: 50, signals: [] }, null, c.sector, profile);
      const priceAtCut = cutHistory[cutHistory.length - 1].close;

      scored.push({
        cedear: c,
        ticker: c.ticker,
        name: c.name,
        sector: c.sector,
        scores: { composite: scores.composite, signal: scores.signal },
        priceAtEntry: priceAtCut,
      });
    }

    scored.sort((a, b) => b.scores.composite - a.scores.composite);

    // Strict slot-based diversification: growth + defensive + hedge + fill
    const monthPicks = selectDiversifiedPicks(scored, picksPerMonth);

    console.log(`[Backtest ${monthLabel}] Picks: ${monthPicks.map(p => `${p.cedear?.ticker || p.ticker} (${p.cedear?.sector || p.sector})`).join(", ")}`);

    if (monthPicks.length === 0) continue;

    const perPick = monthlyDeposit / monthPicks.length;
    const bought = [];

    for (const pick of monthPicks) {
      const ticker = pick.cedear?.ticker || pick.ticker;
      const sector = pick.cedear?.sector || pick.sector;
      const name = pick.cedear?.name || pick.name;
      const priceAtEntry = pick.priceAtEntry || 0;
      if (priceAtEntry <= 0) continue;

      const shares = Math.floor(perPick / priceAtEntry);
      if (shares <= 0) continue;

      allHoldings.push({
        ticker, name, sector,
        scoreAtEntry: pick.scores?.composite ?? 0,
        signal: pick.scores?.signal || "?",
        priceAtEntry: Math.round(priceAtEntry * 100) / 100,
        shares,
        invested: Math.round(shares * priceAtEntry),
        boughtMonth: cutoffStr,
      });

      bought.push({ ticker, sector });
    }

    meses.push({ month: monthLabel, date: cutoffStr, bought, holdingsCount: allHoldings.length });
  }

  if (allHoldings.length === 0) {
    return { error: "No hay suficientes datos históricos para el backtest." };
  }

  // Calculate current values for all accumulated holdings
  const holdings = [];
  for (const h of allHoldings) {
    const fullHistory = historyMap[h.ticker];
    const currentPrice = fullHistory ? fullHistory[fullHistory.length - 1].close : h.priceAtEntry;
    const currentValue = h.shares * currentPrice;
    const returnPct = h.invested > 0 ? ((currentValue - h.invested) / h.invested) * 100 : 0;

    holdings.push({
      ...h,
      priceNow: Math.round(currentPrice * 100) / 100,
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

  holdings.sort((a, b) => b.returnPct - a.returnPct);
  const best = holdings[0];
  const worst = holdings[holdings.length - 1];
  const beatsSPY = spyReturn != null ? totalReturn > spyReturn : null;

  const entryDate = new Date();
  entryDate.setMonth(entryDate.getMonth() - months);

  const returnPctRounded = Math.round(totalReturn * 100) / 100;
  const spyRounded = spyReturn != null ? Math.round(spyReturn * 100) / 100 : null;

  let veredicto;
  if (beatsSPY === true) {
    veredicto = `El bot generó alfa: +${returnPctRounded}% vs SPY ${spyRounded}%. La estrategia diversificada funciona.`;
  } else if (beatsSPY === false) {
    veredicto = `SPY rindió más (${spyRounded}%) que el bot (${returnPctRounded}%). En este período habría convenido indexar.`;
  } else {
    veredicto = `Retorno del bot: ${returnPctRounded}%. No se pudo comparar contra SPY.`;
  }

  return {
    config: { months, monthlyDeposit, profile, picksPerMonth },
    entryDate: entryDate.toISOString().slice(0, 10),
    holdings,
    meses,
    resultado: {
      totalInvertido: totalInvested,
      valorFinal: totalCurrent,
      returnPct: returnPctRounded,
      spyReturnPct: spyRounded,
      alpha: spyReturn != null ? Math.round((totalReturn - spyReturn) * 100) / 100 : null,
      beatsSPY,
      bestPick: best ? { ticker: best.ticker, returnPct: best.returnPct } : null,
      worstPick: worst ? { ticker: worst.ticker, returnPct: worst.returnPct } : null,
    },
    veredicto,
  };
}
