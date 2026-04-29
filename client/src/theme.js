// ============================================================
// CEDEAR ADVISOR — DESIGN SYSTEM v6
// Premium Fintech · Dark · Glassmorphism · Trading Terminal
// ============================================================

export const T = {
  // ── Base ──
  bg: "#020617",
  bgGradient:
    "radial-gradient(ellipse at 15% 5%, rgba(6,182,212,0.05) 0%, transparent 55%), " +
    "radial-gradient(ellipse at 85% 95%, rgba(0,245,160,0.04) 0%, transparent 55%)",
  bgCard: "rgba(15, 23, 42, 0.55)",
  bgCardSolid: "#0f172a",
  bgElevated: "rgba(22, 32, 56, 0.85)",
  bgInput: "rgba(15, 23, 42, 0.8)",
  bgHover: "rgba(255,255,255,0.035)",
  bgActive: "rgba(255,255,255,0.06)",

  // ── Borders ──
  border: "rgba(148,163,184,0.07)",
  borderLight: "rgba(148,163,184,0.14)",
  borderMedium: "rgba(148,163,184,0.22)",
  borderGlow: "rgba(6,182,212,0.25)",

  // ── Accent palette ──
  green: "#00f5a0",
  greenDim: "rgba(0,245,160,0.2)",
  greenGlow: "rgba(0,245,160,0.08)",
  red: "#ff3366",
  redDim: "rgba(255,51,102,0.2)",
  redGlow: "rgba(255,51,102,0.07)",
  yellow: "#fbbf24",
  yellowDim: "rgba(251,191,36,0.2)",
  orange: "#fb923c",
  orangeDim: "rgba(251,146,60,0.2)",
  blue: "#38bdf8",
  blueDim: "rgba(56,189,248,0.18)",
  cyan: "#22d3ee",
  cyanDim: "rgba(34,211,238,0.18)",
  purple: "#a78bfa",
  purpleDim: "rgba(167,139,250,0.18)",
  pink: "#f472b6",
  pinkDim: "rgba(244,114,182,0.18)",
  teal: "#2dd4bf",
  tealDim: "rgba(45,212,191,0.18)",

  // ── Text ──
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  textDark: "#475569",

  // ── Typography ──
  font: "'Inter', 'SF Pro Display', system-ui, -apple-system, sans-serif",
  fontMono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
  fontDisplay: "'Calistoga', 'Inter', system-ui, sans-serif",

  // ── Radius ──
  radius: { sm: 8, md: 12, lg: 16, xl: 20, "2xl": 24, "3xl": 32 },

  // ── Shadows ──
  shadow: {
    sm: "0 1px 3px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.3)",
    md: "0 4px 16px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.3)",
    lg: "0 12px 40px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.35)",
    xl: "0 24px 64px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.4)",
    green: "0 0 24px rgba(0,245,160,0.25)",
    red: "0 0 24px rgba(255,51,102,0.25)",
    blue: "0 0 24px rgba(56,189,248,0.25)",
    cyan: "0 0 24px rgba(34,211,238,0.25)",
    purple: "0 0 24px rgba(167,139,250,0.25)",
  },
};

