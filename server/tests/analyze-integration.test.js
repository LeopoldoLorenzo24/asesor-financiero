// ============================================================
// INTEGRATION TEST: /api/ai/analyze pipeline
//
// Testea el pipeline completo de análisis sin llamar a Claude real:
//   extractJSON → validateAnalysisSchema → enforceAnalysisConsistency → coherencia final
//
// Por qué no se mockea el HTTP endpoint directamente:
//   - index.js no exporta `app`, lo que requeriría refactor significativo.
//   - El valor real está en testear la lógica de parsing + consistencia.
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import { extractJSON, validateAnalysisSchema, enforceAnalysisConsistency } from "../aiAdvisor.js";

// Simula la respuesta JSON cruda que Claude devolvería
const MOCK_AI_RESPONSE = {
  resumen_mercado: "El mercado sigue en modo risk-on tras el rebote de abril.",
  diagnostico_cartera: {
    estado_general: "Portfolio bien diversificado con sesgo tech.",
    exposicion_sectorial: { Technology: "55%", Healthcare: "20%", Financial: "25%" },
    problemas_detectados: ["Sobreexposición a tech"],
    fortalezas: ["Base defensiva con UNH"],
  },
  acciones_cartera_actual: [
    { ticker: "NVDA", accion: "MANTENER", cantidad_actual: 13, cantidad_ajustar: 0, razon: "Tesis vigente", urgencia: "baja" },
    { ticker: "MSFT", accion: "REDUCIR", cantidad_actual: 10, cantidad_ajustar: 3, razon: "Rebalancear sector", urgencia: "media" },
  ],
  decision_mensual: {
    resumen: "70% SPY como core, 30% satellite con picks de alta convicción.",
    core_etf: "SPY",
    distribucion: { core_pct: 70, satellite_pct: 30, core_monto_ars: 700000, satellite_monto_ars: 300000 },
    picks_activos: [
      {
        ticker: "AAPL",
        nombre: "Apple Inc.",
        sector: "Technology",
        conviction: 78,
        por_que_le_gana_a_spy: "Margen operativo récord + recompras",
        cantidad_cedears: 5,
        precio_aprox_ars: 60000,
        monto_total_ars: 300000,
        horizonte: "Mediano plazo (1-3 meses)",
        target_pct: 12,
        stop_loss_pct: -8,
        cuando_ver_rendimiento: "Al mes siguiente del anuncio de resultados",
        proyeccion_retornos: { "1_mes": "+3%", "3_meses": "+8%", "6_meses": "+12%" },
      },
    ],
  },
  resumen_operaciones: {
    capital_disponible_actual: 1000000,
    total_a_vender_ars: 0,
    capital_disponible_post_ventas: 1000000,
    a_core_ars: 700000,
    a_satellite_ars: 300000,
  },
  plan_ejecucion: [
    { paso: 1, tipo: "COMPRAR", subtipo: "CORE", ticker: "SPY", cantidad_cedears: 3, monto_estimado_ars: 700000, nota: "Core" },
    { paso: 2, tipo: "COMPRAR", subtipo: "SATELLITE", ticker: "AAPL", cantidad_cedears: 5, monto_estimado_ars: 300000, nota: "Satellite" },
  ],
  cartera_objetivo: {
    descripcion: "Portfolio objetivo",
    posiciones: [{ ticker: "SPY", sector: "ETF", porcentaje_target: 70, es_core: true }],
  },
  riesgos: ["Posible corrección tech si suben tasas", "Riesgo cambiario ARS/USD"],
  sin_cambios_necesarios: false,
  honestidad: "Tengo convicción media-alta en AAPL. SPY como base es lo más prudente.",
  proximo_review: "próximo mes",
};

// ── Test 1: extractJSON parsea JSON inline en texto limpio ──
test("extractJSON extrae JSON válido desde texto plano", () => {
  const raw = JSON.stringify(MOCK_AI_RESPONSE);
  const extracted = extractJSON(raw);
  assert.ok(extracted.length > 0, "debe devolver string no vacío");
  const parsed = JSON.parse(extracted);
  assert.equal(parsed.decision_mensual.core_etf, "SPY");
});

// ── Test 2: extractJSON extrae JSON embebido en markdown ──
test("extractJSON extrae JSON desde bloque markdown ```json```", () => {
  const wrapped = "Aquí está el análisis:\n```json\n" + JSON.stringify(MOCK_AI_RESPONSE) + "\n```\n";
  const extracted = extractJSON(wrapped);
  assert.ok(extracted.length > 0);
  const parsed = JSON.parse(extracted);
  assert.equal(parsed.sin_cambios_necesarios, false);
});

// ── Test 3: validateAnalysisSchema — respuesta válida no tiene errores ──
test("validateAnalysisSchema retorna sin errores para respuesta válida", () => {
  const errors = validateAnalysisSchema(MOCK_AI_RESPONSE);
  assert.deepEqual(errors, [], `No debería haber errores: ${errors.join(", ")}`);
});

// ── Test 4: validateAnalysisSchema detecta campos faltantes ──
test("validateAnalysisSchema detecta decision_mensual faltante", () => {
  const broken = { ...MOCK_AI_RESPONSE, decision_mensual: null };
  const errors = validateAnalysisSchema(broken);
  assert.ok(errors.some(e => e.includes("decision_mensual")), "debe reportar decision_mensual faltante");
});

