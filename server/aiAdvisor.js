/** @format */
// ============================================================
// AI ADVISOR SERVICE v2
// Compressed prompts, centralized config, shared utilities
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import NodeCache from "node-cache";
import {
  logPrediction, logAnalysisSession, buildAIContext, getLatestLessons, logDecisionAudit, logCapital, logAdherenceEntries,
} from "./database.js";
import { buildMonthlyCycleContext } from "./investmentCycle.js";
import { runBacktest } from "./backtest.js";
import { getMarketKnowledge } from "./marketKnowledge.js";
import { assertAiBudgetAvailable, recordAnthropicUsage } from "./aiUsage.js";
import { FLAGS } from "./featureFlags.js";
import { fetchQuote, fetchVIX } from "./marketData.js";
import CEDEARS from "./cedears.js";
import { PROFILE_CONFIG, AI_CONFIG, RISK_CONFIG } from "./config.js";
import {
  toFiniteNumber, roundMoney, clampPct, isSellAction,
  getPriceArsFromRankingItem, getFundData, sleep, safeJsonParse,
} from "./utils.js";

const backtestCache = new NodeCache({ stdTTL: AI_CONFIG.backtestCacheTtlMs / 1000 });

let client = null;
export function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function getProfileConfig(profileId = "moderate") {
  return PROFILE_CONFIG[profileId] || PROFILE_CONFIG.moderate;
}

function buildPriceMap({ ranking = [], cycleData, ccl }) {
  const map = {};
  for (const pos of cycleData?.positionsWithData || []) {
    const ticker = String(pos?.ticker || "").toUpperCase();
    const price = roundMoney(pos?.currentPrice);
    if (ticker && price > 0) map[ticker] = price;
  }
  for (const item of ranking || []) {
    const ticker = String(item?.cedear?.ticker || item?.ticker || "").toUpperCase();
    if (!ticker) continue;
    const priceArs = getPriceArsFromRankingItem(item, ccl);
    if (priceArs && priceArs > 0) map[ticker] = priceArs;
  }
  return map;
}

