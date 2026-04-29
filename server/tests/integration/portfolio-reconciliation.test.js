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

test("POST /api/portfolio/history/preview parsea ledger Bull Market y exige base limpia", async () => {
  await cleanPortfolioState();

  const csv = [
    "Liquida;Operado;Comprobante;Numero;Cantidad;Especie;Precio;Importe;Saldo;Referencia",
    "10/02/2026;10/02/2026;COMPRA NORMAL;1;5,000000;SPY;51440,070000;-257200,35;756299,65;",
    "10/02/2026;10/02/2026;COMPRA NORMAL;2;10,000000;MSFT;20867,958000;-208679,58;547620,07;",
    "07/04/2026;07/04/2026;VENTA;3;-3,000000;MSFT;18277,546667;54832,64;970537,77;",
    "28/04/2026;28/04/2026;ORDEN DE PAGO;5;0,000000;;0,000000;-104533,47;-104461,70;TRANSFERENCIA VIA MEP",
  ].join("\n");

  const res = await request(app)
    .post("/api/portfolio/history/preview")
    .set(await authHeader())
    .send({
      broker: "bull_market",
      csv,
      sourceName: "Cuenta Corriente PESOS 29-04-26.xlsx",
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.summary.tradeRows, 3);
  assert.equal(res.body.summary.ignoredRows, 1);
  assert.equal(res.body.dbState.isClean, true);
  assert.equal(String(res.body.auditLog?.input_hash || "").length, 64);
  assert.deepEqual(res.body.resultingPositions, [
    { ticker: "MSFT", shares: 7, priceArs: 20867.96 },
    { ticker: "SPY", shares: 5, priceArs: 51440.07 },
  ]);
});

test("POST /api/portfolio/history/apply importa transacciones históricas en una base nueva", async () => {
  await cleanPortfolioState();

  const csv = [
    "Liquida;Operado;Comprobante;Numero;Cantidad;Especie;Precio;Importe;Saldo;Referencia",
    "10/02/2026;10/02/2026;COMPRA NORMAL;1;5,000000;SPY;51440,070000;-257200,35;756299,65;",
    "10/02/2026;10/02/2026;COMPRA NORMAL;2;10,000000;MSFT;20867,958000;-208679,58;547620,07;",
    "07/04/2026;07/04/2026;VENTA;3;-3,000000;MSFT;18277,546667;54832,64;970537,77;",
  ].join("\n");

  const res = await request(app)
    .post("/api/portfolio/history/apply")
    .set(await authHeader())
    .send({
      broker: "bull_market",
      csv,
      sourceName: "Cuenta Corriente PESOS 29-04-26.xlsx",
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.imported.transactionsImported, 3);

  const portfolioRes = await request(app)
    .get("/api/portfolio/db")
    .set(await authHeader());

  assert.equal(portfolioRes.status, 200);
  assert.ok(portfolioRes.body.summary.some((row) => row.ticker === "SPY" && Number(row.total_shares) === 5));
  assert.ok(portfolioRes.body.summary.some((row) => row.ticker === "MSFT" && Number(row.total_shares) === 7));

  const txRows = (await db.execute({
    sql: "SELECT ticker, type, shares, date_executed, notes FROM transactions ORDER BY id ASC",
  })).rows;

  assert.equal(txRows.length, 3);
  assert.equal(String(txRows[0].date_executed).slice(0, 10), "2026-02-10");
  assert.equal(String(txRows[2].date_executed).slice(0, 10), "2026-04-07");
  assert.ok(String(txRows[0].notes || "").includes("Cuenta Corriente PESOS 29-04-26.xlsx"));

  const secondApply = await request(app)
    .post("/api/portfolio/history/apply")
    .set(await authHeader())
    .send({
      broker: "bull_market",
      csv,
      sourceName: "Cuenta Corriente PESOS 29-04-26.xlsx",
    });

  assert.equal(secondApply.status, 400);
  assert.match(secondApply.body.error, /movimientos nuevos/i);
});

test("POST /api/portfolio/history/apply en modo delta backfill importa solo movimientos posteriores al último registro", async () => {
  await cleanPortfolioState();

  const initialCsv = [
    "Liquida;Operado;Comprobante;Numero;Cantidad;Especie;Precio;Importe;Saldo;Referencia",
    "08/04/2026;08/04/2026;COMPRA NORMAL;10;27,000000;SPY;51387,410000;-1387460,07;0,00;",
    "08/04/2026;08/04/2026;COMPRA NORMAL;11;7,000000;V;27187,700000;-190313,90;0,00;",
    "08/04/2026;08/04/2026;COMPRA NORMAL;12;9,000000;XOM;24318,050000;-218862,45;0,00;",
    "08/04/2026;08/04/2026;COMPRA NORMAL;13;6,000000;GOOGL;8401,860000;-50411,16;0,00;",
  ].join("\n");

  const initialApply = await request(app)
    .post("/api/portfolio/history/apply")
    .set(await authHeader())
    .send({
      broker: "bull_market",
      csv: initialCsv,
      sourceName: "seed-historico.xlsx",
    });

  assert.equal(initialApply.status, 200);
  assert.equal(initialApply.body.importMode, "full_import");

  const csv = [
    "Liquida;Operado;Comprobante;Numero;Cantidad;Especie;Precio;Importe;Saldo;Referencia",
    "17/04/2026;17/04/2026;VENTA;1;-3,000000;V;25509,100000;76527,30;0,00;",
    "24/04/2026;24/04/2026;VENTA;2;-9,000000;XOM;21823,788889;196414,10;0,00;",
    "28/04/2026;28/04/2026;VENTA;3;-6,000000;GOOGL;9004,671667;54028,03;0,00;",
    "28/04/2026;28/04/2026;VENTA;4;-4,000000;V;26124,972500;104499,89;0,00;",
  ].join("\n");

  const preview = await request(app)
    .post("/api/portfolio/history/preview")
    .set(await authHeader())
    .send({
      broker: "bull_market",
      csv,
      sourceName: "Cuenta Corriente PESOS 29-04-26.xlsx",
    });

  assert.equal(preview.status, 200);
  assert.equal(preview.body.importMode, "delta_backfill");
  assert.equal(preview.body.candidateSummary.tradeRows, 4);
  assert.equal(preview.body.dbState.latestTransactionDate, "2026-04-08");

  const apply = await request(app)
    .post("/api/portfolio/history/apply")
    .set(await authHeader())
    .send({
      broker: "bull_market",
      csv,
      sourceName: "Cuenta Corriente PESOS 29-04-26.xlsx",
    });

  assert.equal(apply.status, 200);
  assert.equal(apply.body.importMode, "delta_backfill");
  assert.equal(apply.body.imported.transactionsImported, 4);

  const portfolioRes = await request(app)
    .get("/api/portfolio/db")
    .set(await authHeader());

  assert.equal(portfolioRes.status, 200);
  assert.ok(portfolioRes.body.summary.some((row) => row.ticker === "SPY" && Number(row.total_shares) === 27));
  assert.ok(!portfolioRes.body.summary.some((row) => row.ticker === "V"));
  assert.ok(!portfolioRes.body.summary.some((row) => row.ticker === "XOM"));
  assert.ok(!portfolioRes.body.summary.some((row) => row.ticker === "GOOGL"));
});
