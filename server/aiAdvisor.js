// ============================================================
// AI ADVISOR SERVICE
// Uses Claude API with web search for intelligent analysis
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import NodeCache from "node-cache";
import { logPrediction, logAnalysisSession, buildAIContext, getLatestLessons } from "./database.js";
import { buildMonthlyCycleContext } from "./investmentCycle.js";
import { runBacktest } from "./backtest.js";
import { getMarketKnowledge } from "./marketKnowledge.js";

const backtestCache = new NodeCache({ stdTTL: 21600 }); // 6 horas

let client = null;
function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// Profile-specific system prompts — SPY-default philosophy
// Core = SPY/QQQ indexation, Satellite = active picks only when conviction is high
const PROFILE_PROMPTS = {
  conservative: {
    label: "CONSERVADOR",
    corePct: 80,
    personality: `Sos un asesor financiero CONSERVADOR argentino experto en CEDEARs.
Tu DEFAULT es SPY. Solo recomendás picks activos si tenés convicción altísima (>85/100).
Preservar capital es la prioridad absoluta. Ante la duda: todo a SPY.
Stop loss ajustados: -5% a -8%.`,
    rules: `DISTRIBUCIÓN CORE/SATELLITE: 80% SPY (core) / 20% picks activos (satellite) como MÁXIMO.
Si no hay oportunidades claras, mandá 100% a SPY. No inventés picks por inventar.
Picks solo con conviction ≥85. Priorizar dividendos, empresas estables, baja volatilidad.
Máximo 20% en un solo CEDEAR activo, mínimo 3 sectores si hay satellite.`,
  },
  moderate: {
    label: "MODERADO-AGRESIVO",
    corePct: 50,
    personality: `Sos un asesor financiero argentino experto en CEDEARs.
Tu DEFAULT es SPY. Solo recomendás picks activos si tenés convicción real (>70/100).
Buscás balance: indexación pasiva + stock picking oportunista.
Stop loss: -8% a -12%.`,
    rules: `DISTRIBUCIÓN CORE/SATELLITE: 50% SPY (core) / 50% picks activos (satellite) como MÁXIMO.
Si no hay oportunidades claras, subí la proporción de SPY hasta 80-100%.
Cada pick activo necesita conviction ≥70 y una razón concreta de por qué le gana a SPY.
Máximo 35% en un sector, mínimo 3 sectores en satellite.`,
  },
  aggressive: {
    label: "AGRESIVO",
    corePct: 30,
    personality: `Sos un asesor financiero AGRESIVO argentino experto en CEDEARs.
Tu core es QQQ en lugar de SPY. Buscás alpha con picks de alta convicción.
Tolerás volatilidad alta. Pero incluso en modo agresivo, QQQ es tu default.
Stop loss amplios: -15% a -20%.`,
    rules: `DISTRIBUCIÓN CORE/SATELLITE: 30% QQQ (core) / 70% picks activos (satellite) como MÁXIMO.
Si no hay oportunidades claras, subí QQQ hasta 60-100%.
Cada pick activo necesita conviction ≥60 y explicación de alpha esperado vs QQQ.
Hasta 50% en un solo sector. Mínimo 2 sectores en satellite.`,
  },
};

function getProfileConfig(profileId = "moderate") {
  return PROFILE_PROMPTS[profileId] || PROFILE_PROMPTS.moderate;
}

