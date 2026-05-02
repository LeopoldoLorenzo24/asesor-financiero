// ============================================================
// ALGORITHMIC DIVERSIFICATION ENGINE
// Pre-filters CEDEARs before sending to AI to save tokens
// Includes correlation-based diversification validation
// ============================================================

import CEDEARS from "./cedears.js";
import { getPortfolioSummary } from "./database.js";
import { fetchHistory } from "./marketData.js";

// ── CORRELATION UTILITIES ──

/**
 * Calculates Pearson correlation coefficient between daily returns of two price series.
 * Used to detect highly correlated picks that don't add real diversification.
 * Two mining stocks or two FAANG names often move together — holding both
 * concentrates risk without the investor realizing it.
 *
 * @param {Array<{date: string, close: number}>} pricesA - Historical prices for ticker A
 * @param {Array<{date: string, close: number}>} pricesB - Historical prices for ticker B
 * @returns {number|null} Pearson correlation coefficient (-1 to +1), or null if insufficient data
 */
export function calculateCorrelation(pricesA, pricesB) {
  // Build date-indexed maps for alignment
  const mapA = {};
  for (const p of pricesA) mapA[p.date] = p.close;
  const mapB = {};
  for (const p of pricesB) mapB[p.date] = p.close;

  // Find overlapping dates (sorted)
  const commonDates = Object.keys(mapA).filter((d) => d in mapB).sort();
  if (commonDates.length < 21) return null; // Need at least 20 return data points (21 prices)

  // Compute daily returns on overlapping dates
  const returnsA = [];
  const returnsB = [];
  for (let i = 1; i < commonDates.length; i++) {
    const prevDate = commonDates[i - 1];
    const currDate = commonDates[i];
    const retA = (mapA[currDate] - mapA[prevDate]) / mapA[prevDate];
    const retB = (mapB[currDate] - mapB[prevDate]) / mapB[prevDate];
    returnsA.push(retA);
    returnsB.push(retB);
  }

  if (returnsA.length < 20) return null;

  // Use last 60 data points max (approx 60 trading days)
  const n = Math.min(returnsA.length, 60);
  const rA = returnsA.slice(-n);
  const rB = returnsB.slice(-n);

  // Pearson correlation
  const meanA = rA.reduce((s, v) => s + v, 0) / n;
  const meanB = rB.reduce((s, v) => s + v, 0) / n;

  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const dA = rA[i] - meanA;
    const dB = rB[i] - meanB;
    cov += dA * dB;
    varA += dA * dA;
    varB += dB * dB;
  }

  if (varA === 0 || varB === 0) return null;
  return Math.round((cov / Math.sqrt(varA * varB)) * 1000) / 1000;
}

/**
 * Post-selection correlation check. Removes highly correlated picks and replaces
 * them with the next best alternative from a different sector.
 *
 * Rules:
 * - correlation > 0.75 between any pair → remove the lower-scored pick
 * - Max 2 picks with mutual correlation > 0.60
 *
 * @param {Array} picks - Selected picks with .cedear, .scores, .ticker
 * @param {Array} allRanked - Full ranked list to find replacements
 * @param {Object} historyMap - Map of ticker → price history (optional, fetched if missing)
 * @returns {Promise<{picks: Array, warnings: string[]}>}
 */
