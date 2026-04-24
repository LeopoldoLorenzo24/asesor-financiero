// ============================================================
// MACRO CIRCUIT BREAKERS
// Detects extreme Argentine market conditions that should halt
// real capital deployment regardless of system readiness.
// ============================================================

import { fetchCCL, fetchHistory } from "./marketData.js";

export interface MacroCircuitBreakerState {
  cclVolatilityHigh: boolean;
  cclSpikePct: number | null;
  exchangeRateGapHigh: boolean;
  estimatedGapPct: number | null;
  marketFrozen: boolean;
  reason: string | null;
  severity: "none" | "warning" | "critical";
  shouldHaltTrading: boolean;
  shouldHaltNewCapital: boolean;
}

const CCL_VOLATILITY_DAYS = 5;
const CCL_SPIKE_THRESHOLD_PCT = 10;    // >10% en 5 días
const GAP_THRESHOLD_PCT = 40;          // Brecha CCL/blue >40%

export async function checkMacroCircuitBreakers(): Promise<MacroCircuitBreakerState> {
  let cclVolatilityHigh = false;
  let cclSpikePct: number | null = null;
  let exchangeRateGapHigh = false;
  let estimatedGapPct: number | null = null;
  let marketFrozen = false;
  let severity: "none" | "warning" | "critical" = "none";
  let reason: string | null = null;

  try {
    // 1. CCL Volatility check
    const cclHistory = await fetchHistory("USDARS=X", 2).catch(() => []);
    // Nota: USDARS=X en Yahoo da tipo de cambio oficial aprox. Usamos CCL de la API
    const cclNow = await fetchCCL().catch(() => null) as any;

    if (cclNow?.venta && cclHistory.length >= CCL_VOLATILITY_DAYS) {
      const recent = cclHistory.slice(-CCL_VOLATILITY_DAYS);
      const oldestClose = recent[0]?.close || cclNow.venta;
      const latestClose = recent[recent.length - 1]?.close || cclNow.venta;
      if (oldestClose > 0) {
        cclSpikePct = Math.round(((latestClose - oldestClose) / oldestClose) * 10000) / 100;
        cclVolatilityHigh = Math.abs(cclSpikePct) > CCL_SPIKE_THRESHOLD_PCT;
      }
    }

    // 2. Brecha cambiaria estimada (CCL vs Blue approx via DolarAPI)
    // Usamos la API de dolarapi para obtener blue
    let blueRate = null;
    try {
      const res = await fetch("https://dolarapi.com/v1/dolares/blue").catch(() => null);
      if (res && res.ok) {
        const data = await res.json() as { venta?: number } | undefined;
        blueRate = data?.venta ?? null;
      }
    } catch {
      blueRate = null;
    }

    if (cclNow?.venta && blueRate && blueRate > 0) {
      estimatedGapPct = Math.round(((cclNow.venta - blueRate) / blueRate) * 10000) / 100;
      exchangeRateGapHigh = Math.abs(estimatedGapPct) > GAP_THRESHOLD_PCT;
    }

    // 3. Mercado congelado: si no hay datos de CCL hace >2 días
    const lastCclDate = cclHistory.length > 0 ? cclHistory[cclHistory.length - 1].date : null;
    if (lastCclDate) {
      const daysSinceCcl = Math.floor((Date.now() - new Date(lastCclDate).getTime()) / (86400000));
      if (daysSinceCcl > 2) {
        marketFrozen = true;
      }
    }
  } catch (err: any) {
    console.warn("[macroCB] Error checking circuit breakers:", err.message);
    // En duda, asumimos condición de advertencia
    severity = "warning";
    reason = "No se pudieron verificar condiciones macro. Asumiendo precaución.";
  }

  if (marketFrozen) {
    severity = "critical";
    reason = `Mercado congelado: último dato de CCL hace >2 días. No operar capital real.`;
  } else if (cclVolatilityHigh && exchangeRateGapHigh) {
    severity = "critical";
    reason = `Crisis cambiaria detectada: CCL saltó ${cclSpikePct}% en ${CCL_VOLATILITY_DAYS} días y brecha ${estimatedGapPct}%. Capital real congelado.`;
  } else if (cclVolatilityHigh) {
    severity = "warning";
    reason = `Volatilidad extrema del CCL: ${cclSpikePct}% en ${CCL_VOLATILITY_DAYS} días. Solo operar con capital mínimo.`;
  } else if (exchangeRateGapHigh) {
    severity = "warning";
    reason = `Brecha cambiaria elevada: ${estimatedGapPct}%. Posible cepo o restricciones.`;
  }

  const shouldHaltTrading = severity === "critical";
  const shouldHaltNewCapital = severity === "critical" || severity === "warning";

  return {
    cclVolatilityHigh,
    cclSpikePct,
    exchangeRateGapHigh,
    estimatedGapPct,
    marketFrozen,
    reason,
    severity,
    shouldHaltTrading,
    shouldHaltNewCapital,
  };
}
