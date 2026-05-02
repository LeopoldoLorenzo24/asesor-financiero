/** @format */
// ============================================================
// RISK MANAGER v2
// Enforces position limits, sector concentration, and portfolio-level stops
// Uses REAL database fields: total_shares, weighted_avg_price
// ============================================================

import { RISK_CONFIG } from "./config.js";
import { toFiniteNumber } from "./utils.js";
import { getCedearLotSize } from "./cedears.js";

// ============================================================
// CIRCUIT BREAKER TYPES & FUNCTIONS
// Protect against tail-risk events by forcing defensive posture
// when market stress indicators exceed safe thresholds.
// ============================================================

export interface CircuitBreakerStatus {
  triggered: boolean;
  reasons: string[];
  action: 'none' | 'reduce_satellite' | 'full_core_only';
  maxSatellitePct: number;
}

/**
 * Check all circuit breakers. Called before AI analysis to protect capital.
 *
 * Thresholds rationale (based on institutional risk management):
 * - VIX > 35: Historically indicates crisis-level volatility (COVID, GFC). Active
 *   stock picking in these conditions is statistically destructive.
 * - VIX 25-35: Elevated fear. Satellite positions carry outsized risk.
 * - Drawdown > -12%: The portfolio has lost significant value. Preservation mode.
 * - Drawdown > -8%: Early warning; reduce risk exposure.
 * - trailingAlpha30d < -3%: Recent picks are materially underperforming the benchmark.
 *   Scaling back satellite reduces the bleed.
 * - consecutiveLossMonths >= 3: Persistent underperformance signals systematic
 *   misjudgment; pause active picking entirely.
 *
 * If multiple breakers trigger, the most restrictive action wins.
 */
export function checkCircuitBreakers(opts: {
  vixLevel: number | null;
  portfolioDrawdownPct: number | null;
  trailingAlpha30d: number | null;
  consecutiveLossMonths: number;
}): CircuitBreakerStatus {
  const reasons: string[] = [];
  let action: CircuitBreakerStatus['action'] = 'none';
  let maxSatellitePct = 100; // no constraint by default

  const { vixLevel, portfolioDrawdownPct, trailingAlpha30d, consecutiveLossMonths } = opts;

  // --- VIX-based breakers ---
  if (vixLevel != null && Number.isFinite(vixLevel)) {
    if (vixLevel > 35) {
      reasons.push(`VIX en ${vixLevel.toFixed(1)} (>35): crisis de volatilidad, satellite prohibido.`);
      action = 'full_core_only';
      maxSatellitePct = 0;
    } else if (vixLevel >= 25) {
      reasons.push(`VIX en ${vixLevel.toFixed(1)} (25-35): volatilidad elevada, satellite reducido.`);
      action = 'reduce_satellite';
      maxSatellitePct = Math.min(maxSatellitePct, 15);
    }
  }

  // --- Portfolio drawdown breakers ---
  if (portfolioDrawdownPct != null && Number.isFinite(portfolioDrawdownPct)) {
    if (portfolioDrawdownPct <= -12) {
      reasons.push(`Drawdown del portfolio ${portfolioDrawdownPct.toFixed(1)}% (< -12%): modo defensivo total.`);
      action = 'full_core_only';
      maxSatellitePct = 0;
    } else if (portfolioDrawdownPct <= -8) {
      reasons.push(`Drawdown del portfolio ${portfolioDrawdownPct.toFixed(1)}% (< -8%): reducir satellite.`);
      if (action !== 'full_core_only') {
        action = 'reduce_satellite';
        maxSatellitePct = Math.min(maxSatellitePct, 20);
      }
    }
  }

  // --- Trailing alpha breaker ---
  if (trailingAlpha30d != null && Number.isFinite(trailingAlpha30d)) {
    if (trailingAlpha30d < -3) {
      reasons.push(`Alpha 30d negativo: ${trailingAlpha30d.toFixed(1)}% (< -3%): picks recientes perdedores.`);
      if (action !== 'full_core_only') {
        action = 'reduce_satellite';
        maxSatellitePct = Math.min(maxSatellitePct, 15);
      }
    }
  }

  // --- Consecutive loss months breaker ---
  if (consecutiveLossMonths >= 3) {
    reasons.push(`${consecutiveLossMonths} meses consecutivos de pérdida: pausa total de stock picking.`);
    action = 'full_core_only';
    maxSatellitePct = 0;
  }

  return {
    triggered: action !== 'none',
    reasons,
    action,
    maxSatellitePct,
  };
}

