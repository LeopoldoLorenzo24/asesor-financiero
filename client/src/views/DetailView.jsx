import React, { useEffect, useRef, useState, useMemo } from "react";
import { Search, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { T, S, signalColors } from "../theme";
import { GlassCard, SectionHeader, ScoreBar, Skeleton, HeatBadge } from "../components/common";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ── TradingView Widget ──
function TradingViewChart({ ticker, height = 420 }) {
  const containerRef = useRef(null);
  const widgetId = `tv_${ticker}`;

  useEffect(() => {
    if (!containerRef.current) return;
    // Clear any previous widget
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: `BCBA:${ticker}`,
      interval: "D",
      timezone: "America/Argentina/Buenos_Aires",
      theme: "dark",
      style: "1",
      locale: "es",
      backgroundColor: "rgba(15, 23, 42, 0)",
      gridColor: "rgba(148, 163, 184, 0.04)",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      hide_volume: false,
      support_host: "https://www.tradingview.com",
    });

    const wrapper = document.createElement("div");
    wrapper.className = "tradingview-widget-container__widget";
    wrapper.style.height = "100%";
    wrapper.style.width = "100%";

    containerRef.current.appendChild(wrapper);
    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [ticker]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container"
      id={widgetId}
      style={{ height, width: "100%", borderRadius: 16, overflow: "hidden" }}
    />
  );
}

// ── Custom Price Chart (Recharts) ──
const PERIOD_OPTIONS = [
  { key: "1m", label: "1M", days: 30 },
  { key: "3m", label: "3M", days: 90 },
  { key: "6m", label: "6M", days: 180 },
  { key: "1y", label: "1A", days: 365 },
  { key: "all", label: "Todo", days: 9999 },
];

function formatDateShort(d) {
  const date = new Date(d);
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function formatMoney(v) {
  if (v == null) return "—";
  return `$${Math.round(v).toLocaleString("es-AR")}`;
}

const PriceTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{
      background: "rgba(13,18,30,0.95)", border: `1px solid ${T.borderLight}`,
      borderRadius: 12, padding: "12px 16px", backdropFilter: "blur(12px)",
      minWidth: 160,
    }}>
      <div style={{ fontSize: 11, color: T.textDim, marginBottom: 8, fontFamily: T.fontMono }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: T.textMuted }}>Cierre</span>
        <span style={{ fontSize: 13, fontFamily: T.fontMono, fontWeight: 700, color: T.text }}>{formatMoney(d?.close)}</span>
      </div>
      {d?.high != null && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: T.textDim }}>Max / Min</span>
          <span style={{ fontSize: 11, fontFamily: T.fontMono, color: T.textDim }}>
            {formatMoney(d.high)} / {formatMoney(d.low)}
          </span>
        </div>
      )}
      {d?.volume != null && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ fontSize: 11, color: T.textDim }}>Volumen</span>
          <span style={{ fontSize: 11, fontFamily: T.fontMono, color: T.textDim }}>
            {d.volume.toLocaleString("es-AR")}
          </span>
        </div>
      )}
    </div>
  );
};

