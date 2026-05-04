// ============================================================
// CEDEAR ADVISOR v3 — Refactored
// ============================================================
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import api, { auth } from "./api";
import { T, globalAnimations, gridBg } from "./theme";
import { ConfirmModal, StatusMsg } from "./components/common";
import LoginScreen from "./components/LoginScreen";
import Onboarding from "./components/Onboarding";
import Header from "./components/Header";
import DashboardView from "./views/DashboardView";
import RankingView from "./views/RankingView";
import OperationsView from "./views/OperationsView";
import PredictionsView from "./views/PredictionsView";
import BenchmarksView from "./views/BenchmarksView";
import BacktestView from "./views/BacktestView";
import HistoryView from "./views/HistoryView";
import PerformanceView from "./views/PerformanceView";
import DetailView from "./views/DetailView";
import PaperTradingView from "./views/PaperTradingView";
import TrackRecordView from "./views/TrackRecordView";
import TradingSignalsView from "./views/TradingSignalsView";
import RiskMetricsView from "./views/RiskMetricsView";
import AdherenceView from "./views/AdherenceView";
import ToastSystem, { showToast, enrichTradeToast } from "./components/ToastSystem";
import TradeAlertModal, { showTradeAlert } from "./components/TradeAlertModal";
import CommandPalette from "./components/CommandPalette";
import SystemHealthView from "./views/SystemHealthView";
import PortfolioEvolutionView from "./views/PortfolioEvolutionView";
import InvestmentReadinessView from "./views/InvestmentReadinessView";
import IntradayMonitorView from "./views/IntradayMonitorView";
import GoalView from "./views/GoalView";

/* ─── RESPONSIVE STYLES ─── */
const responsiveStyles = `
  .ca-main-content { margin-left: 232px; }
  @media (max-width: 900px) {
    .ca-main-content { margin-left: 0 !important; }
  }
  @media (max-width: 768px) {
    .ca-stat-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 12px !important; }
    .ca-stat-grid > div { padding: 18px !important; }
    .ca-picks-grid { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)) !important; gap: 12px !important; }
    .ca-table-wrap table { font-size: 12px !important; }
    .ca-table-wrap th, .ca-table-wrap td { padding: 9px 8px !important; }
    .ca-pie-wrap { flex-direction: column !important; }
    .ca-ops-summary { grid-template-columns: 1fr !important; gap: 12px !important; }
  }
  @media (max-width: 480px) {
    .ca-stat-grid { grid-template-columns: 1fr !important; }
    .ca-picks-grid { grid-template-columns: 1fr 1fr !important; }
  }
  .ca-hide-mobile {
    display: table-cell;
  }
  @media (max-width: 900px) {
    .ca-hide-mobile { display: none !important; }
  }
`;

/* ═══════════════════════════════════════════════════════════
   ERROR BOUNDARY
   ═══════════════════════════════════════════════════════════ */
