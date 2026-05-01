/** @format */
// ============================================================
// BACKGROUND JOBS & SEEDING
// Extracted from index.js to keep the server file focused on routing
// ============================================================

import { FLAGS } from "./featureFlags.js";
import { BACKTEST_CONFIG, DB_CONFIG, AI_CONFIG } from "./config.js";
import {
  getPortfolioSummary, getPortfolio, addPosition, logCapital,
  getPredictions, evaluatePredictionsForTicker, getCapitalHistory,
  savePostMortem, getPostMortems, getLatestLessons,
  getVirtualPortfolioSummary, resetVirtualPortfolio, addVirtualPosition,
  getPaperTradingConfig, saveTrackRecord, getTrackRecord,
} from "./database.js";
import { fetchQuote, fetchAllQuotes, fetchBymaPrices, fetchCCL, fetchHistory } from "./marketData.js";
import { calcPriceARS, safeJsonParse } from "./utils.js";
import { checkPortfolioDrawdown } from "./riskManager.js";
import { dispatchAlerts } from "./alerting.js";
import { runBacktest } from "./backtest.js";
import { getClient, extractJSON } from "./aiAdvisor.js";
import { assertAiBudgetAvailable, recordAnthropicUsage } from "./aiUsage.js";
import { calculateSpyBenchmark } from "./performance.js";
import { calcSharpeRatio, inferPeriodsPerYearFromDates } from "./riskMetrics.js";
import CEDEARS from "./cedears.js";

// ── AUTO SEED ──
export async function seedIfEmpty() {
  if (!FLAGS.ENABLE_BOOTSTRAP_SEED) {
    console.log("[seed] ENABLE_BOOTSTRAP_SEED=false. No se seedeará portfolio sintético.");
    return;
  }
  const summary = await getPortfolioSummary();
  if (summary.length > 0) return;
  console.log("⚡ DB vacía — seeding portfolio inicial...");
  const PORTFOLIO = [
    { ticker: "ABBV", shares: 5, priceArs: 34830.26, notes: "Healthcare defensivo" },
    { ticker: "AMZN", shares: 120, priceArs: 2197.24, notes: "E-commerce/cloud" },
    { ticker: "COIN", shares: 9, priceArs: 11054.19, notes: "Crypto exposure" },
    { ticker: "COST", shares: 5, priceArs: 30441.25, notes: "Consumer defensive" },
    { ticker: "GOOGL", shares: 12, priceArs: 8128.74, notes: "Big tech / AI" },
    { ticker: "MSFT", shares: 10, priceArs: 20867.96, notes: "Big tech / cloud" },
    { ticker: "NVDA", shares: 13, priceArs: 11697.33, notes: "AI / semiconductors" },
    { ticker: "QCOM", shares: 7, priceArs: 18381.52, notes: "Semiconductors" },
    { ticker: "QQQ", shares: 2, priceArs: 45561.21, notes: "ETF Nasdaq 100" },
    { ticker: "SPY", shares: 5, priceArs: 51440.07, notes: "ETF S&P 500" },
    { ticker: "UNH", shares: 15, priceArs: 12985.85, notes: "Healthcare" },
    { ticker: "V", shares: 7, priceArs: 26400.25, notes: "Financial / pagos" },
  ];
  for (const pos of PORTFOLIO) {
    try { await addPosition(pos.ticker, pos.shares, pos.priceArs, null, null, pos.notes); } catch (e) { console.error(`Seed error ${pos.ticker}:`, e.message); }
  }
  await logCapital(35170, 1964830, null, BACKTEST_CONFIG.defaultMonthlyDeposit);
  console.log(`✓ Portfolio seeded: ${PORTFOLIO.length} posiciones`);
}

