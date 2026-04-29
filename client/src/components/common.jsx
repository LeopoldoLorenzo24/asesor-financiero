import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp, TrendingDown, X, AlertTriangle, CheckCircle,
  Info, AlertCircle, ChevronRight,
} from "lucide-react";
import { T, S } from "../theme";

// ── Animated number count-up ──
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

  const formatted =
    decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString("es-AR");
  return (
    <span style={{ color, fontFamily: T.fontMono, fontWeight: 800, letterSpacing: "-1px" }}>
      {prefix}{formatted}{suffix}
    </span>
  );
}

// ── Glass card with optional glow accent ──
export function GlassCard({ children, style = {}, glowColor, className = "", onClick }) {
  const [hovered, setHovered] = useState(false);
  const isClickable = Boolean(onClick);
  return (
    <div
      className={className}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...S.card,
        ...(hovered ? S.cardHover : {}),
        ...(glowColor
          ? { boxShadow: hovered
              ? `0 16px 48px rgba(0,0,0,0.5), 0 0 32px ${glowColor}18, inset 0 1px 0 rgba(255,255,255,0.04)`
              : `0 0 28px ${glowColor}10, inset 0 1px 0 rgba(255,255,255,0.02)`
            }
          : {}),
        ...(isClickable ? { cursor: "pointer" } : {}),
        ...style,
      }}
    >
      {glowColor && (
        <div
          style={{
            position: "absolute", top: 0, left: "8%", right: "8%", height: 1,
            background: `linear-gradient(90deg, transparent, ${glowColor}60, transparent)`,
            opacity: hovered ? 0.7 : 0.25,
            transition: "opacity 0.3s ease",
            pointerEvents: "none",
          }}
        />
      )}
      {children}
    </div>
  );
}

// ── Pulse dot status indicator ──
export function PulseDot({ color = T.green, size = 7, label }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <span
        style={{
          width: size, height: size, borderRadius: "50%",
          background: color, display: "inline-block",
          animation: "pulse-dot 2s ease-in-out infinite",
          boxShadow: `0 0 6px ${color}70`,
          flexShrink: 0,
        }}
      />
      {label && (
        <span style={{ fontSize: 12, color: T.textDim, fontWeight: 600, fontFamily: T.fontMono }}>
          {label}
        </span>
      )}
    </div>
  );
}

