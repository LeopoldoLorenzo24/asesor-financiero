# Documentación Técnica - CEDEAR Advisor v3

## 1. Visión General

CEDEAR Advisor es un motor de inversión full-stack para Certificados de Depósito Argentinos (CEDEARs). Opera bajo la filosofía **Core/Satellite**: SPY/QQQ como core por defecto, y picks individuales solo cuando hay convicción estadística de que le ganan al mercado. El sistema exige **evidencia real** antes de permitir capital real: 90 días de track record, Sharpe ≥ 1.0, drawdown < 15%, win rate > 60% vs SPY, y 2FA activo.

### Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite, JSX inline (sin CSS framework), Lucide React 0.577.0 |
| Backend | Node.js + Express, mix JS/TS |
| Base de Datos | Turso (LibSQL/SQLite) vía `@libsql/client` |
| IA | Anthropic Claude (`@anthropic-ai/sdk`) |
| Datos de Mercado | Yahoo Finance (`yahoo-finance2`), FMP (Financial Modeling Prep), Finnhub, Stooq (fallback), BYMA |
| Charts | Recharts |
| Alertas | Telegram Bot API |
| Auth | bcrypt + JWT + TOTP (2FA) |

---

## 2. Frontend - Pantallas (19 vistas)

La navegación es una SPA con estado centralizado (`view` string en `App.jsx`). No usa React Router.

| # | ID | Archivo | Qué muestra | Qué hace |
|---|-----|---------|-------------|----------|
| 1 | `dashboard` | `DashboardView.jsx` | Patrimonio total, hero card, banner de readiness, panel de análisis IA, top picks | Ejecutar análisis mensual con IA, ver picks recomendados, input de capital |
| 2 | `ranking` | `RankingView.jsx` | Ranking de ~226 CEDEARs con score compuesto | Filtrar por sector, ordenar por score/técnico/fundamental/cambio 1M, ver detalle de ticker |
| 3 | `operaciones` | `OperationsView.jsx` | Portfolio real, reconciliación con broker, historial transaccional | Cargar CSV/Excel de broker, previsualizar diff, aplicar reconciliación, importar histórico |
| 4 | `predicciones` | `PredictionsView.jsx` | Predicciones del bot con estado de evaluación | Ver accuracy, retornos reales, exportar CSV |
| 5 | `benchmarks` | `BenchmarksView.jsx` | Comparativa portfolio vs SPY vs DCA | Ver alpha, portfolio return, SPY return, gráfico de evolución del capital |
| 6 | `backtest` | `BacktestView.jsx` | Simulación histórica Core/Satellite | Configurar meses y perfil, correr backtest, ver picks del satellite |
| 7 | `historial` | `HistoryView.jsx` | Sesiones de análisis IA pasadas | Timeline de sesiones con capital, portfolio, CCL y estrategia mensual |
| 8 | `performance` | `PerformanceView.jsx` | Métricas del bot (accuracy, retornos) | Ver accuracy 60d, mejor/peor pick, exportar capital CSV |
| 9 | `detail` | `DetailView.jsx` | Ficha técnica y fundamental de un CEDEAR | Ver indicadores técnicos (RSI, MACD, SMA, Bollinger, ATR, Estocástico) y fundamentales (P/E, PEG, EPS growth, ROE, dividend yield) |
| 10 | `paper` | `PaperTradingView.jsx` | Portfolio virtual con ejecución realista | Sincronizar con picks de IA, ver P&L, regret analysis, toggle auto-sync |
| 11 | `trackrecord` | `TrackRecordView.jsx` | Evidencia diaria de performance vs SPY | Ver alpha, Sharpe, max drawdown, win rate, gráficos de evolución, resumen mensual, exportar CSV |
| 12 | `trading` | `TradingSignalsView.jsx` | Señales intraday/swing | Validar trades contra reglas de riesgo, ver señales activas con entry/stop/take-profit |
| 13 | `risk` | `RiskMetricsView.jsx` | Métricas cuantitativas del portfolio | Ver max drawdown, Sharpe, Sortino, beta, VaR 95%, volatilidad anual |
| 14 | `adherence` | `AdherenceView.jsx` | Tasa de ejecución de recomendaciones | Donut chart de estados (ejecutadas, parciales, desviadas, pendientes), desvío promedio |
| 15 | `health` | `SystemHealthView.jsx` | Estado operativo del sistema | Ver uptime, memoria, CEDEARs cargados, presupuesto IA, proveedores de mercado, alertas recientes, feature flags, self checks |
| 16 | `evolution` | `PortfolioEvolutionView.jsx` | Evolución del capital en el tiempo | Ver serie temporal de capital, valor de portfolio y SPY |
| 17 | `readiness` | `InvestmentReadinessView.jsx` | Gobernanza de despliegue y habilitación de capital real | Ver score con gauge circular, políticas seleccionables, gestión de 2FA, reglas de readiness, stress tests, circuit breakers macro |
| 18 | `monitor` | `IntradayMonitorView.jsx` | Monitoreo intradía del mercado abierto | Activar/detener monitor, snapshot manual, ver estado del mercado, último snapshot por ticker, eventos recientes, timeline de snapshots, sesiones del monitor |
| 19 | N/A | `WelcomeView.jsx` | Pantalla de bienvenida (aparece en dashboard cuando no hay datos) | Quick actions a otras secciones, tips del sistema |