function PriceChart({ history, entryPrice, ticker }) {
  const [period, setPeriod] = useState("6m");

  const chartData = useMemo(() => {
    if (!history || history.length === 0) return [];
    const opt = PERIOD_OPTIONS.find((p) => p.key === period) || PERIOD_OPTIONS[2];
    const sliced = opt.days >= 9999 ? history : history.slice(-opt.days);
    return sliced.map((d) => ({
      ...d,
      dateLabel: formatDateShort(d.date),
    }));
  }, [history, period]);

  if (chartData.length === 0) return null;

  const prices = chartData.map((d) => d.close).filter(Boolean);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const firstPrice = prices[0];
  const lastPrice = prices[prices.length - 1];
  const changePct = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
  const isPositive = changePct >= 0;
  const chartColor = isPositive ? T.green : T.red;

  return (
    <div>
      {/* Period selector + summary */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BarChart3 size={16} color={T.textDim} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Precio Historico</span>
          <span style={{
            fontSize: 12, fontWeight: 800, fontFamily: T.fontMono,
            color: isPositive ? T.green : T.red,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            {isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {isPositive ? "+" : ""}{changePct.toFixed(1)}%
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setPeriod(opt.key)}
              style={{
                background: period === opt.key ? `${T.blue}18` : "transparent",
                border: `1px solid ${period === opt.key ? `${T.blue}35` : T.border}`,
                borderRadius: 8, padding: "5px 12px",
                color: period === opt.key ? T.blue : T.textDim,
                cursor: "pointer", fontSize: 11, fontWeight: 700,
                fontFamily: T.fontMono, transition: "all 0.2s",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`priceGrad_${ticker}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColor} stopOpacity={0.2} />
              <stop offset="95%" stopColor={chartColor} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(148,163,184,0.04)" vertical={false} />
          <XAxis
            dataKey="dateLabel"
            tick={{ fill: T.textDim, fontSize: 10, fontFamily: T.fontMono }}
            tickLine={false} axisLine={false}
            interval="preserveStartEnd"
            minTickGap={50}
          />
          <YAxis
            domain={[minPrice * 0.97, maxPrice * 1.03]}
            tick={{ fill: T.textDim, fontSize: 10, fontFamily: T.fontMono }}
            tickLine={false} axisLine={false}
            tickFormatter={(v) => `$${Math.round(v).toLocaleString("es-AR")}`}
            width={72}
          />
          <Tooltip content={<PriceTooltip />} />
          <Area
            type="monotone" dataKey="close"
            stroke={chartColor} strokeWidth={2}
            fill={`url(#priceGrad_${ticker})`}
            dot={false} activeDot={{ r: 4, stroke: chartColor, strokeWidth: 2, fill: T.bg }}
          />
          {/* Entry price reference line */}
          {entryPrice > 0 && entryPrice >= minPrice * 0.9 && entryPrice <= maxPrice * 1.1 && (
            <ReferenceLine
              y={entryPrice}
              stroke={T.yellow}
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{
                value: `Entrada $${Math.round(entryPrice).toLocaleString("es-AR")}`,
                position: "right",
                fill: T.yellow,
                fontSize: 10,
                fontFamily: T.fontMono,
              }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Chart mode tabs ──
function ChartTabs({ mode, setMode }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
      {[
        { key: "tradingview", label: "TradingView" },
        { key: "historico", label: "Historico Propio" },
      ].map((tab) => (
        <button
          key={tab.key}
          onClick={() => setMode(tab.key)}
          style={{
            background: mode === tab.key ? `${T.blue}15` : "transparent",
            border: `1px solid ${mode === tab.key ? `${T.blue}30` : T.border}`,
            borderRadius: 10, padding: "8px 18px",
            color: mode === tab.key ? T.blue : T.textDim,
            cursor: "pointer", fontSize: 12, fontWeight: 700,
            fontFamily: T.font, transition: "all 0.2s",
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── Main Detail View ──
export default function DetailView({ selectedTicker, detailLoading, detail, setSelectedTicker, portfolioSummary = [] }) {
  const [chartMode, setChartMode] = useState("tradingview");

  if (!selectedTicker) return (
    <div className="ca-main" style={{ padding: "28px", maxWidth: 1400, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <div style={{ textAlign: "center", padding: 60, color: T.textDim }}>
        <Search size={36} color={T.textDark} style={{ marginBottom: 12 }} />
        <div>Selecciona un CEDEAR del ranking para ver el detalle.</div>
      </div>
    </div>
  );

  if (detailLoading) return (
    <div className="ca-main" style={{ padding: "28px", animation: "fadeUp 0.5s ease" }}>
      <Skeleton width="100%" height={400} />
    </div>
  );

  if (!detail) return null;

  const ind = detail.technical?.indicators || {};
  const position = portfolioSummary.find((p) => p.ticker === selectedTicker);
  const entryPrice = position?.weighted_avg_price || 0;

  return (
    <div className="ca-main" style={{ padding: "28px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <button onClick={() => setSelectedTicker(null)} style={{ ...S.btn("ghost"), marginBottom: 16 }}>
        ← Volver al ranking
      </button>

      {/* Header card */}
      <GlassCard style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, color: T.text, fontFamily: T.fontDisplay }}>{detail.cedear.ticker}</h2>
            <div style={{ color: T.textMuted, fontSize: 14, marginTop: 4 }}>{detail.cedear.name} · {detail.cedear.sector}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: T.text, fontFamily: T.fontMono }}>
              ${detail.priceARS?.toLocaleString("es-AR") || "—"}
            </div>
            <div style={{ fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>
              USD: ${detail.quote?.price?.toFixed(2) || "—"} · CCL: ${detail.ccl?.venta}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ ...S.badge(signalColors[detail.scores?.signal] || T.textDim) }}>{detail.scores?.signal}</span>
          <HeatBadge value={detail.scores?.composite} max={100} label="Score" />
          <span style={{ ...S.badge(T.purple) }}>{detail.scores?.horizon}</span>
          {position && (
            <span style={{
              ...S.badge(T.cyan), fontSize: 10,
              display: "inline-flex", alignItems: "center", gap: 5,
            }}>
              En cartera: {position.total_shares} CEDEARs · Entrada: ${Math.round(entryPrice).toLocaleString("es-AR")}
            </span>
          )}
        </div>
      </GlassCard>

      {/* Chart section */}
      <GlassCard style={{ marginBottom: 24 }}>
        <ChartTabs mode={chartMode} setMode={setChartMode} />
        {chartMode === "tradingview" ? (
          <TradingViewChart ticker={selectedTicker} height={480} />
        ) : (
          <PriceChart
            history={detail.history}
            entryPrice={entryPrice}
            ticker={selectedTicker}
          />
        )}
      </GlassCard>

      {/* Technical + Fundamental grid */}
      <div className="ca-detail-grid" style={{ ...S.grid(340), marginBottom: 24 }}>
        <GlassCard>
          <SectionHeader title="Indicadores Tecnicos" />
          <ScoreBar value={detail.scores?.techScore} label="Score Tecnico" color={T.blue} />
          <div style={{ marginTop: 12, fontSize: 12, color: T.textMuted, lineHeight: 1.8, fontFamily: T.fontMono }}>
            <div>RSI (14): <strong style={{ color: T.text }}>{ind.rsi ?? "—"}</strong></div>
            <div>MACD Hist: <strong style={{ color: T.text }}>{ind.macd?.histogram ?? "—"}</strong></div>
            <div>SMA 20: <strong style={{ color: T.text }}>${ind.sma20?.toFixed(2) ?? "—"}</strong></div>
            <div>SMA 50: <strong style={{ color: T.text }}>${ind.sma50?.toFixed(2) ?? "—"}</strong></div>
            <div>SMA 200: <strong style={{ color: T.text }}>${ind.sma200?.toFixed(2) ?? "—"}</strong></div>
            <div>Bollinger: <strong style={{ color: T.text }}>${ind.bollingerBands?.lower?.toFixed(1) ?? "—"} - ${ind.bollingerBands?.upper?.toFixed(1) ?? "—"}</strong></div>
            <div>ATR (14): <strong style={{ color: T.text }}>${ind.atr ?? "—"}</strong></div>
            <div>Estocastico: <strong style={{ color: T.text }}>{ind.stochastic?.k ?? "—"} / {ind.stochastic?.d ?? "—"}</strong></div>
          </div>
        </GlassCard>

        <GlassCard>
          <SectionHeader title="Indicadores Fundamentales" />
          <ScoreBar value={detail.scores?.fundScore} label="Score Fundamental" color={T.purple} />
          <div style={{ marginTop: 12, fontSize: 12, color: T.textMuted, lineHeight: 1.8, fontFamily: T.fontMono }}>
            <div>P/E: <strong style={{ color: T.text }}>{detail.fundamentals?.pe?.toFixed(1) ?? "—"}</strong></div>
            <div>Forward P/E: <strong style={{ color: T.text }}>{detail.fundamentals?.forwardPE?.toFixed(1) ?? "—"}</strong></div>
            <div>PEG: <strong style={{ color: T.text }}>{detail.fundamentals?.pegRatio?.toFixed(2) ?? "—"}</strong></div>
            <div>EPS Growth: <strong style={{ color: T.text }}>{detail.fundamentals?.epsGrowth?.toFixed(1) ?? "—"}%</strong></div>
            <div>Revenue Growth: <strong style={{ color: T.text }}>{detail.fundamentals?.revenueGrowth?.toFixed(1) ?? "—"}%</strong></div>
            <div>Profit Margin: <strong style={{ color: T.text }}>{detail.fundamentals?.profitMargin?.toFixed(1) ?? "—"}%</strong></div>
            <div>ROE: <strong style={{ color: T.text }}>{detail.fundamentals?.returnOnEquity?.toFixed(1) ?? "—"}%</strong></div>
            <div>Div Yield: <strong style={{ color: T.text }}>{detail.quote?.dividendYield?.toFixed(2) || 0}%</strong></div>
          </div>
        </GlassCard>
      </div>

      {/* Performance summary */}
      {ind.performance && (
        <GlassCard style={{ marginBottom: 24 }}>
          <SectionHeader title="Performance" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
            {[
              { label: "1 Semana", value: ind.performance.week1 },
              { label: "1 Mes", value: ind.performance.month1 },
              { label: "3 Meses", value: ind.performance.month3 },
              { label: "6 Meses", value: ind.performance.month6 },
              { label: "1 Ano", value: ind.performance.year1 },
            ].filter((p) => p.value != null).map((p) => {
              const isUp = p.value >= 0;
              return (
                <div key={p.label} style={{
                  padding: "14px 16px", borderRadius: 14, textAlign: "center",
                  background: isUp ? "rgba(0,245,160,0.04)" : "rgba(255,51,102,0.04)",
                  border: `1px solid ${isUp ? "rgba(0,245,160,0.12)" : "rgba(255,51,102,0.12)"}`,
                }}>
                  <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 6 }}>
                    {p.label}
                  </div>
                  <div style={{
                    fontSize: 16, fontWeight: 800, fontFamily: T.fontMono,
                    color: isUp ? T.green : T.red,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  }}>
                    {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {isUp ? "+" : ""}{p.value.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
