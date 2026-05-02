import test from "node:test";
import assert from "node:assert/strict";
import { applyRealMoneyGuardrails } from "../aiAdvisor.js";

function buildBaseResult() {
  return {
    decision_mensual: {
      core_etf: "SPY",
      distribucion: {
        core_pct: 60,
        satellite_pct: 40,
      },
      picks_activos: [
        {
          ticker: "AAPL",
          conviction: 88,
          por_que_le_gana_a_spy: "Catalizador claro por recompras, expansión de márgenes y setup técnico mejor que el índice.",
          cantidad_cedears: 10,
          precio_aprox_ars: 10000,
          monto_total_ars: 100000,
          horizonte: "Mediano plazo (1-3 meses)",
          target_pct: 12,
          stop_loss_pct: -8,
        },
        {
          ticker: "MSFT",
          conviction: 84,
          por_que_le_gana_a_spy: "Setup de earnings y momentum relativo superior con riesgo acotado.",
          cantidad_cedears: 10,
          precio_aprox_ars: 10000,
          monto_total_ars: 100000,
          horizonte: "Mediano plazo (1-3 meses)",
          target_pct: 10,
          stop_loss_pct: -7,
        },
        {
          ticker: "NVDA",
          conviction: 82,
          por_que_le_gana_a_spy: "Aceleración de ingresos, revisiones positivas y fortaleza técnica persistente.",
          cantidad_cedears: 10,
          precio_aprox_ars: 10000,
          monto_total_ars: 100000,
          horizonte: "Mediano plazo (1-3 meses)",
          target_pct: 15,
          stop_loss_pct: -9,
        },
      ],
    },
  };
}

test("applyRealMoneyGuardrails fuerza 100% core si falla la validación de precios", () => {
  const result = buildBaseResult();
  result._price_data_warning = "Solo 1/3 precios verificados.";

  const guardrail = applyRealMoneyGuardrails({
    result,
    profile: { minConviction: 80 },
    coreETF: "SPY",
    backtestSummary: null,
  });

  assert.equal(guardrail.changed, true);
  assert.equal(result.decision_mensual.picks_activos.length, 0);
  assert.equal(result.decision_mensual.distribucion.core_pct, 100);
  assert.equal(result.decision_mensual.distribucion.satellite_pct, 0);
});

test("applyRealMoneyGuardrails recorta satellite si el alpha no es positivo", () => {
  const result = buildBaseResult();

  const guardrail = applyRealMoneyGuardrails({
    result,
    profile: { minConviction: 80 },
    coreETF: "SPY",
    backtestSummary: {
      satelliteAlpha: -0.5,
      biasReliability: { reliable: true, biasPct: 0 },
    },
    circuitBreakerResult: {
      triggered: true,
      reasons: ["VIX elevado"],
      action: "reduce_satellite",
      maxSatellitePct: 15,
    },
  });

  assert.equal(guardrail.changed, true);
  assert.equal(result.decision_mensual.distribucion.satellite_pct, 15);
  assert.equal(result.decision_mensual.distribucion.core_pct, 85);
  assert.equal(result.decision_mensual.picks_activos.length, 2);
});
