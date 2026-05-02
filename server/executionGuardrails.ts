import { calculateRoundTripCosts, isTradeViable } from "./brokerCosts.js";
import { toFiniteNumber } from "./utils.js";

export interface ExecutionLiquidityProfile {
  avgDailyValueUsd: number;
  marketImpactPct: number;
}

export interface ExecutionGuardrailResult {
  allowed: boolean;
  notes: string[];
  warnings: string[];
  requiredTargetPct: number;
}

export function evaluatePickExecutionReadiness({
  ticker,
  amountArs,
  targetPct,
  cclRate,
  liquidityProfile = null,
  brokerKey = "default",
}: {
  ticker: string;
  amountArs: number;
  targetPct: number;
  cclRate: number;
  liquidityProfile?: ExecutionLiquidityProfile | null;
  brokerKey?: string;
}): ExecutionGuardrailResult {
  const notes: string[] = [];
  const warnings: string[] = [];
  const grossAmountArs = Math.max(0, toFiniteNumber(amountArs, 0));
  const expectedTargetPct = toFiniteNumber(targetPct, 0);
  const roundTrip = calculateRoundTripCosts(grossAmountArs, brokerKey);
  const viability = isTradeViable(grossAmountArs, expectedTargetPct, brokerKey);

  // Real-money margin of safety: target should beat break-even by a visible margin.
  let requiredTargetPct = Math.max(4, roundTrip.requiredReturnToBreakEvenPct * 1.75);

  if (!viability.viable) {
    notes.push(`${ticker}: trade no viable por costos. ${viability.reason}`);
  }

  const tradeUsd = cclRate > 0 ? grossAmountArs / cclRate : 0;
  if (liquidityProfile && tradeUsd > 0) {
    const advUsd = toFiniteNumber(liquidityProfile.avgDailyValueUsd, 0);
    const impactBase = toFiniteNumber(liquidityProfile.marketImpactPct, 0);
    const advPct = advUsd > 0 ? (tradeUsd / advUsd) * 100 : 0;
    const impactPct = impactBase * (tradeUsd / 10_000);

    if (advPct > 10) {
      notes.push(`${ticker}: la orden representa ${advPct.toFixed(1)}% del volumen diario estimado. Riesgo de ejecución demasiado alto.`);
    } else if (advPct > 3) {
      warnings.push(`${ticker}: orden grande para su liquidez (${advPct.toFixed(1)}% del ADV).`);
    }

    if (impactPct > 0.75) {
      requiredTargetPct = Math.max(requiredTargetPct, roundTrip.requiredReturnToBreakEvenPct + impactPct + 2);
      warnings.push(`${ticker}: impacto estimado ${impactPct.toFixed(2)}%.`);
    }
  }

  if (expectedTargetPct < requiredTargetPct) {
    notes.push(`${ticker}: target ${expectedTargetPct}% insuficiente para costos/ejecución. Mínimo requerido ${requiredTargetPct.toFixed(2)}%.`);
  }

  return {
    allowed: notes.length === 0,
    notes,
    warnings,
    requiredTargetPct: Math.round(requiredTargetPct * 100) / 100,
  };
}

export function applyExecutionGuardrails({
  picks,
  cclRate,
  liquidityProfiles = {},
  brokerKey = "default",
}: {
  picks: any[];
  cclRate: number;
  liquidityProfiles?: Record<string, ExecutionLiquidityProfile | null | undefined>;
  brokerKey?: string;
}) {
  const executionNotes: string[] = [];
  const executionWarnings: string[] = [];
  const sanitizedPicks: any[] = [];

  for (const pick of picks || []) {
    const ticker = String(pick?.ticker || "").toUpperCase();
    if (!ticker) continue;

    const result = evaluatePickExecutionReadiness({
      ticker,
      amountArs: toFiniteNumber(pick?.monto_total_ars, 0),
      targetPct: toFiniteNumber(pick?.target_pct, 0),
      cclRate: toFiniteNumber(cclRate, 0),
      liquidityProfile: liquidityProfiles[ticker] || null,
      brokerKey,
    });

    if (result.allowed) {
      pick._execution_required_target_pct = result.requiredTargetPct;
      if (result.warnings.length > 0) {
        pick._execution_warning = result.warnings.join(" | ");
        executionWarnings.push(...result.warnings);
      }
      sanitizedPicks.push(pick);
    } else {
      executionNotes.push(...result.notes);
    }
  }

  return {
    sanitizedPicks,
    executionNotes: [...new Set(executionNotes)],
    executionWarnings: [...new Set(executionWarnings)],
  };
}
