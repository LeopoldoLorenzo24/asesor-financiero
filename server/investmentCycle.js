// ============================================================
// INVESTMENT CYCLE MANAGER
// Controla el ciclo mensual de inversión
// ============================================================

import {
  getPortfolioSummary,
  getAnalysisSessions,
  getTransactions,
  getPredictions,
  getUsdCostBasisByTicker,
} from "./database.js";
import { getRealPicksAlpha, calculateSpyBenchmark } from "./performance.js";
import { sanitizePromptString } from "./utils.js";

/**
 * Genera el contexto completo del ciclo mensual para el prompt de la IA.
 * Esta función arma TODO lo que el bot necesita saber antes de recomendar.
 */
export async function buildMonthlyCycleContext({ capital, ccl, ranking }) {
  const portfolio = await getPortfolioSummary();
  const lastSessions = await getAnalysisSessions(3);
  const recentTransactions = await getTransactions(null, 500);
  const recentPredictions = await getPredictions(null, false, 30);
  const [usdCostBasis, realAlpha, spyBenchmark] = await Promise.all([
    getUsdCostBasisByTicker().catch(() => ({})),
    getRealPicksAlpha().catch(() => null),
    calculateSpyBenchmark(ccl?.venta).catch(() => null),
  ]);

  // Determinar número de mes
  const firstTx = recentTransactions[recentTransactions.length - 1];
  const firstDate = firstTx?.date_executed ? new Date(firstTx.date_executed) : new Date("2026-02-01");
  const monthsSinceStart = Math.floor((Date.now() - firstDate.getTime()) / (30 * 86400000)) + 1;
  const currentMonth = new Date().toLocaleString("es-AR", { month: "long", year: "numeric" });

  // Calcular valor actual del portfolio
  let portfolioValueARS = 0;
  const positionsWithData = portfolio.map((pos) => {
    const r = ranking?.find((x) => x.cedear?.ticker === pos.ticker);
    const currentPriceARS =
      r?.priceARS ||
      (r?.quote?.price && ccl?.venta && r?.cedear?.ratio
        ? Math.round((r.quote.price * ccl.venta) / r.cedear.ratio)
        : null) ||
      pos.weighted_avg_price;
    const currentValue = currentPriceARS * pos.total_shares;
    const investedValue = pos.weighted_avg_price * pos.total_shares;
    const pnl = currentValue - investedValue;
    const pnlPct = investedValue > 0 ? ((pnl / investedValue) * 100).toFixed(2) : 0;
    portfolioValueARS += currentValue;

    // USD P&L — requires quote price + ratio, falls back to CCL conversion
    const ratio = r?.cedear?.ratio || 1;
    const quoteUsd = r?.quote?.price || null;
    const currentUsdValue = quoteUsd != null
      ? Math.round((pos.total_shares / ratio) * quoteUsd * 100) / 100
      : null;
    const usdCost = usdCostBasis[pos.ticker] || null;
    const pnlUsd = currentUsdValue != null && usdCost != null
      ? Math.round((currentUsdValue - usdCost) * 100) / 100
      : null;
    const pnlUsdPct = pnlUsd != null && usdCost > 0
      ? Math.round((pnlUsd / usdCost) * 10000) / 100
      : null;

    return {
      ticker: pos.ticker,
      shares: pos.total_shares,
      avgPrice: pos.weighted_avg_price,
      currentPrice: currentPriceARS,
      currentValue: Math.round(currentValue),
      pnl: Math.round(pnl),
      pnlPct: parseFloat(pnlPct),
      currentUsdValue,
      usdCost,
      pnlUsd,
      pnlUsdPct,
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
  let cartEraYaAlineada = false;
  if (lastSessions.length > 0) {
    const last = lastSessions[0];
    let lastResponse = last.full_response;
    if (typeof lastResponse === "string") {
      try {
        lastResponse = JSON.parse(lastResponse);
      } catch {
        lastResponse = {};
      }
    }
    const lastRecs =
      lastResponse?.decision_mensual?.picks_activos ||
      lastResponse?.nuevas_compras ||
      lastResponse?.recomendaciones ||
      [];
    const lastActions = Array.isArray(lastResponse?.acciones_cartera_actual)
      ? lastResponse.acciones_cartera_actual
      : [];

    // Detectar si el usuario ejecutó las recomendaciones anteriores
    const currentTickers = new Set(positionsWithData.map((p) => p.ticker));
    const vendasPendientes = lastActions.filter(
      (a) => (a.accion === "VENDER" || a.accion === "VENDER TODO") && currentTickers.has(a.ticker)
    );
    const comprasPendientes = lastRecs.filter((r) => !currentTickers.has(r.ticker));
    const reduccionesPendientes = lastActions.filter((a) => {
      if (a.accion !== "REDUCIR") return false;
      const pos = positionsWithData.find((p) => p.ticker === a.ticker);
      if (!pos || !a.cantidad_ajustar) return false;
      // Si la cantidad actual es mayor a lo esperado después de reducir, todavía no lo hizo
      const cantidadActual = Number(a.cantidad_actual);
      const cantidadAjustarAbs = Math.abs(Number(a.cantidad_ajustar));
      if (!Number.isFinite(cantidadActual) || !Number.isFinite(cantidadAjustarAbs)) return false;
      return pos.shares > (cantidadActual - cantidadAjustarAbs) * 1.05;
    });

    const pendientesCount = vendasPendientes.length + comprasPendientes.length + reduccionesPendientes.length;
    cartEraYaAlineada = pendientesCount === 0 && lastActions.length > 0;

    let alineacionStatus = "";
    if (cartEraYaAlineada) {
      alineacionStatus = `\n✅ CARTERA ALINEADA: El inversor ejecutó todas las operaciones recomendadas el ${last.session_date?.slice(0, 10)}. No hay pendientes detectados.`;
    } else if (pendientesCount > 0) {
      alineacionStatus = `\n⚠ OPERACIONES POSIBLEMENTE PENDIENTES:`;
      if (vendasPendientes.length > 0) alineacionStatus += `\n- Ventas no ejecutadas: ${vendasPendientes.map((a) => a.ticker).join(", ")}`;
      if (reduccionesPendientes.length > 0) alineacionStatus += `\n- Reducciones pendientes: ${reduccionesPendientes.map((a) => a.ticker).join(", ")}`;
      if (comprasPendientes.length > 0) alineacionStatus += `\n- Compras recomendadas no en cartera: ${comprasPendientes.map((r) => r.ticker).join(", ")}`;
    }

    lastMonthReview = `SESIÓN ANTERIOR (${last.session_date?.slice(0, 10)}):
Resumen: ${last.market_summary || "N/A"}
Recomendaciones que dio: ${lastRecs.map((r) => `${r.accion || "COMPRAR"} ${r.ticker}`).join(", ") || "Ninguna"}
Acciones sobre cartera: ${lastActions.map((a) => `${a.accion} ${a.ticker}${a.cantidad_ajustar ? ` (ajuste: ${a.cantidad_ajustar})` : ""}`).join(", ") || "Ninguna"}
Capital en ese momento: $${last.capital_ars?.toLocaleString() || "N/A"} ARS
CCL en ese momento: $${last.ccl_rate || "N/A"}${alineacionStatus}`;
  }

  // Predicciones evaluables (las del mes pasado que ya se pueden verificar)
  const evaluable = recentPredictions.filter((p) => p.evaluated);
  const correct = evaluable.filter((p) => p.prediction_correct === 1).length;
  const incorrect = evaluable.filter((p) => p.prediction_correct === 0).length;
  const totalPatrimonio = portfolioValueARS + capital;
  const invertidoPct = totalPatrimonio > 0
    ? Math.round((portfolioValueARS / totalPatrimonio) * 100)
    : 0;
  const disponiblePct = totalPatrimonio > 0
    ? Math.round((capital / totalPatrimonio) * 100)
    : 0;

  // ---- TOTALES EN USD ----
  const totalUsdCost = positionsWithData.reduce((s, p) => s + (p.usdCost || 0), 0);
  const totalUsdCurrentValue = positionsWithData.reduce(
    (s, p) => (p.currentUsdValue != null ? s + p.currentUsdValue : s), 0
  );
  const totalPnlUsd = totalUsdCost > 0 ? Math.round((totalUsdCurrentValue - totalUsdCost) * 100) / 100 : null;
  const totalPnlUsdPct = totalPnlUsd != null && totalUsdCost > 0
    ? Math.round((totalPnlUsd / totalUsdCost) * 10000) / 100
    : null;
  const portfolioValueUsd = ccl?.venta > 0 ? Math.round(portfolioValueARS / ccl.venta) : null;

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

PORTFOLIO ACTUAL (${positionsWithData.length} posiciones, valor total: $${Math.round(portfolioValueARS).toLocaleString()} ARS${portfolioValueUsd != null ? ` ≈ USD $${portfolioValueUsd.toLocaleString()}` : ""}):
${positionsWithData.map((p) => {
  const usdLine = p.pnlUsd != null
    ? ` | P&L USD: ${p.pnlUsd >= 0 ? "+" : ""}$${p.pnlUsd.toLocaleString()} (${p.pnlUsdPct >= 0 ? "+" : ""}${p.pnlUsdPct}%)`
    : "";
  return `- ${sanitizePromptString(p.ticker, 20)} [${sanitizePromptString(p.sector, 30)}]: ${p.shares} CEDEARs | Precio/CEDEAR: $${Math.round(p.currentPrice).toLocaleString()} ARS | Valor: $${p.currentValue.toLocaleString()} ARS | P&L ARS: ${p.pnl >= 0 ? "+" : ""}$${p.pnl.toLocaleString()} (${p.pnlPct >= 0 ? "+" : ""}${p.pnlPct}%)${usdLine} | Score: ${p.score || "N/A"}/100 | Señal: ${sanitizePromptString(p.signal, 20)} | RSI: ${p.rsi || "N/A"} | 1M: ${p.change1m != null ? `${p.change1m}%` : "N/A"}`;
}).join("\n")}
${totalPnlUsd != null ? `RETORNO TOTAL EN USD: ${totalPnlUsd >= 0 ? "+" : ""}$${totalPnlUsd.toLocaleString()} (${totalPnlUsdPct >= 0 ? "+" : ""}${totalPnlUsdPct}%) sobre costo base USD $${Math.round(totalUsdCost).toLocaleString()}` : ""}

EXPOSICIÓN SECTORIAL:
${Object.entries(sectorPcts).sort((a, b) => b[1] - a[1]).map(([sector, pct]) =>
  `- ${sector}: ${pct}% ($${Math.round(sectorExposure[sector]).toLocaleString()} ARS)`
).join("\n")}

PATRIMONIO TOTAL: $${Math.round(portfolioValueARS + capital).toLocaleString()} ARS
- Invertido: $${Math.round(portfolioValueARS).toLocaleString()} (${invertidoPct}%)
- Disponible: $${capital.toLocaleString()} (${disponiblePct}%)

${lastMonthReview}

PERFORMANCE DEL BOT:
- Predicciones evaluadas: ${evaluable.length} (${correct} aciertos, ${incorrect} errores)
- Accuracy: ${evaluable.length > 0 ? Math.round((correct / evaluable.length) * 100) : "N/A"}%
${realAlpha ? `
ALFA REAL DE PICKS (retorno real de CEDEARs recomendados vs SPY mismo período):
- Picks analizados: ${realAlpha.count}
- Retorno promedio de picks: ${realAlpha.avgPickReturn >= 0 ? "+" : ""}${realAlpha.avgPickReturn}%
- Retorno de SPY en los mismos períodos: ${realAlpha.avgSpyReturn >= 0 ? "+" : ""}${realAlpha.avgSpyReturn}%
- ALFA PROMEDIO REAL: ${realAlpha.avgAlpha >= 0 ? "+" : ""}${realAlpha.avgAlpha}pp ${realAlpha.avgAlpha > 0 ? "✅ Picks generando alfa real" : "❌ Picks destruyendo alfa vs SPY"}
- Win rate vs SPY: ${realAlpha.winRateVsSpy}% de picks le ganaron a SPY
- Mejor pick vs SPY: ${realAlpha.bestAlpha.ticker} (${realAlpha.bestAlpha.alpha >= 0 ? "+" : ""}${realAlpha.bestAlpha.alpha}pp)
- Peor pick vs SPY: ${realAlpha.worstAlpha.ticker} (${realAlpha.worstAlpha.alpha >= 0 ? "+" : ""}${realAlpha.worstAlpha.alpha}pp)
INSTRUCCIÓN: Si el alfa promedio es negativo, priorizá SPY. Si es positivo y consistente, los picks están justificados.
` : ""}
${spyBenchmark ? `
BENCHMARK TODO-SPY (DCA simulado — si cada mes hubieras puesto todo en SPY):
- Período: ${spyBenchmark.months} meses | Total aportado: $${spyBenchmark.totalArsInvested.toLocaleString()} ARS
- Portfolio hipotético todo-SPY hoy: $${spyBenchmark.spyPortfolioArs.toLocaleString()} ARS${spyBenchmark.spyPortfolioUsd != null ? ` (≈ USD $${spyBenchmark.spyPortfolioUsd.toLocaleString()})` : ""} (${spyBenchmark.spyReturnPct != null ? `${spyBenchmark.spyReturnPct >= 0 ? "+" : ""}${spyBenchmark.spyReturnPct}%` : "N/A"})
- Portfolio real hoy: $${spyBenchmark.actualTotalArs.toLocaleString()} ARS${spyBenchmark.actualTotalUsd != null ? ` (≈ USD $${spyBenchmark.actualTotalUsd.toLocaleString()})` : ""} (${spyBenchmark.actualReturnPct != null ? `${spyBenchmark.actualReturnPct >= 0 ? "+" : ""}${spyBenchmark.actualReturnPct}%` : "N/A"})
- DIFERENCIA vs todo-SPY: ${spyBenchmark.alphaArs >= 0 ? "+" : ""}$${spyBenchmark.alphaArs.toLocaleString()} ARS${spyBenchmark.alphaUsd != null ? ` (${spyBenchmark.alphaUsd >= 0 ? "+" : ""}USD $${spyBenchmark.alphaUsd.toLocaleString()})` : ""} ${spyBenchmark.beatsSpy ? "✅ GANANDO vs SPY puro" : "❌ PERDIENDO vs SPY puro"}
INSTRUCCIÓN CRÍTICA: ${spyBenchmark.beatsSpy
  ? "El inversor está GANANDO vs indexar puro en SPY. Esto justifica mantener picks activos si el alfa real de predicciones es consistente."
  : "El inversor está PERDIENDO vs indexar puro en SPY. Esto es una señal fuerte para reducir picks activos y aumentar el core SPY."
}
` : ""}
`;

  return {
    context,
    portfolioValueARS,
    portfolioValueUsd,
    positionsWithData,
    sectorPcts,
    monthNumber: monthsSinceStart,
    currentMonth,
    cartEraYaAlineada,
    usdPnl: {
      totalCost: Math.round(totalUsdCost * 100) / 100,
      totalCurrentValue: Math.round(totalUsdCurrentValue * 100) / 100,
      totalPnl: totalPnlUsd,
      totalPnlPct: totalPnlUsdPct,
    },
    spyBenchmark,
    realAlpha,
  };
}
