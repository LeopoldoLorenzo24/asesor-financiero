import React, { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck, Brain, Trophy, TrendingUp, Activity, CalendarCheck, FileCheck, CheckCircle, Gauge, Target, CheckCircle2, XCircle, AlertTriangle, Lock, Unlock, Zap } from "lucide-react";
import { T, S } from "../theme";
import {   GlassCard, MetricCard, PulseDot, ScoreBar, SectionHeader, Skeleton, StatusMsg, BlockerList } from "../components/common";
import api, { auth } from "../api";

function pct(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(digits)}%`;
}

function fmt(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toFixed(digits);
}

function stageColor(stage) {
  if (stage === "full") return T.green;
  if (stage === "scaled") return T.cyan;
  if (stage === "cautious") return T.yellow;
  if (stage === "pilot") return T.orange;
  if (stage === "minimal") return T.red;
  return T.red;
}

function regimeLabel(regime) {
  if (regime === "bullish") return "Alcista";
  if (regime === "bearish") return "Bajista";
  if (regime === "sideways") return "Lateral";
  return "Desconocido";
}

export default function InvestmentReadinessView({ readiness, executionAssistant, onRefresh }) {
  const [twoFactorStatus, setTwoFactorStatus] = useState({ loading: true, enabled: false });
  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  const [disableCode, setDisableCode] = useState("");
  const [twoFactorError, setTwoFactorError] = useState(null);
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [policySelection, setPolicySelection] = useState({ overlayKey: "system_default", deploymentMode: "system_auto" });
  const [policyReason, setPolicyReason] = useState("");
  const [policyPreview, setPolicyPreview] = useState(null);
  const [policyAuditLog, setPolicyAuditLog] = useState([]);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyError, setPolicyError] = useState(null);
  const [policySuccess, setPolicySuccess] = useState(null);
  const [brokerSettings, setBrokerSettings] = useState({ current: { brokerKey: "default" }, catalog: [] });
  const [selectedBrokerKey, setSelectedBrokerKey] = useState("default");
  const [brokerBusy, setBrokerBusy] = useState(false);
  const [brokerError, setBrokerError] = useState(null);
  const [brokerSuccess, setBrokerSuccess] = useState(null);
  const [preflightStatus, setPreflightStatus] = useState(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [preflightError, setPreflightError] = useState(null);
  const [preflightSuccess, setPreflightSuccess] = useState(null);
  const [assistantMode, setAssistantMode] = useState("manual_only");
  const [assistantMaxAlerts, setAssistantMaxAlerts] = useState(2);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantError, setAssistantError] = useState(null);
  const [assistantSuccess, setAssistantSuccess] = useState(null);

  const loadTwoFactorStatus = useCallback(async () => {
    setTwoFactorError(null);
    try {
      const status = await auth.get2FAStatus();
      setTwoFactorStatus({ loading: false, enabled: !!status.enabled });
    } catch (err) {
      setTwoFactorStatus({ loading: false, enabled: false });
      setTwoFactorError(err.message);
    }
  }, []);

  useEffect(() => {
    loadTwoFactorStatus();
  }, [loadTwoFactorStatus]);

  const loadBrokerSettings = useCallback(async () => {
    setBrokerError(null);
    try {
      const data = await api.getBrokerSettings();
      setBrokerSettings(data);
      setSelectedBrokerKey(data.current?.brokerKey || "default");
    } catch (err) {
      setBrokerError(err.message);
    }
  }, []);

  const loadPolicySettings = useCallback(async () => {
    setPolicyError(null);
    try {
      const data = await api.getPolicySettings();
      setPolicyAuditLog(data.auditLog || []);
      setPolicySelection({
        overlayKey: data.currentSelection?.overlayKey || "system_default",
        deploymentMode: data.currentSelection?.deploymentMode || "system_auto",
      });
    } catch (err) {
      setPolicyError(err.message);
    }
  }, []);

  const loadPreflightStatus = useCallback(async () => {
    setPreflightError(null);
    try {
      const data = await api.getPreflightStatus();
      setPreflightStatus(data);
    } catch (err) {
      setPreflightError(err.message);
    }
  }, []);

  useEffect(() => {
    if (!readiness) return;
    setPolicySelection({
      overlayKey: readiness.policySelection?.overlayKey || "system_default",
      deploymentMode: readiness.policySelection?.deploymentMode || "system_auto",
    });
    loadPolicySettings();
    loadBrokerSettings();
    loadPreflightStatus();
  }, [readiness, loadPolicySettings, loadBrokerSettings, loadPreflightStatus]);

  useEffect(() => {
    if (!executionAssistant?.settings) return;
    setAssistantMode(executionAssistant.settings.suggestionMode || "manual_only");
    setAssistantMaxAlerts(executionAssistant.settings.maxCriticalAlertsPerDay || 2);
  }, [executionAssistant]);

  if (!readiness) {
    return (
      <div className="ca-main" style={{ padding: "32px", maxWidth: 1240, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
        <SectionHeader title="Investment Readiness" subtitle="Gobernanza de despliegue y evidencia real del sistema" />
        <Skeleton width="100%" height={420} />
      </div>
    );
  }

  const { scorePct, grade, mode, summary, blockers = [], degradationSignals = [], marketRegime, capitalPolicy, evidence, rules = [], generatedAt } = readiness;
  const policyColor = stageColor(capitalPolicy?.stage);
  const regimeColor = marketRegime?.regime === "bullish" ? T.green : marketRegime?.regime === "bearish" ? T.red : T.yellow;
  const risk = evidence?.riskMetrics || {};
  const alphaStats = evidence?.alphaStats || {};
  const benchmark = evidence?.benchmark;
  const trackRecord = evidence?.trackRecord || {};
  const evidenceQuality = evidence?.evidenceQuality || {};
  const twoFactorRulePassed = readiness.rules?.find((r) => r.name === "two_factor_authentication")?.passed;
  const policyCatalog = readiness.policyCatalog || { overlays: [], deploymentModes: [] };
  const currentPolicySelection = readiness.policySelection || {};
  const currentPolicyChanged = (
    currentPolicySelection.overlayKey !== policySelection.overlayKey ||
    currentPolicySelection.deploymentMode !== policySelection.deploymentMode
  );
  const policyCooldown = readiness.policyCooldown || { active: false, remainingDays: 0 };

  const handleEnable2FA = async () => {
    setTwoFactorBusy(true);
    setTwoFactorError(null);
    try {
      const setup = await auth.enable2FA();
      setTwoFactorSetup(setup);
      await loadTwoFactorStatus();
    } catch (err) {
      setTwoFactorError(err.message);
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!disableCode || disableCode.length < 6) return;
    setTwoFactorBusy(true);
    setTwoFactorError(null);
    try {
      await auth.disable2FA(disableCode);
      setDisableCode("");
      setTwoFactorSetup(null);
      await loadTwoFactorStatus();
    } catch (err) {
      setTwoFactorError(err.message);
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handlePreviewPolicy = async () => {
    setPolicyBusy(true);
    setPolicyError(null);
    setPolicySuccess(null);
    try {
      const preview = await api.previewPolicySettings(policySelection.overlayKey, policySelection.deploymentMode);
      setPolicyPreview(preview);
      setPolicyAuditLog(preview.auditLog || policyAuditLog);
    } catch (err) {
      setPolicyError(err.message);
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleApplyPolicy = async () => {
    setPolicyBusy(true);
    setPolicyError(null);
    setPolicySuccess(null);
    try {
      const result = await api.applyPolicySettings(policySelection.overlayKey, policySelection.deploymentMode, policyReason);
      setPolicyPreview(null);
      setPolicyReason("");
      setPolicyAuditLog(result.auditLog || []);
      setPolicySuccess("Política aplicada y auditada correctamente.");
      if (onRefresh) await onRefresh();
      await loadPolicySettings();
    } catch (err) {
      setPolicyError(err.message);
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleSaveBroker = async () => {
    setBrokerBusy(true);
    setBrokerError(null);
    setBrokerSuccess(null);
    try {
      const result = await api.saveBrokerSettings(selectedBrokerKey);
      setBrokerSettings((prev) => ({ ...prev, current: result.current }));
      setBrokerSuccess("Broker de costos actualizado.");
      if (onRefresh) await onRefresh();
      await loadBrokerSettings();
    } catch (err) {
      setBrokerError(err.message);
    } finally {
      setBrokerBusy(false);
    }
  };

  const handleRunPreflight = async () => {
    setPreflightBusy(true);
    setPreflightError(null);
    setPreflightSuccess(null);
    try {
      await api.runPreflightNow();
      setPreflightSuccess("Preflight ejecutado y actualizado.");
      if (onRefresh) await onRefresh();
      await loadPreflightStatus();
    } catch (err) {
      setPreflightError(err.message);
    } finally {
      setPreflightBusy(false);
    }
  };

  const handleSaveExecutionAssistant = async () => {
    setAssistantBusy(true);
    setAssistantError(null);
    setAssistantSuccess(null);
    try {
      await api.saveExecutionAssistant(assistantMode, assistantMaxAlerts);
      setAssistantSuccess("Modo operativo actualizado.");
      if (onRefresh) await onRefresh();
    } catch (err) {
      setAssistantError(err.message);
    } finally {
      setAssistantBusy(false);
    }
  };

  const ringSize = 180;
  const ringStroke = 13;
  const ringR = (ringSize - ringStroke) / 2;
  const ringCircumference = 2 * Math.PI * ringR;
  const ringOffset = ringCircumference - ((scorePct || 0) / 100) * ringCircumference;
  const readinessColor = scorePct >= 85 ? T.green : scorePct >= 70 ? T.yellow : T.red;
  const isRealCapital = mode === "real_capital_ok";
  const preflightAssessment = preflightStatus?.assessment || readiness?.preflight || null;
  const preflightLatestRun = preflightStatus?.latestRun || readiness?.evidence?.latestPreflightRun || null;
  const preflightTone = preflightAssessment?.status === "blocked" ? T.red : preflightAssessment?.status === "caution" ? T.yellow : T.green;
  const assistantSettings = executionAssistant?.settings || null;
  const assistantCatalog = executionAssistant?.modeCatalog || [];

  return (
    <div className="ca-main" style={{ padding: "32px", maxWidth: 1240, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader
        title="Investment Readiness"
        subtitle={`Ultima evaluacion: ${generatedAt ? new Date(generatedAt).toLocaleString("es-AR") : "—"}`}
      />

      {/* Hero: ring gauge + status pills */}
      <GlassCard style={{ marginBottom: 24, padding: "32px 28px" }} glowColor={readinessColor}>
        <div style={{ display: "flex", alignItems: "center", gap: 40, flexWrap: "wrap" }}>

          {/* Ring gauge */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <svg width={ringSize} height={ringSize} style={{ transform: "rotate(-90deg)", display: "block" }}>
              {/* Track */}
              <circle cx={ringSize/2} cy={ringSize/2} r={ringR} fill="none" stroke="rgba(148,163,184,0.08)" strokeWidth={ringStroke} />
              {/* Glow layer */}
              <circle cx={ringSize/2} cy={ringSize/2} r={ringR} fill="none"
                stroke={readinessColor} strokeWidth={ringStroke + 6}
                strokeDasharray={ringCircumference} strokeDashoffset={ringOffset}
                strokeLinecap="round" opacity={0.12}
              />
              {/* Main arc */}
              <circle cx={ringSize/2} cy={ringSize/2} r={ringR} fill="none"
                stroke={readinessColor} strokeWidth={ringStroke}
                strokeDasharray={ringCircumference} strokeDashoffset={ringOffset}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1), stroke 0.4s ease" }}
              />
            </svg>
            {/* Center content */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 2,
            }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: readinessColor, fontFamily: T.fontMono, lineHeight: 1, letterSpacing: "-2px" }}>
                {Math.round(scorePct || 0)}
              </div>
              <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "2px" }}>Score</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: T.text, fontFamily: T.fontMono, marginTop: 2 }}>{grade || "—"}</div>
            </div>
          </div>

          {/* Status column */}
          <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 10 }}>Estado del sistema</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14,
                  background: isRealCapital ? `linear-gradient(135deg, ${T.green}, ${T.teal})` : `linear-gradient(135deg, ${T.blue}60, ${T.purple}60)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: isRealCapital ? `0 4px 20px ${T.green}30` : "none",
                  flexShrink: 0,
                }}>
                  {isRealCapital ? <Unlock size={20} color="#000" strokeWidth={2} /> : <Lock size={20} color={T.textMuted} strokeWidth={2} />}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: isRealCapital ? T.green : T.textMuted }}>
                    {isRealCapital ? "Capital Real Habilitado" : "Paper Trading Activo"}
                  </div>
                  <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
                    Etapa: <span style={{ color: policyColor, fontWeight: 700 }}>{capitalPolicy?.stage || "paper_only"}</span>
                    {" · "}Máx capital: <span style={{ color: policyColor, fontWeight: 700 }}>{capitalPolicy?.maxCapitalPct ?? 0}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pills row */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ ...S.badge(policyColor), fontSize: 10 }}>
                <PulseDot color={policyColor} size={5} />
                {capitalPolicy?.stage || "paper_only"}
              </div>
              <div style={{ ...S.badge(regimeColor), fontSize: 10 }}>
                {regimeLabel(marketRegime?.regime)} · SPY 1m {pct(marketRegime?.spy1mPct)}
              </div>
              {blockers.length > 0 && (
                <div style={{ ...S.badge(T.red), fontSize: 10 }}>
                  <AlertTriangle size={10} />
                  {blockers.length} blocker{blockers.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>

            {summary && <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.7, borderLeft: `2px solid ${readinessColor}40`, paddingLeft: 12 }}>{summary}</div>}
          </div>

          {/* Mini stats */}
          <div style={{ display: "grid", gap: 10, minWidth: 160 }}>
            {[
              { label: "Sharpe", value: fmt(risk?.sharpeRatio), color: (risk?.sharpeRatio ?? 0) >= 1 ? T.green : T.yellow },
              { label: "Max DD", value: pct(risk?.maxDrawdownPct), color: Math.abs(risk?.maxDrawdownPct ?? 100) <= 15 ? T.green : T.red },
              { label: "Win Rate", value: pct(alphaStats?.winRateVsSpy), color: (alphaStats?.winRateVsSpy ?? 0) >= 55 ? T.green : T.red },
              { label: "Alpha Prom", value: pct(alphaStats?.avgAlpha), color: (alphaStats?.avgAlpha ?? 0) > 0 ? T.green : T.red },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, background: "rgba(148,163,184,0.04)", border: `1px solid rgba(148,163,184,0.06)` }}>
                <span style={{ fontSize: 11, color: T.textDim }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color, fontFamily: T.fontMono }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* ── Deployment Policy ── */}
      <GlassCard glowColor={policyColor} style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: `linear-gradient(135deg, ${policyColor}30, ${policyColor}10)`,
            border: `1px solid ${policyColor}20`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <ShieldCheck size={18} color={policyColor} strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text, letterSpacing: "-0.2px" }}>Politica de Despliegue</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>Control de capital y etapa operativa</div>
          </div>
          <div style={{
            padding: "5px 14px", borderRadius: 12,
            background: `${policyColor}12`, border: `1px solid ${policyColor}20`,
            fontSize: 11, fontWeight: 800, color: policyColor,
            fontFamily: T.fontMono, textTransform: "uppercase",
          }}>
            {capitalPolicy?.stage || "paper_only"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <ScoreBar value={capitalPolicy?.maxCapitalPct ?? 0} label="Capital maximo habilitado" color={policyColor} h={8} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: policyColor, fontFamily: T.fontMono, flexShrink: 0 }}>
            {capitalPolicy?.maxCapitalPct ?? 0}%
          </div>
        </div>
        {summary && (
          <div style={{
            fontSize: 12, color: T.textMuted, lineHeight: 1.6, padding: "10px 14px",
            background: "rgba(148,163,184,0.03)", borderRadius: 10,
            border: `1px solid rgba(148,163,184,0.06)`,
          }}>
            {summary}
          </div>
        )}
      </GlassCard>

      {/* ── Preflight Operativo ── */}
      <GlassCard style={{ marginBottom: 24 }} glowColor={preflightTone}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: `linear-gradient(135deg, ${preflightTone}30, ${preflightTone}10)`,
            border: `1px solid ${preflightTone}20`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Activity size={18} color={preflightTone} strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text, letterSpacing: "-0.2px" }}>Preflight Operativo</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>Chequeo de ratios, datos y semaforo del dia</div>
          </div>
          <button onClick={handleRunPreflight} disabled={preflightBusy} style={{ ...S.btn("secondary"), fontSize: 11, padding: "8px 14px", opacity: preflightBusy ? 0.7 : 1 }}>
            {preflightBusy ? "Corriendo..." : "Correr Ahora"}
          </button>
        </div>
        {preflightError && <StatusMsg type="error">{preflightError}</StatusMsg>}
        {preflightSuccess && <StatusMsg type="success">{preflightSuccess}</StatusMsg>}

        {/* Status + metrics grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
          <div style={{
            padding: "12px 14px", borderRadius: 12,
            background: `${preflightTone}08`, border: `1px solid ${preflightTone}12`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 6 }}>
              Estado
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: preflightTone }}>
              {preflightAssessment?.status ? String(preflightAssessment.status).toUpperCase() : "SIN DATO"}
            </div>
          </div>
          <div style={{
            padding: "12px 14px", borderRadius: 12,
            background: "rgba(148,163,184,0.03)", border: `1px solid rgba(148,163,184,0.06)`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 6 }}>
              Corrida Hoy
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: preflightAssessment?.hasRunToday ? T.green : T.textDim }}>
              {preflightAssessment?.hasRunToday ? "SI" : "NO"}
            </div>
          </div>
          <div style={{
            padding: "12px 14px", borderRadius: 12,
            background: "rgba(148,163,184,0.03)", border: `1px solid rgba(148,163,184,0.06)`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 6 }}>
              Ratios Sync
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>
              {preflightLatestRun ? preflightLatestRun.ratioSyncUpdated : "—"}
            </div>
          </div>
          <div style={{
            padding: "12px 14px", borderRadius: 12,
            background: preflightLatestRun?.ratioSyncWarningCount > 0 ? "rgba(251,191,36,0.06)" : "rgba(148,163,184,0.03)",
            border: `1px solid ${preflightLatestRun?.ratioSyncWarningCount > 0 ? "rgba(251,191,36,0.12)" : "rgba(148,163,184,0.06)"}`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 6 }}>
              Warnings
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: preflightLatestRun?.ratioSyncWarningCount > 0 ? T.yellow : T.textDim }}>
              {preflightLatestRun ? preflightLatestRun.ratioSyncWarningCount : "—"}
            </div>
          </div>
        </div>

        {preflightAssessment?.summary && (
          <div style={{
            fontSize: 12, color: T.textMuted, lineHeight: 1.6, padding: "10px 14px",
            background: "rgba(148,163,184,0.03)", borderRadius: 10,
            border: `1px solid rgba(148,163,184,0.06)`,
          }}>
            {preflightAssessment.summary}
          </div>
        )}
        {preflightLatestRun?.createdAt && (
          <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, marginTop: 10, textAlign: "right" }}>
            Ultima: {new Date(preflightLatestRun.createdAt).toLocaleString("es-AR")}
          </div>
        )}
      </GlassCard>

      {/* ── Execution Assistant ── */}
      <GlassCard style={{ marginBottom: 24 }} glowColor={T.cyan}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: `linear-gradient(135deg, ${T.cyan}30, ${T.cyan}10)`,
            border: `1px solid ${T.cyan}20`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Zap size={18} color={T.cyan} strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text, letterSpacing: "-0.2px" }}>Asistente de Ejecucion</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>El sistema sugiere, vos confirmas antes de operar</div>
          </div>
          {assistantSettings?.confirmationRequired && (
            <div style={{
              padding: "4px 10px", borderRadius: 10,
              background: "rgba(0,245,160,0.08)", border: "1px solid rgba(0,245,160,0.15)",
              fontSize: 9, fontWeight: 700, color: T.green,
              fontFamily: T.fontMono, textTransform: "uppercase",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <ShieldCheck size={10} strokeWidth={2.5} />
              Confirmacion Obligatoria
            </div>
          )}
        </div>
        {assistantError && <StatusMsg type="error">{assistantError}</StatusMsg>}
        {assistantSuccess && <StatusMsg type="success">{assistantSuccess}</StatusMsg>}

        {/* Mode cards instead of raw dropdown */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 14 }}>
          {assistantCatalog.map((mode) => {
            const isActive = assistantMode === mode.key;
            const modeColor = mode.key === "critical_alerts" ? T.orange : T.blue;
            return (
              <div
                key={mode.key}
                onClick={() => setAssistantMode(mode.key)}
                style={{
                  padding: "14px 16px", borderRadius: 14, cursor: "pointer",
                  background: isActive ? `${modeColor}10` : "rgba(148,163,184,0.03)",
                  border: `1px solid ${isActive ? `${modeColor}30` : "rgba(148,163,184,0.06)"}`,
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: isActive ? modeColor : T.textDark,
                    boxShadow: isActive ? `0 0 8px ${modeColor}50` : "none",
                    transition: "all 0.2s ease",
                  }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? modeColor : T.textMuted }}>
                    {mode.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.5 }}>
                  {mode.description}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: T.textDim }}>Max alertas/dia:</span>
            <input
              type="number" min="1" max="5"
              value={assistantMaxAlerts}
              onChange={(e) => setAssistantMaxAlerts(e.target.value)}
              style={{ ...S.input, width: 60, textAlign: "center", fontSize: 13 }}
            />
          </div>
          <button onClick={handleSaveExecutionAssistant} disabled={assistantBusy} style={{ ...S.btn("secondary"), fontSize: 12, padding: "8px 18px", opacity: assistantBusy ? 0.7 : 1 }}>
            {assistantBusy ? "Guardando..." : "Guardar Preferencias"}
          </button>
        </div>
      </GlassCard>

      <GlassCard style={{ marginBottom: 24 }} glowColor={T.orange}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: `linear-gradient(135deg, ${T.orange}30, ${T.orange}10)`,
            border: `1px solid ${T.orange}20`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Activity size={18} color={T.orange} strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text, letterSpacing: "-0.2px" }}>Broker Real</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>Costos, break-even y guardrails de ejecucion</div>
          </div>
        </div>
        {brokerError && <StatusMsg type="error">{brokerError}</StatusMsg>}
        {brokerSuccess && <StatusMsg type="success">{brokerSuccess}</StatusMsg>}

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <select value={selectedBrokerKey} onChange={(e) => setSelectedBrokerKey(e.target.value)} style={{ ...S.input, width: 200 }}>
            {(brokerSettings.catalog || []).map((item) => (
              <option key={item.key} value={item.key}>{item.name}</option>
            ))}
          </select>
          <button
            onClick={handleSaveBroker}
            disabled={brokerBusy || selectedBrokerKey === (brokerSettings.current?.brokerKey || "default")}
            style={{ ...S.btn("secondary"), fontSize: 12, padding: "8px 18px", opacity: brokerBusy || selectedBrokerKey === (brokerSettings.current?.brokerKey || "default") ? 0.7 : 1 }}
          >
            {brokerBusy ? "Guardando..." : "Guardar"}
          </button>
        </div>

        {/* Broker metrics as visual cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
          <div style={{
            padding: "12px 14px", borderRadius: 12, textAlign: "center",
            background: "rgba(148,163,184,0.03)", border: `1px solid rgba(148,163,184,0.06)`,
          }}>
            <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 6 }}>Broker</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{readiness?.brokerPreference?.brokerKey || brokerSettings.current?.brokerKey || "default"}</div>
          </div>
          <div style={{
            padding: "12px 14px", borderRadius: 12, textAlign: "center",
            background: readiness?.transactionCosts?.viable ? "rgba(0,245,160,0.04)" : "rgba(255,51,102,0.04)",
            border: `1px solid ${readiness?.transactionCosts?.viable ? "rgba(0,245,160,0.12)" : "rgba(255,51,102,0.12)"}`,
          }}>
            <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 6 }}>Round-Trip</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: readiness?.transactionCosts?.viable ? T.green : T.red, fontFamily: T.fontMono }}>{readiness?.transactionCosts?.roundTripCostPct ?? "—"}%</div>
          </div>
          <div style={{
            padding: "12px 14px", borderRadius: 12, textAlign: "center",
            background: "rgba(148,163,184,0.03)", border: `1px solid rgba(148,163,184,0.06)`,
          }}>
            <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 6 }}>Break-Even</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: T.fontMono }}>{readiness?.transactionCosts?.requiredReturnToBreakEven ?? "—"}%</div>
          </div>
        </div>
      </GlassCard>

      <GlassCard style={{ marginBottom: 28 }} glowColor={T.cyan}>
        <SectionHeader title="Políticas Seleccionables" subtitle="Elegís overlays y caps de despliegue sin aflojar el piso de seguridad del sistema" />
        {policyError && <StatusMsg type="error">{policyError}</StatusMsg>}
        {policySuccess && <StatusMsg type="success">{policySuccess}</StatusMsg>}
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div>
              <div style={{ ...S.label, marginBottom: 8 }}>Overlay</div>
              <select value={policySelection.overlayKey} onChange={(e) => setPolicySelection((prev) => ({ ...prev, overlayKey: e.target.value }))} style={{ ...S.input, width: "100%" }}>
                {policyCatalog.overlays.map((overlay) => (
                  <option key={overlay.key} value={overlay.key}>{overlay.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ ...S.label, marginBottom: 8 }}>Modo de despliegue</div>
              <select value={policySelection.deploymentMode} onChange={(e) => setPolicySelection((prev) => ({ ...prev, deploymentMode: e.target.value }))} style={{ ...S.input, width: "100%" }}>
                {policyCatalog.deploymentModes.map((modeOption) => (
                  <option key={modeOption.key} value={modeOption.key}>{modeOption.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.7 }}>
            Overlay actual: <strong style={{ color: T.text }}>{currentPolicySelection.overlayName || currentPolicySelection.overlayKey || "—"}</strong>
            {" · "}
            Despliegue actual: <strong style={{ color: T.text }}>{currentPolicySelection.deploymentModeName || currentPolicySelection.deploymentMode || "—"}</strong>
            {policyCooldown.active ? ` · Cooldown activo: ${policyCooldown.remainingDays} día(s)` : " · Sin cooldown activo"}
          </div>

          <div>
            <div style={{ ...S.label, marginBottom: 8 }}>Motivo del cambio</div>
            <input
              value={policyReason}
              onChange={(e) => setPolicyReason(e.target.value.slice(0, 180))}
              placeholder="Ej: bajar exposición real mientras valido consistencia del track record"
              style={{ ...S.input, width: "100%" }}
            />
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={handlePreviewPolicy} disabled={policyBusy} style={{ ...S.btn("secondary"), opacity: policyBusy ? 0.7 : 1 }}>
              {policyBusy ? "Procesando..." : "Preview de Impacto"}
            </button>
            <button
              onClick={handleApplyPolicy}
              disabled={policyBusy || !currentPolicyChanged || (policyCooldown.active && currentPolicyChanged) || !policyReason.trim()}
              style={{ ...S.btn("primary"), opacity: policyBusy || !currentPolicyChanged || (policyCooldown.active && currentPolicyChanged) || !policyReason.trim() ? 0.7 : 1 }}
            >
              Aplicar Política
            </button>
          </div>

          {policyPreview && (
            <div style={{ padding: 16, borderRadius: 14, border: `1px solid ${T.cyan}22`, background: `${T.cyan}08` }}>
              <div style={{ fontSize: 12, color: T.cyan, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>
                Preview
              </div>
              <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                <div style={{ color: T.text }}>
                  Selección propuesta: <strong>{policyPreview.proposedSelection?.overlayName || policyPreview.proposedSelection?.overlayKey}</strong> · <strong>{policyPreview.proposedSelection?.deploymentModeName || policyPreview.proposedSelection?.deploymentMode}</strong>
                </div>
                <div style={{ color: T.textDim }}>
                  Score: {fmt(policyPreview.currentReadiness?.scorePct)} → {fmt(policyPreview.previewReadiness?.scorePct)}
                  {" · "}
                  Stage: {policyPreview.currentReadiness?.capitalPolicy?.stage || "—"} → {policyPreview.previewReadiness?.capitalPolicy?.stage || "—"}
                  {" · "}
                  Cap real: {policyPreview.currentReadiness?.capitalPolicy?.maxCapitalPct ?? "—"}% → {policyPreview.previewReadiness?.capitalPolicy?.maxCapitalPct ?? "—"}%
                </div>
                <div style={{ color: T.textDim }}>
                  Delta blockers: {policyPreview.impact?.blockersDelta ?? 0}
                  {" · "}
                  Delta score: {fmt(policyPreview.impact?.scorePctDelta)}
                </div>
              </div>
            </div>
          )}

          {policyAuditLog.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ ...S.label, marginBottom: 4 }}>Audit Log de Políticas</div>
              {policyAuditLog.slice(0, 5).map((entry) => (
                <div key={entry.id} style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${T.border}`, background: `${T.card}B8` }}>
                  <div style={{ fontSize: 12, color: T.text }}>
                    {entry.previous_overlay_key || "system_default"} / {entry.previous_deployment_mode || "system_auto"}
                    {" → "}
                    <strong>{entry.next_overlay_key}</strong> / <strong>{entry.next_deployment_mode}</strong>
                  </div>
                  <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>
                    {entry.reason || "sin motivo"} · {entry.created_at ? new Date(entry.created_at).toLocaleString("es-AR") : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </GlassCard>

      {blockers.length > 0 && (
        <StatusMsg type="error">
          <div style={{ marginBottom: 6 }}>Blockers activos</div>
          <BlockerList blockers={blockers} />
        </StatusMsg>
      )}

      {degradationSignals.length > 0 && (
        <GlassCard style={{ marginBottom: 24, borderColor: `${T.yellow}25`, background: `${T.yellow}06` }}>
          <div style={{ fontSize: 12, color: T.yellow, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 800, marginBottom: 8 }}>
            Senales de degradacion
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {degradationSignals.map((signal, index) => (
              <span key={index} style={{ ...S.badge(T.yellow), background: `${T.yellow}18`, borderColor: `${T.yellow}28` }}>{signal}</span>
            ))}
          </div>
        </GlassCard>
      )}

      <div style={{ ...S.grid(260), gap: 16, marginBottom: 28 }}>
        <MetricCard label="Predicciones Evaluadas" value={alphaStats?.count || 0} color={T.text} glowColor={T.blue} icon={Brain} />
        <MetricCard label="Win Rate vs SPY" value={alphaStats?.winRateVsSpy || 0} suffix="%" decimals={2} color={(alphaStats?.winRateVsSpy || 0) >= 55 ? T.green : T.red} glowColor={(alphaStats?.winRateVsSpy || 0) >= 55 ? T.green : T.red} icon={Trophy} />
        <MetricCard label="Alpha Promedio" value={alphaStats?.avgAlpha || 0} suffix="%" decimals={2} color={(alphaStats?.avgAlpha || 0) > 0 ? T.green : T.red} glowColor={(alphaStats?.avgAlpha || 0) > 0 ? T.green : T.red} icon={TrendingUp} />
        <MetricCard label="Track Alpha" value={trackRecord?.alphaPct || 0} suffix="%" decimals={2} color={(trackRecord?.alphaPct || 0) > 0 ? T.green : T.red} glowColor={(trackRecord?.alphaPct || 0) > 0 ? T.green : T.red} icon={Activity} />
      </div>

      <div style={{ ...S.grid(260), gap: 16, marginBottom: 28 }}>
        <GlassCard>
          <div style={S.label}>Riesgo</div>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: T.textDim }}>Sharpe</span>
              <span style={{ color: (risk?.sharpeRatio ?? 0) >= 0.75 ? T.green : T.red, fontFamily: T.fontMono }}>{fmt(risk?.sharpeRatio)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: T.textDim }}>Max drawdown</span>
              <span style={{ color: (risk?.maxDrawdownPct ?? 100) <= 20 ? T.green : T.red, fontFamily: T.fontMono }}>{pct(risk?.maxDrawdownPct)}</span>
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <div style={S.label}>Benchmark Real</div>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: T.textDim }}>Vs SPY DCA</span>
              <span style={{ color: benchmark?.beatsSpy ? T.green : T.red, fontFamily: T.fontMono }}>{benchmark?.beatsSpy == null ? "—" : benchmark.beatsSpy ? "Supera" : "Pierde"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: T.textDim }}>Alpha ARS</span>
              <span style={{ color: (benchmark?.alphaArs ?? 0) >= 0 ? T.green : T.red, fontFamily: T.fontMono }}>${benchmark?.alphaArs?.toLocaleString("es-AR") ?? "—"}</span>
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <div style={S.label}>Track Record</div>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: T.textDim }}>Puntos</span>
              <span style={{ color: T.text, fontFamily: T.fontMono }}>{trackRecord?.points ?? 0}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: T.textDim }}>Retorno virtual</span>
              <span style={{ color: (trackRecord?.virtualReturnPct ?? 0) >= 0 ? T.green : T.red, fontFamily: T.fontMono }}>{pct(trackRecord?.virtualReturnPct)}</span>
            </div>
          </div>
        </GlassCard>
      </div>

      <div style={{ ...S.grid(260), gap: 16, marginBottom: 28 }}>
        <MetricCard label="Sesiones Auditables" value={evidenceQuality?.analysisSessions || 0} color={(evidenceQuality?.analysisSessions || 0) >= 12 ? T.green : T.red} glowColor={(evidenceQuality?.analysisSessions || 0) >= 12 ? T.green : T.red} icon={CalendarCheck} />
        <MetricCard label="Cobertura de Audit Trail" value={evidenceQuality?.auditCoveragePct || 0} suffix="%" decimals={2} color={(evidenceQuality?.auditCoveragePct || 0) >= 90 ? T.green : T.red} glowColor={(evidenceQuality?.auditCoveragePct || 0) >= 90 ? T.green : T.red} icon={FileCheck} />
        <MetricCard label="Resolucion Adherencia" value={evidenceQuality?.adherenceResolutionPct || 0} suffix="%" decimals={2} color={(evidenceQuality?.adherenceResolutionPct || 0) >= 80 ? T.green : T.red} glowColor={(evidenceQuality?.adherenceResolutionPct || 0) >= 80 ? T.green : T.red} icon={CheckCircle} />
        <MetricCard label="Desvio Medio" value={evidenceQuality?.avgDiscrepancyPct || 0} suffix="%" decimals={2} color={(evidenceQuality?.avgDiscrepancyPct || 0) <= 20 ? T.green : T.red} glowColor={(evidenceQuality?.avgDiscrepancyPct || 0) <= 20 ? T.green : T.red} icon={Gauge} />
      </div>

      <div style={{ ...S.grid(260), gap: 16, marginBottom: 28 }}>
        <GlassCard glowColor={readiness.macroCircuitBreakers?.severity === "critical" ? T.red : readiness.macroCircuitBreakers?.severity === "warning" ? T.yellow : T.green}>
          <div style={S.label}>Circuit Breakers Macro</div>
          <div style={{ ...S.value, fontSize: 18, marginTop: 8, color: readiness.macroCircuitBreakers?.severity === "critical" ? T.red : readiness.macroCircuitBreakers?.severity === "warning" ? T.yellow : T.green }}>
            {readiness.macroCircuitBreakers?.severity === "none" ? "OK" : readiness.macroCircuitBreakers?.reason || "Verificando..."}
          </div>
          <div style={{ fontSize: 11, color: T.textDim, marginTop: 6 }}>
            CCL spike {pct(readiness.macroCircuitBreakers?.cclSpikePct)} · Brecha {pct(readiness.macroCircuitBreakers?.estimatedGapPct)}
          </div>
        </GlassCard>

        <GlassCard glowColor={readiness.stressTests?.allSurvived ? T.green : T.red}>
          <div style={S.label}>Stress Tests</div>
          <div style={{ ...S.value, fontSize: 18, marginTop: 8, color: readiness.stressTests?.allSurvived ? T.green : T.red }}>
            {readiness.stressTests?.allSurvived ? "TODOS SUPERADOS" : "FALLAS DETECTADAS"}
          </div>
          <div style={{ fontSize: 11, color: T.textDim, marginTop: 6 }}>
            Peor drawdown simulado: {readiness.stressTests?.worstDrawdown ?? "—"}%
          </div>
        </GlassCard>

        <GlassCard glowColor={readiness.transactionCosts?.viable ? T.green : T.red}>
          <div style={S.label}>Costos de Transaccion (IDA+VUELTA)</div>
          <div style={{ ...S.value, fontSize: 18, marginTop: 8, color: readiness.transactionCosts?.viable ? T.green : T.red }}>
            {readiness.transactionCosts?.roundTripCostPct ?? "—"}%
          </div>
          <div style={{ fontSize: 11, color: T.textDim, marginTop: 6 }}>
            Break-even: {readiness.transactionCosts?.requiredReturnToBreakEven ?? "—"}% · Muestra $100k ARS
          </div>
        </GlassCard>

        <GlassCard glowColor={readiness.rules?.find((r) => r.name === "two_factor_authentication")?.passed ? T.green : T.red}>
          <div style={S.label}>2FA / Autenticacion</div>
          <div style={{ ...S.value, fontSize: 18, marginTop: 8, color: readiness.rules?.find((r) => r.name === "two_factor_authentication")?.passed ? T.green : T.red }}>
            {readiness.rules?.find((r) => r.name === "two_factor_authentication")?.passed ? "HABILITADO" : "REQUERIDO"}
          </div>
          <div style={{ fontSize: 11, color: T.textDim, marginTop: 6 }}>
            Obligatorio para capital real
          </div>
        </GlassCard>
      </div>

      <GlassCard style={{ marginBottom: 28 }} glowColor={twoFactorRulePassed ? T.green : T.red}>
        <SectionHeader title="Gestión de 2FA" subtitle="Asegurá el acceso al sistema antes de habilitar capital real" />
        {twoFactorError && <StatusMsg type="error">{twoFactorError}</StatusMsg>}
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
                Estado actual:{" "}
                <span style={{ color: twoFactorStatus.enabled ? T.green : T.red }}>
                  {twoFactorStatus.loading ? "Verificando..." : twoFactorStatus.enabled ? "2FA activo" : "2FA inactivo"}
                </span>
              </div>
              <div style={{ fontSize: 12, color: T.textDim, marginTop: 6 }}>
                El backend ya exige TOTP para capital real. Desde acá podés activarlo y desactivarlo de forma operativa.
              </div>
            </div>
            {!twoFactorStatus.enabled ? (
              <button onClick={handleEnable2FA} disabled={twoFactorBusy || twoFactorStatus.loading} style={{ ...S.btn("secondary"), opacity: twoFactorBusy ? 0.7 : 1 }}>
                {twoFactorBusy ? "Generando..." : "Activar 2FA"}
              </button>
            ) : null}
          </div>

          {twoFactorSetup && (
            <div style={{ padding: 16, borderRadius: 14, background: `${T.blue}08`, border: `1px solid ${T.blue}20` }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.blue, fontFamily: T.fontMono, marginBottom: 10 }}>
                Setup pendiente
              </div>
              <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.7, marginBottom: 10 }}>
                Cargá este secreto o URI en tu app autenticadora. Si ya lo hiciste, el login te va a pedir el código.
              </div>
              <div style={{ fontSize: 12, color: T.text, fontFamily: T.fontMono, wordBreak: "break-all", marginBottom: 10 }}>
                Secret: {twoFactorSetup.secret}
              </div>
              <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, wordBreak: "break-all" }}>
                URI: {twoFactorSetup.uri}
              </div>
            </div>
          )}

          {twoFactorStatus.enabled && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ minWidth: 180, flex: 1 }}>
                <div style={{ ...S.label, marginBottom: 8 }}>Código actual para desactivar</div>
                <input
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  style={{ ...S.input, letterSpacing: "4px", textAlign: "center" }}
                />
              </div>
              <button onClick={handleDisable2FA} disabled={twoFactorBusy || disableCode.length < 6} style={{ ...S.btn("danger"), opacity: twoFactorBusy || disableCode.length < 6 ? 0.7 : 1 }}>
                {twoFactorBusy ? "Procesando..." : "Desactivar 2FA"}
              </button>
            </div>
          )}
        </div>
      </GlassCard>

      {readiness.stressTests?.results && readiness.stressTests.results.length > 0 && (
        <GlassCard style={{ marginBottom: 28, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "24px 28px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ ...S.label, margin: 0 }}>Escenarios de Stress</div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={S.th}>Escenario</th>
                  <th style={S.th}>Retorno</th>
                  <th style={S.th}>Max DD</th>
                  <th style={S.th}>Recuperacion</th>
                  <th style={S.th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {readiness.stressTests.results.map((r, i) => (
                  <tr key={i}>
                    <td style={S.td}>{r.scenario}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: (r.portfolioReturnPct || 0) >= 0 ? T.green : T.red }}>{r.portfolioReturnPct}%</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>{r.maxDrawdownPct}%</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>{r.recoveryMonths ? `${r.recoveryMonths}m` : "—"}</td>
                    <td style={S.td}><span style={{ ...S.badge(r.survived ? T.green : T.red), fontSize: 9 }}>{r.survived ? "SUPERADO" : "FALLIDO"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      <GlassCard style={{ marginBottom: 28 }}>
        <SectionHeader
          title="Reglas de Readiness"
          subtitle={`${rules.filter(r => r.passed).length} / ${rules.length} reglas activas`}
          action={
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: T.green, fontFamily: T.fontMono, lineHeight: 1 }}>{rules.filter(r => r.passed).length}</div>
                <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px" }}>OK</div>
              </div>
              <div style={{ width: 1, height: 28, background: T.border }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: T.red, fontFamily: T.fontMono, lineHeight: 1 }}>{rules.filter(r => !r.passed).length}</div>
                <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px" }}>Fail</div>
              </div>
            </div>
          }
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
          {rules.map((rule) => {
            const c = rule.passed ? T.green : T.red;
            // Rule-specific explanations
            const ruleExplanations = {
              win_rate_vs_spy: "(Si cae por debajo, se bloquea el acceso a capital real)",
              avg_alpha_positive: "(Mide si tus picks le ganan a SPY. Si es negativo, no justifica la complejidad)",
              two_factor_authentication: "(Obligatorio para operar con capital real)",
              minimum_track_record: null, // handled dynamically below
              cooldown_period: null, // handled dynamically below
            };
            const explanation = ruleExplanations[rule.name] || null;

            // Dynamic explanations for specific rules
            let dynamicNote = null;
            if (rule.name === "minimum_track_record" || rule.name === "track_record_days") {
              const daysVal = typeof rule.value === "number" ? rule.value : parseInt(rule.value, 10);
              if (!isNaN(daysVal) && daysVal < 180) {
                dynamicNote = `(Recomendado: mínimo 180 días para significancia estadística. Actual: ${daysVal} días)`;
              }
            }
            if ((rule.name === "cooldown_period" || rule.name === "cooldown") && !rule.passed && rule.value != null) {
              const cooldownDays = typeof rule.value === "number" ? rule.value : parseInt(rule.value, 10);
              if (!isNaN(cooldownDays) && cooldownDays > 0) {
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + cooldownDays);
                dynamicNote = `(Expira: ${expiryDate.toLocaleDateString("es-AR")})`;
              }
            }

            return (
              <div key={rule.name} style={{
                padding: "14px 16px",
                borderRadius: 14,
                border: `1px solid ${c}22`,
                background: `${c}05`,
                position: "relative",
                overflow: "hidden",
                transition: "border-color 0.2s, background 0.2s",
              }}>
                {/* Left accent */}
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: c, borderRadius: "3px 0 0 3px" }} />
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ marginTop: 1, flexShrink: 0 }}>
                    {rule.passed
                      ? <CheckCircle2 size={16} color={T.green} strokeWidth={2} />
                      : <XCircle size={16} color={T.red} strokeWidth={2} />
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: c, fontFamily: T.fontMono, marginBottom: 3, letterSpacing: "0.3px" }}>
                      {rule.name.replace(/_/g, " ")}
                    </div>
                    <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.5 }}>{rule.message}</div>
                    {(explanation || dynamicNote) && (
                      <div style={{ fontSize: 10, color: T.textDim, marginTop: 4, fontStyle: "italic", lineHeight: 1.5 }}>
                        {explanation || dynamicNote}
                      </div>
                    )}
                    {(rule.value != null || rule.threshold != null) && (
                      <div style={{ display: "flex", gap: 12, marginTop: 7 }}>
                        {rule.value != null && <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono }}>val: <span style={{ color: c }}>{rule.value}</span></span>}
                        {rule.threshold != null && <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono }}>umbral: <span style={{ color: T.textMuted }}>{rule.threshold}</span></span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
