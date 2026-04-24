const DEFAULT_OVERLAY_KEY = "system_default";
const DEFAULT_DEPLOYMENT_MODE = "system_auto";

export const GOVERNANCE_BASE_POLICY = {
  version: "2026-04-24",
  cooldownDays: 7,
  thresholds: {
    evaluatedPredictions: 50,
    winRateVsSpyPct: 60,
    averageAlphaPct: 2,
    trackRecordDays: 90,
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
