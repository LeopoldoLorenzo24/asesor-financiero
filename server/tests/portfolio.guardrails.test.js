import test from "node:test";
import assert from "node:assert/strict";
import { buildNewExposureBlocker } from "../routes/portfolio.js";

test("buildNewExposureBlocker bloquea si el preflight no habilita trading nuevo", () => {
  const result = buildNewExposureBlocker({
    preflight: {
      status: "blocked",
      blocksNewTrading: true,
      summary: "Falta el preflight operativo de hoy; no abrir posiciones nuevas.",
    },
    dataIntegrity: {
      mustStandAside: false,
      summary: "OK",
    },
  });

  assert.ok(result);
  assert.equal(result.error, "Falta el preflight operativo de hoy; no abrir posiciones nuevas.");
  assert.equal(result.readiness.preflight.status, "blocked");
});

test("buildNewExposureBlocker bloquea si la integridad de datos obliga stand aside", () => {
  const result = buildNewExposureBlocker({
    preflight: {
      status: "ready",
      blocksNewTrading: false,
      summary: "Preflight listo.",
    },
    dataIntegrity: {
      mustStandAside: true,
      summary: "La integridad de datos no habilita trading nuevo.",
    },
  });

  assert.ok(result);
  assert.equal(result.error, "La integridad de datos no habilita trading nuevo.");
  assert.equal(result.readiness.dataIntegrity.mustStandAside, true);
});

test("buildNewExposureBlocker permite operar cuando readiness esta habilitado", () => {
  const result = buildNewExposureBlocker({
    preflight: {
      status: "ready",
      blocksNewTrading: false,
      summary: "Preflight listo.",
    },
    dataIntegrity: {
      mustStandAside: false,
      summary: "OK",
    },
  });

  assert.equal(result, null);
});
