import React from "react";
import { TrendingDown, BarChart2, Activity, Zap, Wind, Waves, ShieldAlert, ShieldCheck } from "lucide-react";
import { T, S } from "../theme";
import { GlassCard, SectionHeader, Skeleton } from "../components/common";

const METRIC_DEFS = [
  {
    key: "maxDrawdown",
    label: "Max Drawdown",
    suffix: "%",
    Icon: TrendingDown,
    desc: "Caída máxima desde el pico",
    getColor: (v) => Math.abs(v ?? 100) <= 10 ? T.green : Math.abs(v ?? 100) <= 20 ? T.yellow : T.red,
    invert: true,
    period: "desde inicio",
    baseline: "SPY Max DD hist: ~-34%",
  },
  {
    key: "sharpeRatio",
    label: "Sharpe Ratio",
    suffix: "",
    Icon: BarChart2,
    desc: "Retorno ajustado por riesgo",
    getColor: (v) => (v ?? 0) >= 1 ? T.green : (v ?? 0) >= 0.75 ? T.yellow : T.red,
    period: "últimos 90 días",
    baseline: "SPY Sharpe: ~1.0",
  },
  {
    key: "sortinoRatio",
    label: "Sortino Ratio",
    suffix: "",
    Icon: Activity,
    desc: "Solo penaliza volatilidad negativa",
    getColor: (v) => (v ?? 0) >= 1.5 ? T.green : (v ?? 0) >= 0.75 ? T.yellow : T.red,
    period: "últimos 90 días",
    baseline: "SPY Sortino: ~1.2",
  },
  {
    key: "beta",
    label: "Beta",
    suffix: "",
    Icon: Zap,
    desc: "Sensibilidad relativa al mercado",
    getColor: (v) => Math.abs((v ?? 1) - 1) <= 0.3 ? T.green : Math.abs((v ?? 1) - 1) <= 0.6 ? T.yellow : T.red,
    period: "últimos 90 días",
    baseline: "SPY Beta: 1.0 (por definición)",
  },
  {
    key: "var95",
    label: "VaR 95% (diario)",
    suffix: "%",
    Icon: ShieldAlert,
    desc: "Pérdida máxima esperada (95% conf.)",
    getColor: (v) => Math.abs(v ?? 100) <= 2 ? T.green : Math.abs(v ?? 100) <= 4 ? T.yellow : T.red,
    invert: true,
    period: "diario, últimos 90 días",
    baseline: "SPY VaR 95% diario: ~-2%",
  },
  {
    key: "volatilityAnnualized",
    label: "Volatilidad Anual",
    suffix: "%",
    Icon: Wind,
    desc: "Desviación estándar anualizada",
    getColor: (v) => (v ?? 100) <= 15 ? T.green : (v ?? 100) <= 25 ? T.yellow : T.red,
    invert: true,
    period: "últimos 90 días",
    baseline: "SPY Vol hist: ~15-18%",
  },
];

function GaugeMini({ value, max = 100, color }) {
  const pct = Math.min(100, Math.max(0, (Math.abs(value ?? 0) / max) * 100));
  return (
    <div style={{ height: 3, background: "rgba(148,163,184,0.08)", borderRadius: 4, overflow: "hidden", marginTop: 10 }}>
      <div style={{
        width: `${pct}%`, height: "100%",
        background: `linear-gradient(90deg, ${color}60, ${color})`,
        borderRadius: 4,
        transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
      }} />
    </div>
  );
}

export default function RiskMetricsView({ metrics, loading }) {
  const data = metrics || {};

  const passCount = METRIC_DEFS.filter(({ key, getColor }) => {
    const v = data[key];
    return v != null && getColor(v) === T.green;
  }).length;

  return (
    <div className="ca-main" style={{ padding: "32px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader
        title="Métricas de Riesgo"
        subtitle="Análisis cuantitativo del portfolio"
        action={
          !loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {passCount >= 4
                ? <ShieldCheck size={16} color={T.green} />
                : <ShieldAlert size={16} color={T.yellow} />
              }
              <span style={{ fontSize: 12, color: T.textMuted, fontFamily: T.fontMono }}>
                {passCount}/{METRIC_DEFS.length} en zona segura
              </span>
            </div>
          )
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {METRIC_DEFS.map(({ key, label, suffix, Icon, desc, getColor, invert, period, baseline }, i) => {
          const raw = data[key];
          const value = raw != null ? raw : null;
          const color = value != null ? getColor(value) : T.textDark;
          const displayValue = value != null ? Math.abs(value).toFixed(2) : "—";
          const sign = invert && value != null && value > 0 ? "-" : "";
          const gaugeMax = key === "sharpeRatio" || key === "sortinoRatio" ? 3 : key === "beta" ? 2 : key === "maxDrawdown" ? 40 : key === "var95" ? 10 : 50;

          return (
            <GlassCard key={key} style={{ animation: `fadeUp 0.4s ease ${i * 60}ms both` }} glowColor={color}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <div style={{ ...S.label, marginBottom: 4 }}>{label}{period ? ` (${period})` : ""}</div>
                  <div style={{ fontSize: 11, color: T.textDark, lineHeight: 1.4 }}>{desc}</div>
                </div>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: `${color}12`,
                  border: `1px solid ${color}20`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Icon size={16} color={color} strokeWidth={1.8} />
                </div>
              </div>

              {loading ? (
                <Skeleton width="70%" height={32} />
              ) : (
                <>
                  <div style={{ fontSize: 32, fontWeight: 900, color, fontFamily: T.fontMono, letterSpacing: "-1px", lineHeight: 1 }}>
                    {sign}{displayValue}{value != null ? suffix : ""}
                  </div>
                  {value != null && <GaugeMini value={Math.abs(value)} max={gaugeMax} color={color} />}
                  {baseline && value != null && (
                    <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, marginTop: 6 }}>
                      {baseline}
                    </div>
                  )}
                </>
              )}

              {!loading && value != null && (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: color !== T.textDark ? `0 0 6px ${color}80` : "none" }} />
                  <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono }}>
                    {color === T.green ? "zona segura" : color === T.yellow ? "zona de alerta" : "zona de riesgo"}
                  </span>
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>

      {/* ── Metrics Reference Legend ── */}
      <div style={{ padding: 16, background: T.bgCard, borderRadius: 8, marginTop: 16, border: `1px solid ${T.border}` }}>
        <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: T.text }}>Referencia de métricas</h4>
        <p style={{ margin: "0 0 6px", fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>Sharpe {">"} 1.0 = bueno, {">"} 1.5 = excelente, {">"} 2.0 = excepcional</p>
        <p style={{ margin: "0 0 6px", fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>Max Drawdown {"<"} -5% = bajo riesgo, {"<"} -10% = moderado, {">"} -15% = alto riesgo</p>
        <p style={{ margin: "0 0 6px", fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>VaR 95% = pérdida máxima esperada en 19 de 20 días</p>
        <p style={{ margin: 0, fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>Beta = sensibilidad al mercado. Beta 1.5 = si SPY cae 10%, tu portfolio cae ~15%</p>
      </div>
    </div>
  );
}
