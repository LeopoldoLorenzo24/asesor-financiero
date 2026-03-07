// ============================================================
// DATABASE SERVICE
// SQLite (Turso/libsql) for portfolio, predictions, and self-learning loop
// ============================================================

import { createClient } from "@libsql/client";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbUrl = process.env.TURSO_URL || `file:${path.join(__dirname, "data", "cedear-advisor.db")}`;

// Ensure data directory exists for local file mode
if (dbUrl.startsWith("file:")) {
  mkdirSync(path.dirname(dbUrl.replace("file:", "")), { recursive: true });
}

const db = createClient({
  url: dbUrl,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ============================================================
// SCHEMA (async init — must be called before server starts)
// ============================================================
export async function initDb() {
  if (dbUrl.startsWith("file:")) {
    await db.execute("PRAGMA journal_mode = WAL");
  }

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS portfolio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      shares INTEGER NOT NULL,
      avg_price_ars REAL NOT NULL,
      date_bought TEXT NOT NULL DEFAULT (date('now')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('BUY', 'SELL')),
      shares INTEGER NOT NULL,
      price_ars REAL NOT NULL,
      price_usd REAL,
      ccl_rate REAL,
      total_ars REAL NOT NULL,
      date_executed TEXT NOT NULL DEFAULT (date('now')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      prediction_date TEXT NOT NULL DEFAULT (datetime('now')),
      action TEXT NOT NULL,
      confidence INTEGER,
      target_price_usd REAL,
      stop_loss_pct REAL,
      target_pct REAL,
      horizon TEXT,
      reasoning TEXT,
      news_context TEXT,
      price_usd_at_prediction REAL,
      price_ars_at_prediction REAL,
      ccl_at_prediction REAL,
      rsi_at_prediction REAL,
      score_composite INTEGER,
      score_technical INTEGER,
      score_fundamental INTEGER,
      score_sentiment INTEGER,
      pe_at_prediction REAL,
      evaluated INTEGER NOT NULL DEFAULT 0,
      evaluation_date TEXT,
      price_usd_at_evaluation REAL,
      actual_change_pct REAL,
      prediction_correct INTEGER,
      evaluation_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS analysis_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date TEXT NOT NULL DEFAULT (datetime('now')),
      capital_ars REAL,
      portfolio_value_ars REAL,
      ccl_rate REAL,
      market_summary TEXT,
      strategy_monthly TEXT,
      risks TEXT,
      full_response TEXT,
      evaluated INTEGER NOT NULL DEFAULT 0,
      evaluation_date TEXT,
      portfolio_value_at_evaluation REAL,
      return_pct REAL,
      evaluation_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bot_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      total_predictions INTEGER NOT NULL DEFAULT 0,
      correct_predictions INTEGER NOT NULL DEFAULT 0,
      accuracy_pct REAL,
      avg_return_predicted REAL,
      avg_return_actual REAL,
      best_pick TEXT,
      worst_pick TEXT,
      lessons_learned TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS capital_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL DEFAULT (date('now')),
      capital_available_ars REAL NOT NULL,
      portfolio_value_ars REAL NOT NULL DEFAULT 0,
      total_value_ars REAL NOT NULL DEFAULT 0,
      ccl_rate REAL,
      monthly_deposit REAL DEFAULT 1000000,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_portfolio_ticker ON portfolio(ticker);
    CREATE INDEX IF NOT EXISTS idx_transactions_ticker ON transactions(ticker);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date_executed);
    CREATE INDEX IF NOT EXISTS idx_predictions_ticker ON predictions(ticker);
    CREATE INDEX IF NOT EXISTS idx_predictions_date ON predictions(prediction_date);
    CREATE INDEX IF NOT EXISTS idx_predictions_evaluated ON predictions(evaluated);
  `);
}

// ============================================================
// PORTFOLIO OPERATIONS
// ============================================================

export async function getPortfolio() {
  return (await db.execute("SELECT * FROM portfolio ORDER BY ticker")).rows;
}

export async function getPortfolioSummary() {
  return (await db.execute(`
    SELECT ticker, SUM(shares) as total_shares,
           ROUND(SUM(shares * avg_price_ars) / SUM(shares), 2) as weighted_avg_price,
           MIN(date_bought) as first_bought
    FROM portfolio
    GROUP BY ticker
    ORDER BY ticker
  `)).rows;
}

export async function addPosition(ticker, shares, priceArs, priceUsd, cclRate, notes = "") {
  await db.batch([
    {
      sql: `INSERT INTO portfolio (ticker, shares, avg_price_ars, notes)
            VALUES (?, ?, ?, ?)`,
      args: [ticker, shares, priceArs, notes],
    },
    {
      sql: `INSERT INTO transactions (ticker, type, shares, price_ars, price_usd, ccl_rate, total_ars, notes)
            VALUES (?, 'BUY', ?, ?, ?, ?, ?, ?)`,
      args: [ticker, shares, priceArs, priceUsd, cclRate, shares * priceArs, notes],
    },
  ], "write");
  return { success: true };
}

export async function sellPosition(ticker, shares, priceArs, priceUsd, cclRate, notes = "") {
  const positions = (await db.execute({
    sql: "SELECT * FROM portfolio WHERE ticker = ? ORDER BY date_bought ASC",
    args: [ticker],
  })).rows;

  const totalShares = positions.reduce((s, p) => s + p.shares, 0);
  if (shares > totalShares) {
    throw new Error(`No tenés ${shares} CEDEARs de ${ticker}. Tenés ${totalShares}.`);
  }

  const ops = [];
  let remaining = shares;
  for (const pos of positions) {
    if (remaining <= 0) break;
    if (pos.shares <= remaining) {
      ops.push({ sql: "DELETE FROM portfolio WHERE id = ?", args: [pos.id] });
      remaining -= pos.shares;
    } else {
      ops.push({
        sql: "UPDATE portfolio SET shares = ?, updated_at = datetime('now') WHERE id = ?",
        args: [pos.shares - remaining, pos.id],
      });
      remaining = 0;
    }
  }

  ops.push({
    sql: `INSERT INTO transactions (ticker, type, shares, price_ars, price_usd, ccl_rate, total_ars, notes)
          VALUES (?, 'SELL', ?, ?, ?, ?, ?, ?)`,
    args: [ticker, shares, priceArs, priceUsd, cclRate, shares * priceArs, notes],
  });

  await db.batch(ops, "write");
  return { success: true };
}

export async function getTransactions(ticker = null, limit = 50) {
  if (ticker) {
    return (await db.execute({
      sql: "SELECT * FROM transactions WHERE ticker = ? ORDER BY date_executed DESC LIMIT ?",
      args: [ticker, limit],
    })).rows;
  }
  return (await db.execute({
    sql: "SELECT * FROM transactions ORDER BY date_executed DESC LIMIT ?",
    args: [limit],
  })).rows;
}

// ============================================================
// PREDICTIONS / RECOMMENDATIONS LOG
// ============================================================

export async function logPrediction({
  ticker, action, confidence, targetPriceUsd, stopLossPct, targetPct,
  horizon, reasoning, newsContext, priceUsd, priceArs, ccl,
  rsi, scoreComposite, scoreTechnical, scoreFundamental, scoreSentiment, pe,
}) {
  return await db.execute({
    sql: `INSERT INTO predictions (
      ticker, action, confidence, target_price_usd, stop_loss_pct, target_pct,
      horizon, reasoning, news_context,
      price_usd_at_prediction, price_ars_at_prediction, ccl_at_prediction,
      rsi_at_prediction, score_composite, score_technical, score_fundamental, score_sentiment,
      pe_at_prediction
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      ticker, action, confidence, targetPriceUsd, stopLossPct, targetPct,
      horizon, reasoning, newsContext,
      priceUsd, priceArs, ccl,
      rsi, scoreComposite, scoreTechnical, scoreFundamental, scoreSentiment, pe,
    ],
  });
}