// ── Gradient text ──
export function GradientText({ children, from = T.green, to = T.cyan, style = {} }) {
  return (
    <span
      style={{
        background: `linear-gradient(135deg, ${from}, ${to})`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        fontWeight: 800,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ── Metric card (big number + label) — premium design ──
export function MetricCard({ label, value, prefix = "", suffix = "", decimals = 0, color = T.text, subtext, trend, trendUp, glowColor, icon: Icon, delay = 0 }) {
  const [hovered, setHovered] = useState(false);
  const accentColor = glowColor || color || T.textDim;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: T.bgCard,
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)",
        borderRadius: T.radius["2xl"],
        border: `1px solid ${hovered ? accentColor + "28" : T.border}`,
        padding: "24px 24px 20px",
        position: "relative",
        overflow: "hidden",
        transition: "border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s cubic-bezier(0.4,0,0.2,1)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hovered
          ? `0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px ${accentColor}15`
          : `0 2px 8px rgba(0,0,0,0.25)`,
        animation: `fadeUp 0.45s ease ${delay}ms both`,
      }}
    >
      {/* Gradient accent line at top */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent 0%, ${accentColor}80 30%, ${accentColor} 50%, ${accentColor}80 70%, transparent 100%)`,
        opacity: hovered ? 1 : 0.45,
        transition: "opacity 0.25s ease",
      }} />

      {/* Ambient glow background */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: "50%",
        background: `radial-gradient(ellipse at 50% -20%, ${accentColor}08 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      {/* Header row */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 18,
        position: "relative",
      }}>
        <span style={{
          fontSize: 11,
          color: T.textDim,
          textTransform: "uppercase",
          letterSpacing: "2px",
          fontWeight: 700,
          fontFamily: T.fontMono,
        }}>
          {label}
        </span>
        {Icon && (
          <div style={{
            width: 32, height: 32,
            borderRadius: 9,
            background: `${accentColor}12`,
            border: `1px solid ${accentColor}20`,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            {typeof Icon === "function"
              ? <Icon size={15} color={accentColor} strokeWidth={2} />
              : <span style={{ fontSize: 12, color: accentColor, fontFamily: T.fontMono, fontWeight: 700 }}>{Icon}</span>
            }
          </div>
        )}
      </div>

      {/* Value */}
      <div style={{
        fontSize: 32,
        fontWeight: 800,
        color,
        fontFamily: T.fontMono,
        letterSpacing: "-1.5px",
        lineHeight: 1.1,
        marginBottom: 12,
        position: "relative",
      }}>
        <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} color={color} />
      </div>

      {/* Trend badge */}
      {trend && (
        <div style={{ marginBottom: 8 }}>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            fontWeight: 700,
            fontFamily: T.fontMono,
            color: trendUp ? T.green : T.red,
            background: trendUp ? "rgba(0,245,160,0.08)" : "rgba(255,51,102,0.08)",
            padding: "3px 10px",
            borderRadius: 20,
            border: `1px solid ${trendUp ? "rgba(0,245,160,0.2)" : "rgba(255,51,102,0.2)"}`,
          }}>
            {trendUp
              ? <TrendingUp size={10} strokeWidth={2.5} />
              : <TrendingDown size={10} strokeWidth={2.5} />
            }
            {trend}
          </span>
        </div>
      )}

      {/* Subtext */}
      {subtext && (
        <div style={{
          fontSize: 12,
          color: T.textDim,
          lineHeight: 1.5,
          position: "relative",
        }}>
          {subtext}
        </div>
      )}
    </div>
  );
}

