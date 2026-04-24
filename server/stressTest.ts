// ============================================================
// STRESS TEST ENGINE
// Runs portfolio through historical Argentine stress scenarios
// ============================================================

import { fetchHistory } from "./marketData.js";
import { calculateBrokerCosts } from "./brokerCosts.js";

export interface StressScenario {
  name: string;
  description: string;
  period: { start: string; end: string };
  spyDropPct: number;
  cclSpikePct: number;
  volatilityMultiplier: number;
}

// Escenarios históricos representativos de Argentina
export const STRESS_SCENARIOS: StressScenario[] = [
  {
    name: "Devaluación Agosto 2018",
    description: "Crisis de mercados emergentes, USD/ARS de ~28 a ~40",
    period: { start: "2018-08-01", end: "2018-10-01" },
    spyDropPct: -5,
    cclSpikePct: 45,
    volatilityMultiplier: 2.5,
  },
  {
    name: "Crash COVID Marzo 2020",
    description: "Pánico global, SPY -34% en un mes",
    period: { start: "2020-02-20", end: "2020-04-15" },
    spyDropPct: -34,
    cclSpikePct: 15,
    volatilityMultiplier: 3.0,
  },
  {
    name: "Post-Paso Agosto 2019",
    description: "Volatilidad extrema post primarias, CCL explota",
    period: { start: "2019-08-09", end: "2019-09-15" },
    spyDropPct: -8,
    cclSpikePct: 35,
    volatilityMultiplier: 2.8,
  },
  {
    name: "Guerra Ucrania Feb 2022",
    description: "Shock energético, inflación global, SPY -12%",
    period: { start: "2022-01-01", end: "2022-03-15" },
    spyDropPct: -12,
    cclSpikePct: 10,
    volatilityMultiplier: 1.8,
  },
  {
    name: "Hipervolatilidad Diciembre 2023",
    description: "Transición política, devaluación Milei, CCL +118%",
    period: { start: "2023-11-01", end: "2024-01-31" },
    spyDropPct: -2,
    cclSpikePct: 118,
    volatilityMultiplier: 2.2,
  },
];

export interface StressTestResult {
  scenario: string;
  portfolioStartValue: number;
  portfolioEndValue: number;
  portfolioReturnPct: number;
  maxDrawdownPct: number;
  recoveryMonths: number | null;
  survived: boolean;
  notes: string;
}

/**
 * Simula el impacto de un escenario de stress en una cartera.
 * Simplificación: aplica multiplicadores de volatilidad y drops al historial.
 */
export async function runStressTest(
  scenario: StressScenario,
  currentPortfolioValueArs: number,
  currentCcl: number
): Promise<StressTestResult> {
  try {
    // Fetch SPY history around the stress period
    const spyHistory = await fetchHistory("SPY", 24).catch(() => []);
    const periodHistory = spyHistory.filter(
      (h) => h.date >= scenario.period.start && h.date <= scenario.period.end
    );

    if (periodHistory.length < 10) {
      return {
        scenario: scenario.name,
        portfolioStartValue: currentPortfolioValueArs,
        portfolioEndValue: currentPortfolioValueArs,
        portfolioReturnPct: 0,
        maxDrawdownPct: 0,
        recoveryMonths: null,
        survived: false,
        notes: "Datos históricos insuficientes para simular este escenario.",
      };
    }

    // Simular cartera core/satellite 50/50 simplificada
    const coreValue = currentPortfolioValueArs * 0.5;
    const satValue = currentPortfolioValueArs * 0.5;

    // Core sigue a SPY (con algo de protección del CCL)
    const coreReturn = scenario.spyDropPct * 0.9; // CEDEARs en ARS se benefician parcialmente del CCL

    // Satellite sufre más por volatilidad
    const satReturn = scenario.spyDropPct * scenario.volatilityMultiplier;

    const coreEnd = coreValue * (1 + coreReturn / 100);
    const satEnd = Math.max(0, satValue * (1 + satReturn / 100));

    // Aplicar stop-loss simulado del sistema (-12%)
    const stopLossedSat = satReturn < -12 ? satValue * 0.88 : satEnd;

    const totalEnd = coreEnd + stopLossedSat;
    const totalReturn = ((totalEnd - currentPortfolioValueArs) / currentPortfolioValueArs) * 100;

    // Max drawdown simulado (más agresivo que el return final)
    const maxDrawdown = Math.min(totalReturn, scenario.spyDropPct * 1.1);

    // Recovery: asumiendo retorno mensual promedio de SPY ~8% anual = ~0.65% mensual
    const monthlyRecoveryRate = 0.65;
    const recoveryMonths =
      totalReturn < 0 ? Math.ceil(Math.abs(totalReturn) / monthlyRecoveryRate) : 0;

    const survived = maxDrawdown > -40; // Límite de supervivencia

    return {
      scenario: scenario.name,
      portfolioStartValue: Math.round(currentPortfolioValueArs),
      portfolioEndValue: Math.round(totalEnd),
      portfolioReturnPct: Math.round(totalReturn * 100) / 100,
      maxDrawdownPct: Math.round(maxDrawdown * 100) / 100,
      recoveryMonths: recoveryMonths > 0 ? recoveryMonths : null,
      survived,
      notes: `${scenario.description}. Core: ${coreReturn.toFixed(1)}%, Satellite: ${satReturn.toFixed(1)}% (con stop-loss: ${stopLossedSat < satEnd ? "activado" : "no activado"}).`,
    };
  } catch (err: any) {
    return {
      scenario: scenario.name,
      portfolioStartValue: currentPortfolioValueArs,
      portfolioEndValue: currentPortfolioValueArs,
      portfolioReturnPct: 0,
      maxDrawdownPct: 0,
      recoveryMonths: null,
      survived: false,
      notes: `Error en simulación: ${err.message}`,
    };
  }
}

export async function runAllStressTests(
  portfolioValueArs: number,
  ccl: number
): Promise<StressTestResult[]> {
  const results: StressTestResult[] = [];
  for (const scenario of STRESS_SCENARIOS) {
    results.push(await runStressTest(scenario, portfolioValueArs, ccl));
  }
  return results;
}
