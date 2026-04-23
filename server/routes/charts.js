import { Router } from "express";
import { getCapitalHistory, getTransactions } from "../database.js";

const router = Router();

// GET /api/charts/portfolio-evolution
// Devuelve serie temporal del portfolio + marcadores de transacciones
router.get("/charts/portfolio-evolution", async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 180;
    const [history, transactions] = await Promise.all([
      getCapitalHistory(days),
      getTransactions(null, 200),
    ]);

    // Transformar history a serie temporal
    const series = history.map((h) => ({
      date: h.date,
      capital: h.capital_available_ars || 0,
      portfolioValue: h.portfolio_value_ars || 0,
      totalWealth: (h.capital_available_ars || 0) + (h.portfolio_value_ars || 0),
      ccl: h.ccl_rate || null,
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Transacciones como anotaciones
    const annotations = transactions.map((tx) => ({
      date: tx.date_executed,
      ticker: tx.ticker,
      type: tx.type,
      shares: tx.shares,
      price: tx.price_ars,
      total: tx.total_ars,
    }));

    res.json({ series, annotations, days });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
