import CEDEARS from "./cedears.js";

type RatioRow = {
  ratio?: number;
  updated_at?: string | null;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function daysSince(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.floor((Date.now() - parsed.getTime()) / 86400000);
}

export function buildRatioSyncHealth({
  ratios = {},
  coverage = null,
  recentMaxAgeDays = 14,
}: {
  ratios?: Record<string, RatioRow>;
  coverage?: { total?: number; dynamic?: number; hardcoded?: number; pct?: number } | null;
  recentMaxAgeDays?: number;
}) {
  const ratioRows = Object.values(ratios || {}).filter((row) => Number(row?.ratio) > 0);
  const updatedAges = ratioRows
    .map((row) => daysSince(row?.updated_at))
    .filter((age): age is number => Number.isFinite(age as number));

  const totalUniverse = Math.max(1, Number(coverage?.total || CEDEARS.length || 1));
  const dynamicCount = Math.max(0, Number(coverage?.dynamic || ratioRows.length || 0));
  const coveragePct = Number.isFinite(Number(coverage?.pct))
    ? Number(coverage?.pct)
    : round2((dynamicCount / totalUniverse) * 100);
  const latestAgeDays = updatedAges.length > 0 ? Math.min(...updatedAges) : null;
  const oldestAgeDays = updatedAges.length > 0 ? Math.max(...updatedAges) : null;
  const recentCount = updatedAges.filter((age) => age <= recentMaxAgeDays).length;
  const recentCoveragePct = dynamicCount > 0 ? round2((recentCount / dynamicCount) * 100) : 0;

  let severity: "ok" | "warning" | "critical" = "ok";
  let summary = "Ratios dinámicos recientes y con cobertura operativa suficiente.";

  if (dynamicCount === 0 || recentCount === 0) {
    severity = "critical";
    summary = "No hay ratios dinámicos recientes; operar CEDEARs así no es defendible para capital real.";
  } else if (coveragePct < 20 || recentCoveragePct < 40 || (latestAgeDays != null && latestAgeDays > recentMaxAgeDays)) {
    severity = "critical";
    summary = "La sincronización de ratios es demasiado incompleta o vieja para confiar en precios ARS de ejecución.";
  } else if (coveragePct < 50 || recentCoveragePct < 75 || (oldestAgeDays != null && oldestAgeDays > recentMaxAgeDays * 2)) {
    severity = "warning";
    summary = "La sincronización de ratios está usable pero no sólida para asumir precisión plena en todo el universo.";
  }

  return {
    severity,
    summary,
    totalUniverse,
    dynamicCount,
    coveragePct,
    recentCount,
    recentCoveragePct,
    latestAgeDays,
    oldestAgeDays,
    recentMaxAgeDays,
  };
}

export function buildTradeSafetyStatus({
  ccl,
  marketProviders,
  ratioHealth,
  preflightStatus,
}: {
  ccl?: { _stale?: boolean } | null;
  marketProviders?: { degraded?: boolean } | null;
  ratioHealth?: { severity?: "ok" | "warning" | "critical"; summary?: string } | null;
  preflightStatus?: { status?: "ready" | "caution" | "blocked"; summary?: string; blocksNewTrading?: boolean } | null;
}) {
  const blockers: string[] = [];
  const cautions: string[] = [];

  if (ccl?._stale) {
    blockers.push("CCL en caché o sin frescura confirmada. No abrir posiciones nuevas con este dato.");
  }

  if (ratioHealth?.severity === "critical") {
    blockers.push(ratioHealth.summary || "Ratios CEDEAR sin sincronización confiable.");
  } else if (ratioHealth?.severity === "warning") {
    cautions.push(ratioHealth.summary || "Ratios CEDEAR con cobertura parcial.");
  }

  if (marketProviders?.degraded) {
    blockers.push("Proveedores de mercado degradados: demasiados fallbacks para confiar en stock picking nuevo.");
  }

  if (preflightStatus?.blocksNewTrading || preflightStatus?.status === "blocked") {
    blockers.push(preflightStatus.summary || "El preflight operativo del día no habilita trading nuevo.");
  } else if (preflightStatus?.status === "caution") {
    cautions.push(preflightStatus.summary || "El preflight operativo del día quedó en cautela.");
  }

  const mustStandAside = blockers.length > 0;
  const status: "clear" | "caution" | "stand_aside" = mustStandAside
    ? "stand_aside"
    : cautions.length > 0
      ? "caution"
      : "clear";

  const summary = mustStandAside
    ? "No abrir nuevas posiciones ni generar recomendaciones accionables hasta normalizar integridad de datos."
    : cautions.length > 0
      ? "Operar solo con cautela extra; la integridad de datos no está perfecta."
      : "Integridad de datos operativa para generar recomendaciones accionables.";

  return {
    status,
    mustStandAside,
    blockers,
    cautions,
    summary,
    cclStale: Boolean(ccl?._stale),
    providersDegraded: Boolean(marketProviders?.degraded),
    ratioHealth: ratioHealth || null,
    preflightStatus: preflightStatus || null,
  };
}

export function buildStandAsideAnalysis({
  capital = 0,
  coreETF = "SPY",
  tradeSafety,
}: {
  capital?: number;
  coreETF?: string;
  tradeSafety: ReturnType<typeof buildTradeSafetyStatus>;
}) {
  const safeCapital = Math.max(0, Number(capital || 0));
  const ticker = String(coreETF || "SPY").toUpperCase();
  const reasons = tradeSafety?.blockers?.length > 0
    ? tradeSafety.blockers
    : ["Integridad de datos insuficiente para operar capital nuevo."];

  return {
    resumen_mercado: `${tradeSafety.summary} ${reasons.join(" ")}`.trim(),
    decision_mensual: {
      resumen: `Stand-by operativo. No abrir nuevas posiciones hasta normalizar datos críticos. ${ticker} sigue siendo el benchmark/core de referencia, pero hoy no corresponde ejecutar compras nuevas.`,
      core_etf: ticker,
      distribucion: {
        core_pct: 100,
        core_monto_ars: safeCapital,
        satellite_pct: 0,
        satellite_monto_ars: 0,
      },
      picks_activos: [],
    },
    acciones_cartera_actual: [],
    resumen_operaciones: {
      total_a_vender_ars: 0,
      capital_disponible_actual: safeCapital,
      capital_disponible_post_ventas: safeCapital,
      a_core_ars: 0,
      a_satellite_ars: 0,
    },
    plan_ejecucion: [],
    cartera_objetivo: {
      descripcion: `Sin cambios nuevos hasta recuperar integridad de datos. ${ticker} queda como referencia pasiva, no como orden ejecutable automática.`,
      posiciones: [],
    },
    riesgos: reasons,
    honestidad: "Con datos críticos degradados, la respuesta responsable no es elegir una acción sino esperar.",
    _critical_data_safety: tradeSafety,
  };
}
