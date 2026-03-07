// ============================================================
// AI ADVISOR SERVICE
// Uses Claude API with web search for intelligent analysis
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { logPrediction, logAnalysisSession } from "./database.js";
import { buildMonthlyCycleContext } from "./investmentCycle.js";

let client = null;
function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// Profile-specific system prompts
const PROFILE_PROMPTS = {
  conservative: {
    label: "CONSERVADOR",
    personality: `Sos un asesor financiero CONSERVADOR argentino experto en CEDEARs.
Tu prioridad #1 es PRESERVAR CAPITAL. Ante la duda: NO comprar.
Priorizar dividendos, empresas estables, baja volatilidad.
Evitar empresas sin ganancias o con beta > 1.2.
Stop loss ajustados: -5% a -8%.`,
    rules: `Máximo 20% en un solo CEDEAR, 25% en un solo sector.
Mínimo 4 sectores, al menos 40% en defensivos.
Distribución: 40-50% defensivos, 20-25% ETFs, 15-20% cobertura, 10-15% crecimiento moderado.`,
  },
  moderate: {
    label: "MODERADO-AGRESIVO",
    personality: `Sos un asesor financiero argentino experto en CEDEARs.
Buscás balance entre crecimiento y protección. Mix de growth + defensivo + cobertura.
Stop loss: -8% a -12%.`,
    rules: `Máximo 35% en un sector, mínimo 3 sectores.
Distribución: 30-35% crecimiento, 20-25% defensivos, 15-20% financieros, 10-15% cobertura, 5-10% apuestas.`,
  },
  aggressive: {
    label: "AGRESIVO",
    personality: `Sos un asesor financiero AGRESIVO argentino experto en CEDEARs.
Tu prioridad es MAXIMIZAR RETORNO. Tolerás volatilidad alta.
Empresas sin ganancias OK si tienen potencial explosivo.
Ante la duda: COMPRAR.
Stop loss amplios: -15% a -20%.`,
    rules: `Hasta 50% en un solo sector. Mínimo 2 sectores.
Distribución: 50-60% alto crecimiento, 15-20% tech consolidada, 10-15% especulativo, 5-10% defensivo mínimo.`,
  },
};

function getProfileConfig(profileId = "moderate") {
  return PROFILE_PROMPTS[profileId] || PROFILE_PROMPTS.moderate;
}

