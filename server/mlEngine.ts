// ============================================================
// ML ENGINE — Módulo básico de machine learning
// Regresión logística simple + recolector de datos
// ============================================================

import { getMLDataset, saveMLTrainingRow } from "./database.js";
import { buildFeatureImportance, collectTrainingDataForTicker } from "./featureImportance.js";
import { toFiniteNumber } from "./utils.js";

interface MLModel {
  weights: Record<string, number>;
  bias: number;
  features: string[];
  accuracy: number;
  trainedAt: string;
}

let cachedModel: MLModel | null = null;

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function logisticRegressionTrain(X: number[][], y: number[], epochs = 500, lr = 0.01): { weights: number[]; bias: number; accuracy: number } {
  const nFeatures = X[0].length;
  const nSamples = X.length;
  let weights = new Array(nFeatures).fill(0);
  let bias = 0;

  for (let e = 0; e < epochs; e++) {
    let dw = new Array(nFeatures).fill(0);
    let db = 0;
    for (let i = 0; i < nSamples; i++) {
      const z = X[i].reduce((sum, xi, j) => sum + xi * weights[j], 0) + bias;
      const pred = sigmoid(z);
      const error = pred - y[i];
      for (let j = 0; j < nFeatures; j++) dw[j] += error * X[i][j];
      db += error;
    }
    for (let j = 0; j < nFeatures; j++) weights[j] -= (lr / nSamples) * dw[j];
    bias -= (lr / nSamples) * db;
  }

  // Accuracy
  let correct = 0;
  for (let i = 0; i < nSamples; i++) {
    const z = X[i].reduce((sum, xi, j) => sum + xi * weights[j], 0) + bias;
    const pred = sigmoid(z) >= 0.5 ? 1 : 0;
    if (pred === y[i]) correct++;
  }
  const accuracy = correct / nSamples;

  return { weights, bias, accuracy };
}

export async function trainModel(): Promise<MLModel | null> {
  const rows = await getMLDataset(100);
  if (rows.length < 50) {
    console.log("[ml] Datos insuficientes para entrenar:", rows.length);
    return null;
  }

  const features = [
    "rsi", "macd_hist", "sma20_dist", "sma50_dist", "bb_position",
    "volume_trend", "perf_1m", "pe", "forward_pe", "eps_growth",
    "revenue_growth", "profit_margin", "roe", "dividend_yield", "beta", "vix",
  ];

  const X: number[][] = [];
  const y: number[] = [];

  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const label = toFiniteNumber(r.label_1m, -1);
    if (label !== 0 && label !== 1) continue;

    const vec = features.map((f) => {
      const v = toFiniteNumber(r[f], 0);
      // Normalizar aproximadamente
      if (f === "rsi") return (v - 50) / 50;
      if (f === "macd_hist") return Math.max(-1, Math.min(1, v / 5));
      if (f.includes("dist") || f === "bb_position") return Math.max(-1, Math.min(1, v));
      if (f === "volume_trend") return Math.max(-1, Math.min(1, v / 50));
      if (f === "perf_1m") return Math.max(-1, Math.min(1, v / 30));
      if (f === "pe" || f === "forward_pe") return Math.max(-1, Math.min(1, (v - 20) / 40));
      if (f.includes("growth") || f === "profit_margin" || f === "roe") return Math.max(-1, Math.min(1, v / 50));
      if (f === "dividend_yield") return Math.max(-1, Math.min(1, v / 5));
      if (f === "beta") return Math.max(-1, Math.min(1, (v - 1) / 2));
      if (f === "vix") return Math.max(-1, Math.min(1, (v - 20) / 30));
      return 0;
    });

    X.push(vec);
    y.push(label);
  }

  if (X.length < 30) {
    console.log("[ml] Muestras válidas insuficientes:", X.length);
    return null;
  }

  const result = logisticRegressionTrain(X, y, 300, 0.05);
  const model: MLModel = {
    weights: Object.fromEntries(features.map((f, i) => [f, Math.round(result.weights[i] * 10000) / 10000])),
    bias: Math.round(result.bias * 10000) / 10000,
    features,
    accuracy: Math.round(result.accuracy * 10000) / 100,
    trainedAt: new Date().toISOString(),
  };

  cachedModel = model;
  console.log(`[ml] Modelo entrenado: accuracy=${model.accuracy}%, n=${X.length}`);
  return model;
}

export async function predictProbability(features: Record<string, number>): Promise<number | null> {
  if (!cachedModel) {
    const model = await trainModel();
    if (!model) return null;
  }
  const m = cachedModel!;
  let z = m.bias;
  for (const [f, w] of Object.entries(m.weights)) {
    z += w * (toFiniteNumber(features[f], 0));
  }
  return Math.round(sigmoid(z) * 10000) / 10000;
}

export function getCachedModel(): MLModel | null {
  return cachedModel;
}

export async function runMLPipeline(tickers: string[], cclRate: number) {
  const collected: any[] = [];
  for (const t of tickers) {
    const row = await collectTrainingDataForTicker(t, cclRate);
    if (row) {
      await saveMLTrainingRow(row);
      collected.push({ ticker: t, date: row.date });
    }
  }
  const model = await trainModel();
  const importance = await buildFeatureImportance();
  return { collected: collected.length, model, topFeatures: importance.slice(0, 5) };
}
