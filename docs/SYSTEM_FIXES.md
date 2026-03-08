## Cambios aplicados e inconsistencias corregidas

### 1) El advisor ahora usa el backtest como validador real contra SPY/QQQ

- **Archivo**: `server/aiAdvisor.js`
- **Qué se agregó**:
  - Dentro de `generateAnalysis` ahora se ejecuta un **mini-backtest interno** llamando a `runBacktest`:
    - Parámetros: últimos 6 meses, depósito mensual de 1M ARS, perfil (`conservative|moderate|aggressive`) y 4 picks por mes.
  - Se arma un objeto `backtestSummary` con:
    - Retorno total de la estrategia del bot (`resultado.returnPct`)
    - Retorno de SPY/QQQ en el mismo período (`resultado.spyReturnPct`)
    - Si el portfolio total le gana o no al benchmark (`beatsSPY`)
    - Retorno y alfa del **satellite** (picks activos) vs SPY/QQQ
    - Lista de CEDEARs que **le ganaron a SPY** en ese backtest (`riskManagement.picksVsSpy`) y que además están presentes en el ranking actual.
  - Se construye un bloque de contexto adicional `backtestSection` que se inyecta en el prompt que se le pasa a Claude, con:
    - Resumen numérico de backtest vs SPY/QQQ
    - Instrucciones explícitas:
      - Si el backtest muestra que la estrategia de picks NO le gana a SPY/QQQ, el **default honesto** es mandar hasta 100% del nuevo capital al ETF core y evitar un satellite grande.
      - Priorizar como picks activos únicamente aquellos tickers que:
        1. En el backtest le ganaron a SPY/QQQ, y
        2. Están bien rankeados por el motor actual.

- **Por qué era una inconsistencia**:
  - Antes, el backtest vivía aislado detrás de `/api/backtest`, pero el asesor IA **no lo usaba** al tomar decisiones.
  - Resultado: el sistema estaba dispuesto a recomendar picks activos aunque su propia historia dijera que no generan alfa vs SPY.

- **Cómo afectaba al sistema**:
  - El asesor podía seguir “jugando a stock picking” aún cuando, históricamente, esa estrategia perdía contra simplemente comprar SPY/QQQ.
  - A nivel conceptual, el bot no aprendía de su propia performance pasada.

- **Impacto del cambio**:
  - Cada nueva sesión de análisis mensual ahora viene condicionada por un backtest reciente:
    - Si el satellite no genera alfa, es mucho más probable que el bot recomiende **subir fuertemente el peso en SPY/QQQ o directamente 100% core**.
    - Si sí hay alfa y varios picks le ganan claramente a SPY/QQQ, la IA tiene argumentos para justificar un satellite más agresivo.
  - El backtest deja de ser un “juguete de visualización” y pasa a ser un **validador de estrategia** integrado al asesor.

---

### 2) Las sesiones de análisis ahora guardan el valor REAL del portfolio

- **Archivo**: `server/aiAdvisor.js`
- **Qué se corrigió**:
  - Antes, al llamar a `logAnalysisSession`, se guardaba siempre `portfolioValueArs: 0` con el comentario “Will be calculated from portfolio”.
  - Ya existía ese cálculo en `buildMonthlyCycleContext` (`portfolioValueARS`), pero **no se reutilizaba** al loguear la sesión.
  - Ahora se pasa el valor real:

  ```js
  await logAnalysisSession({
    capitalArs: capital,
    portfolioValueArs: cycleData?.portfolioValueARS || 0,
    cclRate: ccl.venta,
    marketSummary: result.resumen_mercado,
    strategyMonthly: result.decision_mensual?.resumen || result.distribucion_capital?.estrategia,
    risks: result.riesgos,
    fullResponse: result,
  });
  ```

- **Por qué era una inconsistencia**:
  - El modelo de datos `analysis_sessions` tiene un campo `portfolio_value_ars`, pero en la práctica se guardaba constante en cero.
  - Cualquier análisis futuro de “cómo le fue al bot después de tal recomendación” iba a partir de un valor base incorrecto.