// ── Style utilities ──
export const S = {
  card: {
    background: T.bgCard,
    backdropFilter: "blur(28px) saturate(160%)",
    WebkitBackdropFilter: "blur(28px) saturate(160%)",
    border: `1px solid ${T.border}`,
    borderRadius: T.radius["2xl"],
    padding: 28,
    transition: "border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s cubic-bezier(0.4,0,0.2,1)",
    position: "relative",
    overflow: "hidden",
  },
  cardHover: {
    borderColor: T.borderLight,
    boxShadow: `0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)`,
    transform: "translateY(-2px)",
  },
  label: {
    fontSize: 11,
    color: T.textDim,
    textTransform: "uppercase",
    letterSpacing: "2px",
    fontWeight: 700,
    marginBottom: 12,
    fontFamily: T.fontMono,
  },
  value: {
    fontSize: 34,
    fontWeight: 800,
    color: T.text,
    fontFamily: T.fontMono,
    letterSpacing: "-1.5px",
    lineHeight: 1.1,
  },
  badge: (color) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 12px",
    borderRadius: 20,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.8px",
    background: `${color}14`,
    color,
    border: `1px solid ${color}28`,
    fontFamily: T.fontMono,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  }),
  th: {
    textAlign: "left",
    padding: "13px 16px",
    fontSize: 11,
    fontWeight: 700,
    color: T.textDim,
    textTransform: "uppercase",
    letterSpacing: "1.2px",
    borderBottom: `1px solid ${T.border}`,
    fontFamily: T.fontMono,
    background: "rgba(148,163,184,0.015)",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "13px 16px",
    borderBottom: `1px solid ${T.border}`,
    color: T.textMuted,
    fontSize: 13,
  },
  btn: (variant = "primary") => {
    const base = {
      padding: "11px 22px",
      borderRadius: T.radius.lg,
      border: "none",
      cursor: "pointer",
      fontFamily: T.font,
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: "0.1px",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      position: "relative",
      overflow: "hidden",
    };
    if (variant === "primary") {
      return {
        ...base,
        background: `linear-gradient(135deg, ${T.green} 0%, #00c87a 100%)`,
        color: "#000",
        boxShadow: `0 4px 20px rgba(0,245,160,0.25), inset 0 1px 0 rgba(255,255,255,0.2)`,
      };
    }
    if (variant === "secondary") {
      return {
        ...base,
        background: `linear-gradient(135deg, ${T.blue} 0%, ${T.cyan} 100%)`,
        color: "#000",
        boxShadow: `0 4px 20px rgba(56,189,248,0.25), inset 0 1px 0 rgba(255,255,255,0.2)`,
      };
    }
    if (variant === "danger") {
      return {
        ...base,
        background: `linear-gradient(135deg, ${T.red} 0%, #e8003a 100%)`,
        color: "#fff",
        boxShadow: `0 4px 20px rgba(255,51,102,0.25)`,
      };
    }
    if (variant === "ghost") {
      return {
        ...base,
        background: T.bgHover,
        border: `1px solid ${T.border}`,
        color: T.textMuted,
      };
    }
    return {
      ...base,
      background: "transparent",
      border: `1px solid ${T.borderLight}`,
      color: T.textMuted,
    };
  },
  input: {
    padding: "11px 16px",
    borderRadius: T.radius.md,
    border: `1px solid ${T.border}`,
    background: T.bgInput,
    color: T.text,
    fontSize: 14,
    fontFamily: T.font,
    outline: "none",
    transition: "all 0.2s",
    width: "100%",
    boxSizing: "border-box",
  },
  grid: (minWidth = 260) => ({
    display: "grid",
    gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
  }),
};

// ── Global CSS ──
export const globalAnimations = `
  @import url('https://fonts.googleapis.com/css2?family=Calistoga:ital@0;1&family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(16px); filter: blur(4px); }
    to   { opacity: 1; transform: translateY(0);    filter: blur(0);  }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-16px); }
    to   { opacity: 1; transform: translateX(0);     }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1);    }
    50%       { opacity: 0.6; transform: scale(1.2); }
  }
  @keyframes shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }
  @keyframes float {
    0%, 100% { transform: translateY(0px);  }
    50%       { transform: translateY(-5px); }
  }
  @keyframes glowPulse {
    0%, 100% { box-shadow: 0 0 20px rgba(0,245,160,0.12); }
    50%       { box-shadow: 0 0 40px rgba(0,245,160,0.28); }
  }
  @keyframes pulse-dot {
    0%, 100% { opacity: 1;   transform: scale(1);   }
    50%       { opacity: 0.5; transform: scale(1.35); }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(32px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.92); }
    to   { opacity: 1; transform: scale(1);    }
  }
  @keyframes pulse-glow {
    0%, 100% { opacity: 0.5; transform: scale(1);   }
    50%       { opacity: 1;   transform: scale(1.08); }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes bar-fill {
    from { width: 0; }
  }

  :root {
    color-scheme: dark;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: #020617;
    font-family: 'Inter', 'SF Pro Display', system-ui, -apple-system, sans-serif;
    color: #f1f5f9;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overflow-x: hidden;
    line-height: 1.5;
  }

  button { font-family: inherit; }

  * {
    scrollbar-width: thin;
    scrollbar-color: rgba(148,163,184,0.12) transparent;
  }
  *::-webkit-scrollbar       { width: 5px; height: 5px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.12); border-radius: 10px; }
  *::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.22); }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

// ── Grid background ──
export const gridBg = {
  backgroundImage: `
    radial-gradient(ellipse at 15% 5%,  rgba(6,182,212,0.04) 0%, transparent 50%),
    radial-gradient(ellipse at 85% 95%, rgba(0,245,160,0.03) 0%, transparent 50%),
    linear-gradient(rgba(148,163,184,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148,163,184,0.025) 1px, transparent 1px)
  `,
  backgroundSize: "100% 100%, 100% 100%, 48px 48px, 48px 48px",
};

// ── Signal colors ──
export const signalColors = {
  "COMPRA FUERTE": T.green,
  COMPRA: T.teal,
  HOLD: T.yellow,
  PRECAUCION: T.orange,
  VENTA: T.red,
};

// ── Investment Profiles ──
export const PROFILES = {
  conservative: { id: "conservative", label: "Conservador", icon: "C", color: T.blue,   desc: "SPY default, picks ≥85 convicción" },
  moderate:     { id: "moderate",     label: "Moderado",    icon: "M", color: T.cyan,   desc: "50/50 SPY + picks ≥70" },
  aggressive:   { id: "aggressive",   label: "Agresivo",    icon: "A", color: T.purple, desc: "QQQ core + picks ≥60" },
};
