// ============================================================
// BACKFILL DE PREDICCIONES
// Evalúa predicciones pendientes comparando precio CEDEAR (ARS) vs precio CEDEAR actual.
// Ejecutar con: node server/scripts/backfill-predictions.js
// ============================================================

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import { createClient } from "@libsql/client";
import YahooFinance from "yahoo-finance2";

const db = createClient({
  url: process.env.TURSO_URL || `file:${path.join(__dirname, "..", "data", "cedear-advisor.db")}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function minDaysForHorizon(horizon = "") {
  if (!horizon || horizon.toLowerCase().includes("inmediato")) return 3;
  if (horizon.toLowerCase().includes("corto")) return 7;
  if (horizon.toLowerCase().includes("largo")) return 60;
  return 21;
}

async function fetchPriceBa(ticker) {
  // Precio en ARS del CEDEAR en BYMA (la comparación correcta para el inversor)
  try {
    const q = await yahoo.quote(`${ticker}.BA`);
    return q.regularMarketPrice ?? null;
  } catch { return null; }
}

async function fetchPriceUsd(ticker) {
  // Precio del subyacente en NYSE/NASDAQ (para guardar en price_usd_at_evaluation)
  try {
    const q = await yahoo.quote(ticker);
    return q.regularMarketPrice ?? null;
  } catch { return null; }
}

async function main() {
  const pending = (await db.execute(
    "SELECT * FROM predictions WHERE evaluated = 0 ORDER BY prediction_date ASC"
  )).rows;

  console.log(`\n📊 Backfill de predicciones — ${pending.length} pendientes\n`);

  const tickers = [...new Set(pending.map(p => p.ticker))];
  console.log(`🔍 Fetching precios CEDEAR (.BA) actuales para: ${tickers.join(", ")}\n`);

  // Precio ARS actual del CEDEAR (comparación correcta)
  const priceArsMap = {};
  // Precio USD del subyacente (solo para guardar en el registro)
  const priceUsdMap = {};

  for (const ticker of tickers) {
    const [ars, usd] = await Promise.all([fetchPriceBa(ticker), fetchPriceUsd(ticker)]);
    priceArsMap[ticker] = ars;
    priceUsdMap[ticker] = usd;
    process.stdout.write(`  ${ticker}.BA: $${ars?.toLocaleString() ?? "N/A"} ARS  (subyacente USD: $${usd?.toFixed(2) ?? "N/A"})\n`);
  }

  const now = Date.now();
  let evaluated = 0, skipped = 0, noPrice = 0;

  console.log("");
  for (const pred of pending) {
    const daysSince = Math.floor((now - new Date(pred.prediction_date).getTime()) / 86400000);
    const minDays = minDaysForHorizon(pred.horizon);

    if (daysSince < minDays) { skipped++; continue; }

    const currentArs = priceArsMap[pred.ticker];
    const currentUsd = priceUsdMap[pred.ticker];

    // Precio base: preferir ARS (precio real del CEDEAR que pagó el inversor)
    const baseArs = pred.price_ars_at_prediction > 0 ? pred.price_ars_at_prediction : null;

    if (!currentArs || !baseArs) {
      noPrice++;
      const reason = !currentArs ? "sin precio .BA actual" : "sin precio base ARS en la predicción";
      console.log(`  ⚠ ${pred.ticker} [${pred.action}] id:${pred.id} — skip (${reason})`);
      // Marcar como no evaluable para no bloquear el loop de aprendizaje
      await db.execute({
        sql: `UPDATE predictions SET evaluated = 1, evaluation_date = datetime('now'),
              price_usd_at_evaluation = ?, prediction_correct = -1,
              evaluation_notes = ? WHERE id = ?`,
        args: [currentUsd, `No evaluable: ${reason}`, pred.id],
      });
      evaluated++;
      continue;
    }

    const actualChange = Math.round(((currentArs - baseArs) / baseArs) * 10000) / 100;

    let correct = 0;
    if (pred.action === "COMPRAR" && actualChange > 0) correct = 1;
    else if ((pred.action === "VENDER" || pred.action === "REDUCIR") && actualChange < 0) correct = 1;
    else if (pred.action === "MANTENER" && Math.abs(actualChange) < 10) correct = 1;

    const notes = `Backfill ${new Date().toISOString().slice(0,10)}. CEDEAR base: $${baseArs.toLocaleString()} ARS → actual: $${currentArs.toLocaleString()} ARS`;

    await db.execute({
      sql: `UPDATE predictions SET evaluated = 1, evaluation_date = datetime('now'),
            price_usd_at_evaluation = ?, actual_change_pct = ?,
            prediction_correct = ?, evaluation_notes = ?
            WHERE id = ?`,
      args: [currentUsd, actualChange, correct, notes, pred.id],
    });

    const icon = correct === 1 ? "✅" : "❌";
    console.log(`  ${icon} ${pred.ticker} [${pred.action}] ${pred.prediction_date.slice(0,10)} | CEDEAR: $${baseArs.toLocaleString()} → $${currentArs.toLocaleString()} ARS (${actualChange >= 0 ? "+" : ""}${actualChange}%) | ${daysSince}d`);
    evaluated++;
  }

  console.log(`\n📈 Resultado backfill:`);
  console.log(`   Procesadas: ${evaluated}`);
  console.log(`   Saltadas (horizonte no cumplido): ${skipped}`);

  // Resumen de accuracy solo para las que tienen precio base real
  const results = (await db.execute(
    "SELECT action, prediction_correct, COUNT(*) as n FROM predictions WHERE evaluated = 1 AND actual_change_pct IS NOT NULL GROUP BY action, prediction_correct ORDER BY action, prediction_correct DESC"
  )).rows;

  if (results.length > 0) {
    const correct = results.filter(r => r.prediction_correct === 1).reduce((s, r) => s + r.n, 0);
    const wrong   = results.filter(r => r.prediction_correct === 0).reduce((s, r) => s + r.n, 0);
    const total   = correct + wrong;

    console.log(`\n🎯 Accuracy (predicciones con precio base): ${total > 0 ? Math.round(correct/total*100) : "N/A"}% (${correct}/${total} correctas)`);
    console.log("   Detalle:");
    for (const r of results) {
      const label = r.prediction_correct === 1 ? "✅" : r.prediction_correct === 0 ? "❌" : "⚠";
      console.log(`   ${label} ${r.action}: ${r.n}`);
    }
  }
}

main().catch(e => { console.error("❌ Error:", e.message); process.exit(1); });
