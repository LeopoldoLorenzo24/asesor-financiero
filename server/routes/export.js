import { Router } from "express";
import { getPortfolioSummary, getTransactions, getPredictions, getCapitalHistory, getAnalysisSessions } from "../database.js";

const router = Router();

function toCsv(rows, columns) {
  if (!rows || rows.length === 0) return "";
  const header = columns.map((c) => c.label).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => {
      const val = c.get(row);
      if (val === null || val === undefined) return "";
      const str = String(val).replace(/"/g, '""');
      if (str.includes(",") || str.includes('"') || str.includes("\n")) return `"${str}"`;
      return str;
    }).join(",")
  );
  return [header, ...lines].join("\n");
}

// GET /api/export/portfolio
router.get("/export/portfolio", async (req, res) => {
  try {
    const summary = await getPortfolioSummary();
    const csv = toCsv(summary, [
      { label: "Ticker", get: (r) => r.ticker },
      { label: "Cantidad", get: (r) => r.total_shares },
      { label: "Precio Promedio ARS", get: (r) => r.weighted_avg_price },
      { label: "Primera Compra", get: (r) => r.first_bought },
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="portfolio.csv"');
    res.send("\uFEFF" + csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/export/transactions
router.get("/export/transactions", async (req, res) => {
  try {
    const txs = await getTransactions(null, parseInt(req.query.limit) || 500);
    const csv = toCsv(txs, [
      { label: "ID", get: (r) => r.id },
      { label: "Fecha", get: (r) => r.date_executed },
      { label: "Ticker", get: (r) => r.ticker },
      { label: "Tipo", get: (r) => r.type },
      { label: "Cantidad", get: (r) => r.shares },
      { label: "Precio ARS", get: (r) => r.price_ars },
      { label: "Total ARS", get: (r) => r.total_ars },
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="transacciones.csv"');
    res.send("\uFEFF" + csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/export/predictions
router.get("/export/predictions", async (req, res) => {
  try {
    const preds = await getPredictions(null, false, parseInt(req.query.limit) || 500);
    const csv = toCsv(preds, [
      { label: "Ticker", get: (r) => r.ticker },
      { label: "Horizon", get: (r) => r.horizon },
      { label: "Target Price USD", get: (r) => r.target_price_usd },
      { label: "Confidence", get: (r) => r.confidence },
      { label: "Evaluated", get: (r) => r.evaluated },
      { label: "Correct", get: (r) => r.prediction_correct },
      { label: "Actual Change %", get: (r) => r.actual_change_pct },
      { label: "Target %", get: (r) => r.target_pct },
      { label: "Created At", get: (r) => r.created_at },
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="predicciones.csv"');
    res.send("\uFEFF" + csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/export/capital-history
router.get("/export/capital-history", async (req, res) => {
  try {
    const hist = await getCapitalHistory(parseInt(req.query.limit) || 365);
    const csv = toCsv(hist, [
      { label: "Fecha", get: (r) => r.date },
      { label: "Capital Disponible ARS", get: (r) => r.capital_available_ars },
      { label: "Valor Portfolio ARS", get: (r) => r.portfolio_value_ars },
      { label: "Patrimonio Total ARS", get: (r) => (r.capital_available_ars || 0) + (r.portfolio_value_ars || 0) },
      { label: "CCL", get: (r) => r.ccl_rate },
      { label: "Deposito Mensual", get: (r) => r.monthly_deposit },
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="capital-history.csv"');
    res.send("\uFEFF" + csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
