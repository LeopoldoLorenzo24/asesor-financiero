import React from "react";
import { CheckCircle2, GitBranch, AlertTriangle, Clock, Minus, Target } from "lucide-react";
import { T, S } from "../theme";
import { GlassCard, SectionHeader, Skeleton } from "../components/common";

const STAT_DEFS = [
  { key: "executed",  label: "Ejecutadas",  color: T.green,  Icon: CheckCircle2, desc: "Seguidas al pie de la letra" },
  { key: "partial",   label: "Parciales",   color: T.yellow, Icon: GitBranch,    desc: "Ejecutadas con variaciones" },
  { key: "deviated",  label: "Desviadas",   color: T.red,    Icon: AlertTriangle, desc: "No ejecutadas o contrariadas" },
  { key: "pending",   label: "Pendientes",  color: T.blue,   Icon: Clock,        desc: "Sin resolución aún" },
];

function DonutChart({ segments, size = 120 }) {
  const r = (size - 14) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(148,163,184,0.08)" strokeWidth={13} />
    </svg>
  );
  let offset = 0;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(148,163,184,0.05)" strokeWidth={13} />
      {segments.map((seg, i) => {
        if (!seg.value) return null;
        const pct = seg.value / total;
        const dash = pct * circumference;
        const gap = circumference - dash;
        const el = (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={13}
            strokeDasharray={`${dash - 2} ${gap + 2}`}
            strokeDashoffset={-offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)", filter: `drop-shadow(0 0 6px ${seg.color}60)` }}
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

export default function AdherenceView({ stats, loading }) {
  const s = stats || {};
  const total = s.totalRecommendations || 0;
  const executed = s.executed || 0;
  const partial = s.partial || 0;
  const deviated = s.deviated || 0;
  const pending = s.pending || 0;
  const avgDiscrepancy = s.avgDiscrepancyPercentage || 0;

  const adherenceRate = total > 0 ? ((executed / total) * 100).toFixed(1) : "—";
  const discrepancyColor = avgDiscrepancy <= 5 ? T.green : avgDiscrepancy <= 10 ? T.yellow : T.red;

  const donutSegments = [
    { value: executed, color: T.green },
    { value: partial, color: T.yellow },
    { value: deviated, color: T.red },
    { value: pending, color: T.blue },
  ];

  return (
    <div className="ca-main" style={{ padding: "32px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader title="Seguimiento de Adherencia" subtitle="Tasa de ejecución de recomendaciones del sistema" />

      {/* Hero summary */}
      <GlassCard style={{ marginBottom: 24, padding: "28px" }} glowColor={T.cyan}>
        <div style={{ display: "flex", alignItems: "center", gap: 36, flexWrap: "wrap" }}>
          {/* Donut chart */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            {loading ? (
              <div style={{ width: 120, height: 120, borderRadius: "50%", background: "rgba(148,163,184,0.06)" }} />
            ) : (
              <DonutChart segments={donutSegments} size={120} />
            )}
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: T.text, fontFamily: T.fontMono, lineHeight: 1 }}>
                {loading ? "—" : total}
              </div>
              <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px" }}>Total</div>
            </div>
          </div>

          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, flex: 1, minWidth: 240 }}>
            {STAT_DEFS.map(({ key, label, color, Icon, desc }) => {
              const value = s[key] || 0;
              const pct = total > 0 ? ((value / total) * 100).toFixed(0) : 0;
              return (
                <div key={key} style={{ padding: "14px 16px", borderRadius: 14, border: `1px solid ${color}20`, background: `${color}06`, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: color, borderRadius: "3px 0 0 3px" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Icon size={13} color={color} strokeWidth={2} />
                    <span style={{ fontSize: 10, color: T.textDim, fontWeight: 700, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px" }}>{label}</span>
                  </div>
                  {loading ? <Skeleton width="60%" height={22} /> : (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 26, fontWeight: 900, color, fontFamily: T.fontMono, lineHeight: 1 }}>{value}</span>
                      <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{pct}%</span>
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: T.textDark, marginTop: 4 }}>{desc}</div>
                </div>
              );
            })}
          </div>

          {/* Right: key metrics */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 160 }}>
            <div style={{ padding: "16px 18px", borderRadius: 14, background: `${T.cyan}08`, border: `1px solid ${T.cyan}20`, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 6 }}>Tasa de Adherencia</div>
              {loading ? <Skeleton width="80px" height={28} style={{ margin: "0 auto" }} /> : (
                <div style={{ fontSize: 32, fontWeight: 900, color: T.cyan, fontFamily: T.fontMono, lineHeight: 1 }}>{adherenceRate}{total > 0 ? "%" : ""}</div>
              )}
            </div>
            <div style={{ padding: "16px 18px", borderRadius: 14, background: `${discrepancyColor}08`, border: `1px solid ${discrepancyColor}20`, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 6 }}>Desvío Promedio</div>
              {loading ? <Skeleton width="80px" height={28} style={{ margin: "0 auto" }} /> : (
                <div style={{ fontSize: 32, fontWeight: 900, color: discrepancyColor, fontFamily: T.fontMono, lineHeight: 1 }}>{avgDiscrepancy.toFixed(1)}%</div>
              )}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Bar breakdown */}
      <GlassCard>
        <div style={{ ...S.label, marginBottom: 20 }}>Distribución Detallada</div>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1,2,3,4].map(i => <Skeleton key={i} height={48} />)}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {STAT_DEFS.map(({ key, label, color, Icon }) => {
              const value = s[key] || 0;
              const pct = total > 0 ? (value / total) * 100 : 0;
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 110 }}>
                    <Icon size={13} color={color} strokeWidth={2} />
                    <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{label}</span>
                  </div>
                  <div style={{ flex: 1, height: 8, background: "rgba(148,163,184,0.07)", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{
                      width: `${pct}%`, height: "100%",
                      background: `linear-gradient(90deg, ${color}80, ${color})`,
                      borderRadius: 8,
                      transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
                    }} />
                  </div>
                  <div style={{ minWidth: 70, display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color, fontFamily: T.fontMono }}>{value}</span>
                    <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{pct.toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
