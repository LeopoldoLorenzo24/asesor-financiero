// ============================================================
// DATABASE SERVICE
// SQLite (Turso/libsql) for portfolio, predictions, and self-learning loop
// ============================================================

import { createClient } from "@libsql/client";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";
import { safeJsonParse, sanitizePromptString } from "./utils.js";
import { calcSharpeRatio, inferPeriodsPerYearFromDates } from "./riskMetrics.js";
import { normalizeGovernanceSelection } from "./governancePolicies.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbUrl = process.env.TURSO_URL || `file:${path.join(__dirname, "data", "cedear-advisor.db")}`;

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

interface Migration {
  version: number;
  name: string;
  sql: string;
}

type DbScalar = string | number | boolean | Uint8Array | null;

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "add_salt_to_users",
    sql: "ALTER TABLE users ADD COLUMN salt TEXT DEFAULT NULL",
  },
  {
    version: 3,
    name: "create_rate_limit_entries",
    sql: `CREATE TABLE IF NOT EXISTS rate_limit_entries (
      ip TEXT PRIMARY KEY,
      window_start_ms INTEGER NOT NULL DEFAULT 0,
      count INTEGER NOT NULL DEFAULT 0
    )`,
  },
  {
    version: 2,
    name: "create_decision_audit_logs",
    sql: `CREATE TABLE IF NOT EXISTS decision_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route TEXT NOT NULL,
      profile TEXT,
      capital_ars REAL,
      tickers_considered TEXT,
      raw_output TEXT,
      normalized_output TEXT,
      consistency_notes TEXT,
      schema_errors TEXT,
      retry_attempted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  },
  {
    version: 4,
    name: "create_paper_trading_config",
    sql: `CREATE TABLE IF NOT EXISTS paper_trading_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      auto_sync_enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO paper_trading_config (id, auto_sync_enabled) VALUES (1, 0)`,
  },
  {
    version: 5,
    name: "create_track_record",
    sql: `CREATE TABLE IF NOT EXISTS track_record (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      virtual_value_ars REAL,
      real_value_ars REAL,
      spy_value_ars REAL,
      capital_ars REAL,
      ccl_rate REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  },
  {
    version: 6,
    name: "add_2fa_to_users",
    sql: `ALTER TABLE users ADD COLUMN totp_secret TEXT DEFAULT NULL`,
  },
  {
    version: 7,
    name: "create_virtual_transactions",
    sql: `CREATE TABLE IF NOT EXISTS virtual_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('BUY','SELL','DIVIDEND','SPLIT')),
      shares REAL NOT NULL DEFAULT 0,
      requested_shares REAL,
      executed_shares REAL,
      requested_price_ars REAL,
      executed_price_ars REAL,
      slippage_pct REAL,
      delay_minutes INTEGER,
      partial_fill INTEGER NOT NULL DEFAULT 0,
      broker_costs_ars REAL NOT NULL DEFAULT 0,
      total_cost_ars REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  },
  {
    version: 8,
    name: "create_corporate_actions",
    sql: `CREATE TABLE IF NOT EXISTS corporate_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      action_date TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('DIVIDEND','SPLIT','RATIO_CHANGE')),
      amount REAL,
      ratio_from REAL,
      ratio_to REAL,
      description TEXT,
      source TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  },
  {
    version: 9,
    name: "enhance_track_record",
    sql: `ALTER TABLE track_record ADD COLUMN virtual_dividends_ars REAL DEFAULT 0;
      ALTER TABLE track_record ADD COLUMN virtual_total_ars REAL DEFAULT 0;
      ALTER TABLE track_record ADD COLUMN alpha_vs_spy_pct REAL;
      ALTER TABLE track_record ADD COLUMN drawdown_from_peak_pct REAL;
      ALTER TABLE track_record ADD COLUMN daily_return_pct REAL;
      ALTER TABLE track_record ADD COLUMN spy_daily_return_pct REAL;
      ALTER TABLE track_record ADD COLUMN rolling_sharpe REAL;`,
  },
  {
    version: 10,
    name: "create_track_record_monthly",
    sql: `CREATE TABLE IF NOT EXISTS track_record_monthly (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL UNIQUE,
      virtual_return_pct REAL,
      real_return_pct REAL,
      spy_return_pct REAL,
      alpha_pct REAL,
      max_drawdown_pct REAL,
      sharpe_ratio REAL,
      win_rate_pct REAL,
      trades_count INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  },
  {
    version: 11,
    name: "create_governance_policy_tables",
    sql: `CREATE TABLE IF NOT EXISTS governance_policy_settings (
      user_id INTEGER PRIMARY KEY,
      overlay_key TEXT NOT NULL DEFAULT 'system_default',
      deployment_mode TEXT NOT NULL DEFAULT 'system_auto',
      reason TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS governance_policy_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      previous_overlay_key TEXT,
      previous_deployment_mode TEXT,
      next_overlay_key TEXT NOT NULL,
      next_deployment_mode TEXT NOT NULL,
      reason TEXT,
      impact_preview TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_governance_audit_user_created ON governance_policy_audit_logs(user_id, created_at DESC);`,
  },
  {
    version: 12,
    name: "create_broker_import_audit_logs",
    sql: `CREATE TABLE IF NOT EXISTS broker_import_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      broker_key TEXT NOT NULL DEFAULT 'generic',
      source_type TEXT NOT NULL DEFAULT 'csv',
      source_name TEXT,
      snapshot_date TEXT,
      ccl_rate REAL,
      input_hash TEXT NOT NULL,
      raw_input TEXT,
      imported_positions_json TEXT,
      reconciliation_json TEXT,
      applied INTEGER NOT NULL DEFAULT 0,
      applied_transaction_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_broker_import_audit_user_created ON broker_import_audit_logs(user_id, created_at DESC);`,
  },
  {
    version: 13,
    name: "create_intraday_monitor_tables",
    sql: `CREATE TABLE IF NOT EXISTS intraday_monitor_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 0,
      interval_minutes INTEGER NOT NULL DEFAULT 15,
      market_open_local TEXT NOT NULL DEFAULT '10:30',
      market_close_local TEXT NOT NULL DEFAULT '17:00',
      timezone TEXT NOT NULL DEFAULT 'America/Argentina/Cordoba',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO intraday_monitor_settings (
      id, enabled, interval_minutes, market_open_local, market_close_local, timezone
    ) VALUES (1, 0, 15, '10:30', '17:00', 'America/Argentina/Cordoba');

    CREATE TABLE IF NOT EXISTS intraday_monitor_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      stopped_at TEXT,
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','stopped','crashed')),
      started_by TEXT,
      stop_reason TEXT,
      interval_minutes INTEGER NOT NULL,
      market_open_local TEXT NOT NULL,
      market_close_local TEXT NOT NULL,
      timezone TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS intraday_monitor_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      snapshot_at TEXT NOT NULL,
      market_state TEXT NOT NULL DEFAULT 'open',
      source TEXT NOT NULL DEFAULT 'scheduled',
      ccl_rate REAL,
      vix_value REAL,
      vix_change_pct REAL,
      vix_regime TEXT,
      spy_price_usd REAL,
      spy_change_pct REAL,
      qqq_price_usd REAL,
      qqq_change_pct REAL,
      portfolio_value_ars REAL,
      capital_available_ars REAL,
      total_value_ars REAL,
      tracked_tickers_count INTEGER NOT NULL DEFAULT 0,
      position_count INTEGER NOT NULL DEFAULT 0,
      event_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_intraday_snapshots_snapshot_at ON intraday_monitor_snapshots(snapshot_at DESC);

    CREATE TABLE IF NOT EXISTS intraday_monitor_ticker_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      shares REAL NOT NULL DEFAULT 0,
      avg_cost_ars REAL,
      price_usd REAL,
      price_ars REAL,
      byma_price_ars REAL,
      day_change_pct REAL,
      pnl_pct REAL,
      value_ars REAL,
      position_weight_pct REAL,
      active_prediction_action TEXT,
      prediction_confidence INTEGER,
      stop_loss_breach INTEGER NOT NULL DEFAULT 0,
      take_profit_breach INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_intraday_ticker_snapshots_snapshot_id ON intraday_monitor_ticker_snapshots(snapshot_id);
    CREATE INDEX IF NOT EXISTS idx_intraday_ticker_snapshots_ticker ON intraday_monitor_ticker_snapshots(ticker, created_at DESC);

    CREATE TABLE IF NOT EXISTS intraday_monitor_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      snapshot_id INTEGER,
      event_key TEXT UNIQUE,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info','warning','critical')),
      ticker TEXT,
      message TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_intraday_monitor_events_created_at ON intraday_monitor_events(created_at DESC);`,
  },
];

async function runMigrations() {
  const sortedMigrations = [...MIGRATIONS].sort((a, b) => a.version - b.version);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (await db.execute("SELECT version FROM _migrations")).rows.map((r) => (r as unknown as { version: number }).version)
  );

  for (const migration of sortedMigrations) {
    if (applied.has(migration.version)) continue;
    try {
      const hasMultiple = migration.sql.trim().replace(/\s+/g, " ").includes("; CREATE") ||
        migration.sql.trim().replace(/\s+/g, " ").includes("; INSERT") ||
        migration.sql.trim().replace(/\s+/g, " ").includes("; ALTER") ||
        migration.sql.trim().replace(/\s+/g, " ").includes("; CREATE INDEX");
      if (hasMultiple) {
        await db.executeMultiple(migration.sql);
      } else {
        await db.execute(migration.sql);
      }
      await db.execute({
        sql: "INSERT INTO _migrations (version, name) VALUES (?, ?)",
        args: [migration.version, migration.name],
      });
      console.log(`[db] Migration ${migration.version} "${migration.name}" aplicada.`);
    } catch (err: any) {
      if (!err.message?.includes("already exists") && !err.message?.includes("duplicate column")) {
        console.error(`[db] Migration ${migration.version} falló:`, err.message);
      } else {
        try {
          await db.execute({
            sql: "INSERT OR IGNORE INTO _migrations (version, name) VALUES (?, ?)",
            args: [migration.version, migration.name],
          });
        } catch (_) {}
      }
    }
  }
}

async function ensureTrackRecordSchema() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS track_record (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      virtual_value_ars REAL,
      real_value_ars REAL,
      spy_value_ars REAL,
      capital_ars REAL,
      ccl_rate REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const columns = (await db.execute("PRAGMA table_info(track_record)")).rows
    .map((row) => String((row as any).name || ""));
  const existing = new Set(columns);

  const requiredColumns: Array<{ name: string; sql: string }> = [
    { name: "virtual_dividends_ars", sql: "ALTER TABLE track_record ADD COLUMN virtual_dividends_ars REAL DEFAULT 0" },
    { name: "virtual_total_ars", sql: "ALTER TABLE track_record ADD COLUMN virtual_total_ars REAL DEFAULT 0" },
    { name: "alpha_vs_spy_pct", sql: "ALTER TABLE track_record ADD COLUMN alpha_vs_spy_pct REAL" },
    { name: "drawdown_from_peak_pct", sql: "ALTER TABLE track_record ADD COLUMN drawdown_from_peak_pct REAL" },
    { name: "daily_return_pct", sql: "ALTER TABLE track_record ADD COLUMN daily_return_pct REAL" },
    { name: "spy_daily_return_pct", sql: "ALTER TABLE track_record ADD COLUMN spy_daily_return_pct REAL" },
    { name: "rolling_sharpe", sql: "ALTER TABLE track_record ADD COLUMN rolling_sharpe REAL" },
  ];

  for (const column of requiredColumns) {
    if (existing.has(column.name)) continue;
    await db.execute(column.sql);
  }
}

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

    CREATE TABLE IF NOT EXISTS governance_policy_settings (
      user_id INTEGER PRIMARY KEY,
      overlay_key TEXT NOT NULL DEFAULT 'system_default',
      deployment_mode TEXT NOT NULL DEFAULT 'system_auto',
      reason TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS governance_policy_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      previous_overlay_key TEXT,
      previous_deployment_mode TEXT,
      next_overlay_key TEXT NOT NULL,
      next_deployment_mode TEXT NOT NULL,
      reason TEXT,
      impact_preview TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS broker_import_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      broker_key TEXT NOT NULL DEFAULT 'generic',
      source_type TEXT NOT NULL DEFAULT 'csv',
      source_name TEXT,
      snapshot_date TEXT,
      ccl_rate REAL,
      input_hash TEXT NOT NULL,
      raw_input TEXT,
      imported_positions_json TEXT,
      reconciliation_json TEXT,
      applied INTEGER NOT NULL DEFAULT 0,
      applied_transaction_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_portfolio_ticker ON portfolio(ticker);
    CREATE INDEX IF NOT EXISTS idx_transactions_ticker ON transactions(ticker);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date_executed);
    CREATE INDEX IF NOT EXISTS idx_predictions_ticker ON predictions(ticker);
    CREATE INDEX IF NOT EXISTS idx_predictions_date ON predictions(prediction_date);
    CREATE INDEX IF NOT EXISTS idx_predictions_evaluated ON predictions(evaluated);
    CREATE INDEX IF NOT EXISTS idx_governance_audit_user_created ON governance_policy_audit_logs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_broker_import_audit_user_created ON broker_import_audit_logs(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS monthly_postmortems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_label TEXT NOT NULL,
      analysis_date TEXT NOT NULL DEFAULT (datetime('now')),
      total_predictions INTEGER NOT NULL DEFAULT 0,
      correct_predictions INTEGER NOT NULL DEFAULT 0,
      accuracy_pct REAL,
      total_return_pct REAL,
      spy_return_pct REAL,
      beat_spy INTEGER NOT NULL DEFAULT 0,
      best_pick TEXT,
      best_pick_return REAL,
      worst_pick TEXT,
      worst_pick_return REAL,
      lessons_learned TEXT,
      self_imposed_rules TEXT,
      patterns_detected TEXT,
      confidence_in_strategy INTEGER,
      raw_ai_response TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_postmortems_date ON monthly_postmortems(analysis_date);

    CREATE TABLE IF NOT EXISTS ai_usage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      latency_ms INTEGER,
      success INTEGER NOT NULL DEFAULT 1,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_ai_usage_route ON ai_usage_logs(route);

    CREATE TABLE IF NOT EXISTS virtual_portfolio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      shares REAL NOT NULL DEFAULT 0,
      avg_price_ars REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS adherence_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      plan_step INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      ticker TEXT NOT NULL,
      cantidad_plan INTEGER NOT NULL DEFAULT 0,
      cantidad_ejecutada INTEGER NOT NULL DEFAULT 0,
      monto_plan REAL NOT NULL DEFAULT 0,
      monto_ejecutado REAL NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      discrepancy_pct REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ml_training_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      date TEXT NOT NULL,
      rsi REAL,
      macd_hist REAL,
      sma20_dist REAL,
      sma50_dist REAL,
      bb_position REAL,
      volume_trend REAL,
      perf_1m REAL,
      perf_3m REAL,
      sector TEXT,
      pe REAL,
      forward_pe REAL,
      eps_growth REAL,
      revenue_growth REAL,
      profit_margin REAL,
      roe REAL,
      dividend_yield REAL,
      beta REAL,
      vix REAL,
      ccl_rate REAL,
      target_return_1m REAL,
      target_return_3m REAL,
      actual_return_1m REAL,
      actual_return_3m REAL,
      label_1m INTEGER,
      label_3m INTEGER,
      source TEXT NOT NULL DEFAULT 'prediction',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_virtual_portfolio_ticker ON virtual_portfolio(ticker);
    CREATE INDEX IF NOT EXISTS idx_adherence_session ON adherence_log(session_id);
    CREATE INDEX IF NOT EXISTS idx_ml_ticker_date ON ml_training_data(ticker, date);
  `);

  await runMigrations();
  await ensureTrackRecordSchema();
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

export async function addPosition(ticker: string, shares: number, priceArs: number, priceUsd: number | null, cclRate: number | null, notes = "") {
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

export async function sellPosition(ticker: string, shares: number, priceArs: number, priceUsd: number | null, cclRate: number | null, notes = "") {
  const positions = (await db.execute({
    sql: "SELECT * FROM portfolio WHERE ticker = ? ORDER BY date_bought ASC",
    args: [ticker],
  })).rows as unknown as { id: number; shares: number }[];

  const totalShares = positions.reduce((s, p) => s + p.shares, 0);
  if (shares > totalShares) {
    throw new Error(`No tenés ${shares} CEDEARs de ${ticker}. Tenés ${totalShares}.`);
  }

  const ops: any[] = [];
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

export async function deletePosition(ticker: string) {
  await db.execute({ sql: "DELETE FROM portfolio WHERE ticker = ?", args: [ticker] });
}

export async function getTransactions(ticker: string | null = null, limit = 50) {
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
// PORTFOLIO IMPORT
// ============================================================

export async function resetPortfolio(positions: { ticker: string; shares: number; priceArs: number }[]) {
  const ops: any[] = [{ sql: "DELETE FROM portfolio", args: [] }];
  for (const p of positions) {
    const t = p.ticker.toUpperCase();
    ops.push({
      sql: `INSERT INTO portfolio (ticker, shares, avg_price_ars, notes) VALUES (?, ?, ?, ?)`,
      args: [t, p.shares, p.priceArs, "importación manual"],
    });
    ops.push({
      sql: `INSERT INTO transactions (ticker, type, shares, price_ars, price_usd, ccl_rate, total_ars, notes) VALUES (?, 'BUY', ?, ?, NULL, NULL, ?, ?)`,
      args: [t, p.shares, p.priceArs, p.shares * p.priceArs, "importación manual"],
    });
  }
  await db.batch(ops, "write");
  return positions.length;
}

export async function previewPortfolioSync(positions: { ticker: string; shares: number; priceArs: number; priceUsd?: number | null }[]) {
  const summaryRows = await getPortfolioSummary() as unknown as { ticker: string; total_shares: number; weighted_avg_price: number }[];
  const currentMap = new Map(
    summaryRows.map((row) => [row.ticker, {
      shares: Number(row.total_shares || 0),
      avgPriceArs: Number(row.weighted_avg_price || 0),
    }])
  );

  const targetMap = new Map(
    positions.map((row) => [row.ticker.toUpperCase(), {
      shares: Number(row.shares || 0),
      priceArs: Number(row.priceArs || 0),
      priceUsd: row.priceUsd != null ? Number(row.priceUsd) : null,
    }])
  );

  const actions: {
    ticker: string;
    type: "BUY" | "SELL";
    shares: number;
    priceArs: number;
    priceUsd: number | null;
    reason: string;
  }[] = [];

  for (const [ticker, target] of targetMap.entries()) {
    const current = currentMap.get(ticker) || { shares: 0, avgPriceArs: 0 };
    const diff = target.shares - current.shares;
    if (diff > 0) {
      actions.push({
        ticker,
        type: "BUY",
        shares: diff,
        priceArs: target.priceArs,
        priceUsd: target.priceUsd,
        reason: current.shares > 0 ? "increase_to_match_broker" : "new_position_from_broker",
      });
    } else if (diff < 0) {
      actions.push({
        ticker,
        type: "SELL",
        shares: Math.abs(diff),
        priceArs: target.priceArs > 0 ? target.priceArs : current.avgPriceArs,
        priceUsd: target.priceUsd,
        reason: target.shares > 0 ? "reduce_to_match_broker" : "close_position_missing_in_broker",
      });
    }
  }

  for (const [ticker, current] of currentMap.entries()) {
    if (targetMap.has(ticker)) continue;
    if (current.shares <= 0) continue;
    actions.push({
      ticker,
      type: "SELL",
      shares: current.shares,
      priceArs: current.avgPriceArs,
      priceUsd: null,
      reason: "close_position_missing_in_broker",
    });
  }

  const buyActions = actions.filter((action) => action.type === "BUY");
  const sellActions = actions.filter((action) => action.type === "SELL");

  return {
    actions,
    summary: {
      currentPositions: currentMap.size,
      brokerPositions: targetMap.size,
      tickersWithChanges: new Set(actions.map((action) => action.ticker)).size,
      totalActions: actions.length,
      buyActions: buyActions.length,
      sellActions: sellActions.length,
      sharesToBuy: buyActions.reduce((sum, action) => sum + action.shares, 0),
      sharesToSell: sellActions.reduce((sum, action) => sum + action.shares, 0),
      grossBuyArs: Math.round(buyActions.reduce((sum, action) => sum + action.shares * action.priceArs, 0) * 100) / 100,
      grossSellArs: Math.round(sellActions.reduce((sum, action) => sum + action.shares * action.priceArs, 0) * 100) / 100,
    },
  };
}

export async function syncPortfolio(
  positions: { ticker: string; shares: number; priceArs: number; priceUsd?: number | null }[],
  options: { note?: string; executedAt?: string | null } = {}
) {
  const allLots = (await db.execute("SELECT * FROM portfolio ORDER BY ticker, date_bought ASC")).rows as unknown as { ticker: string; id: number; shares: number; avg_price_ars: number }[];
  const note = options.note || "sincronización";
  const executedAt = options.executedAt || null;

  const lotsByTicker: Record<string, typeof allLots> = {};
  for (const lot of allLots) {
    if (!lotsByTicker[lot.ticker]) lotsByTicker[lot.ticker] = [];
    lotsByTicker[lot.ticker].push(lot);
  }
  const dbTotals: Record<string, number> = {};
  for (const [ticker, lots] of Object.entries(lotsByTicker)) {
    dbTotals[ticker] = lots.reduce((s, l) => s + l.shares, 0);
  }

  const brokerMap = new Map(
    positions.map(p => [p.ticker.toUpperCase(), {
      shares: parseInt(String(p.shares)),
      priceArs: parseFloat(String(p.priceArs)),
      priceUsd: p.priceUsd || null,
    }])
  );

  const ops: any[] = [];
  const created: any[] = [];

  for (const [ticker, broker] of brokerMap) {
    const dbShares = dbTotals[ticker] || 0;
    const diff = broker.shares - dbShares;

    if (diff > 0) {
      ops.push({
        sql: `INSERT INTO portfolio (ticker, shares, avg_price_ars, notes) VALUES (?, ?, ?, ?)`,
        args: [ticker, diff, broker.priceArs, note],
      });
      ops.push({
        sql: `INSERT INTO transactions (ticker, type, shares, price_ars, price_usd, ccl_rate, total_ars, notes, date_executed) VALUES (?, 'BUY', ?, ?, ?, NULL, ?, ?, COALESCE(?, date('now')))`,
        args: [ticker, diff, broker.priceArs, broker.priceUsd, diff * broker.priceArs, note, executedAt],
      });
      created.push({ ticker, type: "BUY", shares: diff, priceArs: broker.priceArs });
    } else if (diff < 0) {
      const sharesToSell = -diff;
      const lots = lotsByTicker[ticker] || [];
      let remaining = sharesToSell;
      for (const lot of lots) {
        if (remaining <= 0) break;
        if (lot.shares <= remaining) {
          ops.push({ sql: "DELETE FROM portfolio WHERE id = ?", args: [lot.id] });
          remaining -= lot.shares;
        } else {
          ops.push({
            sql: "UPDATE portfolio SET shares = ?, updated_at = datetime('now') WHERE id = ?",
            args: [lot.shares - remaining, lot.id],
          });
          remaining = 0;
        }
      }
      ops.push({
        sql: `INSERT INTO transactions (ticker, type, shares, price_ars, price_usd, ccl_rate, total_ars, notes, date_executed) VALUES (?, 'SELL', ?, ?, ?, NULL, ?, ?, COALESCE(?, date('now')))`,
        args: [ticker, sharesToSell, broker.priceArs, broker.priceUsd, sharesToSell * broker.priceArs, note, executedAt],
      });
      created.push({ ticker, type: "SELL", shares: sharesToSell, priceArs: broker.priceArs });
    }
  }

  for (const [ticker, dbShares] of Object.entries(dbTotals)) {
    if (!brokerMap.has(ticker)) {
      const lots = lotsByTicker[ticker] || [];
      const avgPrice = lots.reduce((s, l) => s + l.shares * l.avg_price_ars, 0) / dbShares;
      ops.push({ sql: "DELETE FROM portfolio WHERE ticker = ?", args: [ticker] });
      ops.push({
        sql: `INSERT INTO transactions (ticker, type, shares, price_ars, price_usd, ccl_rate, total_ars, notes, date_executed) VALUES (?, 'SELL', ?, ?, NULL, NULL, ?, ?, COALESCE(?, date('now')))`,
        args: [ticker, dbShares, avgPrice, dbShares * avgPrice, `${note} — posición cerrada`, executedAt],
      });
      created.push({ ticker, type: "SELL", shares: dbShares, priceArs: Math.round(avgPrice), note: "cerrada" });
    }
  }

  if (ops.length > 0) await db.batch(ops, "write");
  return created;
}

export async function getHistoricalImportDbState() {
  const [portfolioLotsRow, transactionsRow, capitalHistoryRow, trackRecordRow, latestTxRow] = (
    await db.batch([
      "SELECT COUNT(*) AS count FROM portfolio",
      "SELECT COUNT(*) AS count FROM transactions",
      "SELECT COUNT(*) AS count FROM capital_history",
      "SELECT COUNT(*) AS count FROM track_record",
      "SELECT MAX(date_executed) AS latest_transaction_date FROM transactions",
    ], "read")
  );

  const portfolioLots = Number((portfolioLotsRow.rows?.[0] as any)?.count || 0);
  const transactions = Number((transactionsRow.rows?.[0] as any)?.count || 0);
  const capitalHistory = Number((capitalHistoryRow.rows?.[0] as any)?.count || 0);
  const trackRecord = Number((trackRecordRow.rows?.[0] as any)?.count || 0);
  const latestTransactionDate = String((latestTxRow.rows?.[0] as any)?.latest_transaction_date || "") || null;

  return {
    portfolioLots,
    transactions,
    capitalHistory,
    trackRecord,
    latestTransactionDate,
    isClean: portfolioLots === 0 && transactions === 0,
  };
}

export async function applyHistoricalBrokerLedgerEntries(
  entries: Array<{
    ticker: string;
    type: "BUY" | "SELL";
    shares: number;
    priceArs: number;
    totalArs: number;
    executedAt: string;
    notes?: string;
  }>,
  options: { sourceLabel?: string; requireClean?: boolean } = {}
) {
  const dbState = await getHistoricalImportDbState();
  if (options.requireClean && !dbState.isClean) {
    throw new Error("La importación histórica solo se puede aplicar sobre una base limpia de portfolio/transacciones.");
  }
  const startingClean = dbState.isClean;

  const sourceLabel = String(options.sourceLabel || "import histórico broker").trim();
  const existingLots = (
    await db.execute("SELECT id, ticker, shares, avg_price_ars, date_bought FROM portfolio ORDER BY ticker, date_bought ASC, id ASC")
  ).rows as unknown as { id: number; ticker: string; shares: number; avg_price_ars: number; date_bought: string }[];
  const lotsByTicker = new Map<string, Array<{ id: number; shares: number; priceArs: number; dateBought: string }>>();

  for (const lot of existingLots) {
    const ticker = String(lot.ticker).toUpperCase();
    if (!lotsByTicker.has(ticker)) lotsByTicker.set(ticker, []);
    lotsByTicker.get(ticker).push({
      id: Number(lot.id),
      shares: Number(lot.shares),
      priceArs: Number(lot.avg_price_ars),
      dateBought: String(lot.date_bought || ""),
    });
  }

  const sortedEntries = [...entries].sort((a, b) => {
    const dateCompare = String(a.executedAt).localeCompare(String(b.executedAt));
    if (dateCompare !== 0) return dateCompare;
    return a.ticker.localeCompare(b.ticker);
  });

  const ops: any[] = [];

  for (const entry of sortedEntries) {
    const notes = [sourceLabel, entry.notes].filter(Boolean).join(" · ");
    if (entry.type === "BUY") {
      if (!startingClean) {
        ops.push({
          sql: `INSERT INTO portfolio (
            ticker, shares, avg_price_ars, date_bought, notes
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [entry.ticker, entry.shares, entry.priceArs, entry.executedAt, notes],
        });
      }
      ops.push({
        sql: `INSERT INTO transactions (
          ticker, type, shares, price_ars, price_usd, ccl_rate, total_ars, date_executed, notes
        ) VALUES (?, 'BUY', ?, ?, NULL, NULL, ?, ?, ?)`,
        args: [entry.ticker, entry.shares, entry.priceArs, entry.totalArs, entry.executedAt, notes],
      });

      if (!lotsByTicker.has(entry.ticker)) lotsByTicker.set(entry.ticker, []);
      lotsByTicker.get(entry.ticker).push({
        id: 0,
        shares: entry.shares,
        priceArs: entry.priceArs,
        dateBought: entry.executedAt,
      });
      continue;
    }

    const lots = lotsByTicker.get(entry.ticker) || [];
    const availableShares = lots.reduce((sum, lot) => sum + lot.shares, 0);
    if (availableShares < entry.shares) {
      throw new Error(`La venta histórica de ${entry.ticker} por ${entry.shares} excede la posición disponible (${availableShares}).`);
    }

    let remaining = entry.shares;
    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0];
      if (lot.shares <= remaining) {
        if (!startingClean && lot.id > 0) {
          ops.push({ sql: "DELETE FROM portfolio WHERE id = ?", args: [lot.id] });
        }
        remaining -= lot.shares;
        lots.shift();
      } else {
        lot.shares -= remaining;
        if (!startingClean && lot.id > 0) {
          ops.push({
            sql: "UPDATE portfolio SET shares = ?, updated_at = datetime('now') WHERE id = ?",
            args: [lot.shares, lot.id],
          });
        }
        remaining = 0;
      }
    }

    ops.push({
      sql: `INSERT INTO transactions (
        ticker, type, shares, price_ars, price_usd, ccl_rate, total_ars, date_executed, notes
      ) VALUES (?, 'SELL', ?, ?, NULL, NULL, ?, ?, ?)`,
      args: [entry.ticker, entry.shares, entry.priceArs, entry.totalArs, entry.executedAt, notes],
    });
  }

  if (startingClean) {
    for (const [ticker, lots] of lotsByTicker.entries()) {
      for (const lot of lots) {
        if (lot.shares <= 0) continue;
        ops.push({
          sql: `INSERT INTO portfolio (
            ticker, shares, avg_price_ars, date_bought, notes
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [ticker, lot.shares, lot.priceArs, lot.dateBought, sourceLabel],
        });
      }
    }
  }

  if (ops.length > 0) {
    await db.batch(ops, "write");
  }

  return {
    transactionsImported: sortedEntries.length,
  };
}

// ============================================================
// PREDICTIONS / RECOMMENDATIONS LOG
// ============================================================

export async function logPrediction(params: {
  ticker: string;
  action: string;
  confidence?: number;
  targetPriceUsd?: number | null;
  stopLossPct?: number | null;
  targetPct?: number | null;
  horizon?: string | null;
  reasoning?: string | null;
  newsContext?: string | null;
  priceUsd?: number | null;
  priceArs?: number | null;
  ccl?: number | null;
  rsi?: number | null;
  scoreComposite?: number | null;
  scoreTechnical?: number | null;
  scoreFundamental?: number | null;
  scoreSentiment?: number | null;
  pe?: number | null;
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
      params.ticker, params.action, params.confidence ?? null, params.targetPriceUsd ?? null, params.stopLossPct ?? null, params.targetPct ?? null,
      params.horizon ?? null, params.reasoning ?? null, params.newsContext ?? null,
      params.priceUsd ?? null, params.priceArs ?? null, params.ccl ?? null,
      params.rsi ?? null, params.scoreComposite ?? null, params.scoreTechnical ?? null, params.scoreFundamental ?? null, params.scoreSentiment ?? null, params.pe ?? null,
    ] as DbScalar[],
  });
}

export async function getPredictions(ticker: string | null = null, onlyUnevaluated = false, limit = 100) {
  let query = "SELECT * FROM predictions WHERE 1=1";
  const args: (string | number)[] = [];
  if (ticker) { query += " AND ticker = ?"; args.push(ticker); }
  if (onlyUnevaluated) { query += " AND evaluated = 0"; }
  query += " ORDER BY prediction_date DESC LIMIT ?";
  args.push(limit);
  return (await db.execute({ sql: query, args })).rows;
}

export async function getPredictionById(id: number) {
  return (await db.execute({ sql: "SELECT * FROM predictions WHERE id = ?", args: [id] })).rows[0] || null;
}

export async function evaluatePrediction(id: number, currentPriceUsd: number | null, notes = "", currentPriceArs: number | null = null) {
  const prediction = (await db.execute({
    sql: "SELECT * FROM predictions WHERE id = ?",
    args: [id],
  })).rows[0] as any;
  if (!prediction) throw new Error(`Prediction ${id} not found`);

  const baseArs = prediction.price_ars_at_prediction > 0 ? prediction.price_ars_at_prediction : null;
  const baseUsd = prediction.price_usd_at_prediction > 0
    ? prediction.price_usd_at_prediction
    : (prediction.price_ars_at_prediction > 0 && prediction.ccl_at_prediction > 0)
      ? prediction.price_ars_at_prediction / prediction.ccl_at_prediction
      : null;

  let actualChange: number | null = null;
  if (baseArs && currentPriceArs) {
    actualChange = ((currentPriceArs - baseArs) / baseArs) * 100;
  } else if (baseUsd && currentPriceUsd) {
    actualChange = ((currentPriceUsd - baseUsd) / baseUsd) * 100;
  }

  let correct = 0;
  if (actualChange === null) {
    correct = -1;
  } else if (prediction.action === "COMPRAR" && actualChange > 0) correct = 1;
  else if ((prediction.action === "VENDER" || prediction.action === "REDUCIR") && actualChange < 0) correct = 1;
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
    args: [currentPriceUsd, actualChange != null ? Math.round(actualChange * 100) / 100 : null, correct, notes, id],
  });

  return { id, actualChange: actualChange != null ? Math.round(actualChange * 100) / 100 : null, correct, prediction };
}

function findPriceOnDate(history: { date: string; close: number }[] | null, targetDate: string): number | null {
  if (!history || history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  let best: { date: string; close: number } | null = null;
  for (const point of sorted) {
    if (point.date <= targetDate) best = point;
    else break;
  }
  return best?.close ?? null;
}

export async function evaluatePredictionsForTicker(
  ticker: string,
  currentPriceUsd: number | null,
  currentPriceArs: number | null = null,
  priceHistory: { date: string; close: number }[] | null = null
) {
  const pending = (await db.execute({
    sql: "SELECT * FROM predictions WHERE ticker = ? AND evaluated = 0",
    args: [ticker],
  })).rows as any[];

  const results = [];
  for (const pred of pending) {
    const daysSince = Math.floor(
      (Date.now() - new Date(pred.prediction_date).getTime()) / 86400000
    );
    const h = pred.horizon || "";
    const minDays = h.toLowerCase().includes("inmediato") ? 3
      : h.toLowerCase().includes("corto") ? 7
      : h.toLowerCase().includes("largo") ? 60
      : 21;

    if (daysSince >= minDays) {
      // Calcular fecha objetivo según horizon
      const predDate = new Date(pred.prediction_date);
      const targetDate = new Date(predDate);
      targetDate.setDate(targetDate.getDate() + minDays);
      const targetDateStr = targetDate.toISOString().slice(0, 10);

      // Buscar precio en historial para la fecha de horizon
      const historicPriceUsd = priceHistory ? findPriceOnDate(priceHistory, targetDateStr) : null;
      const historicPriceArs = null; // BYMA history no se pasa aún; se puede extender después

      const evalPriceUsd = historicPriceUsd ?? currentPriceUsd;
      const evalPriceArs = historicPriceArs ?? currentPriceArs;

      const note = historicPriceUsd
        ? `Evaluado a ${minDays}d (precio historico ${targetDateStr}: $${historicPriceUsd})`
        : `Evaluado a ${minDays}d (precio actual fallback)`;

      results.push(await evaluatePrediction(pred.id, evalPriceUsd, note, evalPriceArs));
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
}: {
  capitalArs?: number;
  portfolioValueArs?: number;
  cclRate?: number;
  marketSummary?: string;
  strategyMonthly?: string;
  risks?: string[];
  fullResponse?: any;
}) {
  return await db.execute({
    sql: `INSERT INTO analysis_sessions (
      capital_ars, portfolio_value_ars, ccl_rate, market_summary,
      strategy_monthly, risks, full_response
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      capitalArs ?? null, portfolioValueArs ?? null, cclRate ?? null, marketSummary ?? null,
      strategyMonthly ?? null, JSON.stringify(risks ?? null), JSON.stringify(fullResponse ?? null),
    ] as DbScalar[],
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
  })).rows[0] as any;

  const bestPick = (await db.execute({
    sql: `SELECT ticker, actual_change_pct FROM predictions
    WHERE evaluated = 1 AND prediction_date >= ? AND action = 'COMPRAR'
    ORDER BY actual_change_pct DESC LIMIT 1`,
    args: [cutoff],
  })).rows[0] as any;

  const worstPick = (await db.execute({
    sql: `SELECT ticker, actual_change_pct FROM predictions
    WHERE evaluated = 1 AND prediction_date >= ? AND action = 'COMPRAR'
    ORDER BY actual_change_pct ASC LIMIT 1`,
    args: [cutoff],
  })).rows[0] as any;

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
// USD COST BASIS
// ============================================================

export async function getUsdCostBasisByTicker() {
  const rows = (await db.execute(`
    SELECT
      ticker,
      SUM(CASE WHEN type = 'BUY'
            THEN shares * COALESCE(price_usd, CASE WHEN ccl_rate > 0 THEN price_ars / ccl_rate ELSE NULL END)
            ELSE 0 END) -
      SUM(CASE WHEN type = 'SELL'
            THEN shares * COALESCE(price_usd, CASE WHEN ccl_rate > 0 THEN price_ars / ccl_rate ELSE NULL END)
            ELSE 0 END) AS usd_cost
    FROM transactions
    GROUP BY ticker
  `)).rows;

  const result: Record<string, number> = {};
  for (const r of rows) {
    const row = r as any;
    if (row.usd_cost != null && row.usd_cost > 0) {
      result[String(row.ticker).toUpperCase()] = Math.round(row.usd_cost * 100) / 100;
    }
  }
  return result;
}

// ============================================================
// CAPITAL HISTORY
// ============================================================

export async function logCapital(capitalArs: number, portfolioValueArs: number, cclRate: number | null, monthlyDeposit = 1000000) {
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
// AI USAGE / COST TRACKING
// ============================================================

export async function logAiUsage({
  route,
  model,
  inputTokens = 0,
  outputTokens = 0,
  totalTokens = 0,
  estimatedCostUsd = 0,
  latencyMs = null,
  success = true,
  errorMessage = null,
}: {
  route: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  latencyMs?: number | null;
  success?: boolean;
  errorMessage?: string | null;
}) {
  return await db.execute({
    sql: `INSERT INTO ai_usage_logs (
      route, model, input_tokens, output_tokens, total_tokens,
      estimated_cost_usd, latency_ms, success, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      route,
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCostUsd,
      latencyMs,
      success ? 1 : 0,
      errorMessage,
    ],
  });
}

export async function getTodayAiCostUsd() {
  const row = (await db.execute({
    sql: `SELECT COALESCE(SUM(estimated_cost_usd), 0) AS total
          FROM ai_usage_logs
          WHERE date(created_at) = date('now')`,
    args: [],
  })).rows[0] as unknown as { total: number } | undefined;
  return Number(row?.total || 0);
}

export async function getAiUsageSummary(days = 30) {
  const safeDays = Math.max(1, parseInt(String(days), 10) || 30);

  const totals = (await db.execute({
    sql: `SELECT
            COUNT(*) AS calls,
            COALESCE(SUM(input_tokens), 0) AS input_tokens,
            COALESCE(SUM(output_tokens), 0) AS output_tokens,
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd,
            COALESCE(AVG(latency_ms), 0) AS avg_latency_ms,
            COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0) AS success_calls,
            COALESCE(SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END), 0) AS failed_calls
          FROM ai_usage_logs
          WHERE created_at >= datetime('now', '-' || ? || ' days')`,
    args: [safeDays],
  })).rows[0] as any;

  const byRoute = (await db.execute({
    sql: `SELECT
            route,
            COUNT(*) AS calls,
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd,
            COALESCE(AVG(latency_ms), 0) AS avg_latency_ms,
            COALESCE(SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END), 0) AS failed_calls
          FROM ai_usage_logs
          WHERE created_at >= datetime('now', '-' || ? || ' days')
          GROUP BY route
          ORDER BY estimated_cost_usd DESC, calls DESC`,
    args: [safeDays],
  })).rows;

  const recentErrors = (await db.execute({
    sql: `SELECT route, model, error_message, created_at
          FROM ai_usage_logs
          WHERE success = 0
          ORDER BY created_at DESC
          LIMIT 20`,
    args: [],
  })).rows;

  return {
    periodDays: safeDays,
    totals,
    byRoute,
    recentErrors,
  };
}

// ============================================================
// CONTEXT BUILDER FOR AI
// ============================================================

export async function buildAIContext() {
  const portfolio = await getPortfolioSummary();
  const recentTx = await getTransactions(null, 10);
  const performance = await calculateBotPerformance(60);
  const pastPredictions = await getPredictionHistory(20);
  const capitalHist = await getCapitalHistory(5);

  let context = "";

  if (portfolio.length > 0) {
    context += "\n== PORTFOLIO ACTUAL DEL INVERSOR ==\n";
    for (const p of portfolio) {
      context += `- ${sanitizePromptString((p as any).ticker, 20)}: ${(p as any).total_shares} CEDEARs, precio promedio $${(p as any).weighted_avg_price} ARS, desde ${(p as any).first_bought}\n`;
    }
  } else {
    context += "\n== El inversor NO tiene portfolio armado aún ==\n";
  }

  if (recentTx.length > 0) {
    context += "\n== ÚLTIMAS OPERACIONES ==\n";
    for (const tx of recentTx.slice(0, 5)) {
      context += `- ${(tx as any).date_executed}: ${sanitizePromptString((tx as any).type, 10)} ${(tx as any).shares} ${sanitizePromptString((tx as any).ticker, 20)} a $${(tx as any).price_ars} ARS (total: $${(tx as any).total_ars})\n`;
    }
  }

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

  if (pastPredictions.length > 0) {
    context += "\n== HISTORIAL DE PREDICCIONES EVALUADAS (para que aprendas de tus errores) ==\n";
    for (const pred of pastPredictions.slice(0, 10)) {
      const p = pred as any;
      const result = p.prediction_correct === 1 ? "ACERTASTE ✓" : p.prediction_correct === 0 ? "FALLASTE ✗" : "N/A";
      context += `- ${p.prediction_date.slice(0, 10)}: ${sanitizePromptString(p.action, 10)} ${sanitizePromptString(p.ticker, 20)} (confianza ${p.confidence}%) → Cambio real: ${p.actual_change_pct}% [${result}]\n`;
      if (p.prediction_correct === 0) {
        context += `  Razón original: "${sanitizePromptString(p.reasoning, 100)}..."\n`;
      }
    }
  }

  if (capitalHist.length > 0) {
    context += "\n== EVOLUCIÓN DEL CAPITAL ==\n";
    for (const c of capitalHist) {
      const row = c as any;
      context += `- ${row.date}: Disponible $${row.capital_available_ars?.toLocaleString()} + Portfolio $${row.portfolio_value_ars?.toLocaleString()} = Total $${row.total_value_ars?.toLocaleString()}\n`;
    }
  }

  return context;
}

// ============================================================
// POST-MORTEM OPERATIONS
// ============================================================

export async function savePostMortem(data: {
  monthLabel: string;
  totalPredictions: number;
  correctPredictions: number;
  accuracyPct: number;
  totalReturnPct: number;
  spyReturnPct?: number | null;
  beatSpy: boolean;
  bestPick?: string | null;
  bestPickReturn?: number | null;
  worstPick?: string | null;
  worstPickReturn?: number | null;
  lessonsLearned?: string | null;
  selfImposedRules?: string | null;
  patternsDetected?: string | null;
  confidenceInStrategy?: number | null;
  rawAiResponse?: string | null;
}) {
  return await db.execute({
    sql: `INSERT INTO monthly_postmortems (
      month_label, total_predictions, correct_predictions, accuracy_pct,
      total_return_pct, spy_return_pct, beat_spy,
      best_pick, best_pick_return, worst_pick, worst_pick_return,
      lessons_learned, self_imposed_rules, patterns_detected,
      confidence_in_strategy, raw_ai_response
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      data.monthLabel, data.totalPredictions, data.correctPredictions, data.accuracyPct,
      data.totalReturnPct, data.spyReturnPct ?? null, data.beatSpy ? 1 : 0,
      data.bestPick ?? null, data.bestPickReturn ?? null, data.worstPick ?? null, data.worstPickReturn ?? null,
      data.lessonsLearned ?? null, data.selfImposedRules ?? null, data.patternsDetected ?? null,
      data.confidenceInStrategy ?? null, data.rawAiResponse ?? null,
    ],
  });
}

export async function getPostMortems(limit = 12) {
  return (await db.execute({
    sql: "SELECT * FROM monthly_postmortems ORDER BY analysis_date DESC LIMIT ?",
    args: [limit],
  })).rows;
}

export async function getLatestLessons() {
  return (await db.execute({
    sql: "SELECT lessons_learned, self_imposed_rules, patterns_detected, confidence_in_strategy, month_label FROM monthly_postmortems ORDER BY analysis_date DESC LIMIT 3",
    args: [],
  })).rows;
}

// ============================================================
// RATE LIMITING
// ============================================================

export async function checkAndIncrementRateLimit(ip: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  const windowStart = now - (now % windowMs);

  const upsert = await db.execute({
    sql: `INSERT INTO rate_limit_entries (ip, window_start_ms, count)
          VALUES (?, ?, 1)
          ON CONFLICT(ip) DO UPDATE SET
            count = CASE
              WHEN window_start_ms >= ? THEN count + 1
              ELSE 1
            END,
            window_start_ms = CASE
              WHEN window_start_ms >= ? THEN window_start_ms
              ELSE ?
            END
          RETURNING count, window_start_ms`,
    args: [ip, windowStart, windowStart, windowStart, windowStart],
  });

  const row = upsert.rows[0] as unknown as { count: number; window_start_ms: number } | undefined;
  const count = Number(row?.count ?? 1);
  const effectiveWindowStart = Number(row?.window_start_ms ?? windowStart);
  return {
    allowed: count <= maxRequests,
    count,
    resetAt: effectiveWindowStart + windowMs,
  };
}

export async function cleanExpiredRateLimits(windowMs = 60 * 60 * 1000) {
  const cutoff = Date.now() - windowMs * 2;
  await db.execute({
    sql: "DELETE FROM rate_limit_entries WHERE window_start_ms < ?",
    args: [cutoff],
  });
}

// ============================================================
// DECISION AUDIT LOG
// ============================================================

export async function logDecisionAudit({
  route = "/api/ai/analyze",
  profile = null,
  capitalArs = null,
  tickersConsidered = [],
  rawOutput = null,
  normalizedOutput = null,
  consistencyNotes = [],
  schemaErrors = [],
  retryAttempted = false,
}: {
  route?: string;
  profile?: string | null;
  capitalArs?: number | null;
  tickersConsidered?: string[];
  rawOutput?: unknown;
  normalizedOutput?: unknown;
  consistencyNotes?: string[];
  schemaErrors?: string[];
  retryAttempted?: boolean;
}) {
  return await db.execute({
    sql: `INSERT INTO decision_audit_logs (
      route, profile, capital_ars, tickers_considered,
      raw_output, normalized_output, consistency_notes, schema_errors, retry_attempted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      route,
      profile,
      capitalArs,
      JSON.stringify(tickersConsidered),
      rawOutput ? JSON.stringify(rawOutput) : null,
      normalizedOutput ? JSON.stringify(normalizedOutput) : null,
      consistencyNotes.length ? JSON.stringify(consistencyNotes) : null,
      schemaErrors.length ? JSON.stringify(schemaErrors) : null,
      retryAttempted ? 1 : 0,
    ],
  });
}

export async function getDecisionAuditLog(limit = 20) {
  return (await db.execute({
    sql: `SELECT id, route, profile, capital_ars, tickers_considered,
                 consistency_notes, schema_errors, retry_attempted, created_at
          FROM decision_audit_logs
          ORDER BY created_at DESC LIMIT ?`,
    args: [limit],
  })).rows;
}

// ============================================================
// VIRTUAL PORTFOLIO (paper trading)
// ============================================================

export async function getVirtualPortfolio() {
  return (await db.execute("SELECT * FROM virtual_portfolio ORDER BY ticker")).rows;
}

export async function getVirtualPortfolioSummary() {
  return (await db.execute(`
    SELECT ticker, SUM(shares) as total_shares,
           ROUND(SUM(shares * avg_price_ars) / SUM(shares), 2) as weighted_avg_price
    FROM virtual_portfolio
    GROUP BY ticker
    ORDER BY ticker
  `)).rows;
}

export async function resetVirtualPortfolio(positions: { ticker: string; shares: number; avg_price_ars: number; notes?: string }[]) {
  await db.execute("DELETE FROM virtual_portfolio");
  for (const p of positions) {
    await db.execute({
      sql: "INSERT INTO virtual_portfolio (ticker, shares, avg_price_ars, notes) VALUES (?, ?, ?, ?)",
      args: [p.ticker.toUpperCase(), p.shares, p.avg_price_ars, p.notes || ""],
    });
  }
  return positions.length;
}

export async function addVirtualPosition(ticker: string, shares: number, avgPriceArs: number, notes = "") {
  return await db.execute({
    sql: "INSERT INTO virtual_portfolio (ticker, shares, avg_price_ars, notes) VALUES (?, ?, ?, ?)",
    args: [ticker.toUpperCase(), shares, avgPriceArs, notes],
  });
}

export async function removeVirtualPosition(ticker: string) {
  return await db.execute({ sql: "DELETE FROM virtual_portfolio WHERE ticker = ?", args: [ticker.toUpperCase()] });
}

export async function logVirtualTransaction(data: {
  ticker: string;
  type: "BUY" | "SELL" | "DIVIDEND" | "SPLIT";
  shares: number;
  requestedShares?: number;
  executedShares?: number;
  requestedPriceArs?: number;
  executedPriceArs?: number;
  slippagePct?: number;
  delayMinutes?: number;
  partialFill?: boolean;
  brokerCostsArs?: number;
  totalCostArs?: number;
  notes?: string;
}) {
  return await db.execute({
    sql: `INSERT INTO virtual_transactions
      (ticker, type, shares, requested_shares, executed_shares, requested_price_ars, executed_price_ars, slippage_pct, delay_minutes, partial_fill, broker_costs_ars, total_cost_ars, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      data.ticker.toUpperCase(), data.type, data.shares,
      data.requestedShares ?? null, data.executedShares ?? null,
      data.requestedPriceArs ?? null, data.executedPriceArs ?? null,
      data.slippagePct ?? null, data.delayMinutes ?? null,
      data.partialFill ? 1 : 0, data.brokerCostsArs ?? 0, data.totalCostArs ?? 0, data.notes || "",
    ],
  });
}

export async function getVirtualTransactions(ticker?: string, limit = 100) {
  if (ticker) {
    return (await db.execute({
      sql: "SELECT * FROM virtual_transactions WHERE ticker = ? ORDER BY created_at DESC LIMIT ?",
      args: [ticker.toUpperCase(), limit],
    })).rows;
  }
  return (await db.execute({
    sql: "SELECT * FROM virtual_transactions ORDER BY created_at DESC LIMIT ?",
    args: [limit],
  })).rows;
}

// ============================================================
// CORPORATE ACTIONS
// ============================================================

export async function saveCorporateAction(data: {
  ticker: string;
  actionDate: string;
  type: "DIVIDEND" | "SPLIT" | "RATIO_CHANGE";
  amount?: number;
  ratioFrom?: number;
  ratioTo?: number;
  description?: string;
  source?: string;
}) {
  return await db.execute({
    sql: `INSERT INTO corporate_actions (ticker, action_date, type, amount, ratio_from, ratio_to, description, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      data.ticker.toUpperCase(), data.actionDate, data.type,
      data.amount ?? null, data.ratioFrom ?? null, data.ratioTo ?? null,
      data.description || "", data.source || "",
    ],
  });
}

export async function getCorporateActions(ticker?: string, limit = 50) {
  if (ticker) {
    return (await db.execute({
      sql: "SELECT * FROM corporate_actions WHERE ticker = ? ORDER BY action_date DESC LIMIT ?",
      args: [ticker.toUpperCase(), limit],
    })).rows;
  }
  return (await db.execute({
    sql: "SELECT * FROM corporate_actions ORDER BY action_date DESC LIMIT ?",
    args: [limit],
  })).rows;
}

export async function getPendingDividendsForPortfolio(tickers: string[]) {
  if (tickers.length === 0) return [];
  const placeholders = tickers.map(() => "?").join(",");
  return (await db.execute({
    sql: `SELECT * FROM corporate_actions WHERE type = 'DIVIDEND' AND ticker IN (${placeholders}) AND action_date >= date('now', '-90 days') ORDER BY action_date DESC`,
    args: tickers,
  })).rows;
}

// ============================================================
// ADHERENCE LOG (tracking execution of AI recommendations)
// ============================================================

export async function logAdherenceEntries(sessionId: number, plan: any[]) {
  const ops: any[] = [];
  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    ops.push({
      sql: `INSERT INTO adherence_log (session_id, plan_step, tipo, ticker, cantidad_plan, monto_plan, estado)
            VALUES (?, ?, ?, ?, ?, ?, 'pendiente')`,
      args: [sessionId, i + 1, step.tipo || "COMPRAR", (step.ticker || "").toUpperCase(), step.cantidad_cedears || 0, step.monto_estimado_ars || 0],
    });
  }
  if (ops.length > 0) await db.batch(ops, "write");
  return ops.length;
}

export async function getAdherenceBySession(sessionId: number) {
  return (await db.execute({
    sql: "SELECT * FROM adherence_log WHERE session_id = ? ORDER BY plan_step",
    args: [sessionId],
  })).rows;
}

export async function updateAdherenceExecution(sessionId: number, ticker: string, executedShares: number, executedAmount: number) {
  const rows = (await db.execute({
    sql: "SELECT * FROM adherence_log WHERE session_id = ? AND ticker = ? AND estado = 'pendiente' ORDER BY plan_step LIMIT 1",
    args: [sessionId, ticker.toUpperCase()],
  })).rows;
  if (rows.length === 0) return null;
  const row = rows[0] as any;
  const planQty = row.cantidad_plan || 1;
  const planAmt = row.monto_plan || 1;
  const discrepancyPct = Math.round((Math.abs(executedShares - planQty) / planQty) * 10000) / 100;
  const state = discrepancyPct <= 5 ? "ejecutado" : discrepancyPct <= 20 ? "parcial" : "desviado";
  await db.execute({
    sql: `UPDATE adherence_log SET cantidad_ejecutada = ?, monto_ejecutado = ?, estado = ?, discrepancy_pct = ? WHERE id = ?`,
    args: [executedShares, executedAmount, state, discrepancyPct, row.id],
  });
  return { state, discrepancyPct };
}

export async function autoUpdateAdherenceFromTransaction(ticker: string, executedShares: number, executedAmount: number) {
  const rows = (await db.execute({
    sql: `SELECT * FROM adherence_log
          WHERE ticker = ? AND estado = 'pendiente'
          ORDER BY created_at DESC, session_id DESC, plan_step ASC
          LIMIT 1`,
    args: [ticker.toUpperCase()],
  })).rows;
  if (rows.length === 0) return null;

  const row = rows[0] as any;
  const planQty = Math.max(1, Number(row.cantidad_plan || 1));
  const discrepancyPct = Math.round((Math.abs(executedShares - planQty) / planQty) * 10000) / 100;
  const state = discrepancyPct <= 5 ? "ejecutado" : discrepancyPct <= 20 ? "parcial" : "desviado";

  await db.execute({
    sql: `UPDATE adherence_log
          SET cantidad_ejecutada = ?, monto_ejecutado = ?, estado = ?, discrepancy_pct = ?
          WHERE id = ?`,
    args: [executedShares, executedAmount, state, discrepancyPct, row.id],
  });

  return {
    sessionId: row.session_id,
    state,
    discrepancyPct,
  };
}

export async function markAdherenceSessionPaperOnly(sessionId: number) {
  await db.execute({
    sql: `UPDATE adherence_log
          SET estado = 'paper_only'
          WHERE session_id = ? AND estado = 'pendiente'`,
    args: [sessionId],
  });
  return true;
}

export async function getAdherenceStats(days = 90) {
  const rows = (await db.execute({
    sql: `SELECT
            COUNT(*) as total_all,
            SUM(CASE WHEN estado != 'paper_only' THEN 1 ELSE 0 END) as total,
            SUM(CASE WHEN estado = 'ejecutado' THEN 1 ELSE 0 END) as ejecutados,
            SUM(CASE WHEN estado = 'parcial' THEN 1 ELSE 0 END) as parciales,
            SUM(CASE WHEN estado = 'desviado' THEN 1 ELSE 0 END) as desviados,
            SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) as pendientes,
            SUM(CASE WHEN estado = 'paper_only' THEN 1 ELSE 0 END) as paper_only,
            AVG(CASE WHEN estado IN ('ejecutado', 'parcial', 'desviado') THEN discrepancy_pct END) as avg_discrepancy
          FROM adherence_log
          WHERE created_at >= datetime('now', '-' || ? || ' days')`,
    args: [days],
  })).rows[0] as any;
  const totalTracked = Number(rows.total || 0);
  const executed = Number(rows.ejecutados || 0);
  const partial = Number(rows.parciales || 0);
  const deviated = Number(rows.desviados || 0);
  const pending = Number(rows.pendientes || 0);
  const paperOnly = Number(rows.paper_only || 0);
  const resolved = executed + partial + deviated;
  const resolutionPct = totalTracked > 0 ? Math.round((resolved / totalTracked) * 10000) / 100 : 0;
  const executionPct = totalTracked > 0 ? Math.round((executed / totalTracked) * 10000) / 100 : 0;
  const effectiveExecutionPct = totalTracked > 0 ? Math.round(((executed + partial) / totalTracked) * 10000) / 100 : 0;
  const avgDiscrepancyPct = Math.round((rows.avg_discrepancy || 0) * 100) / 100;
  return {
    total: totalTracked,
    ejecutados: executed,
    parciales: partial,
    desviados: deviated,
    pendientes: pending,
    paperOnly,
    resolved,
    resolutionPct,
    executionPct,
    effectiveExecutionPct,
    totalAll: Number(rows.total_all || totalTracked + paperOnly),
    avgDiscrepancyPct,
    totalRecommendations: totalTracked,
    executed,
    partial,
    deviated,
    pending,
    avgDiscrepancyPercentage: avgDiscrepancyPct,
  };
}

// ============================================================
// ML TRAINING DATA
// ============================================================

export async function saveMLTrainingRow(row: Record<string, unknown>) {
  const cols = Object.keys(row).join(", ");
  const placeholders = Object.keys(row).map(() => "?").join(", ");
  return await db.execute({
    sql: `INSERT INTO ml_training_data (${cols}) VALUES (${placeholders})`,
    args: Object.values(row) as DbScalar[],
  });
}

export async function getMLTrainingData(ticker: string | null = null, limit = 1000) {
  if (ticker) {
    return (await db.execute({
      sql: "SELECT * FROM ml_training_data WHERE ticker = ? ORDER BY date DESC LIMIT ?",
      args: [ticker, limit],
    })).rows;
  }
  return (await db.execute({
    sql: "SELECT * FROM ml_training_data ORDER BY date DESC LIMIT ?",
    args: [limit],
  })).rows;
}

export async function getMLDataset(minRows = 50) {
  const rows = (await db.execute({
    sql: `SELECT * FROM ml_training_data
          WHERE label_1m IS NOT NULL OR label_3m IS NOT NULL
          ORDER BY date DESC LIMIT 5000`,
    args: [],
  })).rows;
  return rows.length >= minRows ? rows : [];
}

// ============================================================
// PAPER TRADING CONFIG
// ============================================================

export async function getPaperTradingConfig() {
  const rows = (await db.execute("SELECT auto_sync_enabled FROM paper_trading_config WHERE id = 1")).rows;
  return rows.length > 0 ? { autoSyncEnabled: Boolean((rows[0] as any).auto_sync_enabled) } : { autoSyncEnabled: false };
}

export async function setPaperTradingConfig(autoSyncEnabled: boolean) {
  await db.execute({
    sql: `INSERT INTO paper_trading_config (id, auto_sync_enabled, updated_at)
          VALUES (1, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET auto_sync_enabled = excluded.auto_sync_enabled, updated_at = excluded.updated_at`,
    args: [autoSyncEnabled ? 1 : 0],
  });
}

// ============================================================
// GOVERNANCE POLICY SETTINGS
// ============================================================

export async function getGovernancePolicySelection(userId: number | null | undefined) {
  const defaults = normalizeGovernanceSelection();
  if (userId == null) {
    return {
      ...defaults,
      reason: null,
      updatedAt: null,
    };
  }

  const row = (await db.execute({
    sql: `SELECT overlay_key, deployment_mode, reason, updated_at
          FROM governance_policy_settings
          WHERE user_id = ?`,
    args: [userId],
  })).rows[0] as any;

  if (!row) {
    return {
      ...defaults,
      reason: null,
      updatedAt: null,
    };
  }

  const normalized = normalizeGovernanceSelection({
    overlayKey: row.overlay_key,
    deploymentMode: row.deployment_mode,
  });
  return {
    ...normalized,
    reason: row.reason || null,
    updatedAt: row.updated_at || null,
  };
}

export async function getGovernancePolicyAuditLog(userId: number, limit = 10) {
  return (await db.execute({
    sql: `SELECT *
          FROM governance_policy_audit_logs
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT ?`,
    args: [userId, limit],
  })).rows;
}

export async function saveGovernancePolicySelection({
  userId,
  overlayKey,
  deploymentMode,
  reason = null,
  impactPreview = null,
}: {
  userId: number;
  overlayKey: string;
  deploymentMode: string;
  reason?: string | null;
  impactPreview?: unknown;
}) {
  const previous = await getGovernancePolicySelection(userId);
  const normalized = normalizeGovernanceSelection({ overlayKey, deploymentMode });

  await db.batch([
    {
      sql: `INSERT INTO governance_policy_settings (user_id, overlay_key, deployment_mode, reason, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
              overlay_key = excluded.overlay_key,
              deployment_mode = excluded.deployment_mode,
              reason = excluded.reason,
              updated_at = excluded.updated_at`,
      args: [userId, normalized.overlayKey, normalized.deploymentMode, reason],
    },
    {
      sql: `INSERT INTO governance_policy_audit_logs (
              user_id, previous_overlay_key, previous_deployment_mode,
              next_overlay_key, next_deployment_mode, reason, impact_preview
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        userId,
        previous.overlayKey || null,
        previous.deploymentMode || null,
        normalized.overlayKey,
        normalized.deploymentMode,
        reason,
        impactPreview ? JSON.stringify(impactPreview) : null,
      ],
    },
  ], "write");

  return getGovernancePolicySelection(userId);
}

// ============================================================
// BROKER IMPORT AUDIT
// ============================================================

function buildBrokerImportInputHash({
  brokerKey,
  sourceType,
  sourceName,
  snapshotDate,
  cclRate,
  rawInput,
}: {
  brokerKey: string;
  sourceType: string;
  sourceName?: string | null;
  snapshotDate?: string | null;
  cclRate?: number | null;
  rawInput?: string | null;
}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    brokerKey,
    sourceType,
    sourceName: sourceName || null,
    snapshotDate: snapshotDate || null,
    cclRate: cclRate ?? null,
    rawInput: rawInput || null,
  })).digest("hex");
}

export async function logBrokerImportAudit({
  userId = null,
  brokerKey,
  sourceType = "csv",
  sourceName = null,
  snapshotDate = null,
  cclRate = null,
  rawInput = null,
  importedPositions = [],
  reconciliation = null,
  applied = false,
  appliedTransactionCount = 0,
}: {
  userId?: number | null;
  brokerKey: string;
  sourceType?: string;
  sourceName?: string | null;
  snapshotDate?: string | null;
  cclRate?: number | null;
  rawInput?: string | null;
  importedPositions?: unknown[];
  reconciliation?: unknown;
  applied?: boolean;
  appliedTransactionCount?: number;
}) {
  const normalizedRawInput = rawInput == null ? null : String(rawInput).slice(0, 100000);
  const inputHash = buildBrokerImportInputHash({
    brokerKey,
    sourceType,
    sourceName,
    snapshotDate,
    cclRate,
    rawInput: normalizedRawInput,
  });

  const result = await db.execute({
    sql: `INSERT INTO broker_import_audit_logs (
            user_id, broker_key, source_type, source_name, snapshot_date, ccl_rate,
            input_hash, raw_input, imported_positions_json, reconciliation_json,
            applied, applied_transaction_count
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id, user_id, broker_key, source_type, source_name, snapshot_date, ccl_rate, input_hash, applied, applied_transaction_count, created_at`,
    args: [
      userId,
      brokerKey,
      sourceType,
      sourceName,
      snapshotDate,
      cclRate,
      inputHash,
      normalizedRawInput,
      JSON.stringify(importedPositions || []),
      reconciliation ? JSON.stringify(reconciliation) : null,
      applied ? 1 : 0,
      Number(appliedTransactionCount || 0),
    ],
  });

  return result.rows[0];
}

export async function getBrokerImportAuditLogs(userId: number | null | undefined, limit = 10) {
  return (await db.execute({
    sql: `SELECT id, user_id, broker_key, source_type, source_name, snapshot_date, ccl_rate,
                 input_hash, applied, applied_transaction_count, created_at
          FROM broker_import_audit_logs
          WHERE (? IS NULL OR user_id = ?)
          ORDER BY created_at DESC, id DESC
          LIMIT ?`,
    args: [userId ?? null, userId ?? null, limit],
  })).rows;
}

// ============================================================
// INTRADAY MONITOR
// ============================================================

function normalizeIntradayMonitorSettingsRow(row: any) {
  return {
    enabled: Boolean(row?.enabled),
    intervalMinutes: Number(row?.interval_minutes || 15),
    marketOpenLocal: row?.market_open_local || "10:30",
    marketCloseLocal: row?.market_close_local || "17:00",
    timezone: row?.timezone || "America/Argentina/Cordoba",
    updatedAt: row?.updated_at || null,
  };
}

function normalizeIntradayMonitorSessionRow(row: any) {
  if (!row) return null;
  return {
    id: Number(row.id),
    startedAt: row.started_at || null,
    stoppedAt: row.stopped_at || null,
    status: row.status || "stopped",
    startedBy: row.started_by || null,
    stopReason: row.stop_reason || null,
    intervalMinutes: Number(row.interval_minutes || 15),
    marketOpenLocal: row.market_open_local || "10:30",
    marketCloseLocal: row.market_close_local || "17:00",
    timezone: row.timezone || "America/Argentina/Cordoba",
  };
}

function normalizeIntradayMonitorSnapshotRow(row: any) {
  if (!row) return null;
  return {
    id: Number(row.id),
    sessionId: row.session_id == null ? null : Number(row.session_id),
    snapshotAt: row.snapshot_at || null,
    marketState: row.market_state || "closed",
    source: row.source || "scheduled",
    cclRate: row.ccl_rate == null ? null : Number(row.ccl_rate),
    vixValue: row.vix_value == null ? null : Number(row.vix_value),
    vixChangePct: row.vix_change_pct == null ? null : Number(row.vix_change_pct),
    vixRegime: row.vix_regime || null,
    spyPriceUsd: row.spy_price_usd == null ? null : Number(row.spy_price_usd),
    spyChangePct: row.spy_change_pct == null ? null : Number(row.spy_change_pct),
    qqqPriceUsd: row.qqq_price_usd == null ? null : Number(row.qqq_price_usd),
    qqqChangePct: row.qqq_change_pct == null ? null : Number(row.qqq_change_pct),
    portfolioValueArs: row.portfolio_value_ars == null ? null : Number(row.portfolio_value_ars),
    capitalAvailableArs: row.capital_available_ars == null ? null : Number(row.capital_available_ars),
    totalValueArs: row.total_value_ars == null ? null : Number(row.total_value_ars),
    trackedTickersCount: Number(row.tracked_tickers_count || 0),
    positionCount: Number(row.position_count || 0),
    eventCount: Number(row.event_count || 0),
    notes: row.notes || null,
    createdAt: row.created_at || null,
  };
}

function normalizeIntradayMonitorTickerSnapshotRow(row: any) {
  return {
    id: Number(row.id),
    snapshotId: Number(row.snapshot_id),
    ticker: row.ticker,
    shares: Number(row.shares || 0),
    avgCostArs: row.avg_cost_ars == null ? null : Number(row.avg_cost_ars),
    priceUsd: row.price_usd == null ? null : Number(row.price_usd),
    priceArs: row.price_ars == null ? null : Number(row.price_ars),
    bymaPriceArs: row.byma_price_ars == null ? null : Number(row.byma_price_ars),
    dayChangePct: row.day_change_pct == null ? null : Number(row.day_change_pct),
    pnlPct: row.pnl_pct == null ? null : Number(row.pnl_pct),
    valueArs: row.value_ars == null ? null : Number(row.value_ars),
    positionWeightPct: row.position_weight_pct == null ? null : Number(row.position_weight_pct),
    activePredictionAction: row.active_prediction_action || null,
    predictionConfidence: row.prediction_confidence == null ? null : Number(row.prediction_confidence),
    stopLossBreach: Boolean(row.stop_loss_breach),
    takeProfitBreach: Boolean(row.take_profit_breach),
    createdAt: row.created_at || null,
  };
}

function normalizeIntradayMonitorEventRow(row: any) {
  return {
    id: Number(row.id),
    sessionId: row.session_id == null ? null : Number(row.session_id),
    snapshotId: row.snapshot_id == null ? null : Number(row.snapshot_id),
    eventKey: row.event_key || null,
    eventType: row.event_type,
    severity: row.severity || "info",
    ticker: row.ticker || null,
    message: row.message || "",
    payload: safeJsonParse(row.payload_json, null),
    createdAt: row.created_at || null,
  };
}

export async function getIntradayMonitorSettings() {
  const row = (await db.execute("SELECT * FROM intraday_monitor_settings WHERE id = 1")).rows[0] as any;
  return normalizeIntradayMonitorSettingsRow(row);
}

export async function updateIntradayMonitorSettings({
  enabled,
  intervalMinutes,
  marketOpenLocal,
  marketCloseLocal,
  timezone,
}: {
  enabled?: boolean;
  intervalMinutes?: number;
  marketOpenLocal?: string;
  marketCloseLocal?: string;
  timezone?: string;
}) {
  const current = await getIntradayMonitorSettings();
  const next = {
    enabled: enabled ?? current.enabled,
    intervalMinutes: Math.max(5, Math.min(60, Math.round(intervalMinutes ?? current.intervalMinutes))),
    marketOpenLocal: marketOpenLocal || current.marketOpenLocal,
    marketCloseLocal: marketCloseLocal || current.marketCloseLocal,
    timezone: timezone || current.timezone,
  };

  const hhmmPattern = /^\d{2}:\d{2}$/;
  if (!hhmmPattern.test(next.marketOpenLocal) || !hhmmPattern.test(next.marketCloseLocal)) {
    throw new Error("La ventana del monitor debe tener formato HH:MM.");
  }
  if (next.marketOpenLocal >= next.marketCloseLocal) {
    throw new Error("La hora de apertura debe ser menor a la de cierre.");
  }

  await db.execute({
    sql: `INSERT INTO intraday_monitor_settings (
            id, enabled, interval_minutes, market_open_local, market_close_local, timezone, updated_at
          ) VALUES (1, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            enabled = excluded.enabled,
            interval_minutes = excluded.interval_minutes,
            market_open_local = excluded.market_open_local,
            market_close_local = excluded.market_close_local,
            timezone = excluded.timezone,
            updated_at = excluded.updated_at`,
    args: [next.enabled ? 1 : 0, next.intervalMinutes, next.marketOpenLocal, next.marketCloseLocal, next.timezone],
  });

  return getIntradayMonitorSettings();
}

export async function closeOpenIntradayMonitorSessions(stopReason = "superseded") {
  await db.execute({
    sql: `UPDATE intraday_monitor_sessions
          SET status = 'stopped',
              stopped_at = COALESCE(stopped_at, datetime('now')),
              stop_reason = COALESCE(stop_reason, ?)
          WHERE status = 'running'`,
    args: [stopReason],
  });
}

export async function createIntradayMonitorSession({
  startedBy = "system",
  intervalMinutes,
  marketOpenLocal,
  marketCloseLocal,
  timezone,
}: {
  startedBy?: string | null;
  intervalMinutes: number;
  marketOpenLocal: string;
  marketCloseLocal: string;
  timezone: string;
}) {
  const result = await db.execute({
    sql: `INSERT INTO intraday_monitor_sessions (
            started_by, interval_minutes, market_open_local, market_close_local, timezone
          ) VALUES (?, ?, ?, ?, ?)`,
    args: [startedBy, intervalMinutes, marketOpenLocal, marketCloseLocal, timezone],
  });
  return getIntradayMonitorSessionById(Number(result.lastInsertRowid));
}

export async function getIntradayMonitorSessionById(sessionId: number) {
  const row = (await db.execute({
    sql: `SELECT * FROM intraday_monitor_sessions WHERE id = ?`,
    args: [sessionId],
  })).rows[0] as any;
  return normalizeIntradayMonitorSessionRow(row);
}

export async function getLatestRunningIntradayMonitorSession() {
  const row = (await db.execute({
    sql: `SELECT * FROM intraday_monitor_sessions WHERE status = 'running' ORDER BY id DESC LIMIT 1`,
    args: [],
  })).rows[0] as any;
  return normalizeIntradayMonitorSessionRow(row);
}

export async function stopIntradayMonitorSession(
  sessionId: number,
  { status = "stopped", stopReason = null }: { status?: "stopped" | "crashed"; stopReason?: string | null } = {}
) {
  await db.execute({
    sql: `UPDATE intraday_monitor_sessions
          SET status = ?, stopped_at = datetime('now'), stop_reason = ?
          WHERE id = ?`,
    args: [status, stopReason, sessionId],
  });
  return getIntradayMonitorSessionById(sessionId);
}

export async function saveIntradayMonitorSnapshot({
  sessionId = null,
  snapshotAt,
  marketState,
  source = "scheduled",
  cclRate = null,
  vixValue = null,
  vixChangePct = null,
  vixRegime = null,
  spyPriceUsd = null,
  spyChangePct = null,
  qqqPriceUsd = null,
  qqqChangePct = null,
  portfolioValueArs = null,
  capitalAvailableArs = null,
  totalValueArs = null,
  trackedTickersCount = 0,
  positionCount = 0,
  notes = null,
  tickerSnapshots = [],
  events = [],
}: {
  sessionId?: number | null;
  snapshotAt: string;
  marketState: string;
  source?: string;
  cclRate?: number | null;
  vixValue?: number | null;
  vixChangePct?: number | null;
  vixRegime?: string | null;
  spyPriceUsd?: number | null;
  spyChangePct?: number | null;
  qqqPriceUsd?: number | null;
  qqqChangePct?: number | null;
  portfolioValueArs?: number | null;
  capitalAvailableArs?: number | null;
  totalValueArs?: number | null;
  trackedTickersCount?: number;
  positionCount?: number;
  notes?: string | null;
  tickerSnapshots?: Record<string, any>[];
  events?: Record<string, any>[];
}) {
  const snapshotResult = await db.execute({
    sql: `INSERT INTO intraday_monitor_snapshots (
            session_id, snapshot_at, market_state, source, ccl_rate,
            vix_value, vix_change_pct, vix_regime,
            spy_price_usd, spy_change_pct, qqq_price_usd, qqq_change_pct,
            portfolio_value_ars, capital_available_ars, total_value_ars,
            tracked_tickers_count, position_count, event_count, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      sessionId, snapshotAt, marketState, source, cclRate,
      vixValue, vixChangePct, vixRegime,
      spyPriceUsd, spyChangePct, qqqPriceUsd, qqqChangePct,
      portfolioValueArs, capitalAvailableArs, totalValueArs,
      trackedTickersCount, positionCount, events.length, notes,
    ] as DbScalar[],
  });

  const snapshotId = Number(snapshotResult.lastInsertRowid);
  const ops: { sql: string; args?: DbScalar[] }[] = [];

  for (const tickerSnapshot of tickerSnapshots.slice(0, 250)) {
    ops.push({
      sql: `INSERT INTO intraday_monitor_ticker_snapshots (
              snapshot_id, ticker, shares, avg_cost_ars, price_usd, price_ars, byma_price_ars,
              day_change_pct, pnl_pct, value_ars, position_weight_pct,
              active_prediction_action, prediction_confidence, stop_loss_breach, take_profit_breach
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        snapshotId,
        tickerSnapshot.ticker,
        tickerSnapshot.shares ?? 0,
        tickerSnapshot.avgCostArs ?? null,
        tickerSnapshot.priceUsd ?? null,
        tickerSnapshot.priceArs ?? null,
        tickerSnapshot.bymaPriceArs ?? null,
        tickerSnapshot.dayChangePct ?? null,
        tickerSnapshot.pnlPct ?? null,
        tickerSnapshot.valueArs ?? null,
        tickerSnapshot.positionWeightPct ?? null,
        tickerSnapshot.activePredictionAction ?? null,
        tickerSnapshot.predictionConfidence ?? null,
        tickerSnapshot.stopLossBreach ? 1 : 0,
        tickerSnapshot.takeProfitBreach ? 1 : 0,
      ] as DbScalar[],
    });
  }

  for (const event of events.slice(0, 80)) {
    ops.push({
      sql: `INSERT OR IGNORE INTO intraday_monitor_events (
              session_id, snapshot_id, event_key, event_type, severity, ticker, message, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        sessionId,
        snapshotId,
        event.eventKey || null,
        event.eventType,
        event.severity || "info",
        event.ticker || null,
        event.message,
        event.payload ? JSON.stringify(event.payload) : null,
      ] as DbScalar[],
    });
  }

  if (ops.length > 0) {
    await db.batch(ops, "write");
  }

  return getIntradayMonitorSnapshotById(snapshotId);
}

export async function getIntradayMonitorSnapshotById(snapshotId: number) {
  const row = (await db.execute({
    sql: `SELECT * FROM intraday_monitor_snapshots WHERE id = ?`,
    args: [snapshotId],
  })).rows[0] as any;
  return normalizeIntradayMonitorSnapshotRow(row);
}

export async function getIntradayMonitorRecentSnapshots(limit = 20) {
  const rows = (await db.execute({
    sql: `SELECT * FROM intraday_monitor_snapshots ORDER BY snapshot_at DESC LIMIT ?`,
    args: [limit],
  })).rows as any[];
  return rows.map(normalizeIntradayMonitorSnapshotRow);
}

export async function getIntradayMonitorTickerSnapshots(snapshotId: number, limit = 25) {
  const rows = (await db.execute({
    sql: `SELECT * FROM intraday_monitor_ticker_snapshots
          WHERE snapshot_id = ?
          ORDER BY value_ars DESC, ticker ASC
          LIMIT ?`,
    args: [snapshotId, limit],
  })).rows as any[];
  return rows.map(normalizeIntradayMonitorTickerSnapshotRow);
}

export async function getIntradayMonitorRecentEvents(limit = 50) {
  const rows = (await db.execute({
    sql: `SELECT * FROM intraday_monitor_events ORDER BY created_at DESC LIMIT ?`,
    args: [limit],
  })).rows as any[];
  return rows.map(normalizeIntradayMonitorEventRow);
}

export async function getIntradayMonitorRecentSessions(limit = 10) {
  const rows = (await db.execute({
    sql: `SELECT * FROM intraday_monitor_sessions ORDER BY started_at DESC LIMIT ?`,
    args: [limit],
  })).rows as any[];
  return rows.map(normalizeIntradayMonitorSessionRow);
}

// ============================================================
// TRACK RECORD
// ============================================================

export async function saveTrackRecord(data: {
  date: string;
  virtualValueArs: number;
  realValueArs: number;
  spyValueArs: number;
  capitalArs: number;
  cclRate: number | null;
  virtualDividendsArs?: number;
  virtualTotalArs?: number;
  alphaVsSpyPct?: number;
  drawdownFromPeakPct?: number;
  dailyReturnPct?: number;
  spyDailyReturnPct?: number;
  rollingSharpe?: number;
}) {
  await db.execute({
    sql: `INSERT INTO track_record (
            date, virtual_value_ars, real_value_ars, spy_value_ars, capital_ars, ccl_rate,
            virtual_dividends_ars, virtual_total_ars, alpha_vs_spy_pct, drawdown_from_peak_pct,
            daily_return_pct, spy_daily_return_pct, rolling_sharpe
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(date) DO UPDATE SET
            virtual_value_ars = excluded.virtual_value_ars,
            real_value_ars = excluded.real_value_ars,
            spy_value_ars = excluded.spy_value_ars,
            capital_ars = excluded.capital_ars,
            ccl_rate = excluded.ccl_rate,
            virtual_dividends_ars = excluded.virtual_dividends_ars,
            virtual_total_ars = excluded.virtual_total_ars,
            alpha_vs_spy_pct = excluded.alpha_vs_spy_pct,
            drawdown_from_peak_pct = excluded.drawdown_from_peak_pct,
            daily_return_pct = excluded.daily_return_pct,
            spy_daily_return_pct = excluded.spy_daily_return_pct,
            rolling_sharpe = excluded.rolling_sharpe`,
    args: [
      data.date, data.virtualValueArs, data.realValueArs, data.spyValueArs,
      data.capitalArs, data.cclRate,
      data.virtualDividendsArs ?? 0, data.virtualTotalArs ?? data.virtualValueArs,
      data.alphaVsSpyPct ?? null, data.drawdownFromPeakPct ?? null,
      data.dailyReturnPct ?? null, data.spyDailyReturnPct ?? null,
      data.rollingSharpe ?? null,
    ],
  });
}

export async function getTrackRecord(days = 365) {
  return (await db.execute({
    sql: `SELECT * FROM track_record WHERE date >= date('now', '-' || ? || ' days') ORDER BY date ASC`,
    args: [days],
  })).rows;
}

export async function getTrackRecordWithMetrics(days = 365) {
  const rows = await getTrackRecord(days);
  if (rows.length < 2) return { rows, metrics: null };

  const values = rows.map((r: any) => ({
    date: r.date,
    virtual: r.virtual_total_ars || r.virtual_value_ars || 0,
    real: r.real_value_ars || 0,
    spy: r.spy_value_ars || 0,
    alpha: r.alpha_vs_spy_pct,
    drawdown: r.drawdown_from_peak_pct,
    sharpe: r.rolling_sharpe,
  }));

  const first = values[0];
  const last = values[values.length - 1];
  const periodsPerYear = inferPeriodsPerYearFromDates(values.map((row) => row.date));

  // Calculate metrics
  const virtualReturn = first.virtual > 0 ? ((last.virtual - first.virtual) / first.virtual) * 100 : 0;
  const spyReturn = first.spy > 0 ? ((last.spy - first.spy) / first.spy) * 100 : 0;
  const alpha = virtualReturn - spyReturn;

  // Max drawdown
  let peak = first.virtual;
  let maxDrawdown = 0;
  for (const v of values) {
    if (v.virtual > peak) peak = v.virtual;
    const dd = peak > 0 ? ((v.virtual - peak) / peak) * 100 : 0;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  // Volatility (std dev of daily returns)
  const dailyReturns = values.slice(1).map((v, i) => {
    const prev = values[i].virtual;
    return prev > 0 ? ((v.virtual - prev) / prev) * 100 : 0;
  }).filter((r) => Number.isFinite(r));

  const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length;
  const volatility = Math.sqrt(variance);

  const normalizedReturns = dailyReturns.map((value) => value / 100);
  const sharpe = calcSharpeRatio(normalizedReturns, 0.45, periodsPerYear);

  // Win rate (days beating SPY)
  const spyDailyReturns = values.slice(1).map((v, i) => {
    const prev = values[i].spy;
    return prev > 0 ? ((v.spy - prev) / prev) * 100 : 0;
  });
  let wins = 0;
  for (let i = 0; i < dailyReturns.length; i++) {
    if (dailyReturns[i] > spyDailyReturns[i]) wins++;
  }
  const winRate = dailyReturns.length > 0 ? (wins / dailyReturns.length) * 100 : 0;

  return {
    rows,
    metrics: {
      days: values.length,
      virtualReturnPct: Math.round(virtualReturn * 100) / 100,
      spyReturnPct: Math.round(spyReturn * 100) / 100,
      alphaPct: Math.round(alpha * 100) / 100,
      maxDrawdownPct: Math.round(maxDrawdown * 100) / 100,
      volatilityAnnualPct: Math.round(volatility * Math.sqrt(periodsPerYear) * 100) / 100,
      sharpeRatio: sharpe != null ? Math.round(sharpe * 100) / 100 : null,
      winRateVsSpyPct: Math.round(winRate * 100) / 100,
      avgDailyReturnPct: Math.round(avgReturn * 100) / 100,
      periodsPerYear,
    },
  };
}

export async function saveMonthlyTrackRecord(data: {
  month: string;
  virtualReturnPct: number;
  realReturnPct: number;
  spyReturnPct: number;
  alphaPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  winRatePct: number;
  tradesCount: number;
  notes?: string;
}) {
  await db.execute({
    sql: `INSERT INTO track_record_monthly (month, virtual_return_pct, real_return_pct, spy_return_pct, alpha_pct, max_drawdown_pct, sharpe_ratio, win_rate_pct, trades_count, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(month) DO UPDATE SET
            virtual_return_pct = excluded.virtual_return_pct,
            real_return_pct = excluded.real_return_pct,
            spy_return_pct = excluded.spy_return_pct,
            alpha_pct = excluded.alpha_pct,
            max_drawdown_pct = excluded.max_drawdown_pct,
            sharpe_ratio = excluded.sharpe_ratio,
            win_rate_pct = excluded.win_rate_pct,
            trades_count = excluded.trades_count,
            notes = excluded.notes`,
    args: [
      data.month, data.virtualReturnPct, data.realReturnPct, data.spyReturnPct,
      data.alphaPct, data.maxDrawdownPct, data.sharpeRatio, data.winRatePct,
      data.tradesCount, data.notes || "",
    ],
  });
}

export async function getMonthlyTrackRecord(months = 12) {
  return (await db.execute({
    sql: `SELECT * FROM track_record_monthly WHERE month >= date('now', '-' || ? || ' months') ORDER BY month ASC`,
    args: [months],
  })).rows;
}

export default db;
