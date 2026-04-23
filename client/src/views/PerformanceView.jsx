import React from "react";
import { T, S } from "../theme";
import api from "../api";
import { GlassCard, SectionHeader, MetricCard, Skeleton } from "../components/common";

export default function PerformanceView({ performance }) {
  return (
    <div className="ca-main" style={{ padding: "28px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader
        title="Performance del Bot"
        action={
          <button onClick={api.exportCapitalHistory} style={{ ...S.btn("ghost"), fontSize: 11, padding: "8px 14px" }}>◆ Exportar Capital CSV</button>
        }
      />

      <GlassCard>
        {performance ? (
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
        ) : (
          <Skeleton width="100%" height={200} />
        )}
      </GlassCard>
    </div>
  );
}
