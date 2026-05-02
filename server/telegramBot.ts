// ============================================================
// TELEGRAM BOT
// Alertas de take-profit, stop-loss, daily summary,
// portfolio tracking, emerging opportunities
// ============================================================

import { FLAGS } from "./featureFlags.js";

let bot: any = null;
let chatId: string | null = null;

export function initTelegramBot() {
  if (!FLAGS.ENABLE_TELEGRAM_ALERTS) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  chatId = process.env.TELEGRAM_CHAT_ID || null;
  if (!token) { console.warn("[telegram] TELEGRAM_BOT_TOKEN no configurado"); return; }

  try {
    // Lazy import para no romper si no está instalado
    const { Telegraf } = require("telegraf");
    bot = new Telegraf(token);
    bot.command("start", (ctx: any) => {
      const cid = String(ctx.chat.id);
      chatId = cid;
      ctx.reply(`CEDEAR Advisor Bot activado. Chat ID: ${cid}. Guardalo en TELEGRAM_CHAT_ID.`);
    });
    bot.command("status", async (ctx: any) => {
      ctx.reply("Bot activo. Alertas de take-profit y stop-loss habilitadas.");
    });
    bot.launch();
    console.log("[telegram] Bot iniciado.");
  } catch (e: any) {
    console.warn("[telegram] No se pudo iniciar:", e.message);
  }
}

export async function sendTelegramAlert(message: string) {
  if (!bot || !chatId) return;
  try {
    await bot.telegram.sendMessage(chatId, `🤖 CEDEAR Advisor\n\n${message}`, { parse_mode: "HTML" });
  } catch (e: any) {
    console.warn("[telegram] Error enviando alerta:", e.message);
  }
}

export async function sendTakeProfitAlert(ticker: string, entryPrice: number, currentPrice: number, targetPct: number, actualPct: number) {
  const msg = `🎯 <b>TAKE-PROFIT ALCANZADO</b>\n\n<b>${ticker}</b>\nPrecio entrada: $${entryPrice.toFixed(2)}\nPrecio actual: $${currentPrice.toFixed(2)}\nTarget: +${targetPct}%\nActual: ${actualPct >= 0 ? "+" : ""}${actualPct.toFixed(1)}%\n\n💡 Considerá vender o ajustar stop-loss.`;
  await sendTelegramAlert(msg);
}

export async function sendStopLossAlert(ticker: string, entryPrice: number, currentPrice: number, stopPct: number, actualPct: number) {
  const msg = `🛑 <b>STOP-LOSS ACTIVADO</b>\n\n<b>${ticker}</b>\nPrecio entrada: $${entryPrice.toFixed(2)}\nPrecio actual: $${currentPrice.toFixed(2)}\nStop: ${stopPct}%\nActual: ${actualPct.toFixed(1)}%\n\n⚠️ Considerá cerrar la posición.`;
  await sendTelegramAlert(msg);
}

export async function sendDailySummary(portfolioValue: number, capital: number, topGainer: string, topGainerPct: number, worstPerformer: string, worstPerformerPct: number) {
  const total = portfolioValue + capital;
  const msg = `📊 <b>Resumen Diario</b>\n\nPortfolio: $${Math.round(portfolioValue).toLocaleString("es-AR")}\nCapital: $${Math.round(capital).toLocaleString("es-AR")}\nTotal: $${Math.round(total).toLocaleString("es-AR")}\n\n🟢 ${topGainer}: +${topGainerPct}%\n🔴 ${worstPerformer}: ${worstPerformerPct}%`;
  await sendTelegramAlert(msg);
}

// ── Smart Portfolio Tracking ──

export interface PositionUpdate {
  ticker: string;
  shares: number;
  entryPrice: number;
  currentPrice: number;
  changePct: number;
  targetPct: number | null;
  stopPct: number | null;
  distanceToTargetPct: number | null;
  distanceToStopPct: number | null;
}