export function enforceAnalysisConsistency({ result, capital, coreETF, profile, cycleData, ranking, ccl }) {
  const notes = [];
  const priceMap = buildPriceMap({ ranking, cycleData, ccl });
  const positionsMap = {};
  for (const pos of cycleData?.positionsWithData || []) {
    positionsMap[String(pos.ticker || "").toUpperCase()] = pos;
  }

  if (!result || typeof result !== "object") return { notes };
  if (!result.decision_mensual || typeof result.decision_mensual !== "object") {
    result.decision_mensual = {};
  }

  const decision = result.decision_mensual;
  decision.core_etf = String(decision.core_etf || coreETF || "SPY").toUpperCase();
  if (!decision.distribucion || typeof decision.distribucion !== "object") {
    decision.distribucion = {};
  }
  if (!Array.isArray(decision.picks_activos)) decision.picks_activos = [];
  if (!Array.isArray(result.acciones_cartera_actual)) result.acciones_cartera_actual = [];

  const dist = decision.distribucion;
  let corePct = clampPct(dist.core_pct);
  let satPct = clampPct(dist.satellite_pct);
  if (corePct + satPct === 0) {
    corePct = clampPct(profile?.corePct ?? 50);
    satPct = 100 - corePct;
    notes.push("Distribucion vacia: se aplico porcentaje base del perfil.");
  } else if (corePct + satPct !== 100) {
    const sum = corePct + satPct;
    corePct = Math.round((corePct / sum) * 100);
    satPct = 100 - corePct;
    notes.push("Distribucion normalizada para sumar 100%.");
  }

  const seenPick = new Set();
  const picks = [];
  for (const raw of decision.picks_activos) {
    const ticker = String(raw?.ticker || "").toUpperCase();
    if (!ticker || seenPick.has(ticker)) continue;
    seenPick.add(ticker);
    const conviction = clampPct(raw?.conviction || 70);
    const trustedPrice = priceMap[ticker] ? roundMoney(priceMap[ticker]) : null;
    const aiPrice = roundMoney(raw?.precio_aprox_ars || 0);
    const price = trustedPrice || aiPrice || 0;
    const priceFromMarket = !!trustedPrice;
    const monto = Math.max(0, roundMoney(raw?.monto_total_ars || 0));
    const cantidad = priceFromMarket && price > 0 && monto > 0
      ? Math.max(1, Math.floor(monto / price))
      : Math.max(0, roundMoney(raw?.cantidad_cedears || 0));

    if (priceFromMarket && trustedPrice !== aiPrice && aiPrice > 0) {
      notes.push(`Precio de ${ticker} corregido con datos de mercado: AI estimó $${aiPrice.toLocaleString()}/CEDEAR → real $${price.toLocaleString()}/CEDEAR. Cantidad recalculada a ${cantidad} CEDEARs.`);
    }

    picks.push({ ...raw, ticker, conviction, precio_aprox_ars: price > 0 ? price : null, cantidad_cedears: cantidad, monto_total_ars: monto, _price_verified: priceFromMarket });
  }
  picks.sort((a, b) => toFiniteNumber(b.conviction, 0) - toFiniteNumber(a.conviction, 0));
  decision.picks_activos = picks;

  if (picks.length === 0) {
    if (satPct !== 0 || corePct !== 100) notes.push("Sin picks activos: se fuerza 100% CORE y 0% SATELLITE.");
    satPct = 0;
    corePct = 100;
  }

  const hadActionable =
    result.acciones_cartera_actual.some((a) => isSellAction(a?.accion) && Math.abs(toFiniteNumber(a?.cantidad_ajustar, 0)) > 0) ||
    picks.length > 0 ||
    (Array.isArray(result.plan_ejecucion) && result.plan_ejecucion.length > 0);

  if (result.sin_cambios_necesarios && hadActionable) {
    result.sin_cambios_necesarios = false;
    notes.push("sin_cambios_necesarios estaba en conflicto con operaciones; se ajusto a false.");
  }

  const sellSteps = [];
  const sellMap = {};
  let totalVentasARS = 0;
  for (const action of result.acciones_cartera_actual) {
    const actionType = String(action?.accion || "").toUpperCase();
    if (!isSellAction(actionType)) continue;
    const ticker = String(action?.ticker || "").toUpperCase();
    const pos = positionsMap[ticker];
    if (!pos) continue;

    let qty = 0;
    if (actionType === "VENDER TODO") qty = roundMoney(pos.shares);
    else {
      qty = Math.abs(roundMoney(action?.cantidad_ajustar || 0));
      if (qty === 0 && actionType === "VENDER") qty = roundMoney(pos.shares);
    }
    qty = Math.min(qty, roundMoney(pos.shares));
    if (qty <= 0) continue;

    const price = roundMoney(pos.currentPrice || priceMap[ticker] || 0);
    if (price <= 0) continue;
    const amount = roundMoney(qty * price);
    totalVentasARS += amount;
    sellMap[ticker] = { qty, price, amount };
    sellSteps.push({ tipo: "VENDER", ticker, cantidad_cedears: qty, monto_estimado_ars: amount, nota: action?.razon || "Liberar capital - ejecutar primero" });

    if (actionType === "REDUCIR") action.cantidad_ajustar = -qty;
    else if (actionType === "VENDER" || actionType === "VENDER TODO") action.cantidad_ajustar = -qty;
  }

  const capitalDisponiblePost = roundMoney(capital + totalVentasARS);
  const aCoreArs = roundMoney(capitalDisponiblePost * (corePct / 100));
  const aSatelliteArs = Math.max(0, capitalDisponiblePost - aCoreArs);

  dist.core_pct = corePct;
  dist.satellite_pct = satPct;
  dist.core_monto_ars = aCoreArs;
  dist.satellite_monto_ars = aSatelliteArs;

  if (!result.resumen_operaciones || typeof result.resumen_operaciones !== "object") result.resumen_operaciones = {};
  result.resumen_operaciones.capital_disponible_actual = roundMoney(capital);
  result.resumen_operaciones.total_a_vender_ars = totalVentasARS;
  result.resumen_operaciones.capital_disponible_post_ventas = capitalDisponiblePost;
  result.resumen_operaciones.a_core_ars = aCoreArs;
  result.resumen_operaciones.a_satellite_ars = aSatelliteArs;

  const buySteps = [];
  const coreTicker = String(decision.core_etf || coreETF || "SPY").toUpperCase();
  const corePrice = roundMoney(priceMap[coreTicker] || 0);
  if (aCoreArs > 0 && corePrice > 0) {
    const qty = Math.floor(aCoreArs / corePrice);
    const amount = roundMoney(qty * corePrice);
    if (qty > 0 && amount > 0) {
      buySteps.push({ tipo: "COMPRAR", subtipo: "CORE", ticker: coreTicker, cantidad_cedears: qty, monto_estimado_ars: amount, nota: "Core - ejecutar despues de ventas" });
    }
  }

  if (aSatelliteArs > 0 && picks.length > 0) {
    const desiredSum = picks.reduce((sum, p) => sum + Math.max(0, roundMoney(p.monto_total_ars)), 0);
    let remaining = aSatelliteArs;
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      const price = roundMoney(p.precio_aprox_ars || priceMap[p.ticker] || 0);
      if (price <= 0 || remaining <= 0) continue;

      const weight = desiredSum > 0 ? Math.max(0, roundMoney(p.monto_total_ars)) / desiredSum : 1 / picks.length;
      const targetAmount = i === picks.length - 1 ? remaining : Math.min(remaining, roundMoney(aSatelliteArs * weight));
      const qty = Math.floor(targetAmount / price);
      const amount = roundMoney(qty * price);
      if (qty <= 0 || amount <= 0) {
        p.cantidad_cedears = 0;
        p.monto_total_ars = 0;
        continue;
      }
      p.precio_aprox_ars = price;
      p.cantidad_cedears = qty;
      p.monto_total_ars = amount;
      remaining -= amount;
      buySteps.push({ tipo: "COMPRAR", subtipo: "SATELLITE", ticker: p.ticker, cantidad_cedears: qty, monto_estimado_ars: amount, nota: "Satellite pick - ejecutar despues del core" });
    }
  } else if (aSatelliteArs > 0 && picks.length === 0) {
    notes.push("No habia picks activos para asignar el presupuesto satellite.");
  }

  const buyQtyByTicker = Object.fromEntries(buySteps.map((s) => [String(s.ticker || "").toUpperCase(), s.cantidad_cedears]));
  for (const action of result.acciones_cartera_actual) {
    const actionType = String(action?.accion || "").toUpperCase();
    const ticker = String(action?.ticker || "").toUpperCase();
    if (actionType === "AUMENTAR" && buyQtyByTicker[ticker] > 0) action.cantidad_ajustar = buyQtyByTicker[ticker];
  }

  const finalPlan = [...sellSteps, ...buySteps].map((step, idx) => ({ paso: idx + 1, ...step }));
  result.plan_ejecucion = finalPlan;

  const totalCompras = finalPlan.filter((s) => s.tipo === "COMPRAR").reduce((sum, s) => sum + roundMoney(s.monto_estimado_ars), 0);
  if (totalCompras > capitalDisponiblePost) {
    result._budget_warning = `Las compras planificadas ($${totalCompras.toLocaleString()}) superan el capital real disponible ($${capitalDisponiblePost.toLocaleString()}).`;
    notes.push("Compras por encima del capital disponible.");
  } else {
    delete result._budget_warning;
  }

  if (notes.length > 0) result._consistency_notes = notes;
  else delete result._consistency_notes;

  return { notes, totalVentasARS, capitalDisponiblePost };
}

export function detectMacroClaims(text) {
  if (!text || typeof text !== "string") return [];
  const warnings = [];
  const shortTermCtx = /\b(hoy|today|esta semana|this week|sesion|intraday|diario|daily|en el dia|en la semana)\b/i;
  const hasShortTermContext = shortTermCtx.test(text);

  for (const m of text.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)) {
    const val = parseFloat(m[1]);
    if (val >= 100) warnings.push(`Porcentaje ≥100% detectado: "${m[0]}" — probablemente incorrecto.`);
    else if (val >= 80) warnings.push(`Porcentaje inusualmente alto: "${m[0]}" — verificar.`);
    else if (val >= 50 && hasShortTermContext) warnings.push(`Movimiento de ${m[0]} en corto plazo — confirmar.`);
  }
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(trillion|billones?)\b/gi)) {
    if (parseFloat(m[1]) > 500) warnings.push(`Cifra de "${m[0]}" parece fuera de escala.`);
  }
  for (const m of text.matchAll(/(\d+)\s*(?:M|millones?)\s*(?:de\s+)?barriles?/gi)) {
    if (parseInt(m[1]) > 500) warnings.push(`Cantidad de barriles "${m[0]}" supera producción mundial.`);
  }
  return warnings;
}

