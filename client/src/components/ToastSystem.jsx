import React, { useState, useEffect } from "react";
import {
  CheckCircle, AlertCircle, AlertTriangle, Info, X,
  TrendingDown, Target, ShieldAlert, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { T } from "../theme";

const listeners = new Set();
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function showToast({ message, type = "info", duration = 4500, title, icon }) {
  listeners.forEach((fn) => fn({ message, type, duration, title, icon }));
}

const TOAST_ICONS = {
  success: CheckCircle,
  error:   AlertCircle,
  warning: AlertTriangle,
  info:    Info,
};

// Map trade alert codes to structured toast data
function enrichTradeToast(toast) {
  const code = String(toast.code || "");

  if (code.startsWith("portfolio_drawdown") || code === "drawdown_alert") {
    const pctMatch = String(toast.message || "").match(/-?([\d.]+)%/);
    return {
      ...toast,
      title: "Drawdown Critico",
      icon: "drawdown",
      type: "error",
      duration: 8000,
      pct: pctMatch ? pctMatch[1] + "%" : null,
    };
  }
  if (code.startsWith("take_profit")) {
    const ticker = code.replace("take_profit_", "").toUpperCase();
    const pctMatch = String(toast.message || "").match(/(\d+\.?\d*)%/);
    return {
      ...toast,
      title: `Target: ${ticker}`,
      icon: "take_profit",
      type: "success",
      duration: 7000,
      pct: pctMatch ? "+" + pctMatch[1] + "%" : null,
    };
  }
  if (code.startsWith("stop_loss")) {
    const ticker = code.replace("stop_loss_", "").toUpperCase();
    return {
      ...toast,
      title: `Stop-Loss: ${ticker}`,
      icon: "stop_loss",
      type: "warning",
      duration: 7000,
    };
  }
  if (code.startsWith("significant_move") || code.includes("move")) {
    const pctMatch = String(toast.message || "").match(/([-+]?\d+\.?\d*)%/);
    const isUp = pctMatch ? parseFloat(pctMatch[1]) >= 0 : true;
    return {
      ...toast,
      title: isUp ? "Suba Significativa" : "Baja Significativa",
      icon: isUp ? "move_up" : "move_down",
      type: isUp ? "info" : "warning",
      duration: 6000,
    };
  }
  return toast;
}

const TRADE_ICONS = {
  drawdown: TrendingDown,
  take_profit: Target,
  stop_loss: ShieldAlert,
  move_up: ArrowUpRight,
  move_down: ArrowDownRight,
};

export default function ToastSystem() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    return subscribe((toast) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, toast.duration || 4500);
    });
  }, []);

  const dismiss = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes toastProgress {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
      <div style={{
        position: "fixed",
        top: 80, right: 20,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 380,
        pointerEvents: "none",
      }}>
        {toasts.map((toast) => {
          const color =
            toast.type === "success" ? T.green :
            toast.type === "error"   ? T.red   :
            toast.type === "warning" ? T.yellow : T.blue;
          const TradeIcon = toast.icon && TRADE_ICONS[toast.icon];
          const Icon = TradeIcon || TOAST_ICONS[toast.type] || Info;
          const hasTitle = !!toast.title;
          const duration = toast.duration || 4500;

          return (
            <div
              key={toast.id}
              style={{
                background: "rgba(15,23,42,0.97)",
                border: `1px solid ${color}28`,
                borderLeft: `3px solid ${color}`,
                borderRadius: 16,
                padding: hasTitle ? "14px 16px 12px" : "13px 16px",
                color: T.text,
                fontSize: 13,
                fontWeight: 500,
                boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 24px ${color}08, 0 0 0 1px rgba(255,255,255,0.03) inset`,
                backdropFilter: "blur(16px)",
                animation: "slideInRight 0.28s cubic-bezier(0.4,0,0.2,1)",
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                pointerEvents: "all",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: 10,
                background: `${color}12`, border: `1px solid ${color}18`,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, marginTop: 1,
              }}>
                <Icon size={15} color={color} strokeWidth={2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {hasTitle && (
                  <div style={{
                    fontSize: 12, fontWeight: 800, color,
                    marginBottom: 3, letterSpacing: "-0.2px",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    {toast.title}
                    {toast.pct && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 7px",
                        borderRadius: 8, background: `${color}15`,
                        fontFamily: T.fontMono,
                      }}>
                        {toast.pct}
                      </span>
                    )}
                  </div>
                )}
                <span style={{ lineHeight: 1.55, fontSize: hasTitle ? 12 : 13, color: hasTitle ? T.textMuted : T.text }}>
                  {toast.message}
                </span>
              </div>
              <button
                onClick={() => dismiss(toast.id)}
                style={{
                  background: "none", border: "none",
                  cursor: "pointer", color: T.textDim,
                  padding: 2, borderRadius: 5,
                  display: "flex", alignItems: "center",
                  flexShrink: 0, marginTop: 1, transition: "color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.textMuted; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.textDim; }}
              >
                <X size={13} strokeWidth={2.5} />
              </button>
              {/* Progress bar */}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                height: 2, background: "transparent",
              }}>
                <div style={{
                  height: "100%",
                  background: `${color}40`,
                  animation: `toastProgress ${duration}ms linear`,
                  borderRadius: "0 0 0 16px",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// Re-export enrichTradeToast for use in alert polling
export { enrichTradeToast };