export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("[ErrorBoundary]", error, info?.componentStack); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 460, textAlign: "center", animation: "fadeUp 0.4s ease" }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: "rgba(255,51,102,0.1)", border: "1px solid rgba(255,51,102,0.25)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            marginBottom: 20,
          }}>
            <AlertTriangle size={28} color={T.red} strokeWidth={1.8} />
          </div>
          <div style={{ fontWeight: 800, fontSize: 20, color: T.red, marginBottom: 10, letterSpacing: "-0.3px" }}>Algo salió mal</div>
          <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 28, background: "rgba(255,51,102,0.05)", padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(255,51,102,0.18)", textAlign: "left", wordBreak: "break-word", fontFamily: "monospace", lineHeight: 1.6 }}>
            {this.state.error?.message || "Error desconocido"}
          </div>
          <button onClick={() => this.setState({ hasError: false, error: null })} style={{ background: "rgba(255,51,102,0.12)", color: T.red, border: "1px solid rgba(255,51,102,0.35)", borderRadius: 12, padding: "11px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: T.font, transition: "all 0.2s" }}>Reintentar</button>
        </div>
      </div>
    );
  }
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
  const [portfolioDB, setPortfolioDB] = useState({ summary: [], positions: [] });
  const [capital, setCapital] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [analysisSessions, setAnalysisSessions] = useState([]);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [cooldownInfo, setCooldownInfo] = useState(null);
  const [benchmarks, setBenchmarks] = useState(null);
  const [benchLoading, setBenchLoading] = useState(false);
  const [capitalHistory, setCapitalHistory] = useState([]);
  const [backtest, setBacktest] = useState(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [btMonths, setBtMonths] = useState(6);
  const [btDeposit, setBtDeposit] = useState(1000000);
  const [btProfile, setBtProfile] = useState(profile);
  const [btPicks, setBtPicks] = useState(4);
  const [confirmState, setConfirmState] = useState(null);

  const [virtualPortfolio, setVirtualPortfolio] = useState({ positions: [] });
  const [virtualRegret, setVirtualRegret] = useState(null);
  const [paperConfig, setPaperConfig] = useState({ autoSyncEnabled: false });
  const [tradingSignals, setTradingSignals] = useState([]);
  const [tradingSignalsLoading, setTradingSignalsLoading] = useState(false);
  const [riskMetrics, setRiskMetrics] = useState(null);
  const [riskMetricsLoading, setRiskMetricsLoading] = useState(false);
  const [adherenceStats, setAdherenceStats] = useState(null);
  const [adherenceLoading, setAdherenceLoading] = useState(false);
  const [filterSector, setFilterSector] = useState("Todos");
  const [sortBy, setSortBy] = useState("composite");
  const [showCapitalInput, setShowCapitalInput] = useState(false);
  const [capitalToInvest, setCapitalToInvest] = useState("");
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [systemHealth, setSystemHealth] = useState(null);
  const [systemReadiness, setSystemReadiness] = useState(null);
  const [executionAssistant, setExecutionAssistant] = useState(null);
  const [executionTickets, setExecutionTickets] = useState([]);
  const [intradayMonitor, setIntradayMonitor] = useState(null);
  const [intradayMonitorLoading, setIntradayMonitorLoading] = useState(false);
  const [portfolioEvolution, setPortfolioEvolution] = useState(null);
  const [evolutionDays, setEvolutionDays] = useState(180);
  const [trackRecord, setTrackRecord] = useState(null);
  const [trackRecordDays, setTrackRecordDays] = useState(365);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // ── Logout listener ──
  useEffect(() => {
    const onLogout = () => setLoggedIn(false);
    window.addEventListener("cedear:logout", onLogout);
    return () => window.removeEventListener("cedear:logout", onLogout);
  }, []);

  // ── Error toast ──
  useEffect(() => {
    if (error) showToast({ message: error, type: "error" });
  }, [error]);

  // ── Responsive + animation styles inject once ──
  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.textContent = responsiveStyles + globalAnimations;
    document.head.appendChild(styleEl);
    return () => document.head.removeChild(styleEl);
  }, []);

  // ── Data loaders ──
  const loadRanking = useCallback(async () => {
    setLoading(true); setError(null);
    try { const d = await api.getRanking({ profile }); setRanking(d.ranking || []); setCcl(d.ccl); }
    catch (e) { setError(`Error: ${e.message}`); }
    finally { setLoading(false); }
  }, [profile]);

  const loadPortfolioDB = useCallback(async () => { try { setPortfolioDB(await api.getPortfolioDB()); } catch (e) { console.error(e); } }, []);
  const loadCapital = useCallback(async () => { try { const hist = await api.getCapitalHistory(1); if (hist.length > 0) setCapital(hist[0].capital_available_ars); } catch (e) { console.error(e); } }, []);
  const loadTransactions = useCallback(async () => { try { setTransactions(await api.getTransactions()); } catch (e) { console.error(e); } }, []);
  const loadPredictions = useCallback(async () => { try { setPredictions(await api.getPredictions()); } catch (e) { console.error(e); } }, []);
  const loadPerformance = useCallback(async () => { try { setPerformance(await api.getPerformance(60)); } catch (e) { console.error(e); } }, []);
  const loadSessions = useCallback(async () => { try { setAnalysisSessions(await api.getAnalysisSessions(10)); } catch (e) { console.error(e); } }, []);
  const loadBenchmarks = useCallback(async () => { setBenchLoading(true); try { setBenchmarks(await api.getBenchmarks()); } catch (e) { console.error(e); } finally { setBenchLoading(false); } }, []);
  const loadCapitalHistory = useCallback(async () => { try { setCapitalHistory(await api.getCapitalHistory(90)); } catch (e) { console.error(e); } }, []);
  const runBacktestSim = useCallback(async () => { setBacktestLoading(true); try { setBacktest(await api.getBacktest(btMonths, btDeposit, btProfile, btPicks)); } catch (e) { console.error(e); } finally { setBacktestLoading(false); } }, [btMonths, btDeposit, btProfile, btPicks]);

  const loadVirtualPortfolio = useCallback(async () => { try { setVirtualPortfolio(await api.getVirtualPortfolio()); } catch (e) { console.error(e); } }, []);
  const loadVirtualRegret = useCallback(async () => { try { setVirtualRegret(await api.getVirtualPortfolioRegret()); } catch (e) { console.error(e); } }, []);
  const loadTradingSignals = useCallback(async () => { setTradingSignalsLoading(true); try { setTradingSignals((await api.getTradingSignals(null, profile))?.signals || []); } catch (e) { console.error(e); } finally { setTradingSignalsLoading(false); } }, [profile]);
  const loadRiskMetrics = useCallback(async () => { setRiskMetricsLoading(true); try { setRiskMetrics(await api.getRiskMetrics()); } catch (e) { console.error(e); } finally { setRiskMetricsLoading(false); } }, []);
  const loadAdherenceStats = useCallback(async () => { setAdherenceLoading(true); try { setAdherenceStats(await api.getAdherenceStats()); } catch (e) { console.error(e); } finally { setAdherenceLoading(false); } }, []);
  const loadSystemHealth = useCallback(async () => { try { setSystemHealth(await api.getSystemHealth()); } catch (e) { console.error(e); } }, []);
  const loadSystemReadiness = useCallback(async () => { try { setSystemReadiness(await api.getSystemReadiness()); } catch (e) { console.error(e); } }, []);
  const loadExecutionAssistant = useCallback(async () => {
    try {
      const data = await api.getExecutionAssistant();
      setExecutionAssistant(data);
      setExecutionTickets(data?.summary ? await api.getExecutionTickets("open", 20).then((res) => res.tickets || []) : []);
    } catch (e) { console.error(e); }
  }, []);
  const loadIntradayMonitor = useCallback(async () => {
    setIntradayMonitorLoading(true);
    try { setIntradayMonitor(await api.getIntradayMonitorStatus()); } catch (e) { console.error(e); } finally { setIntradayMonitorLoading(false); }
  }, []);
  const loadPortfolioEvolution = useCallback(async () => { try { setPortfolioEvolution(await api.getPortfolioEvolution(evolutionDays)); } catch (e) { console.error(e); } }, [evolutionDays]);
  const loadTrackRecord = useCallback(async () => { try { setTrackRecord(await api.getTrackRecord(trackRecordDays)); } catch (e) { console.error(e); } }, [trackRecordDays]);
  const loadPaperConfig = useCallback(async () => { try { setPaperConfig(await api.getPaperTradingConfig()); } catch (e) { console.error(e); } }, []);

  useEffect(() => { if (loggedIn) { loadRanking(); loadPortfolioDB(); loadCapital(); } }, [profile, loggedIn, loadRanking, loadPortfolioDB, loadCapital]);
  useEffect(() => {
    if (!loggedIn) return;
    const interval = setInterval(() => { if (view === "ranking" || view === "dashboard") loadRanking(); }, 300000);
    return () => clearInterval(interval);
  }, [loggedIn, view, loadRanking]);
  useEffect(() => {
    if (!loggedIn) return;
    if (view === "operaciones") { loadTransactions(); loadPortfolioDB(); loadExecutionAssistant(); }
    if (view === "predicciones") { loadPredictions(); loadPerformance(); }
    if (view === "historial") loadSessions();
    if (view === "benchmarks") loadBenchmarks();
    if (view === "performance") { loadCapitalHistory(); loadPortfolioDB(); }
    if (view === "paper") { loadVirtualPortfolio(); loadVirtualRegret(); loadPaperConfig(); }
    if (view === "trading") loadTradingSignals();
    if (view === "risk") loadRiskMetrics();
    if (view === "adherence") loadAdherenceStats();
    if (view === "health") { loadSystemHealth(); loadSystemReadiness(); }
    if (view === "monitor") loadIntradayMonitor();
    if (view === "readiness") { loadSystemReadiness(); loadExecutionAssistant(); }
    if (view === "dashboard") loadExecutionAssistant();
    if (view === "evolution") loadPortfolioEvolution();
    if (view === "trackrecord") loadTrackRecord();
  }, [view, loggedIn, loadTransactions, loadPortfolioDB, loadPredictions, loadPerformance, loadSessions, loadBenchmarks, loadCapitalHistory, loadVirtualPortfolio, loadVirtualRegret, loadPaperConfig, loadTradingSignals, loadRiskMetrics, loadAdherenceStats, loadSystemHealth, loadSystemReadiness, loadExecutionAssistant, loadIntradayMonitor, loadPortfolioEvolution, loadTrackRecord]);
  useEffect(() => {
    if (loggedIn && view === "dashboard" && portfolioDB.summary.length > 0 && !benchmarks) { loadBenchmarks(); loadCapitalHistory(); }
  }, [view, portfolioDB, loggedIn, benchmarks, loadBenchmarks, loadCapitalHistory]);
  useEffect(() => {
    if (loggedIn && (view === "dashboard" || view === "health") && !systemReadiness) {
      loadSystemReadiness();
    }
  }, [loggedIn, view, systemReadiness, loadSystemReadiness]);
  useEffect(() => {
    if (!loggedIn || view !== "monitor") return;
    const interval = setInterval(loadIntradayMonitor, 20000);
    return () => clearInterval(interval);
  }, [loggedIn, view, loadIntradayMonitor]);

  // ── Toast alert polling ──
  const TRADE_ALERT_CODES = ["portfolio_drawdown", "drawdown_alert", "take_profit", "stop_loss", "significant_move"];
  const isTradeAlert = (code) => TRADE_ALERT_CODES.some((prefix) => String(code || "").startsWith(prefix));

  useEffect(() => {
    if (!loggedIn) return;
    const pollAlerts = async () => {
      try {
        const data = await api.getRecentAlerts(5);
        if (data.alerts && data.alerts.length > 0) {
          data.alerts.forEach((alert) => {
            if (isTradeAlert(alert.code)) {
              // Critical trade alerts go to the modal
              if (alert.level === "critical" || alert.level === "warning") {
                showTradeAlert(alert);
              } else {
                // Non-critical trade alerts get enriched toasts
                const enriched = enrichTradeToast(alert);
                showToast({ message: enriched.message, type: enriched.type, duration: enriched.duration, title: enriched.title, icon: enriched.icon, pct: enriched.pct });
              }
            } else {
              showToast({ message: alert.message, type: alert.level === "critical" ? "error" : alert.level === "warning" ? "warning" : "info" });
            }
          });
        }
      } catch { /* ignore polling errors */ }
    };
    pollAlerts();
    const interval = setInterval(pollAlerts, 30000);
    return () => clearInterval(interval);
  }, [loggedIn]);

  const runAI = useCallback(async (investCapital) => {
    setAiLoading(true); setShowCapitalInput(false); setCooldownInfo(null);
    try {
      const d = await api.aiAnalyze(investCapital, profile);
      setAiAnalysis(d.analysis);
      if (d.investmentReadiness) setSystemReadiness(d.investmentReadiness);
      if (d.executionAssistant) setExecutionAssistant(d.executionAssistant);
      if (Array.isArray(d.tradeTickets)) setExecutionTickets(d.tradeTickets);
      const pickCount = d.analysis?.decision_mensual?.picks_activos?.length || 0;
      if (d.analysis?.sin_cambios_necesarios) {
        showToast({ message: "Análisis completado: cartera alineada, no hay cambios necesarios", type: "success" });
      } else {
        showToast({ message: `Análisis completado: ${pickCount} pick${pickCount !== 1 ? "s" : ""} activo${pickCount !== 1 ? "s" : ""} recomendado${pickCount !== 1 ? "s" : ""}`, type: "success" });
      }
    }
    catch (e) {
      const msg = e.message || "";
      if (msg.includes("Esper") || msg.includes("minuto")) { setCooldownInfo({ message: msg }); showToast({ message: msg, type: "warning" }); }
      else { setAiAnalysis({ error: msg }); showToast({ message: `Error en análisis: ${msg}`, type: "error" }); }
    } finally { setAiLoading(false); }
  }, [profile]);

  const loadDetail = useCallback(async (ticker) => {
    setSelectedTicker(ticker); setDetailLoading(true);
    try { setDetail(await api.getCedear(ticker, profile)); }
    catch (e) { console.error(e); }
    finally { setDetailLoading(false); }
  }, [profile]);

  // useMemo hooks must be before any conditional return
  const sectors = useMemo(() => ["Todos", ...new Set(ranking.map((r) => r.cedear?.sector).filter(Boolean))], [ranking]);
  const filtered = useMemo(() => ranking.filter((r) => filterSector === "Todos" || r.cedear?.sector === filterSector).sort((a, b) => {
    if (sortBy === "composite") return b.scores.composite - a.scores.composite;
    if (sortBy === "technical") return b.scores.techScore - a.scores.techScore;
    if (sortBy === "fundamental") return b.scores.fundScore - a.scores.fundScore;
    if (sortBy === "change") return (b.technical?.indicators?.performance?.month1 || 0) - (a.technical?.indicators?.performance?.month1 || 0);
    return 0;
  }), [ranking, filterSector, sortBy]);
  const topPicks = useMemo(() => ranking.slice(0, 8), [ranking]);
  const portfolioValue = useMemo(() => portfolioDB.summary.reduce((s, p) => {
    const r = ranking.find((x) => x.cedear?.ticker === p.ticker);
    return s + (r?.priceARS ? r.priceARS * p.total_shares : p.weighted_avg_price * p.total_shares);
  }, 0), [portfolioDB.summary, ranking]);

  if (!loggedIn) return <LoginScreen onAuth={() => { setLoggedIn(true); if (!localStorage.getItem("cedear_onboarding_seen")) setShowOnboarding(true); }} />;

  // ─── RENDER VIEWS ───
  const renderDashboard = () => (
    <DashboardView
      portfolioValue={portfolioValue}
      capital={capital}
      portfolioCount={portfolioDB.summary.length}
      showCapitalInput={showCapitalInput}
      setShowCapitalInput={setShowCapitalInput}
      capitalToInvest={capitalToInvest}
      setCapitalToInvest={setCapitalToInvest}
      runAI={runAI}
      aiLoading={aiLoading}
      cooldownInfo={cooldownInfo}
      aiAnalysis={aiAnalysis}
      systemReadiness={systemReadiness}
      topPicks={topPicks}
      setView={setView}
      executionAssistant={executionAssistant}
      executionTickets={executionTickets}
      onRefreshExecutionTickets={loadExecutionAssistant}
      onConfirmState={setConfirmState}
    />
  );

  const renderRanking = () => (
    <RankingView
      sectors={sectors}
      filterSector={filterSector}
      setFilterSector={setFilterSector}
      sortBy={sortBy}
      setSortBy={setSortBy}
      loading={loading}
      filtered={filtered}
      loadDetail={loadDetail}
    />
  );

  const renderDetail = () => (
    <DetailView selectedTicker={selectedTicker} detailLoading={detailLoading} detail={detail} setSelectedTicker={setSelectedTicker} portfolioSummary={portfolioDB.summary} />
  );

  const renderOperations = () => (
    <OperationsView
      portfolioDB={portfolioDB}
      ranking={ranking}
      transactions={transactions}
      onReconciled={async () => {
        await Promise.all([
          loadPortfolioDB(),
          loadTransactions(),
          loadSystemReadiness(),
          loadExecutionAssistant(),
          loadAdherenceStats(),
        ]);
      }}
    />
  );

  const renderPredictions = () => (
    <PredictionsView predictions={predictions} performance={performance} />
  );

  const renderBenchmarks = () => (
    <BenchmarksView benchLoading={benchLoading} benchmarks={benchmarks} capitalHistory={capitalHistory} />
  );

  const renderBacktest = () => (
    <BacktestView
      btMonths={btMonths} setBtMonths={setBtMonths}
      btProfile={btProfile} setBtProfile={setBtProfile}
      runBacktestSim={runBacktestSim} backtestLoading={backtestLoading}
      backtest={backtest}
    />
  );

  const renderHistory = () => (
    <HistoryView analysisSessions={analysisSessions} />
  );

  const renderPerformance = () => (
    <PerformanceView performance={performance} />
  );

  const renderPaper = () => (
    <PaperTradingView
      virtualPortfolio={virtualPortfolio}
      virtualRegret={virtualRegret}
      ranking={ranking}
      aiAnalysis={aiAnalysis}
      onSync={loadVirtualPortfolio}
      onReset={async () => { try { await api.resetVirtualPortfolio([]); loadVirtualPortfolio(); } catch (e) { console.error(e); } }}
      autoSyncEnabled={paperConfig.autoSyncEnabled}
      onToggleAutoSync={async () => { try { const next = !paperConfig.autoSyncEnabled; await api.setPaperTradingConfig(next); setPaperConfig({ autoSyncEnabled: next }); } catch (e) { console.error(e); } }}
    />
  );

  const renderTrading = () => (
    <TradingSignalsView signals={tradingSignals} loading={tradingSignalsLoading} />
  );

  const renderRisk = () => (
    <RiskMetricsView metrics={riskMetrics} loading={riskMetricsLoading} />
  );

  const renderAdherence = () => (
    <AdherenceView stats={adherenceStats} loading={adherenceLoading} />
  );

  const renderSystemHealth = () => <SystemHealthView health={systemHealth} readiness={systemReadiness} />;
  const renderIntradayMonitor = () => <IntradayMonitorView data={intradayMonitor} loading={intradayMonitorLoading} onRefresh={loadIntradayMonitor} />;
  const renderReadiness = () => (
    <InvestmentReadinessView
      readiness={systemReadiness}
      executionAssistant={executionAssistant}
      onRefresh={async () => {
        await Promise.all([loadSystemReadiness(), loadExecutionAssistant()]);
      }}
    />
  );
  const renderEvolution = () => <PortfolioEvolutionView data={portfolioEvolution} days={evolutionDays} onDaysChange={setEvolutionDays} />;
  const renderTrackRecord = () => <TrackRecordView data={trackRecord} days={trackRecordDays} onDaysChange={setTrackRecordDays} />;

  const views = {
    dashboard: renderDashboard,
    ranking: renderRanking,
    operaciones: renderOperations,
    paper: renderPaper,
    trading: renderTrading,
    adherence: renderAdherence,
    risk: renderRisk,
    predicciones: renderPredictions,
    benchmarks: renderBenchmarks,
    backtest: renderBacktest,
    historial: renderHistory,
    performance: renderPerformance,
    health: renderSystemHealth,
    monitor: renderIntradayMonitor,
    readiness: renderReadiness,
    evolution: renderEvolution,
    trackrecord: renderTrackRecord,
    goal: () => <GoalView portfolioValue={portfolioValue} capital={capital} ccl={ccl} />,
  };

  const nav = (v) => { setView(v); setSelectedTicker(null); };

  return (
    <ErrorBoundary>
      <ToastSystem />
      <TradeAlertModal />
      <CommandPalette onNavigate={nav} ranking={ranking} />
      {showOnboarding && <Onboarding onComplete={() => setShowOnboarding(false)} />}
      <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text, ...gridBg }}>
        <Header view={view} setView={nav} profile={profile} setProfile={setProfile} ccl={ccl} readiness={systemReadiness} />
        <main className="ca-main-content" style={{ marginTop: 64, minHeight: "calc(100vh - 64px)" }}>
          {error && (
            <div style={{ padding: "20px 32px", maxWidth: 1440 }}>
              <StatusMsg type="error">{error}</StatusMsg>
            </div>
          )}
          <div key={view} style={{ animation: "fadeUp 0.35s cubic-bezier(0.4,0,0.2,1)" }}>
            {selectedTicker && view === "ranking" ? renderDetail() : (views[view] || renderDashboard)()}
          </div>
        </main>
        <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
      </div>
    </ErrorBoundary>
  );
}
