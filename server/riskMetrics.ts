// ============================================================
// RISK METRICS
// Sharpe Ratio, Max Drawdown, Beta, VaR
// ============================================================

import { toFiniteNumber } from "./utils.js";

export interface RiskMetrics {
  maxDrawdownPct: number | null;
  maxDrawdownAmount: number | null;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  beta: number | null;
  alpha: number | null;
  var95: number | null; // Value at Risk 95%
  volatilityAnnualized: number | null;
  avgReturn: number | null;
  positiveMonths: number;
  negativeMonths: number;
}

export function calcMaxDrawdown(values: number[]): { pct: number; amount: number; peak: number; trough: number } | null {
  if (!values || values.length < 2) return null;
  let peak = values[0];
  let maxDD = 0;
  let peakAt = values[0];
  let troughAt = values[0];

  for (const v of values) {
    if (v > peak) peak = v;
    const dd = (peak - v) / peak;
    if (dd > maxDD) {
      maxDD = dd;
      peakAt = peak;
      troughAt = v;
    }
  }
  return { pct: Math.round(maxDD * 10000) / 100, amount: Math.round(peakAt - troughAt), peak: peakAt, trough: troughAt };
}

function calcReturns(values: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] !== 0) {
      r.push((values[i] - values[i - 1]) / values[i - 1]);
    }
  }
  return r;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / (arr.length - 1));
}

export function calcSharpeRatio(returns: number[], riskFreeRateAnnual = 0.45): number | null {
  if (!returns || returns.length < 2) return null;
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const vol = stdDev(returns);
  if (vol === 0) return null;
  // Anualizar (asumiendo datos mensuales: sqrt(12))
  const annualizedReturn = avgReturn * 12;
  const annualizedVol = vol * Math.sqrt(12);
  return Math.round(((annualizedReturn - riskFreeRateAnnual) / annualizedVol) * 100) / 100;
}

export function calcSortinoRatio(returns: number[], riskFreeRateAnnual = 0.45): number | null {
  if (!returns || returns.length < 2) return null;
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const downside = returns.filter((r) => r < 0);
  const downsideDev = downside.length > 1 ? stdDev(downside) : 0;
  if (downsideDev === 0) return avgReturn > 0 ? Infinity : null;
  const annualizedReturn = avgReturn * 12;
  const annualizedDownside = downsideDev * Math.sqrt(12);
  return Math.round(((annualizedReturn - riskFreeRateAnnual) / annualizedDownside) * 100) / 100;
}

export function calcVaR95(returns: number[]): number | null {
  if (!returns || returns.length < 5) return null;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.05);
  return Math.round(sorted[idx] * 10000) / 100;
}

export function calcBeta(portfolioReturns: number[], benchmarkReturns: number[]): number | null {
  if (!portfolioReturns || !benchmarkReturns || portfolioReturns.length < 2 || portfolioReturns.length !== benchmarkReturns.length) return null;
  const n = portfolioReturns.length;
  const avgP = portfolioReturns.reduce((a, b) => a + b, 0) / n;
  const avgB = benchmarkReturns.reduce((a, b) => a + b, 0) / n;

  let covariance = 0;
  let varianceB = 0;
  for (let i = 0; i < n; i++) {
    const diffP = portfolioReturns[i] - avgP;
    const diffB = benchmarkReturns[i] - avgB;
    covariance += diffP * diffB;
    varianceB += diffB * diffB;
  }
  covariance /= (n - 1);
  varianceB /= (n - 1);

  if (varianceB === 0) return null;
  return Math.round((covariance / varianceB) * 100) / 100;
}

export async function calculatePortfolioRiskMetrics(capitalHistory: { total_value_ars?: number; date?: string }[], spyHistory?: { date: string; close: number }[] | null): Promise<RiskMetrics> {
  const values = capitalHistory.map((h) => toFiniteNumber(h.total_value_ars, 0)).filter((v) => v > 0);
  if (values.length < 2) {
    return { maxDrawdownPct: null, maxDrawdownAmount: null, sharpeRatio: null, sortinoRatio: null, beta: null, alpha: null, var95: null, volatilityAnnualized: null, avgReturn: null, positiveMonths: 0, negativeMonths: 0 };
  }

  const dd = calcMaxDrawdown(values);
  const returns = calcReturns(values);
  const sharpe = calcSharpeRatio(returns);
  const sortino = calcSortinoRatio(returns);
  const var95 = calcVaR95(returns);
  const vol = stdDev(returns) * Math.sqrt(12);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

  let beta: number | null = null;
  let alpha: number | null = null;
  if (spyHistory && spyHistory.length > 0) {
    const spyMap = new Map(spyHistory.map((h) => [h.date, h.close]));
    const spyReturns: number[] = [];
    const portReturns: number[] = [];
    for (let i = 1; i < capitalHistory.length; i++) {
      const d = capitalHistory[i].date?.slice(0, 10);
      const prevD = capitalHistory[i - 1].date?.slice(0, 10);
      if (!d || !prevD) continue;
      const spyNow = spyMap.get(d);
      const spyPrev = spyMap.get(prevD);
      if (spyNow && spyPrev && spyPrev > 0) {
        spyReturns.push((spyNow - spyPrev) / spyPrev);
        portReturns.push(returns[i - 1]);
      }
    }
    if (spyReturns.length > 1) {
      beta = calcBeta(portReturns, spyReturns);
      const avgPort = portReturns.reduce((a, b) => a + b, 0) / portReturns.length;
      const avgSpy = spyReturns.reduce((a, b) => a + b, 0) / spyReturns.length;
      alpha = beta != null ? Math.round((avgPort - beta * avgSpy) * 10000) / 100 : null;
    }
  }

  const pos = returns.filter((r) => r > 0).length;
  const neg = returns.filter((r) => r < 0).length;

  return {
    maxDrawdownPct: dd?.pct ?? null,
    maxDrawdownAmount: dd?.amount ?? null,
    sharpeRatio: sharpe,
    sortinoRatio: sortino,
    beta,
    alpha,
    var95,
    volatilityAnnualized: vol ? Math.round(vol * 10000) / 100 : null,
    avgReturn: avgReturn ? Math.round(avgReturn * 10000) / 100 : null,
    positiveMonths: pos,
    negativeMonths: neg,
  };
}
