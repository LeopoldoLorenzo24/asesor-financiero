import { Router } from "express";
import { autoSeedHistoricalLessons } from "../jobs.js";
import {
  getPredictions, evaluatePredictionsForTicker, getPostMortems, getLatestLessons,
  savePostMortem, getAnalysisSessions,
} from "../database.js";
import { fetchQuote } from "../marketData.js";
import { getClient, extractJSON } from "../aiAdvisor.js";
import { assertAiBudgetAvailable, recordAnthropicUsage } from "../aiUsage.js";
import { recordSelfCheckResult } from "../observability.js";
import { AI_CONFIG } from "../config.js";
import { safeJsonParse } from "../utils.js";
import { sendInternalError } from "../http.js";

const router = Router();

router.post("/seed-historical-lessons", async (req, res) => {
  try {
    const existing = await getPostMortems(50);
    if (existing.some((pm) => pm.month_label?.includes("Histórico"))) {
      return res.json({ message: "Experiencia histórica ya estaba cargada.", alreadySeeded: true });
    }
    const stats = await autoSeedHistoricalLessons();
    res.json({ message: "Lecciones históricas generadas exitosamente", stats });
  } catch (err) {
    sendInternalError(res, "postmortem.seedHistoricalLessons", err);
  }
});

router.post("/generate", async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: "ANTHROPIC_API_KEY no configurada" });

    const pending = await getPredictions(null, true);
    const tickersToEval = [...new Set(pending.map((p) => p.ticker))];
    for (const t of tickersToEval) {
      try {
        const [q, qBa] = await Promise.all([fetchQuote(t).catch(() => null), fetchQuote(`${t}.BA`).catch(() => null)]);
        if (q || qBa) await evaluatePredictionsForTicker(t, q?.price ?? null, qBa?.price ?? null);
      } catch (e) { console.warn(`[postmortem] Eval error ${t}:`, e.message); }
    }

    const allPreds = await getPredictions(null, false, 50);
    const oneMonthAgo = new Date(Date.now() - 35 * 86400000).toISOString();
    const recentEvaluated = allPreds.filter((p) => p.evaluated && p.prediction_date > oneMonthAgo);
    if (recentEvaluated.length === 0) return res.json({ message: "No hay predicciones evaluadas del último mes para analizar." });

    const correct = recentEvaluated.filter((p) => p.prediction_correct === 1).length;
    const total = recentEvaluated.length;
    const accuracy = Math.round((correct / total) * 100);
    const avgReturn = recentEvaluated.reduce((s, p) => s + (p.actual_change_pct || 0), 0) / total;
    const sorted = [...recentEvaluated].sort((a, b) => (b.actual_change_pct || 0) - (a.actual_change_pct || 0));
    const bestPick = sorted[0];
    const worstPick = sorted[sorted.length - 1];

    const client = getClient();
    const predsDetail = recentEvaluated.map((p) => `- ${p.prediction_date?.slice(0, 10)} | ${p.action} ${p.ticker} | Conf: ${p.confidence}% | Resultado: ${p.actual_change_pct != null ? `${p.actual_change_pct >= 0 ? "+" : ""}${p.actual_change_pct}%` : "N/A"} | ${p.prediction_correct === 1 ? "ACERTÉ" : "FALLÉ"} | Razón: "${(p.reasoning || "").slice(0, 80)}"`).join("\n");
    const prevLessons = await getLatestLessons();
    const prevContext = prevLessons.length > 0 ? `\nLECCIONES DE MESES ANTERIORES:\n${prevLessons.map((l) => `[${l.month_label}] Lecciones: ${l.lessons_learned}\nReglas: ${l.self_imposed_rules}`).join("\n\n")}` : "";

    const pmPrompt = `Sos un asesor financiero haciendo tu POST-MORTEM MENSUAL. Revisá TODAS tus predicciones del último mes y generá un análisis honesto.

ESTADÍSTICAS DEL MES:
- Predicciones totales: ${total}
- Aciertos: ${correct} (${accuracy}%)
- Retorno promedio de tus picks: ${avgReturn.toFixed(2)}%
- Mejor pick: ${bestPick?.ticker} (${bestPick?.actual_change_pct}%)
- Peor pick: ${worstPick?.ticker} (${worstPick?.actual_change_pct}%)

DETALLE:
${predsDetail}
${prevContext}

Respondé SOLO con JSON válido:
{
  "resumen_mes": "2-3 oraciones",
  "aciertos_analisis": "Qué hiciste bien",
  "errores_analisis": "En qué fallaste. Sé específico",
  "patrones_detectados": ["Patrón 1"],
  "reglas_nuevas": ["Regla 1"],
  "ajustes_estrategia": "Qué vas a hacer diferente",
  "confianza_estrategia": 70,
  "nota_para_mi_yo_futuro": "Mensaje para vos el mes que viene"
}`;

    const model = AI_CONFIG.model;
    await assertAiBudgetAvailable("/api/postmortem/generate");
    const startedAt = Date.now();
    let response;
    try {
      response = await client.messages.create({ model, max_tokens: AI_CONFIG.maxTokensPostMortem, system: "Sos un asesor financiero haciendo autocrítica honesta. Sé brutalmente honesto. Respondé SOLO JSON.", messages: [{ role: "user", content: pmPrompt }] });
      await recordAnthropicUsage({ route: "/api/postmortem/generate", model, response, latencyMs: Date.now() - startedAt, success: true });
    } catch (llmErr) {
      await recordAnthropicUsage({ route: "/api/postmortem/generate", model, response: null, latencyMs: Date.now() - startedAt, success: false, errorMessage: llmErr.message });
      throw llmErr;
    }

    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const jsonStr = extractJSON(text);
    if (!jsonStr) return res.status(500).json({ error: "No se pudo parsear la respuesta de Claude" });
    const pmResult = JSON.parse(jsonStr);

    const monthLabel = new Date().toLocaleString("es-AR", { month: "long", year: "numeric" });
    await savePostMortem({
      monthLabel, totalPredictions: total, correctPredictions: correct, accuracyPct: accuracy,
      totalReturnPct: Math.round(avgReturn * 100) / 100, spyReturnPct: null, beatSpy: false,
      bestPick: bestPick?.ticker, bestPickReturn: bestPick?.actual_change_pct,
      worstPick: worstPick?.ticker, worstPickReturn: worstPick?.actual_change_pct,
      lessonsLearned: (pmResult.aciertos_analisis || "") + " | " + (pmResult.errores_analisis || ""),
      selfImposedRules: JSON.stringify(pmResult.reglas_nuevas || []),
      patternsDetected: JSON.stringify(pmResult.patrones_detectados || []),
      confidenceInStrategy: pmResult.confianza_estrategia,
      rawAiResponse: JSON.stringify(pmResult),
    });

    res.json({ stats: { total, correct, accuracy, avgReturn: Math.round(avgReturn * 100) / 100 }, postmortem: pmResult, monthLabel });
  } catch (err) {
    sendInternalError(res, "postmortem.generate", err);
  }
});

router.get("/history", async (req, res) => {
  try {
    res.json((await getPostMortems(12)).map((pm) => ({
      ...pm,
      self_imposed_rules: safeJsonParse(pm.self_imposed_rules, []),
      patterns_detected: safeJsonParse(pm.patterns_detected, []),
      raw_ai_response: safeJsonParse(pm.raw_ai_response, null),
    })));
  } catch (err) { sendInternalError(res, "postmortem.history", err); }
});

export default router;
