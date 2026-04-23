# AUDITORÍA CEDEAR ADVISOR — Hallazgos Críticos

## Resumen Ejecutivo
El sistema tiene una arquitectura sólida y un loop de aprendizaje **parcialmente funcional**, pero hay **bugs críticos** que distorsionan las métricas de performance y **faltan piezas clave** para que sea una herramienta de inversión confiable a largo plazo.

---

## 1. BUG CRÍTICO: Evaluación de Predicciones Distorsionada

**Archivo:** `database.ts` → `evaluatePrediction()`

**Problema:** La función calcula `actual_change_pct` comparando el precio de entrada contra el precio actual al momento de evaluar. Si una predicción de "corto plazo" (7 días) se evalúa automáticamente a los 60 días porque el job no corrió, el `actual_change_pct` refleja el cambio a 60 días, no a 7.

**Impacto:** Las métricas de accuracy, best pick, worst pick y todo el post-mortem están **sesgados**. El bot puede parecer que acierta cuando en realidad falló en el horizon correcto, o viceversa.

**Fix necesario:**
- Guardar el precio del ticker en la fecha de `evaluation_date` (o en la fecha de horizon), no solo el precio actual al evaluar.
- O mejor: cambiar `evaluatePredictionsForTicker` para que fetchée el historial de precios y use el precio en la fecha que corresponde al horizon de la predicción.

---

## 2. BUG CRÍTICO: `sanitizePicksWithRiskLimits` recibe argumentos incorrectos

**Archivo:** `routes/ai.js` línea 85-88

```js
const { sanitizedPicks, riskNotes } = sanitizePicksWithRiskLimits(
  analysis.decision_mensual.picks_activos,
  portfolioSummary,
  profileId  // ← BUG: debería ser cedearDefs (mapa ticker→definición)
);
```

**Impacto:** El risk manager no puede calcular concentración sectorial porque `cedearDefs` es un string ("moderate"), no un objeto. Las validaciones de sector se saltan silenciosamente.

**Fix:**
```js
const cedearDefs = Object.fromEntries(CEDEARS.map(c => [c.ticker, c]));
const { sanitizedPicks, riskNotes } = sanitizePicksWithRiskLimits(
  analysis.decision_mensual.picks_activos,
  portfolioSummary,
  cedearDefs,
  profileId
);
```

---

## 3. FALTA: Post-Mortem Mensual Automático

**Archivo:** `jobs.js`

**Problema:** El post-mortem solo se genera si alguien llama `POST /api/postmortem/generate` manualmente. No hay job automático que lo corra mensualmente.

**Impacto:** Las lecciones aprendidas no se acumulan sin intervención humana. El prompt de análisis mensual recibe `getLatestLessons()` que puede estar vacío o desactualizado.

**Fix:** Agregar `runPostMortem()` en `jobs.js` y schedulearlo junto a los otros jobs.

---

## 4. FALTA: Paper Trading / Cartera Virtual

**Problema:** No existe una cartera virtual que siga las recomendaciones del bot al 100%. No podemos calcular "regret" (cuánto habría ganado el usuario si obedeciera al bot).

**Impacto:** No hay baseline de "qué tan bueno es el bot realmente". El usuario puede estar perdiendo plata por no seguir las recomendaciones, o el bot puede dar malas recomendaciones y no lo sabemos.

**Fix:** Nueva tabla `virtual_portfolio` que aplica las recomendaciones del análisis mensual. Comparar virtual vs real en dashboard.

---

## 5. FALTA: Tracking de Ejecución

**Problema:** El bot genera `plan_ejecucion` pero nunca verifica si el usuario lo ejecutó. No hay métrica de "adherence" (qué % de las recomendaciones se ejecutaron).

**Impacto:** El loop de aprendizaje no sabe si el usuario falló por no seguir al bot, o si el bot falló por dar malas recomendaciones.

**Fix:** Guardar el `plan_ejecucion` en `analysis_sessions`. Después de 30 días, comparar contra transacciones reales y calcular adherence.

---

## 6. FALTA: Métricas de Riesgo del Portfolio

**Problema:** No se calcula Sharpe ratio, Sortino, max drawdown, beta, VaR del portfolio real.

**Impacto:** El usuario no sabe si está asumiendo riesgo excesivo por el retorno que obtiene.

**Fix:** Agregar cálculos en `performance.js` y exponer en endpoint + frontend.

