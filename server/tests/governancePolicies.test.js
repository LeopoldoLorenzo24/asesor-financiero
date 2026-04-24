import test from "node:test";
import assert from "node:assert/strict";

import {
  applyGovernanceSelectionToCapitalPolicy,
  buildEffectiveGovernancePolicy,
  getGovernanceCooldownStatus,
} from "../governancePolicies.js";

test("buildEffectiveGovernancePolicy aplica overrides del overlay estricto", () => {
  const policy = buildEffectiveGovernancePolicy({
    overlayKey: "capital_preservation",
    deploymentMode: "system_auto",
  });

  assert.equal(policy.thresholds.maxDrawdownPct, 12);
  assert.equal(policy.thresholds.sharpeRatio, 1.2);
  assert.equal(policy.deployment.maxCapitalPctCap, 25);
});

test("applyGovernanceSelectionToCapitalPolicy recorta el capital con deployment mode", () => {
  const policy = buildEffectiveGovernancePolicy({
    overlayKey: "system_default",
    deploymentMode: "pilot",
  });
  const capitalPolicy = applyGovernanceSelectionToCapitalPolicy({
    paperTradingOnly: false,
    maxCapitalPct: 50,
    stage: "scaled",
    summary: "ready",
  }, policy);

  assert.equal(capitalPolicy.maxCapitalPct, 10);
  assert.equal(capitalPolicy.stage, "pilot");
});

test("getGovernanceCooldownStatus detecta cooldown activo", () => {
  const updatedAt = new Date(Date.now() - 2 * 86400000).toISOString();
  const cooldown = getGovernanceCooldownStatus(updatedAt);
  assert.equal(cooldown.active, true);
  assert.ok(cooldown.remainingDays >= 4);
});