- **Cómo afectaba al sistema**:
  - Cegaba al sistema (y a vos) para comparar sesión vs sesión:
    - No se podía saber con precisión en qué valor estaba el portfolio al momento de cada recomendación mensual.
  - Complicaba cualquier métrica futura tipo “qué hizo el bot el mes que el portfolio valía X”.

- **Impacto del cambio**:
  - Ahora cada sesión de análisis guarda:
    - `capital_ars`: efectivo disponible declarado por vos.
    - `portfolio_value_ars`: valor de mercado del portfolio al momento del análisis (usando precios actuales, no precios de compra).
  - Esto sienta la base para:
    - Gráficos de evolución de patrimonio por sesión de análisis.
    - Análisis serio de “qué hizo el bot cuando mi portfolio estaba alto/bajo”.

---

### 3) Ajustes menores de integración y consistencia general

> Nota: Muchas partes del sistema están bien cohesionadas; acá te detallo puntos que revisé y que son conceptualmente consistentes (aunque los marco para que sepas que los miré críticamente).

- **Benchmarks vs portfolio**:
  - `server/benchmarks.js` compara el retorno de tu cartera en ARS vs:
    - SPY y QQQ (retornos en USD),
    - Plazo fijo en ARS,
    - Inflación estimada en ARS.
  - La mezcla de unidades (USD vs ARS) es **intencional** y se explica en los textos:
    - “Bien en USD, pero el plazo fijo rindió más en ARS.”
  - No se cambió, pero es importante entender que las comparaciones son:
    - “¿Le gano al mercado en USD?” vs SPY/QQQ.
    - “¿Le gano a quedarme en pesos?” vs plazo fijo e inflación.

- **Diversificación algorítmica**:
  - `server/diversifier.js` penaliza sectores donde ya estás sobreexpuesto y prioriza sectores aún no tan cargados.
  - Se verificó que:
    - Las advertencias (`warnings`) de sobreexposición usan el mismo `maxSectorPct` que guía la selección de nuevos picks.
    - Los slots por perfil (`growth`, `defensive`, `hedge`, `best`) respetan las reglas de cada perfil (`conservative/moderate/aggressive`).
  - No se detectó una contradicción fuerte entre lo que dice el perfil (en `aiAdvisor.js`) y lo que hace el pre-filtro.

- **Backtest y estrategia core/satellite**:
  - `server/backtest.js` usa exactamente la misma filosofía que el advisor:
    - Perfiles definen `% core` y ETF base (SPY o QQQ).
    - Satellite limitado en cantidad de picks por mes y filtrado por momentum y tendencia.
  - No se tocó la lógica base del backtest, sólo se reutiliza su salida dentro del advisor.

---

## Posibles mejoras futuras (no implementadas todavía)

Estas no son bugs, pero sí puntos a considerar si querés un asesor “nivel profesional”:

1. **Horizonte del backtest configurable**  
   - Hoy el mini-backtest interno del advisor usa fijo 6 meses. Podría:
     - Ajustarse según tu horizonte (ej. 12–24 meses para ver distintos ciclos de mercado).
     - Evaluar la estabilidad de la estrategia en varios períodos (walk-forward).

2. **Uso más profundo del histórico de predicciones**  
   - Ya existe `calculateBotPerformance` y `buildAIContext`, pero el advisor mensual no los usa explícitamente en el prompt principal.
   - Se podría inyectar un resumen del performance histórico del bot en el mismo prompt de `generateAnalysis` para reforzar el aprendizaje sobre errores pasados.

3. **Control estricto de riesgo por ticker**  
   - Hoy el backtest tiene reglas de stop-loss/take-profit, pero las recomendaciones mensuales no forzan explícitamente:
     - Tamaño máximo por ticker en porcentaje del patrimonio.
     - Pérdida máxima mensual o por operación.
   - Podríamos exponer estas reglas en el JSON de salida del advisor para que queden explícitas.

