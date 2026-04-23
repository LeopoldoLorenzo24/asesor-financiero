// ============================================================
// FEATURE FLAGS
// Leer de variables de entorno para activar/desactivar comportamientos
// sin necesitar un nuevo deploy.
//
// Uso en .env:
//   STRICT_CONSISTENCY=true   → falla el análisis si la consistencia hizo correcciones
//   ENABLE_RATE_LIMIT=true    → activa rate limiting en auth y endpoints IA
//   ENABLE_AUDIT_LOG=true     → guarda audit log de cada decisión IA
// ============================================================

function bool(envKey, defaultVal = false) {
  const val = process.env[envKey];
  if (val === undefined || val === "") return defaultVal;
  const low = val.toLowerCase().trim();
  return low === "true" || low === "1" || low === "yes" || low === "on";
}

export const FLAGS = {
  /** Si true, el análisis falla cuando enforceAnalysisConsistency hace correcciones. */
  STRICT_CONSISTENCY: bool("STRICT_CONSISTENCY", false),

  /** Si true, activa rate limiting en /api/auth/* y /api/ai/*. */
  ENABLE_RATE_LIMIT: bool("ENABLE_RATE_LIMIT", true),

  /** Si true, guarda un audit log de cada llamada IA (input + raw output + correcciones). */
  ENABLE_AUDIT_LOG: bool("ENABLE_AUDIT_LOG", true),

  /** Si true, evalúa predicciones automáticamente cada 6 horas. */
  ENABLE_AUTO_EVAL: bool("ENABLE_AUTO_EVAL", true),

  /** Si true, monitorea stop-loss de picks activos cada 4 horas y dispara alertas. */
  ENABLE_STOP_LOSS_ALERTS: bool("ENABLE_STOP_LOSS_ALERTS", true),

  /** Si true, loguea el valor del portfolio una vez por día automáticamente. */
  ENABLE_DAILY_CAPITAL_LOG: bool("ENABLE_DAILY_CAPITAL_LOG", true),

  /** Si true, envía alertas de take-profit y stop-loss por Telegram. */
  ENABLE_TELEGRAM_ALERTS: bool("ENABLE_TELEGRAM_ALERTS", false),

  /** Si true, recolecta datos automáticamente para el modelo ML. */
  ENABLE_ML_AUTO_COLLECT: bool("ENABLE_ML_AUTO_COLLECT", true),

  /** Si true, genera señales de trading intraday/swing. */
  ENABLE_TRADING_SIGNALS: bool("ENABLE_TRADING_SIGNALS", true),
};
