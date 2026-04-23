/** @format */

// ============================================================
// CENTRALIZED CONFIGURATION
// All hardcoded values extracted into one place
// ============================================================

export interface AppConfig {
  name: string;
  version: string;
  port: number;
  clientOrigin: string;
  corsAllowedOrigins: string[];
  cacheTtlSeconds: number;
  defaultMonthlyDeposit: number;
  trustProxy: boolean | number | string;
  isProduction: boolean;
  rateLimitFailOpen: boolean;
}

export interface AiConfig {
  model: string;
  maxTokensAnalyze: number;
  maxTokensSingle: number;
  maxTokensPostMortem: number;
  maxTokensConclude: number;
  budgetDailyUsd: number;
  analysisCooldownMs: number;
  backtestCacheTtlMs: number;
}

export interface RateLimitConfig {
  authMaxRequests: number;
  authWindowMs: number;
  aiMaxRequests: number;
  aiWindowMs: number;
}

export interface BacktestConfig {
  defaultMonths: number;
  maxMonths: number;
  minMonths: number;
  defaultPicksPerMonth: number;
  maxPicksPerMonth: number;
  minPicksPerMonth: number;
  defaultMonthlyDeposit: number;
  stopLossPct: number;
  takeProfitPct: number;
  takeProfitSellPct: number;
  maxPerSector: number;
  maxTotalCandidates: number;
  historyBufferMonths: number;
  batchSize: number;
  commissionPct: number;
  slippagePct: number;
}

export interface RankingConfig {
  preRankLimit: number;
  fullAnalysisBatchSize: number;
  fullAnalysisDelayMs: number;
  historyMonths: number;
  detailHistoryMonths: number;
  spyHistoryMonths: number;
  defaultProfile: string;
}

export interface RiskLimits {
  conservative: number;
  moderate: number;
  aggressive: number;
}

export interface RiskConfig {
  maxPositionPct: RiskLimits;
  minSectors: RiskLimits;
  maxLossPerTradePct: RiskLimits;
  maxMonthlyDrawdownPct: number;
  maxPortfolioConcentrationPct: number;
  maxSectorConcentrationPct: RiskLimits;
}

export interface TechnicalConfig {
  rsiPeriod: number;
  smaPeriods: { short: number; medium: number; long: number };
  emaPeriods: { fast: number; slow: number };
  macdSignalPeriod: number;
  bollingerPeriod: number;
  bollingerStdDev: number;
  atrPeriod: number;
  stochasticK: number;
  stochasticD: number;
  volumeLookback: number;
  supportResistanceLookback: number;
  performancePeriods: Record<string, number>;
}

export interface ScoringConfig {
  weights: Record<string, { tech: number; fund: number; sent: number }>;
  thresholds: Record<string, number>;
  confirmedDowntrendCap: number;
}

export interface ProfileDef {
  label: string;
  corePct: number;
  coreETF: string;
  minConviction: number;
  stopLossRange: string;
  personality: string;
  rules: string;
}

export interface MarketDataConfig {
  bymaBaseUrl: string;
  cclApiUrl: string;
  yahooCacheTtlMs: number;
  fallbackCacheTtlMs: number;
  requestTimeoutMs: number;
  maxRetries: number;
}

export interface DbConfig {
  autoEvalIntervalMs: number;
  stopLossCheckIntervalMs: number;
  dailyCapitalLogIntervalMs: number;
  cleanRateLimitIntervalMs: number;
  serverSettleDelayMs: number;
}

function parseBooleanEnv(value: string | undefined, fallback = false): boolean {
  if (value == null || value === "") return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function parseOriginList(value: string | undefined, fallback: string): string[] {
  return [...new Set(
    String(value || fallback)
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  )];
}

function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (value == null || value === "") return false;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const normalized = trimmed.toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") return false;
  return trimmed;
}

const defaultClientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