export function validateAnalysisSchema(result) {
  const errors = [];
  if (!result || typeof result !== "object") return ["La respuesta no es un objeto JSON válido."];
  if (typeof result.resumen_mercado !== "string" || result.resumen_mercado.trim().length === 0) errors.push("resumen_mercado faltante o vacío.");
  if (!result.decision_mensual || typeof result.decision_mensual !== "object") errors.push("decision_mensual faltante.");
  else {
    const dm = result.decision_mensual;
    if (typeof dm.core_etf !== "string" || dm.core_etf.trim().length === 0) errors.push("decision_mensual.core_etf faltante.");
    if (!dm.distribucion || typeof dm.distribucion !== "object") errors.push("decision_mensual.distribucion faltante.");
    else {
      const corePct = Number(dm.distribucion.core_pct);
      const satPct = Number(dm.distribucion.satellite_pct);
      if (!Number.isFinite(corePct) || !Number.isFinite(satPct)) errors.push("decision_mensual.distribucion: core_pct o satellite_pct no son números.");
    }
    if (!Array.isArray(dm.picks_activos)) errors.push("decision_mensual.picks_activos debe ser un array.");
  }
  if (!Array.isArray(result.acciones_cartera_actual)) errors.push("acciones_cartera_actual debe ser un array.");
  if (!result.riesgos || (typeof result.riesgos !== "string" && !Array.isArray(result.riesgos))) errors.push("riesgos faltante.");
  return errors;
}

export function extractJSON(fullText) {
  let jsonStr = "";
  const mdMatch = fullText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (mdMatch) {
    jsonStr = mdMatch[1];
  } else {
    let depth = 0, start = -1, candidates = [];
    for (let i = 0; i < fullText.length; i++) {
      if (fullText[i] === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (fullText[i] === "}") {
        depth--;
        if (depth === 0 && start !== -1) candidates.push(fullText.substring(start, i + 1));
      }
    }
    candidates.sort((a, b) => b.length - a.length);
    for (const cand of candidates) {
      try {
        const cleaned = cand.replace(/[\x00-\x1F\x7F]/g, (ch) => (ch === "\n" || ch === "\r" || ch === "\t" ? ch : " ")).replace(/,\s*([\]}])/g, "$1").replace(/<cite[^>]*>|<\/cite>/g, "");
        JSON.parse(cleaned);
        jsonStr = cleaned;
        break;
      } catch (e) {}
    }
    if (!jsonStr) {
      const fallback = fullText.match(/\{[\s\S]*\}/);
      jsonStr = fallback ? fallback[0] : "";
    }
  }
  return jsonStr.replace(/[\x00-\x1F\x7F]/g, (ch) => (ch === "\n" || ch === "\r" || ch === "\t" ? ch : " ")).replace(/,\s*([\]}])/g, "$1").replace(/<cite[^>]*>|<\/cite>/g, "");
}

// ── COMPRESSED PROMPT BUILDERS ──

function buildBacktestSection(backtestSummary, coreETF) {
  if (!backtestSummary) return "";
  const h = backtestSummary.horizons || [];
  const horizonsTxt = h.length > 1
    ? "\nResumen por horizontes:" + h.map((hh) => `\n- ${hh.months}m: estrategia ${hh.returnPct != null ? hh.returnPct + "%" : "N/A"} vs ${coreETF} ${hh.spyReturnPct != null ? hh.spyReturnPct + "%" : "N/A"} (alfa ${hh.alphaVsSpy != null ? hh.alphaVsSpy + "pp" : "N/A"})`).join("")
    : "";

  const picksTxt = backtestSummary.picksGanadores?.length
    ? backtestSummary.picksGanadores.map((p) => `- ${p.ticker} (${p.sector}) -> vs ${coreETF}: ${p.vsSpy != null ? (p.vsSpy >= 0 ? "+" : "") + p.vsSpy + "pp" : "N/A"}`).join("\n")
    : `Ninguno de los picks actuales aparece como ganador claro vs ${coreETF} en el backtest; sé extremadamente selectivo con el satellite.`;

  return `
BACKTEST RECIENTE (estrategia vs ${coreETF}):
- Principal: ${backtestSummary.months || 6}m | Bot: ${backtestSummary.returnPct != null ? backtestSummary.returnPct + "%" : "N/A"} | ${coreETF}: ${backtestSummary.spyReturnPct != null ? backtestSummary.spyReturnPct + "%" : "N/A"} | Satellite: ${backtestSummary.satelliteReturnPct != null ? backtestSummary.satelliteReturnPct + "%" : "N/A"} (alfa: ${backtestSummary.satelliteAlpha != null ? backtestSummary.satelliteAlpha + "pp" : "N/A"})
- Veredicto: ${backtestSummary.veredicto || "N/A"}${horizonsTxt}
- Picks ganadores en backtest que están en ranking actual:
${picksTxt}
INSTRUCCIÓN: Si el backtest muestra que el satellite NO le gana a ${coreETF}, reducir satellite al mínimo (10-25%). Si hay alfa positivo consistente, justificar satellite más grande dentro del perfil.`;
}

function buildTickerDetails(topPicks, ccl) {
  const today = new Date();
  return topPicks.slice(0, 10).map((p, i) => {
    const fund = getFundData(p.fundamentals);
    const nextEarnings = fund.nextEarningsDate || p.fundamentals?.nextEarningsDate || null;
    let earningsTag = "";
    if (nextEarnings) {
      const days = Math.round((new Date(nextEarnings) - today) / 86400000);
      earningsTag = days <= 7 ? ` ⚠ EARNINGS ${days}d` : days <= 21 ? ` 📅 Earnings ${days}d` : ` | Earnings: ${nextEarnings}`;
    }
    const rsTag = p.rsRating != null ? ` | RS:${p.rsRating}${p.rsRating >= 80 ? "🔥" : p.rsRating <= 30 ? "❄" : ""}` : "";
    const perf = p.technical?.indicators?.performance || {};
    return `${i + 1}. ${p.cedear?.ticker || p.ticker} (${p.cedear.name}) [${p.cedear.sector}]${earningsTag}
   Score:${p.scores.composite}/100 T:${p.scores.techScore} F:${p.scores.fundScore} S:${p.scores.sentScore}${rsTag} | Signal:${p.scores.signal} | Horizon:${p.scores.horizon}
   USD:$${p.quote?.price?.toFixed(2) || "N/A"} | P/E:${fund.pe?.toFixed(1) || "N/A"} EPSg:${fund.epsGrowth?.toFixed(1) || "N/A"}% | Div:${p.quote?.dividendYield?.toFixed(2) || 0}% Beta:${p.quote?.beta?.toFixed(2) || "N/A"}
   1M:${perf.month1?.toFixed(1) || "N/A"}% 3M:${perf.month3?.toFixed(1) || "N/A"}% RSI:${p.technical?.indicators?.rsi || "N/A"} MACD:${p.technical?.indicators?.macd?.histogram || "N/A"}
   Target:$${fund.targetMeanPrice?.toFixed(2) || "N/A"} Rec:${fund.recommendationKey || "N/A"} | Ratio ${p.cedear.ratio}:1 ARS:~$${p.quote?.price ? Math.round(p.quote.price * ccl.venta / p.cedear.ratio) : "N/A"}`;
  }).join("\n\n");
}