export async function autoSeedHistoricalLessons() {
  if (!FLAGS.ENABLE_SYNTHETIC_HISTORY_SEED) {
    console.log("[seed] ENABLE_SYNTHETIC_HISTORY_SEED=false. No se generará historial sintético.");
    return null;
  }
  const existing = await getPostMortems(50);
  if (existing.some((pm) => pm.month_label?.includes("Histórico"))) {
    console.log("[seed] Experiencia histórica ya existe, saltando.");
    return null;
  }
  console.log("[seed] Generando experiencia histórica automáticamente...");
  const bt = await runBacktest({ months: 12, monthlyDeposit: BACKTEST_CONFIG.defaultMonthlyDeposit, profile: "moderate", picksPerMonth: BACKTEST_CONFIG.defaultPicksPerMonth });
  if (!bt || bt.error) throw new Error(bt?.error || "Backtest falló");

  const holdings = bt.satellite?.holdings || [];
  const winners = holdings.filter((h) => h.returnPct > 0);
  const sectorMap = {};
  for (const h of holdings) {
    if (!sectorMap[h.sector]) sectorMap[h.sector] = [];
    sectorMap[h.sector].push(h.returnPct);
  }
  const sectorLessons = Object.entries(sectorMap)
    .map(([sector, returns]) => ({ sector, avgReturn: Math.round((returns.reduce((a, b) => a + b, 0) / returns.length) * 100) / 100, count: returns.length }))
    .sort((a, b) => b.avgReturn - a.avgReturn);

  const bestSector = sectorLessons[0];
  const worstSector = sectorLessons[sectorLessons.length - 1];
  const accuracy = holdings.length > 0 ? Math.round((winners.length / holdings.length) * 100) : 0;
  const generaAlfa = bt.satellite?.generaAlfa || false;

  await savePostMortem({
    monthLabel: "Histórico (12M backtest automático)",
    totalPredictions: holdings.length,
    correctPredictions: winners.length,
    accuracyPct: accuracy,
    totalReturnPct: bt.satellite?.returnPct || 0,
    spyReturnPct: bt.resultado?.spyReturnPct || 0,
    beatSpy: generaAlfa,
    bestPick: bt.satellite?.mejorPick?.ticker || null,
    bestPickReturn: bt.satellite?.mejorPick?.returnPct || null,
    worstPick: bt.satellite?.peorPick?.ticker || null,
    worstPickReturn: bt.satellite?.peorPick?.returnPct || null,
    lessonsLearned: `Análisis automático de 12 meses de backtest. Mejor sector: ${bestSector?.sector || "N/A"} (promedio ${bestSector?.avgReturn}%). Peor sector: ${worstSector?.sector || "N/A"} (promedio ${worstSector?.avgReturn}%). ${generaAlfa ? "El satellite generó alfa vs SPY." : "El satellite NO superó a SPY, priorizar core alto en SPY/QQQ."}`,
    selfImposedRules: JSON.stringify([
      `Priorizar ${bestSector?.sector || "sectores defensivos"} que históricamente rindió mejor (${bestSector?.avgReturn}% prom.)`,
      `Ser cauteloso con ${worstSector?.sector || "sectores volátiles"} que históricamente rindió peor (${worstSector?.avgReturn}% prom.)`,
      generaAlfa ? "El stock picking agrega valor en este perfil, mantener satellite activo" : "El stock picking NO superó a SPY, mantener core alto (60%+) y satellite mínimo",
      `Accuracy histórica: ${winners.length}/${holdings.length} picks positivos (${accuracy}%)`,
    ]),
    patternsDetected: JSON.stringify(sectorLessons.map((s) => `${s.sector}: promedio ${s.avgReturn >= 0 ? "+" : ""}${s.avgReturn}% en ${s.count} picks`)),
    confidenceInStrategy: generaAlfa ? 65 : 45,
    rawAiResponse: JSON.stringify({ type: "automated_backtest_analysis", satelliteReturn: bt.satellite?.returnPct, spyReturn: bt.resultado?.spyReturnPct }),
  });
  console.log(`[seed] Experiencia histórica guardada: ${winners.length}/${holdings.length} picks positivos.`);
  return { totalPicks: holdings.length, winners: winners.length, accuracy, satelliteAlfa: generaAlfa, sectorAnalysis: sectorLessons };
}

// ── BACKGROUND JOBS ──
let autoEvalRunning = false;
let stopLossRunning = false;

