import React, { useState, useEffect, useCallback } from "react";
import { T } from "../theme";

// Global toast registry
const listeners = new Set();
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function showToast({ message, type = "info", duration = 5000 }) {
  listeners.forEach((fn) => fn({ message, type, duration }));
}

export default function ToastSystem() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    return subscribe((toast) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, toast.duration || 5000);
    });
  }, []);

  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10, maxWidth: 360 }}>
      {toasts.map((toast) => {
        const color = toast.type === "success" ? T.green : toast.type === "error" ? T.red : toast.type === "warning" ? T.yellow : T.blue;
        return (
          <div key={toast.id} style={{
            background: "rgba(13,18,30,0.95)",
            border: `1px solid ${color}30`,
            borderLeft: `3px solid ${color}`,
            borderRadius: 14,
            padding: "14px 18px",
            color: T.text,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: `0 8px 32px rgba(0,0,0,0.4)`,
            backdropFilter: "blur(12px)",
            animation: "slideInRight 0.3s ease",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ color, fontSize: 16, flexShrink: 0 }}>{toast.type === "success" ? "◈" : toast.type === "error" ? "◆" : toast.type === "warning" ? "▲" : "◉"}</span>
            <span style={{ lineHeight: 1.5 }}>{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
