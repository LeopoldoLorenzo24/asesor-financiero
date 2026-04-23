import test from "node:test";
import assert from "node:assert/strict";

import { technicalAnalysis, fundamentalAnalysis, compositeScore } from "../analysis.js";

function buildHistory(days = 120) {
  const rows = [];
  let base = 100;
  for (let i = 0; i < days; i++) {
    const wave = Math.sin(i / 8) * 0.8;
    base = Math.max(10, base + 0.2 + wave * 0.1);
    const close = Math.round(base * 100) / 100;
    rows.push({
      date: new Date(Date.now() - (days - i) * 86400000).toISOString().slice(0, 10),
      open: close,
      high: Math.round(close * 1.01 * 100) / 100,
      low: Math.round(close * 0.99 * 100) / 100,
      close,
      volume: 500000 + i * 1000,
    });
  }
  return rows;
}

test("technicalAnalysis devuelve score válido", () => {
  const tech = technicalAnalysis(buildHistory(130));
  assert.equal(typeof tech.score, "number");
  assert.ok(tech.score >= 0 && tech.score <= 100);
  assert.ok(Array.isArray(tech.signals));
});

test("fundamentalAnalysis soporta quote-only sin romper", () => {
  const fund = fundamentalAnalysis(null, {
    trailingPE: 22,
    forwardPE: 18,
    price: 130,
    dividendYield: 1.8,
    beta: 1.1,
  });
  assert.equal(typeof fund.score, "number");
  assert.ok(fund.score >= 0 && fund.score <= 100);
});

test("compositeScore refleja diferencias por perfil", () => {
  const tech = technicalAnalysis(buildHistory(140));
  const fund = fundamentalAnalysis(
    {
      pe: 24,
      forwardPE: 20,
      epsGrowth: 10,
      revenueGrowth: 7,
      profitMargin: 14,
      returnOnEquity: 17,
      debtToEquity: 60,
    },
    { price: 120, beta: 1.4, trailingPE: 24, dividendYield: 1.5 }
  );

  const conservative = compositeScore(tech, fund, { beta: 1.4 }, "Technology", "conservative");
  const aggressive = compositeScore(tech, fund, { beta: 1.4 }, "Technology", "aggressive");

  assert.equal(typeof conservative.composite, "number");
  assert.equal(typeof aggressive.composite, "number");
  assert.ok(conservative.composite >= 0 && conservative.composite <= 100);
  assert.ok(aggressive.composite >= 0 && aggressive.composite <= 100);
  assert.notEqual(conservative.composite, aggressive.composite);
});
