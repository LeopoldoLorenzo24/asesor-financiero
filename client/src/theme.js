// ============================================================
// CEDEAR ADVISOR - MODERN FINTECH THEME v4
// Dark, glassmorphism, neon accents, trading-terminal aesthetic
// ============================================================

export const T = {
  // ── Base ──
  bg: "#02040a",
  bgCard: "rgba(13, 18, 30, 0.55)",
  bgCardSolid: "#0d121e",
  bgElevated: "rgba(20, 26, 42, 0.75)",
  bgHover: "rgba(255,255,255,0.03)",

  // ── Borders ──
  border: "rgba(148,163,184,0.06)",
  borderLight: "rgba(148,163,184,0.12)",
  borderGlow: "rgba(6,182,212,0.15)",

  // ── Accent palette ──
  green: "#00e5a0",
  greenDim: "#00e5a040",
  greenGlow: "#00e5a020",
  red: "#ff4d6d",
  redDim: "#ff4d6d40",
  redGlow: "#ff4d6d20",
  yellow: "#fbbf24",
  yellowDim: "#fbbf2440",
  orange: "#fb923c",
  blue: "#38bdf8",
  blueDim: "#38bdf840",
  cyan: "#22d3ee",
  cyanDim: "#22d3ee40",
  purple: "#a78bfa",
  purpleDim: "#a78bfa40",
  pink: "#f472b6",
  pinkDim: "#f472b640",
  gold: "#fbbf24",

  // ── Text ──
  text: "#f8fafc",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  textDark: "#475569",

  // ── Typography ──
  font: "'Inter', 'SF Pro Display', system-ui, -apple-system, sans-serif",
  fontMono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
  fontDisplay: "'Inter', system-ui, sans-serif",
};

// ── Style utilities ──
export const S = {
  card: {
    background: T.bgCard,
    backdropFilter: "blur(24px) saturate(140%)",
    WebkitBackdropFilter: "blur(24px) saturate(140%)",
    border: `1px solid ${T.border}`,
    borderRadius: 20,
    padding: 28,
    transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
    position: "relative",
    overflow: "hidden",
  },
  cardHover: {
    borderColor: T.borderLight,
    boxShadow: `0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)`,
    transform: "translateY(-2px)",
  },
  label: {
    fontSize: 10,
    color: T.textDim,
    textTransform: "uppercase",
    letterSpacing: "2px",
    fontWeight: 700,
    marginBottom: 10,
    fontFamily: T.fontMono,
  },
  value: {
    fontSize: 32,
    fontWeight: 800,
    color: T.text,
    fontFamily: T.fontMono,
    letterSpacing: "-1.5px",
    lineHeight: 1.1,
  },
  badge: (color) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 14px",
    borderRadius: 24,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.5px",
    background: `${color}12`,
    color,
    border: `1px solid ${color}25`,
    fontFamily: T.fontMono,
    textTransform: "uppercase",
  }),
  btn: (v = "primary") => ({
    padding: "12px 24px",
    borderRadius: 14,
    border: v === "ghost" ? `1px solid ${T.borderLight}` : "none",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: T.font,
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    background:
      v === "primary"
        ? `linear-gradient(135deg, ${T.green}, #00b894)`
        : v === "danger"
        ? `linear-gradient(135deg, ${T.red}, #e11d48)`
        : v === "blue"
        ? `linear-gradient(135deg, ${T.blue}, ${T.cyan})`
        : v === "purple"
        ? `linear-gradient(135deg, ${T.purple}, ${T.pink})`
        : "transparent",
    color: v === "ghost" ? T.textMuted : "#fff",
    boxShadow:
      v === "primary"
        ? `0 4px 24px ${T.green}30, inset 0 1px 0 rgba(255,255,255,0.15)`
        : v === "danger"
        ? `0 4px 24px ${T.red}30`
        : v === "blue"
        ? `0 4px 24px ${T.blue}30`
        : "none",
  }),
  input: {
    width: "100%",
    padding: "14px 18px",
    background: "rgba(3,7,17,0.7)",
    border: `1px solid ${T.border}`,
    borderRadius: 14,
    color: T.text,
    fontSize: 14,
    fontFamily: T.font,
    boxSizing: "border-box",
    outline: "none",
    transition: "all 0.25s ease",
  },
  grid: (min = 280) => ({
    display: "grid",
    gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
    gap: 20,
  }),
  th: {
    textAlign: "left",
    padding: "16px 14px",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "1.5px",
    color: T.textDark,
    fontWeight: 700,
    whiteSpace: "nowrap",
    borderBottom: `1px solid ${T.borderLight}`,
    background: "rgba(3,7,17,0.6)",
    position: "sticky",
    top: 0,
    zIndex: 2,
    fontFamily: T.fontMono,
  },
  td: {
    padding: "16px 14px",
    borderBottom: `1px solid ${T.border}`,
    fontSize: 13,
    color: T.textMuted,
  },
  mono: { fontFamily: T.fontMono, fontWeight: 600, letterSpacing: "-0.3px" },
};

export const signalColors = {
  "COMPRA FUERTE": T.green,
  COMPRA: T.green,
  HOLD: T.yellow,
  "PRECAUCIÓN": T.orange,
  VENTA: T.red,
  COMPRAR: T.green,
  MANTENER: T.yellow,
  VENDER: T.red,
  WATCHLIST: T.blue,
  BUY: T.green,
  SELL: T.red,
};

export const PROFILES = {
  conservative: {
    id: "conservative",
    label: "Conservador",
    icon: "◆",
    color: T.blue,
    desc: "Preservar capital",
  },
  moderate: {
    id: "moderate",
    label: "Moderado",
    icon: "◈",
    color: T.yellow,
    desc: "Balance riesgo/retorno",
  },
  aggressive: {
    id: "aggressive",
    label: "Agresivo",
    icon: "▲",
    color: T.red,
    desc: "Máximo crecimiento",
  },
};

// ── Animation keyframes (inject via style tag) ──
export const globalAnimations = `
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 4px currentColor; }
  50% { box-shadow: 0 0 12px currentColor; }
}
@keyframes pulse-dot {
  0% { transform: scale(0.95); opacity: 0.7; }
  50% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(0.95); opacity: 0.7; }
}
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes countUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes borderRotate {
  from { --angle: 0deg; }
  to { --angle: 360deg; }
}
`;

// ── Grid background pattern ──
export const gridBg = {
  backgroundImage: `
    radial-gradient(circle at 1px 1px, rgba(148,163,184,0.04) 1px, transparent 0)
  `,
  backgroundSize: "32px 32px",
};
