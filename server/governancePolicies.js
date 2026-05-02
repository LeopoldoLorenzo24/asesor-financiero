const DEFAULT_OVERLAY_KEY = "system_default";
const DEFAULT_DEPLOYMENT_MODE = "system_auto";

export const GOVERNANCE_BASE_POLICY = {
  version: "2026-04-24",
  cooldownDays: 14,
  thresholds: {
    evaluatedPredictions: 50,
    winRateVsSpyPct: 60,
    averageAlphaPct: 2,
    trackRecordDays: 180,
    trackRecordAlphaPct: 3,
    maxDrawdownPct: 15,
    sharpeRatio: 1.0,
    auditCoveragePct: 90,
    adherenceSampleSize: 10,
    adherenceResolutionPct: 80,
    adherenceMaxDiscrepancyPct: 20,
  },
  deployment: {
    maxCapitalPctCap: 100,
  },
};

export const GOVERNANCE_POLICY_OVERLAYS = {
  system_default: {
    key: "system_default",
    name: "System Default",
    description: "Usa el piso de seguridad y evidencia definido por el sistema sin endurecerlo.",
    strictness: "neutral",
    overrides: {},
  },
  capital_preservation: {
    key: "capital_preservation",
    name: "Capital Preservation",
    description: "Sube los requisitos de riesgo y recorta el capital habilitado para proteger drawdown.",
    strictness: "strict",
    overrides: {
      thresholds: {
        averageAlphaPct: 3,
        trackRecordAlphaPct: 5,
        maxDrawdownPct: 12,
        sharpeRatio: 1.2,
        auditCoveragePct: 95,
        adherenceResolutionPct: 90,
        adherenceMaxDiscrepancyPct: 15,
      },
      deployment: {
        maxCapitalPctCap: 25,
      },
    },
  },
  evidence_first: {
    key: "evidence_first",
    name: "Evidence First",
    description: "Exige más muestra y más trazabilidad antes de escalar. Prioriza validación por sobre velocidad.",
    strictness: "strict",
    overrides: {
      thresholds: {
        evaluatedPredictions: 100,
        trackRecordDays: 180,
        auditCoveragePct: 95,
        adherenceSampleSize: 20,
        adherenceResolutionPct: 90,
        adherenceMaxDiscrepancyPct: 15,
      },
      deployment: {
        maxCapitalPctCap: 10,
      },
    },
  },
  benchmark_guardrail: {
    key: "benchmark_guardrail",
    name: "Benchmark Guardrail",
    description: "Solo escala cuando la evidencia de alfa vs SPY es claramente superior al mínimo del sistema.",
    strictness: "strict",
    overrides: {
      thresholds: {
        winRateVsSpyPct: 63,
        averageAlphaPct: 3,
        trackRecordAlphaPct: 6,
        sharpeRatio: 1.15,
      },
      deployment: {
        maxCapitalPctCap: 25,
      },
    },
  },
};