/**
 * Calculate dynamic stop-loss based on ATR (Average True Range).
 *
 * Using ATR instead of a flat percentage adapts the stop to each ticker's
 * actual volatility, reducing whipsaw exits on volatile names and tightening
 * protection on low-volatility ones.
 *
 * Formula: stopLossPct = -(2 * ATR(20) / currentPrice) * 100
 * - Floor: -5% (never risk more than 5% on a single position)
 * - Cap: -20% (never set a stop so wide it's meaningless)
 * - VIX adjustment: if VIX > 30, tighten by 20% (multiply raw pct by 0.8)
 *   because elevated volatility increases gap risk.
 * - Trailing stop = 60% of absolute stop-loss (tighter, measured from peak)
 *   to lock in profits during momentum runs.
 */
export function calculateDynamicStopLoss(
  atr20: number,
  currentPrice: number,
  vixLevel: number | null
): {
  stopLossPct: number;
  trailingStopPct: number;
  rationale: string;
} {
  if (!Number.isFinite(atr20) || atr20 <= 0 || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    // Fallback to conservative defaults when data is unavailable
    return {
      stopLossPct: -10,
      trailingStopPct: -6,
      rationale: "Datos de ATR no disponibles; se usan stops conservadores por defecto (-10% / -6% trailing).",
    };
  }

  // Base calculation: 2x ATR as percentage of price
  let rawPct = -((2 * atr20) / currentPrice) * 100;

  // VIX adjustment: tighten stops in high-volatility regimes.
  // "Tighten" = trigger sooner = less negative. E.g., -14% * 0.8 = -11.2% (closer to 0).
  const vixAdjusted = vixLevel != null && Number.isFinite(vixLevel) && vixLevel > 30;
  if (vixAdjusted) {
    rawPct = rawPct * 0.8;
  }

  // Apply floor and cap (rawPct is negative)
  // Floor: never less aggressive than -5% (i.e., at least -5%)
  // Cap: never more aggressive than -20%
  const stopLossPct = Math.min(-5, Math.max(-20, rawPct));

  // Trailing stop: 60% of absolute stop-loss, from peak price
  const trailingStopPct = Math.round((stopLossPct * 0.6) * 100) / 100;

  const parts: string[] = [];
  parts.push(`ATR(20)=$${atr20.toFixed(2)}, precio=$${currentPrice.toFixed(2)}`);
  parts.push(`stop base: ${rawPct.toFixed(1)}%`);
  if (vixAdjusted) parts.push(`ajustado por VIX>${(vixLevel ?? 0).toFixed(0)} (×0.8)`);
  parts.push(`stop final: ${stopLossPct.toFixed(1)}%, trailing: ${trailingStopPct.toFixed(1)}%`);

  return {
    stopLossPct: Math.round(stopLossPct * 100) / 100,
    trailingStopPct,
    rationale: parts.join(". ") + ".",
  };
}

export interface PortfolioPosition {
  ticker: string;
  total_shares?: number;
  weighted_avg_price?: number;
  [key: string]: unknown;
}

export interface CapitalHistoryRow {
  total_value_ars?: number;
  [key: string]: unknown;
}

export interface Pick {
  ticker: string;
  monto_total_ars?: number;
  cantidad_cedears?: number;
  precio_aprox_ars?: number;
  [key: string]: unknown;
}

