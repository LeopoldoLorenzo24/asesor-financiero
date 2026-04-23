// ============================================================
// UNIT / INTEGRATION TESTS: New functions
//
// Cubre:
//   1. detectMacroClaims — umbrales y contexto de corto plazo
//   2. normalizeFinnhubQuote — mapeo del schema Finnhub → unificado
//   3. Stop-loss formula — cálculo de changePct y condición de disparo
//   4. checkAndIncrementRateLimit — contadores, bloqueo, IPs independientes
//   5. calcRelativeStrength — RS ratio vs SPY para distintos escenarios
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import { detectMacroClaims } from "../aiAdvisor.js";
import { normalizeFinnhubQuote } from "../marketFinnhub.js";
import { calcRelativeStrength } from "../analysis.js";
import { initDb, checkAndIncrementRateLimit } from "../database.js";

// IPs únicas por ejecución para que tests repetidos no acumulen contadores
const RUN_ID = Date.now();
const RL_IP = (n) => `::test::rl::${RUN_ID}::${n}`;

// Inicializa la DB una sola vez (idempotente) antes de los tests de rate limit
let dbInitPromise = null;
async function ensureDb() {
  if (!dbInitPromise) dbInitPromise = initDb();
  return dbInitPromise;
}

// ============================================================
// BLOQUE 1 — detectMacroClaims
// ============================================================

test("detectMacroClaims: ≥100% siempre se flaggea", () => {
  const w = detectMacroClaims("El índice subió 120% en los últimos meses.");
  assert.ok(w.length > 0, "120% debe generar advertencia");
  assert.ok(w[0].includes("120%"), "la advertencia debe mencionar el valor");
});

test("detectMacroClaims: 80–99% se flaggea como inusual", () => {
  const w = detectMacroClaims("NVDA subió 85% este año.");
  assert.ok(w.length > 0, "85% debe generar advertencia");
  assert.ok(w[0].includes("85%"));
});

test("detectMacroClaims: 50–79% SIN contexto de corto plazo NO se flaggea", () => {
  const w = detectMacroClaims("El activo rindió 65% acumulado en los últimos 3 años.");
  assert.equal(w.length, 0, "65% sin contexto corto plazo no debe advertir");
});

test("detectMacroClaims: 50–79% CON contexto de corto plazo sí se flaggea", () => {
  const w = detectMacroClaims("Hoy el mercado subió 60% en la sesión.");
  assert.ok(w.length > 0, "'hoy' + 'sesión' deben disparar la advertencia");
});

test("detectMacroClaims: valores <50% no se flaggean", () => {
  const w = detectMacroClaims("El portfolio rindió 32% anual. La tasa bajó 5%.");
  assert.equal(w.length, 0, "32% y 5% son normales, sin advertencias");
});

test("detectMacroClaims: trillones fuera de escala (>500T) se detectan", () => {
  const w = detectMacroClaims("La empresa tiene deuda de 600 trillion dollars.");
  assert.ok(w.length > 0, "600 trillion debe generar advertencia de escala");
});

test("detectMacroClaims: trillones razonables (≤500T) no se flaggean", () => {
  const w = detectMacroClaims("El GDP mundial es de 100 trillion dollars.");
  assert.equal(w.length, 0, "100 trillion es plausible, no debe flaggearse");
});

test("detectMacroClaims: texto vacío o nulo devuelve array vacío", () => {
  assert.deepEqual(detectMacroClaims(""), []);
  assert.deepEqual(detectMacroClaims(null), []);
  assert.deepEqual(detectMacroClaims(undefined), []);
});

// ============================================================
// BLOQUE 2 — normalizeFinnhubQuote (schema puro, sin fetch)
// ============================================================

const MOCK_FINNHUB_RESPONSE = {
  c: 182.34,
  pc: 180.10,
  d: 2.24,
  dp: 1.24,
  h: 183.50,
  l: 179.80,
  "52WeekHigh": 220.00,
  "52WeekLow": 140.00,
};

test("normalizeFinnhubQuote: precio viene del campo 'c'", () => {
  const r = normalizeFinnhubQuote("AAPL", MOCK_FINNHUB_RESPONSE);
  assert.equal(r.price, 182.34);
});

test("normalizeFinnhubQuote: ticker se pasa correctamente", () => {
  const r = normalizeFinnhubQuote("NVDA", MOCK_FINNHUB_RESPONSE);
  assert.equal(r.ticker, "NVDA");
});

