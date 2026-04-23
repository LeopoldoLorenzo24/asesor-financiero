import React from "react";
import { T, S } from "../theme";
import { GlassCard, SectionHeader, MetricCard, Skeleton, ScoreBar } from "../components/common";

export default function AdherenceView({ stats, loading }) {
  const s = stats || {};
  const total = s.totalRecommendations || 0;
  const executed = s.executed || 0;
  const partial = s.partial || 0;
  const deviated = s.deviated || 0;
  const pending = s.pending || 0;
  const avgDiscrepancy = s.avgDiscrepancyPercentage || 0;

  const items = [
    { label: "Total Recomendaciones", value: total, color: T.text },
    { label: "Ejecutadas", value: executed, color: T.green },
    { label: "Parciales", value: partial, color: T.yellow },
    { label: "Desviadas", value: deviated, color: T.red },
    { label: "Pendientes", value: pending, color: T.blue },
  ];

  const maxBar = Math.max(1, total);

  return (
    <div className="ca-main" style={{ padding: "28px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader title="Seguimiento" subtitle="Adherencia a recomendaciones" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
        {loading ? (
          items.map((_, i) => (
            <GlassCard key={i}>
              <Skeleton width="60%" height={14} />
              <div style={{ marginTop: 10 }}><Skeleton width="40%" height={26} /></div>
            </GlassCard>
          ))
        ) : (
          items.map((item, i) => (
            <MetricCard
              key={item.label}
              label={item.label}
              value={item.value}
              decimals={0}
              color={item.color}
              delay={i * 60}
            />
          ))
        )}
      </div>

      <GlassCard style={{ marginBottom: 16 }}>
        <SectionHeader title="Distribución" />
        {loading ? (
          <Skeleton height={120} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {items.filter((it) => it.label !== "Total Recomendaciones").map((item) => (
              <ScoreBar
                key={item.label}
                label={item.label}
                value={total > 0 ? (item.value / total) * 100 : 0}
                color={item.color}
                h={8}
              />
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <SectionHeader title="Discrepancia Promedio" />
        {loading ? (
          <Skeleton width="120px" height={28} />
        ) : (
          <div style={{ fontSize: 22, fontWeight: 800, color: avgDiscrepancy > 10 ? T.red : avgDiscrepancy > 5 ? T.yellow : T.green, fontFamily: T.fontMono }}>
            {avgDiscrepancy.toFixed(2)}%
          </div>
        )}
      </GlassCard>
    </div>
  );
}
