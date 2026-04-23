import { technicalAnalysis, fundamentalAnalysis, compositeScore } from "./analysis.js";
import { extractJSON } from "./aiAdvisor.js";

let lastRunAt = 0;
let lastResult = null;

function buildSyntheticHistory(days = 90) {
  const rows = [];
  let base = 100;
  for (let i = 0; i < days; i++) {
    const drift = Math.sin(i / 7) * 0.6 + 0.25;
    base = Math.max(10, base + drift);
    const close = Math.round(base * 100) / 100;
    const high = Math.round((close * 1.01) * 100) / 100;
    const low = Math.round((close * 0.99) * 100) / 100;
    const open = Math.round(((high + low) / 2) * 100) / 100;
    rows.push({
      date: new Date(Date.now() - (days - i) * 86400000).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: 100000 + i * 200,
    });
  }
  return rows;
}

function getCooldownMs() {
  const min = parseInt(process.env.AI_SELF_CHECK_COOLDOWN_MIN || "30", 10);
  const safeMin = Number.isFinite(min) && min >= 0 ? min : 30;
  return safeMin * 60 * 1000;
}

export async function runAiAnalyzeSelfCheck({ force = false } = {}) {
  const mode = String(process.env.AI_SELF_CHECK_MODE || "warn").toLowerCase();
  if (mode === "off") {
    return {
      ok: true,
      mode,
      skipped: true,
      reason: "disabled",
      ranAt: new Date().toISOString(),
      checks: [],
      failedChecks: [],
    };
  }

  const now = Date.now();
  const cooldownMs = getCooldownMs();
  if (!force && lastResult && now - lastRunAt < cooldownMs) {
    return {
      ...lastResult,
      skipped: true,
      reason: "cooldown",
      cacheAgeSec: Math.floor((now - lastRunAt) / 1000),
    };
  }

  const checks = [];

  try {
    const sample = "texto```json\n{\"ok\":true,\"n\":1,}\n```<cite>r</cite>";
    const parsed = JSON.parse(extractJSON(sample));
    const ok = parsed.ok === true && parsed.n === 1;
    checks.push({
      name: "extract_json",
      ok,
      detail: ok ? "parsed" : "invalid parsed output",
    });
  } catch (err) {
    checks.push({ name: "extract_json", ok: false, detail: err.message });
  }

  try {
    const history = buildSyntheticHistory(100);
    const tech = technicalAnalysis(history);
    const fund = fundamentalAnalysis(
      {
        pe: 20,
        forwardPE: 18,
        epsGrowth: 12,
        revenueGrowth: 7,
        profitMargin: 18,
        returnOnEquity: 16,
        debtToEquity: 40,
      },
      {
        price: history[history.length - 1].close,
        trailingPE: 20,
        forwardPE: 18,
        beta: 1.1,
        dividendYield: 2.1,
      }
    );
    const score = compositeScore(
      tech,
      fund,
      { beta: 1.1 },
      "Technology",
      "moderate"
    );
    const ok =
      Number.isFinite(tech.score) &&
      Number.isFinite(fund.score) &&
      Number.isFinite(score.composite) &&
      score.composite >= 0 &&
      score.composite <= 100;
    checks.push({
      name: "analysis_engine",
      ok,
      detail: ok ? `score=${score.composite}` : "non-finite or out-of-range score",
    });
  } catch (err) {
    checks.push({ name: "analysis_engine", ok: false, detail: err.message });
  }

  const failedChecks = checks.filter((c) => !c.ok);
  const result = {
    ok: failedChecks.length === 0,
    mode,
    skipped: false,
    ranAt: new Date().toISOString(),
    checks,
    failedChecks: failedChecks.map((c) => c.name),
  };

  lastRunAt = now;
  lastResult = result;
  return result;
}