export interface CedearDef {
  sector?: string;
  [key: string]: unknown;
}

export interface TradeRiskResult {
  allowed: boolean;
  warnings: string[];
  maxLossPct: number;
  tickerPct: number;
  sectorPct: number;
}

export interface DrawdownResult {
  inDrawdown: boolean;
  drawdownPct: number | null;
  alert: string | null;
}

export interface SanitizeResult {
  sanitizedPicks: Pick[];
  riskNotes: string[];
}

export interface LotValidationResult {
  valid: boolean;
  adjustedQty: number;
  note: string | null;
}

export function validateLotSize(ticker: string, requestedQty: number): LotValidationResult {
  const lotSize = getCedearLotSize(ticker) ?? 1;
  if (requestedQty <= 0) {
    return { valid: false, adjustedQty: 0, note: `${ticker}: cantidad debe ser > 0.` };
  }
  const adjustedQty = Math.floor(requestedQty / lotSize) * lotSize;
  if (adjustedQty <= 0) {
    return {
      valid: false,
      adjustedQty: 0,
      note: `${ticker}: cantidad ${requestedQty} no alcanza el lote mínimo de ${lotSize}.`,
    };
  }
  if (adjustedQty !== requestedQty) {
    return {
      valid: true,
      adjustedQty,
      note: `${ticker}: ajustado de ${requestedQty} a ${adjustedQty} (lote ${lotSize}).`,
    };
  }
  return { valid: true, adjustedQty, note: null };
}

function positionValue(pos: PortfolioPosition | null | undefined): number {
  const shares = toFiniteNumber(pos?.total_shares, 0);
  const price = toFiniteNumber(pos?.weighted_avg_price, 0);
  return shares * price;
}

export function checkTradeRisk({
  profileId = "moderate",
  portfolioValueArs = 0,
  tickerValueArs = 0,
  sectorValueArs = 0,
  tradeAmountArs = 0,
  sector = "",
}: {
  profileId?: string;
  portfolioValueArs?: number;
  tickerValueArs?: number;
  sectorValueArs?: number;
  tradeAmountArs?: number;
  sector?: string;
}): TradeRiskResult {
  const warnings: string[] = [];
  const portfolioVal = toFiniteNumber(portfolioValueArs, 0);
  if (portfolioVal <= 0) return { allowed: true, warnings, maxLossPct: 0, tickerPct: 0, sectorPct: 0 };

  const maxPosPct = RISK_CONFIG.maxPositionPct[profileId as keyof typeof RISK_CONFIG.maxPositionPct] ?? RISK_CONFIG.maxPositionPct.moderate;
  const maxSectorPct = RISK_CONFIG.maxSectorConcentrationPct[profileId as keyof typeof RISK_CONFIG.maxSectorConcentrationPct] ?? RISK_CONFIG.maxSectorConcentrationPct.moderate;

  const projectedTickerValue = toFiniteNumber(tickerValueArs, 0) + toFiniteNumber(tradeAmountArs, 0);
  const tickerPct = (projectedTickerValue / portfolioVal) * 100;
  if (tickerPct > maxPosPct) {
    warnings.push(`Concentración en ticker excesiva: ${tickerPct.toFixed(1)}% (máx ${maxPosPct}%)`);
  }

  const projectedSectorValue = toFiniteNumber(sectorValueArs, 0) + toFiniteNumber(tradeAmountArs, 0);
  const sectorPct = (projectedSectorValue / portfolioVal) * 100;
  if (sectorPct > maxSectorPct) {
    warnings.push(`Concentración sectorial excesiva (${sector}): ${sectorPct.toFixed(1)}% (máx ${maxSectorPct}%)`);
  }

  const maxLoss = RISK_CONFIG.maxLossPerTradePct[profileId as keyof typeof RISK_CONFIG.maxLossPerTradePct] ?? RISK_CONFIG.maxLossPerTradePct.moderate;
  const allowed = warnings.length === 0;
  return { allowed, warnings, maxLossPct: maxLoss, tickerPct, sectorPct };
}

