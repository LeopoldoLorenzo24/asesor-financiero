// ============================================================
// EXECUTION SIMULATOR — Realistic Paper Trading Execution
// Simulates delay, partial fills, and variable slippage
// Uses REAL liquidity data from liquidityProfile.ts
// ============================================================

import { calculateBrokerCosts } from "./brokerCosts.js";
import { computeLiquidityProfile, LiquidityProfile, assessTradeLiquidity } from "./liquidityProfile.js";

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
  liquidityWarning: string | null;
}

/**
 * Simula una ejecución de compra realista usando datos de liquidez reales.
 */
export async function simulateBuyExecution(
  ticker: string,
  shares: number,
  theoreticalPriceArs: number,
  tradeAmountArs: number,
  isMarketHours = true,
  cclRate = 0,
  brokerKey = "default"
): Promise<SimulatedExecution> {
  const profile = await computeLiquidityProfile(ticker);
  const effectiveCcl = cclRate > 0 ? cclRate : 1200; // fallback only if caller didn't provide

  let spreadEstimate = 1.0;
  let marketImpactBase = 0.5;
  let liquidityWarning: string | null = null;

  if (profile) {
    spreadEstimate = profile.spreadEstimatePct;
    marketImpactBase = profile.marketImpactPct;
    const assessment = assessTradeLiquidity(profile, tradeAmountArs / effectiveCcl);
    if (assessment.warning) liquidityWarning = assessment.warning;
  }

  // Slippage base = spread/2 + impacto de mercado escalado
  const marketImpact = Math.min(2.0, marketImpactBase * (tradeAmountArs / 100_000));
  const baseSlippage = spreadEstimate / 2 + marketImpact;

  // Slippage aleatorio con tendencia al alza en compras
  const randomFactor = 0.8 + Math.random() * 0.4;
  const slippagePct = baseSlippage * randomFactor;

  const executedPrice = theoreticalPriceArs * (1 + slippagePct / 100);

  // Partial fill basado en volumen real si disponible
  let executedShares = shares;
  let partialFill = false;

  if (profile) {
    const tradeValueUsd = tradeAmountArs / effectiveCcl;
    const fillRatio = tradeValueUsd / profile.avgDailyValueUsd;
    if (fillRatio > 0.03) {
      const fillProbability = Math.max(0.3, 1 - fillRatio * 5);
      if (Math.random() > fillProbability) {
        executedShares = Math.floor(shares * (0.5 + Math.random() * 0.5));
        partialFill = true;
      }
    }
  }

  // Delay
  const delayMinutes = isMarketHours
    ? 5 + Math.floor(Math.random() * 25)
    : 60 + Math.floor(Math.random() * 120);

  const grossAmount = executedShares * executedPrice;
  const brokerCosts = calculateBrokerCosts(grossAmount, brokerKey);

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
    liquidityWarning,
  };
}

/**
 * Simula una ejecución de venta realista usando datos de liquidez reales.
 */
export async function simulateSellExecution(
  ticker: string,
  shares: number,
  theoreticalPriceArs: number,
  tradeAmountArs: number,
  isMarketHours = true,
  cclRate = 0,
  brokerKey = "default"
): Promise<SimulatedExecution> {
  const profile = await computeLiquidityProfile(ticker);
  const effectiveCcl = cclRate > 0 ? cclRate : 1200;

  let spreadEstimate = 1.0;
  let marketImpactBase = 0.5;
  let liquidityWarning: string | null = null;

  if (profile) {
    spreadEstimate = profile.spreadEstimatePct;
    marketImpactBase = profile.marketImpactPct;
    const assessment = assessTradeLiquidity(profile, tradeAmountArs / effectiveCcl);
    if (assessment.warning) liquidityWarning = assessment.warning;
  }

  const marketImpact = Math.min(2.0, marketImpactBase * (tradeAmountArs / 100_000));
  const baseSlippage = spreadEstimate / 2 + marketImpact;

  const randomFactor = 0.8 + Math.random() * 0.4;
  const slippagePct = baseSlippage * randomFactor;

  const executedPrice = theoreticalPriceArs * (1 - slippagePct / 100);

  let executedShares = shares;
  let partialFill = false;

  if (profile) {
    const tradeValueUsd = tradeAmountArs / effectiveCcl;
    const fillRatio = tradeValueUsd / profile.avgDailyValueUsd;
    if (fillRatio > 0.03) {
      const fillProbability = Math.max(0.3, 1 - fillRatio * 5);
      if (Math.random() > fillProbability) {
        executedShares = Math.floor(shares * (0.5 + Math.random() * 0.5));
        partialFill = true;
      }
    }
  }

  const delayMinutes = isMarketHours
    ? 5 + Math.floor(Math.random() * 25)
    : 60 + Math.floor(Math.random() * 120);

  const grossAmount = executedShares * executedPrice;
  const brokerCosts = calculateBrokerCosts(grossAmount, brokerKey);

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
    liquidityWarning,
  };
}
