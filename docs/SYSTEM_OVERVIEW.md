## Visión general del sistema (arquitectura)

### 1) Componentes principales

- **Backend (Node/Express, carpeta `server/`)**
  - `index.js`: servidor Express y rutas HTTP (`/api/*`).
  - `marketData.js`: integración con Yahoo Finance y API de dólar CCL.
  - `analysis.js`: motor de análisis técnico/fundamental y scoring compuesto.
  - `diversifier.js`: motor de diversificación algorítmica (elige los candidatos a satellite).
  - `backtest.js`: simulador histórico core/satellite vs SPY/QQQ.
  - `benchmarks.js`: compara rendimiento real del bot vs SPY, QQQ, plazo fijo e inflación.
  - `aiAdvisor.js`: orquestador que arma el prompt, llama a Claude y loguea predicciones.
  - `investmentCycle.js`: construye el contexto mensual (portfolio actual, sesiones previas, aciertos/errores).
  - `database.js`: capa de acceso a datos (SQLite/Turso): portfolio, transacciones, predicciones, sesiones, capital.
  - `auth.js`: autenticación muy simple (1 usuario permitido, token HMAC casero).
  - `cedears.js`: catálogo estático de CEDEARs (ticker, nombre, sector, ratio).

- **Frontend (carpeta `client/`)**
  - `src/api.js`: cliente HTTP que llama a todas las rutas `/api/*` y maneja token de sesión en `sessionStorage`.
  - Resto de la UI (no la detallamos acá, pero consume este `api.js`).

---

### 2) Flujo completo cuando pedís una recomendación mensual

1. **El frontend llama** `POST /api/ai/analyze` con:
   - `capital`: efectivo disponible que declarás hoy.
   - `profile`: `conservative|moderate|aggressive`.

2. **Backend arma el ranking completo** (`/api/ai/analyze` en `index.js`):
   - Usa `CEDEARS` para obtener la lista de tickers.
   - Llama a:
     - `fetchAllQuotes(tickers)`: precios y datos básicos de todas las empresas.
     - `fetchBymaPrices(tickers)`: precios ARS en BYMA para CEDEARs.
   - Para las ~20 mejores por “fundamental básico”:
     - Llama `fetchHistory` (gráfico 6 meses) y `fetchFinancials`.
     - Calcula:
       - `technicalAnalysis(history)`: RSI, MACD, medias móviles, Bollinger, ATR, volumen, performance 1m/3m/6m.
       - `fundamentalAnalysis(financials, quote)`: P/E, crecimiento EPS/ingresos, márgenes, ROE, deuda, dividendos, consenso de analistas.
       - `compositeScore(tech, fund, quote, sector, profile)`: mezcla ponderada de técnico, fundamental y “sentimiento” para dar un score 0–100, señal (`COMPRA`, `HOLD`, etc.) y horizonte sugerido.

3. **Diversificación algorítmica** (`diversifiedSelection`):
   - Toma ese ranking y tu portfolio actual (desde DB).
   - Calcula exposición sectorial actual y emite `warnings` si:
     - Algún sector supera el máximo recomendado del perfil (ej. >35% en tech).
     - Estás en muy pocos sectores (ej. solo 2 sectores en perfil moderado).
   - Selecciona una lista de `picks`:
     - Slots por categoría (growth, defensive, hedge, neutral) según perfil.
     - Penaliza candidatos de sectores donde ya estás sobreexpuesto.
     - Intenta garantizar un mínimo de sectores diferentes entre los picks.

4. **Construcción del contexto mensual** (`buildMonthlyCycleContext`):
   - Lee de la DB:
     - `getPortfolioSummary()`: posiciones actuales agrupadas por ticker.
     - Últimas sesiones de análisis (`getAnalysisSessions(3)`).
     - Últimas transacciones y predicciones (`getTransactions`, `getPredictions`).
   - Calcula:
     - Valor de tu portfolio en ARS usando precios actuales (`ranking`).
     - P&L por ticker, exposición sectorial, patrimonio total (invertido + efectivo).
     - Accuracy reciente de las predicciones (aciertos / errores).
   - Genera un gran bloque de texto en castellano que resume:
     - Qué tenés hoy, cómo viene rindiendo, en qué estás concentrado, cómo le estuvo yendo al bot en sus predicciones recientes.

