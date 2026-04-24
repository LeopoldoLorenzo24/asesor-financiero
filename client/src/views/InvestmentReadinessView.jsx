import React from "react";
import { T, S } from "../theme";
import { GlassCard, MetricCard, PulseDot, ScoreBar, SectionHeader, Skeleton, StatusMsg } from "../components/common";

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

export default function InvestmentReadinessView({ readiness }) {
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

  return (
    <div className="ca-main" style={{ padding: "32px", maxWidth: 1240, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader
        title="Investment Readiness"
        subtitle={`Ultima evaluacion: ${generatedAt ? new Date(generatedAt).toLocaleString("es-AR") : "—"}`}
      />

      <div style={{ ...S.grid(250), gap: 16, marginBottom: 28 }}>
        <MetricCard label="Readiness Score" value={scorePct || 0} suffix="%" decimals={2} color={scorePct >= 85 ? T.green : scorePct >= 70 ? T.yellow : T.red} glowColor={scorePct >= 85 ? T.green : scorePct >= 70 ? T.yellow : T.red} icon="R" />
        <GlassCard glowColor={policyColor}>
          <div style={S.label}>Modo Actual</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <PulseDot color={policyColor} size={8} />
            <span style={{ ...S.value, fontSize: 22, color: policyColor }}>{mode === "real_capital_ok" ? "REAL CAPITAL OK" : "PAPER ONLY"}</span>
          </div>
          <div style={{ fontSize: 12, color: T.textDim, marginTop: 10 }}>Etapa: {capitalPolicy?.stage || "paper_only"} · Max {capitalPolicy?.maxCapitalPct ?? 0}%</div>
        </GlassCard>
        <MetricCard label="Grade" value={0} color={T.text} glowColor={T.blue} icon="G" subtext={`Calificacion ${grade || "—"}`} />
        <GlassCard glowColor={regimeColor}>
          <div style={S.label}>Regimen de Mercado</div>
          <div style={{ ...S.value, fontSize: 22, marginTop: 8, color: regimeColor }}>{regimeLabel(marketRegime?.regime)}</div>
          <div style={{ fontSize: 12, color: T.textDim, marginTop: 10 }}>
            SPY 1m {pct(marketRegime?.spy1mPct)} · SPY 3m {pct(marketRegime?.spy3mPct)}
          </div>
        </GlassCard>
      </div>

      <GlassCard glowColor={policyColor} style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px" }}>Politica de despliegue</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: policyColor, marginTop: 6 }}>{capitalPolicy?.summary || summary}</div>
          </div>
          <div style={{ minWidth: 220 }}>
            <ScoreBar value={capitalPolicy?.maxCapitalPct ?? 0} label="Capital maximo habilitado" color={policyColor} h={8} />
          </div>
        </div>
        {summary && <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.7 }}>{summary}</div>}
      </GlassCard>

      {blockers.length > 0 && (
        <StatusMsg type="error">
          {`Blockers activos: ${blockers.join(" | ")}`}
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
        <MetricCard label="Predicciones Evaluadas" value={alphaStats?.count || 0} color={T.text} glowColor={T.blue} icon="P" />
        <MetricCard label="Win Rate vs SPY" value={alphaStats?.winRateVsSpy || 0} suffix="%" decimals={2} color={(alphaStats?.winRateVsSpy || 0) >= 55 ? T.green : T.red} glowColor={(alphaStats?.winRateVsSpy || 0) >= 55 ? T.green : T.red} icon="W" />
        <MetricCard label="Alpha Promedio" value={alphaStats?.avgAlpha || 0} suffix="%" decimals={2} color={(alphaStats?.avgAlpha || 0) > 0 ? T.green : T.red} glowColor={(alphaStats?.avgAlpha || 0) > 0 ? T.green : T.red} icon="A" />
        <MetricCard label="Track Alpha" value={trackRecord?.alphaPct || 0} suffix="%" decimals={2} color={(trackRecord?.alphaPct || 0) > 0 ? T.green : T.red} glowColor={(trackRecord?.alphaPct || 0) > 0 ? T.green : T.red} icon="T" />
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
        <SectionHeader title="Reglas de readiness" subtitle="El sistema solo escala cuando pasa todos estos controles" />
        <div style={{ display: "grid", gap: 10 }}>
          {rules.map((rule) => (
            <div key={rule.name} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderRadius: 12, border: `1px solid ${rule.passed ? `${T.green}25` : `${T.red}25`}`, background: rule.passed ? `${T.green}06` : `${T.red}06` }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: rule.passed ? T.green : T.red }}>{rule.name}</div>
                <div style={{ fontSize: 12, color: T.textDim, marginTop: 4 }}>{rule.message}</div>
              </div>
              <div style={{ textAlign: "right", fontFamily: T.fontMono, fontSize: 12, color: T.textMuted }}>
                <div>valor {rule.value ?? "—"}</div>
                <div>umbral {rule.threshold ?? "—"}</div>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
