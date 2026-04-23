/** @format */
// ============================================================
// SHARED UTILITIES — pricing, formatting, math helpers
// Eliminates duplication across the codebase
// ============================================================

export function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function safeJsonParse<T = unknown>(value: unknown, fallback: T | null = null): T | null {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function roundMoney(value: unknown): number {
  return Math.round(toFiniteNumber(value, 0));
}

export function clampPct(value: unknown): number {
  const n = toFiniteNumber(value, 0);
  return Math.max(0, Math.min(100, n));
}

export function calcPriceARS(usdPrice: unknown, cclVenta: unknown, ratio: unknown): number | null {
  const p = toFiniteNumber(usdPrice, 0);
  const c = toFiniteNumber(cclVenta, 0);
  const r = toFiniteNumber(ratio, 0);
  if (p <= 0 || c <= 0 || r <= 0) return null;
  return Math.round((p * c) / r);
}

export interface RankingItem {
  cedear?: { ratio?: number } | null;
  ratio?: number;
  priceARS?: number;
  quote?: { price?: number } | null;
  price?: number;
  [key: string]: unknown;
}

export interface CclData {
  venta?: number;
  [key: string]: unknown;
}

export function getPriceArsFromRankingItem(item: RankingItem | null | undefined, ccl: CclData | null | undefined): number | null {
  if (!item) return null;
  const ratio = toFiniteNumber(item?.cedear?.ratio ?? item?.ratio, 0);
  const direct = toFiniteNumber(item?.priceARS, 0);
  if (direct > 0) return roundMoney(direct);
  const quotePrice = toFiniteNumber(item?.quote?.price ?? item?.price, 0);
  const cclVenta = toFiniteNumber(ccl?.venta, 0);
  return calcPriceARS(quotePrice, cclVenta, ratio);
}

export function getFundData(fundamentals: unknown): Record<string, unknown> {
  if (!fundamentals || typeof fundamentals !== "object") return {};
  const data = (fundamentals as Record<string, unknown>).data;
  return (data && typeof data === "object" ? data : fundamentals) as Record<string, unknown>;
}

export function isSellAction(action: unknown): boolean {
  const a = String(action || "").toUpperCase();
  return a === "VENDER" || a === "VENDER TODO" || a === "REDUCIR";
}

export function fmtPct(value: unknown, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  const sign = (value as number) >= 0 ? "+" : "";
  return `${sign}${(value as number).toFixed(decimals)}%`;
}

export function fmtCurrency(value: unknown, currency = "$"): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${currency}${Math.round(value as number).toLocaleString("es-AR")}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function weightedAverage(values: number[] | null | undefined, weights: number[] | null | undefined): number | null {
  if (!values?.length || !weights?.length || values.length !== weights.length) return null;
  let sum = 0;
  let weightSum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = toFiniteNumber(values[i], 0);
    const w = toFiniteNumber(weights[i], 0);
    sum += v * w;
    weightSum += w;
  }
  return weightSum > 0 ? sum / weightSum : null;
}

export function normalizeToRating(values: (number | null | undefined)[]): Map<number | null | undefined, number | null> {
  const valid = values.filter((v): v is number => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  const map = new Map<number | null | undefined, number | null>();
  if (valid.length === 0) return map;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) {
      map.set(v, null);
      continue;
    }
    const rank = valid.indexOf(v);
    const rating = Math.round(1 + (rank / Math.max(valid.length - 1, 1)) * 98);
    map.set(v, rating);
  }
  return map;
}

export function sanitizePromptString(str: unknown, maxLength = 500): string {
  if (typeof str !== "string") return "";
  let cleaned = str
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/`/g, "'")
    .replace(/\{/g, "[").replace(/\}/g, "]");
  if (cleaned.length > maxLength) cleaned = cleaned.slice(0, maxLength) + "…";
  return cleaned;
}
