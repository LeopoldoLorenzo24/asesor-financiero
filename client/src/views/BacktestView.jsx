import React, { useState } from "react";
import { FlaskConical, Play, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { T, S } from "../theme";
import { GlassCard, SectionHeader, MetricCard, Skeleton, StatusMsg } from "../components/common";

export default function BacktestView({
  btMonths, setBtMonths,
  btProfile, setBtProfile,
  runBacktestSim, backtestLoading,
  backtest,
}) {
  const [hoveredRow, setHoveredRow] = useState(null);

  return (
    <div className="ca-main" style={{ padding: "28px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader
        title="Backtest Estrategia Core/Satellite"
        action={
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <select value={btMonths} onChange={(e) => setBtMonths(parseInt(e.target.value))} style={{ ...S.input, width: "auto", padding: "8px 12px", fontSize: 12 }}>
              <option value={3}>3 meses</option>
              <option value={6}>6 meses</option>
              <option value={12}>12 meses</option>
              <option value={24}>24 meses</option>
            </select>
            <select value={btProfile} onChange={(e) => setBtProfile(e.target.value)} style={{ ...S.input, width: "auto", padding: "8px 12px", fontSize: 12 }}>
              <option value="conservative">Conservador</option>
              <option value="moderate">Moderado</option>
              <option value="aggressive">Agresivo</option>
            </select>
            <button onClick={runBacktestSim} disabled={backtestLoading} style={{ ...S.btn("primary"), opacity: backtestLoading ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 7 }}>
              {backtestLoading
                ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Calculando...</>
                : <><Play size={14} /> Correr Backtest</>
              }
            </button>
          </div>
        }
      />

      <GlassCard>
        {backtestLoading ? (
          <Skeleton width="100%" height={300} />
        ) : backtest ? (
          <div>
            {backtest.error ? (
              <StatusMsg type="error">{backtest.error}</StatusMsg>
            ) : (
              <>
                {/* ── Reliability indicator ── */}
                {(() => {
                  const reliable = backtest.reliable;
                  const biasFreePeriods = backtest.biasFreePeriods;
                  const totalPeriods = backtest.totalPeriods;
                  const hasReliabilityData = reliable != null || (biasFreePeriods != null && totalPeriods != null);
                  if (!hasReliabilityData) return null;
                  const isUnreliable = reliable === false || (biasFreePeriods != null && totalPeriods != null && biasFreePeriods < totalPeriods * 0.7);
                  const bannerColor = isUnreliable ? T.red : T.yellow;
                  return (
                    <div style={{
                      padding: "14px 18px",
                      borderRadius: 12,
                      background: `${bannerColor}08`,
                      border: `1px solid ${bannerColor}25`,
                      marginBottom: 16,
                      color: bannerColor,
                      fontSize: 13,
                      fontWeight: 600,
                    }}>
                      {isUnreliable
                        ? `Backtest NO CONFIABLE: más del 30% de períodos tienen sesgo de datos.`
                        : `Backtest con confiabilidad reducida: ${biasFreePeriods ?? "?"} de ${totalPeriods ?? "?"} períodos libres de sesgo.`
                      }
                    </div>
                  );
                })()}

                <div className="ca-perf-grid" style={{ ...S.grid(180), gap: 12, marginBottom: 20 }}>
                  <MetricCard
                    label="Portfolio Total"
                    value={backtest.resultado?.returnPct ?? 0}
                    prefix={backtest.resultado?.returnPct >= 0 ? "+" : ""}
                    suffix="%"
                    decimals={2}
                    color={backtest.resultado?.returnPct >= 0 ? T.green : T.red}
                    delay={0}
                  />
                  <MetricCard
                    label={backtest.core?.etf || "SPY"}
                    value={backtest.core?.returnPct ?? 0}
                    prefix={backtest.core?.returnPct >= 0 ? "+" : ""}
                    suffix="%"
                    decimals={2}
                    color={backtest.core?.returnPct >= 0 ? T.green : T.red}
                    delay={80}
                  />
                  <MetricCard
                    label="Satellite"
                    value={backtest.satellite?.returnPct ?? 0}
                    prefix={backtest.satellite?.returnPct >= 0 ? "+" : ""}
                    suffix="%"
                    decimals={2}
                    color={backtest.satellite?.returnPct >= 0 ? T.green : T.red}
                    delay={160}
                  />
                  <MetricCard
                    label="SPY Benchmark"
                    value={backtest.resultado?.spyReturnPct ?? 0}
                    prefix={backtest.resultado?.spyReturnPct >= 0 ? "+" : ""}
                    suffix="%"
                    decimals={2}
                    color={backtest.resultado?.spyReturnPct >= 0 ? T.green : T.red}
                    delay={240}
                  />
                </div>

                <GlassCard style={{ background: "rgba(3,7,17,0.4)", marginBottom: 20 }}>
                  <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.6 }}>
                    <strong style={{ color: T.text }}>Veredicto:</strong> {backtest.veredicto}
                  </div>
                </GlassCard>

                {backtest.satellite?.holdings?.length > 0 && (
                  <div>
                    <SectionHeader title="Picks del Satellite" />
                    <GlassCard style={{ padding: 0, overflow: "hidden" }}>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr>
                              <th style={S.th}>Ticker</th>
                              <th style={S.th}>Sector</th>
                              <th style={S.th}>Retorno</th>
                              <th style={S.th}>vs SPY</th>
                            </tr>
                          </thead>
                          <tbody>
                            {backtest.satellite.holdings.map((h) => {
                              const vsSpy = h.returnPct - (backtest.resultado?.spyReturnPct || 0);
                              return (
                                <tr
                                  key={h.ticker}
                                  onMouseEnter={() => setHoveredRow(h.ticker)}
                                  onMouseLeave={() => setHoveredRow(null)}
                                  style={{
                                    transition: "background 0.2s ease",
                                    background: hoveredRow === h.ticker ? "rgba(148,163,184,0.03)" : "transparent",
                                  }}
                                >
                                  <td style={{ ...S.td, fontFamily: T.fontMono, fontWeight: 700, color: T.text }}>{h.ticker}</td>
                                  <td style={S.td}>{h.sector}</td>
                                  <td style={{ ...S.td, fontFamily: T.fontMono, color: h.returnPct >= 0 ? T.green : T.red }}>
                                    {h.returnPct >= 0 ? "+" : ""}{h.returnPct?.toFixed(2)}%
                                  </td>
                                  <td style={{ ...S.td, fontFamily: T.fontMono, color: vsSpy >= 0 ? T.green : T.red }}>
                                    {vsSpy >= 0 ? "+" : ""}{vsSpy.toFixed(2)}pp
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </GlassCard>
                  </div>
                )}

                {/* ── Backtest assumptions ── */}
                <div style={{
                  marginTop: 20,
                  padding: "16px 20px",
                  background: T.bgCard,
                  border: `1px solid ${T.border}`,
                  borderRadius: 12,
                  fontSize: 12,
                  color: T.textDim,
                  lineHeight: 1.8,
                }}>
                  <div style={{ fontWeight: 700, color: T.textMuted, marginBottom: 6 }}>Supuestos del backtest:</div>
                  <div>Comisiones: 0.5% por operación</div>
                  <div>Slippage: 0.5% estimado</div>
                  <div>Dividendos: no reinvertidos</div>
                  <div>DCA mensual al cierre del primer día hábil</div>
                  <div>Stop-loss y take-profit aplicados al cierre diario</div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: 60, color: T.textDim }}>
            <FlaskConical size={36} color={T.textDark} style={{ marginBottom: 12 }} />
            <div>Configurá los parámetros y corré el backtest para ver resultados.</div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