export async function runAutoEvaluation() {
  if (!FLAGS.ENABLE_AUTO_EVAL || autoEvalRunning) return;
  autoEvalRunning = true;
  try {
    const pending = await getPredictions(null, true, 200);
    if (pending.length === 0) return;
    const tickers = [...new Set(pending.map((p) => p.ticker))];
    let totalEvaluated = 0;
    for (const ticker of tickers) {
      try {
        const [q, qBa, history] = await Promise.all([
          fetchQuote(ticker).catch(() => null),
          fetchQuote(`${ticker}.BA`).catch(() => null),
          fetchHistory(ticker, 6).catch(() => []),
        ]);
        if (q?.price || qBa?.price) {
          const results = await evaluatePredictionsForTicker(ticker, q?.price ?? null, qBa?.price ?? null, history);
          totalEvaluated += results.length;
        }
      } catch (e) { console.warn(`[auto-eval] Error evaluando ${ticker}:`, e.message); }
    }
    if (totalEvaluated > 0) console.log(`[auto-eval] ${totalEvaluated} predicciones evaluadas automáticamente.`);
  } catch (err) { console.error("[auto-eval] Error:", err.message); }
  finally { autoEvalRunning = false; }
}

export async function runStopLossCheck() {
  if (!FLAGS.ENABLE_STOP_LOSS_ALERTS || stopLossRunning) return;
  stopLossRunning = true;
  try {
    const activePicks = await getPredictions(null, true, 200);
    const buyPicks = activePicks.filter((p) => p.action === "COMPRAR" && p.stop_loss_pct != null && p.price_usd_at_prediction > 0);
    if (buyPicks.length === 0) return;

    const alerts = [];
    for (const pick of buyPicks) {
      try {
        const q = await fetchQuote(pick.ticker).catch(() => null);
        if (!q?.price) continue;
        const changePct = ((q.price - pick.price_usd_at_prediction) / pick.price_usd_at_prediction) * 100;
        if (changePct <= pick.stop_loss_pct) {
          const msg = `STOP-LOSS activado: ${pick.ticker} cayó ${changePct.toFixed(1)}% (stop: ${pick.stop_loss_pct}%). Precio actual: $${q.price.toFixed(2)} vs entrada: $${pick.price_usd_at_prediction.toFixed(2)}.`;
          console.warn(`[stop-loss] ${msg}`);
          alerts.push({ level: "critical", code: `stop_loss_${pick.ticker}`, message: msg });
          try {
            const { sendStopLossAlert } = await import("./telegramBot.js");
            await sendStopLossAlert(pick.ticker, pick.price_usd_at_prediction, q.price, pick.stop_loss_pct, changePct);
          } catch (_) {}
        }
      } catch (e) { console.warn(`[stop-loss] Error chequeando ${pick.ticker}:`, e.message); }
    }
    if (alerts.length > 0) await dispatchAlerts(alerts, { source: "stop-loss-monitor" });
  } catch (err) { console.error("[stop-loss] Error:", err.message); }
  finally { stopLossRunning = false; }
}

export async function runDailyCapitalLog() {
  if (!FLAGS.ENABLE_DAILY_CAPITAL_LOG) return;
  try {
    const history = await getCapitalHistory(1);
    if (history.length > 0) {
      const lastDate = String(history[0].date || "").slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      if (lastDate === today) return;
    }

    const portfolio = await getPortfolioSummary();
    if (portfolio.length === 0) return;

    const tickers = portfolio.map((p) => p.ticker);
    const [quotesMap, bymaPrices, ccl] = await Promise.all([
      fetchAllQuotes(tickers).catch(() => ({})),
      fetchBymaPrices(tickers).catch(() => ({})),
      fetchCCL().catch(() => ({ venta: 1200 })),
    ]);

    let portfolioValueArs = 0;
    for (const pos of portfolio) {
      const byma = bymaPrices[pos.ticker];
      const quote = quotesMap[pos.ticker];
      const cedearDef = CEDEARS.find((c) => c.ticker === pos.ticker);
      const priceArs = byma?.priceARS || calcPriceARS(quote?.price, ccl.venta, cedearDef?.ratio) || pos.weighted_avg_price;
      portfolioValueArs += (priceArs || pos.weighted_avg_price) * pos.total_shares;
    }

    const lastKnownAvailable = history[0]?.capital_available_ars ?? 0;
    await logCapital(lastKnownAvailable, Math.round(portfolioValueArs), ccl.venta);
    console.log(`[capital-log] Portfolio: $${Math.round(portfolioValueArs).toLocaleString()} ARS | Efectivo (carry-fwd): $${Math.round(lastKnownAvailable).toLocaleString()}`);

    // Check drawdown and alert if needed
    const capitalHist = await getCapitalHistory(30);
    const drawdown = checkPortfolioDrawdown(capitalHist);
    if (drawdown.alert) {
      console.warn(`[drawdown] ${drawdown.alert}`);
      await dispatchAlerts([{ level: "critical", code: "portfolio_drawdown", message: drawdown.alert }], { source: "risk-monitor" });
    }
  } catch (err) { console.error("[capital-log] Error:", err.message); }
}

