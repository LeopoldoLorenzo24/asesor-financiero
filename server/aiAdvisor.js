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

// --- Generate full AI analysis ---
export async function generateAnalysis({ topPicks, portfolio, capital, ccl, diversification, warnings, ranking }) {
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

PERFIL: Moderado-Agresivo

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

El perfil es MODERADO-AGRESIVO. Puede tolerar volatilidad pero no apuestas extremas.
Máximo 35% en un solo sector. Mínimo 3 sectores. Siempre algo defensivo + cobertura.
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
      system: `Sos un asesor financiero argentino experto en CEDEARs. 
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
    const clean = fullText.replace(/```json|```/g, "").replace(/<cite[^>]*>|<\/cite>/g, "").trim();

    // Try to extract JSON from the response
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in AI response:", clean.substring(0, 200));
      return { error: "No se pudo parsear la respuesta de la IA", raw: clean.substring(0, 500) };
    }

    const result = JSON.parse(jsonMatch[0]);

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
    const clean = textParts.join("").replace(/```json|```/g, "").trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { error: "Parse error" };
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error(`AI single analysis error for ${ticker}:`, err.message);
    return { error: err.message };
  }
}
