import React, { useState, useCallback } from "react";
import { T, S } from "../theme";
import { GlassCard, Skeleton, StatusMsg, SectionHeader, HeatBadge } from "../components/common";
import api from "../api";

export default function TradingSignalsView({ signals, loading }) {
  const [validateTicker, setValidateTicker] = useState("");
  const [validateAmount, setValidateAmount] = useState("");
  const [validateResult, setValidateResult] = useState(null);
  const [validating, setValidating] = useState(false);

  const handleValidate = useCallback(async () => {
    if (!validateTicker || !validateAmount) return;
    setValidating(true); setValidateResult(null);
    try {
      const res = await api.validateTradingTrade(validateTicker.trim().toUpperCase(), Number(validateAmount));
      setValidateResult({ type: res.valid ? "success" : "error", text: res.message || (res.valid ? "Trade validado correctamente" : "Trade rechazado por reglas de riesgo") });
    } catch (e) {
      setValidateResult({ type: "error", text: e.message });
    } finally { setValidating(false); }
  }, [validateTicker, validateAmount]);

  const list = signals || [];

  return (
    <div className="ca-main" style={{ padding: "32px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader title="Trading Signals" subtitle="Señales intraday y swing generadas por el motor técnico" />

      <GlassCard style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 14,
            background: `linear-gradient(135deg, ${T.blue}, ${T.purple})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, boxShadow: `0 4px 20px ${T.blue}30`,
          }}>▲</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Validar Trade</div>
            <div style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>Verificá si una operación cumple las reglas de riesgo antes de ejecutarla</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 11, color: T.textDim, marginBottom: 6, fontWeight: 700, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px" }}>Ticker</div>
            <input value={validateTicker} onChange={(e) => setValidateTicker(e.target.value)} placeholder="Ej: AAPL" style={{ ...S.input, fontFamily: T.fontMono }} />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 11, color: T.textDim, marginBottom: 6, fontWeight: 700, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px" }}>Monto (ARS)</div>
            <input value={validateAmount} onChange={(e) => setValidateAmount(e.target.value)} placeholder="50000" type="number" style={{ ...S.input, fontFamily: T.fontMono }} />
          </div>
          <button onClick={handleValidate} disabled={validating} style={{ ...S.btn("blue"), opacity: validating ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>◈</span> {validating ? "Validando..." : "Validar"}
          </button>
        </div>
        {validateResult && (
          <div style={{ marginTop: 16 }}>
            <StatusMsg type={validateResult.type}>{validateResult.text}</StatusMsg>
          </div>
        )}
      </GlassCard>

      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "24px 28px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ ...S.label, margin: 0 }}>Señales Activas</div>
        </div>
        {loading ? (
          <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 12 }}>
            <Skeleton height={56} /><Skeleton height={56} /><Skeleton height={56} />
          </div>
        ) : list.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: T.textDim }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>◎</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>No hay señales activas</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Las señales se generan automáticamente según condiciones de mercado</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={S.th}>Ticker</th>
                  <th style={S.th}>Action</th>
                  <th style={S.th}>Confianza</th>
                  <th style={S.th}>Horizonte</th>
                  <th style={S.th}>Entry</th>
                  <th style={S.th}>Stop Loss</th>
                  <th style={S.th}>Take Profit</th>
                  <th style={S.th}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s, idx) => {
                  const action = (s.action || "").toUpperCase();
                  const actionColor = action === "BUY" ? T.green : action === "SELL" ? T.red : T.textDim;
                  return (
                    <tr key={idx} style={{ transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(148,163,184,0.03)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      <td style={S.td}><strong style={{ color: T.text, fontFamily: T.fontMono, fontSize: 14 }}>{s.ticker}</strong></td>
                      <td style={S.td}>
                        <span style={{ ...S.badge(actionColor), fontSize: 10 }}>{action}</span>
                      </td>
                      <td style={S.td}><HeatBadge value={s.confidence || 0} max={100} suffix="%" /></td>
                      <td style={{ ...S.td, fontFamily: T.fontMono, color: T.textDim }}>{s.horizon || "—"}</td>
                      <td style={{ ...S.td, fontFamily: T.fontMono, fontWeight: 700, color: T.text }}>${(s.entryPrice || 0).toLocaleString("es-AR")}</td>
                      <td style={{ ...S.td, fontFamily: T.fontMono, color: T.red }}>${(s.stopLoss || 0).toLocaleString("es-AR")}</td>
                      <td style={{ ...S.td, fontFamily: T.fontMono, color: T.green }}>${(s.takeProfit || 0).toLocaleString("es-AR")}</td>
                      <td style={S.td}><span style={{ color: T.textMuted, fontSize: 12 }}>{s.reason}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
