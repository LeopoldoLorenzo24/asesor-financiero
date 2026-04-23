// ============================================================
// TELEGRAM BOT
// Alertas de take-profit, stop-loss, daily summary
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
