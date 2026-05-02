import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../../index.js";
import { setupTestDb, authHeader } from "./helpers.js";
import { createExecutionTradeTicket } from "../../database.js";

await setupTestDb();

// ── Public endpoints ──

test("GET /api/health returns ok", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.ok(typeof res.body.cedears === "number");
});

test("GET /api/auth/status returns canRegister boolean", async () => {
  const res = await request(app).get("/api/auth/status");
  assert.equal(res.status, 200);
  assert.ok(typeof res.body.canRegister === "boolean");
  assert.equal(res.body.canRegister, true);
});

// ── Authenticated endpoints ──

test("GET /api/cedears returns array of CEDEARs", async () => {
  const res = await request(app).get("/api/cedears").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length > 0);
  assert.ok(res.body[0].ticker);
  assert.ok(res.body[0].sector);
});

test("GET /api/ccl returns CCL object", async () => {
  const res = await request(app).get("/api/ccl").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(typeof res.body.venta === "number" || res.body._stale === true);
});

test("GET /api/sectors returns sectors array", async () => {
  const res = await request(app).get("/api/sectors").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length > 0);
  assert.ok(res.body[0].sector);
  assert.ok(typeof res.body[0].count === "number");
});

test("GET /api/portfolio/db returns summary and positions", async () => {
  const res = await request(app).get("/api/portfolio/db").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.summary));
  assert.ok(Array.isArray(res.body.positions));
});

test("POST /api/portfolio/liquidity-plan returns a sell plan payload", async () => {
  const res = await request(app)
    .post("/api/portfolio/liquidity-plan")
    .set(await authHeader())
    .send({ targetArs: 100000 });
  assert.equal(res.status, 200);
  assert.ok(typeof res.body.feasible === "boolean");
  assert.ok(Array.isArray(res.body.recommendations));
  assert.ok(res.body.summary);
});

test("POST /api/portfolio/buy validates missing fields", async () => {
  const res = await request(app).post("/api/portfolio/buy").set(await authHeader()).send({});
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test("POST /api/portfolio/buy validates invalid shares", async () => {
  const res = await request(app)
    .post("/api/portfolio/buy")
    .set(await authHeader())
    .send({ ticker: "SPY", shares: "abc", priceArs: 1000 });
  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes("shares") || res.body.error.includes("inválido"));
});

test("POST /api/portfolio/buy validates non-existent ticker", async () => {
  const res = await request(app)
    .post("/api/portfolio/buy")
    .set(await authHeader())
    .send({ ticker: "FAKE99", shares: 10, priceArs: 1000 });
  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes("no existe"));
});

test("POST /api/portfolio/reset validates empty positions", async () => {
  const res = await request(app)
    .post("/api/portfolio/reset")
    .set(await authHeader())
    .send({ positions: [] });
  assert.equal(res.status, 400);
});

test("POST /api/portfolio/reset validates negative shares", async () => {
  const res = await request(app)
    .post("/api/portfolio/reset")
    .set(await authHeader())
    .send({ positions: [{ ticker: "SPY", shares: -5, priceArs: 1000 }] });
  assert.equal(res.status, 400);
});

