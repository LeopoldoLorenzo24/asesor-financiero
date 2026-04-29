// ============================================================
// API SERVICE - Frontend HTTP client v2
// AbortController support, encodeURIComponent, graceful logout
// ============================================================

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

function getToken() { return sessionStorage.getItem("cedear_token"); }
function setToken(t) { sessionStorage.setItem("cedear_token", t); }
function clearToken() { sessionStorage.removeItem("cedear_token"); sessionStorage.removeItem("cedear_email"); }

function getDownloadFilename(contentDisposition, fallbackName) {
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition || "");
  return match?.[1] || fallbackName;
}

async function request(path, options = {}) {
  try {
    const token = getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, {
      headers,
      signal: options.signal,
      ...options,
    });
    if (res.status === 401 && !path.startsWith("/auth")) {
      clearToken();
      window.dispatchEvent(new Event("cedear:logout"));
      throw new Error("Sesión expirada");
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (err.name === "AbortError") {
      throw err;
    }
    console.error(`API Error [${path}]:`, err);
    throw err;
  }
}

async function downloadFile(path, fallbackName) {
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event("cedear:logout"));
    throw new Error("Sesión expirada");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const filename = getDownloadFilename(res.headers.get("Content-Disposition"), fallbackName);
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export const auth = {
  status: () => request("/auth/status"),
  register: async (email, password) => {
    const data = await request("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
    setToken(data.token);
    sessionStorage.setItem("cedear_email", data.email);
    return data;
  },
  login: async (email, password, totpCode = "") => {
    const payload = { email, password };
    if (totpCode) payload.totpCode = totpCode;
    const data = await request("/auth/login", { method: "POST", body: JSON.stringify(payload) });
    setToken(data.token);
    sessionStorage.setItem("cedear_email", data.email);
    return data;
  },
  get2FAStatus: () => request("/auth/2fa/status"),
  enable2FA: () => request("/auth/2fa/enable", { method: "POST", body: JSON.stringify({}) }),
  disable2FA: (totpCode) => request("/auth/2fa/disable", { method: "POST", body: JSON.stringify({ totpCode }) }),
  logout: () => { clearToken(); window.dispatchEvent(new Event("cedear:logout")); },
  isLoggedIn: () => !!getToken(),
  getEmail: () => sessionStorage.getItem("cedear_email"),
};

export const api = {
  health: () => request("/health"),
  getCCL: () => request("/ccl"),

  getRanking: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.sector) qs.set("sector", params.sector);
    if (params.limit) qs.set("limit", params.limit);
    if (params.profile) qs.set("profile", params.profile);
    const query = qs.toString();
    return request(`/ranking${query ? `?${query}` : ""}`);
  },

  getCedear: (ticker, profile) => {
    const encoded = encodeURIComponent(ticker);
    const qs = profile ? `?profile=${encodeURIComponent(profile)}` : "";
    return request(`/cedear/${encoded}${qs}`);
  },
  getHistory: (ticker, months = 6) => request(`/history/${encodeURIComponent(ticker)}?months=${encodeURIComponent(months)}`),
  getSectors: () => request("/sectors"),

  aiAnalyze: (capital = 0, profile = "moderate", signal) =>
    request("/ai/analyze", {
      method: "POST",
      body: JSON.stringify({ capital, profile }),
      signal,
    }),

  aiAnalyzeSingle: (ticker, signal) => request(`/ai/analyze/${encodeURIComponent(ticker)}`, { signal }),

  getPortfolioDB: (signal) => request("/portfolio/db", { signal }),
  buyPosition: (ticker, shares, priceArs, notes = "") =>
    request("/portfolio/buy", { method: "POST", body: JSON.stringify({ ticker, shares, priceArs, notes }) }),
  sellPosition: (ticker, shares, priceArs, notes = "") =>
    request("/portfolio/sell", { method: "POST", body: JSON.stringify({ ticker, shares, priceArs, notes }) }),
  syncPortfolio: (positions) =>
    request("/portfolio/sync", { method: "POST", body: JSON.stringify({ positions }) }),
  resetPortfolio: (positions) =>
    request("/portfolio/reset", { method: "POST", body: JSON.stringify({ positions }) }),
  previewBrokerReconciliation: ({ broker, positions, csv, cclRate, snapshotDate, sourceName }) =>
    request("/portfolio/reconcile/preview", {
      method: "POST",
      body: JSON.stringify({ broker, positions, csv, cclRate, snapshotDate, sourceName }),
    }),
  applyBrokerReconciliation: ({ broker, positions, csv, cclRate, snapshotDate, note, sourceName }) =>
    request("/portfolio/reconcile/apply", {
      method: "POST",
      body: JSON.stringify({ broker, positions, csv, cclRate, snapshotDate, note, sourceName }),
    }),
  getBrokerReconciliationAudit: (limit = 10) =>
    request(`/portfolio/reconcile/audit?limit=${encodeURIComponent(limit)}`),
  previewHistoricalBrokerImport: ({ broker, csv, sourceName }) =>
    request("/portfolio/history/preview", {
      method: "POST",
      body: JSON.stringify({ broker, csv, sourceName }),
    }),
  applyHistoricalBrokerImport: ({ broker, csv, sourceName }) =>
    request("/portfolio/history/apply", {
      method: "POST",
      body: JSON.stringify({ broker, csv, sourceName }),
    }),

  getTransactions: (ticker = null, limit = 50) =>
    request(`/transactions?${new URLSearchParams({ ...(ticker && { ticker }), limit })}`),

  getPredictions: (ticker = null, unevaluated = false) =>
    request(`/predictions?${new URLSearchParams({ ...(ticker && { ticker }), ...(unevaluated && { unevaluated: "true" }) })}`),
  evaluatePredictions: (ticker) =>
    request("/predictions/evaluate", { method: "POST", body: JSON.stringify({ ticker }) }),
  evaluateAll: () =>
    request("/predictions/evaluate-all", { method: "POST" }),
  concludePrediction: (id) =>
    request(`/predictions/${encodeURIComponent(id)}/conclude`, { method: "POST" }),

  getPerformance: (days = 30) => request(`/performance?days=${encodeURIComponent(days)}`),
  getAnalysisSessions: (limit = 20) => request(`/analysis-sessions?limit=${encodeURIComponent(limit)}`),

  getCapitalHistory: (limit = 90, signal) => request(`/capital?limit=${encodeURIComponent(limit)}`, { signal }),
  logCapital: (capitalArs, portfolioValueArs, monthlyDeposit) =>
    request("/capital", { method: "POST", body: JSON.stringify({ capitalArs, portfolioValueArs, monthlyDeposit }) }),

  getBenchmarks: () => request("/benchmarks"),
  getBacktest: (months = 6, deposit = 1000000, profile = "moderate", picks = 4) =>
    request(`/backtest?months=${encodeURIComponent(months)}&deposit=${encodeURIComponent(deposit)}&profile=${encodeURIComponent(profile)}&picks=${encodeURIComponent(picks)}`),

  getPerformanceAnalytics: () => request("/performance-analytics"),

  generatePostMortem: () => request("/postmortem/generate", { method: "POST" }),
  getPostMortems: () => request("/postmortem/history"),
  seedHistoricalLessons: () => request("/seed-historical-lessons", { method: "POST" }),

  getVirtualPortfolio: () => request("/virtual-portfolio"),
  getVirtualPortfolioRegret: () => request("/virtual-portfolio/regret"),
  resetVirtualPortfolio: (positions) => request("/virtual-portfolio/reset", { method: "POST", body: JSON.stringify({ positions }) }),
  syncVirtualPortfolio: (picks) => request("/virtual-portfolio/sync", { method: "POST", body: JSON.stringify({ picks }) }),

  getAdherenceStats: (days) => request(`/adherence/stats${days ? `?days=${encodeURIComponent(days)}` : ""}`),
  getRiskMetrics: () => request("/risk-metrics"),
  getTradingSignals: (tickers, profile) => {
    const qs = new URLSearchParams();
    if (tickers) qs.set("tickers", Array.isArray(tickers) ? tickers.join(",") : tickers);
    if (profile) qs.set("profile", profile);
    const query = qs.toString();
    return request(`/trading/signals${query ? `?${query}` : ""}`);
  },
  validateTradingTrade: (ticker, tradeAmount) =>
    request("/trading/validate", { method: "POST", body: JSON.stringify({ ticker, tradeAmount }) }),

  // ── Export CSV ──
  exportPortfolio: () => downloadFile("/export/portfolio", "portfolio.csv"),
  exportTransactions: () => downloadFile("/export/transactions", "transacciones.csv"),
  exportPredictions: () => downloadFile("/export/predictions", "predicciones.csv"),
  exportCapitalHistory: () => downloadFile("/export/capital-history", "capital-history.csv"),

  // ── Charts ──
  getPortfolioEvolution: (days = 180) => request(`/charts/portfolio-evolution?days=${encodeURIComponent(days)}`),

  // ── System health & alerts ──
  getSystemHealth: () => request("/system/health"),
  getSystemReadiness: () => request("/system/readiness"),
  getIntradayMonitorStatus: () => request("/system/monitor/status"),
  updateIntradayMonitorSettings: (payload) =>
    request("/system/monitor/settings", { method: "POST", body: JSON.stringify(payload || {}) }),
  startIntradayMonitor: (runImmediately = true) =>
    request("/system/monitor/start", { method: "POST", body: JSON.stringify({ runImmediately }) }),
  stopIntradayMonitor: (reason = "user_stop", disable = true) =>
    request("/system/monitor/stop", { method: "POST", body: JSON.stringify({ reason, disable }) }),
  runIntradayMonitorNow: () =>
    request("/system/monitor/run-now", { method: "POST", body: JSON.stringify({}) }),
  getPolicySettings: () => request("/system/policies"),
  previewPolicySettings: (overlayKey, deploymentMode) =>
    request("/system/policies/preview", { method: "POST", body: JSON.stringify({ overlayKey, deploymentMode }) }),
  applyPolicySettings: (overlayKey, deploymentMode, reason) =>
    request("/system/policies/apply", { method: "POST", body: JSON.stringify({ overlayKey, deploymentMode, reason }) }),
  getRecentAlerts: (limit = 20) => request(`/alerts/recent?limit=${encodeURIComponent(limit)}`),

  // ── Paper Trading Config ──
  getPaperTradingConfig: () => request("/virtual-portfolio/config"),
  setPaperTradingConfig: (autoSyncEnabled) => request("/virtual-portfolio/config", { method: "POST", body: JSON.stringify({ autoSyncEnabled }) }),

  // ── Track Record ──
  getTrackRecord: (days = 365) => request(`/track-record?days=${encodeURIComponent(days)}`),
  getRealTrackRecord: () => request("/track-record/real"),
};

export default api;
