# CEDEAR ADVISOR — Motor de Inversión IA

Dashboard inteligente para analizar e invertir en CEDEARs (Certificados de Depósito Argentinos) con datos reales de mercado y análisis potenciado por Claude AI.

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                      │
│  Dashboard · Ranking · Detalle · Portfolio · Charts      │
│  Puerto: 5173 (dev) / build estático (prod)             │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP /api/*
┌──────────────────────┴──────────────────────────────────┐
│                  BACKEND (Node.js + Express)             │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ Yahoo       │  │  DolarAPI    │  │  Claude API    │ │
│  │ Finance     │  │  (CCL rate)  │  │  + Web Search  │ │
│  │ (precios,   │  │              │  │  (análisis IA) │ │
│  │  históricos,│  └──────────────┘  └────────────────┘ │
│  │  financials)│                                        │
│  └─────────────┘     Cache (node-cache, 5min TTL)       │
│                                                          │
│  Motor de Análisis:                                      │
│  · Técnico (RSI, MACD, Bollinger, SMA, EMA, ATR, Stoch)│
│  · Fundamental (P/E, PEG, EPS, Revenue, Margins, ROE)  │
│  · Sentimiento (momentum + analistas + volumen)          │
│  · Score compuesto ponderado (35/40/25)                  │
│  Puerto: 3001                                            │
└─────────────────────────────────────────────────────────┘
```

## Requisitos

- **Node.js** v18 o superior
- **API Key de Anthropic** (para el análisis IA con Claude)

## Instalación

### 1. Clonar y configurar

```bash
# Ir al directorio del proyecto
cd cedear-advisor

# Configurar el backend
cd server
cp .env.example .env
# Editá .env y poné tu ANTHROPIC_API_KEY
npm install

# Configurar el frontend
cd ../client
npm install
```

### 2. Configurar tu API Key

Editá `server/.env`:
```
ANTHROPIC_API_KEY=sk-ant-tu-api-key-aquí
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
CACHE_TTL=300
```

### 3. Ejecutar en desarrollo

Necesitás dos terminales:

**Terminal 1 - Backend:**
```bash
cd server
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd client
npm run dev
```

Abrí http://localhost:5173 en tu navegador.

## Endpoints de la API

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/ccl` | GET | Cotización del dólar CCL |
| `/api/cedears` | GET | Lista de todos los CEDEARs |
| `/api/ranking` | GET | Ranking con scores (acepta ?sector=X&limit=N) |
| `/api/cedear/:ticker` | GET | Detalle completo de un CEDEAR |
| `/api/history/:ticker` | GET | Historial de precios (?months=6) |
| `/api/sectors` | GET | Lista de sectores |
| `/api/ai/analyze` | POST | Análisis IA completo (body: {portfolio, capital}) |
| `/api/ai/analyze/:ticker` | GET | Análisis IA de un CEDEAR específico |

## Deploy a Producción

### Opción 1: Railway (Recomendado - Backend) + Vercel (Frontend)

**Backend en Railway:**
```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Desde /server
railway login
railway init
railway add --plugin postgresql  # Opcional si querés persistencia
railway variables set ANTHROPIC_API_KEY=sk-ant-xxx
railway variables set CLIENT_ORIGIN=https://tu-app.vercel.app
railway up
```

**Frontend en Vercel:**
```bash
# Instalar Vercel CLI
npm install -g vercel

# Desde /client
# Primero, crear un .env.production con la URL del backend:
echo "VITE_API_URL=https://tu-backend.railway.app" > .env.production

# Modificar api.js para usar VITE_API_URL en prod
vercel
```

### Opción 2: Todo en un VPS (DigitalOcean, Linode)

```bash
# Build del frontend
cd client && npm run build

# Mover build al backend para servir como estático
cp -r dist ../server/public

# En server/index.js agregar antes del listen:
# app.use(express.static('public'));

# Correr con PM2
npm install -g pm2
cd server
pm2 start index.js --name cedear-advisor
```

### Opción 3: Docker

```dockerfile
# Dockerfile en la raíz
FROM node:18-alpine
WORKDIR /app
COPY server/ ./server/
COPY client/ ./client/
RUN cd client && npm install && npm run build && cp -r dist ../server/public
RUN cd server && npm install
WORKDIR /app/server
EXPOSE 3001
CMD ["node", "index.js"]
```

## Funcionalidades

### Motor de Scoring
- **Técnico (35%):** RSI, MACD, SMA 20/50/200, EMA, Bandas de Bollinger, ATR, Estocástico, análisis de volumen, soportes/resistencias
- **Fundamental (40%):** P/E, Forward P/E, PEG, EPS Growth, Revenue Growth, Márgenes, ROE, Deuda, Dividendos, consenso de analistas, precio objetivo
- **Sentimiento (25%):** Momentum de precio, tendencia de volumen, rating de analistas, ajuste por beta

### Análisis IA (Claude)
- Usa **web search** para buscar noticias en tiempo real de cada ticker
- Analiza contexto macro (FED, inflación, tipo de cambio)
- Genera recomendaciones con montos concretos en ARS
- Calcula cantidad de CEDEARs según ratio y CCL
- Sugiere distribución del aporte mensual
- Identifica riesgos específicos
- Define horizonte temporal por oportunidad

### CEDEARs Incluidos
50+ tickers incluyendo:
- **Tech:** AAPL, MSFT, GOOGL, NVDA, META, AMD, GLOB
- **Consumer:** AMZN, TSLA, MELI, NKE
- **Financial:** JPM, V, MA, BRK-B
- **Healthcare:** JNJ, PFE, ABBV, UNH
- **ETFs:** SPY, QQQ, ARKK, XLE

## Notas Importantes

⚠ **DISCLAIMER:** Esta herramienta es informativa y educativa. No constituye asesoramiento financiero profesional. Las inversiones en CEDEARs conllevan riesgo de pérdida de capital. Consultá con un asesor financiero matriculado ante la CNV antes de invertir. Rentabilidades pasadas no garantizan resultados futuros.

- Los datos provienen de Yahoo Finance (gratuito, puede tener delays de 15 min)
- El CCL se obtiene de DolarAPI.com
- El cache por defecto es de 5 minutos para no saturar las APIs
- Bull Market Brokers no tiene API pública; las operaciones se ejecutan manualmente en su plataforma
