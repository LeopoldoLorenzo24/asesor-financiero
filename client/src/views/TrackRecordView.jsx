import React from "react";
import { TrendingUp, TrendingDown, BarChart2, Activity, LineChart, DollarSign } from "lucide-react";
import { T, S } from "../theme";
import { GlassCard, MetricCard, SectionHeader, AnimatedNumber, Skeleton } from "../components/common";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from "recharts";

export default function TrackRecordView({ data, days, onDaysChange }) {
  const series = data?.series || [];
  const metrics = data?.metrics;
  const monthly = data?.monthly || [];

  const chartData = series.map((row) => ({
    date: row.date,
    Virtual: row.virtual_total_ars || row.virtual_value_ars || 0,
    Real: row.real_value_ars || 0,
    SPY: row.spy_value_ars || 0,
    Drawdown: row.drawdown_from_peak_pct || 0,
    Alpha: row.alpha_vs_spy_pct || 0,
  }));

  const handleExport = () => {
    window.open(`/api/track-record/export?days=${days}`, "_blank");
  };

  return (
    <div className="ca-main" style={{ padding: "32px", maxWidth: 1240, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader
        title="Track Record"
        subtitle={`Evidencia real de rendimiento · ${metrics?.days || 0} dias de datos`}
        action={
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleExport} style={{ ...S.btn("ghost"), fontSize: 11 }}>Exportar CSV</button>
          </div>
        }
      />

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

      {metrics && (
        <div style={{ ...S.grid(220), gap: 14, marginBottom: 28 }}>
          <MetricCard label="Alpha vs SPY" value={metrics.alphaPct} suffix="%" decimals={2} color={metrics.alphaPct >= 0 ? T.green : T.red} glowColor={metrics.alphaPct >= 0 ? T.green : T.red} icon={metrics.alphaPct >= 0 ? TrendingUp : TrendingDown} />
          <MetricCard label="Sharpe Ratio" value={metrics.sharpeRatio} decimals={2} color={metrics.sharpeRatio >= 1 ? T.green : metrics.sharpeRatio >= 0.75 ? T.yellow : T.red} glowColor={metrics.sharpeRatio >= 1 ? T.green : T.yellow} icon={BarChart2} />
          <MetricCard label="Max Drawdown" value={metrics.maxDrawdownPct} suffix="%" decimals={2} color={Math.abs(metrics.maxDrawdownPct) <= 15 ? T.green : Math.abs(metrics.maxDrawdownPct) <= 20 ? T.yellow : T.red} glowColor={Math.abs(metrics.maxDrawdownPct) <= 15 ? T.green : T.red} icon={TrendingDown} />
          <MetricCard label="Win Rate vs SPY" value={metrics.winRateVsSpyPct} suffix="%" decimals={1} color={metrics.winRateVsSpyPct >= 60 ? T.green : metrics.winRateVsSpyPct >= 55 ? T.yellow : T.red} glowColor={metrics.winRateVsSpyPct >= 60 ? T.green : T.yellow} icon={Activity} />
          <MetricCard label="Volatilidad Anual" value={metrics.volatilityAnnualPct} suffix="%" decimals={2} color={T.text} glowColor={T.blue} icon={LineChart} />
          <MetricCard label="Retorno Virtual" value={metrics.virtualReturnPct} suffix="%" decimals={2} color={metrics.virtualReturnPct >= 0 ? T.green : T.red} glowColor={metrics.virtualReturnPct >= 0 ? T.green : T.red} icon={DollarSign} />
        </div>
      )}

      <GlassCard style={{ marginBottom: 28 }}>
        <div style={{ ...S.label, marginBottom: 16 }}>Evolucion del Portfolio</div>
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
              <Tooltip contentStyle={{ background: T.bgCardSolid, border: `1px solid ${T.border}`, borderRadius: 12, fontSize: 12 }} itemStyle={{ color: T.text }} formatter={(value) => [`$${Number(value).toLocaleString("es-AR")}`, ""]} />
              <Legend wrapperStyle={{ fontSize: 12, color: T.textMuted }} />
              <Area type="monotone" dataKey="Virtual" stroke={T.green} fillOpacity={1} fill="url(#colorVirtual)" strokeWidth={2} />
              <Area type="monotone" dataKey="Real" stroke={T.blue} fillOpacity={1} fill="url(#colorReal)" strokeWidth={2} />
              <Area type="monotone" dataKey="SPY" stroke={T.yellow} fillOpacity={1} fill="url(#colorSpy)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </GlassCard>

      {chartData.length > 0 && (
        <GlassCard style={{ marginBottom: 28 }}>
          <div style={{ ...S.label, marginBottom: 16 }}>Drawdown desde Pico</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorDD" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.red} stopOpacity={0.3}/><stop offset="95%" stopColor={T.red} stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.textDim }} stroke={T.border} />
              <YAxis tick={{ fontSize: 11, fill: T.textDim }} stroke={T.border} tickFormatter={(v) => `${v.toFixed(1)}%`} />
              <Tooltip contentStyle={{ background: T.bgCardSolid, border: `1px solid ${T.border}`, borderRadius: 12, fontSize: 12 }} formatter={(value) => [`${Number(value).toFixed(2)}%`, ""]} />
              <Area type="monotone" dataKey="Drawdown" stroke={T.red} fillOpacity={1} fill="url(#colorDD)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </GlassCard>
      )}

      {monthly.length > 0 && (
        <GlassCard style={{ marginBottom: 28, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "24px 28px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ ...S.label, margin: 0 }}>Resumen Mensual</div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={S.th}>Mes</th>
                  <th style={S.th}>Ret Virtual</th>
                  <th style={S.th}>Ret SPY</th>
                  <th style={S.th}>Alpha</th>
                  <th style={S.th}>Max DD</th>
                  <th style={S.th}>Sharpe</th>
                  <th style={S.th}>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {monthly.slice().reverse().map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>{row.month}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: (row.virtual_return_pct || 0) >= 0 ? T.green : T.red }}>{row.virtual_return_pct?.toFixed(2)}%</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: T.yellow }}>{row.spy_return_pct?.toFixed(2)}%</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: (row.alpha_pct || 0) >= 0 ? T.green : T.red }}>{row.alpha_pct?.toFixed(2)}%</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: Math.abs(row.max_drawdown_pct || 0) <= 15 ? T.green : T.red }}>{row.max_drawdown_pct?.toFixed(2)}%</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: (row.sharpe_ratio || 0) >= 1 ? T.green : T.yellow }}>{row.sharpe_ratio?.toFixed(2)}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>{row.win_rate_pct?.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "24px 28px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ ...S.label, margin: 0 }}>Registros Diarios Detallados</div>
        </div>
        {series.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: T.textDim }}>No hay datos de track record todavia.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={S.th}>Fecha</th>
                  <th style={S.th}>Virtual</th>
                  <th style={S.th}>Div</th>
                  <th style={S.th}>Total Virt</th>
                  <th style={S.th}>Real</th>
                  <th style={S.th}>SPY</th>
                  <th style={S.th}>Alpha</th>
                  <th style={S.th}>DD</th>
                  <th style={S.th}>Ret Dia</th>
                  <th style={S.th}>Sharpe</th>
                </tr>
              </thead>
              <tbody>
                {series.slice().reverse().map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>{row.date}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: T.green }}>${(row.virtual_value_ars || 0).toLocaleString("es-AR")}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: T.cyan }}>${(row.virtual_dividends_ars || 0).toLocaleString("es-AR")}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, fontWeight: 700 }}>${(row.virtual_total_ars || row.virtual_value_ars || 0).toLocaleString("es-AR")}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: T.blue }}>${(row.real_value_ars || 0).toLocaleString("es-AR")}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: T.yellow }}>${(row.spy_value_ars || 0).toLocaleString("es-AR")}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: (row.alpha_vs_spy_pct || 0) >= 0 ? T.green : T.red }}>{row.alpha_vs_spy_pct != null ? `${row.alpha_vs_spy_pct.toFixed(2)}%` : "—"}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: (row.drawdown_from_peak_pct || 0) <= -15 ? T.red : T.text }}>{row.drawdown_from_peak_pct != null ? `${row.drawdown_from_peak_pct.toFixed(1)}%` : "—"}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: (row.daily_return_pct || 0) >= 0 ? T.green : T.red }}>{row.daily_return_pct != null ? `${row.daily_return_pct.toFixed(2)}%` : "—"}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>{row.rolling_sharpe != null ? row.rolling_sharpe.toFixed(2) : "—"}</td>
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
