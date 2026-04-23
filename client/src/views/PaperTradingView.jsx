import React, { useState, useCallback } from "react";
import { T, S } from "../theme";
import { GlassCard, MetricCard, SectionHeader, StatusMsg, AnimatedNumber, HeatBadge, PulseDot } from "../components/common";
import api from "../api";

export default function PaperTradingView({ virtualPortfolio, virtualRegret, ranking, aiAnalysis, onSync, onReset, autoSyncEnabled, onToggleAutoSync }) {
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState(null);

  const positions = virtualPortfolio?.positions || [];
  const totalValue = positions.reduce((sum, p) => sum + (p.currentPrice * p.shares), 0);
  const totalCost = positions.reduce((sum, p) => sum + (p.avgPrice * p.shares), 0);
  const totalPnl = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;

  const handleSync = useCallback(async () => {
    const picks = aiAnalysis?.picks || aiAnalysis?.recommendations || aiAnalysis?.decision_mensual?.picks_activos;
    if (!picks || !picks.length) { setMsg({ type: "error", text: "No hay picks de IA para sincronizar. Ejecutá un análisis primero." }); return; }
    setSyncing(true); setMsg(null);
    try {
      await api.syncVirtualPortfolio(picks);
      if (onSync) onSync();
      setMsg({ type: "success", text: `Portfolio virtual sincronizado con ${picks.length} picks de IA.` });
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally { setSyncing(false); }
  }, [aiAnalysis, onSync]);

  return (
    <div className="ca-main" style={{ padding: "32px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader
        title="Paper Trading"
        subtitle="Portfolio virtual para testear estrategias sin riesgo real"
        action={
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleSync} disabled={syncing} style={{ ...S.btn("primary"), opacity: syncing ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14 }}>◈</span> {syncing ? "Sincronizando..." : "Sincronizar con IA"}
            </button>
            {onReset && <button onClick={onReset} style={{ ...S.btn("ghost") }}>Resetear</button>}
          </div>
        }
      />

      <GlassCard style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <PulseDot color={autoSyncEnabled ? T.green : T.textDim} size={8} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Auto-Sincronización</div>
            <div style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>
              {autoSyncEnabled ? "El portfolio virtual se sincroniza automáticamente con cada análisis de IA" : "El portfolio virtual se mantiene manual"}
            </div>
          </div>
        </div>
        <button onClick={onToggleAutoSync} style={{
          padding: "8px 16px", borderRadius: 10, border: `1px solid ${autoSyncEnabled ? T.green : T.border}`,
          background: autoSyncEnabled ? `${T.green}15` : "transparent",
          color: autoSyncEnabled ? T.green : T.textDim,
          fontWeight: 700, fontSize: 12, cursor: "pointer",
        }}>
          {autoSyncEnabled ? "Desactivar Auto-Sync" : "Activar Auto-Sync"}
        </button>
      </GlassCard>

      {msg && <StatusMsg type={msg.type}>{msg.text}</StatusMsg>}

      <div style={{ ...S.grid(260), gap: 16, marginBottom: 28 }}>
        <MetricCard label="Valor Total" value={totalValue} prefix="$" color={T.text} glowColor={T.blue} icon="◆" />
        <MetricCard label="P&L Total" value={totalPnl} suffix="%" decimals={2} color={totalPnl >= 0 ? T.green : T.red} glowColor={totalPnl >= 0 ? T.green : T.red} icon="▲" />
        <MetricCard label="Posiciones" value={positions.length} color={T.text} glowColor={T.purple} icon="◈" />
        <MetricCard label="Costo Base" value={totalCost} prefix="$" color={T.text} glowColor={T.yellow} icon="⟐" />
      </div>

      <GlassCard style={{ marginBottom: 28, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "24px 28px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ ...S.label, margin: 0 }}>Posiciones Virtuales</div>
        </div>
        {positions.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: T.textDim }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>◊</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>No hay posiciones en el portfolio virtual</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Sincronizá con el análisis de IA para empezar</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={S.th}>Ticker</th>
                  <th style={S.th}>Cantidad</th>
                  <th style={S.th}>Precio Promedio</th>
                  <th style={S.th}>Precio Actual</th>
                  <th style={S.th}>Valor</th>
                  <th style={S.th}>P&L</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => {
                  const value = (pos.currentPrice || 0) * (pos.shares || 0);
                  const cost = (pos.avgPrice || 0) * (pos.shares || 0);
                  const pnl = cost > 0 ? ((value - cost) / cost) * 100 : 0;
                  return (
                    <tr key={pos.ticker} style={{ transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(148,163,184,0.03)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      <td style={S.td}><strong style={{ color: T.text, fontFamily: T.fontMono, fontSize: 14 }}>{pos.ticker}</strong></td>
                      <td style={{ ...S.td, fontFamily: T.fontMono }}>{pos.shares}</td>
                      <td style={{ ...S.td, fontFamily: T.fontMono }}>${(pos.avgPrice || 0).toLocaleString("es-AR")}</td>
                      <td style={{ ...S.td, fontFamily: T.fontMono, color: T.textMuted }}>${(pos.currentPrice || 0).toLocaleString("es-AR")}</td>
                      <td style={S.td}><span style={{ fontWeight: 700, fontFamily: T.fontMono, color: T.text }}>${value.toLocaleString("es-AR")}</span></td>
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

      {virtualRegret && (
        <GlassCard glowColor={T.cyan}>
          <SectionHeader title="Regret Analysis" subtitle="Comparación: ¿Cuánto ganarías si seguías al bot al pie de la letra?" />
          <div style={{ ...S.grid(240), gap: 16 }}>
            <GlassCard>
              <div style={S.label}>Valor Real</div>
              <div style={{ ...S.value, fontSize: 22 }}><AnimatedNumber value={virtualRegret.realValue || 0} prefix="$" /></div>
            </GlassCard>
            <GlassCard>
              <div style={S.label}>Valor Virtual</div>
              <div style={{ ...S.value, fontSize: 22 }}><AnimatedNumber value={virtualRegret.virtualValue || 0} prefix="$" /></div>
            </GlassCard>
            <GlassCard glowColor={(virtualRegret.diff || 0) >= 0 ? T.green : T.red}>
              <div style={S.label}>Diferencia (Regret)</div>
              <div style={{ ...S.value, fontSize: 22, color: (virtualRegret.diff || 0) >= 0 ? T.green : T.red }}>
                {(virtualRegret.diff || 0) >= 0 ? "+" : ""}<AnimatedNumber value={virtualRegret.diff || 0} prefix="$" />
              </div>
            </GlassCard>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
