const ALERT_WEBHOOK_URL = String(process.env.ALERT_WEBHOOK_URL || "").trim();
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "").trim();
const ALERT_COOLDOWN_MIN = Math.max(
  1,
  parseInt(process.env.ALERT_COOLDOWN_MIN || "15", 10) || 15
);
const ALERT_COOLDOWN_MS = ALERT_COOLDOWN_MIN * 60 * 1000;

const lastSentByCode = new Map();
const MAX_RECENT_ALERTS = 50;
const recentAlerts = [];

function canSend(code, now) {
  const last = lastSentByCode.get(code) || 0;
  return now - last >= ALERT_COOLDOWN_MS;
}

function pushRecentAlert(alert) {
  recentAlerts.unshift({ ...alert, at: Date.now() });
  if (recentAlerts.length > MAX_RECENT_ALERTS) recentAlerts.pop();
}

export function getRecentAlerts(limit = 20) {
  return recentAlerts.slice(0, limit).map((a) => ({
    level: a.level,
    code: a.code,
    message: a.message,
    at: a.at,
  }));
}

export function getAlertingStatus() {
  return {
    enabled: ALERT_WEBHOOK_URL.length > 0 || (TELEGRAM_BOT_TOKEN.length > 0 && TELEGRAM_CHAT_ID.length > 0),
    telegram: TELEGRAM_BOT_TOKEN.length > 0 && TELEGRAM_CHAT_ID.length > 0,
    webhook: ALERT_WEBHOOK_URL.length > 0,
    cooldownMin: ALERT_COOLDOWN_MIN,
    trackedCodes: lastSentByCode.size,
  };
}

async function sendTelegram(alerts) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const lines = alerts.map(a => {
    const emoji = a.level === "critical" ? "🚨" : a.level === "warning" ? "⚠️" : "ℹ️";
    return `${emoji} *${a.code}*\n${a.message}`;
  });
  const text = `*CEDEAR Advisor — Alerta*\n\n${lines.join("\n\n")}`;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "Markdown" }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[alerting] Telegram error:", err.description || res.status);
    }
  } catch (err) {
    console.error("[alerting] Telegram fetch error:", err.message);
  }
}

export async function dispatchAlerts(alerts = [], context = {}) {
  if (!Array.isArray(alerts) || alerts.length === 0) return;

  const now = Date.now();
  const toSend = alerts.filter((a) => canSend(a?.code || "unknown", now));
  if (toSend.length === 0) return;

  const normalized = toSend.map((a) => ({
    level: a.level || "warning",
    code: a.code || "unknown",
    message: String(a.message || "").slice(0, 500),
  }));

  // ── Canal 1: Webhook genérico ──
  if (ALERT_WEBHOOK_URL) {
    const payload = {
      source: context.source || "observability",
      at: new Date(now).toISOString(),
      environment: process.env.NODE_ENV || "unknown",
      service: "cedear-advisor-server",
      context: {
        totalRequests: context.totalRequests ?? null,
        totalErrors: context.totalErrors ?? null,
        startedAt: context.startedAt ?? null,
      },
      alerts: normalized,
    };
    try {
      const res = await fetch(ALERT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) console.error(`[alerting] Webhook devolvió ${res.status}`);
    } catch (err) {
      console.error("[alerting] Webhook error:", err.message);
    }
  }

  // ── Canal 2: Telegram ──
  await sendTelegram(normalized);

  // Registrar que se enviaron (cooldown + recientes)
  for (const alert of toSend) {
    lastSentByCode.set(alert?.code || "unknown", now);
    pushRecentAlert(alert);
  }
}

