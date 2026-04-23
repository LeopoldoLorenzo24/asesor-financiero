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

const TICKER   = "XOM";
const SELL_QTY = 10;
const PRICE_USD = 15.94;
const CCL       = 1479.20;
const PRICE_ARS = Math.round(PRICE_USD * CCL * 100) / 100;
const TOTAL_ARS = Math.round(SELL_QTY * PRICE_ARS * 100) / 100;
const DATE      = "2026-04-08";

// 1. Leer lot actual
const lots = (await db.execute({
  sql: "SELECT id, shares FROM portfolio WHERE ticker = ? ORDER BY date_bought ASC",
  args: [TICKER],
})).rows;
const totalShares = lots.reduce((s, l) => s + l.shares, 0);

if (SELL_QTY > totalShares) {
  console.error(`❌ No tenés ${SELL_QTY} CEDEARs de ${TICKER}. Tenés ${totalShares}.`);
  process.exit(1);
}

const ops = [];
let remaining = SELL_QTY;
for (const lot of lots) {
  if (remaining <= 0) break;
  if (lot.shares <= remaining) {
    ops.push({ sql: `DELETE FROM portfolio WHERE id = ?`, args: [lot.id] });
    remaining -= lot.shares;
  } else {
    ops.push({
      sql: `UPDATE portfolio SET shares = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [lot.shares - remaining, lot.id],
    });
    remaining = 0;
  }
}

// 2. Insertar transacción SELL
ops.push({
  sql: `INSERT INTO transactions (ticker, type, shares, price_ars, price_usd, ccl_rate, total_ars, notes, date_executed)
        VALUES (?, 'SELL', ?, ?, ?, ?, ?, 'venta parcial — efectivo personal', ?)`,
  args: [TICKER, SELL_QTY, PRICE_ARS, PRICE_USD, CCL, TOTAL_ARS, DATE],
});

await db.batch(ops, "write");

// 3. Verificar
const after = (await db.execute({
  sql: "SELECT SUM(shares) as total FROM portfolio WHERE ticker = ?",
  args: [TICKER],
})).rows[0];
const remaining_shares = after.total ?? 0;

console.log(`✅ Venta registrada:`);
console.log(`   ${TICKER}: -${SELL_QTY} CEDEARs a USD $${PRICE_USD} / ARS $${PRICE_ARS.toLocaleString()}`);
console.log(`   Total recibido: ≈ USD $${(PRICE_USD * SELL_QTY).toFixed(2)} / ARS $${TOTAL_ARS.toLocaleString()}`);
console.log(`   ${TICKER} restante en cartera: ${remaining_shares} CEDEARs`);
