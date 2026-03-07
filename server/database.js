// ============================================================
// DATABASE SERVICE
// SQLite for portfolio, predictions, and self-learning loop
// ============================================================

import { DatabaseSync } from "node:sqlite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "data", "cedear-advisor.db");

// Ensure data directory exists
import { mkdirSync } from "fs";
mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for better concurrent performance
db.exec("PRAGMA journal_mode = WAL");

// ============================================================
// SCHEMA
// ============================================================
db.exec(`
  -- Portfolio: posiciones actuales del inversor
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

  -- Portfolio transactions: historial completo de compras/ventas
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

  -- AI Predictions: cada recomendación que hace la IA
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
    
    -- Market state at prediction time
    price_usd_at_prediction REAL,
    price_ars_at_prediction REAL,
    ccl_at_prediction REAL,
    rsi_at_prediction REAL,
    score_composite INTEGER,
    score_technical INTEGER,
    score_fundamental INTEGER,
    score_sentiment INTEGER,
    pe_at_prediction REAL,
    
    -- Evaluation fields (filled later)
    evaluated INTEGER NOT NULL DEFAULT 0,
    evaluation_date TEXT,
    price_usd_at_evaluation REAL,
    actual_change_pct REAL,
    prediction_correct INTEGER,
    evaluation_notes TEXT,
    
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- AI Analysis Sessions: análisis completos (portfolio-level)
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
    
    -- Performance tracking
    evaluated INTEGER NOT NULL DEFAULT 0,
    evaluation_date TEXT,
    portfolio_value_at_evaluation REAL,
    return_pct REAL,
    evaluation_notes TEXT,
    
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Self-evaluation metrics: resumen de performance del bot
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

  -- Capital tracking: seguimiento del capital total
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

  -- Users: single-user auth
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

// ============================================================
// PORTFOLIO OPERATIONS
// ============================================================

export function getPortfolio() {
  return db.prepare("SELECT * FROM portfolio ORDER BY ticker").all();
}

export function getPortfolioSummary() {
  return db.prepare(`
    SELECT ticker, SUM(shares) as total_shares, 
           ROUND(SUM(shares * avg_price_ars) / SUM(shares), 2) as weighted_avg_price,
           MIN(date_bought) as first_bought
    FROM portfolio
    GROUP BY ticker
    ORDER BY ticker
  `).all();
}

export function addPosition(ticker, shares, priceArs, priceUsd, cclRate, notes = "") {
  try {
    db.exec("BEGIN");
    // Add to portfolio
    db.prepare(`
      INSERT INTO portfolio (ticker, shares, avg_price_ars, notes)
      VALUES (?, ?, ?, ?)
    `).run(ticker, shares, priceArs, notes);

    // Log the transaction
    db.prepare(`
      INSERT INTO transactions (ticker, type, shares, price_ars, price_usd, ccl_rate, total_ars, notes)
      VALUES (?, 'BUY', ?, ?, ?, ?, ?, ?)
    `).run(ticker, shares, priceArs, priceUsd, cclRate, shares * priceArs, notes);

    db.exec("COMMIT");
    return { success: true };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function sellPosition(ticker, shares, priceArs, priceUsd, cclRate, notes = "") {
  try {
    db.exec("BEGIN");
    // Get current position
    const positions = db.prepare(
      "SELECT * FROM portfolio WHERE ticker = ? ORDER BY date_bought ASC"
    ).all(ticker);

    const totalShares = positions.reduce((s, p) => s + p.shares, 0);
    if (shares > totalShares) {
      throw new Error(`No tenés ${shares} CEDEARs de ${ticker}. Tenés ${totalShares}.`);
    }

    // Remove shares FIFO style
    let remaining = shares;
    for (const pos of positions) {
      if (remaining <= 0) break;
      if (pos.shares <= remaining) {
        db.prepare("DELETE FROM portfolio WHERE id = ?").run(pos.id);
        remaining -= pos.shares;
      } else {
        db.prepare("UPDATE portfolio SET shares = ?, updated_at = datetime('now') WHERE id = ?")
          .run(pos.shares - remaining, pos.id);
        remaining = 0;
      }
    }

    // Log the transaction
    db.prepare(`
      INSERT INTO transactions (ticker, type, shares, price_ars, price_usd, ccl_rate, total_ars, notes)
      VALUES (?, 'SELL', ?, ?, ?, ?, ?, ?)
    `).run(ticker, shares, priceArs, priceUsd, cclRate, shares * priceArs, notes);

    db.exec("COMMIT");
    return { success: true };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function getTransactions(ticker = null, limit = 50) {
  if (ticker) {
    return db.prepare(
      "SELECT * FROM transactions WHERE ticker = ? ORDER BY date_executed DESC LIMIT ?"
    ).all(ticker, limit);
  }
  return db.prepare(
    "SELECT * FROM transactions ORDER BY date_executed DESC LIMIT ?"
  ).all(limit);
}

// ============================================================
// PREDICTIONS / RECOMMENDATIONS LOG
// ============================================================

export function logPrediction({
  ticker, action, confidence, targetPriceUsd, stopLossPct, targetPct,
  horizon, reasoning, newsContext, priceUsd, priceArs, ccl,
  rsi, scoreComposite, scoreTechnical, scoreFundamental, scoreSentiment, pe,
}) {
  return db.prepare(`
    INSERT INTO predictions (
      ticker, action, confidence, target_price_usd, stop_loss_pct, target_pct,
      horizon, reasoning, news_context,
      price_usd_at_prediction, price_ars_at_prediction, ccl_at_prediction,
      rsi_at_prediction, score_composite, score_technical, score_fundamental, score_sentiment,
      pe_at_prediction
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ticker, action, confidence, targetPriceUsd, stopLossPct, targetPct,
    horizon, reasoning, newsContext,
    priceUsd, priceArs, ccl,
    rsi, scoreComposite, scoreTechnical, scoreFundamental, scoreSentiment, pe,
  );
}

