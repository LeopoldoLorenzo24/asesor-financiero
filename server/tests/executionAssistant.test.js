import test from "node:test";
import assert from "node:assert/strict";
import { buildTradeTicketsFromAnalysis } from "../executionAssistant.js";

test("buildTradeTicketsFromAnalysis genera ticket critico para compra de alta conviccion", () => {
  const result = buildTradeTicketsFromAnalysis({
    suggestionMode: "critical_alerts",
    investmentReadiness: {
      preflight: { status: "ready", latestStatus: "ready" },
      marketRegime: { regime: "bullish" },
    },
    analysis: {
      decision_mensual: {
        picks_activos: [
          {
            ticker: "AAPL",
            nombre: "Apple",
            sector: "Technology",
            conviction: 90,
            precio_aprox_ars: 10000,
            target_pct: 14,
            stop_loss_pct: -8,
            por_que_le_gana_a_spy: "Catalizador claro y momentum superior.",
          },
        ],
      },
      plan_ejecucion: [
        {
          tipo: "COMPRAR",
          subtipo: "SATELLITE",
          ticker: "AAPL",
          cantidad_cedears: 10,
          monto_estimado_ars: 100000,
          nota: "Comprar despues del core.",
        },
      ],
    },
  });

  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.critical, 1);
  assert.equal(result.tickets[0].action, "BUY");
  assert.equal(result.tickets[0].priority, "critical");
  assert.equal(result.tickets[0].shouldAlert, true);
});

test("buildTradeTicketsFromAnalysis genera ticket defensivo de venta", () => {
  const result = buildTradeTicketsFromAnalysis({
    suggestionMode: "manual_only",
    investmentReadiness: {
      preflight: { status: "caution", latestStatus: "caution" },
      marketRegime: { regime: "sideways" },
    },
    analysis: {
      decision_mensual: { picks_activos: [] },
      plan_ejecucion: [
        {
          tipo: "VENDER",
          ticker: "MSFT",
          cantidad_cedears: 5,
          monto_estimado_ars: 50000,
          nota: "Reducir por riesgo y falta de alpha.",
        },
      ],
    },
  });

  assert.equal(result.summary.sells, 1);
  assert.equal(result.tickets[0].action, "SELL");
  assert.equal(result.tickets[0].priority, "critical");
  assert.equal(result.tickets[0].shouldAlert, false);
});
