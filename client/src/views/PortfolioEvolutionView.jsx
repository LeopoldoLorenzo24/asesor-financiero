import React from "react";
import { T, S } from "../theme";
import { GlassCard, SectionHeader, Skeleton } from "../components/common";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot, ComposedChart, Line } from "recharts";

function formatDate(d) {
  const date = new Date(d);
  return date.toLocaleDateString("es-AR", { month: "short", year: "2-digit" });
}

function currencyFormatter(v) {
  return `$${Math.round(v).toLocaleString("es-AR")}`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload) return null;
  return (
    <div style={{ background: "rgba(13,18,30,0.95)", border: `1px solid ${T.borderLight}`, borderRadius: 12, padding: "12px 16px", backdropFilter: "blur(12px)" }}>
      <div style={{ fontSize: 11, color: T.textDim, marginBottom: 8, fontFamily: T.fontMono }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
          <span style={{ fontSize: 12, color: T.textMuted, minWidth: 100 }}>{p.name}</span>
          <span style={{ fontSize: 12, fontFamily: T.fontMono, fontWeight: 700, color: T.text }}>{currencyFormatter(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function PortfolioEvolutionView({ data, days, onDaysChange }) {
  if (!data) {
    return (
      <div className="ca-main" style={{ padding: "28px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
        <SectionHeader title="Evolución del Portfolio" subtitle="Capital, valor del portfolio y riqueza total" />
        <Skeleton width="100%" height={400} />
      </div>
    );
  }

  const { series, annotations } = data;

  const chartData = (series || []).map((s) => ({
    ...s,
    dateLabel: formatDate(s.date),
  }));

  const buyAnnotations = (annotations || []).filter((a) => a.type === "BUY");
  const sellAnnotations = (annotations || []).filter((a) => a.type === "SELL");

  return (
    <div className="ca-main" style={{ padding: "28px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader
        title="Evolución del Portfolio"
        subtitle={`Últimos ${days} días`}
        action={
          <div style={{ display: "flex", gap: 6 }}>
            {[30, 90, 180, 365].map((d) => (
              <button
                key={d}
                onClick={() => onDaysChange(d)}
                style={{
                  ...S.btn("ghost"),
                  fontSize: 11,
                  padding: "8px 14px",
                  background: days === d ? `${T.green}18` : "transparent",
                  color: days === d ? T.green : T.textMuted,
                  borderColor: days === d ? `${T.green}40` : T.borderLight,
                }}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      />

      <GlassCard style={{ padding: 24 }}>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="wealthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.cyan} stopOpacity={0.35} />
                <stop offset="100%" stopColor={T.cyan} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
            <XAxis dataKey="dateLabel" tick={{ fill: T.textDim, fontSize: 11, fontFamily: T.fontMono }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: T.textDim, fontSize: 11, fontFamily: T.fontMono }} axisLine={false} tickLine={false} tickFormatter={currencyFormatter} width={80} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="totalWealth" name="Riqueza Total" stroke={T.cyan} strokeWidth={2} fill="url(#wealthGradient)" />
            <Line type="monotone" dataKey="portfolioValue" name="Valor Portfolio" stroke={T.green} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="capital" name="Capital" stroke={T.yellow} strokeWidth={2} dot={false} strokeDasharray="6 4" />
            {buyAnnotations.map((a, i) => {
              const point = chartData.find((d) => d.date === a.date);
              if (!point) return null;
              return <ReferenceDot key={`buy-${i}`} x={point.dateLabel} y={point.totalWealth * 1.02} r={5} fill={T.green} stroke="none" />;
            })}
            {sellAnnotations.map((a, i) => {
              const point = chartData.find((d) => d.date === a.date);
              if (!point) return null;
              return <ReferenceDot key={`sell-${i}`} x={point.dateLabel} y={point.totalWealth * 0.98} r={5} fill={T.red} stroke="none" />;
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </GlassCard>
    </div>
  );
}