export async function correlationFilter(picks, allRanked, historyMap = {}) {
  if (picks.length < 2) return { picks, warnings: [] };

  const warnings = [];
  const tickers = picks.map((p) => p.cedear?.ticker || p.ticker);

  // Ensure we have history for all picks
  for (const ticker of tickers) {
    if (!historyMap[ticker]) {
      try {
        historyMap[ticker] = await fetchHistory(`${ticker}.BA`, 6);
      } catch {
        try {
          historyMap[ticker] = await fetchHistory(ticker, 6);
        } catch {
          historyMap[ticker] = [];
        }
      }
    }
  }

  // Calculate pairwise correlations
  const correlations = [];
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      const tickerA = picks[i].cedear?.ticker || picks[i].ticker;
      const tickerB = picks[j].cedear?.ticker || picks[j].ticker;
      const corr = calculateCorrelation(historyMap[tickerA] || [], historyMap[tickerB] || []);
      if (corr != null) {
        correlations.push({ i, j, tickerA, tickerB, corr });
      }
    }
  }

  // Remove picks with correlation > 0.75 (remove the lower-scored one)
  const removed = new Set();
  const usedTickers = new Set(tickers);

  // Sort by correlation descending to handle worst cases first
  correlations.sort((a, b) => b.corr - a.corr);

  for (const { i, j, tickerA, tickerB, corr } of correlations) {
    if (corr <= 0.75) break;
    if (removed.has(i) || removed.has(j)) continue;

    const scoreA = picks[i].scores?.composite || 0;
    const scoreB = picks[j].scores?.composite || 0;
    const removeIdx = scoreA >= scoreB ? j : i;
    const removedTicker = removeIdx === i ? tickerA : tickerB;
    const keptTicker = removeIdx === i ? tickerB : tickerA;

    removed.add(removeIdx);
    usedTickers.delete(removedTicker);
    warnings.push(`Se eliminó ${removedTicker} por alta correlación (${corr.toFixed(2)}) con ${keptTicker}`);
  }

  // Enforce max 2 picks with correlation > 0.60
  let highCorrCount = 0;
  for (const { i, j, corr } of correlations) {
    if (corr <= 0.60 || removed.has(i) || removed.has(j)) continue;
    highCorrCount++;
    if (highCorrCount > 2) {
      const scoreA = picks[i].scores?.composite || 0;
      const scoreB = picks[j].scores?.composite || 0;
      const removeIdx = scoreA >= scoreB ? j : i;
      const removedTicker = picks[removeIdx].cedear?.ticker || picks[removeIdx].ticker;
      const keptTicker = picks[removeIdx === i ? j : i].cedear?.ticker || picks[removeIdx === i ? j : i].ticker;

      if (!removed.has(removeIdx)) {
        removed.add(removeIdx);
        usedTickers.delete(removedTicker);
        warnings.push(`Se eliminó ${removedTicker} por alta correlación (${corr.toFixed(2)}) con ${keptTicker} (límite de 2 pares con corr > 0.60)`);
      }
    }
  }

  // Build filtered picks
  let filteredPicks = picks.filter((_, idx) => !removed.has(idx));

  // Replace removed picks with next best from different sectors
  if (removed.size > 0 && allRanked.length > 0) {
    const usedSectors = new Set(filteredPicks.map((p) => p.cedear?.sector || p.sector));

    for (const candidate of allRanked) {
      if (filteredPicks.length >= picks.length) break;
      const candTicker = candidate.cedear?.ticker || candidate.ticker;
      const candSector = candidate.cedear?.sector || candidate.sector;
      if (usedTickers.has(candTicker)) continue;

      // Prefer candidates from sectors not already heavily represented
      const sectorCount = filteredPicks.filter((p) => (p.cedear?.sector || p.sector) === candSector).length;
      if (sectorCount >= 2) continue;

      usedTickers.add(candTicker);
      filteredPicks.push(candidate);
    }
  }

  // Re-sort by composite score
  filteredPicks.sort((a, b) => (b.scores?.composite || 0) - (a.scores?.composite || 0));

  return { picks: filteredPicks, warnings };
}

// --- Profile configurations ---
const PROFILES = {
  conservative: {
    maxSectorPct: 0.20,
    minSectors: 4,
    totalPicks: 8,
    slots: { growth: 1, defensive: 4, hedge: 1, best: 2 },
  },
  moderate: {
    maxSectorPct: 0.35,
    minSectors: 3,
    totalPicks: 8,
    slots: { growth: 3, defensive: 2, hedge: 1, best: 2 },
  },
  aggressive: {
    maxSectorPct: 0.50,
    minSectors: 2,
    totalPicks: 8,
    slots: { growth: 4, defensive: 1, hedge: 1, best: 2 },
  },
};

function getProfile(profileId = "moderate") {
  return PROFILES[profileId] || PROFILES.moderate;
}

