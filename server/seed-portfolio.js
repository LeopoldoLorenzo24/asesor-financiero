// ============================================================
// SEED SCRIPT - Carga el portfolio real del inversor
// Ejecutar UNA vez: node seed-portfolio.js
// ============================================================

import "dotenv/config";
import {
  addPosition,
  logCapital,
  getPortfolioSummary,
} from "./database.js";

const PORTFOLIO = [
  { ticker: "ABBV", shares: 5, priceArs: 34830.26, notes: "Compra mes 1-2 - Healthcare defensivo" },
  { ticker: "AMZN", shares: 120, priceArs: 2197.24, notes: "Compra mes 1-2 - E-commerce/cloud growth" },
  { ticker: "COIN", shares: 9, priceArs: 11054.19, notes: "Compra mes 1-2 - Crypto exposure" },
  { ticker: "COST", shares: 5, priceArs: 30441.25, notes: "Compra mes 1-2 - Consumer defensive" },
  { ticker: "GOOGL", shares: 12, priceArs: 8128.74, notes: "Compra mes 1-2 - Big tech / AI" },
  { ticker: "MSFT", shares: 10, priceArs: 20867.96, notes: "Compra mes 1-2 - Big tech / cloud" },
  { ticker: "NVDA", shares: 13, priceArs: 11697.33, notes: "Compra mes 1-2 - AI / semiconductors" },
  { ticker: "QCOM", shares: 7, priceArs: 18381.52, notes: "Compra mes 1-2 - Semiconductors / mobile" },
  { ticker: "QQQ", shares: 2, priceArs: 45561.21, notes: "Compra mes 1-2 - ETF Nasdaq 100" },
  { ticker: "SPY", shares: 5, priceArs: 51440.07, notes: "Compra mes 1-2 - ETF S&P 500" },
  { ticker: "UNH", shares: 15, priceArs: 12985.85, notes: "Compra mes 1-2 - Healthcare" },
  { ticker: "V", shares: 7, priceArs: 26400.25, notes: "Compra mes 1-2 - Financial / pagos" },
];

async function main() {
  console.log("=== CARGANDO PORTFOLIO REAL ===\n");

  for (const pos of PORTFOLIO) {
    try {
      await addPosition(pos.ticker, pos.shares, pos.priceArs, null, null, pos.notes);
      const total = pos.shares * pos.priceArs;
      console.log(`✓ ${pos.ticker}: ${pos.shares} CEDEARs a $${pos.priceArs.toLocaleString()} = $${Math.round(total).toLocaleString()} ARS`);
    } catch (err) {
      console.error(`✗ Error con ${pos.ticker}: ${err.message}`);
    }
  }

  // Registrar capital inicial
  const portfolioValue = 1964830;
  const capitalDisponible = 35170; // 2.000.000 - 1.964.830
  await logCapital(capitalDisponible, portfolioValue, null, 1000000);
  console.log(`\n✓ Capital registrado: $${capitalDisponible.toLocaleString()} disponible + $${portfolioValue.toLocaleString()} invertido`);

  // Verificar
  const summary = await getPortfolioSummary();
  console.log(`\n=== PORTFOLIO CARGADO (${summary.length} posiciones) ===`);
  for (const s of summary) {
    console.log(`  ${s.ticker}: ${s.total_shares} CEDEARs @ $${s.weighted_avg_price} ARS`);
  }

  console.log("\n¡Listo! Ahora el bot sabe qué tenés comprado.");
  console.log("Podés ejecutar el servidor normalmente con: npm run dev");
}

main().catch((err) => {
  console.error("[seed-portfolio] Fatal:", err);
  process.exit(1);
});
