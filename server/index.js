// ============================================================
// CEDEAR ADVISOR - API SERVER v3
// Router-based architecture: auth, market, ai, portfolio,
// predictions, postmortem, capital, system
// ============================================================

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, ".env") });

import express from "express";
import cors from "cors";
import helmet from "helmet";
import CEDEARS from "./cedears.js";
import { authMiddleware } from "./auth.js";
import { apiMetricsMiddleware } from "./observability.js";
import { checkAndIncrementRateLimit, cleanExpiredRateLimits, initDb, getTransactions } from "./database.js";
import { FLAGS } from "./featureFlags.js";
import { APP_CONFIG, RATE_LIMIT_CONFIG, DB_CONFIG } from "./config.js";

import createAuthRouter from "./routes/auth.js";
import marketRouter from "./routes/market.js";
import aiRouter from "./routes/ai.js";
import portfolioRouter from "./routes/portfolio.js";
import predictionsRouter from "./routes/predictions.js";
import postmortemRouter from "./routes/postmortem.js";
import capitalRouter from "./routes/capital.js";
import systemRouter from "./routes/system.js";
import virtualRouter from "./routes/virtual.js";
import tradingRouter from "./routes/trading.js";
import exportRouter from "./routes/export.js";
import chartsRouter from "./routes/charts.js";

import {
  seedIfEmpty, autoSeedHistoricalLessons,
  runAutoEvaluation, runStopLossCheck, runDailyCapitalLog,
  runMonthlyPostMortem, runTakeProfitCheck, runMLPipeline,
  runTrackRecordLog,
} from "./jobs.js";
import { initTelegramBot } from "./telegramBot.js";

