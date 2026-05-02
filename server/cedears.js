// ============================================================
// Dynamic ratio overlay: DB ratios override hardcoded defaults.
// Call loadDynamicRatios() after DB init to populate.
// ============================================================
let _dynamicRatios = {}; // { ticker: { ratio, source, confidence, updated_at } }

/**
 * Load calculated ratios from DB. Call once after initDb().
 * After this, getCedearWithRatio() returns the live ratio.
 */
export async function loadDynamicRatios() {
  try {
    const { getAllCedearRatios } = await import("./database.js");
    _dynamicRatios = await getAllCedearRatios();
    console.log(`[cedears] Loaded ${Object.keys(_dynamicRatios).length} dynamic ratios from DB.`);
  } catch (err) {
    console.warn("[cedears] Could not load dynamic ratios:", err.message);
  }
}

/**
 * Get the effective ratio for a ticker: DB-calculated first, hardcoded fallback.
 * @param {string} ticker
 * @returns {{ ratio: number, source: 'dynamic'|'hardcoded', confidence?: string, updated_at?: string }}
 */
export function getEffectiveRatio(ticker) {
  const dynamic = _dynamicRatios[ticker];
  if (dynamic && dynamic.ratio > 0) {
    return { ratio: dynamic.ratio, source: 'dynamic', confidence: dynamic.confidence, updated_at: dynamic.updated_at };
  }
  const cedear = CEDEARS.find(c => c.ticker === ticker);
  return { ratio: cedear?.ratio || 1, source: 'hardcoded' };
}

/**
 * Get a CEDEAR definition with the effective (dynamic or hardcoded) ratio.
 */
export function getCedearWithRatio(ticker) {
  const cedear = CEDEARS.find(c => c.ticker === ticker);
  if (!cedear) return null;
  const { ratio, source } = getEffectiveRatio(ticker);
  return { ...cedear, ratio, _ratioSource: source };
}

/**
 * Get all CEDEARs with effective ratios applied.
 */
export function getAllCedearsWithRatios() {
  return CEDEARS.map(c => {
    const { ratio, source } = getEffectiveRatio(c.ticker);
    return { ...c, ratio, _ratioSource: source };
  });
}

/** Update the in-memory cache (called after ratio sync job). */
export function setDynamicRatios(ratios) {
  _dynamicRatios = ratios;
}

/** Get count of dynamic vs hardcoded ratios for diagnostics. */
export function getRatioCoverage() {
  const total = CEDEARS.length;
  const dynamic = CEDEARS.filter(c => _dynamicRatios[c.ticker]?.ratio > 0).length;
  return { total, dynamic, hardcoded: total - dynamic, pct: Math.round((dynamic / total) * 100) };
}