function buildSectorRotation(ranking) {
  const map = {};
  for (const item of ranking || []) {
    const sector = item.cedear?.sector;
    const m1 = item.technical?.indicators?.performance?.month1;
    const m3 = item.technical?.indicators?.performance?.month3;
    if (!sector || m1 == null) continue;
    if (!map[sector]) map[sector] = { m1: [], m3: [] };
    map[sector].m1.push(m1);
    if (m3 != null) map[sector].m3.push(m3);
  }
  const rows = Object.entries(map)
    .map(([sector, { m1, m3 }]) => ({
      sector,
      avg1m: m1.length ? Math.round((m1.reduce((a, b) => a + b, 0) / m1.length) * 10) / 10 : null,
      avg3m: m3.length ? Math.round((m3.reduce((a, b) => a + b, 0) / m3.length) * 10) / 10 : null,
      n: m1.length,
    }))
    .filter((s) => s.avg1m != null && s.n >= 1)
    .sort((a, b) => (b.avg1m ?? 0) - (a.avg1m ?? 0));

  if (rows.length === 0) return "";
  return `
ROTACIÓN SECTORIAL (promedio 1M/3M):
${rows.map((s) => {
  const tag = s.avg1m >= 5 ? "🔥 LIDER" : s.avg1m >= 2 ? "↑" : s.avg1m <= -5 ? "🧊 REZAG" : s.avg1m <= -2 ? "↓" : "→";
  return `- ${tag} ${s.sector}: ${s.avg1m >= 0 ? "+" : ""}${s.avg1m}% (1M)${s.avg3m != null ? ` | 3M: ${s.avg3m >= 0 ? "+" : ""}${s.avg3m}%` : ""} [${s.n}]`;
}).join("\n")}
INSTRUCCIÓN: Priorizar picks en sectores LIDERANDO. Evitar agregar exposición a REZAGADOS salvo catalizador concreto.`;
}