export const APP_CONFIG: AppConfig = {
  name: "CEDEAR ADVISOR",
  version: "2.0.0",
  port: parseInt(process.env.PORT || "3001", 10),
  clientOrigin: defaultClientOrigin,
  corsAllowedOrigins: parseOriginList(process.env.CORS_ALLOWED_ORIGINS, defaultClientOrigin),
  cacheTtlSeconds: Number.isFinite(parseInt(process.env.CACHE_TTL || "", 10)) ? parseInt(process.env.CACHE_TTL || "", 10) : 300,
  defaultMonthlyDeposit: 1_000_000,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  isProduction: process.env.NODE_ENV === "production",
  rateLimitFailOpen: parseBooleanEnv(process.env.RATE_LIMIT_FAIL_OPEN, false),
};

export const AI_CONFIG: AiConfig = {
  model: process.env.AI_MODEL || "claude-sonnet-4-20250514",
  maxTokensAnalyze: 4500,
  maxTokensSingle: 1800,
  maxTokensPostMortem: 1200,
  maxTokensConclude: 800,
  budgetDailyUsd: Number.isFinite(parseFloat(process.env.AI_BUDGET_DAILY_USD || "")) ? parseFloat(process.env.AI_BUDGET_DAILY_USD || "") : 5.0,
  analysisCooldownMs: 60 * 60 * 1000,
  backtestCacheTtlMs: 6 * 60 * 60 * 1000,
};

export const RATE_LIMIT_CONFIG: RateLimitConfig = {
  authMaxRequests: 10,
  authWindowMs: 15 * 60 * 1000,
  aiMaxRequests: 5,
  aiWindowMs: 60 * 60 * 1000,
};

export const BACKTEST_CONFIG: BacktestConfig = {
  defaultMonths: 6,
  maxMonths: 24,
  minMonths: 1,
  defaultPicksPerMonth: 4,
  maxPicksPerMonth: 8,
  minPicksPerMonth: 2,
  defaultMonthlyDeposit: 1_000_000,
  stopLossPct: -0.12,
  takeProfitPct: 0.25,
  takeProfitSellPct: 0.5,
  maxPerSector: 6,
  maxTotalCandidates: 60,
  historyBufferMonths: 7,
  batchSize: 8,
  commissionPct: 0.005,
  slippagePct: 0.01,
};

export const RANKING_CONFIG: RankingConfig = {
  preRankLimit: 20,
  fullAnalysisBatchSize: 3,
  fullAnalysisDelayMs: 500,
  historyMonths: 6,
  detailHistoryMonths: 12,
  spyHistoryMonths: 12,
  defaultProfile: "moderate",
};

export const RISK_CONFIG: RiskConfig = {
  maxPositionPct: {
    conservative: 20,
    moderate: 35,
    aggressive: 50,
  },
  minSectors: {
    conservative: 3,
    moderate: 3,
    aggressive: 2,
  },
  maxLossPerTradePct: {
    conservative: -5,
    moderate: -8,
    aggressive: -12,
  },
  maxMonthlyDrawdownPct: -15,
  maxPortfolioConcentrationPct: 50,
  maxSectorConcentrationPct: {
    conservative: 25,
    moderate: 35,
    aggressive: 50,
  },
};

export const TECHNICAL_CONFIG: TechnicalConfig = {
  rsiPeriod: 14,
  smaPeriods: { short: 20, medium: 50, long: 200 },
  emaPeriods: { fast: 12, slow: 26 },
  macdSignalPeriod: 9,
  bollingerPeriod: 20,
  bollingerStdDev: 2,
  atrPeriod: 14,
  stochasticK: 14,
  stochasticD: 3,
  volumeLookback: 20,
  supportResistanceLookback: 60,
  performancePeriods: {
    day1: 2,
    week1: 5,
    month1: 21,
    month3: 63,
    month6: 126,
  },
};

export const SCORING_CONFIG: ScoringConfig = {
  weights: {
    conservative: { tech: 0.25, fund: 0.50, sent: 0.25 },
    moderate: { tech: 0.35, fund: 0.40, sent: 0.25 },
    aggressive: { tech: 0.45, fund: 0.30, sent: 0.25 },
  },
  thresholds: {
    strongBuy: 72,
    buy: 60,
    hold: 45,
    caution: 35,
  },
  confirmedDowntrendCap: 68,
};