// ── TAKE-PROFIT CHECK ──
let takeProfitRunning = false;

export async function runTakeProfitCheck() {
  if (!FLAGS.ENABLE_STOP_LOSS_ALERTS || takeProfitRunning) return; // reuse same flag for simplicity
  takeProfitRunning = true;
  try {
    const activePicks = await getPredictions(null, true, 200);
    const buyPicks = activePicks.filter((p) => p.action === "COMPRAR" && p.target_pct != null && p.price_usd_at_prediction > 0);
    if (buyPicks.length === 0) return;

    const alerts = [];
    for (const pick of buyPicks) {
      try {
        const q = await fetchQuote(pick.ticker).catch(() => null);
        if (!q?.price) continue;
        const changePct = ((q.price - pick.price_usd_at_prediction) / pick.price_usd_at_prediction) * 100;
        if (changePct >= pick.target_pct) {
          const msg = `TAKE-PROFIT alcanzado: ${pick.ticker} subio ${changePct.toFixed(1)}% (target: +${pick.target_pct}%). Precio actual: $${q.price.toFixed(2)} vs entrada: $${pick.price_usd_at_prediction.toFixed(2)}.`;
          console.warn(`[take-profit] ${msg}`);
          alerts.push({ level: "info", code: `take_profit_${pick.ticker}`, message: msg });
          // Send Telegram if configured
          try {
            const { sendTakeProfitAlert } = await import("./telegramBot.js");
            await sendTakeProfitAlert(pick.ticker, pick.price_usd_at_prediction, q.price, pick.target_pct, changePct);
          } catch (_) {}
        }
      } catch (e) { console.warn(`[take-profit] Error chequeando ${pick.ticker}:`, e.message); }
    }
    if (alerts.length > 0) await dispatchAlerts(alerts, { source: "take-profit-monitor" });
  } catch (err) { console.error("[take-profit] Error:", err.message); }
  finally { takeProfitRunning = false; }
}

// ── ML PIPELINE ──
let mlPipelineRunning = false;

export async function runMLPipeline() {
  if (!FLAGS.ENABLE_ML_AUTO_COLLECT || mlPipelineRunning) return;
  mlPipelineRunning = true;
  try {
    const { runMLPipeline } = await import("./mlEngine.js");
    const ccl = await fetchCCL().catch(() => ({ venta: 1200 }));
    const tickers = CEDEARS.slice(0, 20).map((c) => c.ticker);
    const result = await runMLPipeline(tickers, ccl.venta);
    console.log(`[ml] Pipeline: ${result.collected} filas recolectadas. Modelo accuracy: ${result.model?.accuracy ?? "N/A"}%`);
  } catch (err) { console.error("[ml] Pipeline error:", err.message); }
  finally { mlPipelineRunning = false; }
}

// ── MONTHLY POST-MORTEM ──
let postMortemRunning = false;

