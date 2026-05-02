import React, { useState } from "react";
import { Download, BarChart2, CheckCircle2 } from "lucide-react";
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

      <button onClick={api.exportPredictions} style={{ ...S.btn("ghost"), fontSize: 11, padding: "8px 14px", marginBottom: 16, display: "inline-flex", alignItems: "center", gap: 6 }}><Download size={12} /> Exportar Predicciones CSV</button>

      {/* ── Cumulative P&L estimate ── */}
      {predictions.length > 0 && (() => {
        const evaluated = predictions.filter((p) => p.evaluated && p.actual_change_pct != null);
        const cumulativePnl = evaluated.reduce((sum, p) => sum + (p.actual_change_pct || 0), 0);
        const avgPnl = evaluated.length > 0 ? cumulativePnl / evaluated.length : 0;
        return evaluated.length > 0 ? (
          <div style={{
            padding: "14px 18px",
            background: T.bgCard,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            marginBottom: 16,
            fontSize: 13,
            color: T.textMuted,
          }}>
            Si hubieras seguido TODAS las predicciones: P&L estimado acumulado:{" "}
            <strong style={{ color: cumulativePnl >= 0 ? T.green : T.red, fontFamily: T.fontMono }}>
              {cumulativePnl >= 0 ? "+" : ""}{cumulativePnl.toFixed(2)}%
            </strong>
            {" "}(promedio por predicción: {avgPnl >= 0 ? "+" : ""}{avgPnl.toFixed(2)}%, n={evaluated.length})
          </div>
        ) : null;
      })()}

      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        {predictions.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: T.textDim }}>
            <BarChart2 size={36} color={T.textDark} style={{ marginBottom: 12 }} />
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
                  <th style={S.th}>Días Eval.</th>
                  <th style={S.th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {predictions.slice(0, 50).map((p) => {
                  const predDate = p.prediction_date ? new Date(p.prediction_date) : null;
                  const evalDate = p.evaluation_date ? new Date(p.evaluation_date) : null;
                  const daysToEval = predDate && evalDate ? Math.round((evalDate - predDate) / (1000 * 60 * 60 * 24)) : null;
                  const now = new Date();
                  const daysSincePred = predDate ? Math.round((now - predDate) / (1000 * 60 * 60 * 24)) : 0;
                  const isExpired = !p.evaluated && daysSincePred > 45;

                  return (
                    <tr
                      key={p.id}
                      onMouseEnter={() => setHoveredRow(p.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                      style={{
                        transition: "background 0.2s ease",
                        background: hoveredRow === p.id ? "rgba(148,163,184,0.03)" : isExpired ? "rgba(255,51,102,0.03)" : "transparent",
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
                      <td style={{ ...S.td, fontFamily: T.fontMono, color: T.textDim }}>
                        {daysToEval != null ? `${daysToEval}d` : (predDate ? `${daysSincePred}d` : "—")}
                      </td>
                      <td style={S.td}>
                        {p.evaluated ? (
                          p.prediction_correct === 1 ? (
                            <span style={{ color: T.green, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={12} /> Acertó</span>
                          ) : (
                            <span style={{ color: T.red, fontWeight: 700 }}>Falló</span>
                          )
                        ) : isExpired ? (
                          <span style={{ color: T.red, fontSize: 11 }}>Pendiente (vencida - considerar como fallida)</span>
                        ) : (
                          <span style={{ color: T.yellow }}>Pendiente</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