const CEDEARS = [
  // === TECHNOLOGY ===
  { ticker: "AAPL", name: "Apple Inc.", sector: "Technology", ratio: 20 },
  { ticker: "MSFT", name: "Microsoft Corp.", sector: "Technology", ratio: 30 },
  { ticker: "GOOGL", name: "Alphabet Inc.", sector: "Technology", ratio: 58 },
  { ticker: "NVDA", name: "NVIDIA Corp.", sector: "Technology", ratio: 24 },
  { ticker: "META", name: "Meta Platforms", sector: "Technology", ratio: 24 },
  { ticker: "AMD", name: "Advanced Micro Devices", sector: "Technology", ratio: 10 },
  { ticker: "INTC", name: "Intel Corp.", sector: "Technology", ratio: 5 },
  { ticker: "CRM", name: "Salesforce Inc.", sector: "Technology", ratio: 18 },
  { ticker: "ORCL", name: "Oracle Corp.", sector: "Technology", ratio: 3 },
  { ticker: "ADBE", name: "Adobe Inc.", sector: "Technology", ratio: 44 },
  { ticker: "GLOB", name: "Globant S.A.", sector: "Technology", ratio: 18 },
  { ticker: "SHOP", name: "Shopify Inc.", sector: "Technology", ratio: 107 },
  { ticker: "TSM", name: "Taiwan Semiconductor", sector: "Technology", ratio: 9 },
  { ticker: "AVGO", name: "Broadcom Inc.", sector: "Technology", ratio: 39 },
  { ticker: "CSCO", name: "Cisco Systems", sector: "Technology", ratio: 5 },
  { ticker: "TXN", name: "Texas Instruments", sector: "Technology", ratio: 5 },
  { ticker: "QCOM", name: "Qualcomm Inc.", sector: "Technology", ratio: 11 },
  { ticker: "AMAT", name: "Applied Materials", sector: "Technology", ratio: 5 },
  { ticker: "MU", name: "Micron Technology", sector: "Technology", ratio: 5 },
  { ticker: "MRVL", name: "Marvell Technology", sector: "Technology", ratio: 14 },
  { ticker: "PANW", name: "Palo Alto Networks", sector: "Technology", ratio: 50 },
  { ticker: "NOW", name: "ServiceNow Inc.", sector: "Technology", ratio: 172 },
  { ticker: "PLTR", name: "Palantir Technologies", sector: "Technology", ratio: 3 },
  { ticker: "SAP", name: "SAP SE", sector: "Technology", ratio: 6 },
  { ticker: "IBM", name: "IBM Corp.", sector: "Technology", ratio: 15 },
  { ticker: "ASML", name: "ASML Holding", sector: "Technology", ratio: 146 },
  { ticker: "TEAM", name: "Atlassian Corp.", sector: "Technology", ratio: 47 },
  { ticker: "ARM", name: "ARM Holdings", sector: "Technology", ratio: 27 },
  { ticker: "LRCX", name: "Lam Research", sector: "Technology", ratio: 56 },
  { ticker: "SNOW", name: "Snowflake Inc.", sector: "Technology", ratio: 30 },
  { ticker: "AI", name: "C3.ai Inc.", sector: "Technology", ratio: 5 },
  { ticker: "MSTR", name: "MicroStrategy", sector: "Technology", ratio: 20 },

  // === CONSUMER CYCLICAL ===
  { ticker: "AMZN", name: "Amazon.com Inc.", sector: "Consumer Cyclical", ratio: 144 },
  { ticker: "TSLA", name: "Tesla Inc.", sector: "Consumer Cyclical", ratio: 15 },
  { ticker: "MELI", name: "MercadoLibre Inc.", sector: "Consumer Cyclical", ratio: 120 },
  { ticker: "NKE", name: "Nike Inc.", sector: "Consumer Cyclical", ratio: 12 },
  { ticker: "SBUX", name: "Starbucks Corp.", sector: "Consumer Cyclical", ratio: 12 },
  { ticker: "HD", name: "Home Depot Inc.", sector: "Consumer Cyclical", ratio: 32 },
  { ticker: "BKNG", name: "Booking Holdings", sector: "Consumer Cyclical", ratio: 700 },
  { ticker: "TGT", name: "Target Corp.", sector: "Consumer Cyclical", ratio: 24 },
  { ticker: "ABNB", name: "Airbnb Inc.", sector: "Consumer Cyclical", ratio: 15 },
  { ticker: "DECK", name: "Deckers Outdoor", sector: "Consumer Cyclical", ratio: 25 },
  { ticker: "ETSY", name: "Etsy Inc.", sector: "Consumer Cyclical", ratio: 16 },
  { ticker: "GM", name: "General Motors", sector: "Consumer Cyclical", ratio: 6 },
  { ticker: "F", name: "Ford Motor Co.", sector: "Consumer Cyclical", ratio: 1 },
  { ticker: "NIO", name: "NIO Inc.", sector: "Consumer Cyclical", ratio: 4 },
  { ticker: "XPEV", name: "XPeng Inc.", sector: "Consumer Cyclical", ratio: 4 },
  { ticker: "RACE", name: "Ferrari N.V.", sector: "Consumer Cyclical", ratio: 83 },
  { ticker: "TJX", name: "TJX Companies", sector: "Consumer Cyclical", ratio: 22 },

  // === ALIMENTOS & CONSUMER DEFENSIVE ===
  { ticker: "KO", name: "Coca-Cola Co.", sector: "Consumer Defensive", ratio: 5 },
  { ticker: "PEP", name: "PepsiCo Inc.", sector: "Consumer Defensive", ratio: 18 },
  { ticker: "WMT", name: "Walmart Inc.", sector: "Consumer Defensive", ratio: 18 },
  { ticker: "COST", name: "Costco Wholesale", sector: "Consumer Defensive", ratio: 48 },
  { ticker: "PG", name: "Procter & Gamble", sector: "Consumer Defensive", ratio: 15 },
  { ticker: "MCD", name: "McDonald's Corp.", sector: "Consumer Defensive", ratio: 24 },
  { ticker: "MDLZ", name: "Mondelez International", sector: "Consumer Defensive", ratio: 15 },
  { ticker: "HSY", name: "The Hershey Co.", sector: "Consumer Defensive", ratio: 21 },
  { ticker: "KMB", name: "Kimberly-Clark", sector: "Consumer Defensive", ratio: 6 },
  { ticker: "CL", name: "Colgate-Palmolive", sector: "Consumer Defensive", ratio: 3 },
  { ticker: "UL", name: "Unilever PLC", sector: "Consumer Defensive", ratio: 3 },
  { ticker: "PM", name: "Philip Morris Intl", sector: "Consumer Defensive", ratio: 18 },
  { ticker: "MO", name: "Altria Group", sector: "Consumer Defensive", ratio: 4 },
  { ticker: "DEO", name: "Diageo PLC", sector: "Consumer Defensive", ratio: 6 },
  { ticker: "SYY", name: "Sysco Corp.", sector: "Consumer Defensive", ratio: 8 },
  { ticker: "FMX", name: "FEMSA", sector: "Consumer Defensive", ratio: 6 },
  { ticker: "KOFM", name: "Coca-Cola FEMSA", sector: "Consumer Defensive", ratio: 2 },
  { ticker: "BNG", name: "Bunge Limited", sector: "Consumer Defensive", ratio: 5 },
  { ticker: "MOS", name: "The Mosaic Co.", sector: "Consumer Defensive", ratio: 5 },
  { ticker: "ABEV", name: "Ambev S.A.", sector: "Consumer Defensive", ratio: 0.33 },

  // === FINANCIAL ===
  { ticker: "JPM", name: "JPMorgan Chase", sector: "Financial", ratio: 15 },
  { ticker: "V", name: "Visa Inc.", sector: "Financial", ratio: 18 },
  { ticker: "MA", name: "Mastercard Inc.", sector: "Financial", ratio: 33 },
  { ticker: "GS", name: "Goldman Sachs", sector: "Financial", ratio: 13 },
  { ticker: "BA.C", name: "Bank of America", sector: "Financial", ratio: 4 },
  { ticker: "BRKB", name: "Berkshire Hathaway B", sector: "Financial", ratio: 22 },
  { ticker: "C", name: "Citigroup Inc.", sector: "Financial", ratio: 3 },
  { ticker: "WFC", name: "Wells Fargo", sector: "Financial", ratio: 5 },
  { ticker: "AXP", name: "American Express", sector: "Financial", ratio: 15 },
  { ticker: "SCHW", name: "Charles Schwab", sector: "Financial", ratio: 13 },
  { ticker: "BK", name: "Bank of NY Mellon", sector: "Financial", ratio: 2 },
  { ticker: "PYPL", name: "PayPal Holdings", sector: "Financial", ratio: 8 },
  { ticker: "XYZ", name: "Block Inc. (Square)", sector: "Financial", ratio: 20 },
  { ticker: "COIN", name: "Coinbase Global", sector: "Financial", ratio: 27 },
  { ticker: "UN", name: "Nu Holdings", sector: "Financial", ratio: 2 },
  { ticker: "SPGI", name: "S&P Global Inc.", sector: "Financial", ratio: 45 },
  { ticker: "HSBC", name: "HSBC Holdings", sector: "Financial", ratio: 2 },

  // === HEALTHCARE & PHARMA ===
  { ticker: "JNJ", name: "Johnson & Johnson", sector: "Healthcare", ratio: 15 },
  { ticker: "PFE", name: "Pfizer Inc.", sector: "Healthcare", ratio: 4 },
  { ticker: "ABBV", name: "AbbVie Inc.", sector: "Healthcare", ratio: 10 },
  { ticker: "UNH", name: "UnitedHealth Group", sector: "Healthcare", ratio: 33 },
  { ticker: "MRK", name: "Merck & Co.", sector: "Healthcare", ratio: 5 },
  { ticker: "LLY", name: "Eli Lilly & Co.", sector: "Healthcare", ratio: 56 },
  { ticker: "MRNA", name: "Moderna Inc.", sector: "Healthcare", ratio: 19 },
  { ticker: "BMY", name: "Bristol-Myers Squibb", sector: "Healthcare", ratio: 3 },
  { ticker: "GILD", name: "Gilead Sciences", sector: "Healthcare", ratio: 4 },
  { ticker: "AMGN", name: "Amgen Inc.", sector: "Healthcare", ratio: 30 },
  { ticker: "TMO", name: "Thermo Fisher Scientific", sector: "Healthcare", ratio: 22 },
  { ticker: "ISRG", name: "Intuitive Surgical", sector: "Healthcare", ratio: 90 },
  { ticker: "MDT", name: "Medtronic PLC", sector: "Healthcare", ratio: 4 },
  { ticker: "AZN", name: "AstraZeneca PLC", sector: "Healthcare", ratio: 2 },
  { ticker: "NVS", name: "Novartis AG", sector: "Healthcare", ratio: 4 },
  { ticker: "VRTX", name: "Vertex Pharmaceuticals", sector: "Healthcare", ratio: 101 },
  { ticker: "BIIB", name: "Biogen Inc.", sector: "Healthcare", ratio: 13 },
  { ticker: "GSK", name: "GSK PLC", sector: "Healthcare", ratio: 4 },

  // === ENERGY ===
  { ticker: "XOM", name: "Exxon Mobil Corp.", sector: "Energy", ratio: 10 },
  { ticker: "CVX", name: "Chevron Corp.", sector: "Energy", ratio: 16 },
  { ticker: "SHEL", name: "Shell PLC", sector: "Energy", ratio: 2 },
  { ticker: "BP", name: "BP PLC", sector: "Energy", ratio: 5 },
  { ticker: "TTE", name: "TotalEnergies SE", sector: "Energy", ratio: 3 },
  { ticker: "SLB", name: "Schlumberger Ltd", sector: "Energy", ratio: 3 },
  { ticker: "HAL", name: "Halliburton Co.", sector: "Energy", ratio: 2 },
  { ticker: "OXY", name: "Occidental Petroleum", sector: "Energy", ratio: 5 },
  { ticker: "EQNR", name: "Equinor ASA", sector: "Energy", ratio: 6 },
  { ticker: "E", name: "Eni SpA", sector: "Energy", ratio: 4 },
  { ticker: "PSX", name: "Phillips 66", sector: "Energy", ratio: 6 },
  { ticker: "BKR", name: "Baker Hughes", sector: "Energy", ratio: 7 },
  { ticker: "VIST", name: "Vista Energy (Argentina)", sector: "Energy", ratio: 3 },
  { ticker: "PBR", name: "Petrobras", sector: "Energy", ratio: 1 },
  { ticker: "CEG", name: "Constellation Energy", sector: "Energy", ratio: 45 },
  { ticker: "VST", name: "Vistra Corp.", sector: "Energy", ratio: 26 },

  // === COMMUNICATION ===
  { ticker: "NFLX", name: "Netflix Inc.", sector: "Communication", ratio: 48 },
  { ticker: "DISN", name: "Walt Disney Co.", sector: "Communication", ratio: 12 },
  { ticker: "SPOT", name: "Spotify Technology", sector: "Communication", ratio: 28 },
  { ticker: "T", name: "AT&T Inc.", sector: "Communication", ratio: 3 },
  { ticker: "VZ", name: "Verizon Communications", sector: "Communication", ratio: 4 },
  { ticker: "TMUS", name: "T-Mobile US", sector: "Communication", ratio: 33 },
  { ticker: "BIDU", name: "Baidu Inc.", sector: "Communication", ratio: 11 },
  { ticker: "SNAP", name: "Snap Inc.", sector: "Communication", ratio: 1 },
  { ticker: "PINS", name: "Pinterest Inc.", sector: "Communication", ratio: 7 },
  { ticker: "EA", name: "Electronic Arts", sector: "Communication", ratio: 14 },
  { ticker: "RBLX", name: "Roblox Corp.", sector: "Communication", ratio: 2 },

  // === INDUSTRIALS ===
  { ticker: "BA", name: "Boeing Co.", sector: "Industrials", ratio: 24 },
  { ticker: "CAT", name: "Caterpillar Inc.", sector: "Industrials", ratio: 20 },
  { ticker: "DE", name: "Deere & Company", sector: "Industrials", ratio: 40 },
  { ticker: "UBER", name: "Uber Technologies", sector: "Industrials", ratio: 2 },
  { ticker: "HON", name: "Honeywell Intl", sector: "Industrials", ratio: 8 },
  { ticker: "UNP", name: "Union Pacific", sector: "Industrials", ratio: 20 },
  { ticker: "LMT", name: "Lockheed Martin", sector: "Industrials", ratio: 20 },
  { ticker: "RTX", name: "Raytheon Technologies", sector: "Industrials", ratio: 5 },
  { ticker: "GE", name: "General Electric", sector: "Industrials", ratio: 8 },
  { ticker: "FDX", name: "FedEx Corp.", sector: "Industrials", ratio: 10 },
  { ticker: "MMM", name: "3M Company", sector: "Industrials", ratio: 10 },
  { ticker: "ERJ", name: "Embraer S.A.", sector: "Industrials", ratio: 1 },
  { ticker: "CAAP", name: "Corp. América Airports", sector: "Industrials", ratio: 0.25 },

  // === MATERIALS & MINING ===
  { ticker: "VALE", name: "Vale S.A.", sector: "Materials", ratio: 2 },
  { ticker: "FCX", name: "Freeport-McMoRan", sector: "Materials", ratio: 3 },
  { ticker: "NEM", name: "Newmont Corp.", sector: "Materials", ratio: 3 },
  { ticker: "AEM", name: "Agnico Eagle Mines", sector: "Materials", ratio: 6 },
  { ticker: "PAAS", name: "Pan American Silver", sector: "Materials", ratio: 3 },
  { ticker: "GFI", name: "Gold Fields Ltd", sector: "Materials", ratio: 1 },
  { ticker: "KGC", name: "Kinross Gold", sector: "Materials", ratio: 1 },
  { ticker: "HL", name: "Hecla Mining", sector: "Materials", ratio: 1 },
  { ticker: "HMY", name: "Harmony Gold Mining", sector: "Materials", ratio: 1 },
  { ticker: "RIO", name: "Rio Tinto PLC", sector: "Materials", ratio: 8 },
  { ticker: "BHP", name: "BHP Group Ltd", sector: "Materials", ratio: 2 },
  { ticker: "SCCO", name: "Southern Copper", sector: "Materials", ratio: 2 },
  { ticker: "NUE", name: "Nucor Corp.", sector: "Materials", ratio: 16 },
  { ticker: "DOW", name: "Dow Inc.", sector: "Materials", ratio: 6 },
  { ticker: "DD", name: "DuPont de Nemours", sector: "Materials", ratio: 5 },
  { ticker: "SID", name: "CSN Siderúrgica", sector: "Materials", ratio: 0.125 },
  { ticker: "GGB", name: "Gerdau S.A.", sector: "Materials", ratio: 0.25 },
  { ticker: "TXR", name: "Ternium S.A.", sector: "Materials", ratio: 4 },
  { ticker: "TEN", name: "Tenaris S.A.", sector: "Materials", ratio: 1 },

  // === E-COMMERCE ===
  { ticker: "BABA", name: "Alibaba Group", sector: "E-Commerce", ratio: 9 },
  { ticker: "JD", name: "JD.com Inc.", sector: "E-Commerce", ratio: 4 },
  { ticker: "SE", name: "Sea Limited", sector: "E-Commerce", ratio: 32 },
  { ticker: "PDD", name: "PDD Holdings (Temu)", sector: "E-Commerce", ratio: 25 },

  // === CRYPTO & BLOCKCHAIN ===
  { ticker: "RIOT", name: "Riot Platforms", sector: "Crypto", ratio: 3 },
  { ticker: "BITF", name: "Bitfarms Ltd", sector: "Crypto", ratio: 0.2 },
  { ticker: "HUT", name: "Hut 8 Mining", sector: "Crypto", ratio: 0.2 },

  // === ETFs (DIVERSIFICACIÓN) ===
  { ticker: "SPY", name: "SPDR S&P 500 ETF", sector: "ETF - Índices", ratio: 20 },
  { ticker: "QQQ", name: "Invesco QQQ (Nasdaq 100)", sector: "ETF - Índices", ratio: 20 },
  { ticker: "DIA", name: "SPDR Dow Jones", sector: "ETF - Índices", ratio: 20 },
  { ticker: "IWM", name: "iShares Russell 2000", sector: "ETF - Índices", ratio: 10 },
  { ticker: "EEM", name: "iShares MSCI Emerging", sector: "ETF - Internacional", ratio: 5 },
  { ticker: "EWZ", name: "iShares MSCI Brazil", sector: "ETF - Internacional", ratio: 2 },
  { ticker: "EFA", name: "iShares MSCI EAFE", sector: "ETF - Internacional", ratio: 18 },
  { ticker: "ACWI", name: "iShares MSCI ACWI", sector: "ETF - Internacional", ratio: 26 },
  { ticker: "XLE", name: "Energy Select SPDR", sector: "ETF - Sectorial", ratio: 2 },
  { ticker: "XLF", name: "Financial Select SPDR", sector: "ETF - Sectorial", ratio: 2 },
  { ticker: "XLK", name: "Technology Select SPDR", sector: "ETF - Sectorial", ratio: 46 },
  { ticker: "XLV", name: "Health Care Select SPDR", sector: "ETF - Sectorial", ratio: 29 },
  { ticker: "XLP", name: "Consumer Staples SPDR", sector: "ETF - Sectorial", ratio: 16 },
  { ticker: "XLI", name: "Industrial Select SPDR", sector: "ETF - Sectorial", ratio: 28 },
  { ticker: "XLB", name: "Materials Select SPDR", sector: "ETF - Sectorial", ratio: 18 },
  { ticker: "XLRE", name: "Real Estate Select SPDR", sector: "ETF - Sectorial", ratio: 9 },
  { ticker: "XLU", name: "Utilities Select SPDR", sector: "ETF - Sectorial", ratio: 15 },
  { ticker: "XLC", name: "Communication SPDR", sector: "ETF - Sectorial", ratio: 19 },
  { ticker: "XLY", name: "Consumer Discretionary SPDR", sector: "ETF - Sectorial", ratio: 43 },
  { ticker: "GLD", name: "SPDR Gold Trust", sector: "ETF - Commodities", ratio: 50 },
  { ticker: "SLV", name: "iShares Silver Trust", sector: "ETF - Commodities", ratio: 6 },
  { ticker: "USO", name: "United States Oil Fund", sector: "ETF - Commodities", ratio: 15 },
  { ticker: "GDX", name: "VanEck Gold Miners ETF", sector: "ETF - Commodities", ratio: 10 },
  { ticker: "URA", name: "Global X Uranium ETF", sector: "ETF - Commodities", ratio: 5 },
  { ticker: "SMH", name: "VanEck Semiconductor ETF", sector: "ETF - Sectorial", ratio: 50 },
  { ticker: "ARKK", name: "ARK Innovation ETF", sector: "ETF - Temático", ratio: 10 },
  { ticker: "IBIT", name: "iShares Bitcoin Trust", sector: "ETF - Crypto", ratio: 10 },
  { ticker: "ETHA", name: "iShares Ethereum Trust", sector: "ETF - Crypto", ratio: 5 },
  { ticker: "IBB", name: "iShares Nasdaq Biotech", sector: "ETF - Sectorial", ratio: 27 },
  { ticker: "ITA", name: "iShares US Aerospace", sector: "ETF - Sectorial", ratio: 50 },
  { ticker: "VIG", name: "Vanguard Dividend Appreciation", sector: "ETF - Dividendos", ratio: 39 },
];