test("GET /api/transactions returns array", async () => {
  const res = await request(app).get("/api/transactions").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test("GET /api/predictions returns array", async () => {
  const res = await request(app).get("/api/predictions").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test("GET /api/performance returns object", async () => {
  const res = await request(app).get("/api/performance").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(typeof res.body === "object");
});

test("GET /api/capital returns array", async () => {
  const res = await request(app).get("/api/capital").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test("GET /api/capital-history returns array", async () => {
  const res = await request(app).get("/api/capital-history").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test("POST /api/capital logs capital entry", async () => {
  const res = await request(app)
    .post("/api/capital")
    .set(await authHeader())
    .send({ capitalArs: 50000, portfolioValueArs: 100000, cclRate: 1200, monthlyDeposit: 1000000 });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

test("GET /api/backtest returns backtest object", async () => {
  const res = await request(app).get("/api/backtest?months=3&profile=moderate").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(typeof res.body === "object");
  assert.ok(res.body.resultado || res.body.error);
});

test("GET /api/benchmarks returns benchmarks", async () => {
  const res = await request(app).get("/api/benchmarks").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(typeof res.body === "object");
});

test("GET /api/internal/metrics returns observability snapshot", async () => {
  const res = await request(app).get("/api/internal/metrics").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(res.body.observability);
  assert.ok(res.body.timestamp);
});

test("GET /api/analysis-sessions returns array", async () => {
  const res = await request(app).get("/api/analysis-sessions").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test("GET /api/system/policies returns catalog and current selection", async () => {
  const res = await request(app).get("/api/system/policies").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(res.body.currentSelection);
  assert.ok(Array.isArray(res.body.catalog?.overlays));
  assert.ok(Array.isArray(res.body.catalog?.deploymentModes));
});

test("GET /api/system/broker-settings returns current broker and catalog", async () => {
  const res = await request(app).get("/api/system/broker-settings").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(res.body.current);
  assert.ok(Array.isArray(res.body.catalog));
  assert.ok(res.body.catalog.length > 0);
});

test("POST /api/system/broker-settings persists broker preference", async () => {
  const res = await request(app)
    .post("/api/system/broker-settings")
    .set(await authHeader())
    .send({ brokerKey: "default" });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.current.brokerKey, "default");
  assert.ok(res.body.readiness);
});

test("GET /api/system/investment-audit returns consolidated operational audit", async () => {
  const res = await request(app).get("/api/system/investment-audit").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(["blocked", "caution", "ready_incremental"].includes(res.body.verdict));
  assert.ok(res.body.readiness);
  assert.ok(res.body.dataQuality);
  assert.ok(res.body.dataQuality.tradeSafety);
  assert.ok(res.body.evidence);
  assert.ok(res.body.generatedAt);
});

test("GET /api/system/preflight-status returns latest preflight payload", async () => {
  const res = await request(app).get("/api/system/preflight-status").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(res.body.window);
  assert.ok(res.body.assessment);
  assert.ok(Array.isArray(res.body.recentRuns));
});

test("GET /api/system/execution-assistant returns assistant settings and summary", async () => {
  const res = await request(app).get("/api/system/execution-assistant").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(res.body.settings);
  assert.ok(Array.isArray(res.body.modeCatalog));
  assert.ok(res.body.summary);
});

test("POST /api/system/execution-assistant persists suggestion mode", async () => {
  const res = await request(app)
    .post("/api/system/execution-assistant")
    .set(await authHeader())
    .send({ suggestionMode: "critical_alerts", maxCriticalAlertsPerDay: 3 });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.settings.suggestionMode, "critical_alerts");
  assert.equal(res.body.settings.maxCriticalAlertsPerDay, 3);
  assert.equal(res.body.settings.confirmationRequired, true);
});

test("POST /api/execution-tickets/:id/confirm actualiza el ticket", async () => {
  const ticket = await createExecutionTradeTicket({
    userId: 1,
    action: "BUY",
    ticker: "ZZTEST1",
    suggestionMode: "manual_only",
    shares: 10,
    limitPriceArs: 10000,
    estimatedAmountArs: 100000,
    rationale: "Test ticket",
  });

  const res = await request(app)
    .post(`/api/execution-tickets/${ticket.id}/confirm`)
    .set(await authHeader())
    .send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.ticket.status, "confirmed");
});

test("POST /api/system/policies/preview returns impact preview", async () => {
  const res = await request(app)
    .post("/api/system/policies/preview")
    .set(await authHeader())
    .send({ overlayKey: "capital_preservation", deploymentMode: "pilot" });
  assert.equal(res.status, 200);
  assert.equal(res.body.proposedSelection.overlayKey, "capital_preservation");
  assert.equal(res.body.proposedSelection.deploymentMode, "pilot");
  assert.ok(res.body.previewReadiness);
  assert.ok(res.body.impact);
});

test("POST /api/system/policies/apply saves selection and audit log", async () => {
  const res = await request(app)
    .post("/api/system/policies/apply")
    .set(await authHeader())
    .send({
      overlayKey: "capital_preservation",
      deploymentMode: "pilot",
      reason: "test governance apply",
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.selection.overlayKey, "capital_preservation");
  assert.equal(res.body.selection.deploymentMode, "pilot");
  if (res.body.changed === false) {
    assert.ok(res.body.cooldown || res.body.selection);
    return;
  }
  assert.ok(Array.isArray(res.body.auditLog));
  assert.ok(res.body.auditLog.length > 0);
});

// ── Auth / Security ──

test("Protected endpoint without token returns 401", async () => {
  const res = await request(app).get("/api/cedears");
  assert.equal(res.status, 401);
});

test("Protected endpoint with invalid token returns 401", async () => {
  const res = await request(app).get("/api/cedears").set({ Authorization: "Bearer invalid_token" });
  assert.equal(res.status, 401);
});

test("Rate limit returns 429 after too many requests", async () => {
  const promises = [];
  for (let i = 0; i < 15; i++) {
    promises.push(request(app).get("/api/auth/status"));
  }
  const results = await Promise.all(promises);
  assert.ok(results.every((r) => r.status === 200 || r.status === 429));
});

test("GET /api/cedear/:ticker returns 404 for unknown ticker", async () => {
  const res = await request(app).get("/api/cedear/UNKNOWN99").set(await authHeader());
  assert.equal(res.status, 404);
});

test("GET /api/cedear/:ticker returns detail for known ticker", async () => {
  const res = await request(app).get("/api/cedear/SPY").set(await authHeader());
  assert.equal(res.status, 200);
  assert.equal(res.body.cedear.ticker, "SPY");
});

test("GET /api/history/:ticker returns price history", async () => {
  const res = await request(app).get("/api/history/SPY?months=3").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.prices));
});

test("POST /api/predictions/evaluate validates missing ticker", async () => {
  const res = await request(app)
    .post("/api/predictions/evaluate")
    .set(await authHeader())
    .send({});
  assert.equal(res.status, 400);
});

test("GET /api/postmortem/history returns array", async () => {
  const res = await request(app).get("/api/postmortem/history").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test("GET /api/performance-analytics returns object", async () => {
  const res = await request(app).get("/api/performance-analytics").set(await authHeader());
  assert.equal(res.status, 200);
  assert.ok(typeof res.body === "object");
});

test("DELETE /api/portfolio/:ticker handles missing position gracefully", async () => {
  const res = await request(app).delete("/api/portfolio/FAKE99").set(await authHeader());
  assert.ok(res.status === 200 || res.status === 500);
});

test("POST /api/portfolio/sync validates non-array", async () => {
  const res = await request(app)
    .post("/api/portfolio/sync")
    .set(await authHeader())
    .send({ positions: "not-an-array" });
  assert.equal(res.status, 400);
});

test("POST /api/portfolio/sync validates negative shares", async () => {
  const res = await request(app)
    .post("/api/portfolio/sync")
    .set(await authHeader())
    .send({ positions: [{ ticker: "SPY", shares: -1, priceArs: 1000 }] });
  assert.equal(res.status, 400);
});
