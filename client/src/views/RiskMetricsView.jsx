import React from "react";
import { T, S } from "../theme";
import { GlassCard, SectionHeader, MetricCard, Skeleton } from "../components/common";

const METRIC_DEFS = [
  { key: "maxDrawdown", label: "Max Drawdown", suffix: "%", invert: true },
  { key: "sharpeRatio", label: "Sharpe Ratio", suffix: "", colorThreshold: { good: 1, bad: 0.5 } },
  { key: "sortinoRatio", label: "Sortino Ratio", suffix: "" },
  { key: "beta", label: "Beta", suffix: "" },
  { key: "var95", label: "VaR 95%", suffix: "%", invert: true },
  { key: "volatilityAnnualized", label: "Volatility Annualized", suffix: "%", invert: true },
];

export default function RiskMetricsView({ metrics, loading }) {
  const data = metrics || {};

  const getColor = (def, value) => {
    if (value === undefined || value === null) return T.textDim;
    if (def.colorThreshold) {
      if (value >= def.colorThreshold.good) return T.green;
      if (value < def.colorThreshold.bad) return T.red;
      return T.yellow;
    }
    if (def.invert) {
      return value > 0 ? T.red : T.green;
    }
    return T.text;
  };

  return (
    <div className="ca-main" style={{ padding: "28px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader title="Riesgo" subtitle="Métricas de riesgo del portfolio" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {loading ? (
          METRIC_DEFS.map((_, i) => (
            <GlassCard key={i}>
              <Skeleton width="60%" height={14} />
              <div style={{ marginTop: 12 }}><Skeleton width="80%" height={28} /></div>
            </GlassCard>
          ))
        ) : (
          METRIC_DEFS.map((def, i) => {
            const value = data[def.key];
            const color = getColor(def, value);
            return (
              <MetricCard
                key={def.key}
                label={def.label}
                value={value !== undefined && value !== null ? value : 0}
                suffix={def.suffix}
                decimals={2}
                color={color}
                delay={i * 80}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
