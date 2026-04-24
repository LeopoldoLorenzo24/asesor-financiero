import test from "node:test";
import assert from "node:assert/strict";

import { parseBrokerSnapshotCsv, parseBrokerImportPayload } from "../brokerImport.js";

test("parseBrokerSnapshotCsv soporta CSV con punto y coma, columnas en USD y coma decimal", () => {
  const csv = [
    "Producto;Cantidad;PPC USD",
    "SPY;4;34,74",
    "QQQ;2;45,50",
  ].join("\n");

  const rows = parseBrokerSnapshotCsv(csv, 1500);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].ticker, "QQQ");
  assert.equal(rows[1].ticker, "SPY");
  assert.equal(rows.find((row) => row.ticker === "SPY").priceArs, 52110);
});

test("parseBrokerImportPayload agrega filas repetidas del mismo ticker", () => {
  const rows = parseBrokerImportPayload({
    positions: [
      { ticker: "SPY", shares: 2, priceArs: 1000 },
      { ticker: "SPY", shares: 3, priceArs: 1200 },
    ],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].ticker, "SPY");
  assert.equal(rows[0].shares, 5);
  assert.equal(rows[0].priceArs, 1120);
});

test("parseBrokerImportPayload falla con ticker fuera del universo", () => {
  assert.throws(() => {
    parseBrokerImportPayload({
      positions: [{ ticker: "FAKE99", shares: 1, priceArs: 1000 }],
    });
  }, /no pertenece al universo/i);
});

test("parseBrokerSnapshotCsv soporta layout Bull Market con PPC en ARS", () => {
  const csv = [
    "Simbolo;Producto;Cantidad;Ultimo Precio;PPC;Total",
    "SPY;CEDEAR SPDR S&P 500;27;52750,00;49799,60;1424250,00",
    "XOM;CEDEAR EXXON;9;22240,00;24487,85;200160,00",
  ].join("\n");

  const rows = parseBrokerSnapshotCsv(csv, null, "bull_market");
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.ticker === "SPY").shares, 27);
  assert.equal(rows.find((row) => row.ticker === "SPY").priceArs, 49799.6);
  assert.equal(rows.find((row) => row.ticker === "XOM").priceArs, 24487.85);
});

test("parseBrokerSnapshotCsv Bull Market puede derivar precio desde Total/Cantidad", () => {
  const csv = [
    "Simbolo;Producto;Cantidad;Ultimo Precio;Total",
    "GOOGL;CEDEAR ALPHABET INC.;6;8620,00;51720,00",
  ].join("\n");

  const rows = parseBrokerSnapshotCsv(csv, null, "bull_market");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ticker, "GOOGL");
  assert.equal(rows[0].priceArs, 8620);
});
