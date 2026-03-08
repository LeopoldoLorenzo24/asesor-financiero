// ============================================================
// ALGORITHMIC DIVERSIFICATION ENGINE
// Pre-filters CEDEARs before sending to AI to save tokens
// ============================================================

import CEDEARS from "./cedears.js";
import { getPortfolioSummary } from "./database.js";

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
  const result = { sectors: {}, categories: {}, total: 0, positions: positions.length, hasEstimates: false };

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