### Componentes Reutilizables Principales

| Componente | Archivo | Descripción |
|-----------|---------|-------------|
| `GlassCard` | `common.jsx` | Card glassmorphism con hover effects, glow opcional, línea de acento |
| `MetricCard` | `common.jsx` | Big number + label + icono + animated count-up + trend badge |
| `SectionHeader` | `common.jsx` | Título con barra de acento verde/cyan, subtítulo opcional, action slot |
| `StatusMsg` | `common.jsx` | Banner con icono y color según tipo (success/error/warning/info) |
| `BlockerList` | `common.jsx` | Lista visual de blockers con AlertTriangle y color por severidad |
| `PulseDot` | `common.jsx` | Punto pulsante de estado (online/offline) |
| `Skeleton` | `common.jsx` | Placeholder animado para loading states |
| `ScoreBar` | `common.jsx` | Barra de progreso con glow para scores |
| `HeatBadge` | `common.jsx` | Badge con intensidad de color según valor |
| `Sparkline` | `common.jsx` | Mini gráfico SVG de línea |
| `AnimatedNumber` | `common.jsx` | Número con animación de conteo |
| `Header` | `Header.jsx` | Top bar fija + sidebar desktop/mobile + navegación por grupos + readiness gauge |
| `CommandPalette` | `CommandPalette.jsx` | Cmd+K para buscar secciones y tickers |
| `ToastSystem` | `ToastSystem.jsx` | Stack de toasts con auto-dismiss |
| `Onboarding` | `Onboarding.jsx` | Tour de 8 pasos para nuevos usuarios |
| `LoginScreen` | `LoginScreen.jsx` | Login/register con 2FA, feature carousel |
| `Tooltip` | `Tooltip.jsx` | Tooltip posicionable con flecha |
| `CapitalChart` | `CapitalChart.jsx` | Gráfico de área con Recharts (lazy loaded) |

---

## 3. Backend - Arquitectura y Módulos

### Entry Point

**`server/index.js`**
- Express app con helmet, cors, rate limiting, JSON body parser
- Monta todas las rutas bajo `/api/`
- Inicializa base de datos (`initDb()`)
- Inicia jobs programados (`jobs.js`)
- Sirve el build estático del frontend en producción
- Health endpoint

### Rutas (Routes)

