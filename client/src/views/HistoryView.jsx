import React from "react";
import { T, S } from "../theme";
import { GlassCard, SectionHeader } from "../components/common";

export default function HistoryView({ analysisSessions }) {
  return (
    <div className="ca-main" style={{ padding: "28px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader title="Historial de Análisis IA" />

      {analysisSessions.length === 0 ? (
        <GlassCard>
          <div style={{ textAlign: "center", padding: 60, color: T.textDim }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>◈</div>
            <div>No hay sesiones de análisis registradas.</div>
          </div>
        </GlassCard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {analysisSessions.map((s) => (
            <GlassCard key={s.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontWeight: 700, color: T.text, fontFamily: T.fontMono }}>
                  {s.session_date?.slice(0, 16).replace("T", " ")}
                </span>
                <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>CCL: ${s.ccl_rate}</span>
              </div>
              <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>
                <div><strong style={{ color: T.text }}>Capital disponible:</strong> ${s.capital_ars?.toLocaleString("es-AR") || "—"}</div>
                <div><strong style={{ color: T.text }}>Valor portfolio:</strong> ${s.portfolio_value_ars?.toLocaleString("es-AR") || "—"}</div>
                <div><strong style={{ color: T.text }}>Estrategia:</strong> {s.strategy_monthly || "—"}</div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
