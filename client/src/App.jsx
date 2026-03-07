// ============================================================
// CEDEAR ADVISOR v2 - Main React Application
// With portfolio DB, prediction tracking, and self-learning
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";
import api from "./api";

// ---- THEME ----
const T = {
  bg: "#060a14", bgCard: "#0c1221", bgCardAlt: "#0f172a",
  border: "#1a2235",
  green: "#10b981", greenLight: "#34d399",
  red: "#ef4444", redLight: "#f87171",
  yellow: "#f59e0b", orange: "#f97316",
  blue: "#06b6d4", purple: "#8b5cf6", pink: "#ec4899",
  text: "#e2e8f0", textMuted: "#94a3b8", textDim: "#475569", textDark: "#334155",
  font: "'Inter', -apple-system, sans-serif",
  fontMono: "'JetBrains Mono', 'SF Mono', monospace",
};

const S = {
  card: { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: 22, transition: "all 0.25s ease" },
  label: { fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600, marginBottom: 6 },
  value: { fontSize: 30, fontWeight: 800, color: T.text, fontFamily: T.fontMono, letterSpacing: "-1px" },
  badge: (color) => ({ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", background: `${color}15`, color, border: `1px solid ${color}30` }),
  btn: (v = "primary") => ({ padding: "10px 20px", borderRadius: 10, border: v === "ghost" ? `1px solid ${T.border}` : "none", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: T.font, transition: "all 0.2s", background: v === "primary" ? T.green : v === "danger" ? T.red : v === "blue" ? T.blue : v === "purple" ? T.purple : "transparent", color: v === "primary" || v === "blue" || v === "purple" ? T.bg : v === "danger" ? "#fff" : T.textMuted }),
  input: { width: "100%", padding: "12px 16px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, fontSize: 14, fontFamily: T.font, boxSizing: "border-box", outline: "none" },
  grid: (min = 260) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 16 }),
  th: { textAlign: "left", padding: "12px 10px", fontSize: 9, textTransform: "uppercase", letterSpacing: "1.5px", color: T.textDark, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${T.border}` },
  td: { padding: "12px 10px", borderBottom: `1px solid ${T.border}08`, fontSize: 13 },
  mono: { fontFamily: T.fontMono, fontWeight: 600 },
};

const signalColors = { "COMPRA FUERTE": T.green, COMPRA: T.greenLight, HOLD: T.yellow, "PRECAUCIÓN": T.orange, VENTA: T.red, COMPRAR: T.green, MANTENER: T.yellow, VENDER: T.red, WATCHLIST: T.blue };

function ScoreBar({ value, label, color, h = 5 }) {
  return (<div style={{ marginBottom: 8 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}><span style={{ fontSize: 10, color: T.textDim, fontWeight: 600 }}>{label}</span><span style={{ fontSize: 11, color, fontWeight: 700, fontFamily: T.fontMono }}>{value}</span></div><div style={{ height: h, background: T.bg, borderRadius: h / 2, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(100, Math.max(0, value))}%`, background: `linear-gradient(90deg, ${color}80, ${color})`, borderRadius: h / 2, transition: "width 1s ease" }} /></div></div>);
}
function Skeleton({ width = "100%", height = 20 }) {
  return (<div style={{ width, height, borderRadius: 6, background: `linear-gradient(90deg, ${T.bgCard} 25%, ${T.bgCardAlt} 50%, ${T.bgCard} 75%)`, backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }}><style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style></div>);
}
function Modal({ show, onClose, title, children }) {
  if (!show) return null;
  return (<div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)" }}><div onClick={e => e.stopPropagation()} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 18, padding: 28, width: "92%", maxWidth: 500, maxHeight: "85vh", overflowY: "auto" }}><h3 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 800 }}>{title}</h3>{children}</div></div>);
}
function StatusMsg({ type, children }) {
  const c = type === "success" ? T.green : type === "error" ? T.red : T.blue;
  return (<div style={{ ...S.card, borderColor: `${c}40`, background: `${c}08`, padding: 16, marginBottom: 16 }}><div style={{ color: c, fontSize: 13 }}>{children}</div></div>);
}