export async function generateAnalysis({ topPicks, capital, ccl, diversification, warnings, ranking, profileId = "moderate" }) {
  const profile = getProfileConfig(profileId);
  const coreETF = profile.coreETF;

  const [cycleData, vix] = await Promise.all([
    buildMonthlyCycleContext({ capital, ccl, ranking: ranking || topPicks }),
    fetchVIX().catch(() => null),
  ]);
  const monthlyContext = cycleData.context;
  const cartEraYaAlineada = cycleData.cartEraYaAlineada;
  const selfEvalContext = await buildAIContext();
  const lessons = await getLatestLessons();

  let lessonsSection = "";
  if (lessons.length > 0) {
    lessonsSection = `\nLECCIONES DE POST-MORTEMS ANTERIORES (OBLIGATORIAS):\n${lessons
      .map((l) => {
        const rules = safeJsonParse(l.self_imposed_rules, []);
        const patterns = safeJsonParse(l.patterns_detected, []);
        return `[${l.month_label}] Confianza:${l.confidence_in_strategy ?? "—"}%\nLecciones: ${l.lessons_learned || "—"}\nPatrones: ${patterns.length > 0 ? patterns.join("; ") : "—"}\nReglas: ${rules.length > 0 ? rules.join("; ") : "—"}`;
      })
      .join("\n\n")}\nIMPORTANTE: Las reglas autoimpuestas son OBLIGATORIAS. Si dijiste "no recomendar X cuando Y", NO lo hagas.`;
  }

  const knowledge = getMarketKnowledge();

  // Mini-backtest multi-horizonte
  let backtestSummary = null;
  const backtestCacheKey = `minibt_${profileId}`;
  const cachedBacktest = backtestCache.get(backtestCacheKey);

  if (cachedBacktest) {
    console.log("📦 Using cached mini-backtest result");
    backtestSummary = cachedBacktest;
  } else {
    try {
      const monthsSinceStart = cycleData?.monthNumber || 6;
      const horizons = [];
      if (monthsSinceStart >= 3) horizons.push(3);
      if (monthsSinceStart >= 6) horizons.push(6);
      if (monthsSinceStart >= 12) horizons.push(12);
      if (horizons.length === 0) horizons.push(Math.min(6, Math.max(3, monthsSinceStart)));

      const backtests = await Promise.allSettled(
        horizons.map((m) => runBacktest({ months: m, monthlyDeposit: BACKTEST_CONFIG.defaultMonthlyDeposit, profile: profileId, picksPerMonth: BACKTEST_CONFIG.defaultPicksPerMonth }))
      );

      const successful = backtests
        .map((r, idx) => (r.status === "fulfilled" && !r.value.error ? { months: horizons[idx], data: r.value } : null))
        .filter(Boolean);

      if (successful.length > 0) {
        const main = successful.reduce((a, b) => (a.months >= b.months ? a : b));
        const bt = main.data;
        const winners = (bt.riskManagement?.picksVsSpy || []).filter((p) => p.beatsSpy);
        const topTickers = new Set((topPicks || []).map((p) => p.cedear?.ticker));
        const winnersInTopPicks = winners.filter((w) => topTickers.has(w.ticker));

        backtestSummary = {
          months: bt.config?.months,
          monthlyDeposit: bt.config?.monthlyDeposit,
          returnPct: bt.resultado?.returnPct,
          spyReturnPct: bt.resultado?.spyReturnPct,
          beatsSPY: bt.resultado?.beatsSPY,
          satelliteReturnPct: bt.satellite?.returnPct,
          satelliteAlpha: bt.satellite?.alpha,
          satelliteGeneraAlfa: bt.satellite?.generaAlfa,
          veredicto: bt.veredicto,
          picksGanadores: winnersInTopPicks.slice(0, 15).map((w) => ({ ticker: w.ticker, sector: w.sector, returnPct: w.returnPct, vsSpy: w.vsSpy })),
          totalPicksGanadores: winners.length,
          horizons: successful.map(({ months, data }) => ({
            months,
            returnPct: data.resultado?.returnPct,
            spyReturnPct: data.resultado?.spyReturnPct,
            satelliteReturnPct: data.satellite?.returnPct,
            alphaVsSpy: data.resultado?.alpha,
          })),
        };
      }
    } catch (e) {
      console.error("Mini-backtest error inside advisor:", e.message);
    }

    if (backtestSummary) {
      backtestCache.set(backtestCacheKey, backtestSummary);
      console.log("💾 Mini-backtest cached for 6 hours");
    }
  }

  const tickerDetails = buildTickerDetails(topPicks, ccl);
  const backtestSection = buildBacktestSection(backtestSummary, coreETF);
  const sectorRotationSection = buildSectorRotation(ranking || topPicks);

  const vixSection = vix
    ? `\nVIX ACTUAL: ${vix.price} (${vix.changePct >= 0 ? "+" : ""}${vix.changePct}% hoy) → Regimen: ${vix.regime === "crisis" ? "🚨 CRISIS (VIX>35): ultra-defensivo, satellite mínimo" : vix.regime === "elevated" ? "⚠ ELEVADO (25-35): reducir satellite" : vix.regime === "normal" ? "✅ NORMAL (15-25): operar normal" : "⚡ COMPLACENCIA (<15): no exceder satellite"}`
    : "";

  const prompt = `Sos el asesor financiero personal de un inversor argentino que opera CEDEARs.

FILOSOFÍA FUNDAMENTAL: ${coreETF} ES TU DEFAULT
Tu benchmark y recomendación default es ${coreETF}. Solo recomendá picks activos si tenés ALTA CONVICCIÓN de que le ganan a ${coreETF} en 1-3 meses. Es mejor indexar que hacer stock picking mediocre.

IMPORTANTE SOBRE EL CAPITAL:
- El inversor tiene $${capital.toLocaleString()} ARS disponibles HOY.
- Si es $0, solo puede rebalancear vendiendo.
- NUNCA recomiendes comprar por más plata de la disponible.

PERFIL: ${profile.label}
REGLAS: ${profile.rules}

Tu trabajo:
1. Revisar cartera existente (mantener/vender/ajustar)
2. Diagnosticar concentración sectorial y posiciones perdedoras
3. Decidir DISTRIBUCIÓN CORE/SATELLITE
4. Plan de acción CONCRETO con tickers, cantidades y montos en ARS

Sesión mensual de ${new Date().toLocaleString("es-AR", { month: "long", year: "numeric" })}:
${vixSection}

${monthlyContext}

${knowledge}
${lessonsSection}
AUTO-EVALUACIÓN (predicciones evaluadas):
${selfEvalContext}

${backtestSection}

${sectorRotationSection}

RANKING TOP ${topPicks.length} (pre-filtrados por diversificación):
${tickerDetails}

DIVERSIFICACIÓN:
- Picks: ${diversification?.totalPicks || topPicks.length} | Sectores: ${diversification?.sectorsRepresented || "N/A"}
- Growth:[${diversification?.categories?.growth?.join(", ") || ""}] Defensive:[${diversification?.categories?.defensive?.join(", ") || ""}] Hedge:[${diversification?.categories?.hedge?.join(", ") || ""}]
${warnings?.length ? `\nALERTAS DE CONCENTRACIÓN:\n${warnings.join("\n")}` : ""}

INSTRUCCIONES:
1. DIAGNOSTICAR cartera actual: ¿sigue siendo buena cada posición?
2. BUSCAR noticias recientes de tickers en cartera y top ranking
3. Para cada posición: MANTENER | AUMENTAR | REDUCIR | VENDER (con cantidades)
4. CAPITAL REAL = efectivo + ventas/reducciones recomendadas
5. DECISIÓN CORE/SATELLITE: Regla ${profile.rules}
   - Solo picks con conviction ≥ ${profile.minConviction}
   - Cada pick DEBE tener "por_que_le_gana_a_spy"
   - Si no hay convicción, 100% ${coreETF} está PERFECTO
6. HONESTIDAD: si no tenés idea, decilo y recomendá ${coreETF}
7. CARTERA YA ALINEADA: ${cartEraYaAlineada ? `El inversor ejecutó TODO lo recomendado anteriormente. Si el mercado no cambió significativamente, respondé sin_cambios_necesarios:true y plan_ejecucion:[].` : `Revisá operaciones pendientes de sesiones anteriores.`}

Respondé EXCLUSIVAMENTE con JSON válido (sin markdown, sin backticks):
{
  "resumen_mercado": "2-3 oraciones macro",
  "diagnostico_cartera": { "estado_general": "...", "exposicion_sectorial": {}, "problemas_detectados": [], "fortalezas": [] },
  "acciones_cartera_actual": [{ "ticker": "X", "accion": "MANTENER|AUMENTAR|REDUCIR|VENDER", "cantidad_actual": 0, "cantidad_ajustar": 0, "razon": "...", "urgencia": "alta|media|baja" }],
  "decision_mensual": {
    "resumen": "...",
    "core_etf": "${coreETF}",
    "distribucion": { "core_pct": 80, "core_monto_ars": 800000, "satellite_pct": 20, "satellite_monto_ars": 200000 },
    "picks_activos": [{ "ticker": "X", "nombre": "...", "sector": "...", "conviction": 85, "por_que_le_gana_a_spy": "...", "cantidad_cedears": 10, "precio_aprox_ars": 5000, "monto_total_ars": 50000, "horizonte": "Mediano plazo (1-3 meses)", "target_pct": 20, "stop_loss_pct": -10, "cuando_ver_rendimiento": "...", "proyeccion_retornos": { "1_mes": "+3-5%", "3_meses": "+10-15%", "6_meses": "+20-28%" } }]
  },
  "resumen_operaciones": { "total_a_vender_ars": 0, "capital_disponible_actual": ${capital}, "capital_disponible_post_ventas": ${capital}, "a_core_ars": 0, "a_satellite_ars": 0 },
  "plan_ejecucion": [{ "paso": 1, "tipo": "VENDER|COMPRAR", "subtipo": "CORE|SATELLITE", "ticker": "X", "cantidad_cedears": 0, "monto_estimado_ars": 0, "nota": "..." }],
  "cartera_objetivo": { "descripcion": "...", "posiciones": [{ "ticker": "X", "sector": "...", "porcentaje_target": 15, "es_core": false }] },
  "riesgos": ["Riesgo 1", "Riesgo 2"],
  "sin_cambios_necesarios": false,
  "mensaje_sin_cambios": null,
  "honestidad": "Evaluación brutalmente honesta de si los picks le ganan a ${coreETF}",
  "proximo_review": "próximo mes"
}

REGLAS CRÍTICAS plan_ejecucion:
- ORDENADO y SECUENCIAL: PRIMERO ventas, LUEGO compras.
- Solo incluir acciones que requieren HACER algo (no MANTENERs).
- subtipo solo en COMPRAR: CORE para ${coreETF}, SATELLITE para picks.
- Montos de compras NO pueden superar capital_disponible_post_ventas.
- Picks ordenados por conviction (mayor primero).
- Si sin_cambios_necesarios es true, plan_ejecucion debe ser [].
- monto_estimado_ars = cantidad_cedears × precio_aprox_ars del ticker.
- capital_disponible_post_ventas = capital_disponible_actual + total_a_vender_ars (SIEMPRE sumar ambos).
- a_core_ars = capital_disponible_post_ventas × (core_pct / 100).
- a_satellite_ars = capital_disponible_post_ventas × (satellite_pct / 100).
- CONSISTENCIA NUMÉRICA: monto_total_ars de cada pick DEBE ser cantidad_cedears × precio_aprox_ars (sin redondeos extra).`;

  try {
    const model = AI_CONFIG.model;
    await assertAiBudgetAvailable("/api/ai/analyze");
    const startedAt = Date.now();
    let response;
    try {
      response = await getClient().messages.create({
        model,
        max_tokens: AI_CONFIG.maxTokensAnalyze,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        system: `${profile.personality}
El inversor te consulta UNA VEZ POR MES. ${coreETF} es tu default. No recomiendes picks activos sin alta convicción. Si no hay oportunidades claras, recomendá ${coreETF}. Eso NO es fracaso, es buena gestión.
El inversor NO deposita plata nueva cada mes. Si querés que compre algo, primero recomendá vender algo.
Tenés acceso a tu historial de predicciones y su resultado real. Usá esa info.
Buscá noticias recientes con web search ANTES de responder.
Respondé SOLO JSON válido, sin markdown, sin backticks, sin tags HTML.
REGLA ANTI-ALUCINACIÓN: Si no tenés el dato exacto de precio, ratio o fecha de earnings, usá SOLO los datos del ranking proporcionado. NUNCA inventes números.
REGLA CRÍTICA DEL CICLO MENSUAL: El inversor ejecuta HOY y no toca la cartera hasta ~30 días. NO recomendés jugadas de corto plazo que dependan de seguimiento semanal. Cualquier pick debe aguantar 30 días sin intervención, con stop loss como única protección.`,
        messages: [{ role: "user", content: prompt }],
      });
      await recordAnthropicUsage({ route: "/api/ai/analyze", model, response, latencyMs: Date.now() - startedAt, success: true });
    } catch (llmErr) {
      await recordAnthropicUsage({ route: "/api/ai/analyze", model, response: null, latencyMs: Date.now() - startedAt, success: false, errorMessage: llmErr.message });
      throw llmErr;
    }

    function parseAIResponse(rawText) {
      const str = extractJSON(rawText);
      if (!str) return { result: null, jsonStr: str, parseError: "No se encontró JSON." };
      try {
        return { result: JSON.parse(str), jsonStr: str, parseError: null };
      } catch (err) {
        return { result: null, jsonStr: str, parseError: err.message };
      }
    }

    const textParts = response.content.filter((block) => block.type === "text").map((block) => block.text);
    const fullText = textParts.join("");
    let { result, jsonStr, parseError } = parseAIResponse(fullText);
    let schemaErrors = [];
    let retryAttempted = false;
    const rawOutput = result ? { ...result } : null;

    if (!result || (schemaErrors = validateAnalysisSchema(result)).length > 0) {
      const retryReason = parseError || `Schema inválido: ${schemaErrors.join("; ")}`;
      console.warn(`[advisor] Respuesta inválida, reintentando (${retryReason})`);
      retryAttempted = true;
      const correctionMsg = parseError
        ? `Tu respuesta anterior no contenía un JSON válido. Error: ${parseError}. Respondé EXCLUSIVAMENTE con el JSON sin texto adicional.`
        : `Tu respuesta anterior tenía errores de estructura:\n${schemaErrors.map((e) => `- ${e}`).join("\n")}\nCorregí estos campos y respondé solo con el JSON válido.`;

      try {
        const retryStartedAt = Date.now();
        const retryResponse = await getClient().messages.create({
          model,
          max_tokens: AI_CONFIG.maxTokensAnalyze,
          system: `${profile.personality}\nRespondé SOLO con JSON válido. Sin markdown, sin texto adicional.`,
          messages: [
            { role: "user", content: prompt },
            { role: "assistant", content: fullText },
            { role: "user", content: correctionMsg },
          ],
        });
        await recordAnthropicUsage({ route: "/api/ai/analyze (retry)", model, response: retryResponse, latencyMs: Date.now() - retryStartedAt, success: true });
        const retryText = retryResponse.content.filter((b) => b.type === "text").map((b) => b.text).join("");
        const retryParsed = parseAIResponse(retryText);
        if (retryParsed.result) {
          result = retryParsed.result;
          schemaErrors = validateAnalysisSchema(result);
          console.log(`[advisor] Reintento exitoso. Errores restantes: ${schemaErrors.length}`);
        } else {
          console.error("[advisor] Reintento también falló:", retryParsed.parseError);
        }
      } catch (retryErr) {
        console.error("[advisor] Error en reintento:", retryErr.message);
      }
    }

    if (!result) {
      console.error("No JSON found in AI response:", fullText.substring(0, 200));
      return { error: "No se pudo parsear la respuesta de la IA", raw: fullText.substring(0, 500) };
    }

    const macroWarnings = detectMacroClaims(result.resumen_mercado);
    if (macroWarnings.length > 0) {
      result._macro_warnings = macroWarnings;
      console.warn("[advisor] Macro claims sospechosas:", macroWarnings);
    }

    if (!result.decision_mensual && result.nuevas_compras) {
      result.decision_mensual = {
        resumen: result.distribucion_capital?.estrategia || "",
        core_etf: coreETF,
        distribucion: result.distribucion_capital || {},
        picks_activos: result.nuevas_compras.map((nc) => ({ ...nc, conviction: nc.conviction || 70, por_que_le_gana_a_spy: nc.por_que_le_gana_a_spy || nc.razon })),
      };
    }
    if (!result.honestidad && result.autoevaluacion) result.honestidad = result.autoevaluacion;

    const consistency = enforceAnalysisConsistency({ result, capital, coreETF, profile, cycleData, ranking: ranking || topPicks, ccl });
    console.log(`CONSISTENCY: efectivo=$${roundMoney(capital).toLocaleString()} + ventas=$${roundMoney(consistency.totalVentasARS).toLocaleString()} = $${roundMoney(consistency.capitalDisponiblePost).toLocaleString()}`);

    // Async price verification for unverified picks
    const unverifiedPicks = (result.decision_mensual?.picks_activos || []).filter((p) => !p._price_verified && p.ticker);
    if (unverifiedPicks.length > 0) {
      await Promise.all(
        unverifiedPicks.map(async (pick) => {
          try {
            const cedearInfo = CEDEARS.find((c) => c.ticker === pick.ticker);
            const ratio = cedearInfo?.ratio || 1;
            const quote = await fetchQuote(pick.ticker).catch(() => null);
            if (!quote?.price || !ccl?.venta) return;
            const realPriceArs = Math.round((quote.price * ccl.venta) / ratio);
            if (realPriceArs <= 0) return;
            const aiPrice = pick.precio_aprox_ars || 0;
            const discrepancyPct = aiPrice > 0 ? (Math.abs(realPriceArs - aiPrice) / realPriceArs) * 100 : 100;
            if (discrepancyPct > 20) {
              const monto = pick.monto_total_ars || 0;
              const newCantidad = monto > 0 ? Math.max(1, Math.floor(monto / realPriceArs)) : pick.cantidad_cedears;
              consistency.notes.push(`[PRICE FIX] ${pick.ticker}: AI estimó $${(aiPrice || 0).toLocaleString()}/CEDEAR, precio real $${realPriceArs.toLocaleString()}/CEDEAR (${discrepancyPct.toFixed(0)}% dif). Cantidad corregida ${pick.cantidad_cedears} → ${newCantidad}.`);
              pick.precio_aprox_ars = realPriceArs;
              pick.cantidad_cedears = newCantidad;
              pick.monto_total_ars = newCantidad * realPriceArs;
              pick._price_verified = true;
              console.warn(`[advisor] Precio corregido ${pick.ticker}: AI $${aiPrice?.toLocaleString()} → real $${realPriceArs.toLocaleString()}`);
            }
          } catch (e) {
            console.warn(`[advisor] No se pudo verificar precio de ${pick.ticker}:`, e.message);
          }
        })
      );
    }

    if (FLAGS.STRICT_CONSISTENCY && consistency.notes.length > 0) {
      console.error("[advisor] STRICT_CONSISTENCY activo, correcciones aplicadas:", consistency.notes);
      return { error: "La respuesta IA requirió correcciones automáticas.", consistencyNotes: consistency.notes };
    }

    if (FLAGS.ENABLE_AUDIT_LOG) {
      logDecisionAudit({
        route: "/api/ai/analyze",
        profile: profileId,
        capitalArs: capital,
        tickersConsidered: (topPicks || []).map((p) => p.cedear?.ticker).filter(Boolean),
        rawOutput,
        normalizedOutput: result,
        consistencyNotes: consistency.notes,
        schemaErrors,
        retryAttempted,
      }).catch((e) => console.error("[audit] Error:", e.message));
    }

    // Log predictions
    let savedCount = 0;
    try {
      const picksActivos = result.decision_mensual?.picks_activos || result.nuevas_compras || [];
      for (const rec of picksActivos) {
        if (!rec.ticker) continue;
        const pickData = topPicks.find((p) => p.cedear?.ticker === rec.ticker);
        try {
          await logPrediction({
            ticker: rec.ticker,
            action: rec.accion || "COMPRAR",
            confidence: rec.conviction || 70,
            targetPriceUsd: pickData?.quote?.price ? pickData.quote.price * (1 + (rec.target_pct || 0) / 100) : null,
            stopLossPct: rec.stop_loss_pct,
            targetPct: rec.target_pct,
            horizon: rec.horizonte,
            reasoning: rec.razon || rec.por_que_le_gana_a_spy,
            newsContext: result.resumen_mercado,
            priceUsd: pickData?.quote?.price || null,
            priceArs: rec.precio_aprox_ars || null,
            ccl: ccl.venta,
            rsi: pickData?.technical?.indicators?.rsi || null,
            scoreComposite: pickData?.scores?.composite || null,
            scoreTechnical: pickData?.scores?.techScore || null,
            scoreFundamental: pickData?.scores?.fundScore || null,
            scoreSentiment: pickData?.scores?.sentScore || null,
            pe: getFundData(pickData?.fundamentals).pe || null,
          });
          savedCount++;
        } catch (e) {
          console.error(`❌ Error saving prediction for ${rec.ticker}:`, e.message);
        }
      }

      if (result.acciones_cartera_actual) {
        for (const acc of result.acciones_cartera_actual) {
          if (acc.accion === "REDUCIR" || acc.accion === "VENDER" || acc.accion === "VENDER TODO") {
            if (!acc.ticker) continue;
            const pickData = topPicks.find((p) => p.cedear?.ticker === acc.ticker) || (ranking || []).find((p) => p.cedear?.ticker === acc.ticker);
            const portfolioPos = cycleData?.positionsWithData?.find((p) => p.ticker === acc.ticker);
            const priceUsd = pickData?.quote?.price || (portfolioPos?.currentPrice > 0 && ccl.venta > 0 ? portfolioPos.currentPrice / ccl.venta : null);
            const priceArs = pickData?.priceARS || portfolioPos?.currentPrice || null;
            try {
              await logPrediction({
                ticker: acc.ticker,
                action: acc.accion === "VENDER TODO" ? "VENDER" : acc.accion,
                confidence: acc.urgencia === "alta" ? 85 : 60,
                targetPriceUsd: null,
                stopLossPct: null,
                targetPct: null,
                horizon: "Inmediato",
                reasoning: acc.razon,
                newsContext: result.resumen_mercado,
                priceUsd,
                priceArs,
                ccl: ccl.venta,
                rsi: pickData?.technical?.indicators?.rsi || null,
                scoreComposite: pickData?.scores?.composite || null,
                scoreTechnical: pickData?.scores?.techScore || null,
                scoreFundamental: pickData?.scores?.fundScore || null,
                scoreSentiment: pickData?.scores?.sentScore || null,
                pe: getFundData(pickData?.fundamentals).pe || null,
              });
              savedCount++;
            } catch (e) {
              console.error(`❌ Error saving prediction for ${acc.ticker}:`, e.message);
            }
          }
        }
      }

      console.log(`📊 Predictions saved: ${savedCount}`);
      const sessionInsert = await logAnalysisSession({ capitalArs: capital, portfolioValueArs: cycleData?.portfolioValueARS || 0, cclRate: ccl.venta, marketSummary: result.resumen_mercado, strategyMonthly: result.decision_mensual?.resumen || result.distribucion_capital?.estrategia, risks: result.riesgos, fullResponse: result });
      const sessionId = Number(sessionInsert?.lastInsertRowid || 0);
      if (sessionId > 0) {
        result._session_id = sessionId;
      }
      if (sessionId > 0 && Array.isArray(result.plan_ejecucion) && result.plan_ejecucion.length > 0) {
        await logAdherenceEntries(sessionId, result.plan_ejecucion).catch((err) => {
          console.error("[adherence] Error creando plan de seguimiento:", err.message);
        });
      }
      if (cycleData?.portfolioValueARS > 0 || capital > 0) {
        await logCapital(capital, cycleData?.portfolioValueARS || 0, ccl.venta).catch(() => {});
      }
    } catch (logErr) {
      console.error("❌ Error logging to database:", logErr.message);
    }

    return result;
  } catch (err) {
    console.error("AI Analysis error:", err.message);
    return { error: `Error en análisis IA: ${err.message}` };
  }
}

