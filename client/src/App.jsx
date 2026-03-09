// ============================================================
// CEDEAR ADVISOR v3 — Auth + Profiles + Benchmarks + Backtest
// ============================================================
import React, { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  BarChart, Bar, Legend,
} from "recharts";
import api, { auth } from "./api";

/* ─────────── THEME ─────────── */
const T = {
  bg: "#030711", bgCard: "rgba(15, 23, 42, 0.5)", bgCardSolid: "#0f172a",
  bgElevated: "rgba(15, 23, 42, 0.8)", border: "rgba(148,163,184,0.08)",
  borderLight: "rgba(148,163,184,0.14)",
  green: "#10b981", greenLight: "#34d399",
  red: "#ef4444", redLight: "#f87171",
  yellow: "#fbbf24", orange: "#f97316",
  blue: "#3b82f6", cyan: "#06b6d4",
  purple: "#8b5cf6", pink: "#ec4899",
  gold: "#d4a017",
  text: "#f1f5f9", textMuted: "#94a3b8", textDim: "#64748b", textDark: "#475569",
  font: "'DM Sans', 'Inter', system-ui, -apple-system, sans-serif",
  fontMono: "'JetBrains Mono', 'SF Mono', monospace",
};

/* ─────────── STYLES ─────────── */
const S = {
  card: { background: T.bgCard, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: `1px solid ${T.border}`, borderRadius: 16, padding: 24, transition: "all 0.3s ease" },
  label: { fontSize: 11, color: T.textDim, textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600, marginBottom: 8 },
  value: { fontSize: 28, fontWeight: 800, color: T.text, fontFamily: T.fontMono, letterSpacing: "-1px" },
  badge: (color) => ({ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", background: `${color}15`, color, border: `1px solid ${color}30` }),
  btn: (v = "primary") => ({
    padding: "11px 22px", borderRadius: 12, border: v === "ghost" ? `1px solid ${T.border}` : "none",
    fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: T.font, transition: "all 0.25s ease",
    background: v === "primary" ? `linear-gradient(135deg, ${T.green}, #059669)` : v === "danger" ? `linear-gradient(135deg, ${T.red}, #dc2626)` : v === "blue" ? `linear-gradient(135deg, ${T.blue}, ${T.cyan})` : v === "purple" ? `linear-gradient(135deg, ${T.purple}, ${T.pink})` : "transparent",
    color: v === "ghost" ? T.textMuted : "#fff",
    boxShadow: v === "primary" ? `0 4px 20px ${T.green}25` : v === "danger" ? `0 4px 20px ${T.red}25` : "none",
  }),
  input: { width: "100%", padding: "12px 16px", background: "rgba(3,7,17,0.6)", border: `1px solid ${T.border}`, borderRadius: 12, color: T.text, fontSize: 14, fontFamily: T.font, boxSizing: "border-box", outline: "none" },
  grid: (min = 260) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 16 }),
  th: { textAlign: "left", padding: "14px 12px", fontSize: 10, textTransform: "uppercase", letterSpacing: "1.5px", color: T.textDark, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${T.borderLight}`, background: "rgba(3,7,17,0.5)", position: "sticky", top: 0, zIndex: 2 },
  td: { padding: "14px 12px", borderBottom: `1px solid ${T.border}`, fontSize: 13 },
  mono: { fontFamily: T.fontMono, fontWeight: 600 },
};

const signalColors = { "COMPRA FUERTE": T.green, COMPRA: T.greenLight, HOLD: T.yellow, "PRECAUCIÓN": T.orange, VENTA: T.red, COMPRAR: T.green, MANTENER: T.yellow, VENDER: T.red, WATCHLIST: T.blue };

/* ─────────── COMPONENTS ─────────── */
function ScoreBar({ value, label, color, h = 6 }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: T.textDim, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, color, fontWeight: 700, fontFamily: T.fontMono }}>{value}</span>
      </div>
      <div style={{ height: h, background: "rgba(148,163,184,0.06)", borderRadius: h, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, value))}%`, background: `linear-gradient(90deg, ${color}80, ${color})`, borderRadius: h, transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)", boxShadow: `0 0 10px ${color}30` }} />
      </div>
    </div>
  );
}

function Skeleton({ width = "100%", height = 20 }) {
  return (
    <div style={{ width, height, borderRadius: 8, background: `linear-gradient(90deg, rgba(15,23,42,0.5) 25%, rgba(30,41,59,0.5) 50%, rgba(15,23,42,0.5) 75%)`, backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }}>
      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }

        /* ── RESPONSIVE ── */
        @media (max-width: 1024px) {
          .ca-header { padding: 10px 16px !important; }
          .ca-main { padding: 20px 16px !important; }
          .ca-nav button { padding: 7px 10px !important; font-size: 10px !important; }
          .ca-hero-detail { padding: 20px !important; }
        }
        @media (max-width: 768px) {
          .ca-header { flex-direction: column !important; align-items: stretch !important; gap: 10px !important; padding: 10px 12px !important; }
          .ca-header-brand { justify-content: center !important; }
          .ca-nav { justify-content: center !important; overflow-x: auto !important; flex-wrap: nowrap !important; -webkit-overflow-scrolling: touch; }
          .ca-nav button { white-space: nowrap !important; padding: 7px 10px !important; font-size: 10px !important; }
          .ca-header-info { justify-content: center !important; }
          .ca-main { padding: 14px 10px !important; }
          .ca-stat-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
          .ca-stat-grid > div { padding: 16px !important; }
          .ca-stat-value { font-size: 20px !important; }
          .ca-picks-grid { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)) !important; gap: 10px !important; }
          .ca-ai-section { padding: 16px !important; }
          .ca-ai-btn { min-width: unset !important; width: 100% !important; }
          .ca-table-wrap { border-radius: 12px !important; }
          .ca-table-wrap table { font-size: 11px !important; }
          .ca-table-wrap th, .ca-table-wrap td { padding: 8px 6px !important; }
          .ca-table-wrap .ca-hide-mobile { display: none !important; }
          .ca-pie-wrap { flex-direction: column !important; }
          .ca-pie-wrap > div { min-width: unset !important; }
          .ca-hero-detail { padding: 16px !important; }
          .ca-hero-detail h2 { font-size: 18px !important; }
          .ca-hero-price { font-size: 22px !important; }
          .ca-perf-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 8px !important; }
          .ca-perf-grid > div { padding: 10px !important; }
          .ca-detail-grid { grid-template-columns: 1fr !important; }
          .ca-sector-filter { overflow-x: auto !important; flex-wrap: nowrap !important; -webkit-overflow-scrolling: touch; padding-bottom: 6px !important; }
          .ca-sector-filter button { white-space: nowrap !important; flex-shrink: 0 !important; }
          .ca-ops-summary { grid-template-columns: 1fr !important; gap: 10px !important; }
          .ca-footer { padding: 20px 12px !important; margin-top: 24px !important; }
        }
        @media (max-width: 480px) {
          .ca-stat-grid { grid-template-columns: 1fr !important; }
          .ca-picks-grid { grid-template-columns: 1fr 1fr !important; }
          .ca-perf-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}

function Modal({ show, onClose, title, children, maxWidth = 520 }) {
  if (!show) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(8px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.bgCardSolid, border: `1px solid ${T.borderLight}`, borderRadius: 20, padding: 32, width: "92%", maxWidth, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(148,163,184,0.05)" }}>
        <h3 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 800 }}>{title}</h3>{children}
      </div>
    </div>
  );
}

function ConfirmModal({ state, onClose }) {
  if (!state) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(10px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.bgCardSolid, border: `1px solid ${T.borderLight}`, borderRadius: 20, padding: 32, width: "92%", maxWidth: 460, boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
        <div style={{ fontSize: 22, marginBottom: 12 }}>{state.icon || "⚡"}</div>
        <h3 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 800, color: T.text }}>{state.title}</h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: T.textMuted, lineHeight: 1.7 }}>{state.description}</p>
        {state.tokenWarning && (
          <div style={{ background: `${T.yellow}10`, border: `1px solid ${T.yellow}30`, borderRadius: 12, padding: "10px 14px", marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>🪙</span>
            <div style={{ fontSize: 12, color: T.yellow, lineHeight: 1.6 }}><strong>Consume tokens de Claude:</strong> {state.tokenWarning}</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ ...S.btn("ghost"), padding: "10px 20px" }}>Cancelar</button>
          <button onClick={() => { state.onConfirm(); onClose(); }} style={{ ...S.btn(state.variant || "primary"), padding: "10px 20px" }}>{state.confirmLabel || "Confirmar"}</button>
        </div>
      </div>
    </div>
  );
}

function InfoBanner({ icon, title, children }) {
  return (
    <div style={{ background: `${T.blue}08`, border: `1px solid ${T.blue}15`, borderRadius: 14, padding: "14px 18px", marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{icon || "ℹ️"}</span>
      <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.7 }}>
        {title && <div style={{ fontWeight: 700, color: T.text, marginBottom: 4, fontSize: 13 }}>{title}</div>}
        {children}
      </div>
    </div>
  );
}

function StatusMsg({ type, children }) {
  const c = type === "success" ? T.green : type === "error" ? T.red : T.blue;
  return (<div style={{ ...S.card, borderColor: `${c}30`, background: `${c}06`, padding: 16, marginBottom: 16, borderLeft: `3px solid ${c}` }}><div style={{ color: c, fontSize: 13 }}>{children}</div></div>);
}

/* Pie chart custom label — renders <text> with explicit fill so Cell colors are not overridden */
const PieLabel = ({ cx, cy, midAngle, outerRadius, name, percent }) => {
  if (percent < 0.03) return null;
  const R = Math.PI / 180, radius = outerRadius + 24;
  const x = cx + radius * Math.cos(-midAngle * R);
  const y = cy + radius * Math.sin(-midAngle * R);
  return <text x={x} y={y} fill={T.textMuted} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={11} fontFamily={T.fontMono} fontWeight={600}>{name} {(percent * 100).toFixed(0)}%</text>;
};

/* ═══════════════════════════════════════════════════════════
   PROFILE CONFIG
   ═══════════════════════════════════════════════════════════ */
const PROFILES = {
  conservative: { id: "conservative", label: "Conservador", icon: "🛡", color: T.blue, desc: "Preservar capital" },
  moderate: { id: "moderate", label: "Moderado", icon: "⚖", color: T.yellow, desc: "Balance riesgo/retorno" },
  aggressive: { id: "aggressive", label: "Agresivo", icon: "🔥", color: T.red, desc: "Máximo crecimiento" },
};

/* ═══════════════════════════════════════════════════════════
   LOGIN SCREEN
   ═══════════════════════════════════════════════════════════ */
