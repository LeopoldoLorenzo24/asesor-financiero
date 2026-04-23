// ============================================================
// PERFORMANCE MODULE
// Métricas reales de rentabilidad:
//   - getRealPicksAlpha()       → alfa real de picks evaluados vs SPY
//   - calculateSpyBenchmark()   → simulación DCA todo-SPY vs cartera real
// ============================================================

import { getCapitalHistory, getPredictionHistory } from "./database.js";
import { fetchHistory } from "./marketData.js";

// ── Helpers ──────────────────────────────────────────────────

/** Retorna un índice { "YYYY-MM-DD": closePrice } para lookup rápido */
function buildDateIndex(history) {
  const idx = {};
  for (const d of history) idx[d.date] = d.close;
  return idx;
}

/**
 * Dado un índice de precios y una fecha objetivo, devuelve el precio
 * de cierre disponible más cercano (en o antes de la fecha).
 */
function getPriceOn(idx, sortedDates, targetDate) {
  // Búsqueda binaria: último date <= targetDate
  let lo = 0, hi = sortedDates.length - 1, result = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedDates[mid] <= targetDate) {
      result = sortedDates[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result ? idx[result] : null;
}

// ── getRealPicksAlpha ─────────────────────────────────────────

/**
 * Calcula el alfa real de los picks del bot usando predicciones ya evaluadas.
 *
 * Para cada predicción COMPRAR evaluada:
 *   1. Obtiene el retorno real del pick (actual_change_pct)
 *   2. Obtiene el retorno de SPY en el mismo período (usando SPY.BA history)
 *   3. Calcula alfa = actual_change_pct − spy_change_pct
 *
 * Retorna null si no hay suficientes datos.
 */
export async function getRealPicksAlpha() {
  try {
    const predictions = await getPredictionHistory(60);
    const buys = predictions.filter(
      (p) => p.action === "COMPRAR" && p.actual_change_pct != null && p.prediction_date && p.evaluation_date
    );
    if (buys.length === 0) return null;

    // Fetch SPY history (12 meses cubre la mayoría de predicciones recientes)
    const spyHistory = await fetchHistory("SPY.BA", 14)
      .catch(() => fetchHistory("SPY", 14).catch(() => null));
    if (!spyHistory || spyHistory.length < 10) return null;

    const spyIdx = buildDateIndex(spyHistory);
    const sortedSpyDates = Object.keys(spyIdx).sort();

    const alphas = [];
    for (const p of buys) {
      const predDate = p.prediction_date.slice(0, 10);
      const evalDate = p.evaluation_date.slice(0, 10);
      const spyAtPred = getPriceOn(spyIdx, sortedSpyDates, predDate);
      const spyAtEval = getPriceOn(spyIdx, sortedSpyDates, evalDate);
      if (!spyAtPred || !spyAtEval || spyAtPred === 0) continue;

      const spyReturn = ((spyAtEval - spyAtPred) / spyAtPred) * 100;
      const alpha = p.actual_change_pct - spyReturn;
      alphas.push({
        ticker: p.ticker,
        predDate,
        evalDate,
        pickReturn: Math.round(p.actual_change_pct * 100) / 100,
        spyReturn: Math.round(spyReturn * 100) / 100,
        alpha: Math.round(alpha * 100) / 100,
        beatsSpy: alpha > 0,
      });
    }

    if (alphas.length === 0) return null;

    const avgAlpha = alphas.reduce((s, a) => s + a.alpha, 0) / alphas.length;
    const avgPickReturn = alphas.reduce((s, a) => s + a.pickReturn, 0) / alphas.length;
    const avgSpyReturn = alphas.reduce((s, a) => s + a.spyReturn, 0) / alphas.length;
    const winRate = (alphas.filter((a) => a.beatsSpy).length / alphas.length) * 100;
    const best = alphas.reduce((a, b) => (a.alpha > b.alpha ? a : b));
    const worst = alphas.reduce((a, b) => (a.alpha < b.alpha ? a : b));

    return {
      count: alphas.length,
      avgPickReturn: Math.round(avgPickReturn * 100) / 100,
      avgSpyReturn: Math.round(avgSpyReturn * 100) / 100,
      avgAlpha: Math.round(avgAlpha * 100) / 100,
      winRateVsSpy: Math.round(winRate * 100) / 100,
      bestAlpha: best,
      worstAlpha: worst,
      detail: alphas,
    };
  } catch (err) {
    console.warn("[performance] getRealPicksAlpha error:", err.message);
    return null;
  }
}

// ── calculateSpyBenchmark ─────────────────────────────────────

/**
 * Simula un portfolio DCA todo-SPY usando el historial de capital del usuario.
 *
 * Lógica:
 *   Por cada mes en capital_history (primer registro por mes):
 *   - Convierte el monthly_deposit a USD usando el ccl_rate de ese momento
 *   - "Compra" CEDEARs de SPY.BA a ese precio
 *   - Calcula cuánto valdrían hoy al precio actual de SPY.BA
 *
 * Retorna null si no hay suficiente historial de capital o datos de SPY.
 */
export async function calculateSpyBenchmark(currentCclVenta) {
  try {
    const history = await getCapitalHistory(120);
    if (history.length < 2) return null;

    // Ordenar cronológicamente
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));

    // Un registro por mes (primer registro de cada mes)
    const monthly = [];
    const seenMonth = new Set();
    for (const entry of sorted) {
      const key = entry.date.slice(0, 7);
      if (!seenMonth.has(key)) {
        seenMonth.add(key);
        monthly.push(entry);
      }
    }
    if (monthly.length < 2) return null;

    // Fetch SPY.BA history (cubre el período completo + algo más)
    const monthsCovered = monthly.length + 2;
    const spyHistory = await fetchHistory("SPY.BA", monthsCovered)
      .catch(() => fetchHistory("SPY", monthsCovered).catch(() => null));
    if (!spyHistory || spyHistory.length < 10) return null;

    const spyIdx = buildDateIndex(spyHistory);
    const sortedSpyDates = Object.keys(spyIdx).sort();

    const SPY_RATIO = 10; // 10 CEDEARs SPY.BA = 1 SPY share (ajustar si cambia)

    // Precio actual de SPY.BA
    const today = new Date().toISOString().slice(0, 10);
    const currentSpyPriceArs = getPriceOn(spyIdx, sortedSpyDates, today);
    if (!currentSpyPriceArs) return null;

    // Simular compras mensuales en SPY
    let totalSpyCedears = 0;
    let totalArsInvested = 0;
    let totalUsdInvested = 0;
    const monthlyLog = [];

    for (const entry of monthly) {
      const spyPriceArs = getPriceOn(spyIdx, sortedSpyDates, entry.date);
      if (!spyPriceArs || spyPriceArs === 0) continue;

      const ccl = entry.ccl_rate || currentCclVenta;
      const deposit = entry.monthly_deposit || 1000000;

      // Cuántos CEDEARs de SPY.BA se pueden comprar con el depósito
      const cedearsBought = deposit / spyPriceArs;
      totalSpyCedears += cedearsBought;
      totalArsInvested += deposit;
      totalUsdInvested += ccl > 0 ? deposit / ccl : 0;

      monthlyLog.push({
        date: entry.date,
        depositArs: deposit,
        spyPriceArs,
        cedearsBought: Math.round(cedearsBought * 100) / 100,
      });
    }

    if (totalSpyCedears === 0) return null;

    // Valor actual hipotético del portfolio SPY
    const spyPortfolioArs = Math.round(totalSpyCedears * currentSpyPriceArs);
    const spyPortfolioUsd = currentCclVenta > 0 ? Math.round(spyPortfolioArs / currentCclVenta) : null;
    const spyReturnPct = totalArsInvested > 0
      ? Math.round(((spyPortfolioArs - totalArsInvested) / totalArsInvested) * 10000) / 100
      : null;

    // Valor real actual (último registro)
    const latest = sorted[sorted.length - 1];
    const actualTotalArs = latest.total_value_ars;
    const actualTotalUsd = currentCclVenta > 0 ? Math.round(actualTotalArs / currentCclVenta) : null;

    const alphaArs = Math.round(actualTotalArs - spyPortfolioArs);
    const alphaUsd = actualTotalUsd != null && spyPortfolioUsd != null
      ? actualTotalUsd - spyPortfolioUsd
      : null;
    const actualReturnPct = totalArsInvested > 0
      ? Math.round(((actualTotalArs - totalArsInvested) / totalArsInvested) * 10000) / 100
      : null;

    return {
      months: monthly.length,
      totalArsInvested: Math.round(totalArsInvested),
      totalUsdInvested: Math.round(totalUsdInvested * 100) / 100,
      spyPortfolioArs,
      spyPortfolioUsd,
      spyReturnPct,
      actualTotalArs: Math.round(actualTotalArs),
      actualTotalUsd,
      actualReturnPct,
      alphaArs,
      alphaUsd,
      beatsSpy: alphaArs > 0,
      monthlyLog,
    };
  } catch (err) {
    console.warn("[performance] calculateSpyBenchmark error:", err.message);
    return null;
  }
}
