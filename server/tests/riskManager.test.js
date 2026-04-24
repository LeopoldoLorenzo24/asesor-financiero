import test from "node:test";
import assert from "node:assert/strict";
import { checkTradeRisk, checkPortfolioDrawdown, sanitizePicksWithRiskLimits } from "../riskManager.js";
import { RISK_CONFIG } from "../config.js";

// ============================================================
// checkTradeRisk
// ============================================================

test("checkTradeRisk permite trade dentro de límites", () => {
  const result = checkTradeRisk({
    profileId: "moderate",
    portfolioValueArs: 1_000_000,
    tickerValueArs: 100_000,
    sectorValueArs: 200_000,
    tradeAmountArs: 50_000,
    sector: "Technology",
  });
  assert.equal(result.allowed, true);
  assert.equal(result.warnings.length, 0);
});

test("checkTradeRisk bloquea concentración excesiva en ticker", () => {
  const result = checkTradeRisk({
    profileId: "moderate",
    portfolioValueArs: 1_000_000,
    tickerValueArs: 300_000,
    sectorValueArs: 200_000,
    tradeAmountArs: 100_000,
    sector: "Technology",
  });
  assert.equal(result.allowed, false);
  assert.ok(result.warnings.some((w) => w.includes("Concentración en ticker")));
  assert.ok(result.tickerPct > RISK_CONFIG.maxPositionPct.moderate);
});

test("checkTradeRisk bloquea concentración sectorial excesiva", () => {
  const result = checkTradeRisk({
    profileId: "moderate",
    portfolioValueArs: 1_000_000,
    tickerValueArs: 50_000,
    sectorValueArs: 400_000,
    tradeAmountArs: 150_000,
    sector: "Technology",
  });
  assert.equal(result.allowed, false);
  assert.ok(result.warnings.some((w) => w.includes("Concentración sectorial")));
  assert.ok(result.sectorPct > RISK_CONFIG.maxSectorConcentrationPct.moderate);
});

test("checkTradeRisk usa perfil moderate por defecto", () => {
  const result = checkTradeRisk({
    portfolioValueArs: 1_000_000,
    tickerValueArs: 300_000,
    sectorValueArs: 200_000,
    tradeAmountArs: 100_000,
    sector: "Technology",
  });
  assert.equal(result.allowed, false);
});

test("checkTradeRisk permite todo si portfolioValueArs <= 0", () => {
  const result = checkTradeRisk({
    portfolioValueArs: 0,
    tickerValueArs: 0,
    sectorValueArs: 0,
    tradeAmountArs: 100_000,
    sector: "Technology",
  });
  assert.equal(result.allowed, true);
  assert.equal(result.warnings.length, 0);
});

// ============================================================
// checkPortfolioDrawdown
// ============================================================

test("checkPortfolioDrawdown no alerta con <2 registros", () => {
  const result = checkPortfolioDrawdown([{ total_value_ars: 1_000_000 }]);
  assert.equal(result.inDrawdown, false);
  assert.equal(result.alert, null);
});

test("checkPortfolioDrawdown no alerta si drawdown está dentro del límite", () => {
  const history = [
    { total_value_ars: 950_000 },
    { total_value_ars: 1_000_000 },
  ];
  const result = checkPortfolioDrawdown(history);
  assert.equal(result.inDrawdown, false);
  assert.equal(result.alert, null);
  assert.equal(result.drawdownPct, -5);
});

test("checkPortfolioDrawdown detecta drawdown crítico", () => {
  const history = [
    { total_value_ars: 750_000 },
    { total_value_ars: 1_000_000 },
  ];
  const result = checkPortfolioDrawdown(history);
  assert.equal(result.inDrawdown, true);
  assert.ok(result.alert);
  assert.ok(result.alert.includes("DRAWDOWN"));
  assert.equal(result.drawdownPct, -25);
});

test("checkPortfolioDrawdown calcula peak correctamente con datos desordenados", () => {
  const history = [
    { total_value_ars: 800_000 },
    { total_value_ars: 900_000 },
    { total_value_ars: 1_000_000 },
  ];
  const result = checkPortfolioDrawdown(history);
  assert.equal(result.drawdownPct, -20);
});

test("checkPortfolioDrawdown ignora valores nulos o <=0", () => {
  const history = [
    { total_value_ars: 750_000 },
    { total_value_ars: null },
    { total_value_ars: 1_000_000 },
  ];
  const result = checkPortfolioDrawdown(history);
  assert.equal(result.inDrawdown, true);
});

// ============================================================
// sanitizePicksWithRiskLimits
// ============================================================

