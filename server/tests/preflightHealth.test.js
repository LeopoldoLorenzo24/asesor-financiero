import test from "node:test";
import assert from "node:assert/strict";
import { assessPreflightReadiness, getPreflightWindowState } from "../preflightPolicy.js";

test("getPreflightWindowState detecta ventana elegible antes de apertura", () => {
  const date = new Date("2026-05-04T12:30:00.000Z");
  const result = getPreflightWindowState({
    timezone: "America/Argentina/Buenos_Aires",
    marketOpenLocal: "10:30",
  }, date);

  assert.equal(result.runDateLocal, "2026-05-04");
  assert.equal(result.windowStartLocal, "09:15");
  assert.equal(result.windowEndLocal, "10:45");
  assert.equal(result.isEligibleNow, true);
});

test("getPreflightWindowState evita correr en fin de semana", () => {
  const date = new Date("2026-05-03T12:30:00.000Z");
  const result = getPreflightWindowState({
    timezone: "America/Argentina/Buenos_Aires",
    marketOpenLocal: "10:30",
  }, date);

  assert.equal(result.isWeekend, true);
  assert.equal(result.isEligibleNow, false);
});

test("assessPreflightReadiness bloquea durante sesion si falta preflight de hoy", () => {
  const result = assessPreflightReadiness({
    latestRun: null,
    settings: {
      timezone: "America/Argentina/Buenos_Aires",
      marketOpenLocal: "10:30",
      marketCloseLocal: "17:00",
    },
    date: new Date("2026-05-04T13:45:00.000Z"),
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.blocksNewTrading, true);
});

test("assessPreflightReadiness queda ready con preflight ready del mismo dia", () => {
  const result = assessPreflightReadiness({
    latestRun: { runDateLocal: "2026-05-04", status: "ready" },
    settings: {
      timezone: "America/Argentina/Buenos_Aires",
      marketOpenLocal: "10:30",
      marketCloseLocal: "17:00",
    },
    date: new Date("2026-05-04T13:45:00.000Z"),
  });

  assert.equal(result.status, "ready");
  assert.equal(result.blocksNewTrading, false);
});
