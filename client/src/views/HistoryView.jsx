import React, { useState } from "react";
import { Brain, History, DollarSign, ChevronDown, ChevronUp, TrendingUp, Wallet, CalendarDays } from "lucide-react";
import { T, S } from "../theme";
import { GlassCard, SectionHeader } from "../components/common";

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 60) return `hace ${diff} min`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d}d`;
  return `hace ${Math.floor(d / 30)}m`;
}

function SessionCard({ session, index, total }) {
  const [expanded, setExpanded] = useState(index === 0);
  const dateStr = session.session_date?.slice(0, 16).replace("T", " ") || "—";
  const relTime = timeAgo(session.session_date);
  const totalWealth = (session.capital_ars || 0) + (session.portfolio_value_ars || 0);
  const sessionNum = total - index;

  return (
    <div style={{ display: "flex", gap: 0 }}>
      {/* Timeline rail */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 40, flexShrink: 0, paddingTop: 4 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: index === 0
            ? `linear-gradient(135deg, ${T.green}, ${T.cyan})`
            : "rgba(148,163,184,0.08)",
          border: `2px solid ${index === 0 ? T.green : "rgba(148,163,184,0.12)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          boxShadow: index === 0 ? `0 0 16px ${T.green}40` : "none",
          zIndex: 1,
          position: "relative",
        }}>
          <Brain size={14} color={index === 0 ? "#000" : T.textDark} strokeWidth={2} />
        </div>
        {index < total - 1 && (
          <div style={{ width: 2, flex: 1, minHeight: 20, background: "rgba(148,163,184,0.08)", marginTop: 4, borderRadius: 2 }} />
        )}
      </div>

      {/* Card */}
      <div style={{ flex: 1, marginLeft: 12, marginBottom: index < total - 1 ? 8 : 0 }}>
        <div
          onClick={() => setExpanded((e) => !e)}
          style={{
            background: "rgba(15,23,42,0.55)",
            backdropFilter: "blur(28px)",
            WebkitBackdropFilter: "blur(28px)",
            border: `1px solid ${index === 0 ? `${T.green}20` : T.border}`,
            borderRadius: 16,
            overflow: "hidden",
            transition: "border-color 0.2s",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { if (index !== 0) e.currentTarget.style.borderColor = "rgba(148,163,184,0.14)"; }}
          onMouseLeave={(e) => { if (index !== 0) e.currentTarget.style.borderColor = T.border; }}
        >
          {/* Header row */}
          <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: T.text, fontFamily: T.fontMono }}>
                    Sesión #{sessionNum}
                  </span>
                  {index === 0 && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: T.green, background: `${T.green}15`, border: `1px solid ${T.green}30`, borderRadius: 5, padding: "2px 7px", fontFamily: T.fontMono, letterSpacing: "0.5px" }}>
                      RECIENTE
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CalendarDays size={11} color={T.textDim} />
                  <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{dateStr}</span>
                  {relTime && <span style={{ fontSize: 10, color: T.textDark }}>· {relTime}</span>}
                </div>
              </div>
            </div>

            {/* Mini stats */}
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              {totalWealth > 0 && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px" }}>Patrimonio</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.text, fontFamily: T.fontMono }}>${totalWealth.toLocaleString("es-AR")}</div>
                </div>
              )}
              <div style={{ color: T.textDim }}>
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </div>
          </div>

          {/* Expanded content */}
          {expanded && (
            <div style={{ padding: "0 18px 16px", borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: session.strategy_monthly ? 12 : 0 }}>
                {[
                  { label: "Capital Disponible", value: session.capital_ars ? `$${session.capital_ars.toLocaleString("es-AR")}` : "—", icon: DollarSign, color: T.cyan },
                  { label: "Valor Portfolio", value: session.portfolio_value_ars ? `$${session.portfolio_value_ars.toLocaleString("es-AR")}` : "—", icon: Wallet, color: T.blue },
                  { label: "CCL", value: session.ccl_rate ? `$${session.ccl_rate}` : "—", icon: TrendingUp, color: T.yellow },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(148,163,184,0.04)", border: `1px solid rgba(148,163,184,0.06)` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                      <Icon size={11} color={color} strokeWidth={2} />
                      <span style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px" }}>{label}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color, fontFamily: T.fontMono }}>{value}</div>
                  </div>
                ))}
              </div>
              {session.strategy_monthly && (
                <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.7, padding: "10px 12px", borderRadius: 10, background: `${T.blue}06`, border: `1px solid ${T.blue}12`, borderLeft: `3px solid ${T.blue}40` }}>
                  <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px", marginRight: 8 }}>Estrategia:</span>
                  {session.strategy_monthly}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HistoryView({ analysisSessions }) {
  return (
    <div className="ca-main" style={{ padding: "32px", maxWidth: 860, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader
        title="Historial de Análisis IA"
        subtitle={`${analysisSessions.length} sesiones registradas`}
        action={analysisSessions.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Brain size={13} color={T.blue} />
            <span style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontMono }}>
              Última: {analysisSessions[0]?.session_date?.slice(0, 10) || "—"}
            </span>
          </div>
        )}
      />

      {analysisSessions.length === 0 ? (
        <GlassCard>
          <div style={{ textAlign: "center", padding: 60, color: T.textDim }}>
            <History size={40} color={T.textDark} style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: T.textMuted, marginBottom: 8 }}>Sin sesiones todavía</div>
            <div style={{ fontSize: 12, color: T.textDim }}>Las sesiones de análisis IA aparecen acá después de la primera ejecución</div>
          </div>
        </GlassCard>
      ) : (
        <div style={{ paddingLeft: 0 }}>
          {analysisSessions.map((s, i) => (
            <SessionCard key={s.id} session={s} index={i} total={analysisSessions.length} />
          ))}
        </div>
      )}
    </div>
  );
}
