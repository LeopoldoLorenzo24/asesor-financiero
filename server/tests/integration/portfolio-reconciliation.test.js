import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import { app } from "../../index.js";
import db from "../../database.js";
import { setupTestDb, authHeader } from "./helpers.js";

async function cleanPortfolioState() {
  await db.execute("DELETE FROM portfolio");
  await db.execute("DELETE FROM transactions");
  await db.execute("DELETE FROM broker_import_audit_logs");
}

await setupTestDb();

test("POST /api/portfolio/reconcile/preview devuelve diff entre broker y cartera local", async () => {
  await cleanPortfolioState();

  await request(app)
    .post("/api/portfolio/reset")
    .set(await authHeader())
    .send({
      positions: [
        { ticker: "SPY", shares: 10, priceArs: 1000 },
        { ticker: "MSFT", shares: 3, priceArs: 2000 },
      ],
    });

  const res = await request(app)
    .post("/api/portfolio/reconcile/preview")
    .set(await authHeader())
    .send({
      positions: [
        { ticker: "SPY", shares: 12, priceArs: 1100 },
        { ticker: "GOOGL", shares: 5, priceArs: 900 },
      ],
      snapshotDate: "2026-04-24",
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.importedPositions.length, 2);
  assert.equal(res.body.reconciliation.summary.totalActions, 3);
  assert.equal(String(res.body.auditLog?.input_hash || "").length, 64);
  assert.equal(res.body.auditLog?.applied, 0);

  const actions = res.body.reconciliation.actions;
  assert.ok(actions.some((action) => action.ticker === "SPY" && action.type === "BUY" && action.shares === 2));
  assert.ok(actions.some((action) => action.ticker === "GOOGL" && action.type === "BUY" && action.shares === 5));
  assert.ok(actions.some((action) => action.ticker === "MSFT" && action.type === "SELL" && action.shares === 3));
});

test("POST /api/portfolio/reconcile/apply aplica CSV del broker y deja transacciones auditables", async () => {
  await cleanPortfolioState();

  await request(app)
    .post("/api/portfolio/reset")
    .set(await authHeader())
    .send({
      positions: [
        { ticker: "SPY", shares: 10, priceArs: 1000 },
        { ticker: "MSFT", shares: 3, priceArs: 2000 },
      ],
    });

  const csv = [
    "Producto;Cantidad;PPC USD",
    "SPY;12;1,10",
    "GOOGL;5;0,90",
  ].join("\n");

  const res = await request(app)
    .post("/api/portfolio/reconcile/apply")
    .set(await authHeader())
    .send({
      broker: "bull_market",
      csv,
      cclRate: 1000,
      note: "broker sync test",
      snapshotDate: "2026-04-24",
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.count, 3);
  assert.equal(String(res.body.auditLog?.input_hash || "").length, 64);
  assert.equal(res.body.auditLog?.applied, 1);

  const portfolioRes = await request(app)
    .get("/api/portfolio/db")
    .set(await authHeader());

  assert.equal(portfolioRes.status, 200);
  const summary = portfolioRes.body.summary;
  assert.ok(summary.some((row) => row.ticker === "SPY" && Number(row.total_shares) === 12));
  assert.ok(summary.some((row) => row.ticker === "GOOGL" && Number(row.total_shares) === 5));
  assert.ok(!summary.some((row) => row.ticker === "MSFT"));

  const txRows = (await db.execute({
    sql: "SELECT ticker, type, shares, notes, date_executed FROM transactions WHERE notes LIKE ? ORDER BY id ASC",
    args: ["broker sync test%"],
  })).rows;

  assert.equal(txRows.length, 3);
  assert.ok(txRows.some((row) => row.ticker === "SPY" && row.type === "BUY" && Number(row.shares) === 2));
  assert.ok(txRows.some((row) => row.ticker === "GOOGL" && row.type === "BUY" && Number(row.shares) === 5));
  assert.ok(txRows.some((row) => row.ticker === "MSFT" && row.type === "SELL" && Number(row.shares) === 3));
  assert.ok(txRows.every((row) => String(row.date_executed).slice(0, 10) === "2026-04-24"));
});

test("GET /api/portfolio/reconcile/audit devuelve historial reciente de imports", async () => {
  await cleanPortfolioState();

  await request(app)
    .post("/api/portfolio/reconcile/preview")
    .set(await authHeader())
    .send({
      broker: "bull_market",
      csv: [
        "Simbolo;Producto;Cantidad;PPC;Total",
        "SPY;CEDEAR SPDR S&P 500;10;5000,00;50000,00",
      ].join("\n"),
      sourceName: "bull-market-tenencia.xlsx",
      snapshotDate: "2026-04-24",
    });

  const res = await request(app)
    .get("/api/portfolio/reconcile/audit?limit=5")
    .set(await authHeader());

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length >= 1);
  assert.equal(res.body[0].broker_key, "bull_market");
  assert.equal(res.body[0].source_name, "bull-market-tenencia.xlsx");
  assert.equal(String(res.body[0].input_hash).length, 64);
});
