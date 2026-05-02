import test from "node:test";
import assert from "node:assert/strict";
import { buildRatioSyncHealth, buildTradeSafetyStatus, buildStandAsideAnalysis } from "../tradeSafety.js";

test("buildRatioSyncHealth marca critical cuando no hay ratios dinamicos recientes", () => {
  const result = buildRatioSyncHealth({
    ratios: {},
    coverage: { total: 200, dynamic: 0, pct: 0 },
  });

  assert.equal(result.severity, "critical");
  assert.equal(result.dynamicCount, 0);
});

test("buildTradeSafetyStatus exige stand aside con CCL stale y providers degradados", () => {
  const ratioHealth = buildRatioSyncHealth({
    ratios: { SPY: { ratio: 20, updated_at: new Date().toISOString() } },
    coverage: { total: 10, dynamic: 1, pct: 10 },
  });

  const result = buildTradeSafetyStatus({
    ccl: { _stale: true },
    marketProviders: { degraded: true },
    ratioHealth,
  });

  assert.equal(result.mustStandAside, true);
  assert.equal(result.status, "stand_aside");
  assert.ok(result.blockers.length >= 2);
});

test("buildStandAsideAnalysis devuelve plan no ejecutable y sin picks", () => {
  const tradeSafety = buildTradeSafetyStatus({
    ccl: { _stale: true },
    marketProviders: { degraded: false },
    ratioHealth: buildRatioSyncHealth({ ratios: {}, coverage: { total: 10, dynamic: 0, pct: 0 } }),
  });

  const result = buildStandAsideAnalysis({
    capital: 250000,
    coreETF: "SPY",
    tradeSafety,
  });

  assert.equal(result.decision_mensual.core_etf, "SPY");
  assert.equal(result.decision_mensual.distribucion.satellite_pct, 0);
  assert.equal(result.plan_ejecucion.length, 0);
  assert.equal(result.decision_mensual.picks_activos.length, 0);
});
