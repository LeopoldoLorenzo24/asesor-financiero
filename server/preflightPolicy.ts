const WEEKEND_DAYS = new Set(["Sat", "Sun"]);
const PREOPEN_WINDOW_MIN_BEFORE = 75;
const PREOPEN_WINDOW_MIN_AFTER = 15;

export function getClockParts(timezone: string, date = new Date()) {
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

function hhmmToMinutes(value: string) {
  const [hours, minutes] = String(value || "00:00").split(":").map((item) => parseInt(item, 10) || 0);
  return (hours * 60) + minutes;
}

function minutesToHHMM(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = String(Math.floor(normalized / 60)).padStart(2, "0");
  const minutes = String(normalized % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function getPreflightWindowState(settings: {
  timezone: string;
  marketOpenLocal: string;
  marketCloseLocal?: string;
}, date = new Date()) {
  const clock = getClockParts(settings.timezone, date);
  const marketOpenMinutes = hhmmToMinutes(settings.marketOpenLocal);
  const marketCloseMinutes = hhmmToMinutes(settings.marketCloseLocal || "17:00");
  const windowStartLocal = minutesToHHMM(marketOpenMinutes - PREOPEN_WINDOW_MIN_BEFORE);
  const windowEndLocal = minutesToHHMM(marketOpenMinutes + PREOPEN_WINDOW_MIN_AFTER);
  const nowMinutes = hhmmToMinutes(clock.timeHHMM);
  const isWeekend = WEEKEND_DAYS.has(clock.weekday);
  const isEligibleNow = !isWeekend && nowMinutes >= hhmmToMinutes(windowStartLocal) && nowMinutes <= hhmmToMinutes(windowEndLocal);
  const marketSessionActive = !isWeekend && nowMinutes >= hhmmToMinutes(windowStartLocal) && nowMinutes <= marketCloseMinutes;

  return {
    runDateLocal: clock.dateKey,
    weekday: clock.weekday,
    nowLocal: clock.timeHHMM,
    timezone: settings.timezone,
    marketOpenLocal: settings.marketOpenLocal,
    marketCloseLocal: settings.marketCloseLocal || "17:00",
    windowStartLocal,
    windowEndLocal,
    isWeekend,
    isEligibleNow,
    marketSessionActive,
  };
}

export function assessPreflightReadiness({
  latestRun,
  settings,
  date = new Date(),
}: {
  latestRun?: any;
  settings: { timezone: string; marketOpenLocal: string; marketCloseLocal?: string };
  date?: Date;
}) {
  const window = getPreflightWindowState(settings, date);
  const blockers: string[] = [];
  const cautions: string[] = [];
  const latestRunDate = latestRun?.runDateLocal || null;
  const hasRunToday = latestRunDate === window.runDateLocal;
  const latestStatus = latestRun?.status || null;

  if (window.isWeekend) {
    return {
      status: "ready",
      requiresFreshPreflightNow: false,
      blocksNewTrading: false,
      blockers,
      cautions,
      summary: "Fin de semana: no se exige preflight intradiario.",
      latestRunDate,
      hasRunToday,
      latestStatus,
      window,
    };
  }

  if (window.marketSessionActive) {
    if (!hasRunToday) {
      blockers.push("Falta el preflight operativo de hoy; no abrir posiciones nuevas.");
    } else if (latestStatus === "blocked") {
      blockers.push("El preflight de hoy abrió bloqueado; no operar capital nuevo.");
    } else if (latestStatus === "caution") {
      cautions.push("El preflight de hoy abrió con cautela; bajar agresividad y verificar blockers/cautions.");
    } else if (latestStatus !== "ready") {
      cautions.push("El preflight de hoy no quedó en estado ready.");
    }
  } else if (!hasRunToday) {
    cautions.push("Todavía no hay preflight registrado para hoy.");
  }

  const status = blockers.length > 0 ? "blocked" : cautions.length > 0 ? "caution" : "ready";
  const summary = blockers.length > 0
    ? blockers[0]
    : cautions.length > 0
      ? cautions[0]
      : hasRunToday
        ? "Preflight operativo del día en orden."
        : "Fuera de sesión: el preflight de hoy todavía no es obligatorio.";

  return {
    status,
    requiresFreshPreflightNow: window.marketSessionActive,
    blocksNewTrading: blockers.length > 0,
    blockers,
    cautions,
    summary,
    latestRunDate,
    hasRunToday,
    latestStatus,
    window,
  };
}
