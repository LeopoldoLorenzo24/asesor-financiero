import test from "node:test";
import assert from "node:assert/strict";
import { enforceAnalysisConsistency } from "../aiAdvisor.js";

test("enforceAnalysisConsistency corrige satellite sin picks y recalcula plan", () => {
  const result = {
    acciones_cartera_actual: [
      { ticker: "MSFT", accion: "REDUCIR", cantidad_actual: 10, cantidad_ajustar: 4, razon: "Reducir tech" },
      { ticker: "SPY", accion: "AUMENTAR", cantidad_actual: 11, cantidad_ajustar: 5, razon: "Aumentar core" },
    ],
    decision_mensual: {
      core_etf: "SPY",
      distribucion: { core_pct: 85, satellite_pct: 15 },
      picks_activos: [],
    },
    sin_cambios_necesarios: false,
  };

  const cycleData = {
    positionsWithData: [
      { ticker: "MSFT", shares: 10, currentPrice: 20080 },
      { ticker: "SPY", shares: 11, currentPrice: 49620 },
    ],
  };

  const ranking = [{ cedear: { ticker: "SPY", ratio: 10 }, quote: { price: 410 } }];
  const ccl = { venta: 1210 };

  enforceAnalysisConsistency({
    result,
    capital: 800000,
    coreETF: "SPY",
    profile: { corePct: 50 },
    cycleData,
    ranking,
    ccl,
  });

  assert.equal(result.decision_mensual.distribucion.core_pct, 100);
  assert.equal(result.decision_mensual.distribucion.satellite_pct, 0);
  assert.ok(Array.isArray(result.plan_ejecucion));
  assert.ok(result.plan_ejecucion.length >= 2);
  assert.equal(result.plan_ejecucion[0].tipo, "VENDER");
  assert.equal(result.plan_ejecucion[0].ticker, "MSFT");
  assert.equal(result.plan_ejecucion[0].cantidad_cedears, 4);
  assert.equal(result.plan_ejecucion[1].tipo, "COMPRAR");
  assert.equal(result.plan_ejecucion[1].subtipo, "CORE");
  assert.equal(result.resumen_operaciones.capital_disponible_post_ventas, 880320);
  assert.equal(result.resumen_operaciones.a_satellite_ars, 0);
});

test("enforceAnalysisConsistency desactiva sin_cambios si hay operaciones", () => {
  const result = {
    acciones_cartera_actual: [{ ticker: "MSFT", accion: "REDUCIR", cantidad_actual: 10, cantidad_ajustar: 2 }],
    decision_mensual: {
      core_etf: "SPY",
      distribucion: { core_pct: 100, satellite_pct: 0 },
      picks_activos: [],
    },
    sin_cambios_necesarios: true,
    plan_ejecucion: [{ paso: 1, tipo: "VENDER", ticker: "MSFT", cantidad_cedears: 2 }],
  };

  const cycleData = { positionsWithData: [{ ticker: "MSFT", shares: 10, currentPrice: 20000 }] };

  enforceAnalysisConsistency({
    result,
    capital: 100000,
    coreETF: "SPY",
    profile: { corePct: 50 },
    cycleData,
    ranking: [],
    ccl: { venta: 1200 },
  });

  assert.equal(result.sin_cambios_necesarios, false);
  assert.ok(Array.isArray(result._consistency_notes));
  assert.ok(result._consistency_notes.some((n) => n.includes("sin_cambios_necesarios")));
});

