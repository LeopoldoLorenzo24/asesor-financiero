import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import { app } from "../../index.js";
import db, { initDb } from "../../database.js";
import { authHeader, setupTestDb } from "./helpers.js";

await setupTestDb();

async function cleanIntradayMonitorState() {
  await initDb();
  await db.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS intraday_monitor_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER NOT NULL DEFAULT 0,
        interval_minutes INTEGER NOT NULL DEFAULT 15,
        market_open_local TEXT NOT NULL DEFAULT '10:30',
        market_close_local TEXT NOT NULL DEFAULT '17:00',
        timezone TEXT NOT NULL DEFAULT 'America/Argentina/Cordoba',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
    {
      sql: `INSERT OR IGNORE INTO intraday_monitor_settings (id, enabled, interval_minutes, market_open_local, market_close_local, timezone)
            VALUES (1, 0, 15, '10:30', '17:00', 'America/Argentina/Cordoba')`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS intraday_monitor_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        stopped_at TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        started_by TEXT,
        stop_reason TEXT,
        interval_minutes INTEGER NOT NULL,
        market_open_local TEXT NOT NULL,
        market_close_local TEXT NOT NULL,
        timezone TEXT NOT NULL
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS intraday_monitor_snapshots (
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
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS intraday_monitor_ticker_snapshots (
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
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS intraday_monitor_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        snapshot_id INTEGER,
        event_key TEXT UNIQUE,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        ticker TEXT,
        message TEXT NOT NULL,
        payload_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
  ], "write");
  await db.execute("DELETE FROM intraday_monitor_events");
  await db.execute("DELETE FROM intraday_monitor_ticker_snapshots");
  await db.execute("DELETE FROM intraday_monitor_snapshots");
  await db.execute("DELETE FROM intraday_monitor_sessions");
  await db.execute("UPDATE intraday_monitor_settings SET enabled = 0, interval_minutes = 15, market_open_local = '10:30', market_close_local = '17:00', timezone = 'America/Argentina/Cordoba', updated_at = datetime('now') WHERE id = 1");
}

test("GET /api/system/monitor/status devuelve configuración y runtime del monitor", async () => {
  await cleanIntradayMonitorState();

  const res = await request(app)
    .get("/api/system/monitor/status")
    .set(await authHeader());

  assert.equal(res.status, 200);
  assert.equal(res.body.settings.enabled, false);
  assert.equal(res.body.settings.intervalMinutes, 15);
  assert.equal(res.body.runtime.running, false);
  assert.ok(Array.isArray(res.body.recentSnapshots));
  assert.ok(Array.isArray(res.body.recentEvents));
});

test("POST /api/system/monitor/settings actualiza ventana e intervalo", async () => {
  await cleanIntradayMonitorState();

  const res = await request(app)
    .post("/api/system/monitor/settings")
    .set(await authHeader())
    .send({
      intervalMinutes: 20,
      marketOpenLocal: "10:45",
      marketCloseLocal: "16:55",
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.settings.intervalMinutes, 20);
  assert.equal(res.body.settings.marketOpenLocal, "10:45");
  assert.equal(res.body.settings.marketCloseLocal, "16:55");
  assert.equal(res.body.status.settings.intervalMinutes, 20);
});

test("POST /api/system/monitor/start y /stop cambian el estado del runtime sin ejecutar red", async () => {
  await cleanIntradayMonitorState();

  const startRes = await request(app)
    .post("/api/system/monitor/start")
    .set(await authHeader())
    .send({ runImmediately: false });

  assert.equal(startRes.status, 200);
  assert.equal(startRes.body.success, true);
  assert.equal(startRes.body.settings.enabled, true);
  assert.equal(startRes.body.runtime.running, true);
  assert.ok(startRes.body.runtime.sessionId);

  const stopRes = await request(app)
    .post("/api/system/monitor/stop")
    .set(await authHeader())
    .send({ reason: "test_stop", disable: true });

  assert.equal(stopRes.status, 200);
  assert.equal(stopRes.body.success, true);
  assert.equal(stopRes.body.settings.enabled, false);
  assert.equal(stopRes.body.runtime.running, false);

  const sessionRows = (await db.execute({
    sql: "SELECT status, stop_reason FROM intraday_monitor_sessions ORDER BY id DESC LIMIT 1",
  })).rows;

  assert.equal(sessionRows.length, 1);
  assert.equal(sessionRows[0].status, "stopped");
  assert.equal(sessionRows[0].stop_reason, "test_stop");
});