export const PROFILE_CONFIG: Record<string, ProfileDef> = {
  conservative: {
    label: "CONSERVADOR",
    corePct: 80,
    coreETF: "SPY",
    minConviction: 85,
    stopLossRange: "-5% a -8%",
    personality:
      "Sos un asesor financiero CONSERVADOR argentino experto en CEDEARs. Tu DEFAULT es SPY. Solo recomendás picks activos si tenés convicción altísima (>85/100). Preservar capital es la prioridad absoluta. Ante la duda: todo a SPY.",
    rules:
      "DISTRIBUCIÓN: 80% SPY / 20% picks MÁXIMO. Si no hay oportunidades claras, 100% SPY. Picks solo con conviction ≥85. Priorizar dividendos, empresas estables, baja volatilidad. Máximo 20% en un solo CEDEAR activo, mínimo 3 sectores si hay satellite.",
  },
  moderate: {
    label: "MODERADO-AGRESIVO",
    corePct: 50,
    coreETF: "SPY",
    minConviction: 70,
    stopLossRange: "-8% a -12%",
    personality:
      "Sos un asesor financiero argentino experto en CEDEARs. Tu DEFAULT es SPY. Solo recomendás picks activos si tenés convicción real (>70/100). Buscás balance: indexación pasiva + stock picking oportunista.",
    rules:
      "DISTRIBUCIÓN: 50% SPY / 50% picks MÁXIMO. Si no hay oportunidades claras, subí SPY a 80-100%. Cada pick necesita conviction ≥70 y razón concreta de por qué le gana a SPY. Máximo 35% en un sector, mínimo 3 sectores en satellite.",
  },
  aggressive: {
    label: "AGRESIVO",
    corePct: 30,
    coreETF: "QQQ",
    minConviction: 60,
    stopLossRange: "-15% a -20%",
    personality:
      "Sos un asesor financiero AGRESIVO argentino experto en CEDEARs. Tu core es QQQ. Buscás alpha con picks de alta convicción. Tolerás volatilidad alta. Pero incluso en modo agresivo, QQQ es tu default.",
    rules:
      "DISTRIBUCIÓN: 30% QQQ / 70% picks MÁXIMO. Si no hay oportunidades claras, subí QQQ a 60-100%. Cada pick necesita conviction ≥60 y explicación de alpha vs QQQ. Hasta 50% en un solo sector. Mínimo 2 sectores en satellite.",
  },
};

export const SECTOR_CATEGORIES: Record<string, string[]> = {
  growth: ["Technology", "Consumer Cyclical", "E-Commerce", "Communication", "Crypto"],
  defensive: ["Consumer Defensive", "Healthcare", "Financial"],
  hedge: ["Energy", "Materials"],
  index: [
    "ETF - Índices",
    "ETF - Internacional",
    "ETF - Sectorial",
    "ETF - Commodities",
    "ETF - Temático",
    "ETF - Dividendos",
    "ETF - Crypto",
  ],
};

export const MARKET_DATA_CONFIG: MarketDataConfig = {
  bymaBaseUrl: "https://www.byma.com.ar",
  cclApiUrl: "https://dolarapi.com/v1/dolares/contadoconliqui",
  yahooCacheTtlMs: 5 * 60 * 1000,
  fallbackCacheTtlMs: 15 * 60 * 1000,
  requestTimeoutMs: 10000,
  maxRetries: 2,
};

export const DB_CONFIG: DbConfig = {
  autoEvalIntervalMs: 6 * 60 * 60 * 1000,
  stopLossCheckIntervalMs: 4 * 60 * 60 * 1000,
  dailyCapitalLogIntervalMs: 24 * 60 * 60 * 1000,
  cleanRateLimitIntervalMs: 6 * 60 * 60 * 1000,
  serverSettleDelayMs: 2 * 60 * 1000,
};
