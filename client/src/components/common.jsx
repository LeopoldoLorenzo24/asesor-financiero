import React, { useState, useEffect, useRef } from "react";
import { T, S } from "../theme";

// ── Animated number that counts up ──
export function AnimatedNumber({ value, prefix = "", suffix = "", decimals = 0, duration = 800, color = T.text }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef(null);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = typeof value === "number" ? value : 0;
    const start = performance.now();
    startRef.current = start;

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (progress < 1) requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    requestAnimationFrame(tick);
  }, [value, duration]);

  const formatted = decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString("es-AR");
  return <span style={{ color, fontFamily: T.fontMono, fontWeight: 800, letterSpacing: "-1px" }}>{prefix}{formatted}{suffix}</span>;
}

// ── Glass card with optional glow accent ──
export function GlassCard({ children, style = {}, glowColor, className = "", onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={className}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...S.card,
        ...(hovered ? S.cardHover : {}),
        ...(glowColor ? { boxShadow: `0 0 40px ${glowColor}10, inset 0 1px 0 rgba(255,255,255,0.03)` } : {}),
        ...style,
      }}
    >
      {glowColor && (
        <div style={{
          position: "absolute", top: 0, left: "10%", right: "10%", height: 1,
          background: `linear-gradient(90deg, transparent, ${glowColor}, transparent)`,
          opacity: hovered ? 0.6 : 0.2, transition: "opacity 0.3s ease",
        }} />
      )}
      {children}
    </div>
  );
}

// ── Pulse dot status indicator ──
export function PulseDot({ color = T.green, size = 8, label }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{
        width: size, height: size, borderRadius: "50%", background: color,
        display: "inline-block", animation: "pulse-dot 2s ease-in-out infinite",
        boxShadow: `0 0 8px ${color}60`,
      }} />
      {label && <span style={{ fontSize: 11, color: T.textDim, fontWeight: 600, fontFamily: T.fontMono }}>{label}</span>}
    </div>
  );
}

// ── Gradient text ──
export function GradientText({ children, from = T.green, to = T.cyan, style = {} }) {
  return (
    <span style={{
      background: `linear-gradient(135deg, ${from}, ${to})`,
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
      fontWeight: 800,
      ...style,
    }}>
      {children}
    </span>
  );
}

// ── Metric card (big number + label) ──
export function MetricCard({ label, value, prefix = "", suffix = "", decimals = 0, color = T.text, subtext, trend, trendUp, glowColor, icon, delay = 0 }) {
  return (
    <GlassCard glowColor={glowColor} style={{ animation: `fadeUp 0.5s ease ${delay}ms both` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <span style={S.label}>{label}</span>
        {icon && <span style={{ fontSize: 18, opacity: 0.5 }}>{icon}</span>}
      </div>
      <div style={{ ...S.value, color, marginBottom: 8 }}>
        <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </div>
      {trend && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span style={{
            fontSize: 11, fontWeight: 800, fontFamily: T.fontMono,
            color: trendUp ? T.green : T.red,
            background: trendUp ? T.greenGlow : T.redGlow,
            padding: "2px 8px", borderRadius: 6,
          }}>
            {trendUp ? "▲" : "▼"} {trend}
          </span>
        </div>
      )}
      {subtext && <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.5 }}>{subtext}</div>}
    </GlassCard>
  );
}

// ── Mini sparkline (SVG) ──
export function Sparkline({ data = [], width = 80, height = 28, color = T.green, fill = true }) {
  if (!data.length) return <div style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      {fill && <polygon points={areaPoints} fill={`${color}15`} />}
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Heat badge (color intensity based on value) ──
export function HeatBadge({ value, max = 100, label, suffix = "" }) {
  const pct = Math.min(Math.max(value / max, 0), 1);
  const color = pct > 0.7 ? T.green : pct > 0.4 ? T.yellow : pct > 0.2 ? T.orange : T.red;
  return (
    <span style={{
      ...S.badge(color),
      background: `${color}18`,
      borderColor: `${color}30`,
    }}>
      {label && <span>{label} </span>}
      <span style={{ fontWeight: 800 }}>{value}{suffix}</span>
    </span>
  );
}

// ── Section header with accent line ──
export function SectionHeader({ title, subtitle, action }) {
  return (
    <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 3, height: 20, background: `linear-gradient(180deg, ${T.green}, ${T.cyan})`, borderRadius: 2 }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: "-0.3px" }}>{title}</h2>
        </div>
        {subtitle && <div style={{ fontSize: 12, color: T.textDim, marginLeft: 13 }}>{subtitle}</div>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ── Score bar with glow ──
export function ScoreBar({ value, label, color, h = 6 }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: T.textDim, fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 12, color, fontWeight: 800, fontFamily: T.fontMono }}>{value}</span>
      </div>
      <div style={{ height: h, background: "rgba(148,163,184,0.05)", borderRadius: h, overflow: "hidden", position: "relative" }}>
        <div style={{
          height: "100%", width: `${Math.min(100, Math.max(0, value))}%`,
          background: `linear-gradient(90deg, ${color}60, ${color})`,
          borderRadius: h,
          transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: `0 0 12px ${color}40`,
        }} />
      </div>
    </div>
  );
}

