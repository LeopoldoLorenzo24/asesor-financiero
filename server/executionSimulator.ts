// ============================================================
// EXECUTION SIMULATOR — Realistic Paper Trading Execution
// Simulates delay, partial fills, and variable slippage
// ============================================================

import { calculateBrokerCosts } from "./brokerCosts.js";

export interface SimulatedExecution {
  requestedTicker: string;
  requestedShares: number;
  requestedPrice: number;
  executedShares: number;
  executedPrice: number;
  slippagePct: number;
  delayMinutes: number;
  partialFill: boolean;
  brokerCosts: ReturnType<typeof calculateBrokerCosts>;
  totalCostArs: number;
  timestamp: string;
}

interface LiquidityProfile {
  avgDailyVolumeUsd: number;
  spreadPct: number;
}

// Perfiles de liquidez aproximados por ticker (educativo)
const LIQUIDITY_PROFILES: Record<string, LiquidityProfile> = {
  // Alta liquidez
  AAPL: { avgDailyVolumeUsd: 500_000, spreadPct: 0.3 },
  MSFT: { avgDailyVolumeUsd: 400_000, spreadPct: 0.3 },
  GOOGL: { avgDailyVolumeUsd: 350_000, spreadPct: 0.4 },
  AMZN: { avgDailyVolumeUsd: 300_000, spreadPct: 0.4 },
  NVDA: { avgDailyVolumeUsd: 450_000, spreadPct: 0.4 },
  TSLA: { avgDailyVolumeUsd: 400_000, spreadPct: 0.5 },
  META: { avgDailyVolumeUsd: 250_000, spreadPct: 0.4 },
  SPY:  { avgDailyVolumeUsd: 800_000, spreadPct: 0.2 },
  QQQ:  { avgDailyVolumeUsd: 600_000, spreadPct: 0.2 },
  // Media liquidez
  JPM:  { avgDailyVolumeUsd: 150_000, spreadPct: 0.6 },
  V:    { avgDailyVolumeUsd: 120_000, spreadPct: 0.6 },
  JNJ:  { avgDailyVolumeUsd: 100_000, spreadPct: 0.7 },
  UNH:  { avgDailyVolumeUsd: 80_000, spreadPct: 0.8 },
  // Baja liquidez
  ASML: { avgDailyVolumeUsd: 30_000, spreadPct: 1.2 },
  BKNG: { avgDailyVolumeUsd: 25_000, spreadPct: 1.5 },
  NOW:  { avgDailyVolumeUsd: 20_000, spreadPct: 1.5 },
  RACE: { avgDailyVolumeUsd: 35_000, spreadPct: 1.0 },
  // Default
  DEFAULT: { avgDailyVolumeUsd: 50_000, spreadPct: 1.0 },
};

function getLiquidityProfile(ticker: string): LiquidityProfile {
  return LIQUIDITY_PROFILES[ticker] || LIQUIDITY_PROFILES.DEFAULT;
}

/**
 * Simula una ejecución de compra realista.
 * Aplica:
 * - Slippage variable según liquidez
 * - Probabilidad de partial fill si el monto es >5% del volumen diario
 * - Delay de 5-30 minutos (horario regular) o 60-180 (fuera de hora)
 */
export function simulateBuyExecution(
  ticker: string,
  shares: number,
  theoreticalPriceArs: number,
  tradeAmountArs: number,
  isMarketHours = true
): SimulatedExecution {
  const profile = getLiquidityProfile(ticker);

  // Slippage base = spread/2 + impacto de mercado
  const marketImpact = Math.min(2.0, (tradeAmountArs / (profile.avgDailyVolumeUsd * 200)) * 100);
  const baseSlippage = profile.spreadPct / 2 + marketImpact;

  // Slippage aleatorio con tendencia al alza en compras
  const randomFactor = 0.8 + Math.random() * 0.4; // 0.8 - 1.2
  const slippagePct = baseSlippage * randomFactor;

  const executedPrice = theoreticalPriceArs * (1 + slippagePct / 100);

  // Partial fill: si el monto representa >3% del volumen diario estimado
  const dailyVolumeArs = profile.avgDailyVolumeUsd * 200; // Aprox CCL
  const fillRatio = tradeAmountArs / dailyVolumeArs;
  let executedShares = shares;
  let partialFill = false;

  if (fillRatio > 0.03) {
    // Probabilidad de partial fill aumenta con el tamaño relativo
    const fillProbability = Math.max(0.3, 1 - fillRatio * 5);
    if (Math.random() > fillProbability) {
      executedShares = Math.floor(shares * (0.5 + Math.random() * 0.5));
      partialFill = true;
    }
  }

  // Delay
  const delayMinutes = isMarketHours
    ? 5 + Math.floor(Math.random() * 25)
    : 60 + Math.floor(Math.random() * 120);

  const grossAmount = executedShares * executedPrice;
  const brokerCosts = calculateBrokerCosts(grossAmount);

  return {
    requestedTicker: ticker,
    requestedShares: shares,
    requestedPrice: theoreticalPriceArs,
    executedShares,
    executedPrice: Math.round(executedPrice * 100) / 100,
    slippagePct: Math.round(slippagePct * 100) / 100,
    delayMinutes,
    partialFill,
    brokerCosts,
    totalCostArs: Math.round(grossAmount + brokerCosts.totalCosts),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Simula una ejecución de venta realista.
 */
export function simulateSellExecution(
  ticker: string,
  shares: number,
  theoreticalPriceArs: number,
  tradeAmountArs: number,
  isMarketHours = true
): SimulatedExecution {
  const profile = getLiquidityProfile(ticker);

  const marketImpact = Math.min(2.0, (tradeAmountArs / (profile.avgDailyVolumeUsd * 200)) * 100);
  const baseSlippage = profile.spreadPct / 2 + marketImpact;

  // En ventas el slippage también penaliza (precio de ejecución menor)
  const randomFactor = 0.8 + Math.random() * 0.4;
  const slippagePct = baseSlippage * randomFactor;

  const executedPrice = theoreticalPriceArs * (1 - slippagePct / 100);

  const dailyVolumeArs = profile.avgDailyVolumeUsd * 200;
  const fillRatio = tradeAmountArs / dailyVolumeArs;
  let executedShares = shares;
  let partialFill = false;

  if (fillRatio > 0.03) {
    const fillProbability = Math.max(0.3, 1 - fillRatio * 5);
    if (Math.random() > fillProbability) {
      executedShares = Math.floor(shares * (0.5 + Math.random() * 0.5));
      partialFill = true;
    }
  }

  const delayMinutes = isMarketHours
    ? 5 + Math.floor(Math.random() * 25)
    : 60 + Math.floor(Math.random() * 120);

  const grossAmount = executedShares * executedPrice;
  const brokerCosts = calculateBrokerCosts(grossAmount);

  return {
    requestedTicker: ticker,
    requestedShares: shares,
    requestedPrice: theoreticalPriceArs,
    executedShares,
    executedPrice: Math.round(executedPrice * 100) / 100,
    slippagePct: Math.round(slippagePct * 100) / 100,
    delayMinutes,
    partialFill,
    brokerCosts,
    totalCostArs: Math.round(grossAmount - brokerCosts.totalCosts),
    timestamp: new Date().toISOString(),
  };
}
