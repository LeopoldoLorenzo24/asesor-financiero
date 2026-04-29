import CEDEARS from "./cedears.js";
import { FLAGS } from "./featureFlags.js";
import {
  closeOpenIntradayMonitorSessions,
  createIntradayMonitorSession,
  getCapitalHistory,
  getIntradayMonitorRecentEvents,
  getIntradayMonitorRecentSessions,
  getIntradayMonitorRecentSnapshots,
  getIntradayMonitorSettings,
  getIntradayMonitorTickerSnapshots,
  getPortfolioSummary,
  getPredictions,
  saveIntradayMonitorSnapshot,
  stopIntradayMonitorSession,
  updateIntradayMonitorSettings,
} from "./database.js";
import { fetchAllQuotes, fetchBymaPrices, fetchCCL, fetchVIX } from "./marketData.js";
import { calcPriceARS } from "./utils.js";

const CEDAR_MAP = new Map(CEDEARS.map((cedear) => [cedear.ticker, cedear]));
const WEEKEND_DAYS = new Set(["Sat", "Sun"]);

const runtime = {
  running: false,
  inFlight: false,
  timer: null,
  nextRunAt: null,
  sessionId: null,
  startedAt: null,
  intervalMinutes: null,
  lastTickAt: null,
  lastSnapshotAt: null,
  lastSnapshotId: null,
  lastError: null,
  marketState: "closed",
  marketOpenNow: false,
};

function getClockParts(timezone, date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    timeHHMM: `${parts.hour}:${parts.minute}`,
    weekday: parts.weekday,
  };
}

function getMarketWindowState(settings, date = new Date()) {
  const clock = getClockParts(settings.timezone, date);
  if (WEEKEND_DAYS.has(clock.weekday)) {
    return { ...clock, marketState: "weekend", isOpen: false };
  }
  if (clock.timeHHMM < settings.marketOpenLocal) {
    return { ...clock, marketState: "pre_market", isOpen: false };
  }
  if (clock.timeHHMM >= settings.marketCloseLocal) {
    return { ...clock, marketState: "after_hours", isOpen: false };
  }
  return { ...clock, marketState: "open", isOpen: true };
}

function round2(value) {
  return value == null || Number.isNaN(Number(value)) ? null : Math.round(Number(value) * 100) / 100;
}

function buildPredictionMap(predictions) {
  const map = new Map();
  for (const prediction of predictions || []) {
    if (!prediction?.ticker || map.has(prediction.ticker)) continue;
    map.set(prediction.ticker, prediction);
  }
  return map;
}

function buildEventKey(sessionId, dateKey, eventType, ticker = "market") {
  return `${sessionId || 0}:${dateKey}:${eventType}:${ticker}`;
}

function scheduleNextTick() {
  if (!runtime.running || !runtime.intervalMinutes) return;
  if (runtime.timer) clearTimeout(runtime.timer);
  const ms = runtime.intervalMinutes * 60 * 1000;
  runtime.nextRunAt = new Date(Date.now() + ms).toISOString();
  runtime.timer = setTimeout(async () => {
    try {
      await runIntradayMonitorOnce({ source: "scheduled" });
    } catch (err) {
      runtime.lastError = err.message;
      console.error("[intraday-monitor] scheduled tick failed:", err.message);
    } finally {
      scheduleNextTick();
    }
  }, ms);
}

function clearScheduledTick() {
  if (runtime.timer) clearTimeout(runtime.timer);
  runtime.timer = null;
  runtime.nextRunAt = null;
}

function normalizePortfolioRows(rows) {
  return (rows || []).map((row) => ({
    ticker: row.ticker,
    totalShares: Number(row.total_shares || 0),
    weightedAvgPrice: Number(row.weighted_avg_price || 0),
    firstBought: row.first_bought || null,
  })).filter((row) => row.ticker && row.totalShares > 0);
}

