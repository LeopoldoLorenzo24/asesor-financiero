import React from "react";
import { T, S } from "../theme";
import { GlassCard, MetricCard, SectionHeader, AnimatedNumber, Skeleton } from "../components/common";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function TrackRecordView({ data, days, onDaysChange }) {
  const series = data?.series || [];
  const chartData = series.map((row) => ({
    date: row.date,
    Virtual: row.virtual_value_ars || 0,
    Real: row.real_value_ars || 0,
    SPY: row.spy_value_ars || 0,
    Capital: row.capital_ars || 0,
  }));

  const first = series[0];
  const last = series[series.length - 1];
  const virtualReturn = first && last && (first.virtual_value_ars > 0) ? ((last.virtual_value_ars - first.virtual_value_ars) / first.virtual_value_ars) * 100 : 0;
  const realReturn = first && last && (first.real_value_ars > 0) ? ((last.real_value_ars - first.real_value_ars) / first.real_value_ars) * 100 : 0;
  const spyReturn = first && last && (first.spy_value_ars > 0) ? ((last.spy_value_ars - first.spy_value_ars) / first.spy_value_ars) * 100 : 0;

  return (
    <div className="ca-main" style={{ padding: "32px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader title="Track Record" subtitle="Rendimiento histórico: Virtual vs Real vs SPY" />

      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        {[30, 90, 180, 365].map((d) => (
          <button key={d} onClick={() => onDaysChange(d)} style={{
            padding: "7px 14px", borderRadius: 10, border: "none",
            fontSize: 11, fontWeight: 700, cursor: "pointer",
            background: days === d ? `linear-gradient(135deg, ${T.green}, #00b894)` : "rgba(13,18,30,0.6)",
            color: days === d ? "#fff" : T.textDim,
            boxShadow: days === d ? `0 2px 12px ${T.green}30` : "none",
          }}>{d}d</button>
        ))}
      </div>

      <div style={{ ...S.grid(260), gap: 16, marginBottom: 28 }}>
        <MetricCard label="Retorno Virtual" value={virtualReturn} suffix="%" decimals={2} color={virtualReturn >= 0 ? T.green : T.red} glowColor={virtualReturn >= 0 ? T.green : T.red} icon="◊" />
        <MetricCard label="Retorno Real" value={realReturn} suffix="%" decimals={2} color={realReturn >= 0 ? T.green : T.red} glowColor={realReturn >= 0 ? T.green : T.red} icon="◆" />
        <MetricCard label="Retorno SPY" value={spyReturn} suffix="%" decimals={2} color={spyReturn >= 0 ? T.green : T.red} glowColor={spyReturn >= 0 ? T.green : T.red} icon="▲" />
        <MetricCard label="Registros" value={series.length} color={T.text} glowColor={T.blue} icon="◈" />
      </div>

      <GlassCard style={{ marginBottom: 28 }}>
        <div style={{ ...S.label, marginBottom: 16 }}>Evolución Comparativa</div>
        {chartData.length === 0 ? <Skeleton width="100%" height={300} /> : (
          <ResponsiveContainer width="100%" height={380}>
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorVirtual" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.green} stopOpacity={0.3}/><stop offset="95%" stopColor={T.green} stopOpacity={0}/></linearGradient>
                <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.blue} stopOpacity={0.3}/><stop offset="95%" stopColor={T.blue} stopOpacity={0}/></linearGradient>
                <linearGradient id="colorSpy" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.yellow} stopOpacity={0.3}/><stop offset="95%" stopColor={T.yellow} stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.textDim }} stroke={T.border} />
              <YAxis tick={{ fontSize: 11, fill: T.textDim }} stroke={T.border} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: T.bgCardSolid, border: `1px solid ${T.border}`, borderRadius: 12, fontSize: 12 }}
                itemStyle={{ color: T.text }}
                formatter={(value) => [`$${Number(value).toLocaleString("es-AR")}`, ""]}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: T.textMuted }} />
              <Area type="monotone" dataKey="Virtual" stroke={T.green} fillOpacity={1} fill="url(#colorVirtual)" strokeWidth={2} />
              <Area type="monotone" dataKey="Real" stroke={T.blue} fillOpacity={1} fill="url(#colorReal)" strokeWidth={2} />
              <Area type="monotone" dataKey="SPY" stroke={T.yellow} fillOpacity={1} fill="url(#colorSpy)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </GlassCard>

      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "24px 28px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ ...S.label, margin: 0 }}>Registros Diarios</div>
        </div>
        {series.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: T.textDim }}>No hay datos de track record todavía.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={S.th}>Fecha</th>
                  <th style={S.th}>Virtual</th>
                  <th style={S.th}>Real</th>
                  <th style={S.th}>SPY</th>
                  <th style={S.th}>Capital</th>
                  <th style={S.th}>CCL</th>
                </tr>
              </thead>
              <tbody>
                {series.slice().reverse().map((row, idx) => (
                  <tr key={idx} style={{ transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(148,163,184,0.03)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>{row.date}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: T.green }}>${(row.virtual_value_ars || 0).toLocaleString("es-AR")}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: T.blue }}>${(row.real_value_ars || 0).toLocaleString("es-AR")}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: T.yellow }}>${(row.spy_value_ars || 0).toLocaleString("es-AR")}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>${(row.capital_ars || 0).toLocaleString("es-AR")}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: T.textDim }}>${row.ccl_rate || "—"}</td>
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
