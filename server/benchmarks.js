import { fetchHistory, fetchCCL } from "./marketData.js";
import { getTransactions, getPortfolioSummary } from "./database.js";
import CEDEARS from "./cedears.js";

export async function calculateBenchmarks(ranking = []) {
  const transactions = getTransactions(null, 500);
  if (transactions.length === 0) {
    return { error: "No hay operaciones registradas para comparar." };
  }

  // Find the first transaction date
  const sorted = [...transactions].sort((a, b) => new Date(a.date_executed) - new Date(b.date_executed));
  const firstDate = new Date(sorted[0].date_executed);
  const now = new Date();
  const monthsBack = Math.max(1, Math.ceil((now - firstDate) / (30 * 86400000)));

  // Calculate total invested and current portfolio value
  let totalInvestedARS = 0;
  const buys = transactions.filter(t => t.type === "BUY");
  const sells = transactions.filter(t => t.type === "SELL");
  for (const tx of buys) totalInvestedARS += tx.total_ars;
  for (const tx of sells) totalInvestedARS -= tx.total_ars;

  const summary = getPortfolioSummary();
  let currentValueARS = 0;
  for (const pos of summary) {
    const r = ranking.find(x => x.cedear?.ticker === pos.ticker);
    currentValueARS += r?.priceARS
      ? r.priceARS * pos.total_shares
      : pos.weighted_avg_price * pos.total_shares;
  }

  const portfolioReturn = totalInvestedARS > 0
    ? ((currentValueARS - totalInvestedARS) / totalInvestedARS) * 100
    : 0;

  // Fetch benchmark returns
  let spyReturn = null, qqqReturn = null;
  try {
    const spyHistory = await fetchHistory("SPY", monthsBack);
    if (spyHistory.length >= 2) {
      const first = spyHistory[0].close;
      const last = spyHistory[spyHistory.length - 1].close;
      spyReturn = ((last - first) / first) * 100;
    }
  } catch (e) { console.error("SPY benchmark error:", e.message); }

  try {
    const qqqHistory = await fetchHistory("QQQ", monthsBack);
    if (qqqHistory.length >= 2) {
      const first = qqqHistory[0].close;
      const last = qqqHistory[qqqHistory.length - 1].close;
      qqqReturn = ((last - first) / first) * 100;
    }
  } catch (e) { console.error("QQQ benchmark error:", e.message); }

  // Estimate plazo fijo (75% TNA = ~6.25% monthly)
  const monthlyPFRate = 0.0625;
  const plazoFijoReturn = (Math.pow(1 + monthlyPFRate, monthsBack) - 1) * 100;

  // Estimate Argentine inflation (~3.5% monthly)
  const monthlyInflation = 0.035;
  const inflationReturn = (Math.pow(1 + monthlyInflation, monthsBack) - 1) * 100;

  // Verdict
  let verdict = "";
  let verdictLevel = "neutral";
  const pR = Math.round(portfolioReturn * 100) / 100;

  if (pR > (spyReturn || 0) && pR > plazoFijoReturn) {
    verdict = "EXCELENTE: El portfolio genera alfa real. Le ganás a SPY y al plazo fijo.";
    verdictLevel = "excellent";
  } else if (pR > (spyReturn || 0) && pR <= plazoFijoReturn) {
    verdict = "Bien en USD, pero el plazo fijo rindió más en ARS. Considerá una estrategia mixta.";
    verdictLevel = "good";
  } else if (pR <= (spyReturn || 0) && pR > inflationReturn) {
    verdict = "SPY ganó. Considerá más peso en ETFs índice para simplificar.";
    verdictLevel = "warning";
  } else if (pR <= inflationReturn) {
    verdict = "ATENCIÓN: No le ganás ni a la inflación argentina. Revisá la estrategia urgente.";
    verdictLevel = "danger";
  } else {
    verdict = "Performance en línea con el mercado. Seguí monitoreando.";
    verdictLevel = "neutral";
  }

  return {
    period: { months: monthsBack, from: firstDate.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) },
    portfolio: { investedARS: Math.round(totalInvestedARS), currentValueARS: Math.round(currentValueARS), returnPct: Math.round(pR * 100) / 100 },
    benchmarks: {
      spy: spyReturn != null ? Math.round(spyReturn * 100) / 100 : null,
      qqq: qqqReturn != null ? Math.round(qqqReturn * 100) / 100 : null,
      plazoFijo: Math.round(plazoFijoReturn * 100) / 100,
      inflation: Math.round(inflationReturn * 100) / 100,
    },
    verdict,
    verdictLevel,
  };
}