export function getIntradayMonitorRuntimeStatus(settingsOverride = null) {
  const settings = settingsOverride || {
    intervalMinutes: runtime.intervalMinutes || 15,
    marketOpenLocal: "10:30",
    marketCloseLocal: "17:00",
    timezone: "America/Argentina/Cordoba",
  };
  const market = getMarketWindowState(settings);
  return {
    running: runtime.running,
    inFlight: runtime.inFlight,
    sessionId: runtime.sessionId,
    startedAt: runtime.startedAt,
    intervalMinutes: runtime.intervalMinutes || settings.intervalMinutes,
    lastTickAt: runtime.lastTickAt,
    lastSnapshotAt: runtime.lastSnapshotAt,
    lastSnapshotId: runtime.lastSnapshotId,
    lastError: runtime.lastError,
    nextRunAt: runtime.nextRunAt,
    marketState: market.marketState,
    marketOpenNow: market.isOpen,
    marketClock: {
      dateKey: market.dateKey,
      timeHHMM: market.timeHHMM,
      weekday: market.weekday,
    },
  };
}

export async function getIntradayMonitorStatusPayload() {
  const settings = await getIntradayMonitorSettings();
  const recentSnapshots = await getIntradayMonitorRecentSnapshots(24);
  const latestSnapshot = recentSnapshots[0] || null;
  const [latestTickerSnapshots, recentEvents, recentSessions] = await Promise.all([
    latestSnapshot ? getIntradayMonitorTickerSnapshots(latestSnapshot.id, 20) : Promise.resolve([]),
    getIntradayMonitorRecentEvents(30),
    getIntradayMonitorRecentSessions(10),
  ]);

  return {
    settings,
    runtime: getIntradayMonitorRuntimeStatus(settings),
    latestSnapshot,
    latestTickerSnapshots,
    recentSnapshots,
    recentEvents,
    recentSessions,
  };
}