// --- Generate full AI analysis ---
export async function generateAnalysis({ topPicks, capital, ccl, diversification, warnings, ranking, profileId = "moderate" }) {
  const profile = getProfileConfig(profileId);

  // Construir contexto mensual completo (incluye valor de portfolio y performance reciente)
  const cycleData = await buildMonthlyCycleContext({ capital, ccl, ranking: ranking || topPicks });
  const monthlyContext = cycleData.context;
  const cartEraYaAlineada = cycleData.cartEraYaAlineada;

  // Contexto adicional de auto-evaluación (historial de predicciones evaluadas)
  const selfEvalContext = await buildAIContext();

  // Lecciones de post-mortems anteriores — el conocimiento acumulado del bot
  const lessons = await getLatestLessons();
  let lessonsSection = "";
  if (lessons.length > 0) {
    lessonsSection = `
LECCIONES DE TUS POST-MORTEMS ANTERIORES (LEELAS Y RESPETÁ TUS PROPIAS REGLAS):
${lessons
  .map((l) => {
    const rules = l.self_imposed_rules ? JSON.parse(l.self_imposed_rules) : [];
    const patterns = l.patterns_detected ? JSON.parse(l.patterns_detected) : [];
    return `[${l.month_label}] (Confianza en estrategia: ${l.confidence_in_strategy ?? "—"}%)
Lecciones: ${l.lessons_learned || "—"}
Patrones: ${patterns.length > 0 ? patterns.join("; ") : "—"}
Reglas autoimpuestas: ${rules.length > 0 ? rules.join("; ") : "—"}`;
  })
  .join("\n\n")}

IMPORTANTE: Las reglas que te autoimpusiste son OBLIGATORIAS. Si dijiste "no recomendar X cuando Y", NO lo hagas. Si lo hacés, explicá explícitamente por qué cambiaste de opinión.
`;
  }

  // Base de conocimiento estática de historia del mercado
  const knowledge = getMarketKnowledge();

  // ── Mini-backtest interno multi-horizonte: cómo le viene yendo al bot vs SPY/QQQ ──
  let backtestSummary = null;
  const backtestCacheKey = `minibt_${profileId}`;
  const cachedBacktest = backtestCache.get(backtestCacheKey);

  if (cachedBacktest) {
    console.log("📦 Using cached mini-backtest result");
    backtestSummary = cachedBacktest;
  } else {
  try {
    const monthsSinceStart = cycleData?.monthNumber || 6;
    const horizons = [];
    if (monthsSinceStart >= 3) horizons.push(3);
    if (monthsSinceStart >= 6) horizons.push(6);
    if (monthsSinceStart >= 12) horizons.push(12);
    if (horizons.length === 0) horizons.push(Math.min(6, Math.max(3, monthsSinceStart)));

    const backtests = await Promise.allSettled(
      horizons.map((m) =>
        runBacktest({
          months: m,
          monthlyDeposit: 1000000,
          profile: profileId,
          picksPerMonth: 4,
        })
      )
    );

    const successful = backtests
      .map((r, idx) => (r.status === "fulfilled" && !r.value.error ? { months: horizons[idx], data: r.value } : null))
      .filter(Boolean);

    if (successful.length > 0) {
      // Tomamos como principal el horizonte más largo disponible
      const main = successful.reduce((a, b) => (a.months >= b.months ? a : b));
      const bt = main.data;

      const winners = (bt.riskManagement?.picksVsSpy || []).filter((p) => p.beatsSpy);
      const topTickers = new Set((topPicks || []).map((p) => p.cedear?.ticker));
      const winnersInTopPicks = winners.filter((w) => topTickers.has(w.ticker));

      backtestSummary = {
        months: bt.config?.months,
        monthlyDeposit: bt.config?.monthlyDeposit,
        returnPct: bt.resultado?.returnPct,
        spyReturnPct: bt.resultado?.spyReturnPct,
        beatsSPY: bt.resultado?.beatsSPY,
        satelliteReturnPct: bt.satellite?.returnPct,
        satelliteAlpha: bt.satellite?.alpha,
        satelliteGeneraAlfa: bt.satellite?.generaAlfa,
        veredicto: bt.veredicto,
        picksGanadores: winnersInTopPicks
          .slice(0, 15)
          .map((w) => ({
            ticker: w.ticker,
            sector: w.sector,
            returnPct: w.returnPct,
            vsSpy: w.vsSpy,
          })),
        totalPicksGanadores: winners.length,
        horizons: successful.map(({ months, data }) => ({
          months,
          returnPct: data.resultado?.returnPct,
          spyReturnPct: data.resultado?.spyReturnPct,
          satelliteReturnPct: data.satellite?.returnPct,
          alphaVsSpy: data.resultado?.alpha,
        })),
      };
    }
  } catch (e) {
    console.error("Mini-backtest error inside advisor:", e.message);
  }

  if (backtestSummary) {
    backtestCache.set(backtestCacheKey, backtestSummary);
    console.log("💾 Mini-backtest cached for 6 hours");
  }
  } // end cache-miss block

  const tickerDetails = topPicks
    .slice(0, 10)
    .map(
      (p, i) =>
        `${i + 1}. ${p.ticker} (${p.cedear.name}) - Sector: ${p.cedear.sector}
   Score compuesto: ${p.scores.composite}/100 | Técnico: ${p.scores.techScore} | Fundamental: ${p.scores.fundScore} | Sentimiento: ${p.scores.sentScore}
   Señal: ${p.scores.signal} | Horizonte: ${p.scores.horizon}
   Precio USD: $${p.quote?.price?.toFixed(2) || "N/A"} | P/E: ${p.fundamentals?.pe?.toFixed(1) || "N/A"} | EPS Growth: ${p.fundamentals?.epsGrowth?.toFixed(1) || "N/A"}%
   Div Yield: ${p.quote?.dividendYield?.toFixed(2) || 0}% | Beta: ${p.quote?.beta?.toFixed(2) || "N/A"}
   Cambio 1M: ${p.technical?.indicators?.performance?.month1?.toFixed(1) || "N/A"}% | Cambio 3M: ${p.technical?.indicators?.performance?.month3?.toFixed(1) || "N/A"}%
   RSI: ${p.technical?.indicators?.rsi || "N/A"} | MACD Hist: ${p.technical?.indicators?.macd?.histogram || "N/A"}
   Target analistas: $${p.fundamentals?.targetMeanPrice?.toFixed(2) || "N/A"} | Rec: ${p.fundamentals?.recommendationKey || "N/A"}
   Ratio CEDEAR: ${p.cedear.ratio}:1 | Precio aprox ARS: $${p.quote?.price ? Math.round(p.quote.price * ccl.venta / p.cedear.ratio) : "N/A"}`
    )
    .join("\n\n");

  const coreETF = profileId === "aggressive" ? "QQQ" : "SPY";

  const backtestSection = backtestSummary ? `
RESULTADOS DEL BACKTEST RECIENTE (estrategia del bot vs ${coreETF}):
- Horizonte principal: ${backtestSummary.months || 6} meses
- Retorno total estrategia bot (core + satellite): ${backtestSummary.returnPct != null ? backtestSummary.returnPct + "%" : "N/A"}
- Retorno de ${coreETF} en el mismo período: ${backtestSummary.spyReturnPct != null ? backtestSummary.spyReturnPct + "%" : "N/A"}
- Retorno del SATELLITE (picks activos): ${backtestSummary.satelliteReturnPct != null ? backtestSummary.satelliteReturnPct + "%" : "N/A"} (alfa vs ${coreETF}: ${backtestSummary.satelliteAlpha != null ? backtestSummary.satelliteAlpha + "pp" : "N/A"})
- Veredicto sintético del backtest: ${backtestSummary.veredicto || "N/A"}
${backtestSummary.horizons && backtestSummary.horizons.length > 1
  ? "\nResumen por horizontes:" +
    backtestSummary.horizons
      .map(
        (h) =>
          `\n- ${h.months}m: estrategia ${h.returnPct != null ? h.returnPct + "%" : "N/A"} vs ${coreETF} ${h.spyReturnPct != null ? h.spyReturnPct + "%" : "N/A"} (alfa ${h.alphaVsSpy != null ? h.alphaVsSpy + "pp" : "N/A"})`
      )
      .join("")
  : ""}
- Cantidad de CEDEARs que le ganaron a ${coreETF} dentro de la estrategia: ${backtestSummary.totalPicksGanadores}

INSTRUCCIÓN CLAVE BASADA EN EL BACKTEST:
- Usá estos números como realidad dura: si el backtest muestra que la estrategia de picks del bot NO le gana a ${coreETF}, debés REDUCIR el peso del satellite (por ejemplo 10-25% del capital nuevo) y concentrarte en pocos picks de altísima convicción.
- Siempre debe haber una base sólida en ${coreETF} como core, pero podés sumar algunos CEDEARs cuando tengan buen respaldo tanto en backtest como en tus predicciones históricas.
- Si el satellite muestra alfa POSITIVO y consistente en varios horizontes, podés justificar un satellite más grande dentro de los límites del perfil.

CEDEARs que históricamente le ganaron a ${coreETF} en el backtest y que también están en el ranking actual:
${backtestSummary.picksGanadores && backtestSummary.picksGanadores.length
  ? backtestSummary.picksGanadores
      .map((p) =>
        "- " +
        p.ticker +
        " (" +
        p.sector +
        ") -> retorno vs " +
        coreETF +
        ": " +
        (p.vsSpy != null ? (p.vsSpy >= 0 ? "+" : "") + p.vsSpy + "pp" : "N/A")
      )
      .join("\n")
  : "Ninguno de los picks actuales aparece como ganador claro vs " + coreETF + " en el backtest; sé extremadamente selectivo con el satellite."}
` : "";

  const prompt = `Sos el asesor financiero personal de un inversor argentino que opera CEDEARs.
Él te consulta para revisar su cartera y decidir qué hacer.

═══ FILOSOFÍA FUNDAMENTAL: ${coreETF} ES TU DEFAULT ═══
Tu benchmark y tu recomendación default es ${coreETF}. Si no tenés una razón CONCRETA y con ALTA CONVICCIÓN
de que un CEDEAR individual le va a ganar a ${coreETF} en los próximos 1-3 meses, NO lo recomiendes.
Es mejor indexar que hacer stock picking mediocre. Cada pick activo que recomiendes necesita:
- Conviction score (0-100): qué tan seguro estás
- Razón concreta de por qué le gana a ${coreETF}
- Si no encontrás oportunidades claras, está PERFECTO recomendar 100% ${coreETF}

IMPORTANTE SOBRE EL CAPITAL:
- El inversor declaró que tiene $${capital.toLocaleString()} ARS disponibles para invertir HOY.
- Ese monto es el que él ingresó manualmente. Es la plata que tiene libre en su cuenta.
- Si ese monto es $0 significa que no tiene efectivo nuevo, solo puede rebalancear vendiendo algo.
- Si querés que compre algo nuevo por MÁS del capital disponible, PRIMERO tenés que recomendar VENDER o REDUCIR posiciones para liberar plata.
- NUNCA recomiendes comprar por más plata de la que realmente tiene disponible.

Tu trabajo es:
1. Revisar su cartera existente (qué le recomendaste antes, cómo le fue)
2. Diagnosticar qué mantener, qué vender, qué ajustar
3. Decidir la DISTRIBUCIÓN CORE/SATELLITE del capital:
   - CORE (${coreETF}): la parte que va a indexación pasiva
   - SATELLITE (picks activos): SOLO si hay oportunidades con alta convicción
4. Dar un plan de acción CONCRETO con tickers, cantidades y montos en ARS

Esto es la sesión mensual de ${new Date().toLocaleString("es-AR", { month: "long", year: "numeric" })}:

PERFIL DE RIESGO: ${profile.label}
REGLAS DEL PERFIL:
${profile.rules}

${monthlyContext}

${knowledge}
${lessonsSection}
AUTO-EVALUACIÓN DEL ASESOR (performance histórica y predicciones evaluadas):
${selfEvalContext}

${backtestSection}

RANKING DE CEDEARs (top ${topPicks.length} pre-filtrados por nuestro motor de diversificación):
${tickerDetails}

DIVERSIFICACIÓN ALGORÍTMICA (ya aplicada al filtro):
- Picks totales: ${diversification?.totalPicks || topPicks.length}
- Sectores representados: ${diversification?.sectorsRepresented || 'N/A'}
- Distribución: ${JSON.stringify(diversification?.distribution || {})}
- Categorías: Growth [${diversification?.categories?.growth?.join(', ') || ''}] | Defensive [${diversification?.categories?.defensive?.join(', ') || ''}] | Hedge [${diversification?.categories?.hedge?.join(', ') || ''}]
- Exposición actual del portfolio: ${JSON.stringify(diversification?.portfolioExposure || {})}
${warnings?.length ? `\nALERTAS DE CONCENTRACIÓN:\n${warnings.join('\n')}` : ''}

INSTRUCCIONES - LEELAS TODAS ANTES DE RESPONDER:

CONTEXTO: El inversor ya tiene una cartera armada de CEDEARs (detallada arriba en el contexto de la BD). 
Este NO es un portfolio nuevo. Vos tenés que actuar como su asesor que REVISA lo que ya compró 
y le dice qué ajustar.

PASO 1 - DIAGNOSTICAR LA CARTERA ACTUAL:
- Revisá cada posición que tiene. ¿Sigue siendo buena? ¿Cambió algo?
- Identificá concentración excesiva en algún sector
- Identificá posiciones perdedoras que deberían cortarse (stop loss mental)
- Identificá posiciones que ya dieron lo que tenían que dar

PASO 2 - BUSCAR NOTICIAS:
- Buscá noticias recientes de los tickers que tiene en cartera Y de los mejores del ranking
- Si hay noticias negativas sobre algo que tiene, recomendá reducir o vender

PASO 3 - ARMAR PLAN DE ACCIÓN:
Para CADA posición actual, decidí una de estas acciones:
- MANTENER: está bien, sigue la tesis
- AUMENTAR: está bien y conviene comprar más (si tiene liquidez)
- REDUCIR: vender una parte (indicar cuántos CEDEARs vender y por qué)
- VENDER TODO: salir de la posición completamente (explicar por qué)

PASO 4 - CALCULAR CAPITAL REAL DISPONIBLE:
- Sumá el capital disponible actual (en efectivo) + lo que liberaría con las ventas/reducciones del paso 3.
- Ese es el ÚNICO dinero que tiene para comprar. NO inventes plata que no tiene.

PASO 5 - DECISIÓN CORE/SATELLITE:
Definí cuánto va a ${coreETF} (core) y cuánto a picks activos (satellite).
Regla: ${profile.rules}
IMPORTANTE: Solo recomendá picks activos si tenés ALTA CONVICCIÓN.
Si no encontrás oportunidades claras con conviction ≥ ${profileId === "conservative" ? 85 : profileId === "aggressive" ? 60 : 70}, mandá más o todo a ${coreETF}.
Cada pick activo DEBE tener un campo "por_que_le_gana_a_spy" explicando concretamente por qué le va a ganar a ${coreETF}.

PASO 6 - HONESTIDAD:
Evaluá honestamente si tus picks activos realmente valen la pena vs indexar.
Si la respuesta honesta es "no tengo idea", decilo y recomendá ${coreETF}.

PASO 7 - ¿CARTERA YA ALINEADA? (MUY IMPORTANTE)
${cartEraYaAlineada
  ? `El sistema detectó que el inversor ejecutó TODAS las operaciones que recomendaste en la sesión anterior.
Su cartera ya está alineada con tu estrategia.
REGLA: Si el mercado no cambió de forma significativa (no hay shocks macro, noticias graves, ni desvíos importantes), respondé con "sin_cambios_necesarios: true" y un mensaje claro validando que está bien.
NO INVENTES operaciones para parecer útil. Cambiar algo solo por cambiar es peor que no hacer nada.
En ese caso, usá el analysis para MONITOREAR: confirmá que las tesis siguen vigentes, alertá si algo cambió.
Ejemplo de "mensaje_sin_cambios": "Ejecutaste todo lo que te recomendé. La cartera está como la planeamos: X% SPY como base + [picks]. Las tesis siguen vigentes, no hay motivo para mover nada esta semana. El próximo review formal en [fecha]."
Si hubo cambios significativos de mercado que justifiquen ajustes IGUALMENTE explicalo claramente.`
  : `Revisá si el inversor ejecutó o no las operaciones anteriores (aparecen en el contexto de la sesión pasada con el indicador ⚠ si quedaron pendientes).
Si hay operaciones pendientes sin ejecutar, mencionalo y evaluá si siguen siendo válidas o si el contexto cambió.`}

El perfil es ${profile.label}. ${profile.rules}
MIRÁ TU HISTORIAL DE PREDICCIONES: Si acertaste, repetí. Si fallaste, explicá por qué y ajustá.

Respondé EXCLUSIVAMENTE con un JSON válido (sin markdown, sin backticks, sin texto adicional) con esta estructura:
{
  "resumen_mercado": "2-3 oraciones sobre el contexto macro actual",
  
  "diagnostico_cartera": {
    "estado_general": "Evaluación general de la cartera en 2-3 oraciones",
    "exposicion_sectorial": {
      "Technology": "35%",
      "Healthcare": "18%"
    },
    "problemas_detectados": [
      "Problema 1 (ej: sobreexposición a tech)",
      "Problema 2 (ej: falta energía/commodities)"
    ],
    "fortalezas": [
      "Fortaleza 1 (ej: buena base defensiva con UNH y ABBV)"
    ]
  },
  
  "acciones_cartera_actual": [
    {
      "ticker": "NVDA",
      "accion": "MANTENER|AUMENTAR|REDUCIR|VENDER",
      "cantidad_actual": 13,
      "cantidad_ajustar": 0,
      "razon": "Explicación de por qué mantener/vender/reducir",
      "urgencia": "alta|media|baja"
    }
  ],
  
  "decision_mensual": {
    "resumen": "Explicación de la decisión core/satellite de este mes",
    "core_etf": "${coreETF}",
    "distribucion": {
      "core_pct": 80,
      "core_monto_ars": 800000,
      "satellite_pct": 20,
      "satellite_monto_ars": 200000
    },
    "picks_activos": [
      {
        "ticker": "TICKER",
        "nombre": "Nombre completo",
        "sector": "Sector",
        "conviction": 85,
        "por_que_le_gana_a_spy": "Razón concreta por la que este pick le gana a ${coreETF}",
        "cantidad_cedears": 10,
        "precio_aprox_ars": 5000,
        "monto_total_ars": 50000,
        "horizonte": "Corto|Mediano|Largo plazo",
        "target_pct": 20,
        "stop_loss_pct": -10,
        "cuando_ver_rendimiento": "Descripción concreta de cuándo el inversor debería empezar a ver retornos positivos. Ejemplo: 'En las primeras 2-3 semanas si el catalizador X ocurre, resultados más sólidos a partir del mes 2 con el reporte de earnings'.",
        "proyeccion_retornos": {
          "1_mes": "+3-5%",
          "3_meses": "+10-15%",
          "6_meses": "+20-28%"
        }
      }
    ]
  },
  
  "resumen_operaciones": {
    "total_a_vender_ars": 0,
    "capital_disponible_actual": 35170,
    "capital_disponible_post_ventas": 35170,
    "a_core_ars": 28000,
    "a_satellite_ars": 7170
  },

  "plan_ejecucion": [
    {
      "paso": 1,
      "tipo": "VENDER",
      "ticker": "GOOGL",
      "cantidad_cedears": 4,
      "monto_estimado_ars": 120000,
      "nota": "Liberar capital — ejecutar primero"
    },
    {
      "paso": 2,
      "tipo": "COMPRAR",
      "subtipo": "CORE",
      "ticker": "${coreETF}",
      "cantidad_cedears": 3,
      "monto_estimado_ars": 165000,
      "nota": "Core — ejecutar después de las ventas"
    },
    {
      "paso": 3,
      "tipo": "COMPRAR",
      "subtipo": "SATELLITE",
      "ticker": "XOM",
      "cantidad_cedears": 2,
      "monto_estimado_ars": 90000,
      "nota": "Satellite pick #1 — solo si el presupuesto alcanza"
    }
  ],
  REGLAS CRÍTICAS para plan_ejecucion:
  - Es un plan ORDENADO y SECUENCIAL. PRIMERO todas las ventas/reducciones, LUEGO las compras.
  - Solo incluí acciones que requieren HACER algo: VENDER, REDUCIR, COMPRAR. NO incluyas MANTENERs.
  - El tipo puede ser: "VENDER" (salir o reducir posición) o "COMPRAR" (añadir posición).
  - subtipo: "CORE" para ${coreETF}, "SATELLITE" para picks activos. Solo en tipo COMPRAR.
  - Los montos de TODAS las compras NO pueden superar capital_disponible_post_ventas.
  - Los picks satellite van ordenados por conviction (mayor primero).
  - Si sin_cambios_necesarios es true, plan_ejecucion debe ser [] (array vacío).
  - Este es el plan que el inversor va a EJECUTAR EXACTAMENTE. Sé preciso con cantidades y montos.
  CÁLCULO DE monto_estimado_ars: OBLIGATORIO usar la fórmula correcta para cada tipo:
  - Para VENDER: monto_estimado_ars = cantidad_cedears × "Precio/CEDEAR" del ticker en el portfolio context. Ejemplo: si GOOGL tiene Precio/CEDEAR $7.600 y vendés 4 CEDEARs → monto_estimado_ars = 30.400
  - Para COMPRAR: monto_estimado_ars = cantidad_cedears × precio_aprox_ars del ticker en el ranking. Este valor es orientativo.
  - NUNCA uses el precio USD × CCL directamente sin dividir por el ratio del CEDEAR.
  
  REGLA CRÍTICA para resumen_operaciones:
  - capital_disponible_actual = el efectivo que declaró el inversor (el que ingresó)
  - total_a_vender_ars = suma de todas las ventas/reducciones que recomendás
  - capital_disponible_post_ventas = capital_disponible_actual + total_a_vender_ars (siempre sumar ambos)
  - a_core_ars = capital_disponible_post_ventas × (core_pct / 100)
  - a_satellite_ars = capital_disponible_post_ventas × (satellite_pct / 100)
  Estos 4 números deben ser matemáticamente consistentes entre sí y con decision_mensual.distribucion.
  
  "cartera_objetivo": {
    "descripcion": "Así debería quedar tu cartera después de ejecutar todas las operaciones",
    "posiciones": [
      { "ticker": "TICKER", "sector": "Sector", "porcentaje_target": 15, "es_core": false }
    ]
  },

  "riesgos": [
    "Riesgo 1",
    "Riesgo 2"  
  ],
  
  "sin_cambios_necesarios": false,
  "mensaje_sin_cambios": null,
  
  "honestidad": "Evaluación brutalmente honesta: ¿los picks activos de este mes realmente le van a ganar a ${coreETF}? ¿O estoy recomendando picks por recomendar? Si no tengo convicción real, lo digo acá.",
  "proximo_review": "Cuándo reanalizar"
}`;

  try {
    const response = await getClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
        },
      ],
      system: `${profile.personality}
El inversor te consulta UNA VEZ POR MES para decidir qué hacer con su cartera.
FILOSOFÍA CENTRAL: ${coreETF} es tu default. No recomiendes picks activos a menos que tengas alta convicción.
Si no encontrás oportunidades claras, recomendá ${coreETF} y listo. Eso NO es un fracaso, es buena gestión.
IMPORTANTE: El inversor NO tiene plata nueva para depositar cada mes. Su capital ya está invertido.
Si querés que compre algo, primero tenés que recomendar vender algo para liberar plata.
Tenés acceso a tu historial de predicciones y su resultado real. Usá esa info para mejorar.
Buscá noticias recientes con web search ANTES de responder.
Respondé SOLO JSON válido, sin markdown, sin backticks, sin tags HTML.`,
      messages: [{ role: "user", content: prompt }],
    });

    // Extract text from response (may have multiple content blocks)
    const textParts = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text);

    const fullText = textParts.join("");
    const clean = fullText
      .replace(/```json|```/g, "")
      .replace(/<cite[^>]*>|<\/cite>/g, "")
      .replace(/<search_quality_reflection>[\s\S]*?<\/search_quality_reflection>/g, "")
      .replace(/<\/?[a-z_]+>/g, "")
      .trim();

    // Try to extract JSON from the response
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in AI response:", clean.substring(0, 200));
      return { error: "No se pudo parsear la respuesta de la IA", raw: clean.substring(0, 500) };
    }

    let jsonStr = jsonMatch[0];
    // Fix common JSON issues: control chars inside strings, trailing commas
    jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, (ch) => ch === '\n' || ch === '\r' || ch === '\t' ? ch : ' ');
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr.message);
      console.error("Raw text (first 500):", jsonStr.substring(0, 500));
      // Try a second pass: extract the outermost balanced braces more carefully
      let depth = 0, start = -1, end = -1;
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === '{') { if (start === -1) start = i; depth++; }
        else if (jsonStr[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (start !== -1 && end !== -1) {
        try { result = JSON.parse(jsonStr.substring(start, end + 1)); } catch { result = null; }
      }
      if (!result) return { error: "No se pudo parsear la respuesta de la IA", raw: jsonStr.substring(0, 500) };
    }

    // --- NORMALIZE AI RESPONSE FORMAT ---
    // The AI sometimes uses old format (nuevas_compras) instead of decision_mensual.picks_activos
    if (!result.decision_mensual && result.nuevas_compras) {
      result.decision_mensual = {
        resumen: result.distribucion_capital?.estrategia || "",
        core_etf: coreETF,
        distribucion: result.distribucion_capital || {},
        picks_activos: result.nuevas_compras.map(nc => ({
          ...nc,
          conviction: nc.conviction || 70,
          por_que_le_gana_a_spy: nc.por_que_le_gana_a_spy || nc.razon,
        })),
      };
    }
    if (!result.honestidad && result.autoevaluacion) {
      result.honestidad = result.autoevaluacion;
    }

    // --- LOG PREDICTIONS TO DATABASE ---
    let savedCount = 0;
    try {
      // Log picks activos (satellite) como predicciones
      const picksActivos = result.decision_mensual?.picks_activos || result.nuevas_compras || [];
      for (const rec of picksActivos) {
        if (!rec.ticker) continue;
        const pickData = topPicks.find((p) => p.cedear?.ticker === rec.ticker);
        try {
          await logPrediction({
            ticker: rec.ticker,
            action: rec.accion || "COMPRAR",
            confidence: rec.conviction || 70,
            targetPriceUsd: pickData?.quote?.price ? pickData.quote.price * (1 + (rec.target_pct || 0) / 100) : null,
            stopLossPct: rec.stop_loss_pct,
            targetPct: rec.target_pct,
            horizon: rec.horizonte,
            reasoning: rec.razon || rec.por_que_le_gana_a_spy,
            newsContext: result.resumen_mercado,
            priceUsd: pickData?.quote?.price || null,
            priceArs: rec.precio_aprox_ars || null,
            ccl: ccl.venta,
            rsi: pickData?.technical?.indicators?.rsi || null,
            scoreComposite: pickData?.scores?.composite || null,
            scoreTechnical: pickData?.scores?.techScore || null,
            scoreFundamental: pickData?.scores?.fundScore || null,
            scoreSentiment: pickData?.scores?.sentScore || null,
            pe: pickData?.fundamentals?.pe || null,
          });
          savedCount++;
        } catch (e) {
          console.error(`❌ Error saving prediction for ${rec.ticker}:`, e.message);
        }
      }

      // Log acciones sobre cartera actual (REDUCIR y VENDER como predicciones inversas)
      if (result.acciones_cartera_actual) {
        for (const acc of result.acciones_cartera_actual) {
          if (acc.accion === "REDUCIR" || acc.accion === "VENDER") {
            if (!acc.ticker) continue;
            const pickData = topPicks.find((p) => p.cedear?.ticker === acc.ticker);
            try {
              await logPrediction({
                ticker: acc.ticker,
                action: acc.accion,
                confidence: acc.urgencia === "alta" ? 85 : 60,
                targetPriceUsd: null,
                stopLossPct: null,
                targetPct: null,
                horizon: "Inmediato",
                reasoning: acc.razon,
                newsContext: result.resumen_mercado,
                priceUsd: pickData?.quote?.price || null,
                priceArs: null,
                ccl: ccl.venta,
                rsi: pickData?.technical?.indicators?.rsi || null,
                scoreComposite: pickData?.scores?.composite || null,
                scoreTechnical: pickData?.scores?.techScore || null,
                scoreFundamental: pickData?.scores?.fundScore || null,
                scoreSentiment: pickData?.scores?.sentScore || null,
                pe: pickData?.fundamentals?.pe || null,
              });
              savedCount++;
            } catch (e) {
              console.error(`❌ Error saving prediction for ${acc.ticker}:`, e.message);
            }
          }
        }
      }

      console.log(`📊 Predictions saved: ${savedCount} (picks: ${picksActivos.length}, actions: ${(result.acciones_cartera_actual || []).filter(a => a.accion === "REDUCIR" || a.accion === "VENDER").length})`);

      // Log the full analysis session, incluyendo valor real del portfolio
      await logAnalysisSession({
        capitalArs: capital,
        portfolioValueArs: cycleData?.portfolioValueARS || 0,
        cclRate: ccl.venta,
        marketSummary: result.resumen_mercado,
        strategyMonthly: result.decision_mensual?.resumen || result.distribucion_capital?.estrategia,
        risks: result.riesgos,
        fullResponse: result,
      });
    } catch (logErr) {
      console.error("❌ Error logging to database:", logErr.message);
      // Don't fail the response if logging fails
    }

    return result;
  } catch (err) {
    console.error("AI Analysis error:", err.message);
    return { error: `Error en análisis IA: ${err.message}` };
  }
}

