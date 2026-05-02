import React, { useState, useCallback } from "react";
import { DollarSign, TrendingUp, TrendingDown, Layers, Banknote, RefreshCw, Trash2, ToggleLeft, ToggleRight, Zap, FlaskConical } from "lucide-react";
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
              <Zap size={14} /> {syncing ? "Sincronizando..." : "Sincronizar con IA"}
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
        <MetricCard label="Valor Total" value={totalValue} prefix="$" color={T.text} glowColor={T.blue} icon={DollarSign} />
        <MetricCard label="P&L Total" value={totalPnl} suffix="%" decimals={2} color={totalPnl >= 0 ? T.green : T.red} glowColor={totalPnl >= 0 ? T.green : T.red} icon={totalPnl >= 0 ? TrendingUp : TrendingDown} />
        <MetricCard label="Posiciones" value={positions.length} color={T.text} glowColor={T.purple} icon={Layers} />
        <MetricCard label="Dividendos Est." value={virtualPortfolio?.summary?.totalDividends || 0} prefix="$" color={T.cyan} glowColor={T.cyan} icon={Banknote} />
      </div>

      <GlassCard style={{ marginBottom: 20, borderColor: `${T.blue}25`, background: `${T.blue}06` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PulseDot color={T.blue} size={6} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.blue }}>Ejecucion Realista Activada</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
              Slippage variable · Costos de broker reales · Lotes mínimos BYMA · Partial fills · Dividendos netos
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard style={{ marginBottom: 28, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "24px 28px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ ...S.label, margin: 0 }}>Posiciones Virtuales</div>
        </div>
        {positions.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: T.textDim }}>
            <FlaskConical size={36} color={T.textDark} style={{ marginBottom: 12 }} />
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
                  <th style={S.th}>Div Est.</th>
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
                      <td style={{ ...S.td, fontFamily: T.fontMono, color: T.cyan }}>${(pos.dividendArs || 0).toLocaleString("es-AR")}</td>
                      <td style={S.td}>
                        <span style={{ fontSize: 12, fontFamily: T.fontMono, fontWeight: 800, color: pnl >= 0 ? T.green : T.red, background: pnl >= 0 ? T.greenGlow : T.redGlow, padding: "3px 10px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {pnl >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {Math.abs(pnl).toFixed(1)}%
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
          <SectionHeader title="Regret Analysis" subtitle="Comparación: ¿Cuánto ganarías si seguías al bot al pie de la letra? (incluye dividendos netos)" />
          <div style={{ ...S.grid(240), gap: 16 }}>
            <GlassCard>
              <div style={S.label}>Valor Real</div>
              <div style={{ ...S.value, fontSize: 22 }}><AnimatedNumber value={virtualRegret.realValue || 0} prefix="$" /></div>
            </GlassCard>
            <GlassCard>
              <div style={S.label}>Valor Virtual + Div</div>
              <div style={{ ...S.value, fontSize: 22 }}><AnimatedNumber value={virtualRegret.virtualValue || 0} prefix="$" /></div>
              {virtualRegret.virtualDividends > 0 && (
                <div style={{ fontSize: 11, color: T.cyan, marginTop: 4 }}>Incluye ${virtualRegret.virtualDividends.toLocaleString("es-AR")} en dividendos</div>
              )}
            </GlassCard>
            <GlassCard glowColor={(virtualRegret.diff || 0) >= 0 ? T.green : T.red}>
              <div style={S.label}>Diferencia (Regret)</div>
              <div style={{ ...S.value, fontSize: 22, color: (virtualRegret.diff || 0) >= 0 ? T.green : T.red }}>
                {(virtualRegret.diff || 0) >= 0 ? "+" : ""}<AnimatedNumber value={virtualRegret.diff || 0} prefix="$" />
              </div>
            </GlassCard>
          </div>
          <p style={{ fontSize: 12, color: T.textDim, fontStyle: 'italic', marginTop: 8, lineHeight: 1.6, marginBottom: 0 }}>
            El regret es el costo de la aversión al riesgo. Un regret positivo NO significa que debas cambiar tu estrategia —
            significa que el sistema acertó en este período. Evaluá sobre múltiples ciclos antes de tomar decisiones.
          </p>
        </GlassCard>
      )}
    </div>
  );
}