// ── Skeleton loader ──
export function Skeleton({ width = "100%", height = 20 }) {
  return (
    <div style={{
      width, height, borderRadius: 10,
      background: `linear-gradient(90deg, rgba(15,23,42,0.4) 25%, rgba(30,41,59,0.5) 50%, rgba(15,23,42,0.4) 75%)`,
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s infinite",
    }} />
  );
}

// ── Modal ──
export function Modal({ show, onClose, title, children, maxWidth = 520 }) {
  if (!show) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(16px)" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.bgCardSolid, border: `1px solid ${T.borderLight}`, borderRadius: 24, padding: 36, width: "92%", maxWidth, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}>
        <h3 style={{ margin: "0 0 24px", fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px" }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

// ── Confirm modal ──
export function ConfirmModal({ state, onClose }) {
  if (!state) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(16px)" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.bgCardSolid, border: `1px solid ${T.borderLight}`, borderRadius: 24, padding: 36, width: "92%", maxWidth: 480, boxShadow: "0 32px 80px rgba(0,0,0,0.7)" }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>{state.icon || "◈"}</div>
        <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: "-0.3px" }}>{state.title}</h3>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: T.textMuted, lineHeight: 1.7 }}>{state.description}</p>
        {state.tokenWarning && (
          <div style={{ background: `${T.yellow}08`, border: `1px solid ${T.yellow}25`, borderRadius: 14, padding: "12px 16px", marginBottom: 24, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 2 }}>◈</span>
            <div style={{ fontSize: 12, color: T.yellow, lineHeight: 1.6 }}><strong>Consume tokens de Claude:</strong> {state.tokenWarning}</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "11px 22px", borderRadius: 14, border: `1px solid ${T.border}`, background: "transparent", color: T.textMuted, cursor: "pointer", fontWeight: 700, fontSize: 13, transition: "all 0.2s" }}>Cancelar</button>
          <button onClick={() => { state.onConfirm(); onClose(); }} style={{ padding: "11px 22px", borderRadius: 14, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#fff", background: state.variant === "purple" ? `linear-gradient(135deg, ${T.purple}, ${T.pink})` : state.variant === "blue" ? `linear-gradient(135deg, ${T.blue}, ${T.cyan})` : `linear-gradient(135deg, ${T.green}, #00b894)`, boxShadow: state.variant === "purple" ? `0 4px 20px ${T.purple}30` : state.variant === "blue" ? `0 4px 20px ${T.blue}30` : `0 4px 20px ${T.green}30` }}>{state.confirmLabel || "Confirmar"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Info banner ──
export function InfoBanner({ icon, title, children }) {
  return (
    <div style={{ background: `${T.blue}06`, border: `1px solid ${T.blue}12`, borderRadius: 16, padding: "16px 20px", marginBottom: 24, display: "flex", gap: 14, alignItems: "flex-start" }}>
      <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{icon || "◈"}</span>
      <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.7 }}>
        {title && <div style={{ fontWeight: 700, color: T.text, marginBottom: 4, fontSize: 14 }}>{title}</div>}
        {children}
      </div>
    </div>
  );
}

// ── Status message ──
export function StatusMsg({ type, children }) {
  const c = type === "success" ? T.green : type === "error" ? T.red : T.blue;
  return (
    <div style={{ background: `${c}06`, border: `1px solid ${c}25`, borderRadius: 14, padding: 18, marginBottom: 20, borderLeft: `3px solid ${c}` }}>
      <div style={{ color: c, fontSize: 13, fontWeight: 600 }}>{children}</div>
    </div>
  );
}

// ── Pie chart label (recharts) ──
export const PieLabel = ({ cx, cy, midAngle, outerRadius, name, percent }) => {
  if (percent < 0.03) return null;
  const R = Math.PI / 180, radius = outerRadius + 24;
  const x = cx + radius * Math.cos(-midAngle * R);
  const y = cy + radius * Math.sin(-midAngle * R);
  return (
    <text x={x} y={y} fill={T.textMuted} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={11} fontFamily={T.fontMono} fontWeight={600}>
      {name} {(percent * 100).toFixed(0)}%
    </text>
  );
};
