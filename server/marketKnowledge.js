// ============================================================
// MARKET KNOWLEDGE BASE
// Static financial knowledge: historical events, sector patterns,
// and pre-loaded rules from market history (2022-2026).
// Injected into every analysis prompt so the bot starts with experience.
// ============================================================

export function getMarketKnowledge() {
  return `
════════════════════════════════════════════════════════
BASE DE CONOCIMIENTO FINANCIERO — HISTORIA Y PATRONES
(Tratá este conocimiento como tuyo propio. Fue vivido.)
════════════════════════════════════════════════════════

EVENTOS HISTÓRICOS CLAVE (2022-2026):

[2022 — BEAR MARKET POR TASAS]
FED subió de 0.25% → 4.50%. S&P 500 -19.44% (peor desde 2008). Nasdaq -33%.
Energía fue el ÚNICO sector positivo (+59%) por guerra Rusia-Ucrania.
Tech sin ganancias (P/E negativo) fue lo primero en caer.
LECCIÓN: Cuando las tasas suben agresivo → rotar tech a energía/defensivos.

[2023 — RECUPERACIÓN LIDERADA POR AI]
S&P 500 +24.23%. Los "Magnificent 7" (AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA)
generaron 2/3 del retorno total. NVDA +239% por boom AI/datacenter.
LECCIÓN: En recuperaciones post-bear, tech de calidad lidera.
LECCIÓN: Si pocos stocks suben mucho y el resto no → rally frágil.

[2024 — RALLY + ELECCIONES TRUMP]
S&P 500 +23.31%. FED empezó a bajar tasas en septiembre (-100bps total).
Agosto: mini-crash por carry trade unwind de Japón (S&P -8% en días).
Noviembre: Victoria Trump → "Trump trade" → dólar fuerte, mercados emergentes cayeron.
LECCIÓN: Recortes de tasas tardan 3-6 meses en impactar el mercado.
LECCIÓN: Eventos en Japón/China pueden causar shocks en EEUU.
LECCIÓN: Posicionarse ANTES de las elecciones, no durante.

[2025 — TARIFAS, CRASH Y RECUPERACIÓN]
2 de Abril ("Liberation Day"): Trump anunció tarifas agresivas globales.
S&P 500 cayó -12% en 4 días. VIX llegó a 60.13 el 7 de abril (pánico extremo).
9 de Abril: Trump pausó las tarifas 90 días → S&P +9.5% en UN DÍA.
Mayo: S&P recuperó TODO. Junio 27: nuevo máximo histórico.
S&P 500 cerró 2025 +16.39% a pesar del caos.
Febrero 2026: Corte Suprema declaró ilegales las tarifas IEEPA.
LECCIÓN CRÍTICA: Las caídas por eventos políticos se recuperan en 1-3 meses. NO VENDER EN PÁNICO.
LECCIÓN: Liberation Day fue oportunidad de compra perfecta con efectivo disponible.
LECCIÓN: Defensivos y oro subieron durante el pánico → siempre tener 15-20% de cobertura.

[ORO 2022-2026]
2022: ~$1,700/oz → 2026: ~$3,000+ (>75% de suba). Bancos centrales: récord de compras.
NEM, AEM, GLD, GDX son proxies para exposición a oro via CEDEARs.
LECCIÓN: Oro es la mejor cobertura contra incertidumbre geopolítica y dólar débil.

[CRYPTO 2024-2025]
Bitcoin llegó a ~$125,000 en oct 2025 después de caer con Liberation Day.
IBIT (ETF Bitcoin) y COIN disponibles como CEDEARs.
LECCIÓN: Crypto sigue correlacionado con risk assets en crisis — NO es safe haven.
LECCIÓN: En pánico, crypto cae igual o más que tech. IBIT es menos volátil que COIN.

────────────────────────────────────────────────────────
PATRONES SECTORIALES RECURRENTES:

TASAS SUBIENDO (FED hawkish):
→ BAJA: Tech growth, Consumer Cyclical, Real Estate
→ SUBE: Energía, Financieros (bancos), Consumer Defensive
→ ACCIÓN: Rotar de tech a value/defensivos

TASAS BAJANDO (FED dovish):
→ SUBE: Tech, Consumer Cyclical, Small caps
→ BAJA/LATERAL: Energía, Utilities
→ ACCIÓN: Aumentar tech de calidad y growth

INCERTIDUMBRE GEOPOLÍTICA (guerras, tarifas, crisis):
→ SUBE: Oro (GLD, NEM, AEM), Utilities, Defensivos (KO, PG, JNJ), Salud (UNH)
→ BAJA: Todo lo demás, especialmente EM tech de alto P/E
→ ACCIÓN: Aumentar cobertura, reducir growth agresivo

MERCADO EN MÁXIMOS HISTÓRICOS:
→ RSI > 70 en índices = sobrecompra, cuidado
→ Si breadth es bajo (pocos stocks lideran) → rally frágil
→ ACCIÓN: Mantener posiciones, ajustar stops, NO comprar agresivo

ESTACIONALIDAD (patrones históricos):
→ Enero: define tendencia del año
→ Abril/Octubre: temporada de earnings, alta volatilidad
→ Mayo-Octubre: históricamente rinden menos ("Sell in May")
→ Diciembre: mejor mes histórico (+1.3% promedio desde 1928)
→ NO comprar un CEDEAR 2 semanas antes de su reporte de earnings

DÓLAR vs CEDEARs:
→ El rendimiento REAL es en USD, no en ARS
→ CCL subiendo → CEDEARs suben en ARS aunque la acción no se mueva en USD
→ Si el CCL cae, los CEDEARs bajan en ARS aunque la acción esté igual

────────────────────────────────────────────────────────
REGLAS APRENDIDAS DE LA HISTORIA (OBLIGATORIAS):

1. NUNCA vender en pánico después de caída por evento político. Se recupera en 1-3 meses.
2. VIX > 30 → comprar defensivos y oro, NO vender.
3. VIX > 45 → oportunidad de compra agresiva (ocurre 1-2 veces por año máximo).
4. Empresas con P/E > 50 sin crecimiento de EPS son las primeras en caer en correcciones.
5. CEDEARs con moat (KO, MSFT, V, JNJ, COST) se recuperan más rápido que el promedio.
6. Energía y oro se mueven en dirección opuesta a tech. Tener ambos reduce volatilidad.
7. Cuando TODOS los analistas son bullish → ser cauteloso. Cuando todos son bearish → buscar oportunidades.
8. Recortes de FED tardan 3-6 meses en impactar positivamente.
9. Si SPY cae > 10% desde máximos → aumentar posición en SPY (siempre se recuperó en 6-12 meses históricos).
10. Siempre tener 15-20% del portfolio en cobertura (oro, defensivos, cash) para aprovechar las caídas.
════════════════════════════════════════════════════════
`;
}