export function checkPortfolioDrawdown(capitalHistory: CapitalHistoryRow[] | null | undefined): DrawdownResult {
  if (!capitalHistory || capitalHistory.length < 2) return { inDrawdown: false, drawdownPct: null, alert: null };

  const values = capitalHistory.map((h) => toFiniteNumber(h.total_value_ars, 0)).filter((v) => v > 0);
  if (values.length < 2) return { inDrawdown: false, drawdownPct: null, alert: null };

  const peak = Math.max(...values);
  const current = values[0];
  if (peak <= 0 || current <= 0) return { inDrawdown: false, drawdownPct: null, alert: null };

  const drawdownPct = ((current - peak) / peak) * 100;
  if (drawdownPct <= RISK_CONFIG.maxMonthlyDrawdownPct) {
    return {
      inDrawdown: true,
      drawdownPct: Math.round(drawdownPct * 100) / 100,
      alert: `DRAWDOWN CRÍTICO: El portfolio cayó ${drawdownPct.toFixed(1)}% desde su pico de $${Math.round(peak).toLocaleString()}. Está por debajo del límite de ${RISK_CONFIG.maxMonthlyDrawdownPct}%. Considerar reducir posiciones riesgosas y aumentar core defensivo.`,
    };
  }
  return { inDrawdown: false, drawdownPct: Math.round(drawdownPct * 100) / 100, alert: null };
}