test("normalizeFinnhubQuote: campos OHLC mapeados al schema unificado", () => {
  const r = normalizeFinnhubQuote("MSFT", MOCK_FINNHUB_RESPONSE);
  assert.equal(r.previousClose, 180.10, "previousClose ← pc");
  assert.equal(r.change, 2.24,         "change ← d");
  assert.equal(r.changePercent, 1.24,  "changePercent ← dp");
  assert.equal(r.dayHigh, 183.50,      "dayHigh ← h");
  assert.equal(r.dayLow, 179.80,       "dayLow ← l");
});

test("normalizeFinnhubQuote: source es siempre 'finnhub'", () => {
  const r = normalizeFinnhubQuote("SPY", MOCK_FINNHUB_RESPONSE);
  assert.equal(r.source, "finnhub");
});

test("normalizeFinnhubQuote: campos no disponibles en /quote básico son null", () => {
  const r = normalizeFinnhubQuote("AAPL", MOCK_FINNHUB_RESPONSE);
  assert.equal(r.volume,     null, "volume no disponible");
  assert.equal(r.marketCap,  null, "marketCap no disponible");
  assert.equal(r.trailingPE, null, "trailingPE no disponible");
  assert.equal(r.forwardPE,  null, "forwardPE no disponible");
  assert.equal(r.beta,       null, "beta no disponible");
});

test("normalizeFinnhubQuote: dividendYield es 0 (no lo devuelve /quote)", () => {
  const r = normalizeFinnhubQuote("AAPL", MOCK_FINNHUB_RESPONSE);
  assert.equal(r.dividendYield, 0);
});

test("normalizeFinnhubQuote: campos opcionales usan null cuando faltan en el response", () => {
  const minimal = { c: 50, pc: 48 }; // solo los mínimos
  const r = normalizeFinnhubQuote("X", minimal);
  assert.equal(r.price, 50);
  assert.equal(r.previousClose, 48);
  assert.equal(r.change, null,         "d ausente → null");
  assert.equal(r.changePercent, null,  "dp ausente → null");
  assert.equal(r.dayHigh, null,        "h ausente → null");
  assert.equal(r.dayLow, null,         "l ausente → null");
});

// ============================================================
// BLOQUE 3 — Stop-loss formula (lógica pura, sin imports)
// ============================================================
//
// Lógica en runStopLossCheck (index.js):
//   changePct = ((currentPrice - entryPrice) / entryPrice) * 100
//   triggered = changePct <= pick.stop_loss_pct

function calcChangePct(currentPrice, entryPrice) {
  return ((currentPrice - entryPrice) / entryPrice) * 100;
}

test("stop-loss formula: caída de $100 a $92 = –8%", () => {
  const pct = calcChangePct(92, 100);
  assert.equal(Math.round(pct * 100) / 100, -8);
});

test("stop-loss: se activa cuando changePct <= stop_loss_pct", () => {
  // Precio entró a $100, stop en -8%, precio cayó a $91.50 (–8.5%)
  const pick = { stop_loss_pct: -8, price_usd_at_prediction: 100 };
  const pct = calcChangePct(91.5, pick.price_usd_at_prediction);
  assert.ok(pct <= pick.stop_loss_pct, `${pct.toFixed(2)}% debe activar stop de ${pick.stop_loss_pct}%`);
});

test("stop-loss: NO se activa cuando el precio está por encima del stop", () => {
  const pick = { stop_loss_pct: -8, price_usd_at_prediction: 100 };
  const pct = calcChangePct(95, pick.price_usd_at_prediction); // –5%
  assert.ok(pct > pick.stop_loss_pct, `${pct.toFixed(2)}% no debe activar stop de ${pick.stop_loss_pct}%`);
});

test("stop-loss: precio exactamente en el stop sí activa", () => {
  const pick = { stop_loss_pct: -10, price_usd_at_prediction: 200 };
  const pct = calcChangePct(180, pick.price_usd_at_prediction); // –10% exacto
  assert.ok(pct <= pick.stop_loss_pct, `–10% exacto debe activar stop de –10%`);
});

// ============================================================
// BLOQUE 4 — checkAndIncrementRateLimit (integración SQLite)
// ============================================================