// ── Validate required environment variables ──
function validateEnv() {
  console.log("[startup] Validando variables de entorno...");
  console.log("[startup] JWT_SECRET presente:", !!process.env.JWT_SECRET, "Longitud:", String(process.env.JWT_SECRET || "").length);
  console.log("[startup] TURSO_URL presente:", !!process.env.TURSO_URL);
  console.log("[startup] TURSO_AUTH_TOKEN presente:", !!process.env.TURSO_AUTH_TOKEN);
  console.log("[startup] ANTHROPIC_API_KEY presente:", !!process.env.ANTHROPIC_API_KEY);
  console.log("[startup] AUTH_PASSWORD presente:", !!process.env.AUTH_PASSWORD, "Longitud:", String(process.env.AUTH_PASSWORD || "").length);

  const required = ["JWT_SECRET"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[env] Variables requeridas faltantes: ${missing.join(", ")}`);
    throw new Error(`[env] Variables requeridas faltantes: ${missing.join(", ")}`);
  }

  const jwtSecret = String(process.env.JWT_SECRET || "");
  if (jwtSecret.length < 32 || jwtSecret.includes("cambia-esto")) {
    console.error("[env] JWT_SECRET es inseguro. Usá un valor aleatorio de al menos 32 caracteres.");
    throw new Error("[env] JWT_SECRET es inseguro. Usá un valor aleatorio de al menos 32 caracteres.");
  }

  if (process.env.AUTH_PASSWORD && String(process.env.AUTH_PASSWORD).length < 12) {
    console.error("[env] AUTH_PASSWORD es demasiado corto. Usá al menos 12 caracteres.");
    throw new Error("[env] AUTH_PASSWORD es demasiado corto. Usá al menos 12 caracteres.");
  }

  if (!process.env.AUTH_ALLOWED_EMAIL && !process.env.AUTH_ALLOWED_EMAILS) {
    console.warn("[env] AUTH_ALLOWED_EMAIL no configurado. Se usará el email legacy permitido.");
  }

  if (APP_CONFIG.isProduction && process.env.ALLOW_INITIAL_REGISTER === "true") {
    console.warn("[env] ALLOW_INITIAL_REGISTER está activo en producción. Desactivalo después del alta inicial.");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[env] ANTHROPIC_API_KEY no configurada. Las rutas de IA no estarán disponibles.");
  }

  console.log("[startup] Validación de variables completada.");
}
try {
  validateEnv();
} catch (err) {
  console.error("[FATAL] El servidor no puede arrancar:", err.message);
  process.exit(1);
}

export const app = express();
const PORT = APP_CONFIG.port;

// ── Rate limiter persistente ──
function makeRateLimiter(maxRequests, windowMs) {
  return async (req, res, next) => {
    if (!FLAGS.ENABLE_RATE_LIMIT) return next();
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
    try {
      const { allowed, resetAt } = await checkAndIncrementRateLimit(ip, maxRequests, windowMs);
      if (!allowed) {
        const retryAfterSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
        res.setHeader("Retry-After", retryAfterSec);
        return res.status(429).json({ error: `Demasiadas solicitudes. Intentá de nuevo en ${retryAfterSec} segundos.`, retryAfterSeconds: retryAfterSec });
      }
      next();
    } catch (err) {
      console.error("[rate-limit] DB error:", err.message);
      if (APP_CONFIG.rateLimitFailOpen) return next();
      return res.status(503).json({ error: "Protección de rate limit no disponible. Intentá nuevamente en unos segundos." });
    }
  };
}

const allowedOrigins = new Set(APP_CONFIG.corsAllowedOrigins);
const authRateLimit = makeRateLimiter(RATE_LIMIT_CONFIG.authMaxRequests, RATE_LIMIT_CONFIG.authWindowMs);
const aiRateLimit = makeRateLimiter(RATE_LIMIT_CONFIG.aiMaxRequests, RATE_LIMIT_CONFIG.aiWindowMs);
const generalRateLimit = makeRateLimiter(200, 60_000); // 200 req/min general

app.disable("x-powered-by");
app.set("trust proxy", APP_CONFIG.trustProxy);
app.use(helmet());

// Serve static files BEFORE CORS so assets don't get blocked by origin validation
const clientDist = join(__dirname, "..", "client", "dist");
console.log("[static] clientDist path:", clientDist, "exists:", existsSync(clientDist));
if (existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: "1h" }));
  console.log("[static] Serving static files from", clientDist);
} else {
  console.warn("[static] client/dist not found. Frontend will not be served.");
}

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.size === 0 || allowedOrigins.has(origin)) return callback(null, true);
    // In production, if no explicit CLIENT_ORIGIN, allow the request host
    if (APP_CONFIG.isProduction) return callback(null, true);
    return callback(new Error("CORS no permitido"));
  },
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  maxAge: 600,
}));
app.use(express.json({ limit: "100kb" }));
app.use(apiMetricsMiddleware);

app.use((err, req, res, next) => {
  if (err?.message === "CORS no permitido") {
    return res.status(403).json({ error: "Origen no permitido" });
  }
  return next(err);
});

// ---- Auth (public) ----
app.use("/api/auth", createAuthRouter(authRateLimit));

// General rate limit on all /api/*
app.use("/api", generalRateLimit);

// Protect all /api/* except auth and health
app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth") || req.path === "/health") return next();
  authMiddleware(req, res, next);
});

// ---- Domain routers ----
app.use("/api", systemRouter);        // /health, /internal/metrics, /backtest
app.use("/api", marketRouter);        // /ccl, /cedears, /ranking, /cedear/:ticker, /history/:ticker, /benchmarks, /sectors, /portfolio/exposure
app.use("/api/ai", aiRateLimit, aiRouter);           // /ai/analyze, /ai/analyze/:ticker, /ai/usage
app.use("/api/portfolio", portfolioRouter);          // /portfolio/db, /portfolio/buy, /portfolio/sell, etc.
app.use("/api/predictions", predictionsRouter);      // /predictions, /predictions/evaluate, etc.
app.use("/api/postmortem", postmortemRouter);        // /postmortem/generate, /postmortem/history, /seed-historical-lessons
app.use("/api", capitalRouter);                      // /performance, /analysis-sessions, /capital, /capital-history, /performance-analytics
app.use("/api", virtualRouter);                        // /virtual-portfolio, /adherence/stats, /virtual-portfolio/regret
app.use("/api", tradingRouter);                        // /trading/signals, /trading/validate, /trading/check-exit
app.use("/api", exportRouter);                         // /export/portfolio, /export/transactions, /export/predictions, /export/capital-history
app.use("/api", chartsRouter);                         // /charts/portfolio-evolution

// Legacy routes not covered by domain routers
app.get("/api/transactions", async (req, res) => {
  try { res.json(await getTransactions(req.query.ticker || null, parseInt(req.query.limit) || 50)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// SPA fallback: serve index.html for any non-API route
app.get("*", (req, res) => {
  const indexPath = join(clientDist, "index.html");
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: "Not found" });
  }
});

// ── START SERVER ──
export async function startServer() {
  await initDb();
  await seedIfEmpty();
  autoSeedHistoricalLessons().catch((err) => console.warn("[seed] No se pudo generar experiencia histórica:", err.message));
  initTelegramBot();

  if (FLAGS.ENABLE_INTERNAL_SCHEDULER) {
    setTimeout(() => {
      runAutoEvaluation();
      runDailyCapitalLog();
      runStopLossCheck();
      runTakeProfitCheck();
      runMonthlyPostMortem();
      runMLPipeline();
      runTrackRecordLog();
    }, DB_CONFIG.serverSettleDelayMs);
  } else {
    console.log("[scheduler] ENABLE_INTERNAL_SCHEDULER=false. El proceso web no ejecutará jobs periódicos.");
  }

  const intervals = FLAGS.ENABLE_INTERNAL_SCHEDULER ? [
    setInterval(runAutoEvaluation, DB_CONFIG.autoEvalIntervalMs),
    setInterval(runStopLossCheck, DB_CONFIG.stopLossCheckIntervalMs),
    setInterval(runTakeProfitCheck, DB_CONFIG.stopLossCheckIntervalMs),
    setInterval(runDailyCapitalLog, DB_CONFIG.dailyCapitalLogIntervalMs),
    setInterval(runMonthlyPostMortem, 24 * 60 * 60 * 1000), // check once a day
    setInterval(runMLPipeline, 24 * 60 * 60 * 1000), // collect ML data daily
    setInterval(runTrackRecordLog, 24 * 60 * 60 * 1000), // track record daily
    setInterval(() => cleanExpiredRateLimits(60 * 60 * 1000).catch(() => {}), DB_CONFIG.cleanRateLimitIntervalMs),
  ] : [
    setInterval(() => cleanExpiredRateLimits(60 * 60 * 1000).catch(() => {}), DB_CONFIG.cleanRateLimitIntervalMs),
  ];

  const server = app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║     CEDEAR ADVISOR API - v3.0                ║
║     Running on port ${PORT}                     ║
║     CEDEARs loaded: ${CEDEARS.length}                      ║
║     AI: ${process.env.ANTHROPIC_API_KEY ? "✓ Configured" : "✗ Missing API key"}               ║
╚══════════════════════════════════════════════╝
    `);
  });

  function shutdown(signal) {
    console.log(`[shutdown] Recibida señal ${signal}. Cerrando servidor...`);
    server.close(() => {
      console.log("[shutdown] Servidor HTTP cerrado. Limpiando intervals...");
      intervals.forEach(clearInterval);
      process.exit(0);
    });
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// Solo iniciar el servidor si este archivo se ejecuta directamente (no cuando se importa para tests)
const modulePath = fileURLToPath(import.meta.url);
const isMainModule = process.argv.slice(1).some((arg) => resolve(arg) === modulePath);
if (isMainModule) {
  startServer();
}
