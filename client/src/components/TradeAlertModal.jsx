import React, { useState, useEffect, useCallback } from "react";
import {
  TrendingDown, TrendingUp, Target, ShieldAlert, AlertTriangle,
  X, ChevronRight, ArrowDownRight, ArrowUpRight, Bell,
} from "lucide-react";
import { T } from "../theme";

// ── Alert queue pub/sub ──
const alertListeners = new Set();
function subscribeAlerts(fn) { alertListeners.add(fn); return () => alertListeners.delete(fn); }
export function showTradeAlert(alert) {
  alertListeners.forEach((fn) => fn(alert));
}

// ── Parse alert codes into structured data ──
function parseTradeAlert(alert) {
  const code = String(alert.code || "");
  const message = String(alert.message || "");

  if (code.startsWith("portfolio_drawdown") || code === "drawdown_alert") {
    const ddMatch = message.match(/-?([\d.]+)%/);
    const peakMatch = message.match(/pico\s+de\s+\$?([\d.,]+)/i);
    return {
      type: "drawdown",
      icon: TrendingDown,
      color: T.red,
      glowColor: "rgba(255,51,102,0.15)",
      borderColor: "rgba(255,51,102,0.4)",
      title: "Drawdown Critico",
      subtitle: "El portfolio cayo por debajo del limite de riesgo",
      percentage: ddMatch ? parseFloat(ddMatch[1]) : null,
      peakValue: peakMatch ? peakMatch[1] : null,
      message,
      severity: "critical",
      actionHint: "Considerar reducir posiciones riesgosas y aumentar core defensivo.",
    };
  }

  if (code.startsWith("take_profit")) {
    const ticker = code.replace("take_profit_", "").toUpperCase();
    const pctMatch = message.match(/(\d+\.?\d*)%/);
    const priceMatch = message.match(/actual:\s*\$?([\d.,]+)/i);
    const entryMatch = message.match(/entrada:\s*\$?([\d.,]+)/i);
    return {
      type: "take_profit",
      icon: Target,
      color: T.green,
      glowColor: "rgba(0,245,160,0.12)",
      borderColor: "rgba(0,245,160,0.35)",
      title: `Target Alcanzado: ${ticker}`,
      subtitle: "El precio alcanzo el objetivo de ganancia",
      ticker,
      percentage: pctMatch ? parseFloat(pctMatch[1]) : null,
      currentPrice: priceMatch ? priceMatch[1] : null,
      entryPrice: entryMatch ? entryMatch[1] : null,
      message,
      severity: "success",
      actionHint: "Evaluar tomar ganancias parciales o ajustar el stop-loss al alza.",
    };
  }

  if (code.startsWith("stop_loss")) {
    const ticker = code.replace("stop_loss_", "").toUpperCase();
    const pctMatch = message.match(/-?([\d.]+)%/);
    return {
      type: "stop_loss",
      icon: ShieldAlert,
      color: T.orange,
      glowColor: "rgba(251,146,60,0.12)",
      borderColor: "rgba(251,146,60,0.35)",
      title: `Stop-Loss Activado: ${ticker}`,
      subtitle: "El precio alcanzo el nivel de proteccion",
      ticker,
      percentage: pctMatch ? parseFloat(pctMatch[1]) : null,
      message,
      severity: "warning",
      actionHint: "Revisar si conviene ejecutar la venta defensiva o ajustar el stop.",
    };
  }

  if (code.startsWith("significant_move") || code.includes("move")) {
    const ticker = code.replace("significant_move_", "").toUpperCase();
    const pctMatch = message.match(/([-+]?\d+\.?\d*)%/);
    const pct = pctMatch ? parseFloat(pctMatch[1]) : 0;
    const isUp = pct >= 0;
    return {
      type: "significant_move",
      icon: isUp ? ArrowUpRight : ArrowDownRight,
      color: isUp ? T.green : T.red,
      glowColor: isUp ? "rgba(0,245,160,0.10)" : "rgba(255,51,102,0.10)",
      borderColor: isUp ? "rgba(0,245,160,0.3)" : "rgba(255,51,102,0.3)",
      title: `Movimiento Significativo: ${ticker}`,
      subtitle: isUp ? "Suba fuerte detectada en tu posicion" : "Baja fuerte detectada en tu posicion",
      ticker,
      percentage: Math.abs(pct),
      isPositive: isUp,
      message,
      severity: isUp ? "info" : "warning",
      actionHint: isUp
        ? "Considerar tomar ganancias parciales si el movimiento fue excepcional."
        : "Revisar niveles de stop-loss y evaluar reducir exposicion.",
    };
  }

  // Generic trade alert
  return {
    type: "generic",
    icon: Bell,
    color: T.blue,
    glowColor: "rgba(56,189,248,0.10)",
    borderColor: "rgba(56,189,248,0.3)",
    title: "Alerta del Sistema",
    subtitle: code.replace(/_/g, " "),
    message,
    severity: alert.level || "info",
    actionHint: null,
  };
}

// ── Circular progress ring ──
function AlertRing({ percentage, color, size = 80, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, Math.abs(percentage || 0)));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 18, fontWeight: 900, color, fontFamily: T.fontMono, lineHeight: 1 }}>
          {clamped.toFixed(1)}
        </span>
        <span style={{ fontSize: 8, color: T.textDim, fontFamily: T.fontMono, letterSpacing: "1px" }}>%</span>
      </div>
    </div>
  );
}

// ── Price comparison pill ──
function PricePill({ label, value, color }) {
  if (!value) return null;
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "10px 16px", borderRadius: 12,
      background: `${color}08`, border: `1px solid ${color}18`,
      minWidth: 90,
    }}>
      <span style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>
        {label}
      </span>
      <span style={{ fontSize: 16, fontWeight: 800, color, fontFamily: T.fontMono }}>
        ${value}
      </span>
    </div>
  );
}