// ── RATIO VERIFICATION ──

/**
 * Timestamp of last manual verification of CEDEAR ratios against BYMA official data.
 * Ratios can change (stock splits, corporate actions). Stale ratios lead to
 * incorrect ARS price calculations, which can mislead investment decisions.
 */
export const RATIOS_LAST_VERIFIED = '2025-04-15';

/**
 * Returns how long since ratios were last verified.
 * If >90 days stale, the system should warn the user that ratios
 * may be outdated and need re-verification against BYMA's official list.
 *
 * @returns {{ lastVerified: string, daysSince: number, stale: boolean, warning: string|null }}
 */
export function getRatioFreshness() {
  const lastVerified = new Date(RATIOS_LAST_VERIFIED);
  const daysSince = Math.floor((Date.now() - lastVerified.getTime()) / 86400000);
  return {
    lastVerified: RATIOS_LAST_VERIFIED,
    daysSince,
    stale: daysSince > 90,
    warning: daysSince > 90 ? `Ratios de CEDEAR no verificados hace ${daysSince} días. Verificar en BYMA.` : null,
  };
}

/**
 * Validates a CEDEAR's ARS price against what it should be based on
 * the USD price, ratio, and CCL exchange rate.
 *
 * A deviation > 30% strongly suggests either:
 * - The ratio has changed (stock split, corporate action)
 * - The price data is stale or erroneous
 * - An arbitrage opportunity (rare, usually corrects fast)
 *
 * This is critical for REAL MONEY decisions: a wrong ratio means
 * the system thinks a CEDEAR is cheap/expensive when it's not.
 *
 * @param {string} ticker - CEDEAR ticker
 * @param {number} cedearPriceArs - Observed CEDEAR price in ARS
 * @param {number} usdPrice - Underlying US stock price in USD
 * @param {number} cclRate - CCL exchange rate (ARS per USD)
 * @returns {{ valid: boolean, warning: string|null, expectedPrice?: number, actualPrice?: number, deviationPct?: number }}
 */