test("checkAndIncrementRateLimit: primer request es permitido con count=1", async () => {
  await ensureDb();
  const r = await checkAndIncrementRateLimit(RL_IP(1), 5, 60_000);
  assert.equal(r.allowed, true,  "primer request debe ser permitido");
  assert.equal(r.count, 1,       "count debe arrancar en 1");
  assert.ok(typeof r.resetAt === "number", "resetAt debe ser timestamp numérico");
  assert.ok(r.resetAt > Date.now(),        "resetAt debe ser en el futuro");
});

test("checkAndIncrementRateLimit: count se incrementa en requests consecutivos", async () => {
  await ensureDb();
  const ip = RL_IP(2);
  await checkAndIncrementRateLimit(ip, 10, 60_000);
  await checkAndIncrementRateLimit(ip, 10, 60_000);
  const r = await checkAndIncrementRateLimit(ip, 10, 60_000);
  assert.equal(r.count, 3, "tercer request → count=3");
  assert.equal(r.allowed, true, "aún dentro del límite");
});

test("checkAndIncrementRateLimit: bloquea cuando supera el límite", async () => {
  await ensureDb();
  const ip = RL_IP(3);
  const max = 3;
  for (let i = 0; i < max; i++) {
    await checkAndIncrementRateLimit(ip, max, 60_000);
  }
  const blocked = await checkAndIncrementRateLimit(ip, max, 60_000);
  assert.equal(blocked.allowed, false, "cuarto request debe ser bloqueado");
  assert.equal(blocked.count, max + 1, "count refleja el request extra");
});

test("checkAndIncrementRateLimit: IPs distintas tienen contadores independientes", async () => {
  await ensureDb();
  const ipA = RL_IP("4a");
  const ipB = RL_IP("4b");
  // Saturar ipA
  for (let i = 0; i < 5; i++) {
    await checkAndIncrementRateLimit(ipA, 5, 60_000);
  }
  // ipB debe tener count=1 propio
  const r = await checkAndIncrementRateLimit(ipB, 5, 60_000);
  assert.equal(r.count, 1,    "ipB no debe verse afectada por ipA");
  assert.equal(r.allowed, true);
});

// ============================================================
// BLOQUE 5 — calcRelativeStrength
// ============================================================

test("calcRelativeStrength: ticker idéntico a SPY retorna ratio ~1.0", () => {
  const perf = { month1: 5, month3: 12, month6: 20 };
  const ratio = calcRelativeStrength(perf, perf);
  assert.ok(ratio != null, "no debe retornar null con datos completos");
  assert.ok(Math.abs(ratio - 1.0) < 0.001, `ratio debe ser ~1.0 cuando ticker = SPY, got ${ratio}`);
});

test("calcRelativeStrength: ticker que duplica el retorno de SPY retorna ratio >1", () => {
  const spyPerf   = { month1: 5,  month3: 10, month6: 15 };
  const tickerPerf = { month1: 10, month3: 20, month6: 30 };
  const ratio = calcRelativeStrength(tickerPerf, spyPerf);
  assert.ok(ratio > 1.0, `ticker que supera a SPY debe tener ratio >1, got ${ratio}`);
});

test("calcRelativeStrength: ticker con retornos negativos mientras SPY sube retorna ratio <1", () => {
  const spyPerf    = { month1: 5,  month3: 10, month6: 15 };
  const tickerPerf = { month1: -5, month3: -8, month6: -10 };
  const ratio = calcRelativeStrength(tickerPerf, spyPerf);
  assert.ok(ratio < 1.0, `ticker que pierde contra SPY debe tener ratio <1, got ${ratio}`);
});

test("calcRelativeStrength: datos insuficientes (null) retorna null", () => {
  assert.equal(calcRelativeStrength(null, null), null, "null inputs deben retornar null");
  assert.equal(calcRelativeStrength({ month3: 10 }, null), null, "SPY null debe retornar null");
});

test("calcRelativeStrength: periods faltantes se ignoran pero no rompen el cálculo", () => {
  // Solo tiene month3, sin month1 ni month6
  const tickerPerf = { month3: 15 };
  const spyPerf    = { month3: 10 };
  const ratio = calcRelativeStrength(tickerPerf, spyPerf);
  assert.ok(ratio != null, "no debe romper con periods parciales");
  assert.ok(ratio > 1.0, "con 1 period donde ticker > SPY, ratio debe ser >1");
});
