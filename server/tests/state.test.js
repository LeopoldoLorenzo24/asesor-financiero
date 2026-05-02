import test from "node:test";
import assert from "node:assert/strict";
import { appState } from "../state.js";

test("appState guarda cooldowns por clave independiente", () => {
  appState.setLastAnalysisTimestamp("user:1", 1000);
  appState.setLastAnalysisTimestamp("user:2", 2000);

  assert.equal(appState.getLastAnalysisTimestamp("user:1"), 1000);
  assert.equal(appState.getLastAnalysisTimestamp("user:2"), 2000);
  assert.equal(appState.getLastAnalysisTimestamp("user:3"), 0);
});