test("validateAnalysisSchema detecta resumen_mercado vacío", () => {
  const broken = { ...MOCK_AI_RESPONSE, resumen_mercado: "" };
  const errors = validateAnalysisSchema(broken);
  assert.ok(errors.some(e => e.includes("resumen_mercado")));
});

test("validateAnalysisSchema detecta picks_activos no array", () => {
  const broken = {
    ...MOCK_AI_RESPONSE,
    decision_mensual: { ...MOCK_AI_RESPONSE.decision_mensual, picks_activos: "invalid" },
  };
  const errors = validateAnalysisSchema(broken);
  assert.ok(errors.some(e => e.includes("picks_activos")));
});

// ── Test 5: enforceAnalysisConsistency — coherencia capital ──
test("enforceAnalysisConsistency: capital_disponible_post_ventas = capital + ventas", () => {
  const result = JSON.parse(JSON.stringify(MOCK_AI_RESPONSE)); // deep clone
  const cycleData = {
    positionsWithData: [
      { ticker: "NVDA", shares: 13, currentPrice: 11000 },
      { ticker: "MSFT", shares: 10, currentPrice: 20000 },
    ],
  };
  const ranking = [
    { cedear: { ticker: "SPY", ratio: 10 }, quote: { price: 410 } },
    { cedear: { ticker: "AAPL", ratio: 20 }, quote: { price: 180 } },
  ];
  const ccl = { venta: 1200 };

  enforceAnalysisConsistency({
    result,
    capital: 1000000,
    coreETF: "SPY",
    profile: { corePct: 70 },
    cycleData,
    ranking,
    ccl,
  });

  const ops = result.resumen_operaciones;
  assert.equal(
    ops.capital_disponible_post_ventas,
    ops.capital_disponible_actual + ops.total_a_vender_ars,
    "capital_disponible_post_ventas debe ser capital + ventas"
  );
});

// ── Test 6: enforceAnalysisConsistency — core_pct + satellite_pct = 100 ──
test("enforceAnalysisConsistency: core_pct + satellite_pct === 100 después de corrección", () => {
  const result = JSON.parse(JSON.stringify(MOCK_AI_RESPONSE));
  // Forzar distribución que NO suma 100
  result.decision_mensual.distribucion.core_pct = 60;
  result.decision_mensual.distribucion.satellite_pct = 55; // suma 115, inválido

  enforceAnalysisConsistency({
    result,
    capital: 1000000,
    coreETF: "SPY",
    profile: { corePct: 70 },
    cycleData: { positionsWithData: [] },
    ranking: [{ cedear: { ticker: "SPY", ratio: 10 }, quote: { price: 410 } }],
    ccl: { venta: 1200 },
  });

  const { core_pct, satellite_pct } = result.decision_mensual.distribucion;
  assert.equal(core_pct + satellite_pct, 100, "la suma debe ser exactamente 100");
  assert.ok(Array.isArray(result._consistency_notes), "_consistency_notes debe existir");
  assert.ok(result._consistency_notes.some(n => n.includes("normalizada")));
});

// ── Test 7: sin_cambios_necesarios se deshabilita si hay operaciones ──
test("enforceAnalysisConsistency: sin_cambios_necesarios=false si hay picks activos", () => {
  const result = JSON.parse(JSON.stringify(MOCK_AI_RESPONSE));
  result.sin_cambios_necesarios = true; // conflicto: hay picks pero dice sin cambios

  enforceAnalysisConsistency({
    result,
    capital: 1000000,
    coreETF: "SPY",
    profile: { corePct: 70 },
    cycleData: { positionsWithData: [] },
    ranking: [{ cedear: { ticker: "SPY", ratio: 10 }, quote: { price: 410 } }],
    ccl: { venta: 1200 },
  });

  assert.equal(result.sin_cambios_necesarios, false, "debe ser false cuando hay picks activos");
});

// ── Test 8: plan_ejecucion siempre es array ──
test("enforceAnalysisConsistency: plan_ejecucion es siempre un array", () => {
  const result = JSON.parse(JSON.stringify(MOCK_AI_RESPONSE));

  enforceAnalysisConsistency({
    result,
    capital: 1000000,
    coreETF: "SPY",
    profile: { corePct: 70 },
    cycleData: { positionsWithData: [] },
    ranking: [{ cedear: { ticker: "SPY", ratio: 10 }, quote: { price: 410 } }],
    ccl: { venta: 1200 },
  });

  assert.ok(Array.isArray(result.plan_ejecucion), "plan_ejecucion debe ser array");
});

// ── Test 9: sin picks activos → 100% core ──
test("enforceAnalysisConsistency: sin picks_activos fuerza 100% core", () => {
  const result = JSON.parse(JSON.stringify(MOCK_AI_RESPONSE));
  result.decision_mensual.picks_activos = [];

  enforceAnalysisConsistency({
    result,
    capital: 500000,
    coreETF: "SPY",
    profile: { corePct: 70 },
    cycleData: { positionsWithData: [] },
    ranking: [{ cedear: { ticker: "SPY", ratio: 10 }, quote: { price: 410 } }],
    ccl: { venta: 1200 },
  });

  assert.equal(result.decision_mensual.distribucion.core_pct, 100);
  assert.equal(result.decision_mensual.distribucion.satellite_pct, 0);
});
