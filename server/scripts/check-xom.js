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

const rows = (await db.execute({
  sql: "SELECT id, ticker, shares, avg_price_ars, notes, date_bought FROM portfolio WHERE ticker = ? ORDER BY date_bought",
  args: ["XOM"],
})).rows;
console.log("Lots XOM en portfolio:", JSON.stringify(rows, null, 2));

const txs = (await db.execute({
  sql: "SELECT id, ticker, type, shares, price_usd, price_ars, notes, date_executed FROM transactions WHERE ticker = ? ORDER BY date_executed DESC LIMIT 5",
  args: ["XOM"],
})).rows;
console.log("\nTxs XOM recientes:", JSON.stringify(txs, null, 2));

const allPortfolio = (await db.execute({
  sql: "SELECT ticker, SUM(shares) as total FROM portfolio GROUP BY ticker ORDER BY ticker",
})).rows;
console.log("\nPortfolio completo:", JSON.stringify(allPortfolio, null, 2));
