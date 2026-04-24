// ============================================================
// CORPORATE ACTIONS TRACKER
// Tracks dividends, splits, and ratio changes for CEDEARs
// Uses Yahoo Finance quoteSummary data
// ============================================================

import { fetchQuote, fetchHistory } from "./marketData.js";
import { saveCorporateAction, getCorporateActions, getPendingDividendsForPortfolio } from "./database.js";
import CEDEARS from "./cedears.js";
import { toFiniteNumber } from "./utils.js";

export interface DividendInfo {
  ticker: string;
  dividendYield: number;      // Yield anual (ej: 0.015 = 1.5%)
  dividendRate: number;       // Dividendo por acción en USD
  exDate: string | null;
  paymentDate: string | null;
  source: string;
}

/**
 * Obtiene información de dividendos desde Yahoo Finance quote.
 * Nota: Yahoo devuelve dividendYield como número (ej: 0.0153 = 1.53%).
 */
export async function fetchDividendInfo(ticker: string): Promise<DividendInfo | null> {
  try {
    const quote = await fetchQuote(ticker);
    if (!quote || quote.dividendYield == null) return null;
    return {
      ticker,
      dividendYield: quote.dividendYield,
      dividendRate: toFiniteNumber((quote as any).dividendRate, 0),
      exDate: (quote as any).exDividendDate || null,
      paymentDate: (quote as any).dividendDate || null,
      source: "yahoo",
    };
  } catch (err: any) {
    console.warn(`[corporateActions] Error fetching dividend for ${ticker}:`, err.message);
    return null;
  }
}

/**
 * Calcula el dividendo estimado en ARS para una posición de CEDEAR.
 * Considera:
 * - Ratio de conversión
 * - Retención aproximada (~15% por tratado USA-Argentina, varía)
 * - Tipo de cambio CCL
 */
export function estimateCedearDividendArs(
  shares: number,
  dividendRateUsd: number,
  cclRate: number,
  ratio: number,
  withholdingPct = 0.15
): number {
  if (shares <= 0 || dividendRateUsd <= 0 || cclRate <= 0 || ratio <= 0) return 0;
  // Un CEDEAR representa 1/ratio acciones subyacentes
  const underlyingShares = shares / ratio;
  const grossDividendUsd = underlyingShares * dividendRateUsd;
  const netDividendUsd = grossDividendUsd * (1 - withholdingPct);
  return Math.round(netDividendUsd * cclRate * 100) / 100;
}

/**
 * Scanea dividendos para todos los CEDEARs y guarda nuevos en DB.
 * Corre periódicamente (ej: semanal).
 */
export async function scanCorporateActions() {
  const results = { dividends: 0, splits: 0, errors: 0 };
  const tickers = CEDEARS.map((c) => c.ticker);

  for (const ticker of tickers) {
    try {
      const divInfo = await fetchDividendInfo(ticker);
      if (divInfo && divInfo.dividendYield > 0) {
        // Verificar si ya existe un registro reciente
        const existing = await getCorporateActions(ticker, 5);
        const alreadyTracked = existing.some(
          (a: any) => a.type === "DIVIDEND" && a.amount === divInfo.dividendRate
        );
        if (!alreadyTracked && divInfo.dividendRate > 0) {
          await saveCorporateAction({
            ticker,
            actionDate: divInfo.exDate || new Date().toISOString().slice(0, 10),
            type: "DIVIDEND",
            amount: divInfo.dividendRate,
            description: `Dividendo ${ticker}: $${divInfo.dividendRate} USD/share (yield ${(divInfo.dividendYield * 100).toFixed(2)}%)`,
            source: "yahoo",
          });
          results.dividends++;
        }
      }
    } catch (err: any) {
      results.errors++;
      console.warn(`[corporateActions] Error scanning ${ticker}:`, err.message);
    }
  }

  console.log(`[corporateActions] Scan complete: ${results.dividends} dividends, ${results.splits} splits, ${results.errors} errors`);
  return results;
}

/**
 * Aplica dividendos acumulados al valor de un portfolio virtual.
 * Retorna el valor total de dividendos acumulados estimados.
 */
export async function calculateVirtualDividends(
  virtualPositions: { ticker: string; shares: number }[],
  cclRate: number
): Promise<{ totalArs: number; byTicker: Record<string, number> }> {
  const byTicker: Record<string, number> = {};
  let totalArs = 0;

  const tickers = virtualPositions.map((p) => p.ticker);
  const actions = await getPendingDividendsForPortfolio(tickers);

  for (const pos of virtualPositions) {
    const cedearDef = CEDEARS.find((c) => c.ticker === pos.ticker);
    if (!cedearDef) continue;

    const tickerDividends = actions.filter((a: any) => a.ticker === pos.ticker);
    for (const div of tickerDividends) {
      const divArs = estimateCedearDividendArs(
        pos.shares,
        toFiniteNumber(div.amount, 0),
        cclRate,
        cedearDef.ratio
      );
      byTicker[pos.ticker] = (byTicker[pos.ticker] || 0) + divArs;
      totalArs += divArs;
    }
  }

  return { totalArs: Math.round(totalArs * 100) / 100, byTicker };
}
