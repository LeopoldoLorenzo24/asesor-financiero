import { fetchHistory, fetchCCL } from "./marketData.js";
import { getTransactions, getPortfolioSummary } from "./database.js";
import CEDEARS from "./cedears.js";

export async function calculateBenchmarks(ranking = []) {
  const transactions = await getTransactions(null, 500);
  if (transactions.length === 0) {
    return { error: "No hay operaciones registradas para comparar." };
  }

  // Find the first transaction date
  const sorted = [...transactions].sort((a, b) => new Date(a.date_executed) - new Date(b.date_executed));
  const firstDate = new Date(sorted[0].date_executed);
  const now = new Date();
  const monthsBack = Math.max(1, Math.ceil((now - firstDate) / (30 * 86400000)));

  // Calculate total invested and current portfolio value
  let totalInvestedARS = 0;
  const buys = transactions.filter(t => t.type === "BUY");
  const sells = transactions.filter(t => t.type === "SELL");
  for (const tx of buys) totalInvestedARS += tx.total_ars;
  for (const tx of sells) totalInvestedARS -= tx.total_ars;

  const summary = await getPortfolioSummary();
  let currentValueARS = 0;
  for (const pos of summary) {
    const r = ranking.find(x => x.cedear?.ticker === pos.ticker);
    currentValueARS += r?.priceARS
      ? r.priceARS * pos.total_shares
      : pos.weighted_avg_price * pos.total_shares;
  }

  const portfolioReturn = totalInvestedARS > 0
    ? ((currentValueARS - totalInvestedARS) / totalInvestedARS) * 100
    : 0;

  // Fetch benchmark returns
  let spyReturn = null, qqqReturn = null;
  try {
    const spyHistory = await fetchHistory("SPY", monthsBack);
    if (spyHistory.length >= 2) {
      const first = spyHistory[0].close;
      const last = spyHistory[spyHistory.length - 1].close;
      spyReturn = ((last - first) / first) * 100;
    }
  } catch (e) { console.error("SPY benchmark error:", e.message); }

  try {
    const qqqHistory = await fetchHistory("QQQ", monthsBack);
    if (qqqHistory.length >= 2) {
      const first = qqqHistory[0].close;
      const last = qqqHistory[qqqHistory.length - 1].close;
      qqqReturn = ((last - first) / first) * 100;
    }
  } catch (e) { console.error("QQQ benchmark error:", e.message); }

  // Estimate plazo fijo from env (TNA, defaults to 75%)
  const plazoFijoTNA = parseFloat(process.env.PLAZO_FIJO_TNA || "0.75");
  const plazoFijoMonthly = Math.pow(1 + plazoFijoTNA, 1 / 12) - 1;
  const plazoFijoReturn = (Math.pow(1 + plazoFijoMonthly, monthsBack) - 1) * 100;

  // Estimate Argentine inflation from env (~3.5% monthly default)
  const inflacionMonthly = parseFloat(process.env.INFLACION_MENSUAL || "0.035");
  const inflationReturn = (Math.pow(1 + inflacionMonthly, monthsBack) - 1) * 100;

  // Verdict
  let verdict = "";
  let verdictLevel = "neutral";
  const pR = Math.round(portfolioReturn * 100) / 100;

  if (pR > (spyReturn || 0) && pR > plazoFijoReturn) {
    verdict = "EXCELENTE: El portfolio genera alfa real. Le ganás a SPY y al plazo fijo.";
    verdictLevel = "excellent";
  } else if (pR > (spyReturn || 0) && pR <= plazoFijoReturn) {
    verdict = "Bien en USD, pero el plazo fijo rindió más en ARS. Considerá una estrategia mixta.";
    verdictLevel = "good";
  } else if (pR <= (spyReturn || 0) && pR > inflationReturn) {
    verdict = "SPY ganó. Considerá más peso en ETFs índice para simplificar.";
    verdictLevel = "warning";
  } else if (pR <= inflationReturn) {
    verdict = "ATENCIÓN: No le ganás ni a la inflación argentina. Revisá la estrategia urgente.";
    verdictLevel = "danger";
  } else {
    verdict = "Performance en línea con el mercado. Seguí monitoreando.";
    verdictLevel = "neutral";
  }

  // Projection
  const monthlyReturnPortfolio = monthsBack > 0 ? pR / monthsBack : 0;
  const projectedAnnual = Math.round(monthlyReturnPortfolio * 12 * 100) / 100;

  const portfolioPnL = currentValueARS - totalInvestedARS;

  const context = {
    portfolio: {
      que_es: "Tu cartera de CEDEARs manejada por el bot",
      dato_clave: `${pR >= 0 ? "Ganás" : "Perdés"} $${Math.abs(Math.round(portfolioPnL)).toLocaleString()} ARS`,
      proyeccion_anual: `Si sigue este ritmo: ${projectedAnnual >= 0 ? "+" : ""}${projectedAnnual}% anual`,
    },
    spy: {
      que_es: "Fondo que replica las 500 empresas más grandes de EEUU. Es la referencia universal.",
      dato_clave: "Si hubieras metido todo en SPY sin pensar, este sería tu retorno",
      por_que_importa: "Si no le ganás a SPY, es mejor comprar SPY y no complicarse con stock picking",
    },
    qqq: {
      que_es: "Fondo que replica las 100 empresas más grandes del Nasdaq (pesado en tech)",
      dato_clave: "Referencia para portfolios tech-heavy",
      por_que_importa: "Te muestra si tus otras posiciones suman o restan valor vs solo indexar en Nasdaq",
    },
    plazoFijo: {
      que_es: "Plazo fijo tradicional en pesos argentinos con tasa ~75% TNA",
      dato_clave: "La alternativa más segura en pesos. Cero riesgo, retorno fijo.",
      por_que_importa: "En Argentina con tasas altas, el plazo fijo es un benchmark duro de batir en ARS",
    },
    inflation: {
      que_es: "Estimación de inflación mensual (~3.5%/mes)",
      dato_clave: "Si tu retorno no supera la inflación, estás perdiendo poder adquisitivo",
      por_que_importa: "El piso mínimo que tenés que superar para no perder plata en términos reales",
    },
  };

  const nota_representatividad = monthsBack < 3
    ? "NOTA: Con menos de 3 meses de datos, estos números no son representativos. Volvé a chequear en unos meses."
    : monthsBack < 6
    ? "Los datos empiezan a ser significativos. A partir de 6 meses vas a tener una foto más clara."
    : "Datos representativos. Esta comparación refleja bien el rendimiento real del bot.";

  const beatsMarket = {
    spy: spyReturn != null ? pR > spyReturn : null,
    qqq: qqqReturn != null ? pR > qqqReturn : null,
    plazoFijo: pR > plazoFijoReturn,
    inflation: pR > inflationReturn,
  };

  return {
    period: { months: monthsBack, from: firstDate.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) },
    portfolio: { investedARS: Math.round(totalInvestedARS), currentValueARS: Math.round(currentValueARS), returnPct: Math.round(pR * 100) / 100 },
    benchmarks: {
      spy: spyReturn != null ? Math.round(spyReturn * 100) / 100 : null,
      qqq: qqqReturn != null ? Math.round(qqqReturn * 100) / 100 : null,
      plazoFijo: Math.round(plazoFijoReturn * 100) / 100,
      inflation: Math.round(inflationReturn * 100) / 100,
    },
    verdict,
    verdictLevel,
    context,
    proyeccion_anual: projectedAnnual,
    meses_de_datos: monthsBack,
    nota_representatividad,
    beatsMarket,
  };
}
