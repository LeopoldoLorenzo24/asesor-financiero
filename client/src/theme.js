// ============================================================
// CEDEAR ADVISOR - PREMIUM FINTECH THEME v5
// Dark, glassmorphism, neon accents, trading-terminal aesthetic
// ============================================================

export const T = {
  // ── Base ──
  bg: "#030508",
  bgGradient: "radial-gradient(ellipse at 20% 0%, rgba(6,182,212,0.04) 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(0,229,160,0.03) 0%, transparent 50%)",
  bgCard: "rgba(14, 18, 32, 0.6)",
  bgCardSolid: "#0e1220",
  bgElevated: "rgba(22, 28, 48, 0.8)",
  bgHover: "rgba(255,255,255,0.04)",

  // ── Borders ──
  border: "rgba(148,163,184,0.08)",
  borderLight: "rgba(148,163,184,0.15)",
  borderGlow: "rgba(6,182,212,0.2)",

  // ── Accent palette ──
  green: "#00f5a0",
  greenDim: "#00f5a035",
  greenGlow: "#00f5a018",
  red: "#ff3366",
  redDim: "#ff336635",
  redGlow: "#ff336618",
  yellow: "#fbbf24",
  yellowDim: "#fbbf2435",
  orange: "#fb923c",
  blue: "#38bdf8",
  blueDim: "#38bdf835",
  cyan: "#22d3ee",
  cyanDim: "#22d3ee35",
  purple: "#a78bfa",
  purpleDim: "#a78bfa35",
  pink: "#f472b6",
  pinkDim: "#f472b635",
  gold: "#fbbf24",
  teal: "#2dd4bf",
  tealDim: "#2dd4bf35",

  // ── Text ──
  text: "#f1f5f9",
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
    backdropFilter: "blur(32px) saturate(150%)",
    WebkitBackdropFilter: "blur(32px) saturate(150%)",
    border: `1px solid ${T.border}`,
    borderRadius: 24,
    padding: 28,
    transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
    position: "relative",
    overflow: "hidden",
  },
  cardHover: {
    borderColor: T.borderLight,
    boxShadow: `0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)`,
    transform: "translateY(-3px)",
  },
  label: {
    fontSize: 10,
    color: T.textDim,
    textTransform: "uppercase",
    letterSpacing: "2.5px",
    fontWeight: 700,
    marginBottom: 12,
    fontFamily: T.fontMono,
  },
  value: {
    fontSize: 36,
    fontWeight: 800,
    color: T.text,
    fontFamily: T.fontMono,
    letterSpacing: "-2px",
    lineHeight: 1.05,
  },
  badge: (color) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 14px",
    borderRadius: 24,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.5px",
    background: `${color}14`,
    color,
    border: `1px solid ${color}28`,
    fontFamily: T.fontMono,
    textTransform: "uppercase",
  }),
  th: {
    textAlign: "left",
    padding: "12px 14px",
    fontSize: 10,
    fontWeight: 700,
    color: T.textDim,
    textTransform: "uppercase",
    letterSpacing: "1.5px",
    borderBottom: `1px solid ${T.border}`,
    fontFamily: T.fontMono,
    background: "rgba(148,163,184,0.02)",
  },
  td: {
    padding: "12px 14px",
    borderBottom: `1px solid ${T.border}`,
    color: T.textMuted,
  },
  btn: (variant = "primary") => {
    const base = {
      padding: "11px 22px",
      borderRadius: 14,
      border: "none",
      cursor: "pointer",
      fontFamily: T.font,
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: "0.3px",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
    };
    if (variant === "primary") {
      return { ...base, background: `linear-gradient(135deg, ${T.green}, #00b894)`, color: "#000", boxShadow: `0 4px 20px ${T.green}30` };
    }
    if (variant === "secondary") {
      return { ...base, background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})`, color: "#000", boxShadow: `0 4px 20px ${T.blue}30` };
    }
    if (variant === "danger") {
      return { ...base, background: `linear-gradient(135deg, ${T.red}, #ff1744)`, color: "#fff", boxShadow: `0 4px 20px ${T.red}30` };
    }
    return { ...base, background: "transparent", border: `1px solid ${T.borderLight}`, color: T.textMuted };
  },
  input: {
    padding: "11px 16px",
    borderRadius: 12,
    border: `1px solid ${T.border}`,
    background: "rgba(14,18,32,0.8)",
    color: T.text,
    fontSize: 13,
    fontFamily: T.fontMono,
    outline: "none",
    transition: "all 0.2s",
    width: "100%",
  },
  grid: (minWidth = 260) => ({
    display: "grid",
    gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
  }),
};

// ── Global animations ──
export const globalAnimations = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
  
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(20px); filter: blur(4px); }
    to { opacity: 1; transform: translateY(0); filter: blur(0); }
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-20px); }
    to { opacity: 1; transform: translateX(0); }
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(1.15); }
  }
  
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-6px); }
  }
  
  @keyframes glowPulse {
    0%, 100% { box-shadow: 0 0 20px rgba(0,229,160,0.15); }
    50% { box-shadow: 0 0 40px rgba(0,229,160,0.3); }
  }
  
  body {
    margin: 0;
    background: ${T.bg};
    font-family: ${T.font};
    color: ${T.text};
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overflow-x: hidden;
  }
  
  * {
    scrollbar-width: thin;
    scrollbar-color: rgba(148,163,184,0.15) transparent;
  }
  
  *::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  
  *::-webkit-scrollbar-track {
    background: transparent;
  }
  
  *::-webkit-scrollbar-thumb {
    background: rgba(148,163,184,0.15);
    border-radius: 10px;
  }
  
  *::-webkit-scrollbar-thumb:hover {
    background: rgba(148,163,184,0.25);
  }
`;

// ── Grid background ──
export const gridBg = {
  backgroundImage: `
    radial-gradient(circle at 20% 50%, rgba(6,182,212,0.03) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(0,229,160,0.02) 0%, transparent 50%),
    linear-gradient(rgba(148,163,184,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148,163,184,0.03) 1px, transparent 1px)
  `,
  backgroundSize: "100% 100%, 100% 100%, 48px 48px, 48px 48px",
};

// ── Signal colors ──
export const signalColors = {
  "COMPRA FUERTE": T.green,
  "COMPRA": T.teal,
  "HOLD": T.yellow,
  "PRECAUCION": T.orange,
  "VENTA": T.red,
};

// ── Profiles ──
export const PROFILES = {
  conservative: { id: "conservative", label: "Conservador", icon: "C", color: T.blue, desc: "SPY default, picks ≥85 convicción" },
  moderate:     { id: "moderate",     label: "Moderado",    icon: "M", color: T.cyan,  desc: "50/50 SPY + picks ≥70" },
  aggressive:   { id: "aggressive",   label: "Agresivo",    icon: "A", color: T.purple, desc: "QQQ core + picks ≥60" },
};