function LoginScreen({ onAuth }) {
  const [mode, setMode] = useState(null); // null = checking, "login", "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    auth.status().then(s => setMode(s.canRegister ? "register" : "login")).catch(() => setMode("login"));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      if (mode === "register") await auth.register(email, password);
      else await auth.login(email, password);
      onAuth();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "fixed", top: -200, left: -200, width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, ${T.green}08, transparent 60%)`, pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: -200, right: -200, width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, ${T.purple}06, transparent 60%)`, pointerEvents: "none" }} />
      <div style={{ width: "92%", maxWidth: 420, animation: "fadeUp 0.5s ease" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ width: 64, height: 64, background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`, borderRadius: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 900, color: "#030711", fontFamily: T.fontMono, boxShadow: `0 8px 40px ${T.green}30`, marginBottom: 18 }}>₵</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CEDEAR ADVISOR</h1>
          <p style={{ fontSize: 12, color: T.textDark, letterSpacing: "3px", marginTop: 6 }}>MOTOR DE INVERSIÓN IA</p>
        </div>
        <form onSubmit={handleSubmit} style={{ ...S.card, padding: 32, background: "rgba(15,23,42,0.7)", border: `1px solid ${T.borderLight}` }}>
          <h2 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 800, textAlign: "center" }}>{mode === "register" ? "Crear Cuenta" : "Iniciar Sesión"}</h2>
          {error && <div style={{ background: `${T.red}10`, border: `1px solid ${T.red}30`, borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 12, color: T.red }}>{error}</div>}
          <div style={{ marginBottom: 16 }}>
            <label style={{ ...S.label, display: "block", marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" required style={S.input} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ ...S.label, display: "block", marginBottom: 6 }}>Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" required minLength={6} style={S.input} />
          </div>
          <button type="submit" disabled={loading} style={{ ...S.btn(), width: "100%", padding: 14, fontSize: 15, opacity: loading ? 0.6 : 1 }}>
            {loading ? "Procesando..." : mode === "register" ? "Registrarme" : "Entrar"}
          </button>
        </form>
        <p style={{ textAlign: "center", fontSize: 10, color: T.textDark, marginTop: 20 }}>Acceso exclusivo · Un solo usuario autorizado</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   APP
   ═══════════════════════════════════════════════════════════ */
export default function App() {
  const [loggedIn, setLoggedIn] = useState(auth.isLoggedIn());
  const [view, setView] = useState("dashboard");
  const [profile, setProfile] = useState(localStorage.getItem("cedear_profile") || "moderate");
  const [ranking, setRanking] = useState([]);
  const [ccl, setCcl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSingle, setAiSingle] = useState(null);
  const [aiSingleLoading, setAiSingleLoading] = useState(false);
  const [portfolioDB, setPortfolioDB] = useState({ summary: [], positions: [] });
  const [capital, setCapital] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [analysisSessions, setAnalysisSessions] = useState([]);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncRows, setSyncRows] = useState([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [opForm, setOpForm] = useState({ ticker: "", shares: 10, priceArs: 0, notes: "" });
  const [opMsg, setOpMsg] = useState(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalResult, setEvalResult] = useState(null);
  const [concluding, setConcluding] = useState(null);
  const [conclusionData, setConclusionData] = useState(null);
  const [showConclusionModal, setShowConclusionModal] = useState(false);
  const [chartMonths, setChartMonths] = useState(6);
  const [detailHistory, setDetailHistory] = useState(null);
  const [postmortem, setPostmortem] = useState(null);
  const [pmLoading, setPmLoading] = useState(false);
  const [pmHistory, setPmHistory] = useState([]);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [filterSector, setFilterSector] = useState("Todos");
  const [sortBy, setSortBy] = useState("composite");
  const [rankingUpdatedAt, setRankingUpdatedAt] = useState(null);
  const [rankingCountdown, setRankingCountdown] = useState(0);
  const [showCapitalInput, setShowCapitalInput] = useState(false);
  const [capitalToInvest, setCapitalToInvest] = useState("");
  // New: benchmarks & backtest
  const [benchmarks, setBenchmarks] = useState(null);
  const [benchLoading, setBenchLoading] = useState(false);
  const [capitalHistory, setCapitalHistory] = useState([]);
  const [cooldownInfo, setCooldownInfo] = useState(null);
  const [backtest, setBacktest] = useState(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [btMonths, setBtMonths] = useState(6);
  const [btDeposit, setBtDeposit] = useState(1000000);
  const [btProfile, setBtProfile] = useState(profile);
  const [btPicks, setBtPicks] = useState(4);

  const changeProfile = (p) => { setProfile(p); localStorage.setItem("cedear_profile", p); };

  const loadRanking = useCallback(async () => { setLoading(true); setError(null); try { const d = await api.getRanking({ profile }); setRanking(d.ranking || []); setCcl(d.ccl); setRankingUpdatedAt(Date.now()); setRankingCountdown(300); } catch (e) { setError(`Error: ${e.message}`); } finally { setLoading(false); } }, [profile]);
  const loadPortfolioDB = useCallback(async () => { try { setPortfolioDB(await api.getPortfolioDB()); } catch (e) { console.error(e); } }, []);
  const loadCapital = useCallback(async () => { try { const hist = await api.getCapitalHistory(1); if (hist.length > 0) setCapital(hist[0].capital_available_ars); } catch (e) { console.error(e); } }, []);
  const loadTransactions = useCallback(async () => { try { setTransactions(await api.getTransactions()); } catch (e) { console.error(e); } }, []);
  const loadPredictions = useCallback(async () => { try { setPredictions(await api.getPredictions()); } catch (e) { console.error(e); } }, []);
  const loadPerformance = useCallback(async () => { try { setPerformance(await api.getPerformance(60)); } catch (e) { console.error(e); } }, []);
  const loadSessions = useCallback(async () => { try { setAnalysisSessions(await api.getAnalysisSessions(10)); } catch (e) { console.error(e); } }, []);
  const loadBenchmarks = useCallback(async () => { setBenchLoading(true); try { setBenchmarks(await api.getBenchmarks()); } catch (e) { console.error(e); } finally { setBenchLoading(false); } }, []);
  const loadCapitalHistory = useCallback(async () => { try { setCapitalHistory(await api.getCapitalHistory(90)); } catch (e) { console.error(e); } }, []);
  const runBacktestSim = useCallback(async () => { setBacktestLoading(true); try { setBacktest(await api.getBacktest(btMonths, btDeposit, btProfile, btPicks)); } catch (e) { console.error(e); } finally { setBacktestLoading(false); } }, [btMonths, btDeposit, btProfile, btPicks]);
  const handlePostMortem = useCallback(async () => { setPmLoading(true); setPostmortem(null); try { const data = await api.generatePostMortem(); setPostmortem(data); const hist = await api.getPostMortems(); setPmHistory(hist); } catch (err) { setPostmortem({ error: err.message }); } finally { setPmLoading(false); } }, []);
  const confirmPostMortem = () => setConfirmState({ icon: "📊", title: "Generar Post-Mortem Mensual", description: "El bot va a revisar todas las predicciones del último mes, calcular cuántas acertó, qué sectores funcionaron mejor, y extraer lecciones aprendidas. Esas lecciones quedan guardadas y el asesor las usa automáticamente en futuros análisis.", tokenWarning: "Claude va a analizar el historial completo de predicciones para generar las conclusiones. Equivale aproximadamente al costo de 1 análisis de portfolio.", confirmLabel: "Generar Post-Mortem", variant: "purple", onConfirm: handlePostMortem });
  const loadPmHistory = useCallback(async () => { try { setPmHistory(await api.getPostMortems()); } catch (e) { console.error(e); } }, []);
  const handleSeedHistorical = useCallback(async () => { setSeedLoading(true); setSeedResult(null); try { const data = await api.seedHistoricalLessons(); setSeedResult(data); const hist = await api.getPostMortems(); setPmHistory(hist); } catch (err) { setSeedResult({ error: err.message }); } finally { setSeedLoading(false); } }, []);

  useEffect(() => { if (loggedIn) { loadRanking(); loadPortfolioDB(); loadCapital(); } }, [profile, loggedIn]);
  // Auto-refresh ranking every 5 minutes when on ranking/dashboard view
  useEffect(() => {
    if (!loggedIn) return;
    const interval = setInterval(() => {
      if (view === "ranking" || view === "dashboard") loadRanking();
    }, 300000);
    return () => clearInterval(interval);
  }, [loggedIn, view, loadRanking]);
  // Countdown ticker
  useEffect(() => {
    if (rankingCountdown <= 0) return;
    const t = setInterval(() => setRankingCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [rankingCountdown]);
  useEffect(() => { if (!loggedIn) return; if (view === "operaciones") { loadTransactions(); loadPortfolioDB(); } if (view === "predicciones") { loadPredictions(); loadPerformance(); loadPmHistory(); } if (view === "historial") loadSessions(); if (view === "benchmarks") loadBenchmarks(); }, [view, loggedIn]);
  useEffect(() => { if (loggedIn && view === "dashboard" && portfolioDB.summary.length > 0 && !benchmarks) { loadBenchmarks(); loadCapitalHistory(); } }, [view, portfolioDB, loggedIn]);

  const loadDetail = useCallback(async (ticker) => { setSelectedTicker(ticker); setDetailLoading(true); setAiSingle(null); setDetailHistory(null); setChartMonths(6); try { setDetail(await api.getCedear(ticker, profile)); } catch (e) { console.error(e); } finally { setDetailLoading(false); } }, [profile]);
  const loadDetailHistory = useCallback(async (ticker, months) => { try { const data = await api.getHistory(ticker, months); setDetailHistory(data.prices || []); } catch (e) { console.error(e); } }, []);
  const runAI = useCallback(async (investCapital) => { setAiLoading(true); setShowCapitalInput(false); setCooldownInfo(null); try { const d = await api.aiAnalyze(investCapital, profile); setAiAnalysis(d.analysis); } catch (e) { const msg = e.message || ""; if (msg.includes("Esper") || msg.includes("minuto")) { setCooldownInfo({ message: msg }); } else { setAiAnalysis({ error: msg }); } } finally { setAiLoading(false); } }, [profile]);
  const runAISingle = useCallback(async (ticker) => { setAiSingleLoading(true); try { setAiSingle((await api.aiAnalyzeSingle(ticker)).aiAnalysis); } catch (e) { setAiSingle({ error: e.message }); } finally { setAiSingleLoading(false); } }, []);

  const handleBuy = async () => { try { setOpMsg(null); await api.buyPosition(opForm.ticker.toUpperCase(), parseInt(opForm.shares), parseFloat(opForm.priceArs), opForm.notes); setOpMsg({ type: "success", text: `Compra registrada: ${opForm.shares} ${opForm.ticker.toUpperCase()}` }); setShowBuyModal(false); loadPortfolioDB(); loadTransactions(); } catch (e) { setOpMsg({ type: "error", text: e.message }); } };
  const handleSell = async () => { try { setOpMsg(null); await api.sellPosition(opForm.ticker.toUpperCase(), parseInt(opForm.shares), parseFloat(opForm.priceArs), opForm.notes); setOpMsg({ type: "success", text: `Venta registrada: ${opForm.shares} ${opForm.ticker.toUpperCase()}` }); setShowSellModal(false); loadPortfolioDB(); loadTransactions(); } catch (e) { setOpMsg({ type: "error", text: e.message }); } };

  const openSyncModal = () => {
    const rows = portfolioDB.summary.map(p => {
      const r = ranking.find(x => x.cedear?.ticker === p.ticker);
      return {
        ticker: p.ticker,
        oldShares: p.total_shares,
        newShares: p.total_shares,
        priceArs: r?.priceARS ? Math.round(r.priceARS) : Math.round(p.weighted_avg_price),
      };
    });
    setSyncRows(rows);
    setSyncMsg(null);
    setShowSyncModal(true);
  };

  const handleSync = async () => {
    setSyncLoading(true);
    setSyncMsg(null);
    try {
      // Rows with newShares=0 are included so the server can close the position
      // Filter out rows where nothing changed AND shares are not 0
      const positions = syncRows
        .filter(r => parseInt(r.newShares) !== r.oldShares || parseInt(r.newShares) === 0)
        .map(r => ({ ticker: r.ticker, shares: parseInt(r.newShares), priceArs: parseFloat(r.priceArs) }));
      if (positions.length === 0) { setSyncMsg({ type: "error", text: "No hay cambios para sincronizar." }); setSyncLoading(false); return; }
      const res = await api.syncPortfolio(positions);
      const buys = res.created.filter(c => c.type === "BUY");
      const sells = res.created.filter(c => c.type === "SELL");
      const summary = [
        buys.length ? `${buys.length} compra${buys.length > 1 ? "s" : ""}: ${buys.map(c => `+${c.shares} ${c.ticker}`).join(", ")}` : null,
        sells.length ? `${sells.length} venta${sells.length > 1 ? "s" : ""}: ${sells.map(c => `-${c.shares} ${c.ticker}`).join(", ")}` : null,
      ].filter(Boolean).join(" | ");
      setSyncMsg({ type: "success", text: `Sincronizado — ${summary || "sin cambios"}` });
      loadPortfolioDB();
      loadTransactions();
    } catch (e) { setSyncMsg({ type: "error", text: e.message }); }
    finally { setSyncLoading(false); }
  };
  const handleEvaluateAll = async () => { setEvalLoading(true); setEvalResult(null); try { const r = await api.evaluateAll(); setEvalResult(r); loadPredictions(); loadPerformance(); } catch (e) { setEvalResult({ error: e.message }); } finally { setEvalLoading(false); } };
  const confirmEvaluateAll = () => setConfirmState({ icon: "⚖️", title: `Evaluar ${predictions.filter(p => !p.evaluated).length} predicciones pendientes`, description: "El sistema va a buscar el precio actual de cada CEDEAR con predicción pendiente y compararlo contra el precio de entrada para determinar si la predicción fue correcta o no. Este proceso es automático y no consume tokens de Claude.", confirmLabel: "Evaluar Ahora", variant: "blue", onConfirm: handleEvaluateAll });
  const handleConclude = async (predictionId) => { setConcluding(predictionId); setConclusionData(null); setShowConclusionModal(true); try { const data = await api.concludePrediction(predictionId); setConclusionData(data); } catch (err) { setConclusionData({ error: err.message }); } finally { setConcluding(null); } };
  const confirmConclude = (predictionId, ticker) => setConfirmState({ icon: "🔍", title: `Ver Conclusión — ${ticker}`, description: "Claude va a buscar noticias y contexto sobre lo que pasó con este activo, comparar el resultado real contra lo que predijo, y generar una conclusión con aprendizajes para mejorar futuras decisiones.", tokenWarning: "Consume una llamada a Claude para analizar el resultado de esta predicción específica.", confirmLabel: "Ver Conclusión", variant: "purple", onConfirm: () => handleConclude(predictionId) });

  if (!loggedIn) return <LoginScreen onAuth={() => setLoggedIn(true)} />;

  const sectors = ["Todos", ...new Set(ranking.map(r => r.cedear?.sector).filter(Boolean))];
  const filtered = ranking.filter(r => filterSector === "Todos" || r.cedear?.sector === filterSector).sort((a, b) => { if (sortBy === "composite") return b.scores.composite - a.scores.composite; if (sortBy === "technical") return b.scores.techScore - a.scores.techScore; if (sortBy === "fundamental") return b.scores.fundScore - a.scores.fundScore; if (sortBy === "change") return (b.technical?.indicators?.performance?.month1 || 0) - (a.technical?.indicators?.performance?.month1 || 0); return 0; });
  const topPicks = ranking.slice(0, 8);
  const portfolioValue = portfolioDB.summary.reduce((s, p) => { const r = ranking.find(x => x.cedear?.ticker === p.ticker); return s + (r?.priceARS ? r.priceARS * p.total_shares : p.weighted_avg_price * p.total_shares); }, 0);

  const navItems = [{ id: "dashboard", label: "Dashboard", icon: "◈" }, { id: "ranking", label: "Ranking", icon: "◆" }, { id: "operaciones", label: "Operaciones", icon: "⟐" }, { id: "benchmarks", label: "Benchmarks", icon: "◧" }, { id: "backtest", label: "Backtest", icon: "↺" }, { id: "predicciones", label: "Predicciones", icon: "◎" }, { id: "historial", label: "Historial IA", icon: "◉" }];
  const nav = (v) => { setView(v); setSelectedTicker(null); setDetail(null); };

  /* ─── HEADER ─── */
  const renderHeader = () => (
    <header className="ca-header" style={{ background: "rgba(3,7,17,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: `1px solid ${T.border}`, padding: "12px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, position: "sticky", top: 0, zIndex: 100 }}>
      <div className="ca-header-brand" style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 42, height: 42, background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: "#030711", fontFamily: T.fontMono, boxShadow: `0 4px 20px ${T.green}30` }}>₵</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.5px", background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CEDEAR ADVISOR</div>
          <div style={{ fontSize: 9, color: T.textDark, letterSpacing: "3px", fontWeight: 600, marginTop: 1 }}>MOTOR DE INVERSIÓN IA v2</div>
        </div>
      </div>
      <nav className="ca-nav" style={{ display: "flex", gap: 3, background: "rgba(15,23,42,0.5)", borderRadius: 14, padding: 4, border: `1px solid ${T.border}`, flexWrap: "wrap", backdropFilter: "blur(10px)" }}>
        {navItems.map(item => (
          <button key={item.id} onClick={() => nav(item.id)} style={{
            padding: "9px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: T.font, fontWeight: 700, fontSize: 11, transition: "all 0.25s ease",
            background: view === item.id ? `linear-gradient(135deg, ${T.green}, #059669)` : "transparent",
            color: view === item.id ? "#fff" : T.textDim,
            boxShadow: view === item.id ? `0 2px 12px ${T.green}30` : "none",
          }}>
            <span style={{ marginRight: 5, opacity: 0.7 }}>{item.icon}</span>{item.label}
          </button>
        ))}
      </nav>
      <div className="ca-header-info" style={{ display: "flex", gap: 16, fontSize: 12, alignItems: "center", flexWrap: "wrap" }}>
        {ccl && <div style={{ color: T.textDim }}>CCL <span style={{ color: T.cyan, fontWeight: 700, fontFamily: T.fontMono }}>${ccl.venta}</span></div>}
        {/* Profile selector */}
        <div style={{ display: "flex", gap: 3, background: "rgba(15,23,42,0.5)", borderRadius: 10, padding: 3, border: `1px solid ${T.border}` }}>
          {Object.values(PROFILES).map(p => (
            <button key={p.id} onClick={() => changeProfile(p.id)} title={p.desc} style={{
              padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: T.font, fontSize: 10, fontWeight: 700, transition: "all 0.2s",
              background: profile === p.id ? `${p.color}20` : "transparent",
              color: profile === p.id ? p.color : T.textDark,
              boxShadow: profile === p.id ? `0 0 8px ${p.color}15` : "none",
            }}>{p.icon} {p.label}</button>
          ))}
        </div>
        <button onClick={() => auth.logout()} title="Cerrar sesión" style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, color: T.textDim, cursor: "pointer", padding: "5px 10px", fontSize: 10, fontFamily: T.font, fontWeight: 600 }}>Salir ⏻</button>
      </div>
    </header>
  );

  /* ─── AI RESPONSE ─── */
  const renderAIResponse = (a) => {
    if (!a) return <div style={{ textAlign: "center", padding: 40, color: T.textDim, fontSize: 13, lineHeight: 1.8 }}>Presioná <strong style={{ color: T.green }}>"Análisis Mensual"</strong> para que el bot revise tu cartera y te diga qué hacer con el aporte de este mes.</div>;
    if (a.error) return <StatusMsg type="error">Error: {a.error}</StatusMsg>;
    return (
      <div style={{ fontSize: 13, lineHeight: 1.8, animation: "fadeUp 0.4s ease" }}>
        {a.sin_cambios_necesarios && (
          <div style={{ background: `${T.green}10`, borderRadius: 16, padding: 24, marginBottom: 16, border: `2px solid ${T.green}40` }}>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
              <span style={{ fontSize: 36, flexShrink: 0 }}>✅</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: T.green, marginBottom: 8 }}>Cartera alineada — no necesitás hacer nada</div>
                <div style={{ color: T.textMuted, fontSize: 13, lineHeight: 1.7 }}>{a.mensaje_sin_cambios || "Tu cartera está en orden. Las tesis anteriores siguen vigentes y no hay operaciones necesarias por ahora."}</div>
              </div>
            </div>
            <div style={{ background: "rgba(3,7,17,0.4)", borderRadius: 12, padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", borderLeft: `3px solid ${T.yellow}` }}>
              <span style={{ fontSize: 18 }}>📅</span>
              <div style={{ fontSize: 12, color: T.textMuted }}>
                <strong style={{ color: T.yellow }}>¿Cuándo volver a correr el análisis?</strong> Solo si: el mercado tuvo un shock importante (VIX sube fuerte, noticia macro grave) o cuando llegue la fecha de review que indicó el asesor. <strong style={{ color: T.text }}>No lo corras por correrlo — cada análisis consume tokens y puede generarte ansiedad innecesaria.</strong>
              </div>
            </div>
          </div>
        )}
        {a.autoevaluacion && <div style={{ background: `${T.purple}08`, borderRadius: 14, padding: 18, marginBottom: 14, border: `1px solid ${T.purple}20`, borderLeft: `3px solid ${T.purple}` }}><div style={{ ...S.label, color: T.purple }}>Autoevaluación del Bot</div><p style={{ margin: 0, color: T.textMuted, fontSize: 12 }}>{a.autoevaluacion}</p></div>}

        {/* ─── PLAN DE EJECUCIÓN ─── */}
        {a.plan_ejecucion?.length > 0 && (
          <div style={{ background: `linear-gradient(135deg, rgba(3,7,17,0.7), rgba(15,23,42,0.7))`, borderRadius: 16, padding: 24, marginBottom: 18, border: `2px solid ${T.green}30`, boxShadow: `0 0 30px ${T.green}08` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <span style={{ fontSize: 22 }}>📋</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: T.text, letterSpacing: "-0.3px" }}>PLAN DE EJECUCIÓN</div>
                <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>Ejecutar exactamente en este orden — vender primero, luego comprar</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {a.plan_ejecucion.map((step, i) => {
                const isVender = step.tipo === "VENDER";
                const isCore = step.subtipo === "CORE";
                const color = isVender ? T.red : isCore ? T.blue : T.green;
                const icon = isVender ? "↓" : "↑";
                const label = isVender ? "VENDER" : isCore ? `COMPRAR CORE` : "COMPRAR SATELLITE";
                return (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", background: `${color}08`, borderRadius: 12, padding: "14px 16px", border: `1px solid ${color}20`, borderLeft: `3px solid ${color}` }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${color}15`, border: `2px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color, flexShrink: 0, fontFamily: T.fontMono }}>
                      {step.paso}
                    </div>
                    <span style={{ background: `${color}18`, color, border: `1px solid ${color}35`, borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", flexShrink: 0 }}>{icon} {label}</span>
                    <strong style={{ ...S.mono, fontSize: 15, color: T.text, flexShrink: 0 }}>{step.ticker}</strong>
                    <span style={{ fontSize: 13, color, fontWeight: 700, ...S.mono, flexShrink: 0 }}>{step.cantidad_cedears} CEDEARs</span>
                    {step.monto_estimado_ars > 0 && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.textMuted, ...S.mono }}>
                        ≈ <span style={{ color }}>${step.monto_estimado_ars.toLocaleString()}</span>
                        <span style={{ fontSize: 10, color: T.textDim, fontWeight: 400, marginLeft: 4 }}>(est.)</span>
                      </span>
                    )}
                    {step.nota && <span style={{ fontSize: 11, color: T.textDim, marginLeft: "auto", textAlign: "right", maxWidth: 260, lineHeight: 1.4 }}>{step.nota}</span>}
                  </div>
                );
              })}
            </div>
            {a.resumen_operaciones?.capital_disponible_post_ventas > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}`, display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: T.textDim }}>
                <span style={{ color: T.green, fontWeight: 700 }}>Total a desplegar:</span>
                <span style={{ ...S.mono, color: T.green, fontWeight: 800 }}>${a.resumen_operaciones.capital_disponible_post_ventas.toLocaleString()}</span>
                {a.resumen_operaciones.total_a_vender_ars > 0 && <span>(efectivo ${a.resumen_operaciones.capital_disponible_actual?.toLocaleString()} + ventas ${a.resumen_operaciones.total_a_vender_ars?.toLocaleString()})</span>}
              </div>
            )}
            {a._budget_warning && (
              <div style={{ marginTop: 10, padding: "10px 14px", background: `${T.red}10`, borderRadius: 10, border: `1px solid ${T.red}30`, fontSize: 11, color: T.red, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ flexShrink: 0 }}>⚠</span>
                <span>{a._budget_warning}</span>
              </div>
            )}
          </div>
        )}

        <div style={{ background: "rgba(3,7,17,0.4)", borderRadius: 14, padding: 20, marginBottom: 14, border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.green}` }}><div style={{ ...S.label, color: T.green }}>Resumen de Mercado</div><p style={{ margin: 0, color: T.textMuted }}>{a.resumen_mercado}</p></div>
        {a.diagnostico_cartera && (
          <div style={{ background: `${T.purple}06`, borderRadius: 14, padding: 20, marginBottom: 14, border: `1px solid ${T.purple}15`, borderLeft: `3px solid ${T.purple}` }}>
            <div style={{ ...S.label, color: T.purple }}>Diagnóstico de tu Cartera</div>
            <p style={{ color: T.textMuted, fontSize: 13, margin: "8px 0" }}>{a.diagnostico_cartera.estado_general}</p>
            {a.diagnostico_cartera.problemas_detectados?.length > 0 && <div style={{ marginTop: 10 }}>{a.diagnostico_cartera.problemas_detectados.map((p, i) => <div key={i} style={{ fontSize: 12, color: T.red, padding: "4px 0 4px 14px", borderLeft: `2px solid ${T.red}40`, marginBottom: 4 }}>⚠ {p}</div>)}</div>}
            {a.diagnostico_cartera.fortalezas?.length > 0 && <div style={{ marginTop: 10 }}>{a.diagnostico_cartera.fortalezas.map((f, i) => <div key={i} style={{ fontSize: 12, color: T.green, padding: "4px 0 4px 14px", borderLeft: `2px solid ${T.green}40`, marginBottom: 4 }}>✓ {f}</div>)}</div>}
          </div>
        )}
        {a.acciones_cartera_actual?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ ...S.label, color: T.orange, marginBottom: 14 }}>Acciones sobre tu Cartera Actual</div>
            {a.acciones_cartera_actual.map((acc, i) => {
              const actionColors = { MANTENER: T.yellow, AUMENTAR: T.green, REDUCIR: T.orange, VENDER: T.red };
              const color = actionColors[acc.accion] || T.yellow;
              return (
                <div key={i} style={{ background: "rgba(3,7,17,0.4)", borderRadius: 14, padding: 16, border: `1px solid ${T.border}`, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={S.badge(color)}>{acc.accion}</span>
                  <strong style={{ ...S.mono, fontSize: 15 }}>{acc.ticker}</strong>
                  <span style={{ fontSize: 12, color: T.textDim }}>({acc.cantidad_actual} CEDEARs)</span>
                  {acc.cantidad_ajustar !== 0 && <span style={{ fontSize: 12, color, fontWeight: 700, ...S.mono }}>{acc.accion === "REDUCIR" || acc.accion === "VENDER" ? `Vender ${Math.abs(acc.cantidad_ajustar)}` : `Comprar +${acc.cantidad_ajustar}`}</span>}
                  {acc.urgencia === "alta" && <span style={S.badge(T.red)}>URGENTE</span>}
                  <div style={{ width: "100%", fontSize: 12, color: T.textMuted, marginTop: 2 }}>{acc.razon}</div>
                </div>
              );
            })}
          </div>
        )}
        {a.resumen_operaciones && (
          <div style={{ background: "rgba(3,7,17,0.4)", borderRadius: 14, padding: 18, marginBottom: 14, border: `1px solid ${T.green}15` }}>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
              {a.resumen_operaciones.capital_disponible_actual > 0 && <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: T.cyan, fontWeight: 600, letterSpacing: "1px" }}>EFECTIVO INICIAL</div><div style={{ fontSize: 20, fontWeight: 800, color: T.cyan, ...S.mono, marginTop: 4 }}>${a.resumen_operaciones.capital_disponible_actual?.toLocaleString()}</div></div>}
              {a.resumen_operaciones.total_a_vender_ars > 0 && <>
                <div style={{ fontSize: 18, color: T.textDark, fontWeight: 700 }}>+</div>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: T.red, fontWeight: 600, letterSpacing: "1px" }}>LIBERAR (VENTAS)</div><div style={{ fontSize: 20, fontWeight: 800, color: T.red, ...S.mono, marginTop: 4 }}>${a.resumen_operaciones.total_a_vender_ars?.toLocaleString()}</div></div>
                <div style={{ fontSize: 18, color: T.textDark, fontWeight: 700 }}>=</div>
              </>}
              <div style={{ textAlign: "center", background: `${T.green}10`, borderRadius: 10, padding: "10px 16px", border: `1px solid ${T.green}20` }}><div style={{ fontSize: 10, color: T.green, fontWeight: 600, letterSpacing: "1px" }}>TOTAL A DESPLEGAR</div><div style={{ fontSize: 22, fontWeight: 800, color: T.green, ...S.mono, marginTop: 4 }}>${(a.resumen_operaciones.capital_disponible_post_ventas || a.resumen_operaciones.capital_total_para_invertir || 0)?.toLocaleString()}</div></div>
              {(a.resumen_operaciones.a_core_ars > 0 || a.resumen_operaciones.a_satellite_ars > 0) && <div style={{ fontSize: 18, color: T.textDark, fontWeight: 700 }}>→</div>}
              {a.resumen_operaciones.a_core_ars > 0 && <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: T.blue, fontWeight: 600, letterSpacing: "1px" }}>CORE ({a.decision_mensual?.core_etf || "SPY"})</div><div style={{ fontSize: 20, fontWeight: 800, color: T.blue, ...S.mono, marginTop: 4 }}>${a.resumen_operaciones.a_core_ars?.toLocaleString()}</div></div>}
              {a.resumen_operaciones.a_satellite_ars > 0 && <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: T.purple, fontWeight: 600, letterSpacing: "1px" }}>SATELLITE (PICKS)</div><div style={{ fontSize: 20, fontWeight: 800, color: T.purple, ...S.mono, marginTop: 4 }}>${a.resumen_operaciones.a_satellite_ars?.toLocaleString()}</div></div>}
              {!a.resumen_operaciones.a_core_ars && a.resumen_operaciones.total_a_comprar_ars > 0 && <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: T.green, fontWeight: 600, letterSpacing: "1px" }}>A INVERTIR</div><div style={{ fontSize: 20, fontWeight: 800, color: T.green, ...S.mono, marginTop: 4 }}>${a.resumen_operaciones.total_a_comprar_ars?.toLocaleString()}</div></div>}
            </div>
            {a.resumen_operaciones.total_a_vender_ars > 0 && a.resumen_operaciones.capital_disponible_actual > 0 && (
              <div style={{ fontSize: 11, color: T.textDim, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                Total = ${a.resumen_operaciones.capital_disponible_actual?.toLocaleString()} efectivo + ${a.resumen_operaciones.total_a_vender_ars?.toLocaleString()} de ventas
              </div>
            )}
          </div>
        )}
        {/* Core/Satellite Decision */}
        {a.decision_mensual && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ background: `${T.blue}08`, borderRadius: 14, padding: 20, border: `1px solid ${T.blue}20`, borderLeft: `3px solid ${T.blue}`, marginBottom: 12 }}>
              <div style={{ ...S.label, color: T.blue }}>Decisión Mensual — Core/Satellite</div>
              <p style={{ color: T.textMuted, fontSize: 13, margin: "8px 0" }}>{a.decision_mensual.resumen}</p>
              {a.decision_mensual.distribucion && (
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
                  <div style={{ background: T.bgCardSolid, borderRadius: 10, padding: "12px 20px", border: `1px solid ${T.blue}30`, textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: T.blue, fontWeight: 700, letterSpacing: "1px" }}>CORE ({a.decision_mensual.core_etf || "SPY"})</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: T.blue, ...S.mono }}>{a.decision_mensual.distribucion.core_pct}%</div>
                    {a.decision_mensual.distribucion.core_monto_ars > 0 && <div style={{ fontSize: 11, color: T.textDim }}>${a.decision_mensual.distribucion.core_monto_ars?.toLocaleString()}</div>}
                  </div>
                  <div style={{ background: T.bgCardSolid, borderRadius: 10, padding: "12px 20px", border: `1px solid ${T.purple}30`, textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: T.purple, fontWeight: 700, letterSpacing: "1px" }}>SATELLITE (PICKS)</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: T.purple, ...S.mono }}>{a.decision_mensual.distribucion.satellite_pct}%</div>
                    {a.decision_mensual.distribucion.satellite_monto_ars > 0 && <div style={{ fontSize: 11, color: T.textDim }}>${a.decision_mensual.distribucion.satellite_monto_ars?.toLocaleString()}</div>}
                  </div>
                </div>
              )}
            </div>
            {/* Satellite Picks with Conviction */}
            {a.decision_mensual.picks_activos?.length > 0 ? (
              <div>
                <div style={{ ...S.label, color: T.purple, marginBottom: 10 }}>Oportunidades Satellite (Picks Activos)</div>
                {a.decision_mensual.picks_activos.map((rec, i) => (
                  <div key={i} style={{ background: "rgba(3,7,17,0.4)", borderRadius: 14, padding: 18, border: `1px solid ${T.border}`, display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center", minWidth: 60 }}>
                      <span style={{ ...S.badge(rec.conviction >= 80 ? T.green : rec.conviction >= 60 ? T.yellow : T.orange), fontSize: 13, fontWeight: 800 }}>{rec.conviction}/100</span>
                      <span style={{ fontSize: 9, color: T.textDim }}>Conviction</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>{rec.ticker} <span style={{ color: T.textDim, fontWeight: 400, fontSize: 12 }}>{rec.nombre} · {rec.sector}</span></div>
                      {rec.por_que_le_gana_a_spy && <p style={{ color: T.cyan, fontSize: 12, margin: "6px 0 0", fontWeight: 600 }}>vs {a.decision_mensual.core_etf || "SPY"}: {rec.por_que_le_gana_a_spy}</p>}
                      <p style={{ color: T.textMuted, fontSize: 12, margin: "4px 0 0" }}>{rec.razon}</p>
                      {rec.cuando_ver_rendimiento && (
                        <p style={{ color: T.yellow, fontSize: 11, margin: "6px 0 0", display: "flex", gap: 5, alignItems: "flex-start" }}>
                          <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>⏱ Cuándo ver rendimientos:</span>
                          <span style={{ fontWeight: 400 }}>{rec.cuando_ver_rendimiento}</span>
                        </p>
                      )}
                      {rec.proyeccion_retornos && (
                        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          {Object.entries(rec.proyeccion_retornos).map(([plazo, retorno]) => (
                            <div key={plazo} style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.18)", borderRadius: 8, padding: "4px 10px", textAlign: "center" }}>
                              <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>{plazo.replace("_", " ")}</div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: String(retorno).startsWith("-") ? T.red : T.green, fontFamily: T.fontMono }}>{retorno}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right", fontSize: 11, color: T.textDim, minWidth: 130 }}>
                      <div><strong style={{ color: T.green }}>${rec.monto_total_ars?.toLocaleString()}</strong> ARS</div>
                      <div>~{rec.cantidad_cedears} CEDEARs</div>
                      {rec.target_pct && <div style={{ color: T.green }}>Target: +{rec.target_pct}%</div>}
                      {rec.stop_loss_pct && <div style={{ color: T.red }}>Stop: {rec.stop_loss_pct}%</div>}
                      <div style={{ color: T.cyan, marginTop: 2 }}>{rec.horizonte}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: `${T.blue}08`, borderRadius: 14, padding: 20, border: `1px solid ${T.blue}20`, textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.blue, marginBottom: 6 }}>100% {a.decision_mensual.core_etf || "SPY"} este mes</div>
                <div style={{ fontSize: 12, color: T.textMuted }}>No hay oportunidades con suficiente convicción. Todo el capital va al índice — y eso está perfecto.</div>
              </div>
            )}
          </div>
        )}
        {/* Legacy: show nuevas_compras if AI responded with old format */}
        {!a.decision_mensual && a.nuevas_compras?.map((rec, i) => (
          <div key={i} style={{ background: "rgba(3,7,17,0.4)", borderRadius: 14, padding: 18, border: `1px solid ${T.border}`, display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
            <span style={S.badge(signalColors[rec.accion] || T.green)}>{rec.accion}</span>
            <div style={{ flex: 1, minWidth: 200 }}><div style={{ fontWeight: 800, fontSize: 15 }}>{rec.ticker} <span style={{ color: T.textDim, fontWeight: 400, fontSize: 12 }}>{rec.nombre} · {rec.sector}</span></div><p style={{ color: T.textMuted, fontSize: 12, margin: "6px 0 0" }}>{rec.razon}</p></div>
            <div style={{ textAlign: "right", fontSize: 11, color: T.textDim, minWidth: 130 }}><div><strong style={{ color: T.green }}>${rec.monto_total_ars?.toLocaleString()}</strong> ARS</div><div>~{rec.cantidad_cedears} CEDEARs</div>{rec.target_pct && <div style={{ color: T.green }}>Target: +{rec.target_pct}%</div>}{rec.stop_loss_pct && <div style={{ color: T.red }}>Stop: {rec.stop_loss_pct}%</div>}<div style={{ color: T.cyan, marginTop: 2 }}>{rec.horizonte}</div></div>
          </div>
        ))}
        {a.cartera_objetivo && (
          <div style={{ background: "rgba(3,7,17,0.4)", borderRadius: 14, padding: 18, marginBottom: 14, border: `1px solid ${T.cyan}15`, borderLeft: `3px solid ${T.cyan}` }}>
            <div style={{ ...S.label, color: T.cyan }}>Cartera Objetivo (post-rebalanceo)</div>
            <p style={{ color: T.textMuted, fontSize: 12, margin: "8px 0" }}>{a.cartera_objetivo.descripcion}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {a.cartera_objetivo.posiciones?.map((pos, i) => (
                <div key={i} style={{ background: T.bgCardSolid, borderRadius: 10, padding: "8px 14px", border: `1px solid ${T.border}`, fontSize: 12 }}>
                  <strong style={S.mono}>{pos.ticker}</strong>
                  <span style={{ color: T.textDim, marginLeft: 8 }}>{pos.sector}</span>
                  <span style={{ color: T.green, marginLeft: 8, fontWeight: 700 }}>{pos.porcentaje_target}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={S.grid(280)}>
          {a.honestidad && <div style={{ background: `${T.orange}08`, borderRadius: 14, padding: 18, border: `1px solid ${T.orange}20`, borderLeft: `3px solid ${T.orange}` }}><div style={{ ...S.label, color: T.orange }}>Honestidad del Bot</div><p style={{ color: T.textMuted, fontSize: 12, margin: "8px 0" }}>{a.honestidad}</p></div>}
          {!a.honestidad && (a.distribucion_capital || a.distribucion_mensual) && <div style={{ background: "rgba(3,7,17,0.4)", borderRadius: 14, padding: 18, border: `1px solid ${T.border}` }}><div style={{ ...S.label, color: T.purple }}>Distribución del Capital</div><p style={{ color: T.textMuted, fontSize: 12, margin: "8px 0" }}>{(a.distribucion_capital || a.distribucion_mensual).estrategia}</p>{(a.distribucion_capital || a.distribucion_mensual).split?.map((s, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}><span style={{ fontWeight: 700 }}>{s.ticker}</span><span style={{ color: T.green }}>${s.monto?.toLocaleString()} ({s.porcentaje}%)</span></div>)}</div>}
          <div style={{ background: "rgba(3,7,17,0.4)", borderRadius: 14, padding: 18, border: `1px solid ${T.orange}15`, borderLeft: `3px solid ${T.orange}` }}><div style={{ ...S.label, color: T.yellow }}>Riesgos</div>{a.riesgos?.map((r, i) => <div key={i} style={{ color: T.textMuted, fontSize: 12, padding: "5px 0 5px 14px", borderLeft: `2px solid ${T.orange}25`, marginBottom: 4 }}>{r}</div>)}{a.proximo_review && <div style={{ marginTop: 12, fontSize: 11, color: T.textDim }}>Review: <strong style={{ color: T.cyan }}>{a.proximo_review}</strong></div>}</div>
        </div>
      </div>
    );
  };

  /* ─── DASHBOARD ─── */
  const renderDashboard = () => {
    const stats = [
      { l: "Capital Disponible", v: `$${capital.toLocaleString()}`, sub: "+$1M/mes", c: T.green, grad: `linear-gradient(135deg, ${T.green}12, transparent)` },
      { l: "Portfolio (BD)", v: `$${Math.round(portfolioValue).toLocaleString()}`, sub: `${portfolioDB.summary.length} posiciones`, c: T.blue, grad: `linear-gradient(135deg, ${T.blue}12, transparent)` },
      { l: "Dólar CCL", v: ccl ? `$${ccl.venta}` : "—", sub: "", c: T.cyan, grad: `linear-gradient(135deg, ${T.cyan}12, transparent)` },
      { l: "Top Pick", v: topPicks[0]?.cedear?.ticker || "—", sub: topPicks[0] ? `Score ${topPicks[0].scores.composite}` : "", c: T.yellow, grad: `linear-gradient(135deg, ${T.yellow}12, transparent)` },
      { l: "Perfil Activo", v: PROFILES[profile]?.label || "Moderado", sub: PROFILES[profile]?.desc, c: PROFILES[profile]?.color || T.yellow, grad: `linear-gradient(135deg, ${PROFILES[profile]?.color || T.yellow}12, transparent)` },
    ];
    return (
      <div style={{ animation: "fadeUp 0.4s ease" }}>
        <div className="ca-stat-grid" style={S.grid()}>
          {stats.map((st, i) => (
            <div key={i} style={{ ...S.card, borderLeft: `3px solid ${st.c}`, background: st.grad, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: `${st.c}06` }} />
              <div style={S.label}>{st.l}</div>
              <div className="ca-stat-value" style={{ ...S.value, color: st.c }}>{loading ? <Skeleton height={32} width="60%" /> : st.v}</div>
              {st.sub && <div style={{ fontSize: 11, color: T.textDim, marginTop: 6 }}>{st.sub}</div>}
            </div>
          ))}
        </div>

        {/* AI Section */}
        <div className="ca-ai-section" style={{ ...S.card, margin: "24px 0", background: `linear-gradient(135deg, rgba(15,23,42,0.7), rgba(10,26,46,0.7))`, border: `1px solid ${T.green}18`, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: `radial-gradient(circle, ${T.green}08, transparent 70%)`, pointerEvents: "none" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 14, position: "relative" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                <span style={{ background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginRight: 10 }}>◆</span>
                Asesor IA — Claude
              </h3>
              <div style={{ fontSize: 12, color: T.textDim, marginTop: 6 }}>Datos reales + noticias + historial de aciertos/errores</div>
            </div>
            <button className="ca-ai-btn" onClick={() => { setCapitalToInvest(""); setShowCapitalInput(true); }} disabled={aiLoading || loading} style={{ ...S.btn(), opacity: aiLoading || loading ? 0.5 : 1, minWidth: 220, fontSize: 13 }}>
              {aiLoading ? <span style={{ animation: "pulse 1s infinite" }}>⟳ Analizando mercado...</span> : `Análisis — ${new Date().toLocaleString("es-AR", { month: "long" })}`}
            </button>
          </div>
          {showCapitalInput && !aiLoading && (
            <div style={{ background: "rgba(3,7,17,0.5)", borderRadius: 14, padding: 22, marginBottom: 18, border: `1px solid ${T.green}30` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 10 }}>¿Cuánto capital tenés disponible para invertir hoy?</div>
              <div style={{ fontSize: 12, color: T.textDim, marginBottom: 14, lineHeight: 1.6 }}>Ingresá el monto en pesos argentinos que tenés libre para nuevas compras. Si no tenés capital nuevo, poné 0 y el asesor solo te va a recomendar rebalanceos.</div>
              <div style={{ fontSize: 11, color: T.yellow, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>🪙 Este análisis consume tokens de Claude. Tiene un cooldown de 1 hora para evitar gasto innecesario.</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                  <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.textDim, fontWeight: 700, fontSize: 16 }}>$</span>
                  <input type="number" value={capitalToInvest} onChange={e => setCapitalToInvest(e.target.value)} placeholder="Ej: 1000000" style={{ ...S.input, paddingLeft: 32, fontSize: 18, fontFamily: T.fontMono, fontWeight: 700 }} autoFocus onKeyDown={e => { if (e.key === "Enter" && capitalToInvest !== "") runAI(parseFloat(capitalToInvest) || 0); }} />
                </div>
                <button onClick={() => runAI(parseFloat(capitalToInvest) || 0)} disabled={capitalToInvest === ""} style={{ ...S.btn(), opacity: capitalToInvest === "" ? 0.4 : 1, minWidth: 140 }}>Iniciar Análisis</button>
                <button onClick={() => setShowCapitalInput(false)} style={S.btn("ghost")}>Cancelar</button>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {[0, 100000, 500000, 1000000, 2000000, 5000000].map(amt => (
                  <button key={amt} onClick={() => setCapitalToInvest(String(amt))} style={{ ...S.btn("ghost"), fontSize: 11, padding: "7px 14px", borderColor: capitalToInvest === String(amt) ? T.green : T.border, color: capitalToInvest === String(amt) ? T.green : T.textDim }}>${amt.toLocaleString()}</button>
                ))}
              </div>
            </div>
          )}
          <div style={{ fontSize: 10, color: T.textDark, marginBottom: 14, position: "relative" }}>El análisis completo tiene un cooldown de 1 hora para evitar gasto innecesario de tokens.</div>
          {cooldownInfo && !aiAnalysis && (
            <div style={{ background: `${T.blue}08`, borderRadius: 14, padding: 20, border: `1px solid ${T.blue}25`, display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
              <span style={{ fontSize: 24 }}>⏱</span>
              <div>
                <div style={{ fontWeight: 700, color: T.blue, marginBottom: 6 }}>Análisis en cooldown</div>
                <div style={{ fontSize: 13, color: T.textMuted }}>{cooldownInfo.message}</div>
              </div>
            </div>
          )}
          {renderAIResponse(aiAnalysis)}
        </div>

        {/* TOP PICKS */}
        <div style={{ ...S.label, fontSize: 13, marginBottom: 4, color: T.textMuted }}>TOP PICKS</div>
        {loading ? <Skeleton height={200} /> : (
          <div className="ca-picks-grid" style={{ ...S.grid(240), marginTop: 12 }}>
            {topPicks.map((item, idx) => {
              const c = item.cedear, s = item.scores, perf = item.technical?.indicators?.performance;
              return (
                <div key={c.ticker} onClick={() => { loadDetail(c.ticker); setView("detail"); }} style={{ ...S.card, cursor: "pointer", padding: 20, position: "relative", overflow: "hidden", background: `linear-gradient(160deg, rgba(15,23,42,0.6), rgba(15,23,42,0.3))` }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${signalColors[s.signal] || T.green}40`; e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = `0 8px 30px ${(signalColors[s.signal] || T.green)}15`; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
                  <div style={{ position: "absolute", top: -30, right: -30, width: 100, height: 100, borderRadius: "50%", background: `${signalColors[s.signal] || T.green}06` }} />
                  <div style={{ position: "absolute", top: 14, right: 14, zIndex: 1 }}><span style={S.badge(signalColors[s.signal] || T.yellow)}>{s.signal}</span></div>
                  <div style={{ fontSize: 11, color: T.textDark, fontWeight: 600, marginBottom: 2 }}>#{idx + 1}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, ...S.mono, letterSpacing: "-0.5px" }}>{c.ticker}</div>
                  <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>{c.name}</div>
                  <div style={{ fontSize: 9, color: T.textDark, marginTop: 1 }}>{c.sector}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", margin: "16px 0 14px" }}>
                    <div>
                      <div style={{ fontSize: 36, fontWeight: 900, ...S.mono, letterSpacing: "-2px", lineHeight: 1, color: s.composite >= 62 ? T.green : s.composite >= 45 ? T.yellow : T.red }}>{s.composite}</div>
                      <div style={{ fontSize: 9, color: T.textDark, letterSpacing: "1.5px", marginTop: 4 }}>SCORE</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {item.priceARS && <div style={{ fontSize: 14, fontWeight: 700, ...S.mono }}>${item.priceARS.toLocaleString()} <span style={{ fontSize: 9, color: T.textDim }}>ARS</span></div>}
                      {perf?.month1 != null && <div style={{ fontSize: 12, color: perf.month1 >= 0 ? T.green : T.red, ...S.mono, marginTop: 2 }}>{perf.month1 >= 0 ? "+" : ""}{perf.month1}%</div>}
                    </div>
                  </div>
                  <ScoreBar value={s.techScore} label="TEC" color={T.blue} h={4} />
                  <ScoreBar value={s.fundScore} label={item.fundamentals?._source === "quote_fallback" ? "FUN~" : "FUN"} color={item.fundamentals?._source === "quote_fallback" ? T.yellow : T.purple} h={4} />
                </div>
              );
            })}
          </div>
        )}
        {/* PATRIMONIO HISTORY CHART */}
        {capitalHistory.length > 2 && (
          <div style={{ ...S.card, marginTop: 24 }}>
            <div style={{ ...S.label, color: T.cyan, marginBottom: 14 }}>EVOLUCIÓN DEL PATRIMONIO</div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={[...capitalHistory].reverse().map(c => ({
                date: c.date,
                total: Math.round(c.total_value_ars / 1000),
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: T.textDark }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: T.textDark }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}K`} />
                <Tooltip contentStyle={{ background: T.bgCardSolid, border: `1px solid ${T.borderLight}`, borderRadius: 10, fontSize: 12 }} formatter={v => [`$${(v * 1000).toLocaleString()} ARS`, "Patrimonio"]} />
                <Area type="monotone" dataKey="total" stroke={T.cyan} fill={`${T.cyan}12`} strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    );
  };

  /* ─── RANKING ─── */
  const renderRanking = () => (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      <div className="ca-sector-filter" style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: T.textDark, fontWeight: 700, letterSpacing: "1.5px", marginRight: 6, lineHeight: "32px" }}>SECTOR</span>
        {sectors.map(sec => (
          <button key={sec} onClick={() => setFilterSector(sec)} style={{
            padding: "7px 16px", borderRadius: 20, cursor: "pointer", fontFamily: T.font, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", transition: "all 0.2s ease",
            border: `1px solid ${filterSector === sec ? T.green : T.border}`,
            background: filterSector === sec ? `${T.green}12` : "transparent",
            color: filterSector === sec ? T.green : T.textDim,
            boxShadow: filterSector === sec ? `0 0 12px ${T.green}15` : "none",
          }}>{sec}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontSize: 10, color: T.textDark, fontWeight: 700, letterSpacing: "1.5px", marginRight: 6 }}>ORDENAR</span>
        {[{ id: "composite", l: "Score" }, { id: "technical", l: "Técnico" }, { id: "fundamental", l: "Fund." }, { id: "change", l: "1M" }].map(s => (
          <button key={s.id} onClick={() => setSortBy(s.id)} style={{
            padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontFamily: T.font, fontSize: 10, fontWeight: 600, transition: "all 0.2s ease",
            border: `1px solid ${sortBy === s.id ? T.blue : T.border}`,
            background: sortBy === s.id ? `${T.blue}12` : "transparent",
            color: sortBy === s.id ? T.blue : T.textDim,
          }}>{s.l}{sortBy === s.id ? " ▼" : ""}</button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {rankingUpdatedAt && (
            <span style={{ fontSize: 10, color: T.textDark, fontFamily: T.fontMono }}>
              Act. {new Date(rankingUpdatedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
              {rankingCountdown > 0 && <span style={{ color: rankingCountdown < 60 ? T.yellow : T.textDark }}> • {Math.floor(rankingCountdown / 60)}:{String(rankingCountdown % 60).padStart(2, "0")}</span>}
            </span>
          )}
          <button onClick={() => loadRanking()} disabled={loading} style={{ padding: "5px 12px", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer", fontFamily: T.font, fontSize: 10, fontWeight: 600, border: `1px solid ${T.border}`, background: "transparent", color: loading ? T.textDark : T.textDim, opacity: loading ? 0.5 : 1, transition: "all 0.2s" }}>↺ Actualizar</button>
          <span style={{ fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>{filtered.length} <span style={{ fontFamily: T.font }}>CEDEARs</span></span>
        </div>
      </div>
      {loading ? <div style={S.card}>{[1,2,3].map(i => <div key={i} style={{ marginBottom: 12 }}><Skeleton height={48} /></div>)}</div> : (
        <div className="ca-table-wrap" style={{ ...S.card, padding: 0, overflow: "auto", borderRadius: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={{ ...S.th, textAlign: "left" }}>#</th>
              <th style={{ ...S.th, textAlign: "left" }}>CEDEAR</th>
              <th style={{ ...S.th, textAlign: "center" }}>Score</th>
              <th style={{ ...S.th, textAlign: "center" }}>Señal</th>
              <th style={{ ...S.th, textAlign: "center" }}>ARS</th>
              <th className="ca-hide-mobile" style={{ ...S.th, textAlign: "center" }}>TEC</th>
              <th className="ca-hide-mobile" style={{ ...S.th, textAlign: "center" }}>FUN</th>
              <th className="ca-hide-mobile" style={{ ...S.th, textAlign: "center" }}>RSI</th>
              <th style={{ ...S.th, textAlign: "center" }}>1M</th>
              <th className="ca-hide-mobile" style={{ ...S.th, textAlign: "center" }}>3M</th>
              <th className="ca-hide-mobile" style={{ ...S.th, textAlign: "center" }}>Horizonte</th>
              <th className="ca-hide-mobile" style={S.th}></th>
            </tr></thead>
            <tbody>{filtered.map((item, idx) => {
              const c = item.cedear, s = item.scores, perf = item.technical?.indicators?.performance || {};
              return (
                <tr key={c.ticker} onClick={() => { loadDetail(c.ticker); setView("detail"); }} style={{ cursor: "pointer", transition: "background 0.2s" }}
                  onMouseEnter={e => e.currentTarget.style.background = `${T.green}06`} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ ...S.td, ...S.mono, color: T.textDark, fontSize: 11 }}>{idx + 1}</td>
                  <td style={S.td}><div style={{ fontWeight: 800, fontSize: 14, ...S.mono }}>{c.ticker}</div><div style={{ fontSize: 10, color: T.textDim }}>{c.name}</div></td>
                  <td style={{ ...S.td, textAlign: "center" }}><span style={{ fontSize: 20, fontWeight: 900, ...S.mono, color: s.composite >= 62 ? T.green : s.composite >= 45 ? T.yellow : T.red }}>{s.composite}</span></td>
                  <td style={{ ...S.td, textAlign: "center" }}><span style={S.badge(signalColors[s.signal] || T.yellow)}>{s.signal}</span></td>
                  <td style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 12 }}>{item.priceARS ? `$${item.priceARS.toLocaleString()}` : "—"}</td>
                  <td className="ca-hide-mobile" style={{ ...S.td, textAlign: "center", color: T.blue, ...S.mono }}>{s.techScore}</td>
                  <td className="ca-hide-mobile" style={{ ...S.td, textAlign: "center", color: T.purple, ...S.mono }}>{s.fundScore}</td>
                  <td className="ca-hide-mobile" style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 12 }}>{item.technical?.indicators?.rsi || "—"}</td>
                  <td style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 12, color: (perf.month1 || 0) >= 0 ? T.green : T.red }}>{perf.month1 != null ? `${perf.month1 >= 0 ? "+" : ""}${perf.month1}%` : "—"}</td>
                  <td className="ca-hide-mobile" style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 12, color: (perf.month3 || 0) >= 0 ? T.green : T.red }}>{perf.month3 != null ? `${perf.month3 >= 0 ? "+" : ""}${perf.month3}%` : "—"}</td>
                  <td className="ca-hide-mobile" style={{ ...S.td, textAlign: "center", fontSize: 10, color: T.textDim }}>{s.horizon}</td>
                  <td className="ca-hide-mobile" style={S.td}><button onClick={e => { e.stopPropagation(); setOpForm({ ticker: c.ticker, shares: 10, priceArs: item.priceARS || 0, notes: "" }); setShowBuyModal(true); }} style={{ ...S.btn("ghost"), padding: "6px 12px", fontSize: 10 }}>Comprar</button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );

  /* ─── DETAIL ─── */
  const renderDetail = () => {
    if (detailLoading) return <div style={S.card}><Skeleton height={300} /></div>;
    if (!detail) return <StatusMsg type="error">No se pudo cargar.</StatusMsg>;
    const { cedear: c, quote, history, technical: tech, fundamentals: fund, scores: s, priceARS } = detail;
    const perf = tech?.indicators?.performance || {};
    const chartData = (history || []).slice(-90).map(p => ({ date: p.date.slice(5), precio: p.close }));
    return (
      <div style={{ animation: "fadeUp 0.4s ease" }}>
        <button onClick={() => nav("ranking")} style={{ ...S.btn("ghost"), marginBottom: 20, fontSize: 12 }}>← Volver al Ranking</button>

        {/* Hero */}
        <div className="ca-hero-detail" style={{ ...S.card, background: `linear-gradient(135deg, rgba(15,23,42,0.7), rgba(10,26,46,0.7))`, padding: 28, marginBottom: 20, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: `${signalColors[s.signal] || T.yellow}08` }} />
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", position: "relative" }}>
            <div style={{ width: 60, height: 60, background: `${signalColors[s.signal] || T.yellow}15`, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: signalColors[s.signal], ...S.mono, border: `1px solid ${signalColors[s.signal] || T.yellow}25` }}>{c.ticker.slice(0, 2)}</div>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, ...S.mono }}>{c.ticker} <span style={{ color: T.textDim, fontWeight: 400, fontSize: 16, fontFamily: T.font }}>{c.name}</span></h2>
              <div style={{ fontSize: 12, color: T.textDim, marginTop: 4 }}>{c.sector} · Ratio {c.ratio}:1 · Beta {quote?.beta?.toFixed(2) || "N/A"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="ca-hero-price" style={{ fontSize: 30, fontWeight: 900, ...S.mono }}>US${quote?.price?.toFixed(2) || "—"}</div>
              {priceARS && <div style={{ fontSize: 15, color: T.cyan, ...S.mono, marginTop: 4 }}>ARS ${priceARS.toLocaleString()}</div>}
              <span style={{ ...S.badge(signalColors[s.signal] || T.yellow), marginTop: 6, display: "inline-flex" }}>{s.signal}</span>
            </div>
          </div>
        </div>

        <div className="ca-detail-grid" style={S.grid()}>
          <div style={S.card}>
            <div style={S.label}>Score Compuesto</div>
            <div style={{ fontSize: 52, fontWeight: 900, ...S.mono, letterSpacing: "-3px", color: s.composite >= 62 ? T.green : s.composite >= 45 ? T.yellow : T.red, lineHeight: 1 }}>{s.composite}<span style={{ fontSize: 16, color: T.textDark }}>/100</span></div>
            <div style={{ marginTop: 20 }}>
              <ScoreBar value={s.techScore} label="Técnico (35%)" color={T.blue} />
              <ScoreBar value={s.fundScore} label="Fundamental (40%)" color={T.purple} />
              <ScoreBar value={s.sentScore} label="Sentimiento (25%)" color={T.yellow} />
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: T.textDim }}>Horizonte: <strong style={{ color: T.text }}>{s.horizon}</strong></div>
          </div>
          <div style={S.card}>
            <div style={S.label}>Técnicos</div>
            {[{ l: "RSI", v: tech?.indicators?.rsi }, { l: "MACD", v: tech?.indicators?.macd?.macd }, { l: "SMA 20", v: tech?.indicators?.sma20?.toFixed(2) }, { l: "SMA 50", v: tech?.indicators?.sma50?.toFixed(2) }, { l: "ATR", v: tech?.indicators?.atr }].map((it, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                <span style={{ color: T.textDim }}>{it.l}</span><span style={S.mono}>{it.v ?? "—"}</span>
              </div>
            ))}
          </div>
          <div style={S.card}>
            <div style={S.label}>Fundamentales</div>
            {[{ l: "P/E", v: fund?.data?.pe?.toFixed(1) }, { l: "PEG", v: fund?.data?.pegRatio?.toFixed(2) }, { l: "EPS Growth", v: fund?.data?.epsGrowth != null ? `${fund.data.epsGrowth.toFixed(1)}%` : null, g: (fund?.data?.epsGrowth || 0) > 0 }, { l: "Div Yield", v: fund?.data?.divYield ? `${fund.data.divYield.toFixed(2)}%` : "0%" }, { l: "Target USD", v: fund?.data?.analystTarget ? `$${fund.data.analystTarget.toFixed(2)}` : null }, { l: "Consenso", v: fund?.data?.recommendationKey }].map((it, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                <span style={{ color: T.textDim }}>{it.l}</span><span style={{ ...S.mono, color: it.g !== undefined ? (it.g ? T.green : T.red) : T.text }}>{it.v ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ca-perf-grid" style={{ ...S.grid(120), margin: "20px 0" }}>
          {[{ l: "1D", v: perf.day1 }, { l: "1S", v: perf.week1 }, { l: "1M", v: perf.month1 }, { l: "3M", v: perf.month3 }, { l: "6M", v: perf.month6 }].map((p, i) => (
            <div key={i} style={{ ...S.card, textAlign: "center", padding: 16 }}>
              <div style={{ fontSize: 10, color: T.textDark, letterSpacing: "1.5px", marginBottom: 8 }}>{p.l}</div>
              <div style={{ fontSize: 20, fontWeight: 800, ...S.mono, color: p.v != null ? (p.v >= 0 ? T.green : T.red) : T.textDark }}>{p.v != null ? `${p.v >= 0 ? "+" : ""}${p.v}%` : "—"}</div>
            </div>
          ))}
        </div>

        {(() => {
          const histSource = detailHistory || history || [];
          const displayData = histSource.map(p => ({ date: p.date.slice(5), precio: p.close }));
          const chartRanges = [{ id: 3, l: "3M" }, { id: 6, l: "6M" }, { id: 9, l: "9M" }, { id: 12, l: "1A" }];
          return displayData.length > 0 && (
            <div style={{ ...S.card, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                <div style={S.label}>Precio Histórico (USD)</div>
                <div style={{ display: "flex", gap: 3, background: "rgba(15,23,42,0.5)", borderRadius: 10, padding: 3, border: `1px solid ${T.border}` }}>
                  {chartRanges.map(r => (
                    <button key={r.id} onClick={() => { setChartMonths(r.id); loadDetailHistory(`${c.ticker}.BA`, r.id); }} style={{
                      padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, transition: "all 0.2s",
                      background: chartMonths === r.id ? T.green : "transparent",
                      color: chartMonths === r.id ? T.bg : T.textDim,
                    }}>{r.l}</button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={displayData}>
                  <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.green} stopOpacity={0.2} /><stop offset="100%" stopColor={T.green} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: T.textDark }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: T.textDark }} tickLine={false} axisLine={false} domain={["dataMin", "dataMax"]} />
                  <Tooltip contentStyle={{ background: T.bgCardSolid, border: `1px solid ${T.borderLight}`, borderRadius: 10, fontSize: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }} />
                  <Area type="monotone" dataKey="precio" stroke={T.green} fill="url(#pg)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          );
        })()}

        {tech?.signals?.length > 0 && (
          <div style={{ ...S.card, marginBottom: 20 }}>
            <div style={S.label}>Señales Técnicas</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {tech.signals.map((sig, i) => <span key={i} style={S.badge(sig.type === "bullish" ? T.green : sig.type === "bearish" ? T.red : T.yellow)}>{sig.type === "bullish" ? "▲" : "▼"} {sig.text}</span>)}
            </div>
          </div>
        )}

        <div style={{ ...S.card, marginBottom: 20, border: `1px solid ${T.green}15` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={S.label}>Análisis IA Completo</div>
              <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>Claude analiza noticias recientes, técnicos y contexto macro para este CEDEAR puntual</div>
            </div>
            <button onClick={() => setConfirmState({ icon: "🤖", title: `Analizar ${c.ticker} con IA`, description: `Claude va a buscar noticias recientes sobre ${c.ticker}, analizar los indicadores técnicos actuales y el contexto del sector para darte una recomendación detallada con precio objetivo, soporte y resistencia.`, tokenWarning: "Análisis individual con Claude. Menor costo que el análisis de portfolio completo.", confirmLabel: "Analizar con IA", variant: "primary", onConfirm: () => runAISingle(c.ticker) })} disabled={aiSingleLoading} style={{ ...S.btn(), fontSize: 12, padding: "9px 18px", opacity: aiSingleLoading ? 0.5 : 1 }}>{aiSingleLoading ? <span style={{ animation: "pulse 1s infinite" }}>⟳ Analizando con IA...</span> : "🤖 Analizar con IA"}</button>
          </div>
          {aiSingle && !aiSingle.error ? (
            <div style={{ fontSize: 13 }}>
              {/* Header with verdict, confidence, prices */}
              <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                <span style={S.badge(signalColors[aiSingle.veredicto] || T.yellow)}>{aiSingle.veredicto}</span>
                <span style={{ fontSize: 12, color: T.textDim }}>Confianza: <strong>{aiSingle.confianza}%</strong></span>
                {aiSingle.precio_objetivo_usd && <span style={{ fontSize: 12, color: T.cyan, fontWeight: 700 }}>Target: US${aiSingle.precio_objetivo_usd}</span>}
                {aiSingle.soporte_usd && <span style={{ fontSize: 11, color: T.green }}>Soporte: US${aiSingle.soporte_usd}</span>}
                {aiSingle.resistencia_usd && <span style={{ fontSize: 11, color: T.red }}>Resistencia: US${aiSingle.resistencia_usd}</span>}
                {aiSingle.horizonte && <span style={S.badge(T.blue)}>{aiSingle.horizonte}</span>}
              </div>

              {/* Main analysis */}
              <p style={{ color: T.textMuted, margin: "0 0 16px", lineHeight: 1.8, fontSize: 13 }}>{aiSingle.analisis}</p>

              {/* Detailed recommendation */}
              {aiSingle.recomendacion_detallada && (
                <div style={{ background: `${T.green}08`, borderRadius: 12, padding: 16, marginBottom: 14, border: `1px solid ${T.green}20`, borderLeft: `3px solid ${T.green}` }}>
                  <div style={{ fontSize: 10, color: T.green, fontWeight: 700, letterSpacing: "1.5px", marginBottom: 8 }}>RECOMENDACIÓN DETALLADA</div>
                  <p style={{ color: T.textMuted, fontSize: 12, margin: 0, lineHeight: 1.7 }}>{aiSingle.recomendacion_detallada}</p>
                </div>
              )}

              {/* Catalysts & Risks side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                {aiSingle.catalizadores?.length > 0 && (
                  <div style={{ background: "rgba(3,7,17,0.4)", borderRadius: 12, padding: 14, border: `1px solid ${T.green}20`, borderLeft: `3px solid ${T.green}` }}>
                    <div style={{ fontSize: 10, color: T.green, fontWeight: 700, letterSpacing: "1.5px", marginBottom: 8 }}>CATALIZADORES</div>
                    {aiSingle.catalizadores.map((cat, i) => <div key={i} style={{ fontSize: 12, color: T.textMuted, padding: "4px 0 4px 12px", borderLeft: `2px solid ${T.green}30`, marginBottom: 4, lineHeight: 1.5 }}>▲ {cat}</div>)}
                  </div>
                )}
                {aiSingle.riesgos?.length > 0 && (
                  <div style={{ background: "rgba(3,7,17,0.4)", borderRadius: 12, padding: 14, border: `1px solid ${T.red}20`, borderLeft: `3px solid ${T.red}` }}>
                    <div style={{ fontSize: 10, color: T.red, fontWeight: 700, letterSpacing: "1.5px", marginBottom: 8 }}>RIESGOS</div>
                    {aiSingle.riesgos.map((r, i) => <div key={i} style={{ fontSize: 12, color: T.textMuted, padding: "4px 0 4px 12px", borderLeft: `2px solid ${T.red}30`, marginBottom: 4, lineHeight: 1.5 }}>⚠ {r}</div>)}
                  </div>
                )}
              </div>

              {/* Sector comparison */}
              {aiSingle.comparacion_sector && (
                <div style={{ background: `${T.purple}08`, borderRadius: 12, padding: 14, marginBottom: 14, border: `1px solid ${T.purple}20`, borderLeft: `3px solid ${T.purple}` }}>
                  <div style={{ fontSize: 10, color: T.purple, fontWeight: 700, letterSpacing: "1.5px", marginBottom: 8 }}>COMPARACIÓN CON SECTOR</div>
                  <p style={{ color: T.textMuted, fontSize: 12, margin: 0, lineHeight: 1.6 }}>{aiSingle.comparacion_sector}</p>
                </div>
              )}

              {/* News */}
              {aiSingle.noticias_relevantes && (
                <div style={{ background: "rgba(3,7,17,0.4)", borderRadius: 12, padding: 16, border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.cyan}` }}>
                  <div style={{ fontSize: 10, color: T.cyan, fontWeight: 700, letterSpacing: "1.5px", marginBottom: 8 }}>NOTICIAS RELEVANTES</div>
                  <p style={{ color: T.textMuted, fontSize: 12, margin: 0, lineHeight: 1.7 }}>{aiSingle.noticias_relevantes}</p>
                </div>
              )}
            </div>
          ) : aiSingle?.error ? <div style={{ color: T.red, fontSize: 12 }}>{aiSingle.error}</div> : <div style={{ color: T.textDim, fontSize: 12, lineHeight: 1.6 }}>Presioná para un análisis completo con IA: indicadores técnicos, fundamentales, noticias en vivo, riesgos, catalizadores y recomendación detallada.</div>}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button onClick={() => { setOpForm({ ticker: c.ticker, shares: 10, priceArs: priceARS || 0, notes: "" }); setShowBuyModal(true); }} style={S.btn()}>Registrar Compra</button>
          <button onClick={() => { setOpForm({ ticker: c.ticker, shares: 10, priceArs: priceARS || 0, notes: "" }); setShowSellModal(true); }} style={S.btn("danger")}>Registrar Venta</button>
        </div>
      </div>
    );
  };

  /* ─── OPERACIONES ─── */
  const renderOperaciones = () => {
    const COLORS = [T.green, T.blue, T.purple, T.yellow, T.orange, T.red, T.greenLight, T.pink, T.cyan, "#f43f5e", "#a3e635", "#fb923c"];
    const SECTOR_COLORS = { Technology: T.blue, Healthcare: T.green, "Consumer Cyclical": T.yellow, "Consumer Defensive": T.orange, Financial: T.purple, Energy: T.red, Materials: "#a3e635", "Communication Services": T.pink, Industrials: T.cyan, ETF: T.greenLight };
    const pieData = portfolioDB.summary.map(p => { const r = ranking.find(x => x.cedear?.ticker === p.ticker); return { name: p.ticker, value: r?.priceARS ? r.priceARS * p.total_shares : p.weighted_avg_price * p.total_shares }; });
    const sectorMap = {};
    portfolioDB.summary.forEach(p => { const r = ranking.find(x => x.cedear?.ticker === p.ticker); const val = r?.priceARS ? r.priceARS * p.total_shares : p.weighted_avg_price * p.total_shares; const sec = r?.cedear?.sector || "Otro"; sectorMap[sec] = (sectorMap[sec] || 0) + val; });
    const sectorData = Object.entries(sectorMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    return (
      <div style={{ animation: "fadeUp 0.4s ease" }}>
        {opMsg && <StatusMsg type={opMsg.type}>{opMsg.text}</StatusMsg>}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <button onClick={() => { setOpForm({ ticker: "", shares: 10, priceArs: 0, notes: "" }); setShowBuyModal(true); }} style={S.btn()}>+ Registrar Compra</button>
          <button onClick={() => { setOpForm({ ticker: "", shares: 10, priceArs: 0, notes: "" }); setShowSellModal(true); }} style={S.btn("danger")}>- Registrar Venta</button>
          <button onClick={openSyncModal} style={S.btn("blue")}>⟳ Sincronizar Cartera</button>
        </div>
        <div className="ca-ops-summary" style={S.grid()}>
          <div style={{ ...S.card, borderLeft: `3px solid ${T.cyan}` }}><div style={S.label}>Capital</div><input type="number" value={capital} onChange={e => setCapital(parseInt(e.target.value) || 0)} style={{ ...S.input, ...S.value, fontSize: 22, padding: "8px 12px" }} /></div>
          <div style={{ ...S.card, borderLeft: `3px solid ${T.purple}`, background: `linear-gradient(135deg, ${T.purple}08, transparent)` }}><div style={S.label}>Total Patrimonio</div><div style={{ ...S.value, color: T.purple }}>${Math.round(portfolioValue + capital).toLocaleString()}</div></div>
        </div>

        {portfolioDB.summary.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={S.label}>Posiciones Actuales</div>
            <div className="ca-table-wrap" style={{ ...S.card, padding: 0, overflow: "auto", marginTop: 12, borderRadius: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={{ ...S.th, textAlign: "left" }}>CEDEAR</th>
                  <th style={{ ...S.th, textAlign: "center" }}>Cant.</th>
                  <th className="ca-hide-mobile" style={{ ...S.th, textAlign: "center" }}>Precio Prom.</th>
                  <th style={{ ...S.th, textAlign: "center" }}>Valor</th>
                  <th style={{ ...S.th, textAlign: "center" }}>P&L</th>
                  <th className="ca-hide-mobile" style={{ ...S.th, textAlign: "center" }}>Señal</th>
                </tr></thead>
                <tbody>{portfolioDB.summary.map(p => {
                  const r = ranking.find(x => x.cedear?.ticker === p.ticker);
                  const curr = r?.priceARS || p.weighted_avg_price;
                  const val = curr * p.total_shares;
                  const inv = p.weighted_avg_price * p.total_shares;
                  const pnl = val - inv;
                  return (
                    <tr key={p.ticker} style={{ cursor: "pointer", transition: "background 0.2s" }} onClick={() => { loadDetail(p.ticker); setView("detail"); }}
                      onMouseEnter={e => e.currentTarget.style.background = `${T.green}06`} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={S.td}><span style={{ fontWeight: 800, ...S.mono }}>{p.ticker}</span><div style={{ fontSize: 10, color: T.textDim }}>Desde {p.first_bought}</div></td>
                      <td style={{ ...S.td, textAlign: "center", ...S.mono }}>{p.total_shares}</td>
                      <td className="ca-hide-mobile" style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 12 }}>${Math.round(p.weighted_avg_price).toLocaleString()}</td>
                      <td style={{ ...S.td, textAlign: "center", ...S.mono, fontWeight: 700 }}>${Math.round(val).toLocaleString()}</td>
                      <td style={{ ...S.td, textAlign: "center" }}>
                        <div style={{ ...S.mono, color: pnl >= 0 ? T.green : T.red, fontWeight: 700 }}>{pnl >= 0 ? "+" : ""}${Math.round(pnl).toLocaleString()}</div>
                        <div style={{ fontSize: 10, color: pnl >= 0 ? T.green : T.red }}>({inv > 0 ? ((pnl / inv) * 100).toFixed(1) : 0}%)</div>
                      </td>
                      <td className="ca-hide-mobile" style={{ ...S.td, textAlign: "center" }}>{r && <span style={S.badge(signalColors[r.scores.signal] || T.yellow)}>{r.scores.signal}</span>}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* PIE CHARTS — fixed: no fill override on Pie, custom PieLabel renders <text> with explicit fill */}
        {pieData.length > 1 && (
          <div className="ca-pie-wrap" style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 24 }}>
            <div style={{ ...S.card, flex: 1, minWidth: 340 }}>
              <div style={{ ...S.label, textAlign: "center", marginBottom: 10 }}>Distribución por CEDEAR</div>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" paddingAngle={2} label={PieLabel} labelLine={{ stroke: T.textDark, strokeWidth: 1 }}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="rgba(3,7,17,0.6)" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: T.bgCardSolid, border: `1px solid ${T.borderLight}`, borderRadius: 10, fontSize: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }} formatter={v => `$${Math.round(v).toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {sectorData.length > 1 && (
              <div style={{ ...S.card, flex: 1, minWidth: 340 }}>
                <div style={{ ...S.label, textAlign: "center", marginBottom: 10 }}>Distribución por Sector</div>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={sectorData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" paddingAngle={2} label={PieLabel} labelLine={{ stroke: T.textDark, strokeWidth: 1 }}>
                      {sectorData.map((entry, i) => <Cell key={i} fill={SECTOR_COLORS[entry.name] || COLORS[i % COLORS.length]} stroke="rgba(3,7,17,0.6)" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: T.bgCardSolid, border: `1px solid ${T.borderLight}`, borderRadius: 10, fontSize: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }} formatter={v => `$${Math.round(v).toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {transactions.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={S.label}>Historial de Operaciones</div>
            <div className="ca-table-wrap" style={{ ...S.card, padding: 0, overflow: "auto", marginTop: 12, borderRadius: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={S.th}>Fecha</th>
                  <th style={S.th}>Tipo</th>
                  <th style={S.th}>CEDEAR</th>
                  <th style={S.th}>Cant.</th>
                  <th className="ca-hide-mobile" style={S.th}>Precio ARS</th>
                  <th style={S.th}>Total ARS</th>
                  <th className="ca-hide-mobile" style={S.th}>USD</th>
                  <th className="ca-hide-mobile" style={S.th}>CCL</th>
                  <th className="ca-hide-mobile" style={S.th}>Notas</th>
                </tr></thead>
                <tbody>{transactions.map((tx, i) => (
                  <tr key={i} style={{ transition: "background 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(148,163,184,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ ...S.td, ...S.mono, fontSize: 11 }}>{tx.date_executed}</td>
                    <td style={S.td}><span style={S.badge(tx.type === "BUY" ? T.green : T.red)}>{tx.type === "BUY" ? "COMPRA" : "VENTA"}</span></td>
                    <td style={{ ...S.td, fontWeight: 800, ...S.mono }}>{tx.ticker}</td>
                    <td style={{ ...S.td, ...S.mono, textAlign: "center" }}>{tx.shares}</td>
                    <td className="ca-hide-mobile" style={{ ...S.td, ...S.mono, textAlign: "right" }}>${Math.round(tx.price_ars).toLocaleString()}</td>
                    <td style={{ ...S.td, ...S.mono, textAlign: "right", fontWeight: 700 }}>${Math.round(tx.total_ars).toLocaleString()}</td>
                    <td className="ca-hide-mobile" style={{ ...S.td, fontSize: 11, textAlign: "center" }}>{tx.price_usd ? `$${tx.price_usd.toFixed(2)}` : "—"}</td>
                    <td className="ca-hide-mobile" style={{ ...S.td, fontSize: 11, textAlign: "center" }}>{tx.ccl_rate ? `$${tx.ccl_rate}` : "—"}</td>
                    <td className="ca-hide-mobile" style={{ ...S.td, fontSize: 11, color: T.textDim }}>{tx.notes || "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ─── PREDICCIONES ─── */
  const renderPredicciones = () => {
    const pending = predictions.filter(p => !p.evaluated);

    return (
      <div style={{ animation: "fadeUp 0.4s ease" }}>
        <InfoBanner icon="🤖" title="¿Cómo funciona este panel?">
          Cada vez que pedís un análisis IA desde el Dashboard, el bot genera <strong style={{ color: T.text }}>predicciones de compra/venta</strong> para los CEDEARs más interesantes y las guarda acá. Con el tiempo, el sistema <strong style={{ color: T.text }}>evalúa automáticamente</strong> si acertó comparando el precio de hoy contra el precio de entrada.<br />
          <span style={{ color: T.yellow }}>⚖️ Evaluar pendientes</span> — actualiza el resultado de predicciones abiertas. <span style={{ color: T.purple }}>📊 Post-Mortem</span> — análisis mensual con Claude: qué funcionó, qué falló, reglas a seguir. Ejecutarlo <em>una vez por mes</em> al cierre del período.
        </InfoBanner>
        <div className="ca-stat-grid" style={S.grid()}>
          {[
            { l: "Precisión", v: performance?.accuracy != null ? `${performance.accuracy}%` : "—", c: performance?.accuracy >= 60 ? T.green : performance?.accuracy >= 40 ? T.yellow : T.red, sub: `${performance?.correct || 0}/${performance?.total || 0} aciertos` },
            { l: "Retorno Real Prom.", v: performance?.avgActualReturn != null ? `${performance.avgActualReturn >= 0 ? "+" : ""}${performance.avgActualReturn}%` : "—", c: (performance?.avgActualReturn || 0) >= 0 ? T.green : T.red, sub: `vs ${performance?.avgTargetReturn || "—"}% predicho` },
            { l: "Mejor Pick", v: performance?.bestPick ? `${performance.bestPick.ticker} +${performance.bestPick.actual_change_pct}%` : "—", c: T.green, sub: "" },
            { l: "Pendientes", v: String(pending.length), c: T.yellow, sub: "" },
          ].map((st, i) => (
            <div key={i} style={{ ...S.card, borderLeft: `3px solid ${st.c}`, background: `linear-gradient(135deg, ${st.c}08, transparent)` }}>
              <div style={S.label}>{st.l}</div>
              <div style={{ ...S.value, color: st.c, fontSize: 24 }}>{st.v}</div>
              {st.sub && <div style={{ fontSize: 11, color: T.textDim, marginTop: 6 }}>{st.sub}</div>}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={confirmEvaluateAll} disabled={evalLoading || pending.length === 0} style={{ ...S.btn("blue"), opacity: evalLoading || pending.length === 0 ? 0.5 : 1 }} title="Compara el precio actual de cada predicción pendiente contra el precio de entrada para calcular si acertó o falló. No consume tokens.">{evalLoading ? "Evaluando..." : `Evaluar ${pending.length} Pendientes`}</button>
          <button onClick={confirmPostMortem} disabled={pmLoading} style={{ ...S.btn("purple"), opacity: pmLoading ? 0.5 : 1 }} title="Genera un análisis mensual con Claude sobre qué funcionó, qué falló y qué reglas aplicar en el futuro. Usar una vez por mes al cierre.">{pmLoading ? "⏳ Generando post-mortem..." : "📊 Post-Mortem Mensual"}</button>
          {pmHistory.some(pm => pm.month_label?.includes("Histórico")) ? (
            <span style={{ fontSize: 11, color: T.green, display: "flex", alignItems: "center", gap: 6 }}>✔ Experiencia histórica cargada automáticamente</span>
          ) : (
            <button onClick={handleSeedHistorical} disabled={seedLoading} style={{ ...S.btn("green"), opacity: seedLoading ? 0.5 : 1, fontSize: 11 }} title="Se ejecuta automáticamente al iniciar el servidor. Solo usarlo si faltó cargar.">{seedLoading ? "⏳ Cargando..." : "📚 Cargar Experiencia Histórica"}</button>
          )}
          {evalResult && !evalResult.error && <span style={{ fontSize: 12, color: T.green }}>✔ {evalResult.totalEvaluated} predicciones evaluadas</span>}
        </div>
        {performance?.byAction?.length > 0 && (
          <div style={{ ...S.card, marginTop: 24 }}>
            <div style={S.label}>Performance por Acción</div>
            <div style={{ ...S.grid(160), marginTop: 14 }}>
              {performance.byAction.map((a, i) => (
                <div key={i} style={{ background: "rgba(3,7,17,0.4)", borderRadius: 12, padding: 16, border: `1px solid ${T.border}`, textAlign: "center" }}>
                  <span style={S.badge(signalColors[a.action] || T.yellow)}>{a.action}</span>
                  <div style={{ marginTop: 12, ...S.mono, fontSize: 20, fontWeight: 800, color: a.total > 0 && a.correct / a.total >= 0.5 ? T.green : T.red }}>{a.total > 0 ? Math.round((a.correct / a.total) * 100) : 0}%</div>
                  <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>{a.correct}/{a.total}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Individual prediction cards — one per prediction, newest first */}
        {predictions.length > 0 ? (
          <div style={{ marginTop: 28 }}>
            <div style={{ ...S.label, color: T.textMuted, marginBottom: 14 }}>{predictions.length} Predicciones</div>
            {[...predictions].sort((a, b) => b.prediction_date?.localeCompare(a.prediction_date)).map((p, i) => {
              const changeColor = p.actual_change_pct != null ? (p.actual_change_pct >= 0 ? T.green : T.red) : T.textDark;
              const actionColor = signalColors[p.action] || T.yellow;
              return (
                <div key={p.id || i} style={{ ...S.card, marginBottom: 12, borderLeft: `3px solid ${actionColor}`, padding: "18px 22px" }}>
                  {/* Header row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: p.reasoning ? 12 : 0 }}>
                    {/* Action + Ticker */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 160 }}>
                      <span style={S.badge(actionColor)}>{p.action === "COMPRAR" ? "▲" : p.action === "VENDER" ? "▼" : "◆"} {p.action}</span>
                      <div>
                        <div style={{ fontWeight: 800, ...S.mono, fontSize: 16 }}>{p.ticker}</div>
                        <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>
                          {p.prediction_date?.slice(0, 16).replace("T", " ")}
                        </div>
                      </div>
                    </div>

                    {/* Scores & confidence */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {p.confidence && <span style={{ ...S.badge(T.cyan), fontSize: 11 }}>Conf. {p.confidence}%</span>}
                      {p.score_composite && <span style={{ ...S.badge(T.textDim), fontSize: 11 }}>Score {p.score_composite}</span>}
                      {p.horizon && <span style={{ ...S.badge(T.purple), fontSize: 11 }}>{p.horizon}</span>}
                    </div>

                    {/* Prices */}
                    <div style={{ fontSize: 11, color: T.textDim, display: "flex", gap: 14, flexWrap: "wrap" }}>
                      {p.price_usd_at_prediction && <span>Entrada: <strong style={{ ...S.mono, color: T.textMuted }}>${p.price_usd_at_prediction.toFixed(2)}</strong></span>}
                      {p.target_pct && <span>Target: <strong style={{ color: T.green }}>+{p.target_pct}%</strong></span>}
                      {p.stop_loss_pct && <span>Stop: <strong style={{ color: T.red }}>{p.stop_loss_pct}%</strong></span>}
                    </div>

                    {/* Result — right-aligned */}
                    <div style={{ marginLeft: "auto", textAlign: "right", minWidth: 100 }}>
                      {p.evaluated ? (
                        <>
                          <span style={S.badge(p.prediction_correct === 1 ? T.green : p.prediction_correct === 0 ? T.red : T.textDim)}>
                            {p.prediction_correct === 1 ? "ACERTÓ ✓" : p.prediction_correct === 0 ? "FALLÓ ✗" : "N/A"}
                          </span>
                          {p.actual_change_pct != null && (
                            <div style={{ ...S.mono, fontSize: 18, fontWeight: 800, color: changeColor, marginTop: 6 }}>
                              {p.actual_change_pct >= 0 ? "+" : ""}{p.actual_change_pct}%
                            </div>
                          )}
                          <button onClick={() => confirmConclude(p.id, p.ticker)} disabled={concluding === p.id} style={{ ...S.btn("purple"), fontSize: 10, padding: "4px 10px", marginTop: 8, opacity: concluding === p.id ? 0.5 : 1 }} title="Claude analiza qué pasó realmente con esta predicción y qué aprender de ella. Consume tokens.">
                            {concluding === p.id ? "..." : "🔍 Conclusión"}
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: T.yellow }}>⏳ Pendiente</span>
                      )}
                    </div>
                  </div>

                  {/* Reasoning */}
                  {p.reasoning && (
                    <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6, fontStyle: "italic", borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                      "{p.reasoning}"
                    </div>
                  )}

                  {/* Evaluation notes */}
                  {p.evaluation_notes && (
                    <div style={{ fontSize: 11, color: T.textDim, marginTop: 8, paddingLeft: 12, borderLeft: `2px solid ${T.purple}40` }}>
                      {p.evaluation_notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ ...S.card, textAlign: "center", padding: 56, marginTop: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.3 }}>◎</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>Sin predicciones aún</div>
            <div style={{ color: T.textDim, fontSize: 13 }}>Generá un análisis IA desde el Dashboard.</div>
          </div>
        )}

        {/* POST-MORTEM RESULT */}
        {postmortem && (
          <div style={{ ...S.card, marginTop: 28, border: `1px solid ${T.purple}30`, background: `${T.purple}06` }}>
            {postmortem.error ? (
              <StatusMsg type="error">Error: {postmortem.error}</StatusMsg>
            ) : postmortem.message ? (
              <div style={{ color: T.yellow, fontSize: 13 }}>⚠️ {postmortem.message}</div>
            ) : (
              <>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                  <span style={{ fontSize: 28 }}>📊</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: T.purple }}>Post-Mortem: {postmortem.monthLabel}</div>
                    <div style={{ fontSize: 12, color: T.textDim, marginTop: 3 }}>
                      {postmortem.stats?.correct}/{postmortem.stats?.total} aciertos &middot; {postmortem.stats?.accuracy}% accuracy &middot; retorno prom. {postmortem.stats?.avgReturn >= 0 ? "+" : ""}{postmortem.stats?.avgReturn}%
                    </div>
                  </div>
                  {/* Strategy confidence bar */}
                  <div style={{ marginLeft: "auto", textAlign: "right", minWidth: 120 }}>
                    <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Confianza en estrategia</div>
                    <div style={{ background: T.border, borderRadius: 6, height: 8, width: 120 }}>
                      <div style={{ background: postmortem.postmortem?.confianza_estrategia >= 65 ? T.green : postmortem.postmortem?.confianza_estrategia >= 45 ? T.yellow : T.red, borderRadius: 6, height: 8, width: `${postmortem.postmortem?.confianza_estrategia || 0}%`, transition: "width 1s ease" }} />
                    </div>
                    <div style={{ fontSize: 11, color: T.cyan, fontWeight: 700, marginTop: 3 }}>{postmortem.postmortem?.confianza_estrategia ?? "—"}%</div>
                  </div>
                </div>

                {/* Resumen */}
                {postmortem.postmortem?.resumen_mes && (
                  <div style={{ background: "rgba(3,7,17,0.4)", borderRadius: 12, padding: 16, marginBottom: 14, borderLeft: `3px solid ${T.purple}` }}>
                    <div style={{ ...S.label, color: T.purple, marginBottom: 8 }}>Resumen del Mes</div>
                    <p style={{ margin: 0, color: T.textMuted, fontSize: 13 }}>{postmortem.postmortem.resumen_mes}</p>
                  </div>
                )}

                {/* Aciertos & Errores */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div style={{ background: `${T.green}08`, borderRadius: 12, padding: 16, border: `1px solid ${T.green}20`, borderLeft: `3px solid ${T.green}` }}>
                    <div style={{ ...S.label, color: T.green, marginBottom: 8 }}>✓ Qué acerté</div>
                    <p style={{ margin: 0, color: T.textMuted, fontSize: 12 }}>{postmortem.postmortem?.aciertos_analisis}</p>
                  </div>
                  <div style={{ background: `${T.red}08`, borderRadius: 12, padding: 16, border: `1px solid ${T.red}20`, borderLeft: `3px solid ${T.red}` }}>
                    <div style={{ ...S.label, color: T.red, marginBottom: 8 }}>✗ Dónde fallé</div>
                    <p style={{ margin: 0, color: T.textMuted, fontSize: 12 }}>{postmortem.postmortem?.errores_analisis}</p>
                  </div>
                </div>

                {/* Patrones */}
                {postmortem.postmortem?.patrones_detectados?.length > 0 && (
                  <div style={{ ...S.card, marginBottom: 14, padding: 16 }}>
                    <div style={{ ...S.label, marginBottom: 10 }}>🔍 Patrones Detectados</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {postmortem.postmortem.patrones_detectados.map((p, i) => (
                        <span key={i} style={{ ...S.badge(T.yellow), fontSize: 11, padding: "5px 10px", lineHeight: 1.4, maxWidth: 280, whiteSpace: "normal" }}>{p}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reglas */}
                {postmortem.postmortem?.reglas_nuevas?.length > 0 && (
                  <div style={{ ...S.card, marginBottom: 14, padding: 16, border: `1px solid ${T.cyan}20` }}>
                    <div style={{ ...S.label, color: T.cyan, marginBottom: 10 }}>☑️ Reglas Autoimpuestas</div>
                    {postmortem.postmortem.reglas_nuevas.map((r, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 0", borderBottom: i < postmortem.postmortem.reglas_nuevas.length - 1 ? `1px solid ${T.border}` : "none" }}>
                        <span style={{ color: T.cyan, fontWeight: 700, fontSize: 12 }}>{i + 1}.</span>
                        <span style={{ fontSize: 12, color: T.textMuted }}>{r}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Ajustes + Nota */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {postmortem.postmortem?.ajustes_estrategia && (
                    <div style={{ background: `${T.blue}08`, borderRadius: 12, padding: 16, border: `1px solid ${T.blue}20` }}>
                      <div style={{ ...S.label, color: T.blue, marginBottom: 8 }}>🔄 Ajustes para el Próximo Mes</div>
                      <p style={{ margin: 0, color: T.textMuted, fontSize: 12 }}>{postmortem.postmortem.ajustes_estrategia}</p>
                    </div>
                  )}
                  {postmortem.postmortem?.nota_para_mi_yo_futuro && (
                    <div style={{ background: `${T.purple}08`, borderRadius: 12, padding: 16, border: `1px solid ${T.purple}20` }}>
                      <div style={{ ...S.label, color: T.purple, marginBottom: 8 }}>📝 Nota para mi Yo Futuro</div>
                      <p style={{ margin: 0, color: T.textMuted, fontSize: 12, fontStyle: "italic" }}>"{postmortem.postmortem.nota_para_mi_yo_futuro}"</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* POST-MORTEM HISTORY */}
        {pmHistory.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ ...S.label, color: T.textMuted, marginBottom: 14 }}>Historial de Post-Mortems</div>
            <div style={{ ...S.grid(220) }}>
              {pmHistory.map((pm, i) => {
                const raw = pm.raw_ai_response;
                return (
                  <div key={i} style={{ ...S.card, padding: 18, border: `1px solid ${T.purple}20` }}>
                    <div style={{ fontWeight: 700, color: T.purple, fontSize: 13, marginBottom: 6 }}>{pm.month_label}</div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                      <span style={S.badge(pm.accuracy_pct >= 60 ? T.green : pm.accuracy_pct >= 40 ? T.yellow : T.red)}>{pm.accuracy_pct ?? "—"}% acc.</span>
                      <span style={S.badge(T.cyan)}>{pm.correct_predictions}/{pm.total_predictions}</span>
                      {pm.total_return_pct != null && <span style={S.badge(pm.total_return_pct >= 0 ? T.green : T.red)}>{pm.total_return_pct >= 0 ? "+" : ""}{pm.total_return_pct}%</span>}
                    </div>
                    {/* Confidence bar */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>Confianza: {pm.confidence_in_strategy ?? "—"}%</div>
                      <div style={{ background: T.border, borderRadius: 4, height: 4 }}>
                        <div style={{ background: (pm.confidence_in_strategy || 0) >= 65 ? T.green : (pm.confidence_in_strategy || 0) >= 45 ? T.yellow : T.red, borderRadius: 4, height: 4, width: `${pm.confidence_in_strategy || 0}%` }} />
                      </div>
                    </div>
                    {pm.best_pick && <div style={{ fontSize: 11, color: T.green }}>↑ {pm.best_pick} {pm.best_pick_return != null ? `(+${pm.best_pick_return}%)` : ""}</div>}
                    {pm.worst_pick && <div style={{ fontSize: 11, color: T.red }}>↓ {pm.worst_pick} {pm.worst_pick_return != null ? `(${pm.worst_pick_return}%)` : ""}</div>}
                    {pm.patterns_detected?.length > 0 && (
                      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {pm.patterns_detected.slice(0, 2).map((p, j) => (
                          <span key={j} style={{ ...S.badge(T.yellow), fontSize: 9, padding: "2px 6px" }}>{p.slice(0, 40)}{p.length > 40 ? "…" : ""}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ─── HISTORIAL IA ─── */
  const renderHistorial = () => (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      <div style={{ ...S.label, fontSize: 13, color: T.textMuted }}>Sesiones de Análisis IA</div>
      {analysisSessions.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: 56, marginTop: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.3 }}>◉</div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>Sin sesiones</div>
          <div style={{ color: T.textDim, fontSize: 13 }}>Cada análisis IA se guarda acá automáticamente.</div>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          {analysisSessions.map((ses, i) => (
            <div key={i} style={{ ...S.card, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                <div>
                  <span style={{ ...S.mono, fontSize: 14, color: T.cyan }}>{ses.session_date ? new Date(ses.session_date).toLocaleString("es-AR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : ""}</span>
                  <span style={{ fontSize: 11, color: T.textDim, marginLeft: 14 }}>CCL: ${ses.ccl_rate}</span>
                </div>
                <div style={{ fontSize: 12, color: T.textDim }}>Capital: <strong style={{ color: T.green }}>${ses.capital_ars?.toLocaleString()}</strong></div>
              </div>
              {ses.market_summary && (
                <div style={{ background: "rgba(3,7,17,0.4)", borderRadius: 12, padding: 16, marginBottom: 12, border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.green}` }}>
                  <div style={{ ...S.label, color: T.green, marginBottom: 8 }}>Resumen</div>
                  <p style={{ margin: 0, color: T.textMuted, fontSize: 12, lineHeight: 1.6 }}>{ses.market_summary}</p>
                </div>
              )}
              {ses.full_response?.nuevas_compras && (
                <div>
                  <div style={{ ...S.label, marginBottom: 10 }}>Nuevas Compras</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {ses.full_response.nuevas_compras.map((rec, j) => (
                      <div key={j} style={{ background: "rgba(3,7,17,0.4)", borderRadius: 10, padding: "8px 14px", border: `1px solid ${T.border}`, fontSize: 12 }}>
                        <span style={S.badge(signalColors[rec.accion] || T.green)}>{rec.accion}</span>
                        <strong style={{ marginLeft: 8, ...S.mono }}>{rec.ticker}</strong>
                        {rec.target_pct && <span style={{ color: T.green, marginLeft: 8 }}>+{rec.target_pct}%</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {ses.risks?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ ...S.label, color: T.yellow, marginBottom: 8 }}>Riesgos</div>
                  {ses.risks.map((r, j) => <div key={j} style={{ fontSize: 11, color: T.textDim, paddingLeft: 14, borderLeft: `2px solid ${T.orange}25`, marginBottom: 4 }}>{r}</div>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* ─── BENCHMARKS ─── */
  const renderBenchmarks = () => {
    if (benchLoading) return <div style={S.card}><Skeleton height={300} /></div>;
    if (!benchmarks || benchmarks.error) return (
      <div style={{ ...S.card, textAlign: "center", padding: 56, animation: "fadeUp 0.4s ease" }}>
        <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.3 }}>◧</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>{benchmarks?.error || "Sin datos de benchmarks"}</div>
        <div style={{ color: T.textDim, fontSize: 13 }}>Necesitás al menos una operación registrada para comparar.</div>
      </div>
    );
    const b = benchmarks;
    const verdictColors = { excellent: T.green, good: T.greenLight, warning: T.orange, danger: T.red, neutral: T.textMuted };
    const barData = [
      { name: "Tu Portfolio", value: b.portfolio.returnPct, fill: T.green },
      b.benchmarks.spy != null && { name: "SPY", value: b.benchmarks.spy, fill: T.blue },
      b.benchmarks.qqq != null && { name: "QQQ", value: b.benchmarks.qqq, fill: T.purple },
      { name: "Plazo Fijo", value: b.benchmarks.plazoFijo, fill: T.yellow },
      { name: "Inflación", value: b.benchmarks.inflation, fill: T.red },
    ].filter(Boolean);

    const benchItems = [
      { id: "portfolio", name: "Tu Portfolio", return_pct: b.portfolio.returnPct, color: T.green },
      b.benchmarks.spy != null && { id: "spy", name: "SPY (S&P 500)", return_pct: b.benchmarks.spy, color: T.blue },
      b.benchmarks.qqq != null && { id: "qqq", name: "QQQ (Nasdaq)", return_pct: b.benchmarks.qqq, color: T.purple },
      { id: "plazoFijo", name: "Plazo Fijo (75% TNA)", return_pct: b.benchmarks.plazoFijo, color: T.yellow },
      { id: "inflation", name: "Inflación (~3.5%/mes)", return_pct: b.benchmarks.inflation, color: T.red },
    ].filter(Boolean);

    return (
      <div style={{ animation: "fadeUp 0.4s ease" }}>
        <div style={{ ...S.label, fontSize: 13, color: T.textMuted, marginBottom: 16 }}>COMPARACIÓN DE RENDIMIENTO</div>

        {/* Representativity note */}
        {b.nota_representatividad && (
          <div style={{ fontSize: 11, color: T.yellow, marginBottom: 12, padding: "8px 14px", background: `${T.yellow}08`, borderRadius: 8, border: `1px solid ${T.yellow}15` }}>
            {b.nota_representatividad}
          </div>
        )}

        {/* Verdict card */}
        <div style={{
          padding: 16, borderRadius: 12, marginBottom: 16,
          background: b.beatsMarket?.spy ? `${T.green}10` : `${T.yellow}10`,
          border: `1px solid ${b.beatsMarket?.spy ? T.green : T.yellow}25`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: b.beatsMarket?.spy ? T.green : T.yellow }}>
            {b.verdict}
          </div>
          <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>
            Periodo: {b.period.from} → hoy ({b.period.months} meses)
            {b.proyeccion_anual != null && ` | Proyección anual: ${b.proyeccion_anual >= 0 ? "+" : ""}${b.proyeccion_anual}%`}
          </div>
        </div>

        {/* Benchmark cards with context */}
        <div style={S.grid(200)}>
          {benchItems.map((item, i) => {
            const isPortfolio = item.id === "portfolio";
            const ctx = b.context?.[item.id];
            return (
              <div key={i} style={{
                ...S.card, padding: 16,
                borderLeft: `3px solid ${item.color}`,
                background: isPortfolio ? `${item.color}08` : S.card.background,
              }}>
                <div style={{ fontSize: 10, color: item.color, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, ...S.mono, color: item.return_pct >= 0 ? item.color : T.red, letterSpacing: "-1px" }}>
                  {item.return_pct >= 0 ? "+" : ""}{item.return_pct}%
                </div>
                {ctx?.dato_clave && (
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8, lineHeight: 1.5 }}>
                    {ctx.dato_clave}
                  </div>
                )}
                {ctx?.por_que_importa && !isPortfolio && (
                  <div style={{ fontSize: 10, color: T.textDim, marginTop: 6, lineHeight: 1.5, fontStyle: "italic" }}>
                    {ctx.por_que_importa}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Chart */}
        <div style={{ ...S.card, marginTop: 20 }}>
          <div style={S.label}>Rendimiento Comparado (%)</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: T.textDim }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: T.textMuted, fontWeight: 600 }} tickLine={false} axisLine={false} width={90} />
              <Tooltip contentStyle={{ background: T.bgCardSolid, border: `1px solid ${T.borderLight}`, borderRadius: 10, fontSize: 12 }} formatter={v => `${(v ?? 0).toFixed(2)}%`} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  /* ─── BACKTEST ─── */
  const renderBacktest = () => {
    const bt = backtest;
    const r = bt?.resultado || {};
    return (
      <div style={{ animation: "fadeUp 0.4s ease" }}>
        <InfoBanner icon="📈" title="¿Qué es el Backtesting?">
          Simula cómo hubiera rendido tu portfolio si hubieras seguido una estrategia <strong style={{ color: T.text }}>Core/Satellite</strong> durante el período seleccionado.<br />
          El <strong style={{ color: T.text }}>Core</strong> invierte en SPY (índice S&P500) mes a mes. El <strong style={{ color: T.text }}>Satellite</strong> hace picks activos de CEDEARs basados en el perfil elegido. Al final compara ambos contra invertir 100% en SPY.<br />
          <span style={{ color: T.textDim }}>No consume tokens de Claude — es una simulación algorítmica con datos históricos reales.</span>
        </InfoBanner>
        <div style={{ ...S.label, fontSize: 13, color: T.textMuted, marginBottom: 16 }}>BACKTESTING — SIMULACIÓN HISTÓRICA INTERACTIVA</div>

        {/* Controls panel */}
        <div style={{ ...S.card, marginBottom: 20, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={S.label}>Periodo</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[3, 6, 9, 12].map(m => (
                <button key={m} onClick={() => setBtMonths(m)} style={{
                  padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontFamily: T.fontMono, fontSize: 13, fontWeight: 700,
                  background: btMonths === m ? T.green : T.bg, color: btMonths === m ? T.bg : T.textDim,
                }}>{m}M</button>
              ))}
            </div>
          </div>
          <div>
            <div style={S.label}>Depósito mensual</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[500000, 1000000, 2000000, 5000000].map(d => (
                <button key={d} onClick={() => setBtDeposit(d)} style={{
                  padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: 11, fontWeight: 600, fontFamily: T.font,
                  background: btDeposit === d ? T.blue : T.bg, color: btDeposit === d ? T.bg : T.textDim,
                }}>${(d / 1000000).toFixed(1)}M</button>
              ))}
            </div>
          </div>
          <div>
            <div style={S.label}>CEDEARs por mes</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[2, 4, 6, 8].map(p => (
                <button key={p} onClick={() => setBtPicks(p)} style={{
                  padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 700, fontFamily: T.fontMono,
                  background: btPicks === p ? T.purple : T.bg, color: btPicks === p ? T.bg : T.textDim,
                }}>{p}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={S.label}>Perfil</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { id: "conservative", label: "Conservador", color: T.blue },
                { id: "moderate", label: "Moderado", color: T.yellow },
                { id: "aggressive", label: "Agresivo", color: T.red },
              ].map(p => (
                <button key={p.id} onClick={() => setBtProfile(p.id)} style={{
                  padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: 10, fontWeight: 700, fontFamily: T.font,
                  background: btProfile === p.id ? p.color : T.bg, color: btProfile === p.id ? T.bg : T.textDim,
                }}>{p.label}</button>
              ))}
            </div>
          </div>
          <button onClick={() => setConfirmState({ icon: "📈", title: "Correr Simulación de Backtest", description: `Va a simular ${btMonths} meses de inversión con la estrategia Core/Satellite usando perfil ${btProfile}. El proceso puede tardar unos segundos porque busca precios históricos reales. No consume tokens de Claude.`, confirmLabel: "Correr Simulación", onConfirm: runBacktestSim })} disabled={backtestLoading} style={{ ...S.btn(), minWidth: 180, opacity: backtestLoading ? 0.5 : 1 }}>
            {backtestLoading ? "⟳ Simulando..." : "Correr Simulación"}
          </button>
        </div>

        {backtestLoading && <div style={S.card}><Skeleton height={300} /></div>}
        {!backtestLoading && bt?.error && (
          <div style={{ ...S.card, textAlign: "center", padding: 56 }}>
            <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.3 }}>↺</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: T.textMuted }}>{bt.error}</div>
          </div>
        )}
        {!backtestLoading && bt && !bt.error && (
          <>
            {/* Summary cards */}
            <div className="ca-stat-grid" style={S.grid()}>
              <div style={{ ...S.card, borderLeft: `3px solid ${r.returnPct >= 0 ? T.green : T.red}`, background: `linear-gradient(135deg, ${r.returnPct >= 0 ? T.green : T.red}08, transparent)` }}>
                <div style={S.label}>Retorno Total (Core+Satellite)</div>
                <div style={{ ...S.value, color: r.returnPct >= 0 ? T.green : T.red }}>{r.returnPct >= 0 ? "+" : ""}{(r.returnPct ?? 0).toFixed(2)}%</div>
                <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>${(r.totalInvertido ?? 0).toLocaleString()} → ${(r.valorFinal ?? 0).toLocaleString()}</div>
              </div>
              {r.spyReturnPct != null && (
                <div style={{ ...S.card, borderLeft: `3px solid ${T.blue}` }}>
                  <div style={S.label}>SPY puro mismo período</div>
                  <div style={{ ...S.value, color: T.blue }}>{r.spyReturnPct >= 0 ? "+" : ""}{r.spyReturnPct}%</div>
                </div>
              )}
              {r.alpha != null && (
                <div style={{ ...S.card, borderLeft: `3px solid ${r.alpha >= 0 ? T.green : T.red}` }}>
                  <div style={S.label}>Alpha vs SPY puro</div>
                  <div style={{ ...S.value, color: r.alpha >= 0 ? T.green : T.red }}>{r.alpha >= 0 ? "+" : ""}{r.alpha.toFixed(2)}%</div>
                </div>
              )}
              <div style={{ ...S.card, borderLeft: `3px solid ${T.purple}` }}>
                <div style={S.label}>Período</div>
                <div style={{ ...S.value, color: T.purple, fontSize: 22 }}>{bt.entryDate || "?"} → hoy</div>
              </div>
            </div>

            {/* === DESGLOSE CORE vs SATELLITE === */}
            {bt.core && bt.satellite && (
              <div style={{ marginTop: 20 }}>
                <div style={S.label}>DESGLOSE: CORE vs SATELLITE</div>

                {/* 3 Cards de comparación */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 12 }}>
                  {/* CORE */}
                  <div style={{ ...S.card, borderTop: `3px solid ${T.blue}` }}>
                    <div style={{ fontSize: 10, color: T.blue, fontWeight: 700, letterSpacing: "1.5px", marginBottom: 12 }}>
                      CORE — {bt.core.etf || "SPY"} ({bt.config.corePct}%)
                    </div>
                    <div style={{ fontSize: 32, fontWeight: 900, ...S.mono, letterSpacing: "-2px", color: bt.core.returnPct >= 0 ? T.blue : T.red }}>
                      {bt.core.returnPct >= 0 ? "+" : ""}{bt.core.returnPct}%
                    </div>
                    <div style={{ fontSize: 11, color: T.textDim, marginTop: 8 }}>Invertido: ${bt.core.invertido?.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: T.textDim }}>Valor actual: ${bt.core.valorActual?.toLocaleString()}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, ...S.mono, marginTop: 8, color: bt.core.pnl >= 0 ? T.green : T.red }}>
                      {bt.core.pnl >= 0 ? "+" : ""}${bt.core.pnl?.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: T.textDim, marginTop: 10, lineHeight: 1.5, fontStyle: "italic" }}>
                      Rendimiento de solo comprar {bt.core.etf || "SPY"} todos los meses. Es el piso de seguridad.
                    </div>
                  </div>

                  {/* SATELLITE */}
                  <div style={{ ...S.card, borderTop: `3px solid ${bt.satellite.generaAlfa ? T.green : T.red}` }}>
                    <div style={{ fontSize: 10, color: bt.satellite.generaAlfa ? T.green : T.red, fontWeight: 700, letterSpacing: "1.5px", marginBottom: 12 }}>
                      SATELLITE — PICKS DEL BOT ({100 - bt.config.corePct}%)
                    </div>
                    <div style={{ fontSize: 32, fontWeight: 900, ...S.mono, letterSpacing: "-2px", color: bt.satellite.returnPct >= 0 ? T.green : T.red }}>
                      {bt.satellite.returnPct >= 0 ? "+" : ""}{bt.satellite.returnPct}%
                    </div>
                    <div style={{ fontSize: 11, color: T.textDim, marginTop: 8 }}>Invertido: ${bt.satellite.invertido?.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: T.textDim }}>Valor actual: ${bt.satellite.valorActual?.toLocaleString()}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, ...S.mono, marginTop: 8, color: bt.satellite.pnl >= 0 ? T.green : T.red }}>
                      {bt.satellite.pnl >= 0 ? "+" : ""}${bt.satellite.pnl?.toLocaleString()}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <span style={S.badge(bt.satellite.generaAlfa ? T.green : T.red)}>
                        {bt.satellite.generaAlfa
                          ? `GENERA ALFA: +${bt.satellite.alpha}% vs SPY`
                          : `NO GENERA ALFA: ${bt.satellite.alpha}% vs SPY`}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: T.textDim, marginTop: 10, lineHeight: 1.5, fontStyle: "italic" }}>
                      Rendimiento del stock picking. Si supera a SPY, el bot agrega valor.
                    </div>
                  </div>

                  {/* COMBINADO */}
                  <div style={{ ...S.card, borderTop: `3px solid ${r.beatsSPY ? T.green : T.yellow}` }}>
                    <div style={{ fontSize: 10, color: r.beatsSPY ? T.green : T.yellow, fontWeight: 700, letterSpacing: "1.5px", marginBottom: 12 }}>
                      COMBINADO — RESULTADO FINAL
                    </div>
                    <div style={{ fontSize: 32, fontWeight: 900, ...S.mono, letterSpacing: "-2px", color: r.returnPct >= 0 ? T.green : T.red }}>
                      {r.returnPct >= 0 ? "+" : ""}{(r.returnPct ?? 0).toFixed(2)}%
                    </div>
                    <div style={{ fontSize: 11, color: T.textDim, marginTop: 8 }}>Total invertido: ${r.totalInvertido?.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: T.textDim }}>Valor final: ${r.valorFinal?.toLocaleString()}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, ...S.mono, marginTop: 8, color: T.blue }}>
                      SPY puro: {r.spyReturnPct != null ? `+${r.spyReturnPct}%` : "N/A"}
                    </div>
                    <div style={{ fontSize: 10, color: T.textDim, marginTop: 10, lineHeight: 1.5, fontStyle: "italic" }}>
                      Core ({bt.config.corePct}%) + Satellite ({100 - bt.config.corePct}%) combinados vs SPY puro.
                    </div>
                  </div>
                </div>

                {/* Mejor y peor pick del satellite */}
                {bt.satellite.mejorPick && bt.satellite.peorPick && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
                    <div style={{ ...S.card, padding: 16, borderLeft: `3px solid ${T.green}` }}>
                      <div style={{ fontSize: 10, color: T.green, fontWeight: 700, letterSpacing: "1px" }}>MEJOR PICK DEL SATELLITE</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                        <div style={{ fontSize: 22, fontWeight: 900, ...S.mono }}>{bt.satellite.mejorPick.ticker}</div>
                        <div style={{ fontSize: 11, color: T.textDim }}>{bt.satellite.mejorPick.sector}</div>
                        <div style={{ marginLeft: "auto", fontSize: 20, fontWeight: 900, ...S.mono, color: T.green }}>
                          +{bt.satellite.mejorPick.returnPct}%
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: T.textDim, marginTop: 6 }}>
                        ${bt.satellite.mejorPick.invested?.toLocaleString()} → ${bt.satellite.mejorPick.currentValue?.toLocaleString()}
                      </div>
                    </div>
                    <div style={{ ...S.card, padding: 16, borderLeft: `3px solid ${T.red}` }}>
                      <div style={{ fontSize: 10, color: T.red, fontWeight: 700, letterSpacing: "1px" }}>PEOR PICK DEL SATELLITE</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                        <div style={{ fontSize: 22, fontWeight: 900, ...S.mono }}>{bt.satellite.peorPick.ticker}</div>
                        <div style={{ fontSize: 11, color: T.textDim }}>{bt.satellite.peorPick.sector}</div>
                        <div style={{ marginLeft: "auto", fontSize: 20, fontWeight: 900, ...S.mono, color: bt.satellite.peorPick.returnPct >= 0 ? T.green : T.red }}>
                          {bt.satellite.peorPick.returnPct >= 0 ? "+" : ""}{bt.satellite.peorPick.returnPct}%
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: T.textDim, marginTop: 6 }}>
                        ${bt.satellite.peorPick.invested?.toLocaleString()} → ${bt.satellite.peorPick.currentValue?.toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tabla completa de satellite holdings */}
                {bt.satellite.holdings?.length > 0 && (
                  <div className="ca-table-wrap" style={{ ...S.card, padding: 0, overflow: "auto", marginTop: 16, borderRadius: 16 }}>
                    <div style={{ padding: "14px 14px 0", ...S.label }}>TODOS LOS PICKS DEL SATELLITE</div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr>
                        {["CEDEAR", "Sector", "Cant.", "Invertido", "Valor Actual", "P&L", "Retorno", "vs SPY"].map((h, i) => (
                          <th key={i} style={{ ...S.th, textAlign: i < 2 ? "left" : "center" }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {bt.satellite.holdings.map((h, i) => {
                          const vsSpy = Math.round((h.returnPct - (r.spyReturnPct || 0)) * 100) / 100;
                          return (
                            <tr key={i} style={{ background: h.returnPct > (r.spyReturnPct || 0) ? `${T.green}05` : "transparent" }}>
                              <td style={{ ...S.td, fontWeight: 800, ...S.mono }}>{h.ticker}</td>
                              <td style={{ ...S.td, fontSize: 11, color: T.textDim }}>{h.sector}</td>
                              <td style={{ ...S.td, textAlign: "center", ...S.mono }}>{h.shares}</td>
                              <td style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 12 }}>${h.invested?.toLocaleString()}</td>
                              <td style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 12 }}>${h.currentValue?.toLocaleString()}</td>
                              <td style={{ ...S.td, textAlign: "center", ...S.mono, fontWeight: 700, color: (h.currentValue - h.invested) >= 0 ? T.green : T.red }}>
                                {(h.currentValue - h.invested) >= 0 ? "+" : ""}${(h.currentValue - h.invested)?.toLocaleString()}
                              </td>
                              <td style={{ ...S.td, textAlign: "center", ...S.mono, fontWeight: 700, color: h.returnPct >= 0 ? T.green : T.red }}>
                                {h.returnPct >= 0 ? "+" : ""}{h.returnPct}%
                              </td>
                              <td style={{ ...S.td, textAlign: "center" }}>
                                <span style={S.badge(vsSpy >= 0 ? T.green : T.red)}>
                                  {vsSpy >= 0 ? "+" : ""}{vsSpy}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Month by month breakdown */}
            {bt.meses && bt.meses.length > 0 && (
              <div style={{ ...S.card, marginTop: 16 }}>
                <div style={S.label}>DESGLOSE MES A MES</div>
                {bt.meses.map((mes, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.border}`, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ ...S.mono, fontSize: 12, color: T.blue, minWidth: 90 }}>{mes.month}</span>
                    {/* Core allocation */}
                    <span style={{ ...S.badge(T.blue), fontSize: 10 }}>
                      {mes.core?.ticker || "SPY"} ${mes.core?.monto?.toLocaleString()} ({mes.corePct}%)
                    </span>
                    {/* Satellite picks */}
                    {mes.satellite?.map((pick, j) => (
                      <span key={j} style={{ ...S.badge(T.green), fontSize: 10 }}>
                        {pick.ticker} ({pick.sector})
                      </span>
                    ))}
                    <span style={{ fontSize: 10, color: T.textDim, marginLeft: "auto" }}>
                      Satellite: {mes.satellitePct}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Verdict text */}
            {bt.veredicto && (
              <div style={{
                ...S.card, marginTop: 16,
                background: r.beatsSPY ? `${T.green}08` : `${T.yellow}08`,
                border: `1px solid ${r.beatsSPY ? T.green : T.yellow}25`,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: r.beatsSPY ? T.green : T.yellow }}>
                  {bt.veredicto}
                </div>
              </div>
            )}

            {/* Strategy Explanation */}
            {bt.estrategia && (
              <div style={{ ...S.card, marginTop: 16, background: `${T.cyan}06`, borderLeft: `3px solid ${T.cyan}` }}>
                <div style={{ ...S.label, color: T.cyan, marginBottom: 12 }}>ESTRATEGIA APLICADA</div>
                <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.7, marginBottom: 12 }}>{bt.estrategia.que_hace}</div>

                {/* Risk management results */}
                {bt.riskManagement && (
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
                    <div style={{ background: T.bg, borderRadius: 10, padding: "10px 16px", border: `1px solid ${T.red}20` }}>
                      <div style={{ fontSize: 9, color: T.red, fontWeight: 700, letterSpacing: "1px" }}>STOP-LOSSES</div>
                      <div style={{ fontSize: 18, fontWeight: 800, ...S.mono, color: T.red, marginTop: 4 }}>{bt.riskManagement.stopLosses}</div>
                      <div style={{ fontSize: 10, color: T.textDim }}>ejecutados</div>
                    </div>
                    <div style={{ background: T.bg, borderRadius: 10, padding: "10px 16px", border: `1px solid ${T.green}20` }}>
                      <div style={{ fontSize: 9, color: T.green, fontWeight: 700, letterSpacing: "1px" }}>CAPITAL PROTEGIDO</div>
                      <div style={{ fontSize: 18, fontWeight: 800, ...S.mono, color: T.green, marginTop: 4 }}>${bt.riskManagement.capitalProtegido?.toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: T.textDim }}>ahorrado vs mantener</div>
                    </div>
                    <div style={{ background: T.bg, borderRadius: 10, padding: "10px 16px", border: `1px solid ${T.purple}20` }}>
                      <div style={{ fontSize: 9, color: T.purple, fontWeight: 700, letterSpacing: "1px" }}>PICKS vs SPY</div>
                      <div style={{ fontSize: 18, fontWeight: 800, ...S.mono, color: T.purple, marginTop: 4 }}>{bt.estrategia.resultados_riesgo?.picksBeatSpy || "?"}</div>
                      <div style={{ fontSize: 10, color: T.textDim }}>le ganaron</div>
                    </div>
                  </div>
                )}

                {/* Filters applied */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: T.blue, fontWeight: 700, letterSpacing: "1px", marginBottom: 6 }}>FILTROS APLICADOS</div>
                  {bt.estrategia.filtros_aplicados?.map((f, i) => (
                    <div key={i} style={{ fontSize: 11, color: T.textDim, padding: "3px 0 3px 12px", borderLeft: `2px solid ${T.blue}25`, marginBottom: 3, lineHeight: 1.4 }}>◆ {f}</div>
                  ))}
                </div>

                {/* Risk management rules */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: T.orange, fontWeight: 700, letterSpacing: "1px", marginBottom: 6 }}>GESTIÓN DE RIESGO</div>
                  {bt.estrategia.gestion_riesgo?.map((g, i) => (
                    <div key={i} style={{ fontSize: 11, color: T.textDim, padding: "3px 0 3px 12px", borderLeft: `2px solid ${T.orange}25`, marginBottom: 3, lineHeight: 1.4 }}>⚠ {g}</div>
                  ))}
                </div>

                {/* Why these picks */}
                {bt.estrategia.por_que_estos_picks?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: T.green, fontWeight: 700, letterSpacing: "1px", marginBottom: 6 }}>POR QUÉ ESTOS PICKS (Top 5)</div>
                    {bt.estrategia.por_que_estos_picks.map((p, i) => (
                      <div key={i} style={{ fontSize: 11, color: T.textMuted, padding: "4px 0 4px 12px", borderLeft: `2px solid ${p.includes("LE GANÓ") ? T.green : T.red}30`, marginBottom: 4, lineHeight: 1.5 }}>{p}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!bt.estrategia && (
              <div style={{ ...S.card, marginTop: 16, background: `${T.cyan}06`, borderLeft: `3px solid ${T.cyan}` }}>
                <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.7 }}>
                  <strong style={{ color: T.cyan }}>¿Cómo funciona?</strong> Estrategia Core/Satellite: cada mes, {bt.config?.corePct || 50}% del depósito va a {bt.core?.etf || "SPY"} (indexación pasiva) y {100 - (bt.config?.corePct || 50)}% a {bt.config?.picksPerMonth} picks activos diversificados (perfil: {bt.config?.profile}). Al final se compara el rendimiento combinado vs invertir 100% en SPY.
                </div>
              </div>
            )}
          </>
        )}
        {!backtestLoading && !bt && (
          <div style={{ ...S.card, textAlign: "center", padding: 56 }}>
            <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.3 }}>▶</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: T.textMuted }}>Configurá los parámetros y presioná "Correr Simulación"</div>
            <div style={{ color: T.textDim, fontSize: 13 }}>El bot simulará compras diversificadas mes a mes y comparará el resultado contra SPY.</div>
          </div>
        )}
      </div>
    );
  };

  /* ─── MODALS ─── */
  const renderOpModal = (type) => (
    <Modal show={type === "buy" ? showBuyModal : showSellModal} onClose={() => type === "buy" ? setShowBuyModal(false) : setShowSellModal(false)} title={<>{type === "buy" ? "Registrar Compra" : "Registrar Venta"} <span style={{ color: T.green }}>{opForm.ticker}</span></>}>
      <div style={{ marginBottom: 16 }}><label style={{ ...S.label, display: "block", marginBottom: 8 }}>Ticker</label><input value={opForm.ticker} onChange={e => setOpForm({ ...opForm, ticker: e.target.value.toUpperCase() })} placeholder="Ej: AAPL" style={S.input} /></div>
      <div style={{ marginBottom: 16 }}><label style={{ ...S.label, display: "block", marginBottom: 8 }}>Cantidad</label><input type="number" value={opForm.shares} onChange={e => setOpForm({ ...opForm, shares: e.target.value })} style={S.input} /></div>
      <div style={{ marginBottom: 16 }}><label style={{ ...S.label, display: "block", marginBottom: 8 }}>Precio por CEDEAR (ARS)</label><input type="number" value={opForm.priceArs} onChange={e => setOpForm({ ...opForm, priceArs: e.target.value })} style={S.input} /></div>
      <div style={{ marginBottom: 22 }}><label style={{ ...S.label, display: "block", marginBottom: 8 }}>Notas</label><input value={opForm.notes} onChange={e => setOpForm({ ...opForm, notes: e.target.value })} placeholder="Opcional" style={S.input} /></div>
      {opForm.shares > 0 && opForm.priceArs > 0 && (
        <div style={{ background: "rgba(3,7,17,0.4)", borderRadius: 12, padding: 16, marginBottom: 22, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11, color: T.textDim }}>Total:</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: type === "buy" ? T.green : T.red, ...S.mono, marginTop: 4 }}>${(parseInt(opForm.shares) * parseFloat(opForm.priceArs)).toLocaleString()} ARS</div>
        </div>
      )}
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button onClick={() => type === "buy" ? setShowBuyModal(false) : setShowSellModal(false)} style={S.btn("ghost")}>Cancelar</button>
        <button onClick={type === "buy" ? handleBuy : handleSell} style={S.btn(type === "buy" ? "primary" : "danger")}>{type === "buy" ? "Confirmar Compra" : "Confirmar Venta"}</button>
      </div>
    </Modal>
  );

  const renderSyncModal = () => {
    const diffs = syncRows.map(r => ({ ...r, diff: parseInt(r.newShares) - r.oldShares }));
    const hasDiffs = diffs.some(r => r.diff !== 0);
    return (
      <Modal show={showSyncModal} onClose={() => setShowSyncModal(false)} title="⟳ Sincronizar Cartera con Broker" maxWidth={700}>
        <div style={{ fontSize: 12, color: T.textDim, marginBottom: 16, lineHeight: 1.6 }}>
          Ingresá las cantidades actuales de tu broker. El sistema va a generar automáticamente las operaciones de compra/venta para cuadrar la base de datos.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>
              <th style={{ ...S.th, textAlign: "left" }}>Ticker</th>
              <th style={{ ...S.th, textAlign: "center" }}>En DB</th>
              <th style={{ ...S.th, textAlign: "center" }}>Broker (nuevo)</th>
              <th style={{ ...S.th, textAlign: "center" }}>Cambio</th>
              <th style={{ ...S.th, textAlign: "center" }}>Precio ARS</th>
              <th style={{ ...S.th, textAlign: "center" }}></th>
            </tr></thead>
            <tbody>{syncRows.map((row, i) => {
              const diff = parseInt(row.newShares) - row.oldShares;
              const diffColor = diff > 0 ? T.green : diff < 0 ? T.red : T.textDark;
              const diffLabel = diff > 0 ? `▲ +${diff}` : diff < 0 ? `▼ ${diff}` : "=";
              return (
                <tr key={row.ticker}>
                  <td style={{ ...S.td, fontWeight: 800, ...S.mono }}>{row.ticker}</td>
                  <td style={{ ...S.td, textAlign: "center", color: T.textDim }}>{row.oldShares}</td>
                  <td style={{ ...S.td, textAlign: "center" }}>
                    <input type="number" min="0" value={row.newShares}
                      onChange={e => { const v = e.target.value; setSyncRows(prev => prev.map((r, j) => j === i ? { ...r, newShares: v } : r)); }}
                      style={{ ...S.input, width: 70, textAlign: "center", padding: "4px 8px", fontSize: 13 }} />
                  </td>
                  <td style={{ ...S.td, textAlign: "center", ...S.mono, fontWeight: 700, color: diffColor }}>{diffLabel}</td>
                  <td style={{ ...S.td, textAlign: "center" }}>
                    <input type="number" min="0" value={row.priceArs}
                      onChange={e => { const v = e.target.value; setSyncRows(prev => prev.map((r, j) => j === i ? { ...r, priceArs: v } : r)); }}
                      style={{ ...S.input, width: 100, textAlign: "right", padding: "4px 8px", fontSize: 12 }} />
                  </td>
                  <td style={{ ...S.td, textAlign: "center" }}>
                    <button onClick={() => setSyncRows(prev => prev.filter((_, j) => j !== i))} style={{ ...S.btn("ghost"), padding: "2px 8px", fontSize: 11, color: T.red }}>✕</button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <button onClick={() => setSyncRows(prev => [...prev, { ticker: "", oldShares: 0, newShares: 0, priceArs: 0 }])}
          style={{ ...S.btn("ghost"), marginTop: 12, fontSize: 12 }}>+ Agregar ticker</button>
        {hasDiffs && (
          <div style={{ marginTop: 16, padding: 14, background: "rgba(3,7,17,0.4)", borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 12, color: T.textMuted }}>
            <strong style={{ color: T.text }}>Operaciones a generar:</strong>{" "}
            {diffs.filter(r => r.diff !== 0).map(r => (
              <span key={r.ticker} style={{ marginRight: 10, color: r.diff > 0 ? T.green : T.red }}>
                {r.diff > 0 ? `COMPRAR +${r.diff}` : `VENDER ${r.diff}`} {r.ticker}
              </span>
            ))}
          </div>
        )}
        {syncMsg && <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: syncMsg.type === "success" ? `${T.green}15` : `${T.red}15`, border: `1px solid ${syncMsg.type === "success" ? T.green : T.red}40`, fontSize: 12, color: syncMsg.type === "success" ? T.green : T.red }}>{syncMsg.text}</div>}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={() => setShowSyncModal(false)} style={S.btn("ghost")}>Cancelar</button>
          <button onClick={handleSync} disabled={syncLoading || !hasDiffs} style={{ ...S.btn("blue"), opacity: syncLoading || !hasDiffs ? 0.5 : 1 }}>
            {syncLoading ? "Sincronizando..." : "Confirmar Sincronización"}
          </button>
        </div>
      </Modal>
    );
  };
    <Modal
      show={showConclusionModal}
      onClose={() => setShowConclusionModal(false)}
      title={conclusionData?.prediction ? `Conclusión — ${conclusionData.prediction.ticker}` : "Analizando..."}
    >
      {!conclusionData ? (
        <div style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 14, color: T.textDim }}>&#8635; Claude está analizando qué pasó con esta predicción...</div>
          <div style={{ fontSize: 11, color: T.textDark, marginTop: 8 }}>Buscando noticias y comparando con la realidad</div>
        </div>
      ) : conclusionData.error ? (
        <div style={{ color: T.red, fontSize: 13 }}>Error: {conclusionData.error}</div>
      ) : (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div style={{ background: T.bg, borderRadius: 10, padding: 14, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 10, color: T.purple, fontWeight: 700, letterSpacing: "1px" }}>PREDICCIÓN</div>
              <div style={{ marginTop: 8 }}>
                <span style={S.badge(conclusionData.prediction.action === "COMPRAR" ? T.green : conclusionData.prediction.action === "VENDER" ? T.red : T.yellow)}>
                  {conclusionData.prediction.action}
                </span>
                <span style={{ fontSize: 11, color: T.textDim, marginLeft: 8 }}>Conf: {conclusionData.prediction.confidence}%</span>
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8, lineHeight: 1.5, fontStyle: "italic" }}>
                "{conclusionData.prediction.reasoning}"
              </div>
              <div style={{ fontSize: 10, color: T.textDim, marginTop: 6, ...S.mono }}>
                ${conclusionData.prediction.priceAtPrediction?.toFixed(2)} USD — {conclusionData.prediction.date?.slice(0, 10)}
              </div>
            </div>
            <div style={{ background: T.bg, borderRadius: 10, padding: 14, border: `1px solid ${conclusionData.actual?.changePct >= 0 ? T.green : T.red}40` }}>
              <div style={{ fontSize: 10, color: T.blue, fontWeight: 700, letterSpacing: "1px" }}>REALIDAD ({conclusionData.actual?.daysSince}d después)</div>
              <div style={{ fontSize: 28, fontWeight: 900, ...S.mono, marginTop: 8, color: conclusionData.actual?.changePct >= 0 ? T.green : T.red }}>
                {conclusionData.actual?.changePct >= 0 ? "+" : ""}{conclusionData.actual?.changePct}%
              </div>
              <div style={{ fontSize: 11, color: T.textDim, marginTop: 4, ...S.mono }}>
                ${conclusionData.prediction.priceAtPrediction?.toFixed(2)} → ${conclusionData.actual?.currentPrice?.toFixed(2)} USD
              </div>
            </div>
          </div>
          {conclusionData.conclusion && (
            <div>
              <div style={{ padding: 14, borderRadius: 10, marginBottom: 12, background: conclusionData.conclusion.le_pegue ? `${T.green}10` : `${T.red}10`, border: `1px solid ${conclusionData.conclusion.le_pegue ? T.green : T.red}30` }}>
                <span style={S.badge(conclusionData.conclusion.le_pegue ? T.green : T.red)}>
                  {conclusionData.conclusion.le_pegue ? "LE PEGUÉ ✓" : "ME EQUIVOQUÉ ✗"}
                </span>
                <div style={{ fontSize: 12, color: T.textMuted, marginTop: 10, lineHeight: 1.7 }}>
                  {conclusionData.conclusion.resumen}
                </div>
              </div>
              <div style={{ background: T.bg, borderRadius: 10, padding: 14, marginBottom: 12, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10, color: T.blue, fontWeight: 700, letterSpacing: "1px", marginBottom: 6 }}>QUÉ PASÓ</div>
                <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>{conclusionData.conclusion.que_paso}</div>
              </div>
              <div style={{ background: T.bg, borderRadius: 10, padding: 14, marginBottom: 12, border: `1px solid ${T.purple}20` }}>
                <div style={{ fontSize: 10, color: T.purple, fontWeight: 700, letterSpacing: "1px", marginBottom: 6 }}>QUÉ APRENDO</div>
                <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>{conclusionData.conclusion.que_aprendo}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 14, background: T.bg, borderRadius: 10, border: `1px solid ${T.border}` }}>
                <div>
                  <div style={{ fontSize: 10, color: T.textDim, fontWeight: 700, letterSpacing: "1px", marginBottom: 6 }}>¿QUÉ HARÍA HOY?</div>
                  <span style={S.badge(conclusionData.conclusion.accion_sugerida_ahora === "AUMENTAR" ? T.green : conclusionData.conclusion.accion_sugerida_ahora === "VENDER" ? T.red : T.yellow)}>
                    {conclusionData.conclusion.accion_sugerida_ahora}
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: T.textDim }}>Confianza actual</div>
                  <div style={{ fontSize: 20, fontWeight: 800, ...S.mono, color: T.text }}>{conclusionData.conclusion.confianza_actual}%</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div style={{ minHeight: "100vh", background: T.bg, position: "relative", overflow: "hidden" }}>
      {/* Ambient background glow */}
      <div style={{ position: "fixed", top: -200, left: -200, width: 500, height: 500, borderRadius: "50%", background: `radial-gradient(circle, ${T.green}06, transparent 60%)`, pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: -200, right: -200, width: 500, height: 500, borderRadius: "50%", background: `radial-gradient(circle, ${T.purple}05, transparent 60%)`, pointerEvents: "none" }} />

      {renderHeader()}
      <main className="ca-main" style={{ maxWidth: 1440, margin: "0 auto", padding: "28px 32px", position: "relative" }}>
        {error && <StatusMsg type="error">{error}<br /><button onClick={loadRanking} style={{ ...S.btn(), marginTop: 10, fontSize: 11 }}>Reintentar</button></StatusMsg>}
        {view === "dashboard" && renderDashboard()}
        {view === "ranking" && renderRanking()}
        {view === "detail" && renderDetail()}
        {view === "operaciones" && renderOperaciones()}
        {view === "benchmarks" && renderBenchmarks()}
        {view === "backtest" && renderBacktest()}
        {view === "predicciones" && renderPredicciones()}
        {view === "historial" && renderHistorial()}
      </main>
      {renderOpModal("buy")}{renderOpModal("sell")}{renderSyncModal()}{renderConclusionModal()}
      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
      <footer className="ca-footer" style={{ textAlign: "center", padding: "32px 24px", fontSize: 10, color: T.textDark, lineHeight: 2, borderTop: `1px solid ${T.border}`, marginTop: 40, background: "rgba(3,7,17,0.4)" }}>
        ⚠ DISCLAIMER: Herramienta informativa. No es asesoramiento financiero. Consultá un asesor matriculado (CNV).
      </footer>
    </div>
  );
}
