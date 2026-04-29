import React from "react";
import { Search } from "lucide-react";
import { T, S, signalColors } from "../theme";
import { GlassCard, SectionHeader, ScoreBar, Skeleton, HeatBadge } from "../components/common";

export default function DetailView({ selectedTicker, detailLoading, detail, setSelectedTicker }) {
  if (!selectedTicker) return (
    <div className="ca-main" style={{ padding: "28px", maxWidth: 1400, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <div style={{ textAlign: "center", padding: 60, color: T.textDim }}>
        <Search size={36} color={T.textDark} style={{ marginBottom: 12 }} />
        <div>Seleccioná un CEDEAR del ranking para ver el detalle.</div>
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

  return (
    <div className="ca-main" style={{ padding: "28px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <button onClick={() => setSelectedTicker(null)} style={{ ...S.btn("ghost"), marginBottom: 16 }}>← Volver al ranking</button>

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
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <span style={{ ...S.badge(signalColors[detail.scores?.signal] || T.textDim) }}>{detail.scores?.signal}</span>
          <HeatBadge value={detail.scores?.composite} max={100} label="Score" />
          <span style={{ ...S.badge(T.purple) }}>{detail.scores?.horizon}</span>
        </div>
      </GlassCard>

      <div className="ca-detail-grid" style={{ ...S.grid(340), marginBottom: 24 }}>
        <GlassCard>
          <SectionHeader title="Indicadores Técnicos" />
          <ScoreBar value={detail.scores?.techScore} label="Score Técnico" color={T.blue} />
          <div style={{ marginTop: 12, fontSize: 12, color: T.textMuted, lineHeight: 1.8, fontFamily: T.fontMono }}>
            <div>RSI (14): <strong style={{ color: T.text }}>{ind.rsi ?? "—"}</strong></div>
            <div>MACD Hist: <strong style={{ color: T.text }}>{ind.macd?.histogram ?? "—"}</strong></div>
            <div>SMA 20: <strong style={{ color: T.text }}>${ind.sma20?.toFixed(2) ?? "—"}</strong></div>
            <div>SMA 50: <strong style={{ color: T.text }}>${ind.sma50?.toFixed(2) ?? "—"}</strong></div>
            <div>SMA 200: <strong style={{ color: T.text }}>${ind.sma200?.toFixed(2) ?? "—"}</strong></div>
            <div>Bollinger: <strong style={{ color: T.text }}>${ind.bollingerBands?.lower?.toFixed(1) ?? "—"} - ${ind.bollingerBands?.upper?.toFixed(1) ?? "—"}</strong></div>
            <div>ATR (14): <strong style={{ color: T.text }}>${ind.atr ?? "—"}</strong></div>
            <div>Estocástico: <strong style={{ color: T.text }}>{ind.stochastic?.k ?? "—"} / {ind.stochastic?.d ?? "—"}</strong></div>
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
    </div>
  );
}