export function sanitizePicksWithRiskLimits(
  picks: Pick[] | null | undefined,
  portfolioSummary: PortfolioPosition[] | null | undefined,
  cedearDefs: Record<string, CedearDef> | null | undefined,
  profileId = "moderate",
  circuitBreaker?: CircuitBreakerStatus
): SanitizeResult {
  const notes: string[] = [];

  // Circuit breaker: full_core_only → reject all satellite picks
  if (circuitBreaker?.triggered && circuitBreaker.action === 'full_core_only') {
    notes.push(`CIRCUIT BREAKER (full_core_only): Todos los picks satellite eliminados. Razones: ${circuitBreaker.reasons.join(" | ")}`);
    return { sanitizedPicks: [], riskNotes: notes };
  }

  if (!picks?.length) return { sanitizedPicks: [], riskNotes: notes };

  const maxPosPct = RISK_CONFIG.maxPositionPct[profileId as keyof typeof RISK_CONFIG.maxPositionPct] ?? RISK_CONFIG.maxPositionPct.moderate;
  const totalPortfolioValue = (portfolioSummary || []).reduce((s, pos) => s + positionValue(pos), 0);

  const sectorValues: Record<string, number> = {};
  for (const pos of portfolioSummary || []) {
    const def = cedearDefs?.[pos.ticker];
    if (!def) continue;
    sectorValues[def.sector || "Unknown"] = (sectorValues[def.sector || "Unknown"] || 0) + positionValue(pos);
  }

  const sanitized: Pick[] = [];
  for (const pick of picks) {
    const ticker = pick.ticker;
    const existing = (portfolioSummary || []).find((p) => p.ticker === ticker);
    const existingValue = positionValue(existing);
    const pickValue = toFiniteNumber(pick.monto_total_ars, 0);
    const projectedTotal = existingValue + pickValue;
    const projectedPct = totalPortfolioValue > 0 ? (projectedTotal / totalPortfolioValue) * 100 : 0;

    const cedearDef = cedearDefs?.[ticker];
    const sector = cedearDef?.sector || "Unknown";
    const currentSectorValue = sectorValues[sector] || 0;
    const maxSectorPct = RISK_CONFIG.maxSectorConcentrationPct[profileId as keyof typeof RISK_CONFIG.maxSectorConcentrationPct] ?? RISK_CONFIG.maxSectorConcentrationPct.moderate;
    const projectedSectorPct = totalPortfolioValue > 0 ? ((currentSectorValue + pickValue) / totalPortfolioValue) * 100 : 0;

    let qty = toFiniteNumber(pick.cantidad_cedears, 0);
    let price = toFiniteNumber(pick.precio_aprox_ars, 0);

    // Validar lotes mínimos primero
    const lotCheck = validateLotSize(ticker, qty);
    if (lotCheck.note) notes.push(`Lote: ${lotCheck.note}`);
    qty = lotCheck.adjustedQty;

    // Aplicar límites de posición
    if (projectedPct > maxPosPct) {
      const maxAllowedValue = Math.max(0, (maxPosPct / 100) * totalPortfolioValue - existingValue);
      const maxQty = price > 0 ? Math.floor(maxAllowedValue / price) : 0;
      const posLotSize = getCedearLotSize(ticker) ?? 1;
      const lotAdjustedMax = Math.floor(maxQty / posLotSize) * posLotSize;
      notes.push(`Riesgo: ${ticker} excedería ${maxPosPct}% del portfolio (${projectedPct.toFixed(1)}%). Cantidad ajustada de ${pick.cantidad_cedears} → ${lotAdjustedMax}.`);
      qty = lotAdjustedMax;
    }

    // Aplicar límites de sector
    if (projectedSectorPct > maxSectorPct) {
      const maxAllowedValue = Math.max(0, (maxSectorPct / 100) * totalPortfolioValue - currentSectorValue);
      const maxQty = price > 0 ? Math.floor(maxAllowedValue / price) : 0;
      const secLotSize = getCedearLotSize(ticker) ?? 1;
      const lotAdjustedMax = Math.floor(maxQty / secLotSize) * secLotSize;
      notes.push(`Riesgo: ${ticker} (${sector}) excedería ${maxSectorPct}% del portfolio por sector (${projectedSectorPct.toFixed(1)}%). Cantidad ajustada de ${qty} → ${lotAdjustedMax}.`);
      qty = lotAdjustedMax;
    }

    pick.cantidad_cedears = qty;
    pick.monto_total_ars = Math.round(qty * price);
    if (qty > 0) sanitized.push(pick);
  }

  // Circuit breaker: reduce_satellite → cap total satellite allocation
  if (circuitBreaker?.triggered && circuitBreaker.action === 'reduce_satellite' && totalPortfolioValue > 0) {
    const maxSatelliteValue = (circuitBreaker.maxSatellitePct / 100) * totalPortfolioValue;
    const totalSatelliteValue = sanitized.reduce((sum, p) => sum + toFiniteNumber(p.monto_total_ars, 0), 0);
    if (totalSatelliteValue > maxSatelliteValue && totalSatelliteValue > 0) {
      const scaleFactor = maxSatelliteValue / totalSatelliteValue;
      notes.push(`CIRCUIT BREAKER (reduce_satellite): Satellite total $${Math.round(totalSatelliteValue).toLocaleString()} excede máx ${circuitBreaker.maxSatellitePct}% ($${Math.round(maxSatelliteValue).toLocaleString()}). Escalando picks ×${scaleFactor.toFixed(2)}. Razones: ${circuitBreaker.reasons.join(" | ")}`);
      for (const pick of sanitized) {
        const price = toFiniteNumber(pick.precio_aprox_ars, 0);
        if (price > 0) {
          const scaledQty = Math.floor((toFiniteNumber(pick.cantidad_cedears, 0)) * scaleFactor);
          const lotSize = getCedearLotSize(pick.ticker) ?? 1;
          pick.cantidad_cedears = Math.floor(scaledQty / lotSize) * lotSize;
          pick.monto_total_ars = Math.round(pick.cantidad_cedears * price);
        }
      }
      // Remove picks that scaled down to 0
      const filtered = sanitized.filter(p => toFiniteNumber(p.cantidad_cedears, 0) > 0);
      return { sanitizedPicks: filtered, riskNotes: notes };
    }
  }

  return { sanitizedPicks: sanitized, riskNotes: notes };
}