// ============================================================
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

  // === HEADER ===
  const renderHeader = () => (
    <header style={{ background: `linear-gradient(180deg, ${T.bgCard}, ${T.bg})`, borderBottom: `1px solid ${T.border}`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(12px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 40, height: 40, background: `linear-gradient(135deg, ${T.green}, ${T.blue})`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900, color: T.bg, fontFamily: T.fontMono }}>₵</div>
        <div><div style={{ fontSize: 17, fontWeight: 800, background: `linear-gradient(90deg, ${T.green}, ${T.blue})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CEDEAR ADVISOR</div><div style={{ fontSize: 9, color: T.textDim, letterSpacing: "2.5px", fontWeight: 600 }}>MOTOR DE INVERSIÓN IA v2</div></div>
      </div>
      <nav style={{ display: "flex", gap: 2, background: T.bg, borderRadius: 10, padding: 3, border: `1px solid ${T.border}`, flexWrap: "wrap" }}>
        {navItems.map(item => (<button key={item.id} onClick={() => nav(item.id)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: view === item.id ? T.green : "transparent", color: view === item.id ? T.bg : T.textDim, fontWeight: 700, fontSize: 10, cursor: "pointer", fontFamily: T.font }}><span style={{ marginRight: 5, opacity: 0.7 }}>{item.icon}</span>{item.label}</button>))}
      </nav>
      <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
        {ccl && <div style={{ color: T.textDim }}>CCL: <span style={{ color: T.blue, fontWeight: 700, ...S.mono }}>${ccl.venta}</span></div>}
        <div style={{ color: T.textDim }}>Perfil: <span style={{ color: T.yellow, fontWeight: 700 }}>MOD-AGRESIVO</span></div>
      </div>
    </header>
  );

  // === AI RESPONSE ===
  const renderAIResponse = (a) => {
    if (!a) return <div style={{ textAlign: "center", padding: 32, color: T.textDim, fontSize: 13 }}>Presioná "Análisis Mensual" para que el bot revise tu cartera y te diga qué hacer con el aporte de este mes.</div>;
    if (a.error) return <StatusMsg type="error">Error: {a.error}</StatusMsg>;
    return (<div style={{ fontSize: 13, lineHeight: 1.8 }}>
      {a.autoevaluacion && <div style={{ background: `${T.purple}10`, borderRadius: 12, padding: 16, marginBottom: 14, border: `1px solid ${T.purple}25` }}><div style={{ ...S.label, color: T.purple }}>Autoevaluación del Bot</div><p style={{ margin: 0, color: T.textMuted, fontSize: 12 }}>{a.autoevaluacion}</p></div>}
      <div style={{ background: T.bg, borderRadius: 12, padding: 18, marginBottom: 14, border: `1px solid ${T.border}` }}><div style={{ ...S.label, color: T.green }}>Resumen de Mercado</div><p style={{ margin: 0, color: T.textMuted }}>{a.resumen_mercado}</p></div>
      {/* Diagnóstico de cartera */}
      {a.diagnostico_cartera && (
        <div style={{ background: `${T.purple}08`, borderRadius: 12, padding: 18, marginBottom: 14, border: `1px solid ${T.purple}20` }}>
          <div style={{ ...S.label, color: T.purple }}>Diagnóstico de tu Cartera</div>
          <p style={{ color: T.textMuted, fontSize: 13, margin: "8px 0" }}>{a.diagnostico_cartera.estado_general}</p>
          {a.diagnostico_cartera.problemas_detectados?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {a.diagnostico_cartera.problemas_detectados.map((p, i) => (
                <div key={i} style={{ fontSize: 12, color: T.red, padding: "3px 0 3px 12px", borderLeft: `2px solid ${T.red}40`, marginBottom: 4 }}>⚠ {p}</div>
              ))}
            </div>
          )}
          {a.diagnostico_cartera.fortalezas?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {a.diagnostico_cartera.fortalezas.map((f, i) => (
                <div key={i} style={{ fontSize: 12, color: T.green, padding: "3px 0 3px 12px", borderLeft: `2px solid ${T.green}40`, marginBottom: 4 }}>✓ {f}</div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Acciones sobre cartera actual */}
      {a.acciones_cartera_actual?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...S.label, color: T.orange, marginBottom: 12 }}>Acciones sobre tu Cartera Actual</div>
          {a.acciones_cartera_actual.map((acc, i) => {
            const actionColors = { MANTENER: T.yellow, AUMENTAR: T.green, REDUCIR: T.orange, VENDER: T.red };
            const color = actionColors[acc.accion] || T.yellow;
            return (
              <div key={i} style={{ background: T.bg, borderRadius: 12, padding: 14, border: `1px solid ${T.border}`, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <span style={S.badge(color)}>{acc.accion}</span>
                <strong style={{ ...S.mono, fontSize: 15 }}>{acc.ticker}</strong>
                <span style={{ fontSize: 12, color: T.textDim }}>({acc.cantidad_actual} CEDEARs)</span>
                {acc.cantidad_ajustar !== 0 && (
                  <span style={{ fontSize: 12, color, fontWeight: 700, ...S.mono }}>
                    {acc.accion === "REDUCIR" || acc.accion === "VENDER" ? `Vender ${Math.abs(acc.cantidad_ajustar)}` : `Comprar +${acc.cantidad_ajustar}`}
                  </span>
                )}
                {acc.urgencia === "alta" && <span style={S.badge(T.red)}>URGENTE</span>}
                <div style={{ width: "100%", fontSize: 12, color: T.textMuted, marginTop: 2 }}>{acc.razon}</div>
              </div>
            );
          })}
        </div>
      )}
      {/* Resumen de operaciones */}
      {a.resumen_operaciones && (
        <div style={{ background: T.bg, borderRadius: 12, padding: 16, marginBottom: 14, border: `1px solid ${T.green}20`, display: "flex", gap: 20, flexWrap: "wrap" }}>
          {a.resumen_operaciones.total_a_vender_ars > 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.red, fontWeight: 600 }}>LIBERAR (VENTAS)</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.red, ...S.mono }}>${a.resumen_operaciones.total_a_vender_ars?.toLocaleString()}</div>
            </div>
          )}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: T.blue, fontWeight: 600 }}>CAPITAL DISPONIBLE (efectivo + ventas)</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.blue, ...S.mono }}>${a.resumen_operaciones.capital_total_para_invertir?.toLocaleString()}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: T.green, fontWeight: 600 }}>A INVERTIR</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.green, ...S.mono }}>${a.resumen_operaciones.total_a_comprar_ars?.toLocaleString()}</div>
          </div>
        </div>
      )}
      {/* Nuevas compras */}
      {a.nuevas_compras?.map((rec, i) => (<div key={i} style={{ background: T.bg, borderRadius: 12, padding: 16, border: `1px solid ${T.border}`, display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={S.badge(signalColors[rec.accion] || T.green)}>{rec.accion}</span>
        <div style={{ flex: 1, minWidth: 200 }}><div style={{ fontWeight: 800, fontSize: 15 }}>{rec.ticker} <span style={{ color: T.textDim, fontWeight: 400, fontSize: 12 }}>{rec.nombre} · {rec.sector}</span></div><p style={{ color: T.textMuted, fontSize: 12, margin: "6px 0 0" }}>{rec.razon}</p></div>
        <div style={{ textAlign: "right", fontSize: 11, color: T.textDim, minWidth: 130 }}><div><strong style={{ color: T.green }}>${rec.monto_total_ars?.toLocaleString()}</strong> ARS</div><div>~{rec.cantidad_cedears} CEDEARs</div>{rec.target_pct && <div style={{ color: T.green }}>Target: +{rec.target_pct}%</div>}{rec.stop_loss_pct && <div style={{ color: T.red }}>Stop: {rec.stop_loss_pct}%</div>}<div style={{ color: T.blue, marginTop: 2 }}>{rec.horizonte}</div></div>
      </div>))}
      {/* Cartera objetivo */}
      {a.cartera_objetivo && (
        <div style={{ background: T.bg, borderRadius: 12, padding: 16, marginBottom: 14, border: `1px solid ${T.blue}20` }}>
          <div style={{ ...S.label, color: T.blue }}>Cartera Objetivo (post-rebalanceo)</div>
          <p style={{ color: T.textMuted, fontSize: 12, margin: "8px 0" }}>{a.cartera_objetivo.descripcion}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {a.cartera_objetivo.posiciones?.map((pos, i) => (
              <div key={i} style={{ background: T.bgCard, borderRadius: 8, padding: "6px 12px", border: `1px solid ${T.border}`, fontSize: 12 }}>
                <strong style={S.mono}>{pos.ticker}</strong>
                <span style={{ color: T.textDim, marginLeft: 6 }}>{pos.sector}</span>
                <span style={{ color: T.green, marginLeft: 6, fontWeight: 700 }}>{pos.porcentaje_target}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={S.grid(280)}>
        {(a.distribucion_capital || a.distribucion_mensual) && <div style={{ background: T.bg, borderRadius: 12, padding: 16, border: `1px solid ${T.border}` }}><div style={{ ...S.label, color: T.purple }}>Distribución del Capital</div><p style={{ color: T.textMuted, fontSize: 12, margin: "8px 0" }}>{(a.distribucion_capital || a.distribucion_mensual).estrategia}</p>{(a.distribucion_capital || a.distribucion_mensual).split?.map((s, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}><span style={{ fontWeight: 700 }}>{s.ticker}</span><span style={{ color: T.green }}>${s.monto?.toLocaleString()} ({s.porcentaje}%)</span></div>)}</div>}
        <div style={{ background: T.bg, borderRadius: 12, padding: 16, border: `1px solid ${T.orange}20` }}><div style={{ ...S.label, color: T.yellow }}>Riesgos</div>{a.riesgos?.map((r, i) => <div key={i} style={{ color: T.textMuted, fontSize: 12, padding: "4px 0 4px 12px", borderLeft: `2px solid ${T.orange}30`, marginBottom: 4 }}>{r}</div>)}{a.proximo_review && <div style={{ marginTop: 10, fontSize: 11, color: T.textDim }}>Review: <strong style={{ color: T.blue }}>{a.proximo_review}</strong></div>}</div>
      </div>
    </div>);
  };

  // === DASHBOARD ===
  const renderDashboard = () => (<div>
    <div style={S.grid()}>{[{ l: "Capital Disponible", v: `$${capital.toLocaleString()}`, sub: "+$1M/mes", c: T.green }, { l: "Portfolio (BD)", v: `$${Math.round(portfolioValue).toLocaleString()}`, sub: `${portfolioDB.summary.length} posiciones`, c: T.blue }, { l: "Dólar CCL", v: ccl ? `$${ccl.venta}` : "—", sub: "", c: T.purple }, { l: "Top Pick", v: topPicks[0]?.cedear?.ticker || "—", sub: topPicks[0] ? `Score ${topPicks[0].scores.composite}` : "", c: T.yellow }].map((st, i) => (<div key={i} style={{ ...S.card, borderLeft: `3px solid ${st.c}` }}><div style={S.label}>{st.l}</div><div style={{ ...S.value, color: st.c }}>{loading ? <Skeleton height={32} width="60%" /> : st.v}</div>{st.sub && <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>{st.sub}</div>}</div>))}</div>
    <div style={{ ...S.card, margin: "20px 0", background: `linear-gradient(135deg, ${T.bgCard}, #0a1a2e)`, border: `1px solid ${T.green}25` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div><h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}><span style={{ color: T.green, marginRight: 8 }}>◆</span>Asesor IA — Claude</h3><div style={{ fontSize: 12, color: T.textDim, marginTop: 4 }}>Datos reales + noticias + historial de aciertos/errores</div></div>
        <button onClick={() => { setCapitalToInvest(""); setShowCapitalInput(true); }} disabled={aiLoading || loading} style={{ ...S.btn(), opacity: aiLoading || loading ? 0.5 : 1, minWidth: 220 }}>{aiLoading ? "⟳ Analizando mercado..." : `Análisis — ${new Date().toLocaleString("es-AR", { month: "long" })}`}</button>
      </div>
      {showCapitalInput && !aiLoading && (
        <div style={{ background: T.bg, borderRadius: 12, padding: 20, marginBottom: 16, border: `1px solid ${T.green}40` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>¿Cuánto capital tenés disponible para invertir hoy?</div>
          <div style={{ fontSize: 11, color: T.textDim, marginBottom: 12 }}>Ingresá el monto en pesos argentinos que tenés libre para nuevas compras. Si no tenés capital nuevo, poné 0 y el asesor solo te va a recomendar rebalanceos.</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.textDim, fontWeight: 700 }}>$</span>
              <input type="number" value={capitalToInvest} onChange={e => setCapitalToInvest(e.target.value)} placeholder="Ej: 1000000" style={{ ...S.input, paddingLeft: 30, fontSize: 18, fontFamily: T.fontMono, fontWeight: 700 }} autoFocus onKeyDown={e => { if (e.key === "Enter" && capitalToInvest !== "") runAI(parseFloat(capitalToInvest) || 0); }} />
            </div>
            <button onClick={() => runAI(parseFloat(capitalToInvest) || 0)} disabled={capitalToInvest === ""} style={{ ...S.btn(), opacity: capitalToInvest === "" ? 0.4 : 1, minWidth: 140 }}>Iniciar Análisis</button>
            <button onClick={() => setShowCapitalInput(false)} style={S.btn("ghost")}>Cancelar</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {[0, 100000, 500000, 1000000, 2000000, 5000000].map(amt => (
              <button key={amt} onClick={() => setCapitalToInvest(String(amt))} style={{ ...S.btn("ghost"), fontSize: 11, padding: "6px 12px" }}>${amt.toLocaleString()}</button>
            ))}
          </div>
        </div>
      )}
      <div style={{ fontSize: 10, color: T.textDim, marginBottom: 12 }}>Podés correr el análisis las veces que quieras con diferentes montos</div>
      {renderAIResponse(aiAnalysis)}
    </div>
    <div style={S.label}>TOP PICKS</div>
    {loading ? <Skeleton height={200} /> : <div style={{ ...S.grid(220), marginTop: 12 }}>{topPicks.map(item => { const c = item.cedear, s = item.scores, perf = item.technical?.indicators?.performance; return (<div key={c.ticker} onClick={() => { loadDetail(c.ticker); setView("detail"); }} style={{ ...S.card, cursor: "pointer", padding: 18, position: "relative" }} onMouseEnter={e => e.currentTarget.style.borderColor = T.green} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}><div style={{ position: "absolute", top: 12, right: 12 }}><span style={S.badge(signalColors[s.signal] || T.yellow)}>{s.signal}</span></div><div style={{ fontSize: 20, fontWeight: 900, ...S.mono }}>{c.ticker}</div><div style={{ fontSize: 11, color: T.textDim }}>{c.name}</div><div style={{ fontSize: 9, color: T.textDark }}>{c.sector}</div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", margin: "14px 0" }}><div><div style={{ fontSize: 32, fontWeight: 900, ...S.mono, letterSpacing: "-2px", color: s.composite >= 62 ? T.green : s.composite >= 45 ? T.yellow : T.red }}>{s.composite}</div><div style={{ fontSize: 9, color: T.textDark, letterSpacing: "1px" }}>SCORE</div></div><div style={{ textAlign: "right" }}>{item.priceARS && <div style={{ fontSize: 13, fontWeight: 700, ...S.mono }}>${item.priceARS.toLocaleString()} <span style={{ fontSize: 9, color: T.textDim }}>ARS</span></div>}{perf?.month1 != null && <div style={{ fontSize: 11, color: perf.month1 >= 0 ? T.green : T.red, ...S.mono }}>{perf.month1 >= 0 ? "+" : ""}{perf.month1}%</div>}</div></div><ScoreBar value={s.techScore} label="TEC" color={T.blue} h={4} /><ScoreBar value={s.fundScore} label="FUN" color={T.purple} h={4} /></div>); })}</div>}
  </div>);

  // === RANKING ===
  const renderRanking = () => (<div>
    <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}><span style={{ fontSize: 10, color: T.textDark, fontWeight: 600, letterSpacing: "1px", marginRight: 4, lineHeight: "30px" }}>SECTOR:</span>{sectors.map(sec => <button key={sec} onClick={() => setFilterSector(sec)} style={{ padding: "7px 14px", borderRadius: 20, cursor: "pointer", fontFamily: T.font, border: `1px solid ${filterSector === sec ? T.green : T.border}`, background: filterSector === sec ? `${T.green}15` : "transparent", color: filterSector === sec ? T.green : T.textDim, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{sec}</button>)}</div>
    <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center" }}><span style={{ fontSize: 10, color: T.textDark, fontWeight: 600, marginRight: 4 }}>ORDENAR:</span>{[{ id: "composite", l: "Score" }, { id: "technical", l: "Técnico" }, { id: "fundamental", l: "Fund." }, { id: "change", l: "1M" }].map(s => <button key={s.id} onClick={() => setSortBy(s.id)} style={{ padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: T.font, border: `1px solid ${sortBy === s.id ? T.blue : T.border}`, background: sortBy === s.id ? `${T.blue}15` : "transparent", color: sortBy === s.id ? T.blue : T.textDim, fontSize: 10, fontWeight: 600 }}>{s.l}{sortBy === s.id ? " ▼" : ""}</button>)}<div style={{ marginLeft: "auto", fontSize: 11, color: T.textDim }}>{filtered.length} CEDEARs</div></div>
    {loading ? <div style={S.card}>{[1,2,3].map(i => <div key={i} style={{ marginBottom: 12 }}><Skeleton height={48} /></div>)}</div> : <div style={{ ...S.card, padding: 0, overflow: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["#", "CEDEAR", "Score", "Señal", "ARS", "TEC", "FUN", "RSI", "1M", "3M", "Horizonte", ""].map((h, i) => <th key={i} style={{ ...S.th, textAlign: i > 1 ? "center" : "left" }}>{h}</th>)}</tr></thead><tbody>{filtered.map((item, idx) => { const c = item.cedear, s = item.scores, perf = item.technical?.indicators?.performance || {}; return (<tr key={c.ticker} onClick={() => { loadDetail(c.ticker); setView("detail"); }} style={{ cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = `${T.green}08`} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><td style={{ ...S.td, ...S.mono, color: T.textDark, fontSize: 11 }}>{idx + 1}</td><td style={S.td}><div style={{ fontWeight: 800, fontSize: 14, ...S.mono }}>{c.ticker}</div><div style={{ fontSize: 10, color: T.textDim }}>{c.name}</div></td><td style={{ ...S.td, textAlign: "center" }}><span style={{ fontSize: 18, fontWeight: 900, ...S.mono, color: s.composite >= 62 ? T.green : s.composite >= 45 ? T.yellow : T.red }}>{s.composite}</span></td><td style={{ ...S.td, textAlign: "center" }}><span style={S.badge(signalColors[s.signal] || T.yellow)}>{s.signal}</span></td><td style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 12 }}>{item.priceARS ? `$${item.priceARS.toLocaleString()}` : "—"}</td><td style={{ ...S.td, textAlign: "center", color: T.blue, ...S.mono }}>{s.techScore}</td><td style={{ ...S.td, textAlign: "center", color: T.purple, ...S.mono }}>{s.fundScore}</td><td style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 12 }}>{item.technical?.indicators?.rsi || "—"}</td><td style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 12, color: (perf.month1 || 0) >= 0 ? T.green : T.red }}>{perf.month1 != null ? `${perf.month1 >= 0 ? "+" : ""}${perf.month1}%` : "—"}</td><td style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 12, color: (perf.month3 || 0) >= 0 ? T.green : T.red }}>{perf.month3 != null ? `${perf.month3 >= 0 ? "+" : ""}${perf.month3}%` : "—"}</td><td style={{ ...S.td, textAlign: "center", fontSize: 10, color: T.textDim }}>{s.horizon}</td><td style={S.td}><button onClick={e => { e.stopPropagation(); setOpForm({ ticker: c.ticker, shares: 10, priceArs: item.priceARS || 0, notes: "" }); setShowBuyModal(true); }} style={{ ...S.btn("ghost"), padding: "5px 10px", fontSize: 10 }}>Comprar</button></td></tr>); })}</tbody></table></div>}
  </div>);

  // === DETAIL ===
  const renderDetail = () => {
    if (detailLoading) return <div style={S.card}><Skeleton height={300} /></div>;
    if (!detail) return <StatusMsg type="error">No se pudo cargar.</StatusMsg>;
    const { cedear: c, quote, history, technical: tech, fundamentals: fund, scores: s, priceARS } = detail;
    const perf = tech?.indicators?.performance || {};
    const chartData = (history || []).slice(-90).map(p => ({ date: p.date.slice(5), precio: p.close }));
    return (<div>
      <button onClick={() => nav("ranking")} style={{ ...S.btn("ghost"), marginBottom: 18 }}>← Volver</button>
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 28, flexWrap: "wrap" }}>
        <div style={{ width: 56, height: 56, background: `${signalColors[s.signal] || T.yellow}18`, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: signalColors[s.signal], ...S.mono }}>{c.ticker.slice(0, 2)}</div>
        <div style={{ flex: 1 }}><h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, ...S.mono }}>{c.ticker} <span style={{ color: T.textDim, fontWeight: 400, fontSize: 16, fontFamily: T.font }}>{c.name}</span></h2><div style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>{c.sector} · Ratio {c.ratio}:1 · Beta {quote?.beta?.toFixed(2) || "N/A"}</div></div>
        <div style={{ textAlign: "right" }}><div style={{ fontSize: 28, fontWeight: 900, ...S.mono }}>US${quote?.price?.toFixed(2) || "—"}</div>{priceARS && <div style={{ fontSize: 14, color: T.blue, ...S.mono }}>ARS ${priceARS.toLocaleString()}</div>}<span style={S.badge(signalColors[s.signal] || T.yellow)}>{s.signal}</span></div>
      </div>
      <div style={S.grid()}><div style={S.card}><div style={S.label}>Score Compuesto</div><div style={{ fontSize: 48, fontWeight: 900, ...S.mono, letterSpacing: "-3px", color: s.composite >= 62 ? T.green : s.composite >= 45 ? T.yellow : T.red }}>{s.composite}<span style={{ fontSize: 16, color: T.textDark }}>/100</span></div><div style={{ marginTop: 16 }}><ScoreBar value={s.techScore} label="Técnico (35%)" color={T.blue} /><ScoreBar value={s.fundScore} label="Fundamental (40%)" color={T.purple} /><ScoreBar value={s.sentScore} label="Sentimiento (25%)" color={T.yellow} /></div><div style={{ marginTop: 12, fontSize: 11, color: T.textDim }}>Horizonte: <strong style={{ color: T.text }}>{s.horizon}</strong></div></div>
        <div style={S.card}><div style={S.label}>Técnicos</div>{[{ l: "RSI", v: tech?.indicators?.rsi }, { l: "MACD", v: tech?.indicators?.macd?.macd }, { l: "SMA 20", v: tech?.indicators?.sma20?.toFixed(2) }, { l: "SMA 50", v: tech?.indicators?.sma50?.toFixed(2) }, { l: "ATR", v: tech?.indicators?.atr }].map((it, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}><span style={{ color: T.textDim }}>{it.l}</span><span style={S.mono}>{it.v ?? "—"}</span></div>)}</div>
        <div style={S.card}><div style={S.label}>Fundamentales</div>{[{ l: "P/E", v: fund?.data?.pe?.toFixed(1) }, { l: "PEG", v: fund?.data?.pegRatio?.toFixed(2) }, { l: "EPS Growth", v: fund?.data?.epsGrowth != null ? `${fund.data.epsGrowth.toFixed(1)}%` : null, g: (fund?.data?.epsGrowth || 0) > 0 }, { l: "Div Yield", v: fund?.data?.divYield ? `${fund.data.divYield.toFixed(2)}%` : "0%" }, { l: "Target USD", v: fund?.data?.analystTarget ? `$${fund.data.analystTarget.toFixed(2)}` : null }, { l: "Consenso", v: fund?.data?.recommendationKey }].map((it, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}><span style={{ color: T.textDim }}>{it.l}</span><span style={{ ...S.mono, color: it.g !== undefined ? (it.g ? T.green : T.red) : T.text }}>{it.v ?? "—"}</span></div>)}</div>
      </div>
      <div style={{ ...S.grid(120), margin: "16px 0" }}>{[{ l: "1D", v: perf.day1 }, { l: "1S", v: perf.week1 }, { l: "1M", v: perf.month1 }, { l: "3M", v: perf.month3 }, { l: "6M", v: perf.month6 }].map((p, i) => <div key={i} style={{ ...S.card, textAlign: "center", padding: 14 }}><div style={{ fontSize: 10, color: T.textDark, letterSpacing: "1px", marginBottom: 6 }}>{p.l}</div><div style={{ fontSize: 18, fontWeight: 800, ...S.mono, color: p.v != null ? (p.v >= 0 ? T.green : T.red) : T.textDark }}>{p.v != null ? `${p.v >= 0 ? "+" : ""}${p.v}%` : "—"}</div></div>)}</div>
      {chartData.length > 0 && <div style={{ ...S.card, marginBottom: 16 }}><div style={S.label}>Precio 90 días (USD)</div><ResponsiveContainer width="100%" height={250}><AreaChart data={chartData}><defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.green} stopOpacity={0.25} /><stop offset="100%" stopColor={T.green} stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke={T.border} /><XAxis dataKey="date" tick={{ fontSize: 10, fill: T.textDark }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 10, fill: T.textDark }} tickLine={false} axisLine={false} domain={["dataMin", "dataMax"]} /><Tooltip contentStyle={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }} /><Area type="monotone" dataKey="precio" stroke={T.green} fill="url(#pg)" strokeWidth={2} dot={false} /></AreaChart></ResponsiveContainer></div>}
      {tech?.signals?.length > 0 && <div style={{ ...S.card, marginBottom: 16 }}><div style={S.label}>Señales Técnicas</div><div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>{tech.signals.map((sig, i) => <span key={i} style={S.badge(sig.type === "bullish" ? T.green : sig.type === "bearish" ? T.red : T.yellow)}>{sig.type === "bullish" ? "▲" : "▼"} {sig.text}</span>)}</div></div>}
      <div style={{ ...S.card, marginBottom: 16, border: `1px solid ${T.green}20` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><div style={S.label}>Análisis IA</div><button onClick={() => runAISingle(c.ticker)} disabled={aiSingleLoading} style={{ ...S.btn(), fontSize: 11, padding: "8px 16px", opacity: aiSingleLoading ? 0.5 : 1 }}>{aiSingleLoading ? "..." : "Analizar con IA"}</button></div>
        {aiSingle && !aiSingle.error ? <div style={{ fontSize: 13 }}><div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}><span style={S.badge(signalColors[aiSingle.veredicto] || T.yellow)}>{aiSingle.veredicto}</span><span style={{ fontSize: 12, color: T.textDim }}>Confianza: <strong>{aiSingle.confianza}%</strong></span>{aiSingle.precio_objetivo_usd && <span style={{ fontSize: 12, color: T.blue }}>Target: US${aiSingle.precio_objetivo_usd}</span>}</div><p style={{ color: T.textMuted, margin: "0 0 10px" }}>{aiSingle.analisis}</p>{aiSingle.noticias_relevantes && <div style={{ background: T.bg, borderRadius: 10, padding: 14, border: `1px solid ${T.border}` }}><div style={{ fontSize: 10, color: T.blue, fontWeight: 600, marginBottom: 6 }}>NOTICIAS</div><p style={{ color: T.textMuted, fontSize: 12, margin: 0 }}>{aiSingle.noticias_relevantes}</p></div>}</div> : aiSingle?.error ? <div style={{ color: T.red, fontSize: 12 }}>{aiSingle.error}</div> : <div style={{ color: T.textDim, fontSize: 12 }}>Presioná para análisis con noticias en vivo.</div>}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => { setOpForm({ ticker: c.ticker, shares: 10, priceArs: priceARS || 0, notes: "" }); setShowBuyModal(true); }} style={S.btn()}>Registrar Compra</button>
        <button onClick={() => { setOpForm({ ticker: c.ticker, shares: 10, priceArs: priceARS || 0, notes: "" }); setShowSellModal(true); }} style={S.btn("danger")}>Registrar Venta</button>
      </div>
    </div>);
  };

  // === OPERACIONES ===
  const renderOperaciones = () => {
    const COLORS = [T.green, T.blue, T.purple, T.yellow, T.orange, T.red, T.greenLight, T.pink];
    const pieData = portfolioDB.summary.map(p => { const r = ranking.find(x => x.cedear?.ticker === p.ticker); return { name: p.ticker, value: r?.priceARS ? r.priceARS * p.total_shares : p.weighted_avg_price * p.total_shares }; });
    return (<div>
      {opMsg && <StatusMsg type={opMsg.type}>{opMsg.text}</StatusMsg>}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}><button onClick={() => { setOpForm({ ticker: "", shares: 10, priceArs: 0, notes: "" }); setShowBuyModal(true); }} style={S.btn()}>+ Registrar Compra</button><button onClick={() => { setOpForm({ ticker: "", shares: 10, priceArs: 0, notes: "" }); setShowSellModal(true); }} style={S.btn("danger")}>- Registrar Venta</button></div>
      <div style={S.grid()}><div style={{ ...S.card, borderLeft: `3px solid ${T.green}` }}><div style={S.label}>Valor Portfolio</div><div style={{ ...S.value, color: T.green }}>${Math.round(portfolioValue).toLocaleString()}</div></div><div style={{ ...S.card, borderLeft: `3px solid ${T.blue}` }}><div style={S.label}>Capital</div><input type="number" value={capital} onChange={e => setCapital(parseInt(e.target.value) || 0)} style={{ ...S.input, ...S.value, fontSize: 22, padding: "8px 12px" }} /></div><div style={{ ...S.card, borderLeft: `3px solid ${T.purple}` }}><div style={S.label}>Total Patrimonio</div><div style={{ ...S.value, color: T.purple }}>${Math.round(portfolioValue + capital).toLocaleString()}</div></div></div>
      {portfolioDB.summary.length > 0 && <div style={{ marginTop: 20 }}><div style={S.label}>Posiciones Actuales</div><div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 12 }}>
        <div style={{ ...S.card, padding: 0, overflow: "auto", flex: 2, minWidth: 400 }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["CEDEAR", "Cant.", "Precio Prom.", "Valor", "P&L", "Señal"].map((h, i) => <th key={i} style={{ ...S.th, textAlign: i === 0 ? "left" : "center" }}>{h}</th>)}</tr></thead><tbody>{portfolioDB.summary.map(p => { const r = ranking.find(x => x.cedear?.ticker === p.ticker); const curr = r?.priceARS || p.weighted_avg_price; const val = curr * p.total_shares; const inv = p.weighted_avg_price * p.total_shares; const pnl = val - inv; return (<tr key={p.ticker} style={{ cursor: "pointer" }} onClick={() => { loadDetail(p.ticker); setView("detail"); }}><td style={S.td}><span style={{ fontWeight: 800, ...S.mono }}>{p.ticker}</span><div style={{ fontSize: 10, color: T.textDim }}>Desde {p.first_bought}</div></td><td style={{ ...S.td, textAlign: "center", ...S.mono }}>{p.total_shares}</td><td style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 12 }}>${Math.round(p.weighted_avg_price).toLocaleString()}</td><td style={{ ...S.td, textAlign: "center", ...S.mono, fontWeight: 700 }}>${Math.round(val).toLocaleString()}</td><td style={{ ...S.td, textAlign: "center" }}><div style={{ ...S.mono, color: pnl >= 0 ? T.green : T.red }}>{pnl >= 0 ? "+" : ""}${Math.round(pnl).toLocaleString()}</div><div style={{ fontSize: 10, color: pnl >= 0 ? T.green : T.red }}>({inv > 0 ? ((pnl / inv) * 100).toFixed(1) : 0}%)</div></td><td style={{ ...S.td, textAlign: "center" }}>{r && <span style={S.badge(signalColors[r.scores.signal] || T.yellow)}>{r.scores.signal}</span>}</td></tr>); })}</tbody></table></div>
        {pieData.length > 1 && <div style={{ ...S.card, flex: 1, minWidth: 250, display: "flex", flexDirection: "column", alignItems: "center" }}><div style={S.label}>Distribución</div><ResponsiveContainer width="100%" height={200}><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>{pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={v => `$${Math.round(v).toLocaleString()}`} /></PieChart></ResponsiveContainer></div>}
      </div></div>}
      {transactions.length > 0 && <div style={{ marginTop: 24 }}><div style={S.label}>Historial de Operaciones</div><div style={{ ...S.card, padding: 0, overflow: "auto", marginTop: 12 }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["Fecha", "Tipo", "CEDEAR", "Cant.", "Precio ARS", "Total ARS", "USD", "CCL", "Notas"].map((h, i) => <th key={i} style={S.th}>{h}</th>)}</tr></thead><tbody>{transactions.map((tx, i) => (<tr key={i}><td style={{ ...S.td, ...S.mono, fontSize: 11 }}>{tx.date_executed}</td><td style={S.td}><span style={S.badge(tx.type === "BUY" ? T.green : T.red)}>{tx.type === "BUY" ? "COMPRA" : "VENTA"}</span></td><td style={{ ...S.td, fontWeight: 800, ...S.mono }}>{tx.ticker}</td><td style={{ ...S.td, ...S.mono, textAlign: "center" }}>{tx.shares}</td><td style={{ ...S.td, ...S.mono, textAlign: "right" }}>${Math.round(tx.price_ars).toLocaleString()}</td><td style={{ ...S.td, ...S.mono, textAlign: "right", fontWeight: 700 }}>${Math.round(tx.total_ars).toLocaleString()}</td><td style={{ ...S.td, fontSize: 11, textAlign: "center" }}>{tx.price_usd ? `$${tx.price_usd.toFixed(2)}` : "—"}</td><td style={{ ...S.td, fontSize: 11, textAlign: "center" }}>{tx.ccl_rate ? `$${tx.ccl_rate}` : "—"}</td><td style={{ ...S.td, fontSize: 11, color: T.textDim }}>{tx.notes || "—"}</td></tr>))}</tbody></table></div></div>}
    </div>);
  };

  // === PREDICCIONES ===
  const renderPredicciones = () => {
    const pending = predictions.filter(p => !p.evaluated);
    return (<div>
      <div style={S.grid()}>{[{ l: "Precisión", v: performance?.accuracy != null ? `${performance.accuracy}%` : "—", c: performance?.accuracy >= 60 ? T.green : performance?.accuracy >= 40 ? T.yellow : T.red, sub: `${performance?.correct || 0}/${performance?.total || 0} aciertos` }, { l: "Retorno Real Prom.", v: performance?.avgActualReturn != null ? `${performance.avgActualReturn >= 0 ? "+" : ""}${performance.avgActualReturn}%` : "—", c: (performance?.avgActualReturn || 0) >= 0 ? T.green : T.red, sub: `vs ${performance?.avgTargetReturn || "—"}% predicho` }, { l: "Mejor Pick", v: performance?.bestPick ? `${performance.bestPick.ticker} +${performance.bestPick.actual_change_pct}%` : "—", c: T.green, sub: "" }, { l: "Pendientes", v: String(pending.length), c: T.yellow, sub: "" }].map((st, i) => <div key={i} style={{ ...S.card, borderLeft: `3px solid ${st.c}` }}><div style={S.label}>{st.l}</div><div style={{ ...S.value, color: st.c, fontSize: 24 }}>{st.v}</div>{st.sub && <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>{st.sub}</div>}</div>)}</div>
      <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={handleEvaluateAll} disabled={evalLoading || pending.length === 0} style={{ ...S.btn("blue"), opacity: evalLoading || pending.length === 0 ? 0.5 : 1 }}>{evalLoading ? "Evaluando..." : `Evaluar ${pending.length} Pendientes`}</button>
        {evalResult && !evalResult.error && <span style={{ fontSize: 12, color: T.green }}>Se evaluaron {evalResult.totalEvaluated} predicciones</span>}
      </div>
      {performance?.byAction?.length > 0 && <div style={{ ...S.card, marginTop: 20 }}><div style={S.label}>Performance por Acción</div><div style={{ ...S.grid(160), marginTop: 12 }}>{performance.byAction.map((a, i) => <div key={i} style={{ background: T.bg, borderRadius: 10, padding: 14, border: `1px solid ${T.border}`, textAlign: "center" }}><span style={S.badge(signalColors[a.action] || T.yellow)}>{a.action}</span><div style={{ marginTop: 10, ...S.mono, fontSize: 18, fontWeight: 800, color: a.total > 0 && a.correct / a.total >= 0.5 ? T.green : T.red }}>{a.total > 0 ? Math.round((a.correct / a.total) * 100) : 0}%</div><div style={{ fontSize: 10, color: T.textDim }}>{a.correct}/{a.total}</div></div>)}</div></div>}
      {predictions.length > 0 ? <div style={{ marginTop: 24 }}><div style={S.label}>Historial ({predictions.length})</div><div style={{ ...S.card, padding: 0, overflow: "auto", marginTop: 12 }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["Fecha", "CEDEAR", "Acción", "Conf.", "Score", "Precio USD", "Target", "Resultado", "Cambio Real"].map((h, i) => <th key={i} style={S.th}>{h}</th>)}</tr></thead><tbody>{predictions.map((p, i) => (<tr key={i} style={{ background: p.evaluated ? (p.prediction_correct === 1 ? `${T.green}05` : p.prediction_correct === 0 ? `${T.red}05` : "transparent") : "transparent" }}><td style={{ ...S.td, ...S.mono, fontSize: 10 }}>{p.prediction_date?.slice(0, 10)}</td><td style={{ ...S.td, fontWeight: 800, ...S.mono }}>{p.ticker}</td><td style={S.td}><span style={S.badge(signalColors[p.action] || T.yellow)}>{p.action}</span></td><td style={{ ...S.td, textAlign: "center", ...S.mono }}>{p.confidence || "—"}%</td><td style={{ ...S.td, textAlign: "center", ...S.mono }}>{p.score_composite || "—"}</td><td style={{ ...S.td, textAlign: "center", ...S.mono, fontSize: 11 }}>{p.price_usd_at_prediction ? `$${p.price_usd_at_prediction.toFixed(2)}` : "—"}</td><td style={{ ...S.td, textAlign: "center", ...S.mono, color: T.green }}>{p.target_pct ? `+${p.target_pct}%` : "—"}</td><td style={{ ...S.td, textAlign: "center" }}>{p.evaluated ? (p.prediction_correct === 1 ? <span style={S.badge(T.green)}>ACERTÓ ✓</span> : p.prediction_correct === 0 ? <span style={S.badge(T.red)}>FALLÓ ✗</span> : <span style={S.badge(T.textDim)}>N/A</span>) : <span style={{ fontSize: 10, color: T.yellow }}>⏳ Pendiente</span>}</td><td style={{ ...S.td, textAlign: "center", ...S.mono, fontWeight: 700, color: p.actual_change_pct != null ? (p.actual_change_pct >= 0 ? T.green : T.red) : T.textDark }}>{p.actual_change_pct != null ? `${p.actual_change_pct >= 0 ? "+" : ""}${p.actual_change_pct}%` : "—"}</td></tr>))}</tbody></table></div></div>
      : <div style={{ ...S.card, textAlign: "center", padding: 48, marginTop: 20 }}><div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>◎</div><div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Sin predicciones aún</div><div style={{ color: T.textDim, fontSize: 13 }}>Generá un análisis IA desde el Dashboard.</div></div>}
    </div>);
  };

  // === HISTORIAL IA ===
  const renderHistorial = () => (<div>
    <div style={S.label}>Sesiones de Análisis IA</div>
    {analysisSessions.length === 0 ? <div style={{ ...S.card, textAlign: "center", padding: 48, marginTop: 12 }}><div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>◉</div><div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Sin sesiones</div><div style={{ color: T.textDim, fontSize: 13 }}>Cada análisis IA se guarda acá automáticamente.</div></div>
    : <div style={{ marginTop: 12 }}>{analysisSessions.map((ses, i) => (<div key={i} style={{ ...S.card, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}><div><span style={{ ...S.mono, fontSize: 13, color: T.blue }}>{ses.session_date?.slice(0, 16).replace("T", " ")}</span><span style={{ fontSize: 11, color: T.textDim, marginLeft: 12 }}>CCL: ${ses.ccl_rate}</span></div><div style={{ fontSize: 11, color: T.textDim }}>Capital: <strong style={{ color: T.green }}>${ses.capital_ars?.toLocaleString()}</strong></div></div>
      {ses.market_summary && <div style={{ background: T.bg, borderRadius: 10, padding: 14, marginBottom: 10, border: `1px solid ${T.border}` }}><div style={{ ...S.label, color: T.green, marginBottom: 6 }}>Resumen</div><p style={{ margin: 0, color: T.textMuted, fontSize: 12 }}>{ses.market_summary}</p></div>}
      {ses.full_response?.nuevas_compras && <div><div style={{ ...S.label, marginBottom: 8 }}>Nuevas Compras</div><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{ses.full_response.nuevas_compras.map((rec, j) => <div key={j} style={{ background: T.bg, borderRadius: 8, padding: "8px 14px", border: `1px solid ${T.border}`, fontSize: 12 }}><span style={S.badge(signalColors[rec.accion] || T.green)}>{rec.accion}</span><strong style={{ marginLeft: 8, ...S.mono }}>{rec.ticker}</strong>{rec.target_pct && <span style={{ color: T.green, marginLeft: 8 }}>+{rec.target_pct}%</span>}</div>)}</div></div>}
      {ses.risks?.length > 0 && <div style={{ marginTop: 10 }}><div style={{ ...S.label, color: T.yellow, marginBottom: 6 }}>Riesgos</div>{ses.risks.map((r, j) => <div key={j} style={{ fontSize: 11, color: T.textDim, paddingLeft: 10, borderLeft: `2px solid ${T.orange}30`, marginBottom: 3 }}>{r}</div>)}</div>}
    </div>))}</div>}
  </div>);

  // === MODALS ===
  const renderOpModal = (type) => (<Modal show={type === "buy" ? showBuyModal : showSellModal} onClose={() => type === "buy" ? setShowBuyModal(false) : setShowSellModal(false)} title={<>{type === "buy" ? "Registrar Compra" : "Registrar Venta"} <span style={{ color: T.green }}>{opForm.ticker}</span></>}>
    <div style={{ marginBottom: 14 }}><label style={{ ...S.label, display: "block", marginBottom: 8 }}>Ticker</label><input value={opForm.ticker} onChange={e => setOpForm({ ...opForm, ticker: e.target.value.toUpperCase() })} placeholder="Ej: AAPL" style={S.input} /></div>
    <div style={{ marginBottom: 14 }}><label style={{ ...S.label, display: "block", marginBottom: 8 }}>Cantidad</label><input type="number" value={opForm.shares} onChange={e => setOpForm({ ...opForm, shares: e.target.value })} style={S.input} /></div>
    <div style={{ marginBottom: 14 }}><label style={{ ...S.label, display: "block", marginBottom: 8 }}>Precio por CEDEAR (ARS)</label><input type="number" value={opForm.priceArs} onChange={e => setOpForm({ ...opForm, priceArs: e.target.value })} style={S.input} /></div>
    <div style={{ marginBottom: 20 }}><label style={{ ...S.label, display: "block", marginBottom: 8 }}>Notas</label><input value={opForm.notes} onChange={e => setOpForm({ ...opForm, notes: e.target.value })} placeholder="Opcional" style={S.input} /></div>
    {opForm.shares > 0 && opForm.priceArs > 0 && <div style={{ background: T.bg, borderRadius: 10, padding: 14, marginBottom: 20, border: `1px solid ${T.border}` }}><div style={{ fontSize: 11, color: T.textDim }}>Total:</div><div style={{ fontSize: 22, fontWeight: 800, color: type === "buy" ? T.green : T.red, ...S.mono }}>${(parseInt(opForm.shares) * parseFloat(opForm.priceArs)).toLocaleString()} ARS</div></div>}
    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><button onClick={() => type === "buy" ? setShowBuyModal(false) : setShowSellModal(false)} style={S.btn("ghost")}>Cancelar</button><button onClick={type === "buy" ? handleBuy : handleSell} style={S.btn(type === "buy" ? "primary" : "danger")}>{type === "buy" ? "Confirmar Compra" : "Confirmar Venta"}</button></div>
  </Modal>);

  // === MAIN ===
  return (<div style={{ minHeight: "100vh", background: T.bg }}>
    {renderHeader()}
    <main style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 28px" }}>
      {error && <StatusMsg type="error">{error}<br /><button onClick={loadRanking} style={{ ...S.btn(), marginTop: 10, fontSize: 11 }}>Reintentar</button></StatusMsg>}
      {view === "dashboard" && renderDashboard()}
      {view === "ranking" && renderRanking()}
      {view === "detail" && renderDetail()}
      {view === "operaciones" && renderOperaciones()}
      {view === "predicciones" && renderPredicciones()}
      {view === "historial" && renderHistorial()}
    </main>
    {renderOpModal("buy")}{renderOpModal("sell")}
    <footer style={{ textAlign: "center", padding: "28px 20px", fontSize: 10, color: T.textDark, lineHeight: 1.8, borderTop: `1px solid ${T.border}`, marginTop: 32 }}>⚠ DISCLAIMER: Herramienta informativa. No es asesoramiento financiero. Consultá un asesor matriculado (CNV).</footer>
  </div>);
}
