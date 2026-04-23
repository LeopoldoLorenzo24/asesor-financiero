// ============================================================
// TRADING ENGINE — Intraday / Swing Trading Module
// Reutiliza marketData, analysis, riskManager
// ============================================================

import { fetchQuote, fetchHistory } from "./marketData.js";
import { technicalAnalysis } from "./analysis.js";
import { checkTradeRisk } from "./riskManager.js";
import { toFiniteNumber } from "./utils.js";

export interface TradingSignal {
  ticker: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  horizon: string;
  reason: string;
  indicators: Record<string, unknown>;
}

export interface TradingPosition {
  ticker: string;
  shares: number;
  entryPrice: number;
  entryDate: string;
  stopLoss: number;
  takeProfit: number;
  unrealizedPnlPct: number;
  maxUnrealizedPnlPct: number;
  status: "open" | "closed";
}

/**
 * Genera señales de trading intraday/swing basadas en análisis técnico de corto plazo.
 * Horizonte: 1-5 días.
 */
export async function generateTradingSignals(tickers: string[], profileId = "moderate"): Promise<TradingSignal[]> {
  const signals: TradingSignal[] = [];

  for (const ticker of tickers) {
    try {
      const [quote, history] = await Promise.all([
        fetchQuote(ticker).catch(() => null),
        fetchHistory(ticker, 1).catch(() => []),
      ]);
      if (!quote?.price || !history || history.length < 10) continue;

      const tech = technicalAnalysis(history);
      const ind = tech.indicators || {};
      const currentPrice = quote.price;
      const rsi = ind.rsi ?? 50;
      const macd = ind.macd?.histogram ?? 0;
      const sma20 = ind.sma20;
      const bb = ind.bollingerBands;
      const perf1d = ind.performance?.day1 ?? 0;
      const perf1w = ind.performance?.week1 ?? 0;

      let action: "BUY" | "SELL" | "HOLD" = "HOLD";
      let confidence = 50;
      const reasons: string[] = [];

      // Reglas de trading de corto plazo
      if (rsi < 30 && macd > 0) {
        action = "BUY";
        confidence = 70;
        reasons.push("RSI sobrevendido + MACD positivo");
      } else if (rsi > 70 && macd < 0) {
        action = "SELL";
        confidence = 70;
        reasons.push("RSI sobrecomprado + MACD negativo");
      }

      if (sma20 && currentPrice > sma20 && action === "BUY") {
        confidence += 10;
        reasons.push("Precio sobre SMA20");
      } else if (sma20 && currentPrice < sma20 && action === "SELL") {
        confidence += 10;
        reasons.push("Precio bajo SMA20");
      }

      if (bb) {
        const bbPos = (currentPrice - bb.lower) / (bb.upper - bb.lower);
        if (bbPos < 0.1 && action === "BUY") {
          confidence += 10;
          reasons.push("Cerca de banda inferior de Bollinger");
        } else if (bbPos > 0.9 && action === "SELL") {
          confidence += 10;
          reasons.push("Cerca de banda superior de Bollinger");
        }
      }

      // Evitar señales débiles
      if (confidence < 65) action = "HOLD";

      // Cálculo de stop-loss y take-profit para trading
      const atr = ind.atr || currentPrice * 0.02;
      const stopLoss = action === "BUY" ? currentPrice - atr * 1.5 : action === "SELL" ? currentPrice + atr * 1.5 : null;
      const takeProfit = action === "BUY" ? currentPrice + atr * 3 : action === "SELL" ? currentPrice - atr * 3 : null;

      if (action !== "HOLD") {
        signals.push({
          ticker,
          action,
          confidence: Math.min(95, confidence),
          entryPrice: currentPrice,
          stopLoss,
          takeProfit,
          horizon: "Corto plazo (1-5 días)",
          reason: reasons.join("; "),
          indicators: { rsi, macd, sma20, bbPosition: bb ? (currentPrice - bb.lower) / (bb.upper - bb.lower) : null, perf1d, perf1w },
        });
      }
    } catch (e: any) {
      console.warn(`[trading] Error generando señal para ${ticker}:`, e.message);
    }
  }

  return signals.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Revisa posiciones abiertas de trading y genera alertas de salida.
 */
export function checkTradingExit(position: TradingPosition, currentPrice: number): { shouldExit: boolean; reason: string; pnlPct: number } {
  const pnlPct = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

  if (position.stopLoss && currentPrice <= position.stopLoss) {
    return { shouldExit: true, reason: "STOP-LOSS", pnlPct };
  }
  if (position.takeProfit && currentPrice >= position.takeProfit) {
    return { shouldExit: true, reason: "TAKE-PROFIT", pnlPct };
  }

  // Trailing stop: si cayó 50% desde el máximo unrealizado
  if (position.maxUnrealizedPnlPct > 5 && pnlPct < position.maxUnrealizedPnlPct * 0.5) {
    return { shouldExit: true, reason: "TRAILING STOP (50% desde máx)", pnlPct };
  }

  return { shouldExit: false, reason: "", pnlPct };
}

/**
 * Valida si un trade de trading cumple límites de riesgo.
 */
export function validateTradingTrade({ ticker, tradeAmount, portfolioValue, existingPositions }: {
  ticker: string; tradeAmount: number; portfolioValue: number; existingPositions: Record<string, number>;
}) {
  const maxSingleTradePct = 10; // máximo 10% del portfolio en una operación de trading
  const tradePct = portfolioValue > 0 ? (tradeAmount / portfolioValue) * 100 : 0;
  const warnings: string[] = [];
  if (tradePct > maxSingleTradePct) warnings.push(`Operación excede ${maxSingleTradePct}% del portfolio (${tradePct.toFixed(1)}%)`);

  const totalOpen = Object.values(existingPositions).reduce((a, b) => a + b, 0) + tradeAmount;
  const openPct = portfolioValue > 0 ? (totalOpen / portfolioValue) * 100 : 0;
  if (openPct > 30) warnings.push(`Capital comprometido en trading >30% (${openPct.toFixed(1)}%)`);

  return { allowed: warnings.length === 0, warnings, maxLoss: tradeAmount * 0.015 }; // 1.5% stop-loss típico
}