export function validateRatioSanity(ticker, cedearPriceArs, usdPrice, cclRate) {
  const cedear = CEDEARS.find((c) => c.ticker === ticker);
  if (!cedear || !usdPrice || !cclRate || cclRate <= 0) return { valid: true, warning: null };

  const expectedArsPrice = (usdPrice / cedear.ratio) * cclRate;
  if (expectedArsPrice <= 0) return { valid: true, warning: null };

  const deviation = Math.abs(cedearPriceArs - expectedArsPrice) / expectedArsPrice;

  if (deviation > 0.30) {
    return {
      valid: false,
      warning: `${ticker}: precio CEDEAR ($${cedearPriceArs}) difiere ${(deviation * 100).toFixed(0)}% del esperado ($${expectedArsPrice.toFixed(0)}). Posible ratio desactualizado o error de datos.`,
      expectedPrice: expectedArsPrice,
      actualPrice: cedearPriceArs,
      deviationPct: deviation * 100,
    };
  }
  return { valid: true, warning: null };
}

const DEFAULT_LOT_SIZE = 1;

/**
 * Retorna el tamaño de lote operativo para un CEDEAR.
 * Para no contaminar recomendaciones ni paper trading con supuestos erróneos,
 * usamos lote 1 por defecto y dejamos overrides explícitos solo cuando hagan falta.
 * Esto refleja mejor la operatoria minorista real observada en la cartera del usuario
 * y evita anular picks válidos por un supuesto de lote 100 demasiado agresivo.
 */