export const DEPLOYMENT_MODE_OPTIONS = {
  system_auto: {
    key: "system_auto",
    name: "System Auto",
    description: "Respeta el capital máximo que habilite el readiness sin recortes manuales.",
    maxCapitalPctCap: 100,
    forcesPaperOnly: false,
  },
  scaled: {
    key: "scaled",
    name: "Scaled",
    description: "Permite como máximo 50% del capital libre aunque el sistema habilite más.",
    maxCapitalPctCap: 50,
    forcesPaperOnly: false,
  },
  cautious: {
    key: "cautious",
    name: "Cautious",
    description: "Recorta el despliegue a 25% del capital libre.",
    maxCapitalPctCap: 25,
    forcesPaperOnly: false,
  },
  pilot: {
    key: "pilot",
    name: "Pilot",
    description: "Recorta el despliegue a 10% del capital libre para validación controlada.",
    maxCapitalPctCap: 10,
    forcesPaperOnly: false,
  },
  paper_only: {
    key: "paper_only",
    name: "Paper Only",
    description: "Bloquea cualquier capital real aunque el sistema esté listo.",
    maxCapitalPctCap: 0,
    forcesPaperOnly: true,
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeGovernanceSelection(selection = {}) {
  const overlayKey = GOVERNANCE_POLICY_OVERLAYS[selection.overlayKey]
    ? selection.overlayKey
    : DEFAULT_OVERLAY_KEY;
  const deploymentMode = DEPLOYMENT_MODE_OPTIONS[selection.deploymentMode]
    ? selection.deploymentMode
    : DEFAULT_DEPLOYMENT_MODE;
  return {
    overlayKey,
    deploymentMode,
  };
}

export function buildEffectiveGovernancePolicy(selection = {}) {
  const normalized = normalizeGovernanceSelection(selection);
  const overlay = GOVERNANCE_POLICY_OVERLAYS[normalized.overlayKey];
  const deploymentMode = DEPLOYMENT_MODE_OPTIONS[normalized.deploymentMode];
  const effective = clone(GOVERNANCE_BASE_POLICY);

  if (overlay?.overrides?.thresholds) {
    Object.assign(effective.thresholds, overlay.overrides.thresholds);
  }
  if (overlay?.overrides?.deployment) {
    Object.assign(effective.deployment, overlay.overrides.deployment);
  }

  effective.selection = normalized;
  effective.overlay = overlay;
  effective.deploymentMode = deploymentMode;
  return effective;
}

export function getGovernancePolicyCatalog() {
  return {
    basePolicy: clone(GOVERNANCE_BASE_POLICY),
    overlays: Object.values(GOVERNANCE_POLICY_OVERLAYS).map((overlay) => ({
      key: overlay.key,
      name: overlay.name,
      description: overlay.description,
      strictness: overlay.strictness,
      overrides: clone(overlay.overrides || {}),
    })),
    deploymentModes: Object.values(DEPLOYMENT_MODE_OPTIONS).map((mode) => ({
      key: mode.key,
      name: mode.name,
      description: mode.description,
      maxCapitalPctCap: mode.maxCapitalPctCap,
      forcesPaperOnly: mode.forcesPaperOnly,
    })),
  };
}

export function getGovernanceCooldownStatus(updatedAt) {
  const cooldownDays = GOVERNANCE_BASE_POLICY.cooldownDays;
  if (!updatedAt) {
    return {
      active: false,
      cooldownDays,
      remainingDays: 0,
      nextChangeAt: null,
    };
  }

  const lastUpdatedMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(lastUpdatedMs)) {
    return {
      active: false,
      cooldownDays,
      remainingDays: 0,
      nextChangeAt: null,
    };
  }

  const nextChangeAtMs = lastUpdatedMs + cooldownDays * 86400000;
  const remainingMs = nextChangeAtMs - Date.now();
  return {
    active: remainingMs > 0,
    cooldownDays,
    remainingDays: remainingMs > 0 ? Math.ceil(remainingMs / 86400000) : 0,
    nextChangeAt: new Date(nextChangeAtMs).toISOString(),
  };
}

export function stageFromCapitalPct(maxCapitalPct) {
  if (maxCapitalPct <= 0) return "paper_only";
  if (maxCapitalPct >= 100) return "full";
  if (maxCapitalPct >= 50) return "scaled";
  if (maxCapitalPct >= 25) return "cautious";
  if (maxCapitalPct >= 10) return "pilot";
  return "minimal";
}

export function applyGovernanceSelectionToCapitalPolicy(capitalPolicy, effectivePolicy) {
  const selection = effectivePolicy?.selection || normalizeGovernanceSelection();
  const overlay = effectivePolicy?.overlay || GOVERNANCE_POLICY_OVERLAYS[DEFAULT_OVERLAY_KEY];
  const deploymentMode = effectivePolicy?.deploymentMode || DEPLOYMENT_MODE_OPTIONS[DEFAULT_DEPLOYMENT_MODE];
  const original = capitalPolicy || {
    paperTradingOnly: true,
    maxCapitalPct: 0,
    stage: "paper_only",
    summary: "Solo paper trading. No hay permiso para capital real todavía.",
  };

  if (deploymentMode.forcesPaperOnly) {
    return {
      ...original,
      paperTradingOnly: true,
      maxCapitalPct: 0,
      stage: "paper_only",
      summary: `Paper only forzado por la política seleccionada (${deploymentMode.name}).`,
      systemMaxCapitalPct: original.maxCapitalPct,
      userMaxCapitalPctCap: 0,
      overlayKey: selection.overlayKey,
      deploymentMode: selection.deploymentMode,
      overlayName: overlay.name,
    };
  }

  const overlayCap = Number(effectivePolicy?.deployment?.maxCapitalPctCap ?? 100);
  const modeCap = Number(deploymentMode.maxCapitalPctCap ?? 100);
  const effectiveCap = Math.min(
    Number(original.maxCapitalPct ?? 0),
    overlayCap,
    modeCap
  );

  return {
    ...original,
    paperTradingOnly: original.paperTradingOnly || effectiveCap <= 0,
    maxCapitalPct: effectiveCap,
    stage: stageFromCapitalPct(effectiveCap),
    summary: original.paperTradingOnly || effectiveCap <= 0
      ? original.summary
      : `Capital real permitido con tope efectivo de ${effectiveCap}% del capital libre. Overlay: ${overlay.name}. Modo: ${deploymentMode.name}.`,
    systemMaxCapitalPct: Number(original.maxCapitalPct ?? 0),
    userMaxCapitalPctCap: Math.min(overlayCap, modeCap),
    overlayKey: selection.overlayKey,
    deploymentMode: selection.deploymentMode,
    overlayName: overlay.name,
  };
}

export function describeGovernanceSelection(selection, updatedAt = null) {
  const normalized = normalizeGovernanceSelection(selection);
  const overlay = GOVERNANCE_POLICY_OVERLAYS[normalized.overlayKey];
  const deploymentMode = DEPLOYMENT_MODE_OPTIONS[normalized.deploymentMode];
  return {
    ...normalized,
    overlayName: overlay.name,
    deploymentModeName: deploymentMode.name,
    overlayDescription: overlay.description,
    deploymentModeDescription: deploymentMode.description,
    updatedAt,
  };
}

// ── DEPLOYMENT MODE HIERARCHY (ordered from most permissive to most restrictive) ──
const MODE_HIERARCHY = ['system_auto', 'scaled', 'cautious', 'pilot', 'paper_only'];

/**
 * Determines if the system should automatically downgrade the deployment mode
 * based on trailing performance metrics. This is a safety mechanism that
 * protects capital when the model is underperforming.
 *
 * Downgrade Rules (any single trigger is sufficient):
 * 1. Alpha < 0 for trailing 30d AND current mode > 'pilot' → downgrade one level
 * 2. Alpha < -5% trailing 30d → downgrade to 'paper_only' immediately
 * 3. maxDrawdown30d > -15% → downgrade to 'paper_only' immediately
 * 4. winRate30d < 40% with >10 predictions → downgrade one level
 * 5. sharpe30d < 0.3 → downgrade one level
 *
 * Cooldown: will not downgrade more than once per 14 days.
 *
 * @param {{ deploymentMode: string, lastDowngradeAt?: string|null }} currentSelection - Current governance selection
 * @param {{ trailingAlpha30d: number, winRate30d: number, maxDrawdown30d: number, sharpe30d: number, predictionCount30d?: number }} metrics - Trailing 30-day performance metrics
 * @returns {{ shouldDowngrade: boolean, newMode: string, reason: string, rules: string[] }}
 */
export function checkAutoDowngrade(currentSelection, metrics) {
  const currentMode = currentSelection?.deploymentMode || 'system_auto';
  const lastDowngrade = currentSelection?.lastDowngradeAt;
  const cooldownDays = GOVERNANCE_BASE_POLICY.cooldownDays; // 14 days
  const result = {
    shouldDowngrade: false,
    newMode: currentMode,
    reason: '',
    rules: [],
  };

  // Respect cooldown: don't downgrade more than once per cooldownDays
  if (lastDowngrade) {
    const lastMs = new Date(lastDowngrade).getTime();
    if (Number.isFinite(lastMs)) {
      const daysSince = (Date.now() - lastMs) / 86400000;
      if (daysSince < cooldownDays) {
        result.reason = `Cooldown activo: último downgrade hace ${Math.round(daysSince)} días (mínimo ${cooldownDays}).`;
        return result;
      }
    }
  }

  if (!metrics) return result;

  const currentIdx = MODE_HIERARCHY.indexOf(currentMode);
  if (currentIdx === -1 || currentIdx >= MODE_HIERARCHY.length - 1) {
    // Already at paper_only or unknown mode — can't downgrade further
    return result;
  }

  let targetIdx = currentIdx;
  const triggeredRules = [];

  // Rule 2 (checked first — immediate paper_only override)
  if (metrics.trailingAlpha30d != null && metrics.trailingAlpha30d < -5) {
    targetIdx = MODE_HIERARCHY.length - 1; // paper_only
    triggeredRules.push(`Alpha trailing 30d (${metrics.trailingAlpha30d.toFixed(2)}%) < -5% → paper_only inmediato`);
  }

  // Rule 3 (immediate paper_only override)
  if (metrics.maxDrawdown30d != null && metrics.maxDrawdown30d < -15) {
    targetIdx = MODE_HIERARCHY.length - 1; // paper_only
    triggeredRules.push(`Max drawdown 30d (${metrics.maxDrawdown30d.toFixed(2)}%) > -15% → paper_only inmediato`);
  }

  // Rule 1: alpha < 0 AND mode > pilot → downgrade one level
  if (metrics.trailingAlpha30d != null && metrics.trailingAlpha30d < 0 && currentIdx < MODE_HIERARCHY.indexOf('pilot')) {
    const oneDown = currentIdx + 1;
    if (oneDown > targetIdx) { /* already going further down */ }
    else targetIdx = Math.max(targetIdx, oneDown);
    triggeredRules.push(`Alpha trailing 30d (${metrics.trailingAlpha30d.toFixed(2)}%) < 0 → downgrade un nivel`);
  }

  // Rule 4: winRate < 40% with enough predictions
  const predCount = metrics.predictionCount30d || 0;
  if (metrics.winRate30d != null && metrics.winRate30d < 40 && predCount > 10) {
    const oneDown = currentIdx + 1;
    targetIdx = Math.max(targetIdx, oneDown);
    triggeredRules.push(`Win rate 30d (${metrics.winRate30d.toFixed(1)}%) < 40% con ${predCount} predicciones → downgrade un nivel`);
  }

  // Rule 5: sharpe < 0.3
  if (metrics.sharpe30d != null && metrics.sharpe30d < 0.3) {
    const oneDown = currentIdx + 1;
    targetIdx = Math.max(targetIdx, oneDown);
    triggeredRules.push(`Sharpe 30d (${metrics.sharpe30d.toFixed(2)}) < 0.3 → downgrade un nivel`);
  }

  // Clamp to valid range
  targetIdx = Math.min(targetIdx, MODE_HIERARCHY.length - 1);

  if (targetIdx > currentIdx) {
    result.shouldDowngrade = true;
    result.newMode = MODE_HIERARCHY[targetIdx];
    result.reason = `Auto-downgrade de ${currentMode} a ${result.newMode} por bajo rendimiento.`;
    result.rules = triggeredRules;
  }

  return result;
}
