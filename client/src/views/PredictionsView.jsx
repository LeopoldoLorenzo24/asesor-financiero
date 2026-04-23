import React, { useState } from "react";
import { T, S, signalColors } from "../theme";
import api from "../api";
import { GlassCard, SectionHeader, HeatBadge } from "../components/common";

export default function PredictionsView({ predictions, performance }) {
  const [hoveredRow, setHoveredRow] = useState(null);

  return (
    <div className="ca-main" style={{ padding: "28px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader
        title="Predicciones del Bot"
        subtitle={performance ? `${performance.correct} aciertos de ${performance.total} (${performance.accuracy}%)` : "Sin datos de performance"}
        action={performance && (
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: T.textMuted, fontFamily: T.fontMono }}>
            <span>Evaluadas: <strong style={{ color: T.text }}>{performance.total}</strong></span>
            <span>Aciertos: <strong style={{ color: T.green }}>{performance.correct} ({performance.accuracy}%)</strong></span>
            <span>Retorno real promedio: <strong style={{ color: performance.avgActualReturn >= 0 ? T.green : T.red }}>{performance.avgActualReturn >= 0 ? "+" : ""}{performance.avgActualReturn}%</strong></span>
          </div>
        )}
      />

      <button onClick={api.exportPredictions} style={{ ...S.btn("ghost"), fontSize: 11, padding: "8px 14px", marginBottom: 16 }}>◆ Exportar Predicciones CSV</button>

      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        {predictions.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: T.textDim }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>◈</div>
            <div>No hay predicciones registradas.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={S.th}>Fecha</th>
                  <th style={S.th}>Ticker</th>
                  <th style={S.th}>Acción</th>
                  <th style={S.th}>Confianza</th>
                  <th style={S.th}>Target</th>
                  <th style={S.th}>Stop</th>
                  <th style={S.th}>Resultado</th>
                  <th style={S.th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {predictions.slice(0, 50).map((p) => (
                  <tr
                    key={p.id}
                    onMouseEnter={() => setHoveredRow(p.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      transition: "background 0.2s ease",
                      background: hoveredRow === p.id ? "rgba(148,163,184,0.03)" : "transparent",
                    }}
                  >
                    <td style={S.td}>{p.prediction_date?.slice(0, 10)}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, fontWeight: 700, color: T.text }}>{p.ticker}</td>
                    <td style={S.td}>
                      <span style={{ ...S.badge(signalColors[p.action] || T.textDim), fontSize: 9 }}>{p.action}</span>
                    </td>
                    <td style={S.td}>
                      <HeatBadge value={p.confidence} max={100} suffix="%" />
                    </td>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>{p.target_pct != null ? `+${p.target_pct}%` : "—"}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>{p.stop_loss_pct != null ? `${p.stop_loss_pct}%` : "—"}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: p.actual_change_pct > 0 ? T.green : p.actual_change_pct < 0 ? T.red : T.textDim }}>
                      {p.actual_change_pct != null ? `${p.actual_change_pct >= 0 ? "+" : ""}${p.actual_change_pct}%` : "Pendiente"}
                    </td>
                    <td style={S.td}>
                      {p.evaluated ? (
                        p.prediction_correct === 1 ? (
                          <span style={{ color: T.green, fontWeight: 700 }}>◆ Acertó</span>
                        ) : (
                          <span style={{ color: T.red, fontWeight: 700 }}>◊ Falló</span>
                        )
                      ) : (
                        <span style={{ color: T.yellow }}>Pendiente</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
