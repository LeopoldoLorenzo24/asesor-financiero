// ============================================================
// API SERVICE - Frontend HTTP client
// ============================================================

const API_BASE = "/api";

async function request(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
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

export const api = {
  // Health check
  health: () => request("/health"),

  // CCL exchange rate
  getCCL: () => request("/ccl"),

  // Full ranking
  getRanking: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.sector) qs.set("sector", params.sector);
    if (params.limit) qs.set("limit", params.limit);
    const query = qs.toString();
    return request(`/ranking${query ? `?${query}` : ""}`);
  },

  // Single CEDEAR detail
  getCedear: (ticker) => request(`/cedear/${ticker}`),

  // Price history
  getHistory: (ticker, months = 6) => request(`/history/${ticker}?months=${months}`),

  // Sectors
  getSectors: () => request("/sectors"),

  // AI full analysis
  aiAnalyze: (portfolio = [], capital = 0) =>
    request("/ai/analyze", {
      method: "POST",
      body: JSON.stringify({ portfolio, capital }),
    }),

  // AI single CEDEAR analysis
  aiAnalyzeSingle: (ticker) => request(`/ai/analyze/${ticker}`),

  // Portfolio (database-backed)
  getPortfolioDB: () => request("/portfolio/db"),
  buyPosition: (ticker, shares, priceArs, notes = "") =>
    request("/portfolio/buy", { method: "POST", body: JSON.stringify({ ticker, shares, priceArs, notes }) }),
  sellPosition: (ticker, shares, priceArs, notes = "") =>
    request("/portfolio/sell", { method: "POST", body: JSON.stringify({ ticker, shares, priceArs, notes }) }),

  // Transactions
  getTransactions: (ticker = null, limit = 50) =>
    request(`/transactions?${new URLSearchParams({ ...(ticker && { ticker }), limit })}`),

  // Predictions
  getPredictions: (ticker = null, unevaluated = false) =>
    request(`/predictions?${new URLSearchParams({ ...(ticker && { ticker }), ...(unevaluated && { unevaluated: "true" }) })}`),
  evaluatePredictions: (ticker) =>
    request("/predictions/evaluate", { method: "POST", body: JSON.stringify({ ticker }) }),
  evaluateAll: () =>
    request("/predictions/evaluate-all", { method: "POST" }),

  // Bot performance
  getPerformance: (days = 30) => request(`/performance?days=${days}`),

  // Analysis sessions history
  getAnalysisSessions: (limit = 20) => request(`/analysis-sessions?limit=${limit}`),

  // Capital
  getCapitalHistory: (limit = 90) => request(`/capital?limit=${limit}`),
  logCapital: (capitalArs, portfolioValueArs, monthlyDeposit) =>
    request("/capital", { method: "POST", body: JSON.stringify({ capitalArs, portfolioValueArs, monthlyDeposit }) }),
};

export default api;