// --- Sector category mapping ---
const SECTOR_CATEGORIES = {
  growth: ["Technology", "Consumer Cyclical", "E-Commerce", "Crypto", "ETF - Temático", "ETF - Crypto"],
  defensive: ["Consumer Defensive", "Healthcare", "ETF - Dividendos", "ETF - Internacional", "ETF - Índices"],
  hedge: ["Materials", "Energy", "ETF - Commodities"],
  neutral: ["Financial", "Communication", "Industrials", "ETF - Sectorial"],
};

function categorize(sector) {
  for (const [cat, sectors] of Object.entries(SECTOR_CATEGORIES)) {
    if (sectors.includes(sector)) return cat;
  }
  return "neutral";
}

// --- Main diversified selection ---
export function diversifiedSelection(rankedResults, portfolioPositions = [], profileId = "moderate") {
  const PROFILE = getProfile(profileId);
  // 1. Calculate current portfolio exposure
  const exposure = {};
  let totalValue = 0;
  for (const pos of portfolioPositions) {
    const cedear = CEDEARS.find((c) => c.ticker === pos.ticker);
    const sector = cedear?.sector || "Unknown";
    const value = (pos.total_shares || pos.shares || 0) * (pos.weighted_avg_price || pos.avg_price_ars || 0);
    exposure[sector] = (exposure[sector] || 0) + value;
    totalValue += value;
  }

  // Convert to percentages
  const exposurePct = {};
  if (totalValue > 0) {
    for (const [sector, value] of Object.entries(exposure)) {
      exposurePct[sector] = value / totalValue;
    }
  }

  // 2. Generate concentration warnings
  const warnings = [];
  for (const [sector, pct] of Object.entries(exposurePct)) {
    if (pct > PROFILE.maxSectorPct) {
      warnings.push(`⚠️ Sobreexposición: ${sector} = ${(pct * 100).toFixed(1)}% (máx recomendado: ${PROFILE.maxSectorPct * 100}%)`);
    }
  }

  const sectorCount = Object.keys(exposurePct).length;
  if (totalValue > 0 && sectorCount < PROFILE.minSectors) {
    warnings.push(`⚠️ Poca diversificación: solo ${sectorCount} sector(es). Mínimo recomendado: ${PROFILE.minSectors}`);
  }

  // 3. Separate ranked results by category
  const buckets = { growth: [], defensive: [], hedge: [], neutral: [] };
  for (const r of rankedResults) {
    const sector = r.cedear?.sector || "Unknown";
    const cat = categorize(sector);
    // Penalize sectors that are already overweight in portfolio
    const overweight = (exposurePct[sector] || 0) > PROFILE.maxSectorPct;
    buckets[cat].push({ ...r, _overweight: overweight });
  }

  // Sort each bucket by composite score (overweight items go to the end)
  for (const cat of Object.keys(buckets)) {
    buckets[cat].sort((a, b) => {
      if (a._overweight !== b._overweight) return a._overweight ? 1 : -1;
      return b.scores.composite - a.scores.composite;
    });
  }

  // 4. Fill slots
  const selected = new Set();
  const picks = [];

  function addFromBucket(bucketName, count) {
    const bucket = buckets[bucketName] || [];
    let added = 0;
    for (const item of bucket) {
      if (added >= count) break;
      const ticker = item.cedear?.ticker || item.ticker;
      if (selected.has(ticker)) continue;
      selected.add(ticker);
      picks.push(item);
      added++;
    }
    return added;
  }

  // Fill category slots
  addFromBucket("growth", PROFILE.slots.growth);
  addFromBucket("defensive", PROFILE.slots.defensive);
  addFromBucket("hedge", PROFILE.slots.hedge);

  // Fill remaining "best" slots from any category
  const remaining = rankedResults.filter((r) => {
    const ticker = r.cedear?.ticker || r.ticker;
    return !selected.has(ticker);
  });
  remaining.sort((a, b) => b.scores.composite - a.scores.composite);

  for (const item of remaining) {
    if (picks.length >= PROFILE.totalPicks) break;
    const ticker = item.cedear?.ticker || item.ticker;
    if (!selected.has(ticker)) {
      selected.add(ticker);
      picks.push(item);
    }
  }

  // 5. Verify minimum sector diversity in picks
  const pickSectors = new Set(picks.map((p) => p.cedear?.sector));
  if (pickSectors.size < PROFILE.minSectors && rankedResults.length >= PROFILE.minSectors) {
    // Try to swap last "best" pick for one from an unrepresented category
    const representedCats = new Set(picks.map((p) => categorize(p.cedear?.sector)));
    for (const cat of ["defensive", "hedge", "growth", "neutral"]) {
      if (representedCats.has(cat)) continue;
      const candidate = (buckets[cat] || []).find(
        (r) => !selected.has(r.cedear?.ticker || r.ticker)
      );
      if (candidate && picks.length > 0) {
        // Replace the lowest-scored pick
        picks.sort((a, b) => b.scores.composite - a.scores.composite);
        const removed = picks.pop();
        selected.delete(removed.cedear?.ticker || removed.ticker);
        selected.add(candidate.cedear?.ticker || candidate.ticker);
        picks.push(candidate);
      }
    }
  }

  // Final sort by composite score
  picks.sort((a, b) => b.scores.composite - a.scores.composite);

  // Clean up internal fields
  const cleanPicks = picks.map(({ _overweight, ...rest }) => rest);

  // 6. Build diversification summary
  const picksBySector = {};
  for (const p of cleanPicks) {
    const s = p.cedear?.sector || "Unknown";
    picksBySector[s] = (picksBySector[s] || 0) + 1;
  }

  const diversification = {
    totalPicks: cleanPicks.length,
    sectorsRepresented: Object.keys(picksBySector).length,
    distribution: picksBySector,
    portfolioExposure: Object.fromEntries(
      Object.entries(exposurePct).map(([k, v]) => [k, `${(v * 100).toFixed(1)}%`])
    ),
    categories: {
      growth: cleanPicks.filter((p) => categorize(p.cedear?.sector) === "growth").map((p) => p.cedear?.ticker),
      defensive: cleanPicks.filter((p) => categorize(p.cedear?.sector) === "defensive").map((p) => p.cedear?.ticker),
      hedge: cleanPicks.filter((p) => categorize(p.cedear?.sector) === "hedge").map((p) => p.cedear?.ticker),
      neutral: cleanPicks.filter((p) => categorize(p.cedear?.sector) === "neutral").map((p) => p.cedear?.ticker),
    },
  };

  return { picks: cleanPicks, diversification, warnings };
}

