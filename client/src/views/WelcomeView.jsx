import React from "react";
import {
  Brain, BarChart2, FlaskConical, Trophy,
  ShieldCheck, Wallet, CheckCircle, Lightbulb,
  ChevronRight,
} from "lucide-react";
import { T, S } from "../theme";
import { GlassCard } from "../components/common";
import Tooltip, { InfoBadge } from "../components/Tooltip";

const actions = [
  {
    Icon: Brain,
    title: "Análisis con IA",
    desc: "Genera picks mensuales bajo gobernanza de capital",
    color: T.blue,
    view: "dashboard",
    tip: "Claude analiza ~226 CEDEARs, corre backtests y genera un plan ejecutable. Cooldown de 1 hora.",
  },
  {
    Icon: BarChart2,
    title: "Ranking",
    desc: "Score compuesto de todos los CEDEARs",
    color: T.cyan,
    view: "ranking",
    tip: "Ranking con scores técnicos y fundamentales. Filtrá por sector y ordená por métrica.",
  },
  {
    Icon: FlaskConical,
    title: "Paper Trading",
    desc: "Simulación realista con costos argentinos",
    color: T.purple,
    view: "paper",
    tip: "Sincroniza picks automáticamente. Incluye comisiones, lotes BYMA, slippage y dividendos.",
  },
  {
    Icon: Trophy,
    title: "Track Record",
    desc: "Evidencia de performance vs SPY",
    color: T.green,
    view: "trackrecord",
    tip: "Registro diario de valor virtual, real, benchmark, alpha, drawdown y Sharpe. Exportable a CSV.",
  },
  {
    Icon: ShieldCheck,
    title: "Readiness",
    desc: "Estado de habilitación para capital real",
    color: T.yellow,
    view: "readiness",
    tip: "11 reglas de gobernanza: macro, stress tests, costs, 2FA. Sharpe ≥1.0, drawdown <15%, 90 días.",
  },
  {
    Icon: Wallet,
    title: "Operaciones",
    desc: "Registro de transacciones manuales",
    color: T.teal,
    view: "operaciones",
    tip: "Registrá compras y ventas manuales. El sistema calcula P&L, costos promedio y performance.",
  },
];

export default function WelcomeView({ setView, readiness, portfolioValue, capital }) {
  const totalWealth = portfolioValue + capital;
  const hasData = totalWealth > 0;
  const isReady = readiness?.mode === "real_capital_ok";
  const statusColor = isReady ? T.green : T.blue;

  return (
    <div style={{ maxWidth: 1400 }}>
      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: 44, animation: "fadeUp 0.55s ease" }}>
        <div style={{
          width: 76, height: 76,
          background: `linear-gradient(135deg, ${T.green} 0%, ${T.cyan} 100%)`,
          borderRadius: 22,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 12px 48px ${T.green}38, inset 0 1px 0 rgba(255,255,255,0.2)`,
          marginBottom: 24,
          animation: "float 4s ease-in-out infinite",
          position: "relative",
          overflow: "hidden",
        }}>
          <span style={{ fontFamily: T.fontMono, fontWeight: 900, fontSize: 24, color: "#020617", position: "relative", zIndex: 2, letterSpacing: "-1px" }}>CA</span>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.2) 50%, transparent 70%)" }} />
        </div>

        <h1 style={{ fontSize: 30, fontWeight: 900, margin: "0 0 12px", letterSpacing: "-0.8px", color: T.text }}>
          Bienvenido a{" "}
          <span style={{
            background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            CEDEAR Advisor
          </span>
        </h1>
        <p style={{ fontSize: 14, color: T.textMuted, maxWidth: 480, margin: "0 auto", lineHeight: 1.8 }}>
          Motor de inversión con IA. Filosofía Core/Satellite, gobernanza de capital, y evidencia real.
        </p>
      </div>

      {/* Status card */}
      <GlassCard
        glowColor={statusColor}
        style={{
          marginBottom: 32,
          borderColor: `${statusColor}20`,
          animation: "fadeUp 0.55s ease 0.08s both",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: isReady
              ? `linear-gradient(135deg, ${T.green}, ${T.teal})`
              : `linear-gradient(135deg, ${T.blue}, ${T.cyan})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            boxShadow: `0 6px 24px ${statusColor}28`,
          }}>
            {isReady
              ? <CheckCircle size={26} color="#020617" strokeWidth={2} />
              : <ShieldCheck size={26} color="#020617" strokeWidth={2} />
            }
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: statusColor, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>
              {isReady ? "Capital Real Habilitado" : "Paper Trading Activo"}
            </div>
            <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.7, maxWidth: 520 }}>
              {hasData
                ? `Patrimonio: $${totalWealth.toLocaleString("es-AR")} · ${readiness?.summary || "Evaluando readiness…"}`
                : "No tenés posiciones registradas todavía. Empezá con un Análisis de IA o registrá tu primera operación."
              }
            </div>
          </div>
          <div style={{ textAlign: "right", minWidth: 140 }}>
            <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 6 }}>
              Readiness
            </div>
            <div style={{ fontSize: 30, fontWeight: 900, color: statusColor, fontFamily: T.fontMono, lineHeight: 1 }}>
              {readiness?.scorePct ?? 0}%
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Quick actions */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ ...S.label, marginBottom: 20 }}>Acciones rápidas</div>
        <div style={{ ...S.grid(280), gap: 14 }}>
          {actions.map(({ Icon, title, desc, color, view, tip }, i) => (
            <Tooltip key={view} content={tip} position="bottom">
              <GlassCard
                onClick={() => setView(view)}
                style={{
                  cursor: "pointer",
                  borderLeft: `3px solid ${color}`,
                  animation: `fadeUp 0.5s ease ${0.12 + i * 0.05}s both`,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12,
                    background: `${color}14`,
                    border: `1px solid ${color}22`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Icon size={18} color={color} strokeWidth={1.8} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 5, display: "flex", alignItems: "center", gap: 6 }}>
                      {title}
                      <InfoBadge tooltip={tip} color={color} />
                    </div>
                    <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>{desc}</div>
                  </div>
                  <ChevronRight size={14} color={T.textDark} style={{ flexShrink: 0, marginTop: 4 }} />
                </div>
              </GlassCard>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Tip banner */}
      <GlassCard style={{
        borderColor: `${T.yellow}15`,
        background: `${T.yellow}03`,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${T.yellow}12`,
            border: `1px solid ${T.yellow}22`,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Lightbulb size={16} color={T.yellow} strokeWidth={1.8} />
          </div>
          <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.7, paddingTop: 4 }}>
            <strong style={{ color: T.yellow }}>Tip:</strong>{" "}
            El sistema opera bajo la filosofía Core/Satellite. SPY es el default — solo se recomiendan picks individuales cuando hay convicción REAL de que le ganan al mercado. Todo pasa por paper trading con costos reales antes de habilitar capital.
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
