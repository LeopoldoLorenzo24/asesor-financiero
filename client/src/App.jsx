// ============================================================
// CEDEAR ADVISOR v2 — Modern UI Redesign
// ============================================================
import React, { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import api from "./api";

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
  text: "#f1f5f9", textMuted: "#94a3b8", textDim: "#64748b", textDark: "#475569",
  font: "'Inter', system-ui, -apple-system, sans-serif",
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
      `}</style>
    </div>
  );
}

function Modal({ show, onClose, title, children }) {
  if (!show) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(8px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.bgCardSolid, border: `1px solid ${T.borderLight}`, borderRadius: 20, padding: 32, width: "92%", maxWidth: 520, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(148,163,184,0.05)" }}>
        <h3 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 800 }}>{title}</h3>{children}
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
   APP
   ═══════════════════════════════════════════════════════════ */
export default function App() {
  const [view, setView] = useState("dashboard");
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
  const [opForm, setOpForm] = useState({ ticker: "", shares: 10, priceArs: 0, notes: "" });
  const [opMsg, setOpMsg] = useState(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalResult, setEvalResult] = useState(null);
  const [filterSector, setFilterSector] = useState("Todos");
  const [sortBy, setSortBy] = useState("composite");
  const [showCapitalInput, setShowCapitalInput] = useState(false);
  const [capitalToInvest, setCapitalToInvest] = useState("");

  const loadRanking = useCallback(async () => { setLoading(true); setError(null); try { const d = await api.getRanking(); setRanking(d.ranking || []); setCcl(d.ccl); } catch (e) { setError(`Error: ${e.message}. Verificá que el servidor esté corriendo.`); } finally { setLoading(false); } }, []);
  const loadPortfolioDB = useCallback(async () => { try { setPortfolioDB(await api.getPortfolioDB()); } catch (e) { console.error(e); } }, []);
  const loadCapital = useCallback(async () => { try { const hist = await api.getCapitalHistory(1); if (hist.length > 0) setCapital(hist[0].capital_available_ars); } catch (e) { console.error(e); } }, []);
  const loadTransactions = useCallback(async () => { try { setTransactions(await api.getTransactions()); } catch (e) { console.error(e); } }, []);
  const loadPredictions = useCallback(async () => { try { setPredictions(await api.getPredictions()); } catch (e) { console.error(e); } }, []);
  const loadPerformance = useCallback(async () => { try { setPerformance(await api.getPerformance(60)); } catch (e) { console.error(e); } }, []);
  const loadSessions = useCallback(async () => { try { setAnalysisSessions(await api.getAnalysisSessions(10)); } catch (e) { console.error(e); } }, []);

  useEffect(() => { loadRanking(); loadPortfolioDB(); loadCapital(); }, []);
  useEffect(() => { if (view === "operaciones") { loadTransactions(); loadPortfolioDB(); } if (view === "predicciones") { loadPredictions(); loadPerformance(); } if (view === "historial") loadSessions(); }, [view]);

  const loadDetail = useCallback(async (ticker) => { setSelectedTicker(ticker); setDetailLoading(true); setAiSingle(null); try { setDetail(await api.getCedear(ticker)); } catch (e) { console.error(e); } finally { setDetailLoading(false); } }, []);
  const runAI = useCallback(async (investCapital) => { setAiLoading(true); setShowCapitalInput(false); try { const d = await api.aiAnalyze(portfolioDB.summary.map(p => ({ ticker: p.ticker, shares: p.total_shares, avgPrice: p.weighted_avg_price })), investCapital); setAiAnalysis(d.analysis); } catch (e) { setAiAnalysis({ error: e.message }); } finally { setAiLoading(false); } }, [portfolioDB]);
  const runAISingle = useCallback(async (ticker) => { setAiSingleLoading(true); try { setAiSingle((await api.aiAnalyzeSingle(ticker)).aiAnalysis); } catch (e) { setAiSingle({ error: e.message }); } finally { setAiSingleLoading(false); } }, []);

  const handleBuy = async () => { try { setOpMsg(null); await api.buyPosition(opForm.ticker.toUpperCase(), parseInt(opForm.shares), parseFloat(opForm.priceArs), opForm.notes); setOpMsg({ type: "success", text: `Compra registrada: ${opForm.shares} ${opForm.ticker.toUpperCase()}` }); setShowBuyModal(false); loadPortfolioDB(); loadTransactions(); } catch (e) { setOpMsg({ type: "error", text: e.message }); } };
  const handleSell = async () => { try { setOpMsg(null); await api.sellPosition(opForm.ticker.toUpperCase(), parseInt(opForm.shares), parseFloat(opForm.priceArs), opForm.notes); setOpMsg({ type: "success", text: `Venta registrada: ${opForm.shares} ${opForm.ticker.toUpperCase()}` }); setShowSellModal(false); loadPortfolioDB(); loadTransactions(); } catch (e) { setOpMsg({ type: "error", text: e.message }); } };
  const handleEvaluateAll = async () => { setEvalLoading(true); setEvalResult(null); try { const r = await api.evaluateAll(); setEvalResult(r); loadPredictions(); loadPerformance(); } catch (e) { setEvalResult({ error: e.message }); } finally { setEvalLoading(false); } };

  const sectors = ["Todos", ...new Set(ranking.map(r => r.cedear?.sector).filter(Boolean))];
  const filtered = ranking.filter(r => filterSector === "Todos" || r.cedear?.sector === filterSector).sort((a, b) => { if (sortBy === "composite") return b.scores.composite - a.scores.composite; if (sortBy === "technical") return b.scores.techScore - a.scores.techScore; if (sortBy === "fundamental") return b.scores.fundScore - a.scores.fundScore; if (sortBy === "change") return (b.technical?.indicators?.performance?.month1 || 0) - (a.technical?.indicators?.performance?.month1 || 0); return 0; });
  const topPicks = ranking.slice(0, 8);
  const portfolioValue = portfolioDB.summary.reduce((s, p) => { const r = ranking.find(x => x.cedear?.ticker === p.ticker); return s + (r?.priceARS ? r.priceARS * p.total_shares : p.weighted_avg_price * p.total_shares); }, 0);

  const navItems = [{ id: "dashboard", label: "Dashboard", icon: "◈" }, { id: "ranking", label: "Ranking", icon: "◆" }, { id: "operaciones", label: "Operaciones", icon: "⟐" }, { id: "predicciones", label: "Predicciones", icon: "◎" }, { id: "historial", label: "Historial IA", icon: "◉" }];
  const nav = (v) => { setView(v); setSelectedTicker(null); setDetail(null); };

  /* ─── HEADER ─── */
  const renderHeader = () => (
    <header style={{ background: "rgba(3,7,17,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: `1px solid ${T.border}`, padding: "12px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, position: "sticky", top: 0, zIndex: 100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 42, height: 42, background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: "#030711", fontFamily: T.fontMono, boxShadow: `0 4px 20px ${T.green}30` }}>₵</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.5px", background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CEDEAR ADVISOR</div>
          <div style={{ fontSize: 9, color: T.textDark, letterSpacing: "3px", fontWeight: 600, marginTop: 1 }}>MOTOR DE INVERSIÓN IA v2</div>
        </div>
      </div>
      <nav style={{ display: "flex", gap: 3, background: "rgba(15,23,42,0.5)", borderRadius: 14, padding: 4, border: `1px solid ${T.border}`, flexWrap: "wrap", backdropFilter: "blur(10px)" }}>
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
      <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
        {ccl && <div style={{ color: T.textDim }}>CCL <span style={{ color: T.cyan, fontWeight: 700, fontFamily: T.fontMono }}>${ccl.venta}</span></div>}
        <div style={{ color: T.textDim }}>Perfil <span style={{ color: T.yellow, fontWeight: 700 }}>MOD-AGRESIVO</span></div>
      </div>
    </header>
  );

  /* ─── AI RESPONSE ─── */
  const renderAIResponse = (a) => {
    if (!a) return <div style={{ textAlign: "center", padding: 40, color: T.textDim, fontSize: 13, lineHeight: 1.8 }}>Presioná <strong style={{ color: T.green }}>"Análisis Mensual"</strong> para que el bot revise tu cartera y te diga qué hacer con el aporte de este mes.</div>;
    if (a.error) return <StatusMsg type="error">Error: {a.error}</StatusMsg>;
    return (
      <div style={{ fontSize: 13, lineHeight: 1.8, animation: "fadeUp 0.4s ease" }}>
        {a.autoevaluacion && <div style={{ background: `${T.purple}08`, borderRadius: 14, padding: 18, marginBottom: 14, border: `1px solid ${T.purple}20`, borderLeft: `3px solid ${T.purple}` }}><div style={{ ...S.label, color: T.purple }}>Autoevaluación del Bot</div><p style={{ margin: 0, color: T.textMuted, fontSize: 12 }}>{a.autoevaluacion}</p></div>}
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
          <div style={{ background: "rgba(3,7,17,0.4)", borderRadius: 14, padding: 18, marginBottom: 14, border: `1px solid ${T.green}15`, display: "flex", gap: 24, flexWrap: "wrap" }}>
            {a.resumen_operaciones.total_a_vender_ars > 0 && <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: T.red, fontWeight: 600, letterSpacing: "1px" }}>LIBERAR (VENTAS)</div><div style={{ fontSize: 20, fontWeight: 800, color: T.red, ...S.mono, marginTop: 4 }}>${a.resumen_operaciones.total_a_vender_ars?.toLocaleString()}</div></div>}
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: T.cyan, fontWeight: 600, letterSpacing: "1px" }}>CAPITAL DISPONIBLE</div><div style={{ fontSize: 20, fontWeight: 800, color: T.cyan, ...S.mono, marginTop: 4 }}>${a.resumen_operaciones.capital_total_para_invertir?.toLocaleString()}</div></div>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: T.green, fontWeight: 600, letterSpacing: "1px" }}>A INVERTIR</div><div style={{ fontSize: 20, fontWeight: 800, color: T.green, ...S.mono, marginTop: 4 }}>${a.resumen_operaciones.total_a_comprar_ars?.toLocaleString()}</div></div>
          </div>
        )}
        {a.nuevas_compras?.map((rec, i) => (
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
          {(a.distribucion_capital || a.distribucion_mensual) && <div style={{ background: "rgba(3,7,17,0.4)", borderRadius: 14, padding: 18, border: `1px solid ${T.border}` }}><div style={{ ...S.label, color: T.purple }}>Distribución del Capital</div><p style={{ color: T.textMuted, fontSize: 12, margin: "8px 0" }}>{(a.distribucion_capital || a.distribucion_mensual).estrategia}</p>{(a.distribucion_capital || a.distribucion_mensual).split?.map((s, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}><span style={{ fontWeight: 700 }}>{s.ticker}</span><span style={{ color: T.green }}>${s.monto?.toLocaleString()} ({s.porcentaje}%)</span></div>)}</div>}
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
    ];
    return (
      <div style={{ animation: "fadeUp 0.4s ease" }}>
        <div style={S.grid()}>
          {stats.map((st, i) => (
            <div key={i} style={{ ...S.card, borderLeft: `3px solid ${st.c}`, background: st.grad, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: `${st.c}06` }} />
              <div style={S.label}>{st.l}</div>
              <div style={{ ...S.value, color: st.c }}>{loading ? <Skeleton height={32} width="60%" /> : st.v}</div>
              {st.sub && <div style={{ fontSize: 11, color: T.textDim, marginTop: 6 }}>{st.sub}</div>}
            </div>
          ))}
        </div>

        {/* AI Section */}
        <div style={{ ...S.card, margin: "24px 0", background: `linear-gradient(135deg, rgba(15,23,42,0.7), rgba(10,26,46,0.7))`, border: `1px solid ${T.green}18`, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: `radial-gradient(circle, ${T.green}08, transparent 70%)`, pointerEvents: "none" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 14, position: "relative" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                <span style={{ background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginRight: 10 }}>◆</span>
                Asesor IA — Claude
              </h3>
              <div style={{ fontSize: 12, color: T.textDim, marginTop: 6 }}>Datos reales + noticias + historial de aciertos/errores</div>
            </div>
            <button onClick={() => { setCapitalToInvest(""); setShowCapitalInput(true); }} disabled={aiLoading || loading} style={{ ...S.btn(), opacity: aiLoading || loading ? 0.5 : 1, minWidth: 220, fontSize: 13 }}>
              {aiLoading ? <span style={{ animation: "pulse 1s infinite" }}>⟳ Analizando mercado...</span> : `Análisis — ${new Date().toLocaleString("es-AR", { month: "long" })}`}
            </button>
          </div>
          {showCapitalInput && !aiLoading && (
            <div style={{ background: "rgba(3,7,17,0.5)", borderRadius: 14, padding: 22, marginBottom: 18, border: `1px solid ${T.green}30` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 10 }}>¿Cuánto capital tenés disponible para invertir hoy?</div>
              <div style={{ fontSize: 12, color: T.textDim, marginBottom: 14, lineHeight: 1.6 }}>Ingresá el monto en pesos argentinos que tenés libre para nuevas compras. Si no tenés capital nuevo, poné 0 y el asesor solo te va a recomendar rebalanceos.</div>
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
          <div style={{ fontSize: 10, color: T.textDark, marginBottom: 14, position: "relative" }}>Podés correr el análisis las veces que quieras con diferentes montos</div>
          {renderAIResponse(aiAnalysis)}
        </div>

        {/* TOP PICKS */}
        <div style={{ ...S.label, fontSize: 13, marginBottom: 4, color: T.textMuted }}>TOP PICKS</div>
        {loading ? <Skeleton height={200} /> : (
          <div style={{ ...S.grid(240), marginTop: 12 }}>
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
                  <ScoreBar value={s.fundScore} label="FUN" color={T.purple} h={4} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  /* ─── RANKING ─── */
  const renderRanking = () => (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
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
        <div style={{ marginLeft: "auto", fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>{filtered.length} <span style={{ fontFamily: T.font }}>CEDEARs</span></div>
      </div>
      {loading ? <div style={S.card}>{[1,2,3].map(i => <div key={i} style={{ marginBottom: 12 }}><Skeleton height={48} /></div>)}</div> : (
        <div style={{ ...S.card, padding: 0, overflow: "auto", borderRadius: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["#", "CEDEAR", "Score", "Señal", "ARS", "TEC", "FUN", "RSI", "1M", "3M", "Horizonte", ""].map((h, i) => <th key={i} style={{ ...S.th, textAlign: i > 1 ? "center" : "left" }}>{h}</th>)}</tr></thead>
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
                  <td style={{ ...S.td, textAlign: "center", color: T.blue, ...S.mono }}>{s.techScore}</td>
                  <td style={{ ...S.td, textAlign: "center", color: T.purple, ...S.mono }}>{s.fundScore}</td>
                  <td style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 12 }}>{item.technical?.indicators?.rsi || "—"}</td>
                  <td style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 12, color: (perf.month1 || 0) >= 0 ? T.green : T.red }}>{perf.month1 != null ? `${perf.month1 >= 0 ? "+" : ""}${perf.month1}%` : "—"}</td>
                  <td style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 12, color: (perf.month3 || 0) >= 0 ? T.green : T.red }}>{perf.month3 != null ? `${perf.month3 >= 0 ? "+" : ""}${perf.month3}%` : "—"}</td>
                  <td style={{ ...S.td, textAlign: "center", fontSize: 10, color: T.textDim }}>{s.horizon}</td>
                  <td style={S.td}><button onClick={e => { e.stopPropagation(); setOpForm({ ticker: c.ticker, shares: 10, priceArs: item.priceARS || 0, notes: "" }); setShowBuyModal(true); }} style={{ ...S.btn("ghost"), padding: "6px 12px", fontSize: 10 }}>Comprar</button></td>
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
        <div style={{ ...S.card, background: `linear-gradient(135deg, rgba(15,23,42,0.7), rgba(10,26,46,0.7))`, padding: 28, marginBottom: 20, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: `${signalColors[s.signal] || T.yellow}08` }} />
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", position: "relative" }}>
            <div style={{ width: 60, height: 60, background: `${signalColors[s.signal] || T.yellow}15`, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: signalColors[s.signal], ...S.mono, border: `1px solid ${signalColors[s.signal] || T.yellow}25` }}>{c.ticker.slice(0, 2)}</div>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, ...S.mono }}>{c.ticker} <span style={{ color: T.textDim, fontWeight: 400, fontSize: 16, fontFamily: T.font }}>{c.name}</span></h2>
              <div style={{ fontSize: 12, color: T.textDim, marginTop: 4 }}>{c.sector} · Ratio {c.ratio}:1 · Beta {quote?.beta?.toFixed(2) || "N/A"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 30, fontWeight: 900, ...S.mono }}>US${quote?.price?.toFixed(2) || "—"}</div>
              {priceARS && <div style={{ fontSize: 15, color: T.cyan, ...S.mono, marginTop: 4 }}>ARS ${priceARS.toLocaleString()}</div>}
              <span style={{ ...S.badge(signalColors[s.signal] || T.yellow), marginTop: 6, display: "inline-flex" }}>{s.signal}</span>
            </div>
          </div>
        </div>

        <div style={S.grid()}>
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

        <div style={{ ...S.grid(120), margin: "20px 0" }}>
          {[{ l: "1D", v: perf.day1 }, { l: "1S", v: perf.week1 }, { l: "1M", v: perf.month1 }, { l: "3M", v: perf.month3 }, { l: "6M", v: perf.month6 }].map((p, i) => (
            <div key={i} style={{ ...S.card, textAlign: "center", padding: 16 }}>
              <div style={{ fontSize: 10, color: T.textDark, letterSpacing: "1.5px", marginBottom: 8 }}>{p.l}</div>
              <div style={{ fontSize: 20, fontWeight: 800, ...S.mono, color: p.v != null ? (p.v >= 0 ? T.green : T.red) : T.textDark }}>{p.v != null ? `${p.v >= 0 ? "+" : ""}${p.v}%` : "—"}</div>
            </div>
          ))}
        </div>

        {chartData.length > 0 && (
          <div style={{ ...S.card, marginBottom: 20 }}>
            <div style={S.label}>Precio 90 días (USD)</div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData}>
                <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.green} stopOpacity={0.2} /><stop offset="100%" stopColor={T.green} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: T.textDark }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: T.textDark }} tickLine={false} axisLine={false} domain={["dataMin", "dataMax"]} />
                <Tooltip contentStyle={{ background: T.bgCardSolid, border: `1px solid ${T.borderLight}`, borderRadius: 10, fontSize: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }} />
                <Area type="monotone" dataKey="precio" stroke={T.green} fill="url(#pg)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

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
            <div style={S.label}>Análisis IA</div>
            <button onClick={() => runAISingle(c.ticker)} disabled={aiSingleLoading} style={{ ...S.btn(), fontSize: 12, padding: "9px 18px", opacity: aiSingleLoading ? 0.5 : 1 }}>{aiSingleLoading ? "Analizando..." : "Analizar con IA"}</button>
          </div>
          {aiSingle && !aiSingle.error ? (
            <div style={{ fontSize: 13 }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <span style={S.badge(signalColors[aiSingle.veredicto] || T.yellow)}>{aiSingle.veredicto}</span>
                <span style={{ fontSize: 12, color: T.textDim }}>Confianza: <strong>{aiSingle.confianza}%</strong></span>
                {aiSingle.precio_objetivo_usd && <span style={{ fontSize: 12, color: T.cyan }}>Target: US${aiSingle.precio_objetivo_usd}</span>}
              </div>
              <p style={{ color: T.textMuted, margin: "0 0 12px", lineHeight: 1.7 }}>{aiSingle.analisis}</p>
              {aiSingle.noticias_relevantes && <div style={{ background: "rgba(3,7,17,0.4)", borderRadius: 12, padding: 16, border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.cyan}` }}><div style={{ fontSize: 10, color: T.cyan, fontWeight: 700, letterSpacing: "1.5px", marginBottom: 8 }}>NOTICIAS</div><p style={{ color: T.textMuted, fontSize: 12, margin: 0, lineHeight: 1.6 }}>{aiSingle.noticias_relevantes}</p></div>}
            </div>
          ) : aiSingle?.error ? <div style={{ color: T.red, fontSize: 12 }}>{aiSingle.error}</div> : <div style={{ color: T.textDim, fontSize: 12, lineHeight: 1.6 }}>Presioná para análisis con noticias en vivo.</div>}
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
        </div>
        <div style={S.grid()}>
          <div style={{ ...S.card, borderLeft: `3px solid ${T.green}`, background: `linear-gradient(135deg, ${T.green}08, transparent)` }}><div style={S.label}>Valor Portfolio</div><div style={{ ...S.value, color: T.green }}>${Math.round(portfolioValue).toLocaleString()}</div></div>
          <div style={{ ...S.card, borderLeft: `3px solid ${T.cyan}` }}><div style={S.label}>Capital</div><input type="number" value={capital} onChange={e => setCapital(parseInt(e.target.value) || 0)} style={{ ...S.input, ...S.value, fontSize: 22, padding: "8px 12px" }} /></div>
          <div style={{ ...S.card, borderLeft: `3px solid ${T.purple}`, background: `linear-gradient(135deg, ${T.purple}08, transparent)` }}><div style={S.label}>Total Patrimonio</div><div style={{ ...S.value, color: T.purple }}>${Math.round(portfolioValue + capital).toLocaleString()}</div></div>
        </div>

        {portfolioDB.summary.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={S.label}>Posiciones Actuales</div>
            <div style={{ ...S.card, padding: 0, overflow: "auto", marginTop: 12, borderRadius: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["CEDEAR", "Cant.", "Precio Prom.", "Valor", "P&L", "Señal"].map((h, i) => <th key={i} style={{ ...S.th, textAlign: i === 0 ? "left" : "center" }}>{h}</th>)}</tr></thead>
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
                      <td style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 12 }}>${Math.round(p.weighted_avg_price).toLocaleString()}</td>
                      <td style={{ ...S.td, textAlign: "center", ...S.mono, fontWeight: 700 }}>${Math.round(val).toLocaleString()}</td>
                      <td style={{ ...S.td, textAlign: "center" }}>
                        <div style={{ ...S.mono, color: pnl >= 0 ? T.green : T.red, fontWeight: 700 }}>{pnl >= 0 ? "+" : ""}${Math.round(pnl).toLocaleString()}</div>
                        <div style={{ fontSize: 10, color: pnl >= 0 ? T.green : T.red }}>({inv > 0 ? ((pnl / inv) * 100).toFixed(1) : 0}%)</div>
                      </td>
                      <td style={{ ...S.td, textAlign: "center" }}>{r && <span style={S.badge(signalColors[r.scores.signal] || T.yellow)}>{r.scores.signal}</span>}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* PIE CHARTS — fixed: no fill override on Pie, custom PieLabel renders <text> with explicit fill */}
        {pieData.length > 1 && (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 24 }}>
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
            <div style={{ ...S.card, padding: 0, overflow: "auto", marginTop: 12, borderRadius: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Fecha", "Tipo", "CEDEAR", "Cant.", "Precio ARS", "Total ARS", "USD", "CCL", "Notas"].map((h, i) => <th key={i} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>{transactions.map((tx, i) => (
                  <tr key={i} style={{ transition: "background 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(148,163,184,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ ...S.td, ...S.mono, fontSize: 11 }}>{tx.date_executed}</td>
                    <td style={S.td}><span style={S.badge(tx.type === "BUY" ? T.green : T.red)}>{tx.type === "BUY" ? "COMPRA" : "VENTA"}</span></td>
                    <td style={{ ...S.td, fontWeight: 800, ...S.mono }}>{tx.ticker}</td>
                    <td style={{ ...S.td, ...S.mono, textAlign: "center" }}>{tx.shares}</td>
                    <td style={{ ...S.td, ...S.mono, textAlign: "right" }}>${Math.round(tx.price_ars).toLocaleString()}</td>
                    <td style={{ ...S.td, ...S.mono, textAlign: "right", fontWeight: 700 }}>${Math.round(tx.total_ars).toLocaleString()}</td>
                    <td style={{ ...S.td, fontSize: 11, textAlign: "center" }}>{tx.price_usd ? `$${tx.price_usd.toFixed(2)}` : "—"}</td>
                    <td style={{ ...S.td, fontSize: 11, textAlign: "center" }}>{tx.ccl_rate ? `$${tx.ccl_rate}` : "—"}</td>
                    <td style={{ ...S.td, fontSize: 11, color: T.textDim }}>{tx.notes || "—"}</td>
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
        <div style={S.grid()}>
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
        <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={handleEvaluateAll} disabled={evalLoading || pending.length === 0} style={{ ...S.btn("blue"), opacity: evalLoading || pending.length === 0 ? 0.5 : 1 }}>{evalLoading ? "Evaluando..." : `Evaluar ${pending.length} Pendientes`}</button>
          {evalResult && !evalResult.error && <span style={{ fontSize: 12, color: T.green }}>Se evaluaron {evalResult.totalEvaluated} predicciones</span>}
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
        {predictions.length > 0 ? (
          <div style={{ marginTop: 28 }}>
            <div style={S.label}>Historial ({predictions.length})</div>
            <div style={{ ...S.card, padding: 0, overflow: "auto", marginTop: 12, borderRadius: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Fecha", "CEDEAR", "Acción", "Conf.", "Score", "Precio USD", "Target", "Resultado", "Cambio Real"].map((h, i) => <th key={i} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>{predictions.map((p, i) => (
                  <tr key={i} style={{ background: p.evaluated ? (p.prediction_correct === 1 ? `${T.green}04` : p.prediction_correct === 0 ? `${T.red}04` : "transparent") : "transparent" }}>
                    <td style={{ ...S.td, ...S.mono, fontSize: 10 }}>{p.prediction_date?.slice(0, 10)}</td>
                    <td style={{ ...S.td, fontWeight: 800, ...S.mono }}>{p.ticker}</td>
                    <td style={S.td}><span style={S.badge(signalColors[p.action] || T.yellow)}>{p.action}</span></td>
                    <td style={{ ...S.td, textAlign: "center", ...S.mono }}>{p.confidence || "—"}%</td>
                    <td style={{ ...S.td, textAlign: "center", ...S.mono }}>{p.score_composite || "—"}</td>
                    <td style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 11 }}>{p.price_usd_at_prediction ? `$${p.price_usd_at_prediction.toFixed(2)}` : "—"}</td>
                    <td style={{ ...S.td, textAlign: "center", ...S.mono, color: T.green }}>{p.target_pct ? `+${p.target_pct}%` : "—"}</td>
                    <td style={{ ...S.td, textAlign: "center" }}>{p.evaluated ? (p.prediction_correct === 1 ? <span style={S.badge(T.green)}>ACERTÓ ✓</span> : p.prediction_correct === 0 ? <span style={S.badge(T.red)}>FALLÓ ✗</span> : <span style={S.badge(T.textDim)}>N/A</span>) : <span style={{ fontSize: 10, color: T.yellow }}>⏳ Pendiente</span>}</td>
                    <td style={{ ...S.td, textAlign: "center", ...S.mono, fontWeight: 700, color: p.actual_change_pct != null ? (p.actual_change_pct >= 0 ? T.green : T.red) : T.textDark }}>{p.actual_change_pct != null ? `${p.actual_change_pct >= 0 ? "+" : ""}${p.actual_change_pct}%` : "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        ) : (
          <div style={{ ...S.card, textAlign: "center", padding: 56, marginTop: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.3 }}>◎</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>Sin predicciones aún</div>
            <div style={{ color: T.textDim, fontSize: 13 }}>Generá un análisis IA desde el Dashboard.</div>
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
                  <span style={{ ...S.mono, fontSize: 14, color: T.cyan }}>{ses.session_date?.slice(0, 16).replace("T", " ")}</span>
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

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div style={{ minHeight: "100vh", background: T.bg, position: "relative", overflow: "hidden" }}>
      {/* Ambient background glow */}
      <div style={{ position: "fixed", top: -200, left: -200, width: 500, height: 500, borderRadius: "50%", background: `radial-gradient(circle, ${T.green}06, transparent 60%)`, pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: -200, right: -200, width: 500, height: 500, borderRadius: "50%", background: `radial-gradient(circle, ${T.purple}05, transparent 60%)`, pointerEvents: "none" }} />

      {renderHeader()}
      <main style={{ maxWidth: 1440, margin: "0 auto", padding: "28px 32px", position: "relative" }}>
        {error && <StatusMsg type="error">{error}<br /><button onClick={loadRanking} style={{ ...S.btn(), marginTop: 10, fontSize: 11 }}>Reintentar</button></StatusMsg>}
        {view === "dashboard" && renderDashboard()}
        {view === "ranking" && renderRanking()}
        {view === "detail" && renderDetail()}
        {view === "operaciones" && renderOperaciones()}
        {view === "predicciones" && renderPredicciones()}
        {view === "historial" && renderHistorial()}
      </main>
      {renderOpModal("buy")}{renderOpModal("sell")}
      <footer style={{ textAlign: "center", padding: "32px 24px", fontSize: 10, color: T.textDark, lineHeight: 2, borderTop: `1px solid ${T.border}`, marginTop: 40, background: "rgba(3,7,17,0.4)" }}>
        ⚠ DISCLAIMER: Herramienta informativa. No es asesoramiento financiero. Consultá un asesor matriculado (CNV).
      </footer>
    </div>
  );
}
