import test from "node:test";
import assert from "node:assert/strict";

import { runAiAnalyzeSelfCheck } from "../selfCheck.js";

test("self-check del análisis devuelve estructura válida", async () => {
  const prevMode = process.env.AI_SELF_CHECK_MODE;
  process.env.AI_SELF_CHECK_MODE = "warn";

  const result = await runAiAnalyzeSelfCheck({ force: true });
  assert.equal(typeof result.ok, "boolean");
  assert.equal(result.mode, "warn");
  assert.ok(Array.isArray(result.checks));
  assert.ok(Array.isArray(result.failedChecks));

  process.env.AI_SELF_CHECK_MODE = prevMode;
});