// --- Comprehensive analysis for a single CEDEAR ---
export async function analyzeSingle({ ticker, name, sector, scores, technical, fundamentals, quote, ccl, portfolioContext = "" }) {
  const ind = technical?.indicators || {};
  const perf = ind.performance || {};
  const bb = ind.bollingerBands;
  const sr = ind.supportResistance;
  const stoch = ind.stochastic;
  const vol = ind.volume;

  const prompt = `Hacé un análisis COMPLETO y DETALLADO del CEDEAR ${ticker} (${name}, sector ${sector}) para un inversor argentino.

═══ DATOS COMPLETOS DEL ACTIVO ═══

PRECIO Y COTIZACIÓN:
- Precio USD: $${quote?.price?.toFixed(2) || "N/A"}
- Precio ARS aprox: $${quote?.price ? Math.round((quote.price * ccl.venta) / scores.ratio) : "N/A"}
- Variación diaria: ${quote?.changePercent?.toFixed(2) || "N/A"}%
- Rango del día: $${quote?.dayLow?.toFixed(2) || "N/A"} — $${quote?.dayHigh?.toFixed(2) || "N/A"}
- 52-week high: $${quote?.fiftyTwoWeekHigh?.toFixed(2) || "N/A"}
- 52-week low: $${quote?.fiftyTwoWeekLow?.toFixed(2) || "N/A"}
- Market Cap: ${quote?.marketCap ? `$${(quote.marketCap / 1e9).toFixed(1)}B` : "N/A"}
- Beta: ${quote?.beta?.toFixed(2) || "N/A"}

SCORING DEL SISTEMA:
- Score compuesto: ${scores.composite}/100
- Score técnico: ${scores.techScore}/100
- Score fundamental: ${scores.fundScore}/100
- Score sentimiento: ${scores.sentScore}/100
- Señal: ${scores.signal}
- Horizonte sugerido: ${scores.horizon}

INDICADORES TÉCNICOS:
- RSI (14): ${ind.rsi || "N/A"}
- MACD: ${ind.macd?.macd || "N/A"} | Signal: ${ind.macd?.signal || "N/A"} | Histogram: ${ind.macd?.histogram || "N/A"}
- SMA 20: $${ind.sma20?.toFixed(2) || "N/A"} ${ind.sma20 && quote?.price ? (quote.price > ind.sma20 ? "(precio ARRIBA)" : "(precio ABAJO)") : ""}
- SMA 50: $${ind.sma50?.toFixed(2) || "N/A"} ${ind.sma50 && quote?.price ? (quote.price > ind.sma50 ? "(precio ARRIBA)" : "(precio ABAJO)") : ""}
- SMA 200: $${ind.sma200?.toFixed(2) || "N/A"} ${ind.sma200 && quote?.price ? (quote.price > ind.sma200 ? "(precio ARRIBA)" : "(precio ABAJO)") : ""}
- Bollinger Bands: Upper $${bb?.upper || "N/A"} | Middle $${bb?.middle || "N/A"} | Lower $${bb?.lower || "N/A"} | Bandwidth: ${bb?.bandwidth || "N/A"}%
- Estocástico: K=${stoch?.k || "N/A"} D=${stoch?.d || "N/A"}
- ATR (14): $${ind.atr || "N/A"}
- Soporte: $${sr?.support || "N/A"} | Resistencia: $${sr?.resistance || "N/A"}
- Volumen promedio: ${vol?.avgVolume?.toLocaleString() || "N/A"} | Tendencia volumen: ${vol?.volumeTrend || "N/A"}%

PERFORMANCE:
- 1 día: ${perf.day1 != null ? `${perf.day1}%` : "N/A"}
- 1 semana: ${perf.week1 != null ? `${perf.week1}%` : "N/A"}
- 1 mes: ${perf.month1 != null ? `${perf.month1}%` : "N/A"}
- 3 meses: ${perf.month3 != null ? `${perf.month3}%` : "N/A"}
- 6 meses: ${perf.month6 != null ? `${perf.month6}%` : "N/A"}

FUNDAMENTALES:
- P/E: ${fundamentals?.pe?.toFixed(1) || "N/A"} | Forward P/E: ${fundamentals?.forwardPE?.toFixed(1) || "N/A"}
- PEG: ${fundamentals?.pegRatio?.toFixed(2) || "N/A"}
- EPS Growth: ${fundamentals?.epsGrowth?.toFixed(1) || "N/A"}%
- Revenue Growth: ${fundamentals?.revenueGrowth?.toFixed(1) || "N/A"}%
- Profit Margin: ${fundamentals?.profitMargin?.toFixed(1) || "N/A"}%
- ROE: ${fundamentals?.returnOnEquity?.toFixed(1) || "N/A"}%
- Debt/Equity: ${fundamentals?.debtToEquity?.toFixed(0) || "N/A"}%
- Div Yield: ${quote?.dividendYield?.toFixed(2) || 0}%
- Target analistas: $${fundamentals?.targetMeanPrice?.toFixed(2) || "N/A"} (${fundamentals?.recommendationKey || "N/A"}, ${fundamentals?.numberOfAnalystOpinions || 0} analistas)

Buscá noticias recientes sobre ${ticker} y su sector (${sector}). Analizá TODO en profundidad.
${portfolioContext}

Respondé SOLO con JSON válido (sin markdown, sin backticks):
{
  "veredicto": "COMPRAR|MANTENER|VENDER",
  "confianza": 75,
  "analisis": "Análisis detallado de 4-6 oraciones cubriendo técnico, fundamental y sentimiento",
  "noticias_relevantes": "Resumen detallado de noticias recientes que afectan al ticker y su sector",
  "catalizadores": ["Catalizador positivo 1", "Catalizador positivo 2"],
  "riesgos": ["Riesgo 1", "Riesgo 2"],
  "precio_objetivo_usd": 150.00,
  "soporte_usd": 130.00,
  "resistencia_usd": 160.00,
  "horizonte": "Corto|Mediano|Largo plazo",
  "comparacion_sector": "Cómo se compara este ticker con otros del mismo sector",
  "recomendacion_detallada": "Qué haría exactamente: cuándo comprar, a qué precio, con qué stop-loss y target"
}`;

  try {
    const response = await getClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system:
        "Sos un analista financiero experto en CEDEARs para inversores argentinos. Usá web search para buscar noticias recientes del ticker y su sector. Dá un análisis completo y detallado. Respondé SOLO JSON válido, sin markdown ni backticks.",
      messages: [{ role: "user", content: prompt }],
    });

    const textParts = response.content.filter((b) => b.type === "text").map((b) => b.text);
    const clean = textParts.join("").replace(/```json|```/g, "").replace(/<cite[^>]*>|<\/cite>/g, "").replace(/<\/?[a-z_]+>/g, "").trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { error: "Parse error" };
    let jsonStr = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, (ch) => ch === '\n' || ch === '\r' || ch === '\t' ? ch : ' ').replace(/,\s*([\]}])/g, '$1');
    try { return JSON.parse(jsonStr); } catch { return { error: "Parse error" }; }
  } catch (err) {
    console.error(`AI single analysis error for ${ticker}:`, err.message);
    return { error: err.message };
  }
}