5. **Mini-backtest interno** (nuevo comportamiento):
   - `aiAdvisor.generateAnalysis` llama a `runBacktest` con:
     - Perfil actual (conservative/moderate/aggressive).
     - Período de 6 meses, 1M ARS por mes, picks por mes = 4.
   - `runBacktest`:
     - Simula cada mes: compra core (SPY/QQQ) y un pequeño satellite de CEDEARs filtrados por:
       - Momentum (precio > SMA20).
       - Tendencia (precio > SMA50 preferido).
       - RSI (penaliza sobrecomprados, premia rebotes desde sobreventa).
       - MACD, Bollinger, volumen.
     - Aplica **stop-loss** y **take-profit parcial** en el satellite.
     - Compara:
       - Portfolio total core+satellite vs SPY/QQQ puro.
       - Satellite solo vs SPY/QQQ.
       - Qué picks individuales le ganaron a SPY.

6. **Prompt a Claude (advisor IA)**:
   - Combina:
     - Perfil de riesgo y reglas (`PROFILE_PROMPTS` en `aiAdvisor.js`).
     - Contexto mensual del ciclo de inversión (portfolio, sesiones previas, aciertos/errores).
     - Detalle de los top picks (`tickerDetails` con scores, técnicos y fundamentales).
     - Resultado del mini-backtest reciente (`backtestSection`).
   - Instrucciones clave al modelo:
     - SPY/QQQ es el **default absoluto**.
     - Solo recomendar picks activos con convicción alta (umbral según perfil).
     - Si no hay oportunidades claras o el backtest muestra que el satellite no genera alfa:
       - Está bien, e incluso es preferible, mandar todo a SPY/QQQ.
     - Para cada pick activo:
       - Debe explicar “por qué le gana a SPY/QQQ” y con qué horizonte.
     - Debe diagnosticar la cartera actual (mantener, aumentar, reducir, vender) y respetar el capital disponible.

7. **Respuesta de la IA y logging**:
   - Claude responde SOLO con un JSON estructurado:
     - Resumen de mercado.
     - Diagnóstico de cartera.
     - Acciones sobre posiciones actuales.
     - `decision_mensual` (core vs satellite).
     - `picks_activos` con convicción, stop-loss, target, motivo de alfa vs SPY.
     - Resumen de operaciones, cartera objetivo, riesgos, honestidad.
   - El backend:
     - Parse el JSON y lo normaliza si viene en formato viejo.
     - Guarda cada pick activo como una **predicción** (`predictions`):
       - Ticker, acción, confianza, target, stop-loss, precio al momento, indicadores (RSI, scores, P/E).
     - Guarda la sesión completa (`analysis_sessions`) con:
       - Capital disponible, valor del portfolio, resumen de mercado, estrategia mensual, riesgos y respuesta completa.

---

## Crítica del funcionamiento actual (nivel asesor profesional)

### Fortalezas

- **Filosofía clara: SPY/QQQ como default**  
  - El sistema está diseñado para que “no hacer nada especial” (comprar SPY/QQQ) sea la opción por defecto.
  - Esto es coherente con la evidencia académica: la mayoría de los gestores activos no le gana al índice en el largo plazo.

- **Separación Core/Satellite bien definida**  
  - Core: ETFs amplios (SPY o QQQ), para capturar el mercado.
  - Satellite: stock picking oportunista pero con límites de porcentaje y reglas diferentes por perfil.
  - El backtest y el advisor comparten esta misma filosofía, lo cual es clave para que los tests tengan sentido.

- **Uso de múltiples capas de validación**  
  - Scoring técnico + fundamental + “sentimiento” (momentum).
  - Diversificación algorítmica que evita sobreconcentración en sectores.
  - Backtest que audita si la selección histórica generó alfa vs SPY/QQQ.
  - Benchmarks que comparan la performance real del bot vs mercado, plazo fijo e inflación.

