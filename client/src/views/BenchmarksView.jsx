import React, { Suspense } from "react";
import { T, S } from "../theme";
import { GlassCard, SectionHeader, MetricCard, Skeleton } from "../components/common";

const CapitalChart = React.lazy(() => import("../components/CapitalChart"));

export default function BenchmarksView({ benchLoading, benchmarks, capitalHistory }) {
  return (
    <div className="ca-main" style={{ padding: "28px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader title="Benchmarks de Performance" />

      <GlassCard style={{ marginBottom: 24 }}>
        {benchLoading ? (
          <Skeleton width="100%" height={200} />
        ) : benchmarks ? (
          <div className="ca-perf-grid" style={{ ...S.grid(200), gap: 16 }}>
            {Object.entries(benchmarks).filter(([k]) => k !== "timestamp").map(([key, value], i) => (
              <MetricCard
                key={key}
                label={key.replace(/_/g, " ")}
                value={typeof value === "number" ? value : 0}
                prefix={typeof value === "number" && value >= 0 ? "+" : ""}
                suffix={typeof value === "number" ? "%" : ""}
                decimals={2}
                color={typeof value === "number" && value >= 0 ? T.green : T.red}
                delay={i * 80}
              />
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: 60, color: T.textDim }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>◈</div>
            <div>No hay datos de benchmark disponibles.</div>
          </div>
        )}
      </GlassCard>

      {capitalHistory.length > 0 && (
        <GlassCard>
          <SectionHeader title="Evolución del Patrimonio" />
          <Suspense fallback={
            <div style={{ color: T.textDim, height: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: T.fontMono }}>Cargando gráfico…</span>
            </div>
          }>
            <CapitalChart data={capitalHistory} />
          </Suspense>
        </GlassCard>
      )}
    </div>
  );
}
