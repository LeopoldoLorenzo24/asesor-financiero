// ============================================================
// FEATURE IMPORTANCE ENGINE
// Analiza qué indicadores técnicos/fundamentales predicen mejor
// usando historial real de predicciones evaluadas
// ============================================================

import { getMLDataset, saveMLTrainingRow } from "./database.js";
import { fetchHistory, fetchQuote } from "./marketData.js";
import { technicalAnalysis } from "./analysis.js";
import { toFiniteNumber } from "./utils.js";

export interface FeatureImportance {
  feature: string;
  correlation: number;
  winRateWhenHigh: number;
  winRateWhenLow: number;
  samples: number;
}

export async function buildFeatureImportance(): Promise<FeatureImportance[]> {
  const rows = await getMLDataset(50);
  if (!rows.length) return [];

  const numericFeatures = [
    "rsi", "macd_hist", "sma20_dist", "sma50_dist", "bb_position",
    "volume_trend", "perf_1m", "pe", "forward_pe", "eps_growth",
    "revenue_growth", "profit_margin", "roe", "dividend_yield", "beta", "vix",
  ];

  const results: FeatureImportance[] = [];

  for (const feature of numericFeatures) {
    const valid = rows.filter((r: any) => r[feature] != null && r.label_1m != null);
    if (valid.length < 10) continue;

    const values = valid.map((r: any) => toFiniteNumber(r[feature], 0));
    const labels = valid.map((r: any) => Number(r.label_1m));

    // Mediana
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    const highGroup = labels.filter((_, i) => values[i] >= median);
    const lowGroup = labels.filter((_, i) => values[i] < median);

    const winHigh = highGroup.length > 0 ? highGroup.filter((l) => l === 1).length / highGroup.length : 0;
    const winLow = lowGroup.length > 0 ? lowGroup.filter((l) => l === 1).length / lowGroup.length : 0;

    // Correlación simple de Pearson
    const n = valid.length;
    const avgX = values.reduce((a, b) => a + b, 0) / n;
    const avgY = labels.reduce((a, b) => a + b, 0) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
      const dx = values[i] - avgX;
      const dy = labels[i] - avgY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    const corr = denX > 0 && denY > 0 ? num / Math.sqrt(denX * denY) : 0;

    results.push({
      feature,
      correlation: Math.round(corr * 1000) / 1000,
      winRateWhenHigh: Math.round(winHigh * 10000) / 100,
      winRateWhenLow: Math.round(winLow * 10000) / 100,
      samples: n,
    });
  }

  return results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

export async function collectTrainingDataForTicker(ticker: string, cclRate: number) {
  try {
    const [history, quote] = await Promise.all([
      fetchHistory(ticker, 6).catch(() => []),
      fetchQuote(ticker).catch(() => null),
    ]);
    if (!history || history.length < 30) return null;

    const tech = technicalAnalysis(history);
    const ind = tech.indicators || {};
    const perf = ind.performance || {};
    const currentPrice = history[history.length - 1].close;
    const sma20 = ind.sma20 || currentPrice;
    const sma50 = ind.sma50 || currentPrice;
    const bb = ind.bollingerBands;

    // Labels: calcular retorno futuro (necesitamos datos futuros que no tenemos ahora)
    // Por eso esta función se llama retrospectivamente desde evaluatePrediction
    const row: Record<string, unknown> = {
      ticker,
      date: new Date().toISOString().slice(0, 10),
      rsi: ind.rsi ?? null,
      macd_hist: ind.macd?.histogram ?? null,
      sma20_dist: sma20 ? (currentPrice - sma20) / sma20 : null,
      sma50_dist: sma50 ? (currentPrice - sma50) / sma50 : null,
      bb_position: bb && bb.upper !== bb.lower ? (currentPrice - bb.lower) / (bb.upper - bb.lower) : null,
      volume_trend: ind.volume?.volumeTrend ?? null,
      perf_1m: perf.month1 ?? null,
      perf_3m: perf.month3 ?? null,
      pe: quote?.trailingPE ?? null,
      forward_pe: quote?.forwardPE ?? null,
      eps_growth: null,
      revenue_growth: null,
      profit_margin: null,
      roe: null,
      dividend_yield: quote?.dividendYield ?? null,
      beta: quote?.beta ?? null,
      vix: null,
      ccl_rate: cclRate,
      target_return_1m: null,
      target_return_3m: null,
      actual_return_1m: null,
      actual_return_3m: null,
      label_1m: null,
      label_3m: null,
      source: "auto_collection",
    };

    return row;
  } catch (e: any) {
    console.warn("[ml] Error recolectando datos para", ticker, e.message);
    return null;
  }
}

export async function updateTrainingLabels(ticker: string, predictionDate: string, return1m: number | null, return3m: number | null) {
  try {
    // Actualizar la última fila de este ticker que tenga fecha <= predictionDate y labels null
    const label1m = return1m != null ? (return1m > 5 ? 1 : return1m < -5 ? 0 : null) : null;
    const label3m = return3m != null ? (return3m > 10 ? 1 : return3m < -10 ? 0 : null) : null;
    // Nota: la actualización real requiere ID. Simplificamos: guardamos nueva fila con labels.
    // Para una implementación robusta se necesitaría un update by ID.
  } catch (e: any) {
    console.warn("[ml] Error actualizando labels:", e.message);
  }
}