export async function runMonthlyPostMortem() {
  if (!process.env.ANTHROPIC_API_KEY) return;
  if (postMortemRunning) return;

  // Verificar si ya corrió este mes
  const existing = await getPostMortems(1);
  if (existing.length > 0) {
    const lastMonth = existing[0].month_label;
    const currentMonth = new Date().toLocaleString("es-AR", { month: "long", year: "numeric" });
    if (lastMonth === currentMonth) {
      console.log("[postmortem] Ya existe para este mes, saltando.");
      return;
    }
  }

  postMortemRunning = true;
  try {
    // 1. Evaluar predicciones pendientes
    const pending = await getPredictions(null, true);
    const tickersToEval = [...new Set(pending.map((p) => p.ticker))];
    for (const t of tickersToEval) {
      try {
        const [q, qBa, history] = await Promise.all([
          fetchQuote(t).catch(() => null),
          fetchQuote(`${t}.BA`).catch(() => null),
          fetchHistory(t, 6).catch(() => []),
        ]);
        if (q || qBa) await evaluatePredictionsForTicker(t, q?.price ?? null, qBa?.price ?? null, history);
      } catch (e) { console.warn(`[postmortem] Eval error ${t}:`, e.message); }
    }

    // 2. Calcular estadísticas
    const allPreds = await getPredictions(null, false, 50);
    const oneMonthAgo = new Date(Date.now() - 35 * 86400000).toISOString();
    const recentEvaluated = allPreds.filter((p) => p.evaluated && p.prediction_date > oneMonthAgo);
    if (recentEvaluated.length === 0) {
      console.log("[postmortem] No hay predicciones evaluadas del último mes.");
      return;
    }

    const correct = recentEvaluated.filter((p) => p.prediction_correct === 1).length;
    const total = recentEvaluated.length;
    const accuracy = Math.round((correct / total) * 100);
    const avgReturn = recentEvaluated.reduce((s, p) => s + (p.actual_change_pct || 0), 0) / total;
    const sorted = [...recentEvaluated].sort((a, b) => (b.actual_change_pct || 0) - (a.actual_change_pct || 0));
    const bestPick = sorted[0];
    const worstPick = sorted[sorted.length - 1];

    // 3. Generar con Claude
    const client = getClient();
    const predsDetail = recentEvaluated.map((p) => `- ${p.prediction_date?.slice(0, 10)} | ${p.action} ${p.ticker} | Conf: ${p.confidence}% | Resultado: ${p.actual_change_pct != null ? `${p.actual_change_pct >= 0 ? "+" : ""}${p.actual_change_pct}%` : "N/A"} | ${p.prediction_correct === 1 ? "ACERTÉ" : "FALLÉ"} | Razón: "${(p.reasoning || "").slice(0, 80)}"`).join("\n");
    const prevLessons = await getLatestLessons();
    const prevContext = prevLessons.length > 0 ? `\nLECCIONES DE MESES ANTERIORES:\n${prevLessons.map((l) => `[${l.month_label}] Lecciones: ${l.lessons_learned}\nReglas: ${l.self_imposed_rules}`).join("\n\n")}` : "";

    const pmPrompt = `Sos un asesor financiero haciendo tu POST-MORTEM MENSUAL. Revisá TODAS tus predicciones del último mes y generá un análisis honesto.

ESTADÍSTICAS DEL MES:
- Predicciones totales: ${total}
- Aciertos: ${correct} (${accuracy}%)
- Retorno promedio de tus picks: ${avgReturn.toFixed(2)}%
- Mejor pick: ${bestPick?.ticker} (${bestPick?.actual_change_pct}%)
- Peor pick: ${worstPick?.ticker} (${worstPick?.actual_change_pct}%)

DETALLE:
${predsDetail}
${prevContext}

Respondé SOLO con JSON válido:
{
  "resumen_mes": "2-3 oraciones",
  "aciertos_analisis": "Qué hiciste bien",
  "errores_analisis": "En qué fallaste. Sé específico",
  "patrones_detectados": ["Patrón 1"],
  "reglas_nuevas": ["Regla 1"],
  "ajustes_estrategia": "Qué vas a hacer diferente",
  "confianza_estrategia": 70,
  "nota_para_mi_yo_futuro": "Mensaje para vos el mes que viene"
}`;

    const model = AI_CONFIG.model;
    await assertAiBudgetAvailable("/jobs/postmortem");
    const startedAt = Date.now();
    let response;
    try {
      response = await client.messages.create({ model, max_tokens: AI_CONFIG.maxTokensPostMortem, system: "Sos un asesor financiero haciendo autocrítica honesta. Sé brutalmente honesto. Respondé SOLO JSON.", messages: [{ role: "user", content: pmPrompt }] });
      await recordAnthropicUsage({ route: "/jobs/postmortem", model, response, latencyMs: Date.now() - startedAt, success: true });
    } catch (llmErr) {
      await recordAnthropicUsage({ route: "/jobs/postmortem", model, response: null, latencyMs: Date.now() - startedAt, success: false, errorMessage: llmErr.message });
      throw llmErr;
    }

    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const jsonStr = extractJSON(text);
    if (!jsonStr) throw new Error("No se pudo parsear respuesta de Claude");
    const pmResult = JSON.parse(jsonStr);

    const monthLabel = new Date().toLocaleString("es-AR", { month: "long", year: "numeric" });
    await savePostMortem({
      monthLabel, totalPredictions: total, correctPredictions: correct, accuracyPct: accuracy,
      totalReturnPct: Math.round(avgReturn * 100) / 100, spyReturnPct: null, beatSpy: false,
      bestPick: bestPick?.ticker, bestPickReturn: bestPick?.actual_change_pct,
      worstPick: worstPick?.ticker, worstPickReturn: worstPick?.actual_change_pct,
      lessonsLearned: (pmResult.aciertos_analisis || "") + " | " + (pmResult.errores_analisis || ""),
      selfImposedRules: JSON.stringify(pmResult.reglas_nuevas || []),
      patternsDetected: JSON.stringify(pmResult.patrones_detectados || []),
      confidenceInStrategy: pmResult.confianza_estrategia,
      rawAiResponse: JSON.stringify(pmResult),
    });

    console.log(`[postmortem] Generado para ${monthLabel}: ${correct}/${total} aciertos (${accuracy}%)`);
  } catch (err) {
    console.error("[postmortem] Error:", err.message);
  } finally {
    postMortemRunning = false;
  }
}

