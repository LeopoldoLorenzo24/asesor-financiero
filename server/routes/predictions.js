import { Router } from "express";
import {
  getPredictions, evaluatePredictionsForTicker, getPredictionById,
} from "../database.js";
import { fetchQuote, fetchHistory } from "../marketData.js";
import { getClient, extractJSON } from "../aiAdvisor.js";
import { assertAiBudgetAvailable, recordAnthropicUsage } from "../aiUsage.js";
import { AI_CONFIG } from "../config.js";

const router = Router();

router.get("/", async (req, res) => {
  try { res.json(await getPredictions(req.query.ticker || null, req.query.unevaluated === "true", parseInt(req.query.limit) || 100)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/evaluate", async (req, res) => {
  try {
    const { ticker } = req.body;
    if (!ticker) return res.status(400).json({ error: "Falta ticker" });
    const t = ticker.toUpperCase();
    const [quote, quoteBa, history] = await Promise.all([
      fetchQuote(t).catch(() => null),
      fetchQuote(`${t}.BA`).catch(() => null),
      fetchHistory(t, 6).catch(() => []),
    ]);
    if (!quote && !quoteBa) return res.status(404).json({ error: "No se pudo obtener precio" });
    const results = await evaluatePredictionsForTicker(t, quote?.price ?? null, quoteBa?.price ?? null, history);
    res.json({ ticker: t, currentPriceUsd: quote?.price, currentPriceArs: quoteBa?.price, evaluated: results.length, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/evaluate-all", async (req, res) => {
  try {
    const pending = await getPredictions(null, true);
    const tickers = [...new Set(pending.map((p) => p.ticker))];
    const allResults = [];
    for (const t of tickers) {
      try {
        const [q, qBa, history] = await Promise.all([
          fetchQuote(t).catch(() => null),
          fetchQuote(`${t}.BA`).catch(() => null),
          fetchHistory(t, 6).catch(() => []),
        ]);
        if (q?.price || qBa?.price) allResults.push(...await evaluatePredictionsForTicker(t, q?.price ?? null, qBa?.price ?? null, history));
      } catch (e) { console.error(`Eval error ${t}:`, e.message); }
    }
    res.json({ tickersProcessed: tickers.length, totalEvaluated: allResults.length, results: allResults });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/conclude", async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: "ANTHROPIC_API_KEY no configurada" });
    const predictionId = parseInt(req.params.id);
    if (isNaN(predictionId)) return res.status(400).json({ error: "ID inválido" });

    const prediction = await getPredictionById(predictionId);
    if (!prediction) return res.status(404).json({ error: "Predicción no encontrada" });

    const quote = await fetchQuote(prediction.ticker);
    if (!quote) return res.status(500).json({ error: `No se pudo obtener precio de ${prediction.ticker}` });

    const currentPriceUsd = quote.price;
    const predictionPriceUsd = prediction.price_usd_at_prediction;
    const changePct = predictionPriceUsd > 0 ? Math.round(((currentPriceUsd - predictionPriceUsd) / predictionPriceUsd) * 10000) / 100 : null;
    const daysSince = Math.floor((Date.now() - new Date(prediction.prediction_date).getTime()) / 86400000);

    const client = getClient();
    const prompt = `Sos un asesor financiero revisando una predicción que hiciste.

PREDICCIÓN ORIGINAL:
- Fecha: ${prediction.prediction_date?.slice(0, 10)}
- Ticker: ${prediction.ticker}
- Acción: ${prediction.action}
- Confianza: ${prediction.confidence}%
- Razón: "${prediction.reasoning}"
- Precio USD: $${predictionPriceUsd?.toFixed(2) || "N/A"}
- RSI: ${prediction.rsi_at_prediction || "N/A"}
- Score: ${prediction.score_composite || "N/A"}/100
- Target: ${prediction.target_pct ? `+${prediction.target_pct}%` : "N/A"}
- Stop loss: ${prediction.stop_loss_pct ? `${prediction.stop_loss_pct}%` : "N/A"}

REALIDAD (${daysSince} días después):
- Precio actual USD: $${currentPriceUsd.toFixed(2)}
- Cambio: ${changePct !== null ? `${changePct >= 0 ? "+" : ""}${changePct}%` : "N/A"}
- ${changePct !== null && prediction.target_pct ? (changePct >= prediction.target_pct ? "ALCANZÓ el target" : "NO alcanzó el target aún") : ""}
- ${changePct !== null && prediction.stop_loss_pct ? (changePct <= prediction.stop_loss_pct ? "TOCÓ el stop loss" : "No tocó stop loss") : ""}

Buscá noticias recientes de ${prediction.ticker}.
Respondé SOLO con JSON válido:
{
  "le_pegue": true/false,
  "resumen": "2-3 oraciones analizando si la predicción fue correcta",
  "que_paso": "Qué pasó con la empresa/sector",
  "que_aprendo": "1-2 oraciones sobre qué aprendés",
  "accion_sugerida_ahora": "MANTENER|VENDER|AUMENTAR",
  "confianza_actual": 70
}`;

    const model = AI_CONFIG.model;
    await assertAiBudgetAvailable("/api/predictions/:id/conclude");
    const startedAt = Date.now();
    let response;
    try {
      response = await client.messages.create({ model, max_tokens: AI_CONFIG.maxTokensConclude, tools: [{ type: "web_search_20250305", name: "web_search" }], system: "Sos un asesor financiero revisando predicciones pasadas. Sé honesto. Buscá noticias. Respondé SOLO JSON.", messages: [{ role: "user", content: prompt }] });
      await recordAnthropicUsage({ route: "/api/predictions/:id/conclude", model, response, latencyMs: Date.now() - startedAt, success: true });
    } catch (llmErr) {
      await recordAnthropicUsage({ route: "/api/predictions/:id/conclude", model, response: null, latencyMs: Date.now() - startedAt, success: false, errorMessage: llmErr.message });
      throw llmErr;
    }

    const textParts = response.content.filter((b) => b.type === "text").map((b) => b.text);
    const conclusion = extractJSON(textParts.join(""));

    res.json({ prediction: { id: prediction.id, ticker: prediction.ticker, action: prediction.action, confidence: prediction.confidence, reasoning: prediction.reasoning, date: prediction.prediction_date, priceAtPrediction: predictionPriceUsd }, actual: { currentPrice: currentPriceUsd, changePct, daysSince }, conclusion });
  } catch (err) {
    console.error("Conclusion error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