export async function runIntradayMonitorOnce({ source = "manual" } = {}) {
  if (runtime.inFlight) {
    return { skipped: true, reason: "busy" };
  }

  runtime.inFlight = true;
  runtime.lastTickAt = new Date().toISOString();

  try {
    const settings = await getIntradayMonitorSettings();
    const market = getMarketWindowState(settings);
    runtime.marketState = market.marketState;
    runtime.marketOpenNow = market.isOpen;

    if (source !== "manual" && !market.isOpen) {
      return { skipped: true, reason: market.marketState };
    }

    const portfolio = normalizePortfolioRows(await getPortfolioSummary());
    if (portfolio.length === 0) {
      return { skipped: true, reason: "empty_portfolio" };
    }

    const tickers = [...new Set(portfolio.map((row) => row.ticker))];
    const quoteTickers = [...new Set([...tickers, "SPY", "QQQ"])];
    const [quotesMap, bymaPrices, ccl, vix, capitalHistory, predictions] = await Promise.all([
      fetchAllQuotes(quoteTickers).catch(() => ({})),
      fetchBymaPrices(tickers).catch(() => ({})),
      fetchCCL().catch(() => null),
      fetchVIX().catch(() => null),
      getCapitalHistory(1).catch(() => []),
      getPredictions(null, true, 300).catch(() => []),
    ]);

    const predictionMap = buildPredictionMap(predictions);
    const cclRate = Number(ccl?.venta || 0) || null;
    const capitalAvailableArs = Number(capitalHistory?.[0]?.capital_available_ars || 0) || 0;

    const rawTickerSnapshots = portfolio.map((position) => {
      const cedear = CEDAR_MAP.get(position.ticker);
      const quote = quotesMap[position.ticker];
      const byma = bymaPrices[position.ticker];
      const prediction = predictionMap.get(position.ticker);
      const priceArs = byma?.priceARS || calcPriceARS(quote?.price, cclRate, cedear?.ratio) || position.weightedAvgPrice;
      const valueArs = Number(position.totalShares) * Number(priceArs || 0);
      const pnlPct = position.weightedAvgPrice > 0
        ? ((Number(priceArs || 0) - position.weightedAvgPrice) / position.weightedAvgPrice) * 100
        : null;
      const priceAtPredictionArs = Number(prediction?.price_ars_at_prediction || 0) > 0
        ? Number(prediction.price_ars_at_prediction)
        : calcPriceARS(prediction?.price_usd_at_prediction, cclRate, cedear?.ratio);
      const sincePredictionPct = priceAtPredictionArs && priceAtPredictionArs > 0 && priceArs
        ? ((priceArs - priceAtPredictionArs) / priceAtPredictionArs) * 100
        : null;
      const stopLossPct = prediction?.stop_loss_pct == null ? null : Number(prediction.stop_loss_pct);
      const targetPct = prediction?.target_pct == null ? null : Number(prediction.target_pct);
      const stopLossBreach = (
        prediction?.action === "COMPRAR" &&
        stopLossPct != null &&
        sincePredictionPct != null &&
        sincePredictionPct <= stopLossPct
      );
      const takeProfitBreach = (
        prediction?.action === "COMPRAR" &&
        targetPct != null &&
        sincePredictionPct != null &&
        sincePredictionPct >= targetPct
      );

      return {
        ticker: position.ticker,
        shares: position.totalShares,
        avgCostArs: round2(position.weightedAvgPrice),
        priceUsd: round2(quote?.price ?? null),
        priceArs: round2(priceArs),
        bymaPriceArs: round2(byma?.priceARS ?? null),
        dayChangePct: round2(byma?.changePercent ?? quote?.changePercent ?? null),
        pnlPct: round2(pnlPct),
        valueArs: round2(valueArs),
        activePredictionAction: prediction?.action || null,
        predictionConfidence: prediction?.confidence == null ? null : Number(prediction.confidence),
        stopLossBreach,
        takeProfitBreach,
        sincePredictionPct: round2(sincePredictionPct),
        stopLossPct,
        targetPct,
      };
    });

    const portfolioValueArs = rawTickerSnapshots.reduce((sum, row) => sum + Number(row.valueArs || 0), 0);
    const totalValueArs = portfolioValueArs + capitalAvailableArs;
    const events = [];

    const tickerSnapshots = rawTickerSnapshots.map((row) => {
      const positionWeightPct = portfolioValueArs > 0 ? (Number(row.valueArs || 0) / portfolioValueArs) * 100 : 0;
      const snapshot = { ...row, positionWeightPct: round2(positionWeightPct) };

      if (Math.abs(Number(snapshot.dayChangePct || 0)) >= 4) {
        events.push({
          eventKey: buildEventKey(runtime.sessionId, market.dateKey, "price_shock", snapshot.ticker),
          eventType: "price_shock",
          severity: Math.abs(Number(snapshot.dayChangePct || 0)) >= 8 ? "critical" : "warning",
          ticker: snapshot.ticker,
          message: `${snapshot.ticker} se movió ${Number(snapshot.dayChangePct || 0).toFixed(2)}% en la rueda.`,
          payload: {
            dayChangePct: snapshot.dayChangePct,
            priceArs: snapshot.priceArs,
            valueArs: snapshot.valueArs,
          },
        });
      }

      if (snapshot.stopLossBreach) {
        events.push({
          eventKey: buildEventKey(runtime.sessionId, market.dateKey, "stop_loss_breach", snapshot.ticker),
          eventType: "stop_loss_breach",
          severity: "critical",
          ticker: snapshot.ticker,
          message: `${snapshot.ticker} perforó el stop-loss activo (${Number(snapshot.sincePredictionPct || 0).toFixed(2)}% desde la recomendación).`,
          payload: {
            sincePredictionPct: snapshot.sincePredictionPct,
            stopLossPct: snapshot.stopLossPct,
            priceArs: snapshot.priceArs,
          },
        });
      }

      if (snapshot.takeProfitBreach) {
        events.push({
          eventKey: buildEventKey(runtime.sessionId, market.dateKey, "take_profit_breach", snapshot.ticker),
          eventType: "take_profit_breach",
          severity: "warning",
          ticker: snapshot.ticker,
          message: `${snapshot.ticker} alcanzó take-profit (${Number(snapshot.sincePredictionPct || 0).toFixed(2)}% desde la recomendación).`,
          payload: {
            sincePredictionPct: snapshot.sincePredictionPct,
            targetPct: snapshot.targetPct,
            priceArs: snapshot.priceArs,
          },
        });
      }

      return snapshot;
    });

    const snapshot = await saveIntradayMonitorSnapshot({
      sessionId: runtime.sessionId,
      snapshotAt: new Date().toISOString(),
      marketState: market.marketState,
      source,
      cclRate,
      vixValue: round2(vix?.price ?? null),
      vixChangePct: round2(vix?.changePct ?? null),
      vixRegime: vix?.regime || null,
      spyPriceUsd: round2(quotesMap.SPY?.price ?? null),
      spyChangePct: round2(quotesMap.SPY?.changePercent ?? null),
      qqqPriceUsd: round2(quotesMap.QQQ?.price ?? null),
      qqqChangePct: round2(quotesMap.QQQ?.changePercent ?? null),
      portfolioValueArs: round2(portfolioValueArs),
      capitalAvailableArs: round2(capitalAvailableArs),
      totalValueArs: round2(totalValueArs),
      trackedTickersCount: tickers.length,
      positionCount: portfolio.length,
      notes: source === "manual" && !market.isOpen ? `Snapshot manual fuera de rueda (${market.marketState}).` : null,
      tickerSnapshots,
      events,
    });

    runtime.lastSnapshotAt = snapshot?.snapshotAt || new Date().toISOString();
    runtime.lastSnapshotId = snapshot?.id || null;
    runtime.lastError = null;

    return { skipped: false, snapshot, tickerSnapshots, events };
  } catch (err) {
    runtime.lastError = err.message;
    throw err;
  } finally {
    runtime.inFlight = false;
  }
}