| Archivo | Endpoints | Qué hace |
|---------|-----------|----------|
| `routes/auth.js` | POST /api/auth/* | Login, register, logout, 2FA (enable/disable/status), JWT refresh |
| `routes/market.js` | GET /api/market/* | Ranking de CEDEARs, precios, CCL, detalle de ticker, quotes |
| `routes/ai.js` | POST /api/ai/analyze, GET /api/ai/analyze/:ticker, GET /api/ai/usage | Análisis mensual con Claude (budget check, riesgo país, broker costs), análisis individual, reporte de uso IA |
| `routes/portfolio.js` | GET/POST /api/portfolio/* | CRUD de posiciones, resumen, export CSV |
| `routes/predictions.js` | GET /api/predictions | Listar predicciones, evaluar vs precio actual |
| `routes/capital.js` | GET/POST /api/capital | Historial de capital, log de capital actual |
| `routes/system.js` | GET /api/system/health, GET/POST /api/system/broker-settings | Health check completo con riesgo país; configuración de broker preferido |
| `routes/virtual.js` | GET/POST /api/virtual/* | Paper trading: portfolio virtual, transacciones virtuales, sync con IA, reset, config auto-sync |
| `routes/trading.js` | GET/POST /api/trading/* | Señales de trading, validar trade vs reglas de riesgo |
| `routes/export.js` | GET /api/export/* | Exportar portfolio, transacciones, predicciones, capital history, track record a CSV |
| `routes/charts.js` | GET /api/charts/* | Datos para gráficos (capital history, portfolio evolution) |
| `routes/postmortem.js` | GET/POST /api/postmortem | Análisis post-mes del bot (accuracy, lecciones aprendidas) |

### Módulos de Negocio (en `server/`)

| Archivo | Descripción |
|---------|-------------|
| `database.ts` | Cliente Turso, schema inicial, sistema de migraciones (15 migraciones), todas las operaciones CRUD |
| `aiAdvisor.js` | Integración con Anthropic Claude. Construye prompt con contexto de mercado, cartera, scoring. Procesa respuesta, valida JSON, guarda sesión y predicciones |
| `marketKnowledge.js` | Calendario de earnings, eventos macro, feriados. No es un scraper activo, es conocimiento base embebido |
| `marketFMP.js` | Cliente Financial Modeling Prep para fundamentals de alta calidad (P/E, EPS growth, ROE, deuda). 250 req/día free tier |
| `marketFallback.js` | Fallback a Stooq y Finnhub cuando Yahoo falla. Normaliza quotes de múltiples fuentes |
| `marketFinnhub.js` | Cliente Finnhub para quotes en tiempo real y fundamentales |
| `backtest.js` | Motor de backtesting Core/Satellite. Simula cartera virtual sobre datos históricos con costos reales. Calcula retorno vs SPY benchmark |
| `benchmarks.js` | Calcula comparativas: portfolio real vs SPY DCA, alpha ARS, virtual return |
| `performance.js` | Calcula métricas de performance del bot: accuracy, retorno promedio, mejor/peor pick, SPY benchmark con dividendos reales (API) |
| `investmentCycle.js` | Determina fase del ciclo de inversión según datos de mercado (alcista/bajista/lateral) |
| `diversifier.js` | Calcula exposición por sector y país, sugiere rebalanceo |
| `brokerImport.js` | Parsea CSV/Excel de brokers (Bull Market, genérico). Normaliza tickers, calcula diff, aplica sobre portfolio. Auditoría completa |
| `intradayMonitor.js` | Motor de monitoreo intradía. Corre en intervalos durante horario de mercado. Guarda snapshots de precios, CCL, VIX, portfolio, eventos |
| `governancePolicies.js` | Motor de políticas de gobernanza. Define overlays (conservative, moderate, aggressive) y modos de despliegue. Valida cambios de política |
| `selfCheck.js` | Validaciones de salud del sistema: DB, providers, rate limits, consistencia de datos |
| `alerting.js` | Sistema de alertas. Integra con Telegram y webhooks. Alertas críticas/warning/info. Cooldown para evitar spam |
| `telegramBot.ts` | Bot de Telegram: alertas take-profit/stop-loss, seguimiento de posiciones, oportunidades emergentes, resumen semanal |
| `executionSimulator.ts` | Simulador de ejecución realista con slippage basado en liquidez real, partial fills, costos de broker por operador |
| `brokerCosts.js` | Catálogo de costos por broker argentino (Bull Market, PPI, IOL, etc.) con comisiones, derechos de mercado, IVA |
| `liquidityProfile.ts` | Perfil de liquidez por CEDEAR usando volúmenes reales de Yahoo Finance |
| `corporateActions.js` | Escaneo de dividendos y splits corporativos, cálculo de dividendos virtuales |
| `riskManager.ts` | Sanitización de picks con límites de riesgo: concentración, correlación, circuit breakers |
| `investmentReadiness.ts` | Motor de readiness con escalación gradual: paper_only → pilot → cautious → scaled → full |
| `investmentAudit.ts` | Auditoría de decisiones de inversión con trazabilidad completa |
| `observability.js` | Métricas API, self-check results, instrumentación de requests |
| `aiUsage.js` | Tracking de uso de Claude: tokens, costo estimado, latency |
| `cedears.js` | Define el universo de ~226 CEDEARs con mapeo ticker local → subyacente, sector, ratio |
| `seed-portfolio.js` | Seed de portfolio sintético para testing |
| `featureFlags.js` | Feature flags globales (enable/disable funcionalidades) |
| `state.js` | Estado en memoria del servidor (caché de rankings, último análisis, etc.) |
| `jobs.js` | Scheduler de tareas: daily maintenance, hourly checks, intraday monitoring, smart notifications, CEDEAR ratio sync |
| `analysis.js` | Lógica de análisis técnico y fundamental para scoring de CEDEARs |
| `riskMetrics.js` | Cálculo de métricas de riesgo: Sharpe, Sortino, VaR, beta, volatilidad, max drawdown |

### Scripts CLI (`server/scripts/`)

| Script | Qué hace |
|--------|----------|
| `run-daily-maintenance.js` | Orquesta jobs diarios: actualizar precios, calcular métricas, track record, postmortem |
| `smoke.js` | Verifica que endpoints críticos respondan |
| `db-status.js` | Reporte de estado y tamaño de tablas |
| `sync-broker-snapshot.js` | Sincroniza estado actual con extracto de broker |
| `backfill-predictions.js` | Completa datos históricos de predicciones |
| `check-xom.js` / `sell-xom-10.js` | Scripts específicos de mantenimiento |

---

## 4. Base de Datos - Schema Completo

### Tablas Core

| Tabla | Propósito |
|-------|-----------|
| `portfolio` | Posiciones actuales de la cartera real (ticker, shares, avg_price_ars, date_bought) |
| `transactions` | Historial de operaciones (BUY/SELL, shares, price_ars, price_usd, ccl_rate, total_ars, date_executed) |
| `predictions` | Predicciones del bot/IA (ticker, action, confidence, target_pct, stop_loss_pct, horizon, evaluated, actual_change_pct, prediction_correct) |
| `analysis_sessions` | Sesiones de análisis IA (capital_ars, portfolio_value_ars, ccl_rate, market_summary, strategy_monthly, risks, full_response) |
| `capital_history` | Serie temporal de capital (capital_available_ars, portfolio_value_ars, total_value_ars, ccl_rate, monthly_deposit) |
| `users` | Usuarios (email, password_hash, salt, totp_secret) |
| `track_record` | Registro diario (date, virtual_value_ars, real_value_ars, spy_value_ars, capital_ars, ccl_rate, virtual_dividends_ars, virtual_total_ars, alpha_vs_spy_pct, drawdown_from_peak_pct, daily_return_pct, spy_daily_return_pct, rolling_sharpe) |
| `track_record_monthly` | Agregación mensual (month, virtual_return_pct, real_return_pct, spy_return_pct, alpha_pct, max_drawdown_pct, sharpe_ratio, win_rate_pct) |
| `virtual_portfolio` | Posiciones de paper trading (ticker, shares, avg_price_ars) |
| `virtual_transactions` | Operaciones de paper trading (ticker, type, shares, requested_shares, executed_shares, slippage_pct, broker_costs_ars, total_cost_ars, partial_fill) |
| `corporate_actions` | Dividendos, splits, cambios de ratio (ticker, action_date, type, amount, ratio_from, ratio_to) |
| `monthly_postmortems` | Análisis post-mes del bot (month_label, accuracy_pct, total_return_pct, spy_return_pct, beat_spy, lessons_learned, self_imposed_rules) |
| `ai_usage_logs` | Tracking de uso de Claude (route, model, tokens, cost_usd, latency_ms, success) |
| `adherence_log` | Registro de adherencia a recomendaciones (session_id, plan_step, ticker, cantidad_plan, cantidad_ejecutada, estado, discrepancy_pct) |
| `ml_training_data` | Dataset para ML (ticker, date, rsi, macd_hist, sma20_dist, perf_1m, perf_3m, sector, pe, eps_growth, beta, vix, label_1m, label_3m) |

### Tablas de Gobernanza

| Tabla | Propósito |
|-------|-----------|
| `governance_policy_settings` | Política activa del usuario (overlay_key, deployment_mode, reason) |
| `governance_policy_audit_logs` | Auditoría de cambios de política (previous/next overlay y mode, reason, impact_preview) |

### Tablas de Importación y Auditoría

| Tabla | Propósito |
|-------|-----------|
| `broker_import_audit_logs` | Log de imports de broker (broker_key, source_name, snapshot_date, input_hash, raw_input, applied, applied_transaction_count) |
| `decision_audit_logs` | Auditoría de decisiones de IA (route, profile, capital_ars, tickers_considered, raw_output, normalized_output, consistency_notes, schema_errors) |

### Tablas de Monitoreo Intradía

| Tabla | Propósito |
|-------|-----------|
| `intraday_monitor_settings` | Config del monitor (enabled, interval_minutes, market_open_local, market_close_local, timezone) |
| `intraday_monitor_sessions` | Sesiones de monitor (started_at, stopped_at, status, started_by, stop_reason, interval_minutes, market_window) |
| `intraday_monitor_snapshots` | Snapshots de mercado (snapshot_at, market_state, ccl_rate, vix_value, spy_price_usd, portfolio_value_ars, capital_available_ars, total_value_ars, event_count) |
| `intraday_monitor_ticker_snapshots` | Snapshot por ticker (shares, avg_cost_ars, price_ars, day_change_pct, pnl_pct, value_ars, position_weight_pct, stop_loss_breach, take_profit_breach) |
| `intraday_monitor_events` | Eventos detectados (event_type, severity, ticker, message, event_key) |

### Tablas de Configuración

| Tabla | Propósito |
|-------|-----------|
| `paper_trading_config` | Config de paper trading (auto_sync_enabled) |
| `rate_limit_entries` | Rate limiting por IP (window_start_ms, count) |
| `broker_preference_settings` | Broker preferido del usuario para cálculos de costos (broker_key, updated_at) |
| `cedear_ratios` | Ratios dinámicos calculados por el sistema (ticker, ratio, source, confidence, price_ars, price_usd, ccl_rate) |

---

## 5. Gobernanza y Readiness

El sistema tiene un motor de **governance** que decide si se permite operar con capital real.

### Reglas de Readiness (deben pasar todas)

1. **Predicciones evaluadas**: ≥ 50 picks evaluados para edge estadístico
2. **Track record**: ≥ 90 días de operación consistente
3. **Portfolio virtual vs benchmark**: debe superar al benchmark por > 3%
4. **Max drawdown**: < 15%
5. **Sharpe ratio**: ≥ 1.0
6. **Alpha vs SPY DCA**: positivo
7. **Stress tests**: todos superados
8. **Costos ida+vuelta**: < 3.09% para $100k ARS
9. **2FA**: requerido y activo
10. **Cobertura de auditoría**: ≥ 90%
11. **Adherencia ejecutable**: ≥ 10/10
12. **Resolución de recomendaciones**: ≥ 80%

### Overlays (Políticas de Capital)

| Overlay | Descripción | Max Capital |
|---------|-------------|-------------|
| `system_default` | Automático según evidencia | Variable |
| `paper_only` | Solo paper trading | 0% |
| `pilot` | Capital mínimo de prueba | 10% |
| `cautious` | Capital bajo con restricciones | 25% |
| `scaled` | Capital moderado | 50% |
| `full` | Capital completo | 100% |

### Modos de Despliegue

- `system_auto`: El sistema decide automáticamente según readiness
- `manual`: El usuario decide pero debe justificar
- `locked`: Congelado por circuit breaker o crisis

### Circuit Breakers Macro

- **CCL Spike**: Si el CCL sube más de X% en un día, se congela
- **Brecha cambiaria**: Si la brecha supera Y%, alerta
- **VIX > 30**: Modo cauteloso
- **Crisis cambiaria**: Paper only automático

---

## 6. Flujo de Datos de Mercado

```
Solicitud de quote
       |
       v
+-------------------+
|  Yahoo Finance    |  <-- Primario
|  (yahoo-finance2) |
+---------+---------+
          | Falla?
          v
+-------------------+
|  FMP (Fin. Mod.)  |  <-- Alta calidad (fundamentals)
+---------+---------+
          | Falla?
          v
+-------------------+
|  BYMA (local)     |  <-- Para tickers argentinos
+---------+---------+
          | Falla?
          v
+-------------------+
|     Finnhub       |  <-- Fallback (API key)
+---------+---------+
          | Falla?
          v
+-------------------+
|      Stooq        |  <-- Último recurso
+-------------------+
```

### Cálculo del CCL

- Se obtiene del dólar CCL (contado con liqui) de mercado (sin hardcoded fallbacks)
- Se usa para convertir precios USD → ARS
- Se guarda en cada snapshot de análisis
- Jobs se suspenden si el CCL no está disponible (no se usan valores hardcodeados)

### Riesgo País (EMBI+ Spread)

- Se obtiene de `api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo`
- Cache de 1 hora
- Se inyecta en el prompt de IA con 4 niveles de severidad:
  - Crisis (>2000pb): se fuerza modo defensivo
  - Elevado (>1000pb): se recomienda cautela
  - Moderado-alto (>600pb): se ajustan stops
  - Contenido (<600pb): operación normal

---

## 7. Flujo de Análisis de IA

```
1. Pre-flight Checks
   - Budget check: verifica presupuesto diario de IA ($USD)
   - Self-check: valida DB, providers, rate limits, consistencia
   - Cooldown: 1 análisis por hora por usuario

2. Context Gathering
   - Cartera actual (real + virtual)
   - Ranking de CEDEARs con scores (pre-rank → full analysis por batches)
   - Datos de mercado en tiempo real (CCL, VIX, SPY, QQQ, riesgo país)
   - Métricas de riesgo actuales
   - Ciclo de inversión
   - Track record histórico
   - Predicciones pendientes de evaluación
   - Preferencia de broker del usuario

3. Prompt Engineering
   - Prompt estructurado en español
   - Instrucciones de formato JSON
   - Reglas de gobernanza inyectadas
   - Límites de riesgo
   - Contexto de riesgo país con severidad
   - Data freshness warnings (VIX/CCL stale)

4. LLM Call (Claude)
   - Modelo: configurable (default Claude 3.5 Sonnet)
   - Rate limiting: 1 análisis por hora
   - Cost tracking en ai_usage_logs con budget enforcement

5. Response Processing
   - Extrae JSON de la respuesta
   - Valida schema
   - Consistency check (no giros 180° sin justificación)
   - Budget enforcement: si los picks exceden el capital, se escalan proporcionalmente
   - Price verification: ≥50% de precios deben verificar o se marca low confidence
   - Risk sanitization: límites de concentración, correlación, circuit breakers
   - Governance check (políticas de capital, deployment mode)
   - Audit log OBLIGATORIO de toda decisión

6. Storage
   - Guarda analysis_sessions
   - Guarda predictions (una por pick recomendado)
   - Actualiza state.js
   - Auto paper trading si está habilitado

7. Delivery
   - Retorna al frontend con análisis completo
   - Muestra picks, resumen de mercado, riesgos
   - Incluye data quality warnings, investment readiness, riesgo país
```

---

## 8. Lógica de Negocio Principal

### Paper Trading Realista

- **Slippage variable**: basado en datos de liquidez reales de Yahoo Finance (volumen diario, spread estimado, impacto de mercado)
- **Costos de broker reales**: catálogo de comisiones por broker argentino (Bull Market, PPI, IOL, Balanz, etc.) con IVA, derechos de mercado y comisión
- **Broker seleccionable**: el usuario elige su broker real y el sistema usa sus costos específicos
- **Lotes mínimos BYMA**: no se pueden comprar fracciones menores al lote
- **Partial fills**: basado en ratio trade/volumen diario real del ticker
- **Dividendos netos**: incluye dividendos con withholding tax
- **Auto-sync**: opción para sincronizar automáticamente con cada análisis de IA
- **Delay simulado**: 5-25 min en horario de mercado, 60-180 min fuera de horario

### Reconciliación con Broker

1. Usuario carga CSV/Excel del broker
2. Sistema parsea y normaliza tickers
3. Calcula diff entre cartera local y broker
4. Muestra preview con acciones propuestas (comprar/vender)
5. Usuario aplica reconciliación → se generan transacciones auditables

### Track Record Diario

Cada día se guarda:
- Valor virtual (paper trading)
- Valor real (portfolio real)
- Valor SPY (benchmark)
- Alpha vs SPY
- Drawdown desde pico
- Sharpe ratio rolling
- CCL

### Backtesting

- Estrategia Core/Satellite simulada sobre datos históricos
- Perfiles: conservative (SPY default), moderate (50/50), aggressive (QQQ core)
- Incluye costos de transacción
- Benchmark vs SPY buy-and-hold

### Sistema de Adherencia

- Compara recomendaciones del bot vs operaciones reales del usuario
- Estados: ejecutada, parcial, desviada, pendiente
- Calcula discrepancia porcentual
- Tasa de adherencia global

---

## 9. Testing

| Archivo | Qué testea |
|---------|-----------|
| `tests/api.test.js` | Endpoints principales |
| `tests/integration/api.test.js` | Flujos de integración |
| `tests/integration/intraday-monitor.test.js` | Monitoreo intradía |
| `tests/integration/portfolio-reconciliation.test.js` | Reconciliación con broker |
| `tests/brokerImport.test.js` | Importación de CSV/Excel |
| `tests/governancePolicies.test.js` | Motor de políticas |
| `tests/riskManager.test.js` | Métricas de riesgo |
| `tests/self-check.test.js` | Checks de salud |
| `tests/consistency.test.js` | Consistencia de datos |
| `tests/json-extract.test.js` | Extracción de JSON de respuestas IA |
| `tests/new-functions.test.js` | Nuevas funcionalidades |
| `tests/analysis.test.js` | Lógica de análisis |
| `tests/analyze-integration.test.js` | Integración de análisis IA |

---

## 10. Deployment e Infraestructura

### Variables de Entorno Requeridas

```
# Base de datos
TURSO_URL=libsql://...
TURSO_AUTH_TOKEN=...

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Datos de mercado
FINNHUB_API_KEY=...
FMP_API_KEY=...          # Financial Modeling Prep (fundamentals de alta calidad, 250 req/día free)

# Alertas
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# Seguridad
JWT_SECRET=...

# Feature flags
ENABLE_AI_ANALYSIS=true
ENABLE_PAPER_TRADING=true
ENABLE_INTRADAY_MONITOR=true
ENABLE_2FA=true
ENABLE_TELEGRAM_ALERTS=true   # Smart notifications por Telegram

# Seed
ENABLE_BOOTSTRAP_SEED=false
ENABLE_SYNTHETIC_HISTORY_SEED=false

# Presupuesto IA (opcional)
AI_DAILY_BUDGET_USD=1.00      # Límite diario de gasto en API Claude
```

### Build y Deploy

1. **Instalación**: `npm run install:all` (instala server + client)
2. **Build**: `npm run build` (compila frontend con Vite)
3. **Start**: `npm start` (inicia servidor Node.js)
4. **Dev**: `npm run dev:server` + `npm run dev:client`

### Render (Producción Actual)

- **Web Service**: Node.js en port 10000
- **Build Command**: `npm run build`
- **Start Command**: `npm start`
- **Base de datos**: Turso (SQLite distribuido)
- **Frontend**: Build estático servido por Express desde `client/dist/`

---

## 11. Notificaciones Inteligentes por Telegram

El sistema envía alertas de inversión accionables (no spam) por Telegram:

### Tipos de Notificación

| Tipo | Frecuencia | Qué notifica |
|------|-----------|-------------|
| **Stop-Loss** | Cada 4 horas | Pick que cayó por debajo de su stop-loss |
| **Take-Profit** | Cada 4 horas | Pick que alcanzó su target de ganancia |
| **Portfolio Tracking** | 3x/día | Posiciones con movimientos significativos (>3%), cerca del target o del stop |
| **Movimientos Significativos** | 6x/día | Posición que se movió >5% en un día |
| **Oportunidades Emergentes** | 1x/día | CEDEARs no en cartera con score alto + señales técnicas (RSI oversold, MACD girando, caída en activo de calidad) |
| **Resumen Semanal** | Semanal | Portfolio value, rendimiento semanal vs SPY, alpha, mejor/peor posición |
| **Falla de Jobs** | On failure | Job del sistema que falló 3+ veces consecutivas |
| **Drawdown** | On trigger | Drawdown del portfolio supera umbral |

### Diseño Anti-Spam

- Cooldown configurable por tipo de alerta (default 15 min)
- Solo se envían alertas accionables (posiciones relevantes, no genéricas)
- Portfolio tracking solo incluye posiciones "notables" (movimiento >3%, cerca de target/stop)
- Oportunidades emergentes filtradas: solo score >65 + razón técnica específica, máximo 5 por día

---

## 12. Jobs Programados y Monitoreo

### Ciclo de Maintenance

| Job | Frecuencia | Descripción |
|-----|-----------|-------------|
| `ratioSync` | Cada 12h | Sincroniza ratios de CEDEAR calculados vs hardcoded, snapping a ratios conocidos |
| `autoEvaluation` | Cada 6h | Evalúa predicciones pendientes contra precios actuales |
| `stopLossCheck` | Cada 4h | Verifica stop-loss de picks activos |
| `takeProfitCheck` | Cada 4h | Verifica take-profit de picks activos |
| `dailyCapitalLog` | Cada 24h | Guarda snapshot de valor del portfolio |
| `trackRecordLog` | Cada 24h | Guarda registro diario con alpha, drawdown, Sharpe rolling |
| `monthlyPostMortem` | Cada 24h | Genera análisis post-mortem mensual con Claude |
| `mlPipeline` | Cada 24h | Recolecta datos para ML (features técnicos y fundamentales) |
| `portfolioTracking` | Cada 8h | Envía notificación Telegram de posiciones notables |
| `significantMoves` | Cada 4h | Detecta movimientos >5% en posiciones del portfolio |
| `emergingOpps` | Cada 24h | Escanea oportunidades emergentes fuera de la cartera |
| `ticketExpiry` | Cada 1h | Auto-expira tickets de trade pasados su `expires_at` |
| `preflight` | Cada 15min | Chequeo de salud pre-operación (ratios + auditoría) |

### Tracking de Fallos

- Cada job está envuelto en `trackJobRun()` que cuenta fallos consecutivos
- A las 3 fallos consecutivos, se envía alerta por Telegram y webhook
- Los contadores se resetean al primer éxito

---

## 13. Proveedores de Datos de Mercado

| Proveedor | Datos | Límites | Fallback |
|-----------|-------|---------|----------|
| **Yahoo Finance** | Quotes, historiales, fundamentals | Sin API key, rate limited | BYMA → Finnhub → Stooq |
| **FMP** | P/E, EPS growth, ROE, deuda, revenue, dividend yield | 250 req/día (free) | Yahoo fundamentals |
| **BYMA** | Precios ARS en pesos, volumen local | Scraping, inestable | Yahoo via CCL |
| **Finnhub** | Quotes en tiempo real, fundamentals básicos | API key requerida | Stooq |
| **Stooq** | Historiales CSV | Sin auth, último recurso | null |
| **Argentina Datos** | Riesgo país (EMBI+), CCL | Sin auth, cache 1h | File cache → null |

### Calidad de Datos

- Timestamps `_fetchedAt` en VIX y CCL para detectar datos stale
- VIX >2h old se marca como stale y se advierte en el análisis
- CCL null causa que jobs se suspendan (no se usan fallbacks hardcodeados)
- Price verification: si <50% de precios verifican, se marca el análisis como low confidence

---

## 14. CEDEAR Ratio Sync

Los ratios de conversión (cuántos CEDEARs = 1 acción subyacente) se mantienen de dos formas:

1. **Hardcoded** en `cedears.js`: ratio estático por CEDEAR
2. **Dinámico** calculado por `runRatioSync()`: compara precio BYMA ARS vs precio USD × CCL

El sistema usa el ratio dinámico si está disponible y tiene confidence alta. Snapping automático a ratios conocidos de BYMA para evitar drift de punto flotante. Warnings si el ratio calculado difiere >15% del snap.

---

## 15. Execution Assistant (Trade Tickets)

Sistema de asistente de ejecución que convierte las recomendaciones del análisis de IA en tickets de trade accionables con confirmación obligatoria.

### Modos de Sugerencia

| Modo | Descripción | Alertas proactivas |
|------|-------------|-------------------|
| `manual_only` | Solo genera tickets cuando el usuario corre un análisis | No |
| `critical_alerts` | Además puede enviar alertas para tickets críticos (alta convicción/riesgo) | Sí |

### Ciclo de Vida de un Ticket

```
Análisis AI → plan_ejecucion → buildTradeTicketsFromAnalysis()
  → pending_confirmation → confirmed → executed_manual
                        → rejected (manual o auto-expirado)
```

- **pending_confirmation**: Ticket creado, esperando acción del usuario
- **confirmed**: Usuario confirmó que quiere ejecutar la operación
- **rejected**: Usuario rechazó o el sistema auto-expiró el ticket
- **executed_manual**: Usuario marcó como ejecutada manualmente en su broker

### Clasificación de Prioridad

Un ticket se marca como **critical** si cumple:
- **BUY**: conviction ≥ 85%, target ≥ 10%, shares > 0, preflight no bloqueado
- **SELL**: rationale contiene palabras clave de riesgo (stop, riesgo, reducir, salir)

### Auto-Expiración de Tickets

Los tickets tienen un `expires_at` (24h para BUY, 8h para SELL). El job `runTicketExpiryCheck()` corre cada hora y marca como `rejected` los tickets expirados con nota "[Auto-expirado]".

### Preflight Health Check

Antes de operar, el sistema puede correr un chequeo preflight (`preflightHealth.ts`):
1. Verifica sincronización de ratios de CEDEARs
2. Corre auditoría de inversión (investment audit)
3. Si falla, bloquea nuevos trades hasta resolución

El preflight corre cada 15 minutos cuando `ENABLE_PREMARKET_PREFLIGHT=true`.

### Archivos Clave

| Archivo | Responsabilidad |
|---------|----------------|
| `server/executionAssistant.ts` | Lógica de construcción de tickets y payload |
| `server/routes/execution.js` | API REST: listar, confirmar, rechazar, marcar ejecutado |
| `server/preflightHealth.ts` | Chequeo de salud pre-operación |
| `server/routes/ai.js` (L231-285) | Creación de tickets post-análisis |
| `client/src/views/DashboardView.jsx` | UI de tickets en dashboard |
| `client/src/views/InvestmentReadinessView.jsx` | Configuración de modo de sugerencia |
| `client/src/api.js` | Funciones API del cliente |

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/system/execution-assistant` | Settings + tickets abiertos |
| POST | `/api/system/execution-assistant` | Guardar preferencia de modo |
| GET | `/api/execution-tickets` | Listar tickets (filtro por status) |
| POST | `/api/execution-tickets/:id/confirm` | Confirmar ticket |
| POST | `/api/execution-tickets/:id/reject` | Rechazar ticket |
| POST | `/api/execution-tickets/:id/executed` | Marcar como ejecutado |

---

## Referencia Rápida de Archivos Clave

| Concepto | Archivo(s) |
|----------|-----------|
| App React | `client/src/App.jsx` |
| API Client | `client/src/api.js` |
| Tema UI | `client/src/theme.js` |
| Componentes comunes | `client/src/components/common.jsx` |
| Header + Sidebar | `client/src/components/Header.jsx` |
| Servidor Express | `server/index.js` |
| Base de datos | `server/database.ts` |
| IA / Claude | `server/aiAdvisor.js` |
| Datos de mercado | `server/marketData.ts`, `server/marketFMP.js`, `server/marketFallback.js` |
| Gobernanza | `server/governancePolicies.js`, `server/investmentReadiness.ts` |
| Alertas / Telegram | `server/alerting.js`, `server/telegramBot.ts` |
| Riesgo | `server/riskMetrics.js`, `server/riskManager.ts` |
| Paper Trading | `server/routes/virtual.js`, `server/executionSimulator.ts` |
| Costos de Broker | `server/brokerCosts.js` |
| Backtest | `server/backtest.js` |
| Importación Broker | `server/brokerImport.js` |
| Monitoreo Intradía | `server/intradayMonitor.js` |
| CEDEARs | `server/cedears.js` |
| Performance / SPY | `server/performance.js` |
| Jobs | `server/jobs.js` |
| Feature Flags | `server/featureFlags.js` |
| Execution Assistant | `server/executionAssistant.ts`, `server/routes/execution.js` |
| Preflight Health | `server/preflightHealth.ts`, `server/preflightPolicy.ts` |
| Trade Safety | `server/tradeSafety.ts`, `server/executionGuardrails.ts` |
| Investment Audit | `server/investmentAudit.ts` |