// --- Portfolio exposure calculator ---
export async function portfolioExposure(quotesMap = null, bymaPrices = null, cclRate = null) {
  const positions = await getPortfolioSummary();
  const result = { sectors: {}, categories: {}, total: 0, positionCount: positions.length, hasEstimates: false };

  let totalValue = 0;
  for (const pos of positions) {
    const cedear = CEDEARS.find((c) => c.ticker === pos.ticker);
    const sector = cedear?.sector || "Unknown";
    const cat = categorize(sector);

    // Priority: real BYMA price > USD-derived price > avg purchase price
    let value;
    const bymaPrice = bymaPrices?.[pos.ticker]?.priceARS;
    const usdPrice = quotesMap?.[pos.ticker]?.price;

    if (bymaPrice) {
      value = (pos.total_shares || 0) * bymaPrice;
    } else if (usdPrice && cclRate && cedear?.ratio) {
      value = (pos.total_shares || 0) * Math.round((usdPrice * cclRate) / cedear.ratio);
    } else {
      value = (pos.total_shares || 0) * (pos.weighted_avg_price || 0);
      result.hasEstimates = true;
    }

    result.sectors[sector] = (result.sectors[sector] || 0) + value;
    result.categories[cat] = (result.categories[cat] || 0) + value;
    totalValue += value;
  }

  result.total = totalValue;

  if (totalValue > 0) {
    for (const key of Object.keys(result.sectors)) {
      result.sectors[key] = {
        value: result.sectors[key],
        pct: `${((result.sectors[key] / totalValue) * 100).toFixed(1)}%`,
      };
    }
    for (const key of Object.keys(result.categories)) {
      result.categories[key] = {
        value: result.categories[key],
        pct: `${((result.categories[key] / totalValue) * 100).toFixed(1)}%`,
      };
    }
  }

  return result;
}
