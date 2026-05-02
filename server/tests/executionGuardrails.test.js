import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePickExecutionReadiness, applyExecutionGuardrails } from "../executionGuardrails.js";

test("evaluatePickExecutionReadiness bloquea targets que no cubren costos con margen", () => {
  const result = evaluatePickExecutionReadiness({
    ticker: "AAPL",
    amountArs: 100000,
    targetPct: 1,
    cclRate: 1200,
    liquidityProfile: {
      avgDailyValueUsd: 50_000_000,
      marketImpactPct: 0.1,
    },
  });

  assert.equal(result.allowed, false);
  assert.ok(result.notes.some((note) => note.includes("insuficiente")));
});

test("evaluatePickExecutionReadiness bloquea órdenes demasiado grandes para su ADV", () => {
  const result = evaluatePickExecutionReadiness({
    ticker: "AAPL",
    amountArs: 15_000_000,
    targetPct: 25,
    cclRate: 1000,
    liquidityProfile: {
      avgDailyValueUsd: 100_000,
      marketImpactPct: 0.5,
    },
  });

  assert.equal(result.allowed, false);
  assert.ok(result.notes.some((note) => note.includes("volumen diario")));
});

test("applyExecutionGuardrails deja pasar picks con buen margen y liquidez razonable", () => {
  const result = applyExecutionGuardrails({
    picks: [
      { ticker: "SPY", monto_total_ars: 200000, target_pct: 12 },
    ],
    cclRate: 1200,
    liquidityProfiles: {
      SPY: {
        avgDailyValueUsd: 100_000_000,
        marketImpactPct: 0.05,
      },
    },
  });

  assert.equal(result.sanitizedPicks.length, 1);
  assert.equal(result.executionNotes.length, 0);
});