export async function sendPortfolioTrackingUpdate(positions: PositionUpdate[], totalPnlPct: number) {
  if (positions.length === 0) return;

  const lines: string[] = [];
  for (const pos of positions) {
    const emoji = pos.changePct >= 5 ? "🟢" : pos.changePct >= 0 ? "🔵" : pos.changePct > -5 ? "🟠" : "🔴";
    const sign = pos.changePct >= 0 ? "+" : "";
    let detail = `${emoji} <b>${pos.ticker}</b>: ${sign}${pos.changePct.toFixed(1)}%`;

    if (pos.distanceToTargetPct != null && pos.distanceToTargetPct <= 5) {
      detail += ` — 🎯 a ${pos.distanceToTargetPct.toFixed(1)}% del target`;
    }
    if (pos.distanceToStopPct != null && pos.distanceToStopPct <= 3) {
      detail += ` — ⚠️ a ${pos.distanceToStopPct.toFixed(1)}% del stop`;
    }
    lines.push(detail);
  }

  const totalEmoji = totalPnlPct >= 0 ? "📈" : "📉";
  const totalSign = totalPnlPct >= 0 ? "+" : "";
  const msg = `${totalEmoji} <b>Seguimiento de Inversiones</b>\n\nP&L total: ${totalSign}${totalPnlPct.toFixed(1)}%\n\n${lines.join("\n")}`;
  await sendTelegramAlert(msg);
}

// ── Emerging Opportunity Alert ──

export interface EmergingOpportunity {
  ticker: string;
  name: string;
  sector: string;
  compositeScore: number;
  signal: string;
  reason: string;
}

export async function sendEmergingOpportunityAlert(opportunities: EmergingOpportunity[]) {
  if (opportunities.length === 0) return;

  const lines: string[] = [];
  for (const opp of opportunities) {
    lines.push(`🔍 <b>${opp.ticker}</b> (${opp.name})\n   Sector: ${opp.sector} | Score: ${opp.compositeScore}/100 | Señal: ${opp.signal}\n   📌 ${opp.reason}`);
  }

  const msg = `🚀 <b>Oportunidades Emergentes</b>\n\nEstos activos están acercándose a condiciones de compra:\n\n${lines.join("\n\n")}`;
  await sendTelegramAlert(msg);
}

// ── Significant Move Alert (>5% in a day) ──

export async function sendSignificantMoveAlert(ticker: string, changePct: number, priceUsd: number, reason: string) {
  const emoji = changePct >= 0 ? "📈" : "📉";
  const sign = changePct >= 0 ? "+" : "";
  const msg = `${emoji} <b>Movimiento Significativo</b>\n\n<b>${ticker}</b> se movió ${sign}${changePct.toFixed(1)}% hoy\nPrecio: $${priceUsd.toFixed(2)} USD\n\n${reason}`;
  await sendTelegramAlert(msg);
}

// ── Weekly Performance Summary ──

export async function sendWeeklyPerformanceSummary(data: {
  portfolioValueArs: number;
  weeklyChangePct: number;
  spyChangePct: number;
  alphaVsSpy: number;
  bestPosition: { ticker: string; pct: number } | null;
  worstPosition: { ticker: string; pct: number } | null;
}) {
  const { portfolioValueArs, weeklyChangePct, spyChangePct, alphaVsSpy, bestPosition, worstPosition } = data;
  const sign = weeklyChangePct >= 0 ? "+" : "";
  const alphaSign = alphaVsSpy >= 0 ? "+" : "";
  const alphaEmoji = alphaVsSpy >= 0 ? "✅" : "❌";

  let msg = `📋 <b>Resumen Semanal</b>\n\n`;
  msg += `Portfolio: $${Math.round(portfolioValueArs).toLocaleString("es-AR")} ARS\n`;
  msg += `Rendimiento semana: ${sign}${weeklyChangePct.toFixed(1)}%\n`;
  msg += `SPY semana: ${spyChangePct >= 0 ? "+" : ""}${spyChangePct.toFixed(1)}%\n`;
  msg += `${alphaEmoji} Alpha vs SPY: ${alphaSign}${alphaVsSpy.toFixed(1)}%\n`;

  if (bestPosition) {
    msg += `\n🟢 Mejor: ${bestPosition.ticker} (+${bestPosition.pct.toFixed(1)}%)`;
  }
  if (worstPosition) {
    msg += `\n🔴 Peor: ${worstPosition.ticker} (${worstPosition.pct.toFixed(1)}%)`;
  }

  await sendTelegramAlert(msg);
}
