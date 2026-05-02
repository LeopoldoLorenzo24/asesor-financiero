import React from "react";
import { Download } from "lucide-react";
import { T, S } from "../theme";
import api from "../api";
import { GlassCard, SectionHeader, MetricCard, Skeleton } from "../components/common";

export default function PerformanceView({ performance }) {
  return (
    <div className="ca-main" style={{ padding: "28px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader
        title="Performance del Bot"
        action={
          <button onClick={api.exportCapitalHistory} style={{ ...S.btn("ghost"), fontSize: 11, padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: 6 }}><Download size={12} /> Exportar Capital CSV</button>
        }
      />

      <GlassCard>
        {performance ? (
          <>
            <div className="ca-perf-grid" style={{ ...S.grid(200), gap: 16 }}>
              <MetricCard
                label="Accuracy (60d)"
                value={performance.accuracy}
                suffix="%"
                decimals={0}
                color={performance.accuracy >= 50 ? T.green : T.red}
                subtext={`${performance.correct} / ${performance.total}`}
                delay={0}
              />
              <MetricCard
                label="Retorno Promedio Real"
                value={performance.avgActualReturn}
                prefix={performance.avgActualReturn >= 0 ? "+" : ""}
                suffix="%"
                decimals={2}
                color={performance.avgActualReturn >= 0 ? T.green : T.red}
                delay={80}
              />
              <MetricCard
                label="Mejor Pick"
                value={performance.bestPick?.actual_change_pct ?? 0}
                prefix="+"
                suffix="%"
                decimals={2}
                color={T.green}
                subtext={performance.bestPick?.ticker || "—"}
                delay={160}
              />
              <MetricCard
                label="Peor Pick"
                value={performance.worstPick?.actual_change_pct ?? 0}
                suffix="%"
                decimals={2}
                color={T.red}
                subtext={performance.worstPick?.ticker || "—"}
                delay={240}
              />
            </div>

            {/* ── Accuracy context ── */}
            <div style={{
              marginTop: 20,
              padding: "14px 18px",
              background: "rgba(148,163,184,0.04)",
              border: `1px solid ${T.border}`,
              borderRadius: 12,
            }}>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
                <span style={{ color: T.textMuted }}>
                  Accuracy últimos 60 días (n={performance.total} predicciones) <span style={{ color: T.textDim }}>(baseline aleatorio: 50%)</span>
                </span>
                {performance.accuracy != null && (
                  <span style={{
                    color: (performance.accuracy - 50) >= 0 ? T.green : T.red,
                    fontWeight: 700,
                    fontFamily: T.fontMono,
                    fontSize: 13,
                  }}>
                    Alpha sobre baseline: {(performance.accuracy - 50) >= 0 ? "+" : ""}{(performance.accuracy - 50).toFixed(0)}pp
                  </span>
                )}
              </div>
              {performance.total < 30 && (
                <div style={{ marginTop: 8, fontSize: 12, color: T.yellow, fontWeight: 600 }}>
                  Muestra insuficiente ({"<"}30 predicciones). Resultados no son estadísticamente significativos.
                </div>
              )}
            </div>
          </>
        ) : (
          <Skeleton width="100%" height={200} />
        )}
      </GlassCard>
    </div>
  );
}
