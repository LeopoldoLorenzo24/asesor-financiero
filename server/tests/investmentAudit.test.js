import test from "node:test";
import assert from "node:assert/strict";
import { summarizeLatestAnalysisSession, buildOperationalVerdict } from "../investmentAudit.js";
import { buildRatioSyncHealth, buildTradeSafetyStatus } from "../tradeSafety.js";

test("summarizeLatestAnalysisSession extrae senales clave del full_response", () => {
  const row = {
    session_date: "2026-05-01T12:00:00.000Z",
    full_response: JSON.stringify({
      decision_mensual: {
        core_etf: "SPY",
        distribucion: { core_pct: 85, satellite_pct: 15 },
        picks_activos: [{ ticker: "AAPL" }, { ticker: "MSFT" }],
      },
      plan_ejecucion: [{ paso: 1 }, { paso: 2 }],
      _circuit_breaker: { triggered: true },
      _price_data_warning: "Solo 1/2 precios verificados.",
      _data_freshness_warning: "VIX stale.",
      _guardrail_notes: ["a"],
      _risk_notes: ["b", "c"],
      _consistency_notes: ["d"],
      _macro_warnings: ["macro"],
    }),
  };

  const result = summarizeLatestAnalysisSession(row);
  assert.equal(result.coreETF, "SPY");
  assert.equal(result.picksCount, 2);
  assert.equal(result.planSteps, 2);
  assert.equal(result.hasCircuitBreaker, true);
  assert.equal(result.hasPriceDataWarning, true);
  assert.equal(result.guardrailNotesCount, 1);
  assert.equal(result.riskNotesCount, 2);
  assert.ok(result.warnings.length >= 2);
});

test("buildOperationalVerdict bloquea cuando readiness y datos no permiten operar", () => {
  const tradeSafety = buildTradeSafetyStatus({
    ccl: { _stale: true },
    marketProviders: { degraded: true },
    ratioHealth: buildRatioSyncHealth({ ratios: {}, coverage: { total: 10, dynamic: 0, pct: 0 } }),
  });

  const result = buildOperationalVerdict({
    readiness: {
      readyForRealCapital: false,
      mode: "paper_only",
      scorePct: 58,
      grade: "C",
      capitalPolicy: { maxCapitalPct: 5 },
      evidence: { alphaStats: { avgAlpha: -1.2 } },
    },
    marketProviders: { degraded: true },
    ratioFreshness: { stale: true, warning: "Ratios viejos." },
    latestAnalysis: {
      hasPriceDataWarning: true,
      hasFreshnessWarning: true,
      hasCircuitBreaker: true,
    },
    aiBudget: { hasBudget: true, usagePct: 95 },
    trackMetrics: { alphaPct: -3.5 },
    adherence: { pending: 2, avgDiscrepancyPct: 22, resolved: 4 },
    tradeSafety,
  });

  assert.equal(result.verdict, "blocked");
  assert.equal(result.recommendedCapitalPct, 0);
  assert.ok(result.blockers.length >= 3);
  assert.ok(result.cautions.length >= 3);
});

test("buildOperationalVerdict habilita capital incremental cuando la evidencia acompana", () => {
  const tradeSafety = buildTradeSafetyStatus({
    ccl: { _stale: false },
    marketProviders: { degraded: false },
    ratioHealth: buildRatioSyncHealth({
      ratios: { SPY: { ratio: 20, updated_at: new Date().toISOString() } },
      coverage: { total: 1, dynamic: 1, pct: 100 },
    }),
  });

  const result = buildOperationalVerdict({
    readiness: {
      readyForRealCapital: true,
      mode: "real_capital_ok",
      scorePct: 87,
      grade: "A",
      capitalPolicy: { maxCapitalPct: 25 },
      evidence: { alphaStats: { avgAlpha: 2.8 } },
    },
    marketProviders: { degraded: false },
    ratioFreshness: { stale: false, warning: null },
    latestAnalysis: {
      hasPriceDataWarning: false,
      hasFreshnessWarning: false,
      hasCircuitBreaker: false,
    },
    aiBudget: { hasBudget: true, usagePct: 40 },
    trackMetrics: { alphaPct: 5.2 },
    adherence: { pending: 0, avgDiscrepancyPct: 4, resolved: 10 },
    tradeSafety,
  });

  assert.equal(result.verdict, "ready_incremental");
  assert.equal(result.recommendedCapitalPct, 25);
  assert.equal(result.blockers.length, 0);
  assert.ok(result.strengths.length >= 3);
});