- **Loop de aprendizaje explícito**  
  - Cada pick recomendado se guarda con su contexto (scores, RSI, P/E, razón).
  - Hay mecanismos para evaluar si la predicción fue buena o mala, y estadísticas globales (`calculateBotPerformance`).
  - Parte de ese contexto ya se puede inyectar al modelo para que “se acuerde” de sus errores.

### Debilidades / riesgos a tener en cuenta

1. **Horizonte de backtest limitado (6 meses por defecto)**  
   - 6 meses es muy poco para declarar que una estrategia “sirve” o “no sirve”.
   - Períodos cortos pueden estar muy dominados por:
     - Un rally puntual de tech.
     - Una corrección fuerte temporal.
   - Recomendación: correr el backtest con varios horizontes (6, 12, 24 meses) y buscar robustez, no solo un número puntual.

2. **Riesgo de sobreajuste (overfitting) al último tramo de mercado**  
   - Tanto el scoring como el backtest se basan mucho en:
     - Momentum reciente (1–3–6 meses).
     - RSI/MACD/medias móviles de los últimos meses.
   - En mercados laterales o muy volátiles, esto puede producir:
     - Falsos positivos de entrada (comprar “rebotes” que siguen cayendo).
     - Rotación excesiva si se llevara a ejecución mecánica.

3. **Gestión de riesgo todavía simplificada**  
   - El backtest incluye stop-loss y take-profit, pero:
     - Las recomendaciones de la IA no tienen una capa adicional que haga cumplir límites estrictos de:
       - Riesgo por operación (ej. máximo 1–2% del patrimonio).
       - Pérdida máxima mensual.
     - El JSON incluye `stop_loss_pct`, pero el sistema no simula todavía la ejecución real de esos stops en el portfolio real.

4. **Autenticación casera (no crítica para la lógica financiera, pero a notar)**  
   - `auth.js` implementa un token tipo JWT “a mano” con HMAC.
   - Para un uso personal está bien, pero para algo multiusuario o productivo:
     - Se debería usar un JWT estándar o un proveedor de identidad.
     - Cambiar el `JWT_SECRET` por uno seguro y no chequeado en código.

5. **Dependencia fuerte de una única fuente de datos (Yahoo Finance)**  
   - Si Yahoo cambia API, limita peticiones o devuelve datos inconsistentes:
     - El ranking, el backtest y las recomendaciones se ven afectados juntos.
   - Recomendación: en un futuro, tener:
     - Cache local de históricos.
     - Segundo proveedor de datos como respaldo.

6. **El parámetro `portfolio` que manda el frontend al advisor hoy no se usa**  
   - La fuente de verdad del portfolio es la DB (`getPortfolioSummary`), lo cual es correcto.
   - Pero a nivel interfaz de API, es confuso que `POST /api/ai/analyze` acepte un `portfolio` que luego se ignora.
   - Esto no rompe nada, pero sería bueno o bien usarlo como validación cruzada, o directamente eliminarlo de la firma para evitar confusión.

---

## Resumen: ¿sirve como asesor financiero profesional?

- **Lo que hace bien hoy**:
  - Te obliga a compararte siempre contra SPY/QQQ y contra quedarte en pesos.
  - Tiene una capa de backtest integrada que frena el “vendehumo” de picks que no generan alfa.
  - Documenta y audita sus propias predicciones, lo que permite aprender de errores.

- **Lo que falta para nivel “profesional serio”**:
  - Robustecer el backtest (más horizontes, tests por sector, sensibilidad a parámetros).
  - Implementar ejecución y seguimiento explícito de:
    - Stop-loss y take-profit en el portfolio real.
    - Límites estrictos de riesgo por trade y por mes.
  - Integrar de forma más sistemática el historial de aciertos/errores al prompt del advisor (además del backtest).

Con todo lo que ya tiene y los cambios que hicimos, es una muy buena base para un asesor personal serio, **siempre y cuando** mantengas la filosofía que el mismo sistema ya te dice: si no le gana claro a SPY/QQQ, la respuesta correcta es comprar SPY/QQQ y no complicarse.  

