import { dispatchAlerts } from "./alerting.js";

const MAX_EVENTS = 2000;
const ALERT_EVAL_INTERVAL_MS = 30 * 1000;

interface ObservabilityEvent { at: number; type: string; [key: string]: unknown }
interface RouteMetrics { calls: number; errors5xx: number; totalLatencyMs: number; avgLatencyMs: number; p95ApproxMs: number; samples: number[] }
interface CacheMetrics { hits: number; misses: number; hitRatePct: number }
interface SelfCheckResult { ok: boolean; failedChecks?: string[]; ranAt?: string; mode?: string | null }
interface Alert { level: "warning" | "critical"; code: string; message: string }

const state: {
  startedAt: string;
  totalRequests: number;
  totalErrors: number;
  byRoute: Record<string, RouteMetrics>;
  byStatus: Record<string, number>;
  cache: Record<string, CacheMetrics>;
  selfChecks: { total: number; failed: number; last: { at: string; ok: boolean; failedChecks: string[]; mode: string | null } | null };
  recentEvents: ObservabilityEvent[];
} = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  totalErrors: 0,
  byRoute: {},
  byStatus: {},
  cache: {},
  selfChecks: { total: 0, failed: 0, last: null },
  recentEvents: [],
};

let lastAlertEvalAt = 0;

function pushEvent(event: { type: string; [key: string]: unknown }) {
  state.recentEvents.push({ at: Date.now(), ...event });
  if (state.recentEvents.length > MAX_EVENTS) {
    state.recentEvents.splice(0, state.recentEvents.length - MAX_EVENTS);
  }
}

function normPath(path = "") {
  return String(path || "").split("?")[0];
}

function buildAlerts({ aiBudget = null as { hasBudget: boolean; usagePct: number; dailyBudgetUsd: number; todayCostUsd?: number } | null, aiUsageTodayUsd = null as number | null } = {}) {
  const last10Min = Date.now() - 10 * 60 * 1000;
  const recent = state.recentEvents.filter((e) => e.at >= last10Min && e.type === "http");
  const recentErrors = recent.filter((e) => (e.status as number) >= 500).length;
  const recentErrorRatePct = recent.length > 0
    ? Math.round((recentErrors / recent.length) * 10000) / 100
    : 0;

  const alerts: Alert[] = [];
  if (recent.length >= 20 && recentErrorRatePct >= 5) {
    alerts.push({
      level: "warning",
      code: "high_error_rate",
      message: `Error rate alta en ultimos 10 min: ${recentErrorRatePct}% (${recentErrors}/${recent.length})`,
    });
  }

  if (state.selfChecks.last && !state.selfChecks.last.ok) {
    alerts.push({
      level: "warning",
      code: "self_check_failed",
      message: `Ultimo self-check fallo: ${state.selfChecks.last.failedChecks.join(", ") || "unknown"}`,
    });
  }

  if (aiBudget?.hasBudget && typeof aiBudget.usagePct === "number" && aiBudget.usagePct >= 90) {
    alerts.push({
      level: aiBudget.usagePct >= 100 ? "critical" : "warning",
      code: "ai_budget_near_limit",
      message: `Uso del presupuesto IA: ${aiBudget.usagePct}% (${aiUsageTodayUsd ?? aiBudget.todayCostUsd} USD / ${aiBudget.dailyBudgetUsd} USD)`,
    });
  }

  return {
    alerts,
    recentWindow: {
      minutes: 10,
      requests: recent.length,
      errors5xx: recentErrors,
      errorRatePct: recentErrorRatePct,
    },
  };
}

function emitAlertsIfNeeded(source: string, alerts: Alert[]) {
  if (!alerts || alerts.length === 0) return;
  void dispatchAlerts(alerts, {
    source,
    totalRequests: state.totalRequests,
    totalErrors: state.totalErrors,
    startedAt: state.startedAt,
  });
}

export function apiMetricsMiddleware(req: any, res: any, next: any) {
  const started = Date.now();
  const path = normPath(req.originalUrl || req.url);
  const method = req.method || "GET";

  res.on("finish", () => {
    const latencyMs = Date.now() - started;
    const status = res.statusCode || 0;
    const key = `${method} ${path}`;

    state.totalRequests += 1;
    if (status >= 500) state.totalErrors += 1;
    state.byStatus[status] = (state.byStatus[status] || 0) + 1;

    if (!state.byRoute[key]) {
      state.byRoute[key] = {
        calls: 0, errors5xx: 0, totalLatencyMs: 0, avgLatencyMs: 0, p95ApproxMs: 0, samples: [],
      };
    }
    const route = state.byRoute[key];
    route.calls += 1;
    if (status >= 500) route.errors5xx += 1;
    route.totalLatencyMs += latencyMs;
    route.avgLatencyMs = Math.round((route.totalLatencyMs / route.calls) * 100) / 100;
    route.samples.push(latencyMs);
    if (route.samples.length > 200) route.samples.shift();
    const sorted = [...route.samples].sort((a, b) => a - b);
    route.p95ApproxMs = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;

    pushEvent({ type: "http", path, method, status, latencyMs });

    const now = Date.now();
    if (now - lastAlertEvalAt >= ALERT_EVAL_INTERVAL_MS) {
      lastAlertEvalAt = now;
      const { alerts } = buildAlerts();
      emitAlertsIfNeeded("http_metrics", alerts);
    }
  });

  next();
}

export function recordCacheLookup(namespace: string, hit: boolean) {
  const key = String(namespace || "default");
  if (!state.cache[key]) state.cache[key] = { hits: 0, misses: 0, hitRatePct: 0 };
  if (hit) state.cache[key].hits += 1;
  else state.cache[key].misses += 1;
  const { hits, misses } = state.cache[key];
  const total = hits + misses;
  state.cache[key].hitRatePct = total > 0 ? Math.round((hits / total) * 10000) / 100 : 0;
}

export function recordSelfCheckResult(result: SelfCheckResult) {
  state.selfChecks.total += 1;
  if (!result?.ok) state.selfChecks.failed += 1;
  state.selfChecks.last = {
    at: result?.ranAt || new Date().toISOString(),
    ok: !!result?.ok,
    failedChecks: result?.failedChecks || [],
    mode: result?.mode || null,
  };
  if (!result?.ok) {
    const { alerts } = buildAlerts();
    emitAlertsIfNeeded("self_check", alerts);
  }
}

export function getObservabilitySnapshot({ aiBudget = null as any, aiUsageTodayUsd = null as any } = {}) {
  const { alerts, recentWindow } = buildAlerts({ aiBudget, aiUsageTodayUsd });
  emitAlertsIfNeeded("metrics_snapshot", alerts);

  return {
    startedAt: state.startedAt,
    totalRequests: state.totalRequests,
    totalErrors: state.totalErrors,
    byStatus: state.byStatus,
    byRoute: state.byRoute,
    cache: state.cache,
    selfChecks: state.selfChecks,
    recentWindow,
    alerts,
  };
}