// --- Generate full AI analysis ---
export async function generateAnalysis({ topPicks, portfolio, capital, ccl, diversification, warnings, ranking, profileId = "moderate" }) {
  const profile = getProfileConfig(profileId);
  // Construir contexto mensual completo
  const cycleData = buildMonthlyCycleContext({ capital, ccl, ranking: ranking || topPicks });
  const monthlyContext = cycleData.context;

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

  const prompt = `Sos el asesor financiero personal de un inversor argentino que opera CEDEARs.
Él te consulta para revisar su cartera y decidir qué hacer.

IMPORTANTE SOBRE EL CAPITAL:
- El inversor declaró que tiene $${capital.toLocaleString()} ARS disponibles para invertir HOY.
- Ese monto es el que él ingresó manualmente. Es la plata que tiene libre en su cuenta.
- Si ese monto es $0. significa que no tiene efectivo nuevo, solo puede rebalancear vendiendo algo.
- Si querés que compre algo nuevo por MÁS del capital disponible, PRIMERO tenés que recomendar VENDER o REDUCIR posiciones para liberar plata.
- El capital total para nuevas compras = capital declarado + lo que libere vendiendo.
- NUNCA recomiendes comprar por más plata de la que realmente tiene disponible.

Tu trabajo es:
1. Revisar su cartera existente (qué le recomendaste antes, cómo le fue)
2. Diagnosticar qué mantener, qué vender, qué ajustar
3. Decidir cómo invertir el capital disponible + plata liberada de ventas
4. Dar un plan de acción CONCRETO con tickers, cantidades y montos en ARS

Esto es la sesión mensual de ${new Date().toLocaleString("es-AR", { month: "long", year: "numeric" })}:

PERFIL DE RIESGO: ${profile.label}
REGLAS DEL PERFIL:
${profile.rules}

${monthlyContext}

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
- Si el capital disponible actual es bajo y no recomendás vender nada, entonces NO recomiendes compras nuevas.

PASO 5 - RECOMENDAR NUEVAS POSICIONES:
Con el capital real disponible (paso 4), recomendar nuevas compras priorizando diversificación sectorial.
El total de las compras NO PUEDE superar el capital disponible post-ventas.

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
  
  "nuevas_compras": [
    {
      "ticker": "TICKER",
      "nombre": "Nombre completo",
      "sector": "Sector",
      "accion": "COMPRAR",
      "cantidad_cedears": 10,
      "precio_aprox_ars": 5000,
      "monto_total_ars": 50000,
      "razon": "Por qué comprarlo ahora",
      "horizonte": "Corto|Mediano|Largo plazo",
      "target_pct": 20,
      "stop_loss_pct": -10
    }
  ],
  
  "resumen_operaciones": {
    "total_a_vender_ars": 0,
    "total_a_comprar_ars": 35170,
    "capital_disponible_actual": 35170,
    "capital_disponible_post_ventas": 35170,
    "capital_total_para_invertir": 35170
  },
  
  "cartera_objetivo": {
    "descripcion": "Así debería quedar tu cartera después de ejecutar todas las operaciones",
    "posiciones": [
      { "ticker": "TICKER", "sector": "Sector", "porcentaje_target": 15 }
    ]
  },

  "distribucion_capital": {
    "estrategia": "Cómo distribuir el capital disponible (efectivo + ventas)",
    "split": [
      { "ticker": "TICKER", "porcentaje": 30, "monto": 10000 }
    ]
  },
  
  "riesgos": [
    "Riesgo 1",
    "Riesgo 2"  
  ],
  
  "autoevaluacion": "Si hay historial de predicciones, evaluá tus aciertos/errores y qué cambiás esta vez",
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
IMPORTANTE: El inversor NO tiene plata nueva para depositar cada mes. Su capital ya está invertido.
Si querés que compre algo, primero tenés que recomendar vender algo para liberar plata.
Tenés acceso a tu historial de predicciones y su resultado real. Usá esa info para mejorar.
Si el mes pasado recomendaste algo y salió mal, reconocelo y ajustá la estrategia.
Si recomendaste algo y salió bien, reforzá esa línea.
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

    // --- LOG PREDICTIONS TO DATABASE ---
    try {
      // Log nuevas compras como predicciones
      if (result.nuevas_compras) {
        for (const rec of result.nuevas_compras) {
          const pickData = topPicks.find((p) => p.cedear?.ticker === rec.ticker);
          logPrediction({
            ticker: rec.ticker,
            action: "COMPRAR",
            confidence: 70,
            targetPriceUsd: pickData?.quote?.price ? pickData.quote.price * (1 + (rec.target_pct || 0) / 100) : null,
            stopLossPct: rec.stop_loss_pct,
            targetPct: rec.target_pct,
            horizon: rec.horizonte,
            reasoning: rec.razon,
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
        }
      }

      // Log acciones sobre cartera actual (REDUCIR y VENDER como predicciones inversas)
      if (result.acciones_cartera_actual) {
        for (const acc of result.acciones_cartera_actual) {
          if (acc.accion === "REDUCIR" || acc.accion === "VENDER") {
            const pickData = topPicks.find((p) => p.cedear?.ticker === acc.ticker);
            logPrediction({
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
          }
        }
      }

      // Log the full analysis session
      logAnalysisSession({
        capitalArs: capital,
        portfolioValueArs: 0, // Will be calculated from portfolio
        cclRate: ccl.venta,
        marketSummary: result.resumen_mercado,
        strategyMonthly: result.distribucion_capital?.estrategia,
        risks: result.riesgos,
        fullResponse: result,
      });
    } catch (logErr) {
      console.error("Error logging to database:", logErr.message);
      // Don't fail the response if logging fails
    }

    return result;
  } catch (err) {
    console.error("AI Analysis error:", err.message);
    return { error: `Error en análisis IA: ${err.message}` };
  }
}

// --- Quick analysis for a single CEDEAR ---
export async function analyzeSingle({ ticker, name, sector, scores, technical, fundamentals, quote, ccl }) {
  const prompt = `Analizá brevemente el CEDEAR ${ticker} (${name}, sector ${sector}) para un inversor moderado-agresivo argentino.

Datos actuales:
- Precio USD: $${quote?.price?.toFixed(2) || "N/A"}
- Precio ARS aprox: $${quote?.price ? Math.round((quote.price * ccl.venta) / scores.ratio) : "N/A"}
- Score: ${scores.composite}/100 (Técnico: ${scores.techScore}, Fundamental: ${scores.fundScore})
- RSI: ${technical?.indicators?.rsi || "N/A"}
- P/E: ${fundamentals?.pe?.toFixed(1) || "N/A"}
- EPS Growth: ${fundamentals?.epsGrowth?.toFixed(1) || "N/A"}%
- Cambio 1M: ${technical?.indicators?.performance?.month1?.toFixed(1) || "N/A"}%
- Señal del sistema: ${scores.signal}

Buscá noticias recientes sobre ${ticker} y respondé SOLO con JSON:
{
  "veredicto": "COMPRAR|MANTENER|VENDER",
  "confianza": 75,
  "analisis": "2-3 oraciones con tu análisis",
  "noticias_relevantes": "Resumen de noticias recientes que afectan",
  "precio_objetivo_usd": 150.00,
  "horizonte": "Corto|Mediano|Largo plazo"
}`;

  try {
    const response = await getClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system:
        "Sos un analista financiero experto. Usá web search para noticias del ticker. Respondé SOLO JSON válido.",
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
