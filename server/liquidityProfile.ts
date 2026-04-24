// ============================================================
// LIQUIDITY PROFILE ENGINE — Dynamic volume-based profiles
// Uses REAL Yahoo Finance volume data instead of hardcoded guesses
// ============================================================

import { fetchQuote, fetchHistory } from "./marketData.js";
import { toFiniteNumber } from "./utils.js";

export interface LiquidityProfile {
  ticker: string;
  avgDailyVolume: number;        // Promedio de volumen real (acciones)
  avgDailyValueUsd: number;      // Valor promedio diario en USD
  spreadEstimatePct: number;     // Spread estimado según liquidez
  marketImpactPct: number;       // Impacto de mercado para $10k USD
  lastUpdated: string;
}

const PROFILE_CACHE = new Map<string, { profile: LiquidityProfile; expiresAt: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

function getCachedProfile(ticker: string): LiquidityProfile | null {
  const cached = PROFILE_CACHE.get(ticker);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;
  return null;
}

function setCachedProfile(ticker: string, profile: LiquidityProfile) {
  PROFILE_CACHE.set(ticker, { profile, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Calcula un perfil de liquidez basado en datos reales de volumen.
 * Usa history de 30 días para calcular volumen promedio real.
 */
export async function computeLiquidityProfile(ticker: string): Promise<LiquidityProfile | null> {
  const cached = getCachedProfile(ticker);
  if (cached) return cached;

  try {
    const [quote, history] = await Promise.all([
      fetchQuote(ticker).catch(() => null),
      fetchHistory(ticker, 1).catch(() => []),
    ]);

    const price = quote?.price || (history.length > 0 ? history[history.length - 1].close : 0);
    if (!price || price <= 0) return null;

    // Calcular volumen promedio de los últimos 30 días de history
    const recentHistory = history.slice(-30);
    const volumes = recentHistory
      .map((d) => toFiniteNumber((d as any).volume, 0))
      .filter((v) => v > 0);

    let avgDailyVolume = quote?.avgVolume || 0;
    if (volumes.length > 5) {
      const histAvg = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      // Usar promedio entre Yahoo avgVolume y nuestro cálculo histórico
      avgDailyVolume = avgDailyVolume > 0 ? (avgDailyVolume + histAvg) / 2 : histAvg;
    }

    if (avgDailyVolume <= 0) avgDailyVolume = 1000; // Fallback mínimo

    const avgDailyValueUsd = avgDailyVolume * price;

    // Estimar spread basado en liquidez
    // Alta liquidez (>$50M/día) → spread ~0.2-0.4%
    // Media ($5M-$50M) → spread ~0.5-1.0%
    // Baja (<$5M) → spread ~1.0-2.5%
    let spreadEstimatePct = 1.0;
    if (avgDailyValueUsd > 50_000_000) spreadEstimatePct = 0.3;
    else if (avgDailyValueUsd > 10_000_000) spreadEstimatePct = 0.5;
    else if (avgDailyValueUsd > 5_000_000) spreadEstimatePct = 0.8;
    else if (avgDailyValueUsd > 1_000_000) spreadEstimatePct = 1.5;
    else spreadEstimatePct = 2.5;

    // Market impact para $10k USD según raíz cuadrada del volumen relativo
    // Fórmula: impacto ≈ 1 / sqrt(volumen relativo en millones)
    const sampleTradeUsd = 10_000;
    const relativeVolume = avgDailyValueUsd / 1_000_000;
    const marketImpactPct = relativeVolume > 0
      ? Math.min(3.0, Math.max(0.05, 1.0 / Math.sqrt(relativeVolume) * (sampleTradeUsd / avgDailyValueUsd) * 100))
      : 1.0;

    const profile: LiquidityProfile = {
      ticker,
      avgDailyVolume: Math.round(avgDailyVolume),
      avgDailyValueUsd: Math.round(avgDailyValueUsd),
      spreadEstimatePct: Math.round(spreadEstimatePct * 100) / 100,
      marketImpactPct: Math.round(marketImpactPct * 100) / 100,
      lastUpdated: new Date().toISOString(),
    };

    setCachedProfile(ticker, profile);
    return profile;
  } catch (err: any) {
    console.warn(`[liquidity] Error computing profile for ${ticker}:`, err.message);
    return null;
  }
}

/**
 * Batch computation de perfiles de liquidez para múltiples tickers.
 */
export async function computeLiquidityProfiles(tickers: string[]): Promise<Record<string, LiquidityProfile>> {
  const result: Record<string, LiquidityProfile> = {};
  const batches: string[][] = [];
  for (let i = 0; i < tickers.length; i += 5) {
    batches.push(tickers.slice(i, i + 5));
  }
  for (const batch of batches) {
    const batchResults = await Promise.allSettled(
      batch.map((t) => computeLiquidityProfile(t))
    );
    for (let i = 0; i < batch.length; i++) {
      const r = batchResults[i];
      if (r.status === "fulfilled" && r.value) {
        result[batch[i]] = r.value;
      }
    }
  }
  return result;
}

/**
 * Determina si un monto de operación es viable dada la liquidez real.
 * Retorna: { viable, maxRecommendedUsd, impactPct, warning }
 */
export function assessTradeLiquidity(
  profile: LiquidityProfile,
  tradeAmountUsd: number
): { viable: boolean; maxRecommendedUsd: number; impactPct: number; warning: string | null } {
  const maxRecommendedUsd = profile.avgDailyValueUsd * 0.03; // Máximo 3% del ADV
  const impactPct = profile.marketImpactPct * (tradeAmountUsd / 10_000);

  if (tradeAmountUsd > profile.avgDailyValueUsd * 0.10) {
    return {
      viable: false,
      maxRecommendedUsd,
      impactPct: Math.round(impactPct * 100) / 100,
      warning: `Operación ($${Math.round(tradeAmountUsd).toLocaleString("es-AR")}) >10% del volumen diario promedio ($${Math.round(profile.avgDailyValueUsd).toLocaleString("es-AR")}). Riesgo alto de no ejecutar o mover precio.`,
    };
  }

  if (tradeAmountUsd > maxRecommendedUsd) {
    return {
      viable: true,
      maxRecommendedUsd,
      impactPct: Math.round(impactPct * 100) / 100,
      warning: `Operación grande: ${(tradeAmountUsd / profile.avgDailyValueUsd * 100).toFixed(1)}% del volumen diario. Impacto estimado: ${impactPct.toFixed(2)}%`,
    };
  }

  return {
    viable: true,
    maxRecommendedUsd,
    impactPct: Math.round(impactPct * 100) / 100,
    warning: null,
  };
}
