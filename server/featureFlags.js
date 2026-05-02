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
  /** Si true, permite seedear un portfolio sintético cuando la DB está vacía. */
  ENABLE_BOOTSTRAP_SEED: bool("ENABLE_BOOTSTRAP_SEED", false),

  /** Si true, genera experiencia histórica sintética a partir de backtests. */
  ENABLE_SYNTHETIC_HISTORY_SEED: bool("ENABLE_SYNTHETIC_HISTORY_SEED", false),

  /** Si true, el proceso web mantiene jobs periódicos con setInterval. */
  ENABLE_INTERNAL_SCHEDULER: bool("ENABLE_INTERNAL_SCHEDULER", true),

  /** Si true, corre un preflight operativo cerca de la apertura para sincronizar ratios y validar salud. */
  ENABLE_PREMARKET_PREFLIGHT: bool("ENABLE_PREMARKET_PREFLIGHT", true),

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

  /** Si true, envía alertas de take-profit, stop-loss, portfolio tracking y oportunidades emergentes por Telegram. */
  ENABLE_TELEGRAM_ALERTS: bool("ENABLE_TELEGRAM_ALERTS", true),

  /** Si true, recolecta datos automáticamente para el modelo ML. */
  ENABLE_ML_AUTO_COLLECT: bool("ENABLE_ML_AUTO_COLLECT", true),

  /** Si true, genera señales de trading intraday/swing. */
  ENABLE_TRADING_SIGNALS: bool("ENABLE_TRADING_SIGNALS", true),

  /** Si true, activa circuit breakers que fuerzan modo defensivo ante estrés de mercado (VIX alto, drawdown, etc.). */
  ENABLE_CIRCUIT_BREAKERS: bool("ENABLE_CIRCUIT_BREAKERS", true),

  /** Si true, calcula stop-loss dinámicos basados en ATR en lugar de porcentajes fijos. */
  ENABLE_DYNAMIC_STOPS: bool("ENABLE_DYNAMIC_STOPS", true),
};
