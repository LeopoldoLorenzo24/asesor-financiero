import { getAiUsageSummary, getTodayAiCostUsd, logAiUsage } from "./database.js";

const MODEL_PRICING_PER_1M = {
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-3-7-sonnet-20250219": { input: 3, output: 15 },
};

function getPricing(model) {
  return MODEL_PRICING_PER_1M[model] || { input: 3, output: 15 };
}

function parseUsage(usage = {}) {
  const inputBase = Number(usage.input_tokens ?? usage.inputTokens ?? 0);
  const cacheCreation = Number(usage.cache_creation_input_tokens ?? 0);
  const cacheRead = Number(usage.cache_read_input_tokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? usage.outputTokens ?? 0);
  const inputTokens = inputBase + cacheCreation + cacheRead;
  const totalTokens = Number(
    usage.total_tokens ?? usage.totalTokens ?? inputTokens + outputTokens
  );
  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

function estimateCostUsd(model, inputTokens, outputTokens) {
  const pricing = getPricing(model);
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

export function getAiDailyBudgetUsd() {
  const budget = parseFloat(process.env.AI_DAILY_BUDGET_USD || "0");
  return Number.isFinite(budget) && budget > 0 ? budget : 0;
}

export async function getAiBudgetStatus() {
  const todayCostUsd = await getTodayAiCostUsd();
  const dailyBudgetUsd = getAiDailyBudgetUsd();
  const hasBudget = dailyBudgetUsd > 0;
  const remainingUsd = hasBudget ? Math.max(0, dailyBudgetUsd - todayCostUsd) : null;
  const usagePct = hasBudget && dailyBudgetUsd > 0
    ? Math.round((todayCostUsd / dailyBudgetUsd) * 10000) / 100
    : null;

  return {
    todayCostUsd: Math.round(todayCostUsd * 10000) / 10000,
    dailyBudgetUsd: hasBudget ? dailyBudgetUsd : null,
    remainingUsd,
    usagePct,
    hasBudget,
    exceeded: hasBudget ? todayCostUsd >= dailyBudgetUsd : false,
  };
}

export async function assertAiBudgetAvailable(route = "unknown") {
  const budget = await getAiBudgetStatus();
  if (budget.exceeded) {
    throw new Error(
      `Límite diario de costo IA alcanzado para hoy (${budget.todayCostUsd} USD / ${budget.dailyBudgetUsd} USD) en ${route}.`
    );
  }
  return budget;
}

export async function recordAnthropicUsage({
  route,
  model,
  response = null,
  latencyMs = null,
  success = true,
  errorMessage = null,
}) {
  const usage = parseUsage(response?.usage || {});
  const estimatedCostUsd = estimateCostUsd(model, usage.inputTokens, usage.outputTokens);

  try {
    await logAiUsage({
      route,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimatedCostUsd,
      latencyMs: latencyMs != null ? Math.round(latencyMs) : null,
      success,
      errorMessage: errorMessage ? String(errorMessage).slice(0, 800) : null,
    });
  } catch (err) {
    console.error("[ai-usage] Error guardando uso IA:", err.message);
  }
}

export async function getAiUsageReport(days = 30) {
  const [summary, budget] = await Promise.all([
    getAiUsageSummary(days),
    getAiBudgetStatus(),
  ]);
  return { summary, budget };
}
