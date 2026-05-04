import React, { useState, useMemo } from "react";
import {
  Wallet, DollarSign, TrendingUp, TrendingDown, PieChart,
  Brain, Zap, Play, X, ChevronRight, ArrowUpRight,
  ShieldCheck, AlertTriangle,
} from "lucide-react";
import { T, S, signalColors } from "../theme";
import {
  GlassCard, MetricCard, ScoreBar, Skeleton, StatusMsg,
  SectionHeader, Sparkline, HeatBadge, AnimatedNumber, BlockerList,
} from "../components/common";
import Tooltip, { InfoBadge } from "../components/Tooltip";
import WelcomeView from "./WelcomeView";
import api from "../api";

function getReadinessColor(readiness) {
  if (!readiness) return T.textDim;
  return readiness.mode === "real_capital_ok" ? T.green : T.red;
}

function getPreflightMeta(preflight) {
  const status = preflight?.status || "ready";
  if (status === "blocked") return { color: T.red, label: "Preflight Blocked" };
  if (status === "caution") return { color: T.yellow, label: "Preflight Caution" };
  return { color: T.green, label: "Preflight Ready" };
}

function formatMoney(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `$${Number(value).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

// Hero card — total wealth displayed prominently
function HeroCard({ totalWealth, portfolioValue, capital, portfolioPct, portfolioCount }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        borderRadius: 28,
        overflow: "hidden",
        marginBottom: 20,
        border: `1px solid rgba(0,245,160,0.12)`,
        transition: "border-color 0.3s ease, box-shadow 0.3s ease",
        boxShadow: hovered
          ? `0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,245,160,0.18)`
          : `0 8px 32px rgba(0,0,0,0.35)`,
        background: "rgba(15,23,42,0.65)",
        backdropFilter: "blur(32px) saturate(160%)",
        WebkitBackdropFilter: "blur(32px) saturate(160%)",
      }}
    >
      {/* Top gradient accent */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${T.green}80 20%, ${T.green} 50%, ${T.cyan}80 80%, transparent)`,
        opacity: hovered ? 1 : 0.6,
        transition: "opacity 0.3s ease",
      }} />

      {/* Ambient glow */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        background: `radial-gradient(ellipse at 15% 0%, ${T.green}07 0%, transparent 50%), radial-gradient(ellipse at 85% 100%, ${T.cyan}05 0%, transparent 50%)`,
        pointerEvents: "none",
      }} />

      <div style={{ padding: "28px 32px", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>

          {/* Left: main value */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: T.textDim,
              textTransform: "uppercase", letterSpacing: "2.5px",
              fontFamily: T.fontMono, marginBottom: 10,
            }}>
              Patrimonio Total
            </div>
            <div style={{
              fontSize: 52,
              fontWeight: 900,
              fontFamily: T.fontMono,
              letterSpacing: "-2.5px",
              lineHeight: 1,
              background: `linear-gradient(135deg, ${T.text} 50%, ${T.textMuted})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              marginBottom: 14,
            }}>
              ${totalWealth > 0 ? totalWealth.toLocaleString("es-AR") : "—"}
            </div>

            {/* Allocation bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160, maxWidth: 280 }}>
                <div style={{
                  height: 5,
                  background: "rgba(148,163,184,0.08)",
                  borderRadius: 5,
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(portfolioPct, 100)}%`,
                    background: `linear-gradient(90deg, ${T.green}, ${T.cyan})`,
                    borderRadius: 5,
                    boxShadow: `0 0 10px ${T.green}40`,
                    transition: "width 1s cubic-bezier(0.4,0,0.2,1)",
                  }} />
                </div>
              </div>
              <span style={{
                fontSize: 12, color: T.textDim, fontFamily: T.fontMono, fontWeight: 600, whiteSpace: "nowrap",
              }}>
                {portfolioPct.toFixed(0)}% invertido · {portfolioCount} CEDEAR{portfolioCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Right: breakdown */}
          <div style={{ display: "flex", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
            {/* Portfolio value */}
            <div style={{
              background: "rgba(56,189,248,0.07)",
              border: `1px solid rgba(56,189,248,0.15)`,
              borderRadius: 16,
              padding: "14px 18px",
              minWidth: 140,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <Wallet size={13} color={T.blue} strokeWidth={2} />
                <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px" }}>Portfolio</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: T.text, fontFamily: T.fontMono, letterSpacing: "-0.8px" }}>
                ${portfolioValue > 0 ? portfolioValue.toLocaleString("es-AR") : "—"}
              </div>
            </div>
            {/* Cash */}
            <div style={{
              background: "rgba(0,245,160,0.06)",
              border: `1px solid rgba(0,245,160,0.12)`,
              borderRadius: 16,
              padding: "14px 18px",
              minWidth: 140,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <DollarSign size={13} color={T.green} strokeWidth={2} />
                <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px" }}>Cash</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: T.green, fontFamily: T.fontMono, letterSpacing: "-0.8px" }}>
                ${capital > 0 ? capital.toLocaleString("es-AR") : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Readiness banner
function ReadinessBanner({ readiness, readinessColor }) {
  const isOk = readiness?.mode === "real_capital_ok";
  const scorePct = readiness?.scorePct ?? 0;
  const stage = readiness?.capitalPolicy?.stage;
  const blockers = readiness?.blockers || [];

  // Stage progression steps
  const STAGES = ["paper_only", "minimal", "pilot", "cautious", "scaled", "full"];
  const stageIdx = STAGES.indexOf(stage || "paper_only");

  return (
    <div style={{
      background: isOk ? "rgba(0,245,160,0.04)" : "rgba(255,51,102,0.03)",
      border: `1px solid ${readinessColor}15`,
      borderRadius: 20,
      padding: "20px 24px",
      marginBottom: 20,
      overflow: "hidden",
      position: "relative",
    }}>
      {/* Subtle glow accent */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${readinessColor}60, transparent)`,
      }} />

      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        {/* Grade badge */}
        <div style={{
          width: 52, height: 52, borderRadius: 16,
          background: `linear-gradient(135deg, ${readinessColor}, ${readinessColor}70)`,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          boxShadow: `0 6px 20px ${readinessColor}25`,
        }}>
          <span style={{ fontSize: 7, fontWeight: 800, color: "#000", fontFamily: T.fontMono, lineHeight: 1, opacity: 0.7 }}>GRADE</span>
          <span style={{ fontSize: 22, fontWeight: 900, color: "#000", fontFamily: T.fontMono, lineHeight: 1 }}>{readiness?.grade || "—"}</span>
        </div>

        {/* Info column */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: readinessColor, letterSpacing: "-0.2px" }}>
              {isOk ? "Capital Real Habilitado" : "Modo Paper Trading"}
            </span>
            {stage && (
              <span style={{
                fontSize: 9, fontWeight: 800, padding: "3px 10px", borderRadius: 12,
                background: `${readinessColor}12`, border: `1px solid ${readinessColor}20`,
                fontFamily: T.fontMono, letterSpacing: "0.5px", textTransform: "uppercase",
                color: readinessColor,
              }}>
                {stage}
              </span>
            )}
          </div>

          {/* Stage progression dots */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {STAGES.map((s, i) => (
              <div key={s} style={{
                flex: 1, height: 3, borderRadius: 2,
                background: i <= stageIdx ? readinessColor : "rgba(148,163,184,0.1)",
                opacity: i <= stageIdx ? (i === stageIdx ? 1 : 0.5) : 1,
                transition: "all 0.4s ease",
              }} />
            ))}
          </div>

          {/* Summary - compact */}
          <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>
            {readiness?.capitalPolicy?.summary || readiness?.summary || "Evaluando readiness..."}
          </div>

          {/* Inline blockers */}
          {blockers.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {blockers.slice(0, 3).map((b, i) => (
                <span key={i} style={{
                  fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 10,
                  background: "rgba(255,51,102,0.08)", border: "1px solid rgba(255,51,102,0.15)",
                  color: T.red, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {b}
                </span>
              ))}
              {blockers.length > 3 && (
                <span style={{ fontSize: 10, color: T.textDim, alignSelf: "center" }}>
                  +{blockers.length - 3} mas
                </span>
              )}
            </div>
          )}
        </div>

        {/* Score with mini ring */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <div style={{ position: "relative", width: 56, height: 56 }}>
            <svg width={56} height={56} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={28} cy={28} r={22} fill="none" stroke="rgba(148,163,184,0.08)" strokeWidth={4} />
              <circle cx={28} cy={28} r={22} fill="none"
                stroke={readinessColor} strokeWidth={4}
                strokeDasharray={2 * Math.PI * 22}
                strokeDashoffset={2 * Math.PI * 22 * (1 - scorePct / 100)}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 1s ease" }}
              />
            </svg>
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: readinessColor, fontFamily: T.fontMono }}>
                {scorePct}
              </span>
            </div>
          </div>
          <span style={{ fontSize: 8, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px" }}>Score</span>
        </div>
      </div>
    </div>
  );
}

// Pick card for top picks grid
function PickCard({ item, index, onClick }) {
  const [hovered, setHovered] = useState(false);
  const signalColor = item.scores.signalColor || signalColors[item.scores.signal] || T.textDim;
  const month1 = item.technical?.indicators?.performance?.month1 || 0;
  const isPositive = month1 >= 0;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        background: T.bgCard,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: `1px solid ${hovered ? signalColor + "35" : T.border}`,
        borderTop: `2px solid ${signalColor}`,
        borderRadius: 18,
        padding: "18px 20px",
        cursor: "pointer",
        transition: "all 0.22s cubic-bezier(0.4,0,0.2,1)",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hovered
          ? `0 14px 40px rgba(0,0,0,0.45), 0 0 20px ${signalColor}10`
          : `0 2px 8px rgba(0,0,0,0.25)`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Rank badge */}
      <div style={{
        position: "absolute",
        top: 14, right: 14,
        fontSize: 10, fontWeight: 800,
        color: index < 3 ? ["#fbbf24", "#94a3b8", "#fb923c"][index] : T.textDark,
        fontFamily: T.fontMono,
      }}>
        #{index + 1}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 900, color: T.text, fontFamily: T.fontMono, letterSpacing: "-0.5px" }}>
            {item.cedear.ticker}
          </div>
          <div style={{ fontSize: 11, color: T.textDim, marginTop: 2, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.cedear.name}
          </div>
        </div>
      </div>

      {/* Signal badge */}
      <div style={{ marginBottom: 12 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "4px 10px", borderRadius: 16,
          fontSize: 9, fontWeight: 800,
          letterSpacing: "0.8px",
          background: `${signalColor}12`,
          color: signalColor,
          border: `1px solid ${signalColor}25`,
          fontFamily: T.fontMono,
          textTransform: "uppercase",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: signalColor, flexShrink: 0 }} />
          {item.scores.signal}
        </span>
      </div>

      {/* Score bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, fontWeight: 600 }}>SCORE</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: signalColor, fontFamily: T.fontMono }}>{item.scores.composite}</span>
        </div>
        <div style={{ height: 4, background: "rgba(148,163,184,0.07)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${item.scores.composite}%`,
            background: `linear-gradient(90deg, ${signalColor}70, ${signalColor})`,
            borderRadius: 4,
            boxShadow: `0 0 8px ${signalColor}40`,
          }} />
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, fontFamily: T.fontMono }}>
          ${item.priceARS?.toLocaleString("es-AR") || "—"}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 800, fontFamily: T.fontMono,
          color: isPositive ? T.green : T.red,
          display: "flex", alignItems: "center", gap: 3,
        }}>
          {isPositive
            ? <TrendingUp size={11} strokeWidth={2.5} />
            : <TrendingDown size={11} strokeWidth={2.5} />
          }
          {isPositive ? "+" : ""}{month1.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

export default function DashboardView({
  portfolioValue,
  capital,
  portfolioCount,
  showCapitalInput,
  setShowCapitalInput,
  capitalToInvest,
  setCapitalToInvest,
  runAI,
  aiLoading,
  cooldownInfo,
  aiAnalysis,
  systemReadiness,
  topPicks,
  setView,
  executionAssistant,
  executionTickets,
  onRefreshExecutionTickets,
  onConfirmState,
}) {
  const [ticketBusyId, setTicketBusyId] = useState(null);
  const [ticketError, setTicketError] = useState(null);
  const totalWealth = portfolioValue + capital;
  const portfolioPct = totalWealth > 0 ? (portfolioValue / totalWealth) * 100 : 0;
  const readiness = aiAnalysis?._governance || systemReadiness;
  const readinessColor = getReadinessColor(readiness);
  const preflight = readiness?.preflight || null;
  const preflightMeta = getPreflightMeta(preflight);
  const preflightBlocked = preflight?.status === "blocked";

  const circuitBreaker = aiAnalysis?._circuit_breaker || aiAnalysis?.circuitBreaker;
  const spyReturn = aiAnalysis?.spyReturn ?? aiAnalysis?.benchmark?.spyReturn ?? aiAnalysis?.resultado?.spyReturnPct;
  const portfolioReturn = aiAnalysis?.portfolioReturn ?? aiAnalysis?.resultado?.returnPct;
  const alpha = (portfolioReturn != null && spyReturn != null) ? (portfolioReturn - spyReturn) : null;
  const commissionPct = aiAnalysis?.commissionPct ?? 0.6;
  const ticketSummary = executionAssistant?.summary || null;

  const runTicketAction = async (action, ticketId) => {
    setTicketBusyId(ticketId);
    setTicketError(null);
    try {
      if (action === "confirm") await api.confirmExecutionTicket(ticketId);
      if (action === "reject") await api.rejectExecutionTicket(ticketId);
      if (action === "executed") await api.markExecutionTicketExecuted(ticketId);
      if (onRefreshExecutionTickets) await onRefreshExecutionTickets();
    } catch (err) {
      setTicketError(err.message);
    } finally {
      setTicketBusyId(null);
    }
  };

  // Worst performers from portfolio
  const worstPerformers = useMemo(() => {
    if (!topPicks || topPicks.length === 0) return [];
    const withPerf = topPicks
      .map((item) => ({
        ticker: item.cedear.ticker,
        name: item.cedear.name,
        month1: item.technical?.indicators?.performance?.month1 || 0,
        daysHeld: item.daysHeld || null,
      }))
      .sort((a, b) => a.month1 - b.month1);
    return withPerf.slice(0, 3);
  }, [topPicks]);

  return (
    <div style={{ padding: "28px 32px 40px", maxWidth: 1440, margin: "0 auto" }}>

      {/* ── Circuit Breaker Banner ── */}
      {circuitBreaker && (circuitBreaker.active || circuitBreaker.severity === "critical") && (
        <div style={{
          background: "rgba(255,51,102,0.12)",
          border: `2px solid ${T.red}`,
          borderRadius: 14,
          padding: "16px 22px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}>
          <AlertTriangle size={22} color={T.red} strokeWidth={2.5} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.red }}>
              Circuit Breaker Activo: {circuitBreaker.reason || "Condiciones de mercado extremas"}
            </div>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>
              Operaciones satellite suspendidas. Solo se mantiene el core (SPY/QQQ).
            </div>
          </div>
        </div>
      )}

      {/* ── Hero: total wealth ── */}
      <HeroCard
        totalWealth={totalWealth}
        portfolioValue={portfolioValue}
        capital={capital}
        portfolioPct={portfolioPct}
        portfolioCount={portfolioCount}
      />

      {/* ── Benchmark comparison + Commission estimate ── */}
      {(alpha != null || totalWealth > 0) && (
        <div style={{
          display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap",
        }}>
          {alpha != null && (
            <div style={{
              flex: 1, minWidth: 280,
              background: "rgba(15,23,42,0.55)",
              border: `1px solid ${T.border}`,
              borderRadius: 14,
              padding: "14px 18px",
              display: "flex", alignItems: "center", gap: 14,
            }}>
              <TrendingUp size={16} color={alpha >= 0 ? T.green : T.red} />
              <div style={{ fontSize: 13, color: T.textMuted, fontFamily: T.fontMono }}>
                Tu portfolio: <span style={{ color: portfolioReturn >= 0 ? T.green : T.red, fontWeight: 700 }}>{portfolioReturn >= 0 ? "+" : ""}{portfolioReturn?.toFixed(2)}%</span>
                {" | "}
                SPY (benchmark): <span style={{ fontWeight: 700, color: T.textMuted }}>{spyReturn >= 0 ? "+" : ""}{spyReturn?.toFixed(2)}%</span>
                {" | "}
                Alpha: <span style={{ color: alpha >= 0 ? T.green : T.red, fontWeight: 800 }}>{alpha >= 0 ? "+" : ""}{alpha.toFixed(2)}%</span>
              </div>
            </div>
          )}
          <div style={{
            minWidth: 220,
            background: "rgba(15,23,42,0.55)",
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            padding: "14px 18px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <DollarSign size={14} color={T.textDim} />
            <span style={{ fontSize: 12, color: T.textDim }}>
              Comisiones estimadas (round trip): ~{commissionPct}%
            </span>
          </div>
        </div>
      )}

      {/* ── Readiness banner ── */}
      <ReadinessBanner readiness={readiness} readinessColor={readinessColor} />

      {preflight && (
        <div style={{
          background: `${preflightMeta.color}06`,
          border: `1px solid ${preflightMeta.color}12`,
          borderRadius: 16,
          padding: "12px 18px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: preflightMeta.color,
            boxShadow: `0 0 8px ${preflightMeta.color}60`,
            flexShrink: 0,
          }} />
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: preflightMeta.color }}>
              {preflightMeta.label}
            </span>
            <span style={{ fontSize: 11, color: T.textDim }}>
              {preflight.summary ? (preflight.summary.length > 80 ? preflight.summary.slice(0, 80) + "..." : preflight.summary) : "Sin estado disponible"}
            </span>
          </div>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "3px 10px", borderRadius: 10,
            background: `${preflightMeta.color}12`, border: `1px solid ${preflightMeta.color}20`,
            color: preflightMeta.color, fontFamily: T.fontMono, textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}>
            {preflight.latestStatus ? String(preflight.latestStatus).toUpperCase() : "—"}
          </span>
        </div>
      )}

      {/* ── Welcome / Quick Start (no data yet) ── */}
      {!aiAnalysis && !aiLoading && (
        <WelcomeView
          setView={setView}
          readiness={readiness}
          portfolioValue={portfolioValue}
          capital={capital}
        />
      )}

      {/* ── AI Analysis Panel ── */}
      <div style={{
        background: "rgba(56,189,248,0.05)",
        border: `1px solid rgba(56,189,248,0.12)`,
        borderLeft: `3px solid ${T.blue}`,
        borderRadius: 18,
        padding: "20px 24px",
        marginBottom: 28,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 44, height: 44,
              borderRadius: 13,
              background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 4px 16px ${T.blue}30`,
              flexShrink: 0,
            }}>
              <Brain size={20} color="#020617" strokeWidth={1.8} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text, letterSpacing: "-0.2px" }}>
                Análisis Mensual con IA
              </div>
              <div style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>
                Claude analiza 226+ CEDEARs bajo gobernanza de capital
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {showCapitalInput ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <input
                    type="number"
                    value={capitalToInvest}
                    onChange={(e) => setCapitalToInvest(e.target.value)}
                    placeholder="Cuánto invertís este mes (ARS)"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") runAI(parseFloat(capitalToInvest) || 0);
                      if (e.key === "Escape") { setShowCapitalInput(false); setCapitalToInvest(""); }
                    }}
                    style={{
                      ...S.input, width: 220, fontSize: 13,
                      borderColor: `rgba(56,189,248,0.3)`,
                    }}
                  />
                  <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, paddingLeft: 2 }}>
                    Última disponibilidad registrada: ${(capital || 0).toLocaleString("es-AR")} ARS
                  </span>
                </div>
                <button
                  onClick={() => runAI(parseFloat(capitalToInvest) || 0)}
                  disabled={aiLoading}
                  style={{
                    ...S.btn("primary"),
                    opacity: aiLoading ? 0.6 : 1,
                    fontSize: 13, padding: "10px 18px",
                  }}
                >
                  <Play size={13} strokeWidth={2.5} />
                  {aiLoading ? "Analizando…" : "Ejecutar"}
                </button>
                <button
                  onClick={() => { setShowCapitalInput(false); setCapitalToInvest(""); }}
                  style={{ ...S.btn("ghost"), fontSize: 13, padding: "10px 14px" }}
                  title="Cancelar (Esc)"
                >
                  <X size={13} strokeWidth={2.5} />
                </button>
              </>
            ) : (
              <button
                onClick={() => { setCapitalToInvest(""); setShowCapitalInput(true); }}
                disabled={aiLoading}
                style={{
                  ...S.btn("primary"),
                  fontSize: 13, padding: "10px 18px",
                  opacity: aiLoading ? 0.5 : 1,
                  cursor: aiLoading ? "not-allowed" : "pointer",
                }}
              >
                <Zap size={13} strokeWidth={2.5} />
                {aiLoading ? "Analizando…" : "Nuevo Análisis"}
              </button>
            )}
          </div>
        </div>

        {cooldownInfo && (
          <div style={{ marginTop: 14 }}>
            <StatusMsg type="warning">{cooldownInfo.message}</StatusMsg>
          </div>
        )}

        {preflightBlocked && (
          <div style={{ marginTop: 14 }}>
            <StatusMsg type="error">
              {preflight?.summary || "Preflight bloqueado. No abras posiciones nuevas hasta normalizar el sistema."}
            </StatusMsg>
          </div>
        )}

        {aiLoading && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Skeleton width="100%" height={12} radius={6} />
              <Skeleton width="72%" height={12} radius={6} />
              <Skeleton width="88%" height={12} radius={6} />
            </div>
          </div>
        )}

        {aiAnalysis && !aiLoading && !aiAnalysis.error && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {aiAnalysis.sin_cambios_necesarios && (
              <div style={{
                background: "rgba(0,245,160,0.06)",
                border: `1px solid rgba(0,245,160,0.18)`,
                borderRadius: 12, padding: "12px 16px",
              }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: T.green, marginBottom: 3 }}>
                  ✓ Cartera alineada
                </div>
                <div style={{ fontSize: 12, color: T.textMuted }}>
                  {aiAnalysis.mensaje_sin_cambios || "Sin cambios necesarios."}
                </div>
              </div>
            )}
            {aiAnalysis.resumen_mercado && (
              <div style={{
                background: "rgba(56,189,248,0.04)",
                border: `1px solid rgba(56,189,248,0.12)`,
                borderRadius: 12, padding: "12px 16px",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.blue, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 6 }}>
                  Resumen Mercado
                </div>
                <p style={{ margin: 0, color: T.textMuted, fontSize: 13, lineHeight: 1.7 }}>
                  {aiAnalysis.resumen_mercado}
                </p>
              </div>
            )}
          </div>
        )}
        {aiAnalysis?.error && (
          <div style={{ marginTop: 14 }}>
            <StatusMsg type="error">Error: {aiAnalysis.error}</StatusMsg>
          </div>
        )}
      </div>

      <div style={{
        background: "rgba(15,23,42,0.62)",
        border: `1px solid ${T.border}`,
        borderRadius: 18,
        padding: "20px 24px",
        marginBottom: 28,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Tickets de Confirmación</div>
            <div style={{ fontSize: 12, color: T.textDim, marginTop: 4 }}>
              {executionAssistant?.modeMeta?.label || "Manual por Demanda"} · Confirmación obligatoria antes de mover plata real.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ ...S.badge(T.blue), fontSize: 10 }}>
              Abiertos: {ticketSummary?.openTickets ?? executionTickets?.length ?? 0}
            </span>
            <span style={{ ...S.badge(T.red), fontSize: 10 }}>
              Críticos: {ticketSummary?.criticalOpen ?? 0}
            </span>
          </div>
        </div>

        {ticketError && <StatusMsg type="error">{ticketError}</StatusMsg>}

        {!executionTickets || executionTickets.length === 0 ? (
          <div style={{ fontSize: 13, color: T.textDim, lineHeight: 1.7 }}>
            No hay tickets abiertos. Corré un análisis para que el sistema te deje operaciones confirmables.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {executionTickets.slice(0, 6).map((ticket) => {
              const actionColor = ticket.action === "BUY" ? T.green : T.red;
              const priorityColor = ticket.priority === "critical" ? T.red : T.blue;
              const isBusy = ticketBusyId === ticket.id;
              return (
                <div
                  key={ticket.id}
                  style={{
                    padding: "16px 18px",
                    borderRadius: 16,
                    border: `1px solid ${ticket.priority === "critical" ? `${T.red}25` : T.border}`,
                    background: ticket.priority === "critical" ? `${T.red}07` : "rgba(148,163,184,0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 900, color: T.text, fontFamily: T.fontMono }}>{ticket.ticker}</span>
                        <span style={{ ...S.badge(actionColor), fontSize: 9 }}>{ticket.action}</span>
                        <span style={{ ...S.badge(priorityColor), fontSize: 9 }}>{ticket.priority === "critical" ? "CRÍTICO" : "NORMAL"}</span>
                        {ticket.subtype && <span style={{ ...S.badge(T.textDim), fontSize: 9 }}>{ticket.subtype}</span>}
                      </div>
                      <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.7, marginBottom: 10 }}>
                        {ticket.rationale || ticket.execution_note || "Sin tesis resumida."}
                      </div>
                      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>
                        <span>Cant: {ticket.shares || 0}</span>
                        <span>Precio: {formatMoney(ticket.limit_price_ars)}</span>
                        <span>Monto: {formatMoney(ticket.estimated_amount_ars)}</span>
                        {ticket.target_pct != null && <span>Target: +{Number(ticket.target_pct).toFixed(1)}%</span>}
                        {ticket.stop_loss_pct != null && <span>Stop: {Number(ticket.stop_loss_pct).toFixed(1)}%</span>}
                        {ticket.conviction != null && <span>Convicción: {ticket.conviction}</span>}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {ticket.status === "pending_confirmation" && (
                        <>
                          <button
                            onClick={() => onConfirmState?.({
                              title: `${ticket.action} ${ticket.ticker}`,
                              description: "Vas a confirmar este ticket para ejecución manual posterior. El sistema no enviará la orden al broker por su cuenta.",
                              confirmLabel: "Confirmar ticket",
                              variant: ticket.action === "BUY" ? "blue" : "danger",
                              tokenWarning: "Esta acción no consume IA. Solo cambia el estado operativo del ticket.",
                              onConfirm: () => runTicketAction("confirm", ticket.id),
                            })}
                            disabled={isBusy}
                            style={{ ...S.btn("secondary"), opacity: isBusy ? 0.7 : 1, fontSize: 12 }}
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => runTicketAction("reject", ticket.id)}
                            disabled={isBusy}
                            style={{ ...S.btn("ghost"), opacity: isBusy ? 0.7 : 1, fontSize: 12 }}
                          >
                            Rechazar
                          </button>
                        </>
                      )}
                      {ticket.status === "confirmed" && (
                        <button
                          onClick={() => runTicketAction("executed", ticket.id)}
                          disabled={isBusy}
                          style={{ ...S.btn("primary"), opacity: isBusy ? 0.7 : 1, fontSize: 12 }}
                        >
                          Marcar Ejecutada
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Top Picks ── */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{
                width: 3, height: 20,
                background: `linear-gradient(180deg, ${T.green}, ${T.cyan})`,
                borderRadius: 2,
              }} />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: "-0.4px" }}>
                Top Picks del Mes
              </h2>
            </div>
            <div style={{ fontSize: 12, color: T.textDim, marginLeft: 13 }}>
              CEDEARs con mejor score compuesto
            </div>
          </div>
          <button
            onClick={() => setView("ranking")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "transparent",
              border: `1px solid ${T.border}`,
              borderRadius: 10, padding: "8px 14px",
              color: T.textDim, cursor: "pointer",
              fontSize: 12, fontWeight: 600, fontFamily: T.font,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.borderLight; e.currentTarget.style.color = T.textMuted; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textDim; }}
          >
            Ver todos <ArrowUpRight size={13} strokeWidth={2} />
          </button>
        </div>

        {topPicks.length === 0 ? (
          <div style={{ ...S.grid(220), gap: 14 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((v) => (
              <div key={v} style={{
                background: T.bgCard, borderRadius: 18, padding: 20,
                border: `1px solid ${T.border}`,
                animation: `fadeUp 0.4s ease ${v * 0.04}s both`,
              }}>
                <Skeleton width="60%" height={18} radius={6} />
                <div style={{ height: 8 }} />
                <Skeleton width="90%" height={11} radius={5} />
                <div style={{ height: 14 }} />
                <Skeleton width="100%" height={4} radius={4} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ ...S.grid(220), gap: 14 }}>
            {topPicks.map((item, index) => (
              <PickCard
                key={item.cedear.ticker}
                item={item}
                index={index}
                onClick={() => setView("ranking")}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Worst Performers ── */}
      {worstPerformers.length > 0 && worstPerformers[0].month1 < 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{
              width: 3, height: 20,
              background: `linear-gradient(180deg, ${T.red}, ${T.orange})`,
              borderRadius: 2,
            }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: "-0.4px" }}>
              Peores Performers del Mes
            </h2>
            <span style={{ fontSize: 12, color: T.textDim, marginLeft: 8 }}>
              Educarse sobre el riesgo es clave
            </span>
          </div>

          <div style={{ ...S.grid(220), gap: 14 }}>
            {worstPerformers.map((item) => (
              <div
                key={item.ticker}
                style={{
                  background: "rgba(255,51,102,0.04)",
                  border: `1px solid rgba(255,51,102,0.15)`,
                  borderTop: `2px solid ${T.red}`,
                  borderRadius: 18,
                  padding: "18px 20px",
                }}
              >
                <div style={{ fontSize: 17, fontWeight: 900, color: T.text, fontFamily: T.fontMono, letterSpacing: "-0.5px", marginBottom: 4 }}>
                  {item.ticker}
                </div>
                <div style={{ fontSize: 11, color: T.textDim, marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.name}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, fontFamily: T.fontMono, color: T.red, display: "flex", alignItems: "center", gap: 4 }}>
                    <TrendingDown size={13} strokeWidth={2.5} />
                    {item.month1.toFixed(1)}%
                  </span>
                  {item.daysHeld != null && (
                    <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>
                      {item.daysHeld}d en cartera
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
