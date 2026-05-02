import test from "node:test";
import assert from "node:assert/strict";
import { buildLiquidityPlan } from "../liquidityPlanner.js";

const mockPortfolio = [
  { ticker: "AAPL", total_shares: 20, weighted_avg_price: 10000 },
  { ticker: "SPY", total_shares: 10, weighted_avg_price: 50000 },
];

const mockPrices = {
  AAPL: 9000,
  SPY: 52000,
};

const mockDefs = {
  AAPL: { ticker: "AAPL", sector: "Technology" },
  SPY: { ticker: "SPY", sector: "ETF - Índices" },
};

test("buildLiquidityPlan no propone ventas si la caja actual ya alcanza", () => {
  const plan = buildLiquidityPlan({
    targetNetArs: 100000,
    availableCashArs: 150000,
    portfolioSummary: mockPortfolio,
    pricesByTicker: mockPrices,
    cedearDefs: mockDefs,
    latestAnalysis: null,
  });

  assert.equal(plan.feasible, true);
  assert.equal(plan.recommendations.length, 0);
  assert.equal(plan.summary.remainingGapArs, 0);
});

test("buildLiquidityPlan prioriza posiciones satellite y acciones ya marcadas para vender", () => {
  const plan = buildLiquidityPlan({
    targetNetArs: 140000,
    availableCashArs: 0,
    portfolioSummary: mockPortfolio,
    pricesByTicker: mockPrices,
    cedearDefs: mockDefs,
    latestAnalysis: {
      decision_mensual: { core_etf: "SPY" },
      acciones_cartera_actual: [
        { ticker: "AAPL", accion: "REDUCIR", razon: "Liberar capital" },
      ],
    },
  });

  assert.equal(plan.recommendations.length > 0, true);
  assert.equal(plan.recommendations[0].ticker, "AAPL");
  assert.equal(plan.recommendations[0].estimatedNetAmountArs > 0, true);
  assert.equal(plan.summary.netPlannedArs >= 140000, true);
});