export function getPredictions(ticker = null, onlyUnevaluated = false, limit = 100) {
  let query = "SELECT * FROM predictions WHERE 1=1";
  const params = [];
  if (ticker) { query += " AND ticker = ?"; params.push(ticker); }
  if (onlyUnevaluated) { query += " AND evaluated = 0"; }
  query += " ORDER BY prediction_date DESC LIMIT ?";
  params.push(limit);
  return db.prepare(query).all(...params);
}

export function evaluatePrediction(id, currentPriceUsd, notes = "") {
  const prediction = db.prepare("SELECT * FROM predictions WHERE id = ?").get(id);
  if (!prediction) throw new Error(`Prediction ${id} not found`);

  const actualChange = prediction.price_usd_at_prediction > 0
    ? ((currentPriceUsd - prediction.price_usd_at_prediction) / prediction.price_usd_at_prediction) * 100
    : 0;

  // Determine if prediction was correct
  let correct = 0;
  if (prediction.action === "COMPRAR" && actualChange > 0) correct = 1;
  else if (prediction.action === "VENDER" && actualChange < 0) correct = 1;
  else if (prediction.action === "MANTENER" && Math.abs(actualChange) < 10) correct = 1;
  else if (prediction.action === "WATCHLIST") correct = -1; // Not applicable

  db.prepare(`
    UPDATE predictions SET
      evaluated = 1,
      evaluation_date = datetime('now'),
      price_usd_at_evaluation = ?,
      actual_change_pct = ?,
      prediction_correct = ?,
      evaluation_notes = ?
    WHERE id = ?
  `).run(currentPriceUsd, Math.round(actualChange * 100) / 100, correct, notes, id);

  return { id, actualChange: Math.round(actualChange * 100) / 100, correct, prediction };
}

// Batch evaluate all pending predictions for a ticker
export function evaluatePredictionsForTicker(ticker, currentPriceUsd) {
  const pending = db.prepare(
    "SELECT * FROM predictions WHERE ticker = ? AND evaluated = 0"
  ).all(ticker);

  const results = [];
  for (const pred of pending) {
    // Only evaluate if enough time has passed based on horizon
    const daysSince = Math.floor(
      (Date.now() - new Date(pred.prediction_date).getTime()) / 86400000
    );
    const minDays = pred.horizon?.includes("Corto") ? 7 : pred.horizon?.includes("Largo") ? 90 : 30;

    if (daysSince >= minDays) {
      results.push(evaluatePrediction(pred.id, currentPriceUsd));
    }
  }
  return results;
}