export async function getPredictions(ticker = null, onlyUnevaluated = false, limit = 100) {
  let query = "SELECT * FROM predictions WHERE 1=1";
  const params = [];
  if (ticker) { query += " AND ticker = ?"; params.push(ticker); }
  if (onlyUnevaluated) { query += " AND evaluated = 0"; }
  query += " ORDER BY prediction_date DESC LIMIT ?";
  params.push(limit);
  return (await db.execute({ sql: query, args: params })).rows;
}

export async function evaluatePrediction(id, currentPriceUsd, notes = "") {
  const prediction = (await db.execute({
    sql: "SELECT * FROM predictions WHERE id = ?",
    args: [id],
  })).rows[0];
  if (!prediction) throw new Error(`Prediction ${id} not found`);

  const actualChange = prediction.price_usd_at_prediction > 0
    ? ((currentPriceUsd - prediction.price_usd_at_prediction) / prediction.price_usd_at_prediction) * 100
    : 0;

  let correct = 0;
  if (prediction.action === "COMPRAR" && actualChange > 0) correct = 1;
  else if (prediction.action === "VENDER" && actualChange < 0) correct = 1;
  else if (prediction.action === "MANTENER" && Math.abs(actualChange) < 10) correct = 1;
  else if (prediction.action === "WATCHLIST") correct = -1;

  await db.execute({
    sql: `UPDATE predictions SET
      evaluated = 1,
      evaluation_date = datetime('now'),
      price_usd_at_evaluation = ?,
      actual_change_pct = ?,
      prediction_correct = ?,
      evaluation_notes = ?
    WHERE id = ?`,
    args: [currentPriceUsd, Math.round(actualChange * 100) / 100, correct, notes, id],
  });

  return { id, actualChange: Math.round(actualChange * 100) / 100, correct, prediction };
}

