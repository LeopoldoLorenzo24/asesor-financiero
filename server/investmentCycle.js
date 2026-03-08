// ============================================================
// INVESTMENT CYCLE MANAGER
// Controla el ciclo mensual de inversión
// ============================================================

import {
  getPortfolioSummary,
  getAnalysisSessions,
  getTransactions,
  getPredictions,
  logCapital,
} from "./database.js";

const MONTHLY_DEPOSIT = 1000000; // $1M ARS por mes

/**
 * Genera el contexto completo del ciclo mensual para el prompt de la IA.
 * Esta función arma TODO lo que el bot necesita saber antes de recomendar.
 */
export async function buildMonthlyCycleContext({ capital, ccl, ranking }) {
  const portfolio = await getPortfolioSummary();
  const lastSessions = await getAnalysisSessions(3);
  const recentTransactions = await getTransactions(null, 20);
  const recentPredictions = await getPredictions(null, false, 30);

  // Determinar número de mes
  const firstTx = recentTransactions[recentTransactions.length - 1];
  const firstDate = firstTx?.date_executed ? new Date(firstTx.date_executed) : new Date("2026-02-01");
  const monthsSinceStart = Math.floor((Date.now() - firstDate.getTime()) / (30 * 86400000)) + 1;
  const currentMonth = new Date().toLocaleString("es-AR", { month: "long", year: "numeric" });

  // Calcular valor actual del portfolio
  let portfolioValueARS = 0;
  const positionsWithData = portfolio.map((pos) => {
    const r = ranking?.find((x) => x.cedear?.ticker === pos.ticker);
    const currentPriceARS = r?.priceARS || pos.weighted_avg_price;
    const currentValue = currentPriceARS * pos.total_shares;
    const investedValue = pos.weighted_avg_price * pos.total_shares;
    const pnl = currentValue - investedValue;
    const pnlPct = investedValue > 0 ? ((pnl / investedValue) * 100).toFixed(2) : 0;
    portfolioValueARS += currentValue;

    return {
      ticker: pos.ticker,
      shares: pos.total_shares,
      avgPrice: pos.weighted_avg_price,
      currentPrice: currentPriceARS,
      currentValue: Math.round(currentValue),
      pnl: Math.round(pnl),
      pnlPct: parseFloat(pnlPct),
      sector: r?.cedear?.sector || "Unknown",
      score: r?.scores?.composite || null,
      signal: r?.scores?.signal || null,
      rsi: r?.technical?.indicators?.rsi || null,
      change1m: r?.technical?.indicators?.performance?.month1 || null,
    };
  });

  // Calcular exposición sectorial
  const sectorExposure = {};
  for (const pos of positionsWithData) {
    sectorExposure[pos.sector] = (sectorExposure[pos.sector] || 0) + pos.currentValue;
  }
  const sectorPcts = {};
  for (const [sector, value] of Object.entries(sectorExposure)) {
    sectorPcts[sector] = portfolioValueARS > 0
      ? Math.round((value / portfolioValueARS) * 100) : 0;
  }

  // Qué hizo el bot el mes pasado y qué pasó
  let lastMonthReview = "No hay sesión anterior (primer o segundo mes).";
  if (lastSessions.length > 0) {
    const last = lastSessions[0];
    const lastRecs = last.full_response?.nuevas_compras || last.full_response?.recomendaciones || [];
    const lastActions = last.full_response?.acciones_cartera_actual || [];

    lastMonthReview = `SESIÓN ANTERIOR (${last.session_date?.slice(0, 10)}):
Resumen: ${last.market_summary || "N/A"}
Recomendaciones que dio: ${lastRecs.map((r) => `${r.accion || "COMPRAR"} ${r.ticker}`).join(", ") || "Ninguna"}
Acciones sobre cartera: ${lastActions.map((a) => `${a.accion} ${a.ticker}`).join(", ") || "Ninguna"}
Capital en ese momento: $${last.capital_ars?.toLocaleString() || "N/A"} ARS
CCL en ese momento: $${last.ccl_rate || "N/A"}`;
  }

  // Predicciones evaluables (las del mes pasado que ya se pueden verificar)
  const evaluable = recentPredictions.filter((p) => p.evaluated);
  const correct = evaluable.filter((p) => p.prediction_correct === 1).length;
  const incorrect = evaluable.filter((p) => p.prediction_correct === 0).length;

  // ---- ARMAR EL CONTEXTO ----
  const context = `
========================================
CICLO MENSUAL DE INVERSIÓN - ${currentMonth.toUpperCase()}
MES #${monthsSinceStart} DEL INVERSOR
========================================

DATOS DEL CICLO:
- Capital disponible en efectivo: $${capital.toLocaleString()} ARS
- Dólar CCL actual: $${ccl.venta} (compra: $${ccl.compra})
- Este es el análisis MENSUAL. El inversor ejecutará las operaciones que le indiques en Bull Market Brokers.
- IMPORTANTE: El capital disponible es TODO lo que tiene libre. NO hay aporte extra. Para comprar nuevo, hay que vender algo.

PORTFOLIO ACTUAL (${positionsWithData.length} posiciones, valor total: $${Math.round(portfolioValueARS).toLocaleString()} ARS):
${positionsWithData.map((p) =>
  `- ${p.ticker} [${p.sector}]: ${p.shares} CEDEARs | Compra: $${Math.round(p.avgPrice).toLocaleString()} → Actual: $${Math.round(p.currentPrice).toLocaleString()} | P&L: ${p.pnl >= 0 ? "+" : ""}$${p.pnl.toLocaleString()} (${p.pnlPct >= 0 ? "+" : ""}${p.pnlPct}%) | Score: ${p.score || "N/A"}/100 | Señal: ${p.signal || "N/A"} | RSI: ${p.rsi || "N/A"} | 1M: ${p.change1m != null ? `${p.change1m}%` : "N/A"}`
).join("\n")}

EXPOSICIÓN SECTORIAL:
${Object.entries(sectorPcts).sort((a, b) => b[1] - a[1]).map(([sector, pct]) =>
  `- ${sector}: ${pct}% ($${Math.round(sectorExposure[sector]).toLocaleString()} ARS)`
).join("\n")}

PATRIMONIO TOTAL: $${Math.round(portfolioValueARS + capital).toLocaleString()} ARS
- Invertido: $${Math.round(portfolioValueARS).toLocaleString()} (${Math.round((portfolioValueARS / (portfolioValueARS + capital)) * 100)}%)
- Disponible: $${capital.toLocaleString()} (${Math.round((capital / (portfolioValueARS + capital)) * 100)}%)

${lastMonthReview}

PERFORMANCE DEL BOT:
- Predicciones evaluadas: ${evaluable.length} (${correct} aciertos, ${incorrect} errores)
- Accuracy: ${evaluable.length > 0 ? Math.round((correct / evaluable.length) * 100) : "N/A"}%
`;

  return {
    context,
    portfolioValueARS,
    positionsWithData,
    sectorPcts,
    monthNumber: monthsSinceStart,
    currentMonth,
  };
}
