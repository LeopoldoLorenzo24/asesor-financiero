/** @format */
// ============================================================
// RISK MANAGER v2
// Enforces position limits, sector concentration, and portfolio-level stops
// Uses REAL database fields: total_shares, weighted_avg_price
// ============================================================

import { RISK_CONFIG } from "./config.js";
import { toFiniteNumber } from "./utils.js";
import { getCedearLotSize } from "./cedears.js";

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
  const lotSize = getCedearLotSize(ticker);
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
  profileId = "moderate"
): SanitizeResult {
  const notes: string[] = [];
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
      const lotAdjustedMax = Math.floor(maxQty / getCedearLotSize(ticker)) * getCedearLotSize(ticker);
      notes.push(`Riesgo: ${ticker} excedería ${maxPosPct}% del portfolio (${projectedPct.toFixed(1)}%). Cantidad ajustada de ${pick.cantidad_cedears} → ${lotAdjustedMax}.`);
      qty = lotAdjustedMax;
    }

    // Aplicar límites de sector
    if (projectedSectorPct > maxSectorPct) {
      const maxAllowedValue = Math.max(0, (maxSectorPct / 100) * totalPortfolioValue - currentSectorValue);
      const maxQty = price > 0 ? Math.floor(maxAllowedValue / price) : 0;
      const lotAdjustedMax = Math.floor(maxQty / getCedearLotSize(ticker)) * getCedearLotSize(ticker);
      notes.push(`Riesgo: ${ticker} (${sector}) excedería ${maxSectorPct}% del portfolio por sector (${projectedSectorPct.toFixed(1)}%). Cantidad ajustada de ${qty} → ${lotAdjustedMax}.`);
      qty = lotAdjustedMax;
    }

    pick.cantidad_cedears = qty;
    pick.monto_total_ars = Math.round(qty * price);
    if (qty > 0) sanitized.push(pick);
  }

  return { sanitizedPicks: sanitized, riskNotes: notes };
}