// ── Main modal component ──
export default function TradeAlertModal() {
  const [queue, setQueue] = useState([]);
  const current = queue[0] || null;

  useEffect(() => {
    return subscribeAlerts((raw) => {
      const parsed = parseTradeAlert(raw);
      setQueue((prev) => [...prev, { ...parsed, _id: Date.now() + Math.random() }]);
    });
  }, []);

  const dismiss = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  useEffect(() => {
    if (!current) return;
    const handleKey = (e) => { if (e.key === "Escape") dismiss(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [current, dismiss]);

  // Auto-dismiss non-critical after 12 seconds
  useEffect(() => {
    if (!current || current.severity === "critical") return;
    const timer = setTimeout(dismiss, 12000);
    return () => clearTimeout(timer);
  }, [current, dismiss]);

  if (!current) return null;

  const Icon = current.icon;
  const remaining = queue.length - 1;

  return (
    <>
      <style>{`
        @keyframes alertSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes alertPulseRing {
          0%, 100% { box-shadow: 0 0 0 0 ${current.borderColor}; }
          50% { box-shadow: 0 0 0 8px transparent; }
        }
        @keyframes alertGlowPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
      <div
        onClick={dismiss}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(2,6,23,0.82)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10000,
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          animation: "fadeIn 0.25s ease",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "#0f172a",
            border: `1px solid ${current.borderColor}`,
            borderRadius: 28,
            padding: 0,
            width: "92%", maxWidth: 440,
            overflow: "hidden",
            boxShadow: `0 24px 64px rgba(0,0,0,0.6), 0 0 40px ${current.glowColor}`,
            animation: "alertSlideUp 0.35s cubic-bezier(0.4,0,0.2,1)",
            position: "relative",
          }}
        >
          {/* Glow accent top bar */}
          <div style={{
            height: 3,
            background: `linear-gradient(90deg, transparent, ${current.color}, transparent)`,
            animation: "alertGlowPulse 2s ease-in-out infinite",
          }} />

          {/* Header */}
          <div style={{
            padding: "24px 28px 0",
            display: "flex", alignItems: "flex-start", gap: 16,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 16,
              background: current.glowColor,
              border: `1px solid ${current.borderColor}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              animation: current.severity === "critical" ? "alertPulseRing 2s ease-in-out infinite" : "none",
            }}>
              <Icon size={22} color={current.color} strokeWidth={2} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: T.text, letterSpacing: "-0.3px", lineHeight: 1.3 }}>
                {current.title}
              </div>
              <div style={{ fontSize: 12, color: T.textDim, marginTop: 4 }}>
                {current.subtitle}
              </div>
            </div>
            <button
              onClick={dismiss}
              style={{
                background: "rgba(148,163,184,0.06)",
                border: `1px solid ${T.border}`,
                borderRadius: 10, cursor: "pointer",
                color: T.textDim, width: 32, height: 32,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.borderLight; e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textDim; }}
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: "20px 28px" }}>
            {/* Visual metrics for specific alert types */}
            {(current.type === "drawdown" || current.type === "take_profit" || current.type === "stop_loss" || current.type === "significant_move") && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: 20, marginBottom: 20, flexWrap: "wrap",
              }}>
                {current.percentage != null && (
                  <AlertRing percentage={current.percentage} color={current.color} />
                )}
                {current.type === "take_profit" && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <PricePill label="Entrada" value={current.entryPrice} color={T.textMuted} />
                    <PricePill label="Actual" value={current.currentPrice} color={T.green} />
                  </div>
                )}
                {current.type === "drawdown" && current.peakValue && (
                  <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    padding: "10px 16px", borderRadius: 12,
                    background: "rgba(255,51,102,0.06)", border: "1px solid rgba(255,51,102,0.15)",
                  }}>
                    <span style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>
                      Pico
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: T.red, fontFamily: T.fontMono }}>
                      ${current.peakValue}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Action hint card */}
            {current.actionHint && (
              <div style={{
                background: `${current.color}08`,
                border: `1px solid ${current.color}15`,
                borderLeft: `3px solid ${current.color}60`,
                borderRadius: 14,
                padding: "14px 16px",
                marginBottom: 16,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <ChevronRight size={14} color={current.color} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.65 }}>
                    {current.actionHint}
                  </span>
                </div>
              </div>
            )}

            {/* Severity badge + timestamp */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 12px", borderRadius: 20,
                background: `${current.color}12`,
                border: `1px solid ${current.color}20`,
                fontSize: 10, fontWeight: 700, color: current.color,
                fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px",
              }}>
                {current.severity === "critical" && <AlertTriangle size={10} strokeWidth={2.5} />}
                {current.severity}
              </div>
              <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono }}>
                {new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: "14px 28px 20px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            borderTop: `1px solid ${T.border}`,
          }}>
            {remaining > 0 && (
              <span style={{ fontSize: 11, color: T.textDim }}>
                +{remaining} alerta{remaining !== 1 ? "s" : ""} pendiente{remaining !== 1 ? "s" : ""}
              </span>
            )}
            <button
              onClick={dismiss}
              style={{
                marginLeft: "auto",
                background: `${current.color}15`,
                border: `1px solid ${current.color}25`,
                borderRadius: 12,
                padding: "10px 22px",
                color: current.color,
                cursor: "pointer",
                fontSize: 13, fontWeight: 700,
                fontFamily: T.font,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `${current.color}25`; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = `${current.color}15`; }}
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
