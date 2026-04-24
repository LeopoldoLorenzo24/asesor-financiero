import React from "react";
import { T, S } from "../theme";
import { GlassCard } from "../components/common";
import Tooltip, { InfoBadge } from "../components/Tooltip";

const actions = [
  {
    icon: "◈",
    title: "Análisis con IA",
    desc: "Genera picks mensuales bajo gobernanza de capital",
    color: T.blue,
    view: "dashboard",
    tip: "Claude analiza ~226 CEDEARs, corre backtests y genera un plan ejecutable. Cooldown de 1 hora.",
  },
  {
    icon: "◎",
    title: "Ranking",
    desc: "Score compuesto de todos los CEDEARs",
    color: T.cyan,
    view: "ranking",
    tip: "Ranking con scores técnicos y fundamentales. Filtrá por sector y ordená por métrica.",
  },
  {
    icon: "●",
    title: "Paper Trading",
    desc: "Simulación realista con costos argentinos",
    color: T.purple,
    view: "paper",
    tip: "Sincroniza picks automáticamente. Incluye comisiones, lotes BYMA, slippage y dividendos.",
  },
  {
    icon: "◉",
    title: "Track Record",
    desc: "Evidencia de performance vs SPY",
    color: T.green,
    view: "trackrecord",
    tip: "Registro diario de valor virtual, real, benchmark, alpha, drawdown y Sharpe. Exportable a CSV.",
  },
  {
    icon: "◐",
    title: "Readiness",
    desc: "Estado de habilitación para capital real",
    color: T.gold,
    view: "readiness",
    tip: "11 reglas de gobernanza: macro, stress tests, costs, 2FA. Sharpe ≥1.0, drawdown <15%, 90 días.",
  },
  {
    icon: "◇",
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

  return (
    <div style={{ maxWidth: 1400 }}>
      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: 48, animation: "fadeUp 0.6s ease" }}>
        <div style={{
          width: 80, height: 80,
          background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`,
          borderRadius: 24,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 36, fontWeight: 900, color: T.bg,
          fontFamily: T.fontMono,
          boxShadow: `0 12px 48px ${T.green}40`,
          marginBottom: 24,
          animation: "float 3s ease-in-out infinite",
        }}>
          ₵
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 900, margin: "0 0 12px", letterSpacing: "-1px", color: T.text }}>
          Bienvenido a <span style={{ background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CEDEAR Advisor</span>
        </h1>
        <p style={{ fontSize: 14, color: T.textMuted, maxWidth: 520, margin: "0 auto", lineHeight: 1.8 }}>
          Tu motor de inversión con IA. Filosofía Core/Satellite, gobernanza de capital, y evidencia real.
        </p>
      </div>

      {/* Status Card */}
      <GlassCard style={{ marginBottom: 32, borderColor: `${T.blue}20`, animation: "fadeUp 0.6s ease 0.1s both" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            background: readiness?.mode === "real_capital_ok"
              ? `linear-gradient(135deg, ${T.green}, ${T.teal})`
              : `linear-gradient(135deg, ${T.blue}, ${T.cyan})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, flexShrink: 0,
            boxShadow: `0 8px 32px ${readiness?.mode === "real_capital_ok" ? T.green : T.blue}30`,
          }}>
            {readiness?.mode === "real_capital_ok" ? "✓" : "◎"}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: readiness?.mode === "real_capital_ok" ? T.green : T.blue, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>
              {readiness?.mode === "real_capital_ok" ? "Capital Real Habilitado" : "Paper Trading Activo"}
            </div>
            <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.7 }}>
              {hasData
                ? `Patrimonio: $${totalWealth.toLocaleString("es-AR")} · ${readiness?.summary || "Evaluando readiness..."}`
                : "No tenés posiciones registradas todavía. Empezá con un Análisis de IA o registrá tu primera operación."
              }
            </div>
          </div>
          <div style={{ textAlign: "right", minWidth: 160 }}>
            <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 6 }}>Readiness</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: readiness?.mode === "real_capital_ok" ? T.green : T.blue, fontFamily: T.fontMono }}>
              {readiness?.scorePct ?? 0}%
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Quick Actions Grid */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...S.label, marginBottom: 20 }}>Acciones Rápidas</div>
        <div style={{ ...S.grid(280), gap: 16 }}>
          {actions.map((action, i) => (
            <Tooltip key={action.view} content={action.tip} position="bottom">
              <GlassCard
                onClick={() => setView(action.view)}
                style={{
                  cursor: "pointer",
                  borderLeft: `3px solid ${action.color}`,
                  animation: `fadeUp 0.5s ease ${0.15 + i * 0.05}s both`,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 14,
                    background: `${action.color}15`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, color: action.color,
                    flexShrink: 0,
                    boxShadow: `0 4px 16px ${action.color}15`,
                  }}>
                    {action.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 4, display: "flex", alignItems: "center" }}>
                      {action.title}
                      <InfoBadge tooltip={action.tip} color={action.color} />
                    </div>
                    <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>{action.desc}</div>
                  </div>
                </div>
              </GlassCard>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Tips */}
      <GlassCard style={{ marginTop: 16, borderColor: `${T.yellow}15`, background: `${T.yellow}03` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>💡</span>
          <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.7 }}>
            <strong style={{ color: T.yellow }}>Tip:</strong> El sistema opera bajo la filosofía Core/Satellite. SPY es el default — solo se recomiendan picks individuales cuando hay convicción REAL de que le ganan al mercado. Todo pasa por paper trading con costos reales antes de habilitar capital.
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