export async function analyzeSingle({ ticker, name, sector, scores, technical, fundamentals, quote, ccl, portfolioContext = "" }) {
  const ind = technical?.indicators || {};
  const perf = ind.performance || {};
  const fund = getFundData(fundamentals);

  const prompt = `Análisis COMPLETO del CEDEAR ${ticker} (${name}, ${sector}) para inversor argentino.

DATOS:
Precio USD: $${quote?.price?.toFixed(2) || "N/A"} | ARS: $${quote?.price ? Math.round((quote.price * ccl.venta) / scores.ratio) : "N/A"} | Δ${quote?.changePercent?.toFixed(2) || "N/A"}%
52w: $${quote?.fiftyTwoWeekLow?.toFixed(2) || "N/A"}-$${quote?.fiftyTwoWeekHigh?.toFixed(2) || "N/A"} | Cap: ${quote?.marketCap ? `$${(quote.marketCap / 1e9).toFixed(1)}B` : "N/A"} | Beta: ${quote?.beta?.toFixed(2) || "N/A"}

SCORING: Comp:${scores.composite}/100 T:${scores.techScore} F:${scores.fundScore} S:${scores.sentScore} | Signal:${scores.signal} | Horizon:${scores.horizon}

TÉCNICOS: RSI:${ind.rsi || "N/A"} MACD:${ind.macd?.histogram || "N/A"} SMA20:$${ind.sma20?.toFixed(2) || "N/A"} SMA50:$${ind.sma50?.toFixed(2) || "N/A"} SMA200:$${ind.sma200?.toFixed(2) || "N/A"} BB:$${ind.bollingerBands?.lower?.toFixed(1) || "N/A"}-$${ind.bollingerBands?.upper?.toFixed(1) || "N/A"} Stoch:${ind.stochastic?.k || "N/A"} ATR:$${ind.atr || "N/A"} VolTrend:${ind.volume?.volumeTrend || "N/A"}%
PERF: 1d:${perf.day1 ?? "N/A"}% 1w:${perf.week1 ?? "N/A"}% 1m:${perf.month1 ?? "N/A"}% 3m:${perf.month3 ?? "N/A"}% 6m:${perf.month6 ?? "N/A"}%

FUNDAMENTALES: P/E:${fund.pe?.toFixed(1) || "N/A"} fP/E:${fund.forwardPE?.toFixed(1) || "N/A"} PEG:${fund.pegRatio?.toFixed(2) || "N/A"} EPSg:${fund.epsGrowth?.toFixed(1) || "N/A"}% RevG:${fund.revenueGrowth?.toFixed(1) || "N/A"}% Margin:${fund.profitMargin?.toFixed(1) || "N/A"}% ROE:${fund.returnOnEquity?.toFixed(1) || "N/A"}% D/E:${fund.debtToEquity?.toFixed(0) || "N/A"}% Div:${quote?.dividendYield?.toFixed(2) || 0}% Target:$${fund.targetMeanPrice?.toFixed(2) || "N/A"} (${fund.recommendationKey || "N/A"}, ${fund.numberOfAnalystOpinions || 0} analistas)

${portfolioContext}

Buscá noticias recientes de ${ticker} y sector ${sector}.
Respondé SOLO JSON:
{"veredicto":"COMPRAR|MANTENER|VENDER","confianza":75,"analisis":"4-6 oraciones técnico+fundamental+sentimiento","noticias_relevantes":"...","catalizadores":["..."],"riesgos":["..."],"precio_objetivo_usd":0,"soporte_usd":0,"resistencia_usd":0,"horizonte":"Corto|Mediano|Largo","comparacion_sector":"...","recomendacion_detallada":"..."}`;

  try {
    const model = AI_CONFIG.model;
    await assertAiBudgetAvailable("/api/ai/analyze/:ticker");
    const startedAt = Date.now();
    let response;
    try {
      response = await getClient().messages.create({
        model,
        max_tokens: AI_CONFIG.maxTokensSingle,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        system: "Sos un analista financiero experto en CEDEARs para inversores argentinos. Usá web search para buscar noticias recientes. Respondé SOLO JSON válido.",
        messages: [{ role: "user", content: prompt }],
      });
      await recordAnthropicUsage({ route: "/api/ai/analyze/:ticker", model, response, latencyMs: Date.now() - startedAt, success: true });
    } catch (llmErr) {
      await recordAnthropicUsage({ route: "/api/ai/analyze/:ticker", model, response: null, latencyMs: Date.now() - startedAt, success: false, errorMessage: llmErr.message });
      throw llmErr;
    }

    const textParts = response.content.filter((b) => b.type === "text").map((b) => b.text);
    const fullText = textParts.join("");
    const jsonStr = extractJSON(fullText);
    if (!jsonStr) return { error: "Parse error" };
    try {
      return JSON.parse(jsonStr);
    } catch {
      return { error: "Parse error" };
    }
  } catch (err) {
    console.error(`AI single analysis error for ${ticker}:`, err.message);
    return { error: err.message };
  }
}