export async function evaluatePredictionsForTicker(ticker, currentPriceUsd) {
  const pending = (await db.execute({
    sql: "SELECT * FROM predictions WHERE ticker = ? AND evaluated = 0",
    args: [ticker],
  })).rows;

  const results = [];
  for (const pred of pending) {
    const daysSince = Math.floor(
      (Date.now() - new Date(pred.prediction_date).getTime()) / 86400000
    );
    const minDays = pred.horizon?.includes("Corto") ? 7 : pred.horizon?.includes("Largo") ? 90 : 30;

    if (daysSince >= minDays) {
      results.push(await evaluatePrediction(pred.id, currentPriceUsd));
    }
  }
  return results;
}

// ============================================================
// ANALYSIS SESSIONS LOG
// ============================================================

export async function logAnalysisSession({
  capitalArs, portfolioValueArs, cclRate, marketSummary,
  strategyMonthly, risks, fullResponse,
}) {
  return await db.execute({
    sql: `INSERT INTO analysis_sessions (
      capital_ars, portfolio_value_ars, ccl_rate, market_summary,
      strategy_monthly, risks, full_response
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      capitalArs, portfolioValueArs, cclRate, marketSummary,
      strategyMonthly, JSON.stringify(risks), JSON.stringify(fullResponse),
    ],
  });
}

export async function getAnalysisSessions(limit = 20) {
  return (await db.execute({
    sql: "SELECT * FROM analysis_sessions ORDER BY session_date DESC LIMIT ?",
    args: [limit],
  })).rows;
}

// ============================================================
// BOT PERFORMANCE / SELF-EVALUATION
// ============================================================

export async function calculateBotPerformance(daysBack = 30) {
  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString();

  const stats = (await db.execute({
    sql: `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN prediction_correct = 1 THEN 1 ELSE 0 END) as correct,
      SUM(CASE WHEN prediction_correct = 0 THEN 1 ELSE 0 END) as incorrect,
      AVG(CASE WHEN target_pct IS NOT NULL THEN target_pct END) as avg_target,
      AVG(actual_change_pct) as avg_actual_change,
      AVG(confidence) as avg_confidence
    FROM predictions
    WHERE evaluated = 1 AND prediction_date >= ?`,
    args: [cutoff],
  })).rows[0];

  const bestPick = (await db.execute({
    sql: `SELECT ticker, actual_change_pct FROM predictions
    WHERE evaluated = 1 AND prediction_date >= ? AND action = 'COMPRAR'
    ORDER BY actual_change_pct DESC LIMIT 1`,
    args: [cutoff],
  })).rows[0];

  const worstPick = (await db.execute({
    sql: `SELECT ticker, actual_change_pct FROM predictions
    WHERE evaluated = 1 AND prediction_date >= ? AND action = 'COMPRAR'
    ORDER BY actual_change_pct ASC LIMIT 1`,
    args: [cutoff],
  })).rows[0];

  const byAction = (await db.execute({
    sql: `SELECT action,
      COUNT(*) as total,
      SUM(CASE WHEN prediction_correct = 1 THEN 1 ELSE 0 END) as correct,
      AVG(actual_change_pct) as avg_change
    FROM predictions
    WHERE evaluated = 1 AND prediction_date >= ?
    GROUP BY action`,
    args: [cutoff],
  })).rows;

  return {
    period: { start: cutoff, end: new Date().toISOString(), days: daysBack },
    total: stats.total,
    correct: stats.correct,
    incorrect: stats.incorrect,
    accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 10000) / 100 : null,
    avgTargetReturn: stats.avg_target ? Math.round(stats.avg_target * 100) / 100 : null,
    avgActualReturn: stats.avg_actual_change ? Math.round(stats.avg_actual_change * 100) / 100 : null,
    avgConfidence: stats.avg_confidence ? Math.round(stats.avg_confidence) : null,
    bestPick: bestPick || null,
    worstPick: worstPick || null,
    byAction,
  };
}

export async function getPredictionHistory(limit = 50) {
  return (await db.execute({
    sql: `SELECT ticker, action, confidence, target_pct, horizon, reasoning,
           price_usd_at_prediction, actual_change_pct, prediction_correct,
           prediction_date, evaluation_date, evaluation_notes,
           score_composite, rsi_at_prediction, pe_at_prediction
    FROM predictions
    WHERE evaluated = 1
    ORDER BY prediction_date DESC
    LIMIT ?`,
    args: [limit],
  })).rows;
}

// ============================================================
// CAPITAL HISTORY
// ============================================================

export async function logCapital(capitalArs, portfolioValueArs, cclRate, monthlyDeposit = 1000000) {
  return await db.execute({
    sql: `INSERT INTO capital_history (capital_available_ars, portfolio_value_ars, total_value_ars, ccl_rate, monthly_deposit)
    VALUES (?, ?, ?, ?, ?)`,
    args: [capitalArs, portfolioValueArs, capitalArs + portfolioValueArs, cclRate, monthlyDeposit],
  });
}

export async function getCapitalHistory(limit = 90) {
  return (await db.execute({
    sql: "SELECT * FROM capital_history ORDER BY date DESC LIMIT ?",
    args: [limit],
  })).rows;
}

// ============================================================
// CONTEXT BUILDER FOR AI
// Builds a rich context string so Claude knows everything
// ============================================================

export async function buildAIContext() {
  const portfolio = await getPortfolioSummary();
  const recentTx = await getTransactions(null, 10);
  const performance = await calculateBotPerformance(60);
  const pastPredictions = await getPredictionHistory(20);
  const capitalHist = await getCapitalHistory(5);

  let context = "";

  // Portfolio
  if (portfolio.length > 0) {
    context += "\n== PORTFOLIO ACTUAL DEL INVERSOR ==\n";
    for (const p of portfolio) {
      context += `- ${p.ticker}: ${p.total_shares} CEDEARs, precio promedio $${p.weighted_avg_price} ARS, desde ${p.first_bought}\n`;
    }
  } else {
    context += "\n== El inversor NO tiene portfolio armado aún ==\n";
  }

  // Recent transactions
  if (recentTx.length > 0) {
    context += "\n== ÚLTIMAS OPERACIONES ==\n";
    for (const tx of recentTx.slice(0, 5)) {
      context += `- ${tx.date_executed}: ${tx.type} ${tx.shares} ${tx.ticker} a $${tx.price_ars} ARS (total: $${tx.total_ars})\n`;
    }
  }

  // Bot performance (self-evaluation)
  if (performance.total > 0) {
    context += "\n== TU PERFORMANCE COMO ASESOR (últimos 60 días) ==\n";
    context += `- Predicciones evaluadas: ${performance.total}\n`;
    context += `- Aciertos: ${performance.correct} (${performance.accuracy}%)\n`;
    context += `- Retorno promedio predicho: ${performance.avgTargetReturn}%\n`;
    context += `- Retorno real promedio: ${performance.avgActualReturn}%\n`;
    if (performance.bestPick) context += `- Mejor pick: ${performance.bestPick.ticker} (${performance.bestPick.actual_change_pct}%)\n`;
    if (performance.worstPick) context += `- Peor pick: ${performance.worstPick.ticker} (${performance.worstPick.actual_change_pct}%)\n`;
    context += "IMPORTANTE: Usá esta info para mejorar. Si venís errando en un sector, sé más cauteloso. Si acertás en otro, podés ser más agresivo.\n";
  }

  // Past predictions for learning
  if (pastPredictions.length > 0) {
    context += "\n== HISTORIAL DE PREDICCIONES EVALUADAS (para que aprendas de tus errores) ==\n";
    for (const pred of pastPredictions.slice(0, 10)) {
      const result = pred.prediction_correct === 1 ? "ACERTASTE ✓" : pred.prediction_correct === 0 ? "FALLASTE ✗" : "N/A";
      context += `- ${pred.prediction_date.slice(0, 10)}: ${pred.action} ${pred.ticker} (confianza ${pred.confidence}%) → Cambio real: ${pred.actual_change_pct}% [${result}]\n`;
      if (pred.prediction_correct === 0) {
        context += `  Razón original: "${pred.reasoning?.slice(0, 100)}..."\n`;
      }
    }
  }

  // Capital history
  if (capitalHist.length > 0) {
    context += "\n== EVOLUCIÓN DEL CAPITAL ==\n";
    for (const c of capitalHist) {
      context += `- ${c.date}: Disponible $${c.capital_available_ars?.toLocaleString()} + Portfolio $${c.portfolio_value_ars?.toLocaleString()} = Total $${c.total_value_ars?.toLocaleString()}\n`;
    }
  }

  return context;
}

export default db;
