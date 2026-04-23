import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_URL || `file:${path.join(__dirname, "..", "data", "cedear-advisor.db")}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const q = async (sql) => (await db.execute(sql)).rows;

const tables = (await q("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map(r => r.name);
console.log("Tablas en la BD:", tables.join(", "), "\n");

const [sessions, predictions, transactions, capital] = await Promise.all([
  q("SELECT COUNT(*) as n, MIN(session_date) as first, MAX(session_date) as last FROM analysis_sessions"),
  q("SELECT COUNT(*) as total, SUM(CASE WHEN evaluated=1 THEN 1 ELSE 0 END) as evaluated, SUM(CASE WHEN prediction_correct=1 THEN 1 ELSE 0 END) as correct FROM predictions"),
  q("SELECT COUNT(*) as n, MIN(date_executed) as first, MAX(date_executed) as last FROM transactions"),
  tables.includes("capital_history") ? q("SELECT COUNT(*) as n FROM capital_history") : Promise.resolve([{n:0}]),
]);
const postmortems = tables.includes("post_mortems") ? await q("SELECT COUNT(*) as n FROM post_mortems") : [{n:0}];

console.log("=== ESTADO DE LA BD ===\n");
console.log("Sesiones de análisis:", sessions[0].n, `(${sessions[0].first?.slice(0,10)} → ${sessions[0].last?.slice(0,10)})`);
console.log("Predicciones totales:", predictions[0].total, "| Evaluadas:", predictions[0].evaluated, "| Correctas:", predictions[0].correct);
console.log("Transacciones:", transactions[0].n, `(${transactions[0].first?.slice(0,10)} → ${transactions[0].last?.slice(0,10)})`);
console.log("Historial de capital:", capital[0].n, "registros", `(${capital[0].first?.slice(0,10)} → ${capital[0].last?.slice(0,10)})`);
console.log("Post-mortems:", postmortems[0].n);

// Predictions schema + detail
const predCols = (await q("PRAGMA table_info(predictions)")).map(c => c.name);
console.log("\nColumnas predictions:", predCols.join(", "));
if (predictions[0].total > 0) {
  const preds = await q("SELECT * FROM predictions ORDER BY rowid DESC LIMIT 10");
  console.log("\n--- Últimas 10 predicciones ---");
  for (const p of preds) console.log(" ", JSON.stringify(p));
}

// Sessions detail
if (sessions[0].n > 0) {
  const sess = await q("SELECT session_date, capital_ars, ccl_rate, market_summary FROM analysis_sessions ORDER BY session_date DESC LIMIT 5");
  console.log("\n--- Últimas sesiones ---");
  for (const s of sess) {
    console.log(`  ${s.session_date?.slice(0,10)} | Capital: $${s.capital_ars?.toLocaleString()} ARS | CCL: $${s.ccl_rate}`);
    if (s.market_summary) console.log(`    "${s.market_summary?.slice(0,80)}..."`);
  }
}
