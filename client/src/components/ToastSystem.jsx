import React, { useState, useEffect } from "react";
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { T } from "../theme";

const listeners = new Set();
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function showToast({ message, type = "info", duration = 4500 }) {
  listeners.forEach((fn) => fn({ message, type, duration }));
}

const TOAST_ICONS = {
  success: CheckCircle,
  error:   AlertCircle,
  warning: AlertTriangle,
  info:    Info,
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
      `}</style>
      <div style={{
        position: "fixed",
        top: 80, right: 20,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 360,
        pointerEvents: "none",
      }}>
        {toasts.map((toast) => {
          const color =
            toast.type === "success" ? T.green :
            toast.type === "error"   ? T.red   :
            toast.type === "warning" ? T.yellow : T.blue;
          const Icon = TOAST_ICONS[toast.type] || Info;
          return (
            <div
              key={toast.id}
              style={{
                background: "rgba(15,23,42,0.97)",
                border: `1px solid ${color}28`,
                borderLeft: `3px solid ${color}`,
                borderRadius: 14,
                padding: "13px 16px",
                color: T.text,
                fontSize: 13,
                fontWeight: 500,
                boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset`,
                backdropFilter: "blur(16px)",
                animation: "slideInRight 0.28s cubic-bezier(0.4,0,0.2,1)",
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                pointerEvents: "all",
              }}
            >
              <Icon
                size={16}
                color={color}
                strokeWidth={2}
                style={{ flexShrink: 0, marginTop: 1 }}
              />
              <span style={{ lineHeight: 1.55, flex: 1 }}>{toast.message}</span>
              <button
                onClick={() => dismiss(toast.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: T.textDim,
                  padding: 2,
                  borderRadius: 5,
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                  marginTop: 1,
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.textMuted; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.textDim; }}
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
