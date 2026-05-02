import { toFiniteNumber } from "./utils.js";

export const EXECUTION_SUGGESTION_MODE_CATALOG = [
  {
    key: "manual_only",
    label: "Manual por Demanda",
    description: "El sistema sugiere operaciones solo cuando vos corrés un análisis.",
    proactiveAlerts: false,
  },
  {
    key: "critical_alerts",
    label: "Alertas Críticas",
    description: "Además del análisis on-demand, puede avisarte solo ante oportunidades o riesgos excepcionales.",
    proactiveAlerts: true,
  },
] as const;

export type ExecutionSuggestionMode = typeof EXECUTION_SUGGESTION_MODE_CATALOG[number]["key"];

export function getExecutionAssistantModeMeta(mode: unknown) {
  return EXECUTION_SUGGESTION_MODE_CATALOG.find((item) => item.key === mode) || EXECUTION_SUGGESTION_MODE_CATALOG[0];
}

function cleanText(value: unknown, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function buildExpiryIso(hoursAhead = 24) {
  return new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString();
}

function isCriticalBuyTicket(ticket: any, readiness: any) {
  if (ticket.action !== "BUY") return false;
  if (readiness?.preflight?.status === "blocked") return false;
  if (toFiniteNumber(ticket.conviction, 0) < 85) return false;
  if (toFiniteNumber(ticket.targetPct, 0) < 10) return false;
  if (toFiniteNumber(ticket.shares, 0) <= 0) return false;
  return true;
}

function isCriticalSellTicket(ticket: any) {
  if (ticket.action !== "SELL") return false;
  const note = cleanText(ticket.executionNote || ticket.rationale).toLowerCase();
  return note.includes("stop") || note.includes("riesgo") || note.includes("reduc") || note.includes("salir");
}

export function buildTradeTicketsFromAnalysis({
  analysis,
  investmentReadiness,
  suggestionMode,
}: {
  analysis: any;
  investmentReadiness?: any;
  suggestionMode: ExecutionSuggestionMode;
}) {
  const plan = Array.isArray(analysis?.plan_ejecucion) ? analysis.plan_ejecucion : [];
  const picks = Array.isArray(analysis?.decision_mensual?.picks_activos) ? analysis.decision_mensual.picks_activos : [];
  const picksByTicker = new Map(picks.map((pick: any) => [String(pick?.ticker || "").toUpperCase(), pick]));
  const latestStatus = investmentReadiness?.preflight?.latestStatus || investmentReadiness?.preflight?.status || null;

  const tickets = plan
    .map((step: any, index: number) => {
      const action = String(step?.tipo || "").toUpperCase() === "VENDER" ? "SELL" : "BUY";
      const ticker = String(step?.ticker || "").toUpperCase();
      if (!ticker) return null;

      const pick = picksByTicker.get(ticker);
      const shares = Math.max(0, toFiniteNumber(step?.cantidad_cedears, 0));
      const estimatedAmountArs = Math.max(0, toFiniteNumber(step?.monto_estimado_ars, 0));
      const limitPriceArs = shares > 0
        ? Math.max(0, estimatedAmountArs / shares)
        : Math.max(0, toFiniteNumber(pick?.precio_aprox_ars, 0));
      const baseTicket = {
        source: "analysis",
        action,
        ticker,
        name: cleanText(pick?.nombre),
        sector: cleanText(pick?.sector),
        subtype: cleanText(step?.subtipo),
        shares,
        limitPriceArs: limitPriceArs > 0 ? Math.round(limitPriceArs) : null,
        estimatedAmountArs: estimatedAmountArs > 0 ? Math.round(estimatedAmountArs) : null,
        targetPct: pick?.target_pct != null ? toFiniteNumber(pick.target_pct, 0) : null,
        stopLossPct: pick?.stop_loss_pct != null ? toFiniteNumber(pick.stop_loss_pct, 0) : null,
        conviction: pick?.conviction != null ? Math.round(toFiniteNumber(pick.conviction, 0)) : null,
        rationale: cleanText(
          pick?.por_que_le_gana_a_spy || pick?.razon || step?.nota,
          action === "BUY" ? "Tesis validada por el advisor." : "Reducción de riesgo sugerida por el advisor."
        ),
        executionNote: cleanText(step?.nota, action === "BUY" ? "Ejecutar solo si seguís de acuerdo con la tesis." : "Defensivo: ejecutar primero si necesitás bajar riesgo."),
        expiresAt: buildExpiryIso(action === "SELL" ? 8 : 24),
        payload: {
          paso: index + 1,
          latestPreflightStatus: latestStatus,
          marketRegime: investmentReadiness?.marketRegime?.regime || null,
          planStep: step,
          pick: pick || null,
        },
      };

      const critical = isCriticalBuyTicket(baseTicket, investmentReadiness) || isCriticalSellTicket(baseTicket);
      return {
        ...baseTicket,
        priority: critical ? "critical" : "normal",
        shouldAlert: suggestionMode === "critical_alerts" && critical,
      };
    })
    .filter(Boolean)
    .filter((ticket: any) => ticket.shares > 0 || ticket.action === "SELL");

  return {
    tickets,
    summary: {
      total: tickets.length,
      critical: tickets.filter((ticket: any) => ticket.priority === "critical").length,
      buys: tickets.filter((ticket: any) => ticket.action === "BUY").length,
      sells: tickets.filter((ticket: any) => ticket.action === "SELL").length,
    },
  };
}

export function buildExecutionAssistantPayload(settings: any, tickets: any[] = []) {
  const mode = getExecutionAssistantModeMeta(settings?.suggestionMode);
  return {
    settings: {
      suggestionMode: mode.key,
      confirmationRequired: true,
      maxCriticalAlertsPerDay: Math.max(1, Number(settings?.maxCriticalAlertsPerDay || 2)),
      updatedAt: settings?.updatedAt || null,
    },
    modeCatalog: EXECUTION_SUGGESTION_MODE_CATALOG,
    summary: {
      openTickets: tickets.length,
      pendingConfirmation: tickets.filter((ticket) => ticket.status === "pending_confirmation").length,
      confirmed: tickets.filter((ticket) => ticket.status === "confirmed").length,
      criticalOpen: tickets.filter((ticket) => ticket.priority === "critical").length,
    },
    modeMeta: mode,
  };
}