// ============================================================
// ANALYSIS SESSIONS LOG
// ============================================================

export function logAnalysisSession({
  capitalArs, portfolioValueArs, cclRate, marketSummary,
  strategyMonthly, risks, fullResponse,
}) {
  return db.prepare(`
    INSERT INTO analysis_sessions (
      capital_ars, portfolio_value_ars, ccl_rate, market_summary,
      strategy_monthly, risks, full_response
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    capitalArs, portfolioValueArs, cclRate, marketSummary,
    strategyMonthly, JSON.stringify(risks), JSON.stringify(fullResponse),
  );
}

export function getAnalysisSessions(limit = 20) {
  return db.prepare(
    "SELECT * FROM analysis_sessions ORDER BY session_date DESC LIMIT ?"
  ).all(limit);
}

// ============================================================
// BOT PERFORMANCE / SELF-EVALUATION
// ============================================================

export function calculateBotPerformance(daysBack = 30) {
  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString();

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN prediction_correct = 1 THEN 1 ELSE 0 END) as correct,
      SUM(CASE WHEN prediction_correct = 0 THEN 1 ELSE 0 END) as incorrect,
      AVG(CASE WHEN target_pct IS NOT NULL THEN target_pct END) as avg_target,
      AVG(actual_change_pct) as avg_actual_change,
      AVG(confidence) as avg_confidence
    FROM predictions
    WHERE evaluated = 1 AND prediction_date >= ?
  `).get(cutoff);

  const bestPick = db.prepare(`
    SELECT ticker, actual_change_pct FROM predictions
    WHERE evaluated = 1 AND prediction_date >= ? AND action = 'COMPRAR'
    ORDER BY actual_change_pct DESC LIMIT 1
  `).get(cutoff);

  const worstPick = db.prepare(`
    SELECT ticker, actual_change_pct FROM predictions
    WHERE evaluated = 1 AND prediction_date >= ? AND action = 'COMPRAR'
    ORDER BY actual_change_pct ASC LIMIT 1
  `).get(cutoff);

  const byAction = db.prepare(`
    SELECT action,
      COUNT(*) as total,
      SUM(CASE WHEN prediction_correct = 1 THEN 1 ELSE 0 END) as correct,
      AVG(actual_change_pct) as avg_change
    FROM predictions
    WHERE evaluated = 1 AND prediction_date >= ?
    GROUP BY action
  `).all(cutoff);

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

// Get historical performance for the AI to learn from
export function getPredictionHistory(limit = 50) {
  return db.prepare(`
    SELECT ticker, action, confidence, target_pct, horizon, reasoning,
           price_usd_at_prediction, actual_change_pct, prediction_correct,
           prediction_date, evaluation_date, evaluation_notes,
           score_composite, rsi_at_prediction, pe_at_prediction
    FROM predictions
    WHERE evaluated = 1
    ORDER BY prediction_date DESC
    LIMIT ?
  `).all(limit);
}

// ============================================================
// CAPITAL HISTORY
// ============================================================

export function logCapital(capitalArs, portfolioValueArs, cclRate, monthlyDeposit = 1000000) {
  return db.prepare(`
    INSERT INTO capital_history (capital_available_ars, portfolio_value_ars, total_value_ars, ccl_rate, monthly_deposit)
    VALUES (?, ?, ?, ?, ?)
  `).run(capitalArs, portfolioValueArs, capitalArs + portfolioValueArs, cclRate, monthlyDeposit);
}

export function getCapitalHistory(limit = 90) {
  return db.prepare(
    "SELECT * FROM capital_history ORDER BY date DESC LIMIT ?"
  ).all(limit);
}

// ============================================================
// CONTEXT BUILDER FOR AI
// Builds a rich context string so Claude knows everything
// ============================================================

export function buildAIContext() {
  const portfolio = getPortfolioSummary();
  const recentTx = getTransactions(null, 10);
  const performance = calculateBotPerformance(60);
  const pastPredictions = getPredictionHistory(20);
  const capitalHist = getCapitalHistory(5);

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
