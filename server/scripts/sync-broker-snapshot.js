// ============================================================
// BROKER SNAPSHOT SYNC
// Actualiza la BD con el estado real de la cartera en Bull Market
// Ejecutar con: node server/scripts/sync-broker-snapshot.js
// ============================================================

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import { createClient } from "@libsql/client";
import { mkdirSync } from "fs";

const dbUrl = process.env.TURSO_URL || `file:${path.join(__dirname, "..", "data", "cedear-advisor.db")}`;
if (dbUrl.startsWith("file:")) {
  mkdirSync(path.dirname(dbUrl.replace("file:", "")), { recursive: true });
}
const db = createClient({ url: dbUrl, authToken: process.env.TURSO_AUTH_TOKEN });

// ── Snapshot real del broker (Bull Market, 2026-04-08) ──
// ppcUsd = Precio Promedio de Compra en USD (tal cual aparece en el broker)
const CCL = 1479.20; // CCL venta al momento del sync
const SNAPSHOT_DATE = "2026-04-08";

const POSITIONS = [
  { ticker: "ABBV",  shares: 5,  ppcUsd: 24.23 },
  { ticker: "COST",  shares: 5,  ppcUsd: 21.18 },
  { ticker: "GOOGL", shares: 6,  ppcUsd:  5.68 },
  { ticker: "MSFT",  shares: 7,  ppcUsd: 14.58 },
  { ticker: "NVDA",  shares: 4,  ppcUsd:  8.17 },
  { ticker: "SPY",   shares: 27, ppcUsd: 34.74 },
  { ticker: "V",     shares: 7,  ppcUsd: 18.38 },
  { ticker: "XOM",   shares: 19, ppcUsd: 16.44 },
];

async function main() {
  console.log("📊 Sincronizando cartera real desde broker...\n");

  // 1. Borrar portfolio completo (todos los lots)
  await db.execute("DELETE FROM portfolio");
  console.log("🗑  Portfolio limpiado.");

  // 2. Borrar las transacciones de sincronizaciones anteriores para no duplicar
  //    el costo base USD. Se preservan transacciones reales (compras/ventas manuales).
  const deleteResult = await db.execute(
    "DELETE FROM transactions WHERE notes IN ('importación manual', 'snapshot broker')"
  );
  console.log(`🗑  Transacciones de syncs anteriores eliminadas (${deleteResult.rowsAffected ?? 0}).`);

  // 3. Insertar los nuevos lots + transacciones con precios ARS y USD
  const ops = [];
  for (const pos of POSITIONS) {
    const priceArs = Math.round(pos.ppcUsd * CCL * 100) / 100;
    const totalArs = Math.round(pos.shares * priceArs * 100) / 100;

    ops.push({
      sql: `INSERT INTO portfolio (ticker, shares, avg_price_ars, notes, date_bought)
            VALUES (?, ?, ?, 'snapshot broker', ?)`,
      args: [pos.ticker, pos.shares, priceArs, SNAPSHOT_DATE],
    });

    ops.push({
      sql: `INSERT INTO transactions
              (ticker, type, shares, price_ars, price_usd, ccl_rate, total_ars, notes, date_executed)
            VALUES (?, 'BUY', ?, ?, ?, ?, ?, 'snapshot broker', ?)`,
      args: [pos.ticker, pos.shares, priceArs, pos.ppcUsd, CCL, totalArs, SNAPSHOT_DATE],
    });
  }

  await db.batch(ops, "write");

  // 4. Verificar resultado
  console.log("\n✅ Cartera actualizada:\n");
  const summary = (await db.execute(`
    SELECT ticker, SUM(shares) as shares,
           ROUND(SUM(shares * avg_price_ars) / SUM(shares), 2) as avg_ars,
           ROUND(SUM(shares * avg_price_ars) / SUM(shares) / ${CCL}, 2) as avg_usd,
           ROUND(SUM(shares * avg_price_ars), 0) as total_ars
    FROM portfolio GROUP BY ticker ORDER BY total_ars DESC
  `)).rows;

  let grandTotal = 0;
  for (const r of summary) {
    grandTotal += r.total_ars;
    console.log(
      `  ${r.ticker.padEnd(6)} ${String(r.shares).padStart(3)} CEDEARs | PPC: $${r.avg_usd} USD / $${r.avg_ars.toLocaleString()} ARS | Total: $${r.total_ars.toLocaleString()} ARS`
    );
  }
  console.log(`\n  TOTAL INVERTIDO: $${Math.round(grandTotal).toLocaleString()} ARS ≈ USD $${Math.round(grandTotal / CCL).toLocaleString()}`);
  console.log("\n🎯 Listo. Ya podés hacer el análisis IA con la cartera actualizada.\n");
}

main().catch(e => { console.error("❌ Error:", e.message); process.exit(1); });
