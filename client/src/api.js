// ============================================================
// API SERVICE - Frontend HTTP client
// ============================================================

const API_BASE = "/api";

function getToken() { return sessionStorage.getItem("cedear_token"); }
function setToken(t) { sessionStorage.setItem("cedear_token", t); }
function clearToken() { sessionStorage.removeItem("cedear_token"); sessionStorage.removeItem("cedear_email"); }

async function request(path, options = {}) {
  try {
    const token = getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { headers, ...options });
    if (res.status === 401 && !path.startsWith("/auth")) {
      clearToken();
      window.location.reload();
      throw new Error("Sesión expirada");
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error(`API Error [${path}]:`, err);
    throw err;
  }
}

export const auth = {
  status: () => request("/auth/status"),
  register: async (email, password) => {
    const data = await request("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
    setToken(data.token);
    sessionStorage.setItem("cedear_email", data.email);
    return data;
  },
  login: async (email, password) => {
    const data = await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    setToken(data.token);
    sessionStorage.setItem("cedear_email", data.email);
    return data;
  },
  logout: () => { clearToken(); window.location.reload(); },
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

  getCedear: (ticker, profile) => request(`/cedear/${ticker}${profile ? `?profile=${profile}` : ""}`),
  getHistory: (ticker, months = 6) => request(`/history/${ticker}?months=${months}`),
  getSectors: () => request("/sectors"),

  aiAnalyze: (portfolio = [], capital = 0, profile = "moderate") =>
    request("/ai/analyze", {
      method: "POST",
      body: JSON.stringify({ portfolio, capital, profile }),
    }),

  aiAnalyzeSingle: (ticker) => request(`/ai/analyze/${ticker}`),

  getPortfolioDB: () => request("/portfolio/db"),
  buyPosition: (ticker, shares, priceArs, notes = "") =>
    request("/portfolio/buy", { method: "POST", body: JSON.stringify({ ticker, shares, priceArs, notes }) }),
  sellPosition: (ticker, shares, priceArs, notes = "") =>
    request("/portfolio/sell", { method: "POST", body: JSON.stringify({ ticker, shares, priceArs, notes }) }),

  getTransactions: (ticker = null, limit = 50) =>
    request(`/transactions?${new URLSearchParams({ ...(ticker && { ticker }), limit })}`),

  getPredictions: (ticker = null, unevaluated = false) =>
    request(`/predictions?${new URLSearchParams({ ...(ticker && { ticker }), ...(unevaluated && { unevaluated: "true" }) })}`),
  evaluatePredictions: (ticker) =>
    request("/predictions/evaluate", { method: "POST", body: JSON.stringify({ ticker }) }),
  evaluateAll: () =>
    request("/predictions/evaluate-all", { method: "POST" }),
  concludePrediction: (id) =>
    request(`/predictions/${id}/conclude`, { method: "POST" }),

  getPerformance: (days = 30) => request(`/performance?days=${days}`),
  getAnalysisSessions: (limit = 20) => request(`/analysis-sessions?limit=${limit}`),

  getCapitalHistory: (limit = 90) => request(`/capital?limit=${limit}`),
  logCapital: (capitalArs, portfolioValueArs, monthlyDeposit) =>
    request("/capital", { method: "POST", body: JSON.stringify({ capitalArs, portfolioValueArs, monthlyDeposit }) }),

  // New endpoints
  getBenchmarks: () => request("/benchmarks"),
  getBacktest: (months = 6, deposit = 1000000, profile = "moderate", picks = 4) =>
    request(`/backtest?months=${months}&deposit=${deposit}&profile=${profile}&picks=${picks}`),
};

export default api;