---

## 7. FALTA: Alertas de Take-Profit

**Archivo:** `jobs.js` → `runStopLossCheck()`

**Problema:** Solo hay alertas de stop-loss. No hay alertas cuando un pick alcanza su target.

**Impacto:** El usuario puede dejar ganancias sobre la mesa por no tener señal de salida positiva.

**Fix:** Agregar `runTakeProfitCheck()` similar a stop-loss.

---

## 8. DEBILIDAD: Datos Fundamentalistas Pobres para CEDEARs

**Archivo:** `marketData.js` → `fetchFinancials()`

**Problema:** `quoteSummary` de Yahoo devuelve datos vacíos para la mayoría de CEDEARs (son ADRs, no acciones directas). El fallback solo tiene PE y forwardPE.

**Impacto:** El score fundamental es poco confiable. Muchos CEDEARs tienen score fundamental artificial de 50 (neutral).

**Fix:** Cachear datos fundamentalistas de una fuente mejor (Finnhub basic financials, o scraper de BYMA/BA/otra) o usar ratios promedio del sector cuando no hay datos específicos.

---

## 9. DEBILIDAD: Scoring Técnico Simplista

**Archivo:** `analysis.js`

**Problema:** El scoring técnico es una suma ponderada de reglas hardcodeadas. No usa machine learning ni backtesting interno de los indicadores.

**Impacto:** El score puede no correlacionar con retornos futuros. No hay evidencia de que un score de 85 prediga mejor retorno que uno de 70.

**Fix:** Implementar "feature importance" usando las predicciones evaluadas — qué indicadores (RSI, MACD, SMA cross) estuvieron presentes en picks ganadores vs perdedores.

---

## 10. RECOMENDACIÓN UX: Agregar pantalla "Seguimiento de Recomendaciones"

**Nueva vista:** Mostrar la última sesión de análisis mensual, el `plan_ejecucion` generado, y marcar cada paso como:
- ✅ Ejecutado (hay transacción que coincide)
- ❌ No ejecutado
- ⏳ Pendiente

Esto aumenta adherence y genera datos para el loop de aprendizaje.

---

## 11. RECOMENDACIÓN UX: Agregar pantalla "Paper Trading"

**Nueva vista:** Comparar cartera real vs cartera virtual (si siguiera al bot al 100%). Mostrar regret en ARS: "Si seguías al bot, tendrías $X más/menos".

---

## 12. RECOMENDACIÓN UX: Métricas de Riesgo en Dashboard

**Agregar cards:**
- Max Drawdown (últimos 90 días)
- Sharpe Ratio (si tenemos risk-free rate)
- Beta vs SPY
- VaR 95% (cuánto podés perder en un día malo)

---

## Prioridad de Implementación

| Prioridad | Item | Impacto en Ganancias |
|-----------|------|---------------------|
| 🔴 P0 | Fix evaluación de predicciones (horizon correcto) | ALTO — corrige métricas |
| 🔴 P0 | Fix argumentos de `sanitizePicksWithRiskLimits` | ALTO — riesgo real |
| 🔴 P0 | Post-mortem automático mensual | ALTO — mejora prompts |
| 🟡 P1 | Paper trading + regret tracking | ALTO — baseline real |
| 🟡 P1 | Seguimiento de ejecución (adherence) | MEDIO — feedback loop |
| 🟡 P1 | Alertas de take-profit | MEDIO — captura ganancias |
| 🟢 P2 | Métricas de riesgo (Sharpe, VaR) | MEDIO — gestión de riesgo |
| 🟢 P2 | Mejorar datos fundamentalistas | MEDIO — mejor scoring |
| 🟢 P2 | Feature importance en scoring | MEDIO — scoring inteligente |

---

## Conclusión

El sistema **NO es infalible hoy**. Tiene bugs que distorsionan la retroalimentación y falta la pieza más importante: saber si el usuario ejecutó las recomendaciones y cuánto habría ganado si lo hiciera. Sin eso, el loop de aprendizaje es ciego.

**Para hacerlo brillante:**
1. Corregir los 3 bugs críticos (evaluación, risk limits, post-mortem auto)
2. Agregar paper trading + adherence tracking
3. Agregar take-profit alerts
4. Mejorar la calidad de datos fundamentalistas
5. Con el tiempo, usar ML para ponderar indicadores técnicos según historial real de aciertos