// ── Mini sparkline (SVG) ──
export function Sparkline({ data = [], width = 80, height = 28, color = T.green, fill = true }) {
  if (!data.length) return <div style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg width={width} height={height} style={{ overflow: "visible", display: "block" }}>
      {fill && <polygon points={areaPoints} fill={`${color}12`} />}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Heat badge (color intensity based on value) ──
export function HeatBadge({ value, max = 100, label, suffix = "" }) {
  const pct = Math.min(Math.max(value / max, 0), 1);
  const color =
    pct > 0.7 ? T.green : pct > 0.4 ? T.yellow : pct > 0.2 ? T.orange : T.red;
  return (
    <span style={{ ...S.badge(color) }}>
      {label && <span>{label}&nbsp;</span>}
      <span style={{ fontWeight: 800 }}>{value}{suffix}</span>
    </span>
  );
}

// ── Section header with accent line ──
export function SectionHeader({ title, subtitle, action }) {
  return (
    <div
      style={{
        marginBottom: 28,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: subtitle ? 6 : 0 }}>
          <div
            style={{
              width: 3, height: 22, flexShrink: 0,
              background: `linear-gradient(180deg, ${T.green}, ${T.cyan})`,
              borderRadius: 2,
            }}
          />
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: T.text, letterSpacing: "-0.4px" }}>
            {title}
          </h2>
        </div>
        {subtitle && (
          <div style={{ fontSize: 13, color: T.textDim, marginLeft: 15, lineHeight: 1.5, marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ── Score bar with glow ──
export function ScoreBar({ value, label, color, h = 6 }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: T.textDim, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, color, fontWeight: 800, fontFamily: T.fontMono }}>{value}</span>
      </div>
      <div
        style={{
          height: h, background: "rgba(148,163,184,0.05)",
          borderRadius: h, overflow: "hidden", position: "relative",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, Math.max(0, value))}%`,
            background: `linear-gradient(90deg, ${color}55, ${color})`,
            borderRadius: h,
            transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: `0 0 10px ${color}35`,
          }}
        />
      </div>
    </div>
  );
}

// ── Skeleton loader ──
export function Skeleton({ width = "100%", height = 20, radius = 10 }) {
  return (
    <div
      style={{
        width, height, borderRadius: radius,
        background: `linear-gradient(90deg,
          rgba(15,23,42,0.5) 25%,
          rgba(30,41,59,0.6) 50%,
          rgba(15,23,42,0.5) 75%)`,
        backgroundSize: "200% 100%",
        animation: "shimmer 1.6s infinite",
      }}
    />
  );
}

// ── Modal ──
export function Modal({ show, onClose, title, children, maxWidth = 520 }) {
  useEffect(() => {
    if (!show) return;
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [show, onClose]);

  if (!show) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 999,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        animation: "fadeIn 0.2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.bgCardSolid,
          border: `1px solid ${T.borderLight}`,
          borderRadius: T.radius["2xl"],
          padding: 36,
          width: "92%", maxWidth,
          maxHeight: "88vh",
          overflowY: "auto",
          boxShadow: T.shadow.xl,
          animation: "scaleIn 0.2s cubic-bezier(0.4,0,0.2,1)",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: "-0.4px", color: T.text }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: T.bgHover,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              color: T.textDim,
              cursor: "pointer",
              width: 32, height: 32,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.borderLight; e.currentTarget.style.color = T.textMuted; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textDim; }}
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Confirm modal ──
export function ConfirmModal({ state, onClose }) {
  useEffect(() => {
    if (!state) return;
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [state, onClose]);

  if (!state) return null;

  const variantColor =
    state.variant === "purple" ? T.purple :
    state.variant === "blue" ? T.blue :
    state.variant === "danger" ? T.red : T.green;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.78)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        animation: "fadeIn 0.2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.bgCardSolid,
          border: `1px solid ${T.borderLight}`,
          borderRadius: T.radius["2xl"],
          padding: 36,
          width: "92%", maxWidth: 460,
          boxShadow: T.shadow.xl,
          animation: "scaleIn 0.2s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {state.icon && (
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: `${variantColor}12`,
            border: `1px solid ${variantColor}25`,
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 20,
          }}>
            {typeof state.icon === "string"
              ? <span style={{ fontSize: 24 }}>{state.icon}</span>
              : React.createElement(state.icon, { size: 24, color: variantColor, strokeWidth: 1.8 })
            }
          </div>
        )}
        <h3 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: "-0.3px" }}>
          {state.title}
        </h3>
        <p style={{ margin: "0 0 24px", fontSize: 14, color: T.textMuted, lineHeight: 1.7 }}>
          {state.description}
        </p>
        {state.tokenWarning && (
          <div style={{
            background: `${T.yellow}08`,
            border: `1px solid ${T.yellow}22`,
            borderRadius: T.radius.lg,
            padding: "12px 16px",
            marginBottom: 24,
            display: "flex", gap: 12, alignItems: "flex-start",
          }}>
            <AlertTriangle size={16} color={T.yellow} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 13, color: T.yellow, lineHeight: 1.6 }}>
              <strong>Consume tokens de Claude:</strong> {state.tokenWarning}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "11px 20px", borderRadius: T.radius.md,
              border: `1px solid ${T.border}`, background: "transparent",
              color: T.textMuted, cursor: "pointer", fontWeight: 600,
              fontSize: 14, transition: "all 0.2s", fontFamily: T.font,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.borderLight; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textMuted; }}
          >
            Cancelar
          </button>
          <button
            onClick={() => { state.onConfirm(); onClose(); }}
            style={{
              padding: "11px 20px", borderRadius: T.radius.md,
              border: "none", cursor: "pointer", fontWeight: 700,
              fontSize: 14, fontFamily: T.font, transition: "all 0.2s",
              background:
                state.variant === "purple" ? `linear-gradient(135deg, ${T.purple}, ${T.pink})` :
                state.variant === "blue"   ? `linear-gradient(135deg, ${T.blue}, ${T.cyan})` :
                state.variant === "danger" ? `linear-gradient(135deg, ${T.red}, #e8003a)` :
                `linear-gradient(135deg, ${T.green}, #00c87a)`,
              color: state.variant === "purple" || state.variant === "danger" ? "#fff" : "#000",
              boxShadow: `0 4px 16px ${variantColor}30`,
            }}
          >
            {state.confirmLabel || "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Info banner ──
export function InfoBanner({ icon: Icon = Info, title, children, variant = "blue" }) {
  const color = variant === "green" ? T.green : variant === "yellow" ? T.yellow : variant === "red" ? T.red : T.blue;
  return (
    <div
      style={{
        background: `${color}06`,
        border: `1px solid ${color}15`,
        borderRadius: T.radius.xl,
        padding: "16px 20px",
        marginBottom: 24,
        display: "flex", gap: 14, alignItems: "flex-start",
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 9,
        background: `${color}12`,
        border: `1px solid ${color}20`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {typeof Icon === "string"
          ? <span style={{ fontSize: 16 }}>{Icon}</span>
          : <Icon size={15} color={color} strokeWidth={2} />
        }
      </div>
      <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.7, paddingTop: 4 }}>
        {title && (
          <div style={{ fontWeight: 700, color: T.text, marginBottom: 4, fontSize: 14 }}>
            {title}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ── Status message ──
export function StatusMsg({ type, children }) {
  const color =
    type === "success" ? T.green :
    type === "error"   ? T.red   :
    type === "warning" ? T.yellow : T.blue;
  const Icon =
    type === "success" ? CheckCircle :
    type === "error"   ? AlertCircle :
    type === "warning" ? AlertTriangle : Info;
  return (
    <div
      style={{
        background: `${color}07`,
        border: `1px solid ${color}22`,
        borderLeft: `3px solid ${color}`,
        borderRadius: T.radius.md,
        padding: "14px 16px",
        marginBottom: 20,
        display: "flex", gap: 12, alignItems: "flex-start",
      }}
    >
      <Icon size={15} color={color} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ color, fontSize: 13, fontWeight: 600, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

// ── Pie chart label (recharts) ──
export const PieLabel = ({ cx, cy, midAngle, outerRadius, name, percent }) => {
  if (percent < 0.04) return null;
  const R = Math.PI / 180;
  const radius = outerRadius + 26;
  const x = cx + radius * Math.cos(-midAngle * R);
  const y = cy + radius * Math.sin(-midAngle * R);
  return (
    <text
      x={x} y={y}
      fill={T.textMuted}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={11}
      fontFamily={T.fontMono}
      fontWeight={600}
    >
      {name} {(percent * 100).toFixed(0)}%
    </text>
  );
};

// ── Divider ──
export function Divider({ style = {} }) {
  return (
    <div
      style={{
        height: 1,
        background: `linear-gradient(90deg, transparent, ${T.border} 20%, ${T.border} 80%, transparent)`,
        margin: "20px 0",
        ...style,
      }}
    />
  );
}

// ── Empty state ──
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px" }}>
      {Icon && (
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: T.bgHover,
          border: `1px solid ${T.border}`,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          marginBottom: 16,
        }}>
          <Icon size={24} color={T.textDim} strokeWidth={1.5} />
        </div>
      )}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.textMuted, marginBottom: 8 }}>{title}</div>
      {description && (
        <div style={{ fontSize: 13, color: T.textDim, lineHeight: 1.6, maxWidth: 320, margin: "0 auto", marginBottom: action ? 20 : 0 }}>
          {description}
        </div>
      )}
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  );
}