// ── AUTO PAPER TRADING ──
export async function runAutoPaperTrading(aiAnalysis) {
  try {
    const config = await getPaperTradingConfig();
    if (!config.autoSyncEnabled) return;
    const picks = aiAnalysis?.decision_mensual?.picks_activos || aiAnalysis?.picks || aiAnalysis?.recommendations;
    if (!picks || !picks.length) return;

    const { simulateBuyExecution } = await import("./executionSimulator.js");
    const { logVirtualTransaction } = await import("./database.js");

    await resetVirtualPortfolio([]);
    let executedCount = 0;
    for (const pick of picks) {
      if (!pick.ticker || !pick.cantidad_cedears || !pick.precio_aprox_ars) continue;
      const tradeAmountArs = pick.cantidad_cedears * pick.precio_aprox_ars;
      const simulated = await simulateBuyExecution(pick.ticker, pick.cantidad_cedears, pick.precio_aprox_ars, tradeAmountArs, true);

      await logVirtualTransaction({
        ticker: pick.ticker,
        type: "BUY",
        shares: simulated.executedShares,
        requestedShares: simulated.requestedShares,
        executedShares: simulated.executedShares,
        requestedPriceArs: simulated.requestedPrice,
        executedPriceArs: simulated.executedPrice,
        slippagePct: simulated.slippagePct,
        delayMinutes: simulated.delayMinutes,
        partialFill: simulated.partialFill,
        brokerCostsArs: simulated.brokerCosts.totalCosts,
        totalCostArs: simulated.totalCostArs,
        notes: simulated.liquidityWarning || `Auto-sync ${pick.ticker}`,
      });

      if (simulated.executedShares > 0) {
        await addVirtualPosition(pick.ticker, simulated.executedShares, simulated.executedPrice, pick.nombre || "");
        executedCount++;
      }
    }
    console.log(`[auto-paper] Portfolio virtual sincronizado: ${executedCount}/${picks.length} picks ejecutados con simulación realista`);
  } catch (err) {
    console.error("[auto-paper] Error:", err.message);
  }
}

