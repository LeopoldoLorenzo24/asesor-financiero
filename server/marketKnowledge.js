// ============================================================
// MARKET KNOWLEDGE BASE
// Principios durables de mercado para complementar el análisis
// en tiempo real sin inyectar cronologías rígidas ni "recuerdos"
// que puedan envejecer mal.
// ============================================================

export function getMarketKnowledge() {
  return `
════════════════════════════════════════════════════════
PRINCIPIOS DE MERCADO Y GESTIÓN DE RIESGO
════════════════════════════════════════════════════════

Usá esta sección como marco de decisión, no como fuente de hechos recientes.
Los hechos recientes deben venir de web search y de los datos de mercado actuales.

PRINCIPIOS ESTRUCTURALES:

1. CORE ANTES QUE SATELLITE
- Si los picks activos no muestran ventaja clara y verificable vs SPY/QQQ, el capital debe quedarse en core indexado.
- El stock picking mediocre destruye alpha más rápido de lo que parece, sobre todo después de comisiones, slippage y errores de timing.

2. NO CONFUNDIR RETORNO EN ARS CON EDGE REAL
- Un CEDEAR puede subir en ARS solo por CCL.
- El rendimiento económico real debe evaluarse también en USD o contra benchmark equivalente.

3. MOMENTUM SIRVE, PERO NO SOLO
- Precio sobre medias, volumen creciente y fuerza relativa ayudan.
- Sin soporte fundamental o sin catalizador, el momentum aislado se revierte fácil.

4. EN CORRECCIONES, PRIORIZAR LIQUIDEZ Y CALIDAD
- Cuando sube la volatilidad, las posiciones de menor liquidez y mayor múltiplo suelen sufrir más.
- En estrés, es preferible concentrar el riesgo en nombres más líquidos o directamente en ETFs.

5. SOBRECONCENTRACIÓN ES RIESGO DISFRAZADO DE CONVICCIÓN
- Tener demasiada cartera en un solo sector o en una sola narrativa suele mejorar resultados solo hasta que deja de funcionar.
- La diversificación no existe para maximizar el mejor escenario; existe para sobrevivir escenarios malos.

6. EVENTOS BINARIOS EXIGEN DISCIPLINA
- Earnings, decisiones regulatorias, litigios, fusiones y cambios macro pueden invalidar una tesis en horas.
- No sobreasignar capital a posiciones con evento binario próximo si el edge depende de acertar ese evento.

7. ALPHA REAL SE MIDE CONTRA BENCHMARK Y COSTOS
- Una estrategia que no supera a SPY/QQQ por margen suficiente no merece complejidad adicional.
- El benchmark correcto no es "gané plata", sino "gané más y mejor ajustado por riesgo que el core".

8. DEFENSIVOS Y COBERTURAS TIENEN FUNCIÓN, NO SOLO RETORNO
- Oro, salud, consumo defensivo, cash y ETFs amplios sirven para reducir fragilidad de cartera.
- No siempre son la mejor apuesta de retorno, pero sí la mejor herramienta para evitar errores grandes.

9. CUANDO LA EVIDENCIA SE DEGRADA, BAJAR RIESGO
- Si cae el Sharpe, sube el drawdown, empeora el alpha o el régimen de mercado cambia, el sistema debe volverse más conservador automáticamente.

10. SI EL DATO NO ESTÁ, NO SE INVENTA
- Fechas, múltiplos, ratios, precios objetivo y eventos deben salir de datos actuales o quedar como "N/A".
- La honestidad del sistema vale más que una recomendación forzada.

PATRONES ÚTILES POR RÉGIMEN:

- Tasas al alza o liquidez restrictiva:
  Tech de múltiplos altos y small caps suelen sufrir más.
  Defensivos, value, energía o cash relativo suelen mejorar.

- Tasas a la baja o expansión de múltiplos:
  Growth de calidad y semiconductores suelen capturar mejor la mejora de sentimiento.

- Volatilidad extrema:
  Priorizar balance de cartera, liquidez, stops coherentes y reducción del satellite.

- Mercado en máximos con breadth débil:
  Mantener disciplina y evitar perseguir precio en nombres sobreextendidos.

REGLAS OPERATIVAS:

- No recomendar un pick activo si no podés explicar por qué debería ganarle al core.
- No aumentar una posición ya sobreconcentrada solo porque sigue subiendo.
- No usar una narrativa macro genérica para justificar una mala señal micro.
- Si el mercado no ofrece edge claro, la respuesta correcta sigue siendo core.
════════════════════════════════════════════════════════
`;
}
