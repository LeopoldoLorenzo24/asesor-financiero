import React from "react";
import { T, S, signalColors } from "../theme";
import { GlassCard, Skeleton, SectionHeader, HeatBadge } from "../components/common";

export default function RankingView({ sectors, filterSector, setFilterSector, sortBy, setSortBy, loading, filtered, loadDetail }) {
  return (
    <div className="ca-main" style={{ padding: "32px", maxWidth: 1440, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader title="Ranking de CEDEARs" subtitle={`${filtered.length} tickers filtrados · Score compuesto por técnico, fundamental y sentimiento`} />

      <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
        <div className="ca-sector-filter" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {sectors.map((s) => (
            <button key={s} onClick={() => setFilterSector(s)} style={{
              padding: "7px 16px", borderRadius: 10, border: "none",
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font,
              background: filterSector === s ? `linear-gradient(135deg, ${T.green}, #00b894)` : "rgba(13,18,30,0.6)",
              color: filterSector === s ? "#fff" : T.textDim,
              boxShadow: filterSector === s ? `0 2px 12px ${T.green}30` : "none",
              transition: "all 0.2s ease",
            }}>
              {s}
            </button>
          ))}
        </div>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...S.input, width: "auto", padding: "9px 14px", fontSize: 12, borderRadius: 10 }}>
          <option value="composite">Score Compuesto</option>
          <option value="technical">Técnico</option>
          <option value="fundamental">Fundamental</option>
          <option value="change">Cambio 1M</option>
        </select>
      </div>

      {loading ? (
        <GlassCard><Skeleton width="100%" height={400} /></GlassCard>
      ) : (
        <GlassCard style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={S.th}>#</th>
                  <th style={S.th}>Ticker</th>
                  <th style={S.th}>Nombre</th>
                  <th style={S.th}>Sector</th>
                  <th style={S.th}>Score</th>
                  <th style={S.th}>Señal</th>
                  <th style={S.th} className="ca-hide-mobile">Téc</th>
                  <th style={S.th} className="ca-hide-mobile">Fund</th>
                  <th style={S.th} className="ca-hide-mobile">Sent</th>
                  <th style={S.th}>Precio ARS</th>
                  <th style={S.th} className="ca-hide-mobile">1M</th>
                  <th style={S.th} className="ca-hide-mobile">RSI</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, i) => {
                  const signalColor = item.scores.signalColor || signalColors[item.scores.signal] || T.textDim;
                  const month1 = item.technical?.indicators?.performance?.month1 || 0;
                  return (
                    <tr key={item.cedear.ticker} onClick={() => loadDetail(item.cedear.ticker)} style={{
                      cursor: "pointer", transition: "all 0.2s ease",
                    }} onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(148,163,184,0.04)";
                    }} onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}>
                      <td style={S.td}><span style={{ fontFamily: T.fontMono, fontWeight: 800, color: T.textDim, fontSize: 11 }}>{i + 1}</span></td>
                      <td style={S.td}><strong style={{ color: T.text, fontFamily: T.fontMono, fontSize: 14 }}>{item.cedear.ticker}</strong></td>
                      <td style={S.td}><span style={{ color: T.textMuted }}>{item.cedear.name}</span></td>
                      <td style={S.td}><span style={{ fontSize: 11, color: T.textDim, fontWeight: 600 }}>{item.cedear.sector}</span></td>
                      <td style={S.td}>
                        <HeatBadge value={item.scores.composite} max={100} />
                      </td>
                      <td style={S.td}>
                        <span style={{ ...S.badge(signalColor), fontSize: 9 }}>{item.scores.signal}</span>
                      </td>
                      <td style={{ ...S.td, color: T.textDim, fontFamily: T.fontMono }} className="ca-hide-mobile">{item.scores.techScore}</td>
                      <td style={{ ...S.td, color: T.textDim, fontFamily: T.fontMono }} className="ca-hide-mobile">{item.scores.fundScore}</td>
                      <td style={{ ...S.td, color: T.textDim, fontFamily: T.fontMono }} className="ca-hide-mobile">{item.scores.sentScore}</td>
                      <td style={S.td}><span style={{ fontFamily: T.fontMono, fontWeight: 700, color: T.text }}>${item.priceARS?.toLocaleString("es-AR") || "—"}</span></td>
                      <td style={{ ...S.td, color: month1 >= 0 ? T.green : T.red, fontFamily: T.fontMono, fontWeight: 700 }} className="ca-hide-mobile">{month1 >= 0 ? "+" : ""}{month1.toFixed(1)}%</td>
                      <td style={{ ...S.td, color: T.textDim, fontFamily: T.fontMono }} className="ca-hide-mobile">{item.technical?.indicators?.rsi || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