// ── CORPORATE ACTIONS SCAN ──
let corpActionsRunning = false;
export async function runCorporateActionsScan() {
  if (corpActionsRunning) return;
  corpActionsRunning = true;
  try {
    const { scanCorporateActions } = await import("./corporateActions.js");
    const result = await scanCorporateActions();
    console.log(`[corp-actions] Scan: ${result.dividends} dividends, ${result.splits} splits`);
  } catch (err) {
    console.error("[corp-actions] Error:", err.message);
  } finally {
    corpActionsRunning = false;
  }
}

// ── TRACK RECORD LOGGING ──
export async function runTrackRecordLog() {
  try {
    const [virtualPortfolio, realPortfolio, capitalHist, ccl] = await Promise.all([
      getVirtualPortfolioSummary().catch(() => []),
      getPortfolioSummary().catch(() => []),
      getCapitalHistory(1).catch(() => []),
      fetchCCL().catch(() => ({ venta: 0 })),
    ]);

    const allTickers = [...new Set([...virtualPortfolio.map((p) => p.ticker), ...realPortfolio.map((p) => p.ticker)])];
    const [quotesMap, bymaPrices] = await Promise.all([
      fetchAllQuotes(allTickers).catch(() => ({})),
      allTickers.length > 0 ? fetchBymaPrices(allTickers).catch(() => ({})) : {},
    ]);

    // Virtual value with dividends
    let virtualValue = 0;
    for (const pos of virtualPortfolio) {
      const cedearDef = CEDEARS.find((c) => c.ticker === pos.ticker);
      const byma = bymaPrices[pos.ticker];
      const quote = quotesMap[pos.ticker];
      const price = byma?.priceARS || calcPriceARS(quote?.price, ccl.venta, cedearDef?.ratio) || pos.weighted_avg_price;
      virtualValue += price * pos.total_shares;
    }

    // Dividendos virtuales
    let virtualDividends = 0;
    try {
      const { calculateVirtualDividends } = await import("./corporateActions.js");
      const divData = await calculateVirtualDividends(
        virtualPortfolio.map((p) => ({ ticker: p.ticker, shares: p.total_shares })),
        ccl.venta || 1200
      );
      virtualDividends = divData.totalArs;
    } catch (e) { /* ignore */ }

    const virtualTotal = virtualValue + virtualDividends;

    let realValue = 0;
    for (const pos of realPortfolio) {
      const cedearDef = CEDEARS.find((c) => c.ticker === pos.ticker);
      const byma = bymaPrices[pos.ticker];
      const quote = quotesMap[pos.ticker];
      const price = byma?.priceARS || calcPriceARS(quote?.price, ccl.venta, cedearDef?.ratio) || pos.weighted_avg_price;
      realValue += price * pos.total_shares;
    }

    const capital = capitalHist.length > 0 ? capitalHist[0].capital_available_ars : 0;
    const today = new Date().toISOString().slice(0, 10);

    // SPY benchmark más preciso: simular cartera equivalente en SPY
    let spyValue = 0;
    try {
      const spyBenchmark = await calculateSpyBenchmark(ccl.venta || null).catch(() => null);
      spyValue = Math.round(spyBenchmark?.spyPortfolioArs || 0);
    } catch { /* ignore spy calc errors */ }

    // Calcular métricas diarias vs el registro anterior
    let alphaVsSpy = null;
    let dailyReturn = null;
    let spyDailyReturn = null;
    let drawdown = null;
    let rollingSharpe = null;

    try {
      const previous = await getTrackRecord(2);
      if (previous.length >= 2) {
        const prev = previous[previous.length - 2];
        // Use virtual total when available, fall back to real portfolio value
        const prevTracked = (prev.virtual_total_ars || prev.virtual_value_ars) > 0
          ? (prev.virtual_total_ars || prev.virtual_value_ars)
          : (prev.real_value_ars || 0);
        const trackedNow = virtualTotal > 0 ? virtualTotal : realValue;
        const prevSpy = prev.spy_value_ars || 1;

        dailyReturn = prevTracked > 0 ? ((trackedNow - prevTracked) / prevTracked) * 100 : 0;
        spyDailyReturn = prevSpy > 0 ? ((spyValue - prevSpy) / prevSpy) * 100 : 0;
        alphaVsSpy = (dailyReturn || 0) - (spyDailyReturn || 0);
      }

      // Drawdown desde pico histórico (usa virtual si disponible, si no real)
      const allHistory = await getTrackRecord(365);
      let peak = 0;
      for (const h of allHistory) {
        const v = (h.virtual_total_ars || h.virtual_value_ars) > 0
          ? (h.virtual_total_ars || h.virtual_value_ars)
          : (h.real_value_ars || 0);
        if (v > peak) peak = v;
      }
      const trackedNow = virtualTotal > 0 ? virtualTotal : realValue;
      drawdown = peak > 0 ? ((trackedNow - peak) / peak) * 100 : 0;

      // Rolling Sharpe con frecuencia inferida de la serie real
      const recent30 = allHistory.slice(-30);
      if (recent30.length >= 10) {
        const returns = [];
        for (let i = 1; i < recent30.length; i++) {
          const prev = recent30[i - 1];
          const curr = recent30[i];
          const p = (prev.virtual_total_ars || prev.virtual_value_ars) > 0
            ? (prev.virtual_total_ars || prev.virtual_value_ars)
            : (prev.real_value_ars || 0);
          const c = (curr.virtual_total_ars || curr.virtual_value_ars) > 0
            ? (curr.virtual_total_ars || curr.virtual_value_ars)
            : (curr.real_value_ars || 0);
          if (p > 0) returns.push(((c - p) / p) * 100);
        }
        if (returns.length > 5) {
          const periodsPerYear = inferPeriodsPerYearFromDates(recent30.map((row) => String(row.date || "")));
          const normalizedReturns = returns.map((value) => value / 100);
          rollingSharpe = calcSharpeRatio(normalizedReturns, 0.45, periodsPerYear);
        }
      }
    } catch (e) { /* ignore calc errors */ }

    // Check existing record to avoid overwriting good values with 0 (e.g. when markets are closed)
    const existing = await getTrackRecord(1).catch(() => []);
    const existingToday = existing.find((r) => r.date === today);
    const safeReal = realValue > 0 ? realValue : (existingToday?.real_value_ars || 0);
    const safeSpy = spyValue > 0 ? spyValue : (existingToday?.spy_value_ars || 0);

    await saveTrackRecord({
      date: today,
      virtualValueArs: virtualValue,
      realValueArs: safeReal,
      spyValueArs: safeSpy,
      capitalArs: capital,
      cclRate: ccl.venta || null,
      virtualDividendsArs: virtualDividends,
      virtualTotalArs: virtualTotal,
      alphaVsSpyPct: alphaVsSpy != null ? Math.round(alphaVsSpy * 100) / 100 : null,
      drawdownFromPeakPct: drawdown != null ? Math.round(drawdown * 100) / 100 : null,
      dailyReturnPct: dailyReturn != null ? Math.round(dailyReturn * 100) / 100 : null,
      spyDailyReturnPct: spyDailyReturn != null ? Math.round(spyDailyReturn * 100) / 100 : null,
      rollingSharpe: rollingSharpe != null ? Math.round(rollingSharpe * 100) / 100 : null,
    });

    console.log(`[track-record] Guardado: virtual=${Math.round(virtualValue)} div=${Math.round(virtualDividends)} total=${Math.round(virtualTotal)} real=${Math.round(realValue)} spy=${Math.round(spyValue)} alpha=${alphaVsSpy?.toFixed(2) || "-"} dd=${drawdown?.toFixed(2) || "-"}`);
  } catch (err) {
    console.error("[track-record] Error:", err.message);
  }
}

export async function runDailyMaintenanceCycle() {
  await runAutoEvaluation();
  await runDailyCapitalLog();
  await runStopLossCheck();
  await runTakeProfitCheck();
  await runMonthlyPostMortem();
  await runMLPipeline();
  await runTrackRecordLog();
}
