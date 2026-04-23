import React from "react";
import { T, S } from "../theme";
import api from "../api";
import { GlassCard, SectionHeader, AnimatedNumber } from "../components/common";

export default function OperationsView({ portfolioDB, ranking, transactions }) {
  const totalValue = portfolioDB.summary.reduce((s, p) => {
    const r = ranking.find((x) => x.cedear?.ticker === p.ticker);
    const price = r?.priceARS || p.weighted_avg_price;
    return s + price * p.total_shares;
  }, 0);
  const totalCost = portfolioDB.summary.reduce((s, p) => s + p.weighted_avg_price * p.total_shares, 0);
  const totalPnl = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;

  return (
    <div className="ca-main" style={{ padding: "32px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader title="Operaciones" subtitle="Portfolio real y historial de transacciones" />

      {/* Summary cards */}
      <div style={{ ...S.grid(240), gap: 16, marginBottom: 28 }}>
        <GlassCard glowColor={T.blue}>
          <div style={S.label}>Valor del Portfolio</div>
          <div style={{ ...S.value, fontSize: 26 }}><AnimatedNumber value={totalValue} prefix="$" /></div>
        </GlassCard>
        <GlassCard glowColor={totalPnl >= 0 ? T.green : T.red}>
          <div style={S.label}>P&L Total</div>
          <div style={{ ...S.value, fontSize: 26, color: totalPnl >= 0 ? T.green : T.red }}>
            <AnimatedNumber value={totalPnl} suffix="%" decimals={2} />
          </div>
        </GlassCard>
        <GlassCard glowColor={T.purple}>
          <div style={S.label}>Posiciones</div>
          <div style={{ ...S.value, fontSize: 26 }}>{portfolioDB.summary.length}</div>
        </GlassCard>
        <GlassCard glowColor={T.yellow}>
          <div style={S.label}>Transacciones</div>
          <div style={{ ...S.value, fontSize: 26 }}>{transactions.length}</div>
        </GlassCard>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button onClick={api.exportPortfolio} style={{ ...S.btn("ghost"), fontSize: 11, padding: "8px 14px" }}>◆ Exportar Portfolio CSV</button>
        <button onClick={api.exportTransactions} style={{ ...S.btn("ghost"), fontSize: 11, padding: "8px 14px" }}>◆ Exportar Transacciones CSV</button>
      </div>

      <GlassCard style={{ marginBottom: 28, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "24px 28px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ ...S.label, margin: 0 }}>Portfolio Actual</div>
        </div>
        {portfolioDB.summary.length === 0 ? (
          <div style={{ padding: 40, color: T.textDim, textAlign: "center" }}>No hay posiciones registradas.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={S.th}>Ticker</th>
                  <th style={S.th}>Cantidad</th>
                  <th style={S.th}>Precio Promedio</th>
                  <th style={S.th}>Precio Actual</th>
                  <th style={S.th}>Valor Estimado</th>
                  <th style={S.th}>P&L</th>
                </tr>
              </thead>
              <tbody>
                {portfolioDB.summary.map((pos) => {
                  const r = ranking.find((x) => x.cedear?.ticker === pos.ticker);
                  const currentPrice = r?.priceARS || pos.weighted_avg_price;
                  const value = currentPrice * pos.total_shares;
                  const pnl = pos.weighted_avg_price > 0 ? ((currentPrice - pos.weighted_avg_price) / pos.weighted_avg_price) * 100 : 0;
                  return (
                    <tr key={pos.ticker} style={{ transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(148,163,184,0.03)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      <td style={S.td}><strong style={{ color: T.text, fontFamily: T.fontMono, fontSize: 14 }}>{pos.ticker}</strong></td>
                      <td style={{ ...S.td, fontFamily: T.fontMono }}>{pos.total_shares}</td>
                      <td style={{ ...S.td, fontFamily: T.fontMono }}>${pos.weighted_avg_price?.toLocaleString("es-AR")}</td>
                      <td style={{ ...S.td, fontFamily: T.fontMono, color: T.textMuted }}>${currentPrice?.toLocaleString("es-AR")}</td>
                      <td style={S.td}>
                        <span style={{ fontWeight: 700, fontFamily: T.fontMono, color: T.text }}>${value.toLocaleString("es-AR")}</span>
                      </td>
                      <td style={S.td}>
                        <span style={{ fontSize: 12, fontFamily: T.fontMono, fontWeight: 800, color: pnl >= 0 ? T.green : T.red, background: pnl >= 0 ? T.greenGlow : T.redGlow, padding: "3px 10px", borderRadius: 8 }}>
                          {pnl >= 0 ? "▲" : "▼"} {Math.abs(pnl).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "24px 28px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ ...S.label, margin: 0 }}>Últimas Transacciones</div>
        </div>
        {transactions.length === 0 ? (
          <div style={{ padding: 40, color: T.textDim, textAlign: "center" }}>Sin transacciones.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={S.th}>Fecha</th>
                  <th style={S.th}>Tipo</th>
                  <th style={S.th}>Ticker</th>
                  <th style={S.th}>Cantidad</th>
                  <th style={S.th}>Precio</th>
                  <th style={S.th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 20).map((tx) => (
                  <tr key={tx.id} style={{ transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(148,163,184,0.03)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: T.textDim }}>{tx.date_executed}</td>
                    <td style={S.td}>
                      <span style={{ ...S.badge(tx.type === "BUY" ? T.green : T.red), fontSize: 9 }}>{tx.type}</span>
                    </td>
                    <td style={S.td}><strong style={{ color: T.text, fontFamily: T.fontMono }}>{tx.ticker}</strong></td>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>{tx.shares}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>${tx.price_ars?.toLocaleString("es-AR")}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, fontWeight: 700, color: T.text }}>${tx.total_ars?.toLocaleString("es-AR")}</td>
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