const mockCedearDefs = {
  AAPL: { ticker: "AAPL", sector: "Technology" },
  MSFT: { ticker: "MSFT", sector: "Technology" },
  SPY:  { ticker: "SPY",  sector: "ETF" },
};

test("sanitizePicksWithRiskLimits deja pasar picks dentro de límites", () => {
  const picks = [{ ticker: "AAPL", cantidad_cedears: 100, precio_aprox_ars: 1000, monto_total_ars: 100_000 }];
  const summary = [{ ticker: "AAPL", total_shares: 0, weighted_avg_price: 0 }];
  const result = sanitizePicksWithRiskLimits(picks, summary, mockCedearDefs, "moderate");
  assert.equal(result.sanitizedPicks.length, 1);
  assert.equal(result.riskNotes.length, 0);
});

test("sanitizePicksWithRiskLimits reduce cantidad cuando excede maxPositionPct", () => {
  // Portfolio de $1M, maxPos moderate = 35% → $350k. Tenemos $200k en AAPL, pick de $200k → $400k (40%)
  const picks = [{ ticker: "AAPL", cantidad_cedears: 200, precio_aprox_ars: 1000, monto_total_ars: 200_000 }];
  const summary = [
    { ticker: "AAPL", total_shares: 200, weighted_avg_price: 1000 }, // valor = 200k
    { ticker: "SPY",  total_shares: 160, weighted_avg_price: 5000 }, // valor = 800k → total = 1M
  ];
  const result = sanitizePicksWithRiskLimits(picks, summary, mockCedearDefs, "moderate");
  assert.equal(result.sanitizedPicks.length, 1);
  assert.ok(result.riskNotes.length > 0);
  assert.equal(result.sanitizedPicks[0].cantidad_cedears, 150); // 350k max - 200k existente = 150k / 1000 = 150
});

test("sanitizePicksWithRiskLimits elimina pick si cantidad ajustada es 0", () => {
  const picks = [{ ticker: "AAPL", cantidad_cedears: 100, precio_aprox_ars: 1000, monto_total_ars: 100_000 }];
  const summary = [{ ticker: "AAPL", total_shares: 250, weighted_avg_price: 1000 }]; // valor = 250k (>20%)
  const result = sanitizePicksWithRiskLimits(picks, summary, mockCedearDefs, "moderate");
  assert.equal(result.sanitizedPicks.length, 0);
  assert.ok(result.riskNotes.length > 0);
});

test("sanitizePicksWithRiskLimits reduce cantidad por sector excesivo", () => {
  // Portfolio $1M, maxSector moderate = 35%. Technology ya tiene $200k, pick de $200k en MSFT → $400k (40%)
  const picks = [{ ticker: "MSFT", cantidad_cedears: 200, precio_aprox_ars: 1000, monto_total_ars: 200_000 }];
  const summary = [
    { ticker: "AAPL", total_shares: 200, weighted_avg_price: 1000 }, // $200k tech
    { ticker: "SPY",  total_shares: 160, weighted_avg_price: 5000 }, // $800k → total = 1M
  ];
  const result = sanitizePicksWithRiskLimits(picks, summary, mockCedearDefs, "moderate");
  assert.equal(result.sanitizedPicks.length, 1);
  assert.ok(result.riskNotes.some((n) => n.includes("sector")));
  assert.equal(result.sanitizedPicks[0].cantidad_cedears, 150); // 350k max - 200k existente = 150k / 1000 = 150
});

test("sanitizePicksWithRiskLimits maneja portfolio vacío sin errores", () => {
  const picks = [{ ticker: "SPY", cantidad_cedears: 100, precio_aprox_ars: 5000, monto_total_ars: 500_000 }];
  const result = sanitizePicksWithRiskLimits(picks, [], mockCedearDefs, "moderate");
  assert.equal(result.sanitizedPicks.length, 1);
  assert.equal(result.riskNotes.length, 0);
});

test("sanitizePicksWithRiskLimits maneja cedearDefs nulo", () => {
  const picks = [{ ticker: "UNKNOWN", cantidad_cedears: 100, precio_aprox_ars: 1000, monto_total_ars: 100_000 }];
  const result = sanitizePicksWithRiskLimits(picks, [], null, "moderate");
  // Sin defs no puede calcular sector, pero tampoco tiene posiciones existentes, así que debería pasar
  assert.equal(result.sanitizedPicks.length, 1);
});

test("sanitizePicksWithRiskLimits retorna arrays vacíos si picks es nulo", () => {
  const result = sanitizePicksWithRiskLimits(null, [], mockCedearDefs, "moderate");
  assert.equal(result.sanitizedPicks.length, 0);
  assert.equal(result.riskNotes.length, 0);
});