export async function startIntradayMonitor({
  startedBy = "user",
  runImmediately = true,
  persistEnabled = true,
} = {}) {
  if (!FLAGS.ENABLE_INTERNAL_SCHEDULER) {
    throw new Error("ENABLE_INTERNAL_SCHEDULER=false. El monitor intradía local está desactivado en este entorno.");
  }
  if (runtime.running) {
    return getIntradayMonitorStatusPayload();
  }

  const settings = persistEnabled
    ? await updateIntradayMonitorSettings({ enabled: true })
    : await getIntradayMonitorSettings();

  await closeOpenIntradayMonitorSessions("process_restarted");
  const session = await createIntradayMonitorSession({
    startedBy,
    intervalMinutes: settings.intervalMinutes,
    marketOpenLocal: settings.marketOpenLocal,
    marketCloseLocal: settings.marketCloseLocal,
    timezone: settings.timezone,
  });

  runtime.running = true;
  runtime.sessionId = session?.id || null;
  runtime.startedAt = session?.startedAt || new Date().toISOString();
  runtime.intervalMinutes = settings.intervalMinutes;
  runtime.lastError = null;

  if (runImmediately) {
    try {
      await runIntradayMonitorOnce({ source: "manual" });
    } catch (err) {
      console.warn("[intraday-monitor] immediate run failed:", err.message);
    }
  }
  scheduleNextTick();

  return getIntradayMonitorStatusPayload();
}

export async function stopIntradayMonitor({
  reason = "user_stop",
  disable = true,
  status = "stopped",
} = {}) {
  clearScheduledTick();
  const sessionId = runtime.sessionId;
  runtime.running = false;
  runtime.sessionId = null;
  runtime.startedAt = null;
  runtime.intervalMinutes = null;

  if (sessionId) {
    await stopIntradayMonitorSession(sessionId, { status, stopReason: reason });
  }
  if (disable) {
    await updateIntradayMonitorSettings({ enabled: false });
  }

  return getIntradayMonitorStatusPayload();
}

export async function resumeIntradayMonitorIfEnabled() {
  await closeOpenIntradayMonitorSessions("startup_cleanup");
  if (!FLAGS.ENABLE_INTERNAL_SCHEDULER) {
    console.log("[intraday-monitor] ENABLE_INTERNAL_SCHEDULER=false. No se reanudará el monitor intradía.");
    return;
  }
  const settings = await getIntradayMonitorSettings();
  if (!settings.enabled) return;
  console.log("[intraday-monitor] Reanudando monitor intradía según configuración persistida.");
  await startIntradayMonitor({ startedBy: "resume", runImmediately: false, persistEnabled: false });
}