export function getCedearLotSize(ticker) {
  const explicitLotSizes = new Map([
    ["BKNG", 1],
    ["NOW", 1],
    ["ASML", 1],
    ["RACE", 1],
    ["ISRG", 1],
  ]);
  if (explicitLotSizes.has(ticker)) return explicitLotSizes.get(ticker);
  return DEFAULT_LOT_SIZE;
}

/**
 * Volumen diario estimado en USD (aproximación educativa).
 * Usado para estimar market impact y liquidez.
 */
export function getEstimatedDailyVolumeUsd(ticker) {
  const volumes = {
    AAPL: 500_000, MSFT: 400_000, GOOGL: 350_000, AMZN: 300_000,
    NVDA: 450_000, TSLA: 400_000, META: 250_000, SPY: 800_000, QQQ: 600_000,
    JPM: 150_000, V: 120_000, JNJ: 100_000, UNH: 80_000,
    ASML: 30_000, BKNG: 25_000, NOW: 20_000, RACE: 35_000,
  };
  return volumes[ticker] || 50_000;
}

/**
 * Estimates the total commission for a CEDEAR buy or sell operation on BYMA.
 *
 * The Argentine market has multiple fee layers that can significantly eat into returns,
 * especially for smaller trades. A round-trip (buy + sell) typically costs ~1.2-1.3%
 * of the trade amount — this means a pick needs to gain >1.3% just to break even.
 *
 * Fee structure:
 * - Market rights (derechos de mercado): 0.01% of trade value
 * - Broker commission: ~0.5% (varies by broker; some discount brokers charge less)
 * - BYMA fee: 0.006%
 * - CNV fee: 0.006%
 * - IVA (VAT) on all commissions: 21%
 *
 * @param {'BUY'|'SELL'} operationType - Type of operation (currently unused but reserved for future asymmetric fees)
 * @param {number} amountArs - Total trade amount in ARS
 * @returns {{ breakdown: { marketRights: number, brokerComm: number, bymaFee: number, cnvFee: number, iva: number }, total: number, pct: number, roundTripPct: number }}
 */
export function estimateCommission(operationType, amountArs) {
  if (!amountArs || amountArs <= 0) {
    return {
      breakdown: { marketRights: 0, brokerComm: 0, bymaFee: 0, cnvFee: 0, iva: 0 },
      total: 0,
      pct: 0,
      roundTripPct: 0,
    };
  }

  const marketRights = amountArs * 0.0001;
  const brokerComm = amountArs * 0.005;
  const bymaFee = amountArs * 0.00006;
  const cnvFee = amountArs * 0.00006;
  const subtotal = marketRights + brokerComm + bymaFee + cnvFee;
  const iva = subtotal * 0.21;
  const total = subtotal + iva;

  return {
    breakdown: {
      marketRights: Math.round(marketRights * 100) / 100,
      brokerComm: Math.round(brokerComm * 100) / 100,
      bymaFee: Math.round(bymaFee * 100) / 100,
      cnvFee: Math.round(cnvFee * 100) / 100,
      iva: Math.round(iva * 100) / 100,
    },
    total: Math.round(total * 100) / 100,
    pct: Math.round(((total / amountArs) * 100) * 10000) / 10000,
    roundTripPct: Math.round(((total / amountArs) * 100) * 2 * 10000) / 10000,
  };
}

export default CEDEARS;
