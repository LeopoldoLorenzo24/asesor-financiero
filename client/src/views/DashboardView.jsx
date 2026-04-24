import React from "react";
import { T, S, signalColors } from "../theme";
import { GlassCard, MetricCard, ScoreBar, Skeleton, StatusMsg, SectionHeader, Sparkline, HeatBadge } from "../components/common";

function getReadinessColor(readiness) {
  if (!readiness) return T.textDim;
  return readiness.mode === "real_capital_ok" ? T.green : T.red;
}

function StageBadge({ stage, color }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 16px",
      borderRadius: 24,
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: "1px",
      background: `${color}15`,
      color,
      border: `1px solid ${color}30`,
      fontFamily: T.fontMono,
      textTransform: "uppercase",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />
      {stage}
    </span>
  );
}

export default function DashboardView({
  portfolioValue,
  capital,
  portfolioCount,
  showCapitalInput,
  setShowCapitalInput,
  capitalToInvest,
  setCapitalToInvest,
  runAI,
  aiLoading,
  cooldownInfo,
  aiAnalysis,
  systemReadiness,
  topPicks,
  setView,
}) {
  const totalWealth = portfolioValue + capital;
  const portfolioPct = totalWealth > 0 ? (portfolioValue / totalWealth) * 100 : 0;
  const sparkFlat = [100, 102, 99, 101, 100, 103, 101, 102, 100, 101];
  const readiness = aiAnalysis?._governance || systemReadiness;
  const readinessColor = getReadinessColor(readiness);

  return (
    <div style={{ padding: "32px", maxWidth: 1400 }}>
      {/* Hero Stats Row */}
      <div style={{ ...S.grid(240), gap: 16, marginBottom: 28 }}>
        <MetricCard
          label="Portfolio"
          value={portfolioValue}
          prefix="$"
          color={T.text}
          subtext={`${portfolioCount} posiciones`}
          glowColor={T.blue}
          icon="P"
        />
        <MetricCard
          label="Capital"
          value={capital}
          prefix="$"
          color={T.green}
          subtext="Disponible"
          glowColor={T.green}
          icon="C"
        />
        <MetricCard
          label="Total"
          value={totalWealth}
          prefix="$"
          color={T.cyan}
          subtext={`${portfolioPct.toFixed(0)}% invertido`}
          glowColor={T.cyan}
          icon="T"
        />
        <GlassCard style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={S.label}>Distribucion</span>
            <Sparkline data={sparkFlat} width={60} height={20} color={T.purple} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 800, fontFamily: T.fontMono, color: T.text }}>{portfolioCount}</span>
            <span style={{ fontSize: 12, color: T.textDim }}>CEDEARs</span>
          </div>
          <div style={{ height: 5, background: "rgba(148,163,184,0.04)", borderRadius: 5, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(portfolioPct, 100)}%`, background: `linear-gradient(90deg, ${T.green}, ${T.cyan})`, borderRadius: 5, boxShadow: `0 0 12px ${T.green}30` }} />
          </div>
        </GlassCard>
      </div>

      {/* Governance Banner */}
      <GlassCard glowColor={readinessColor} style={{ marginBottom: 28, borderColor: `${readinessColor}25`, background: `linear-gradient(135deg, ${readinessColor}08, transparent)` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: `linear-gradient(135deg, ${readinessColor}, ${readinessColor}80)`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 8px 32px ${readinessColor}30`,
            }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#000", fontFamily: T.fontMono }}>GRADE</span>
              <span style={{ fontSize: 28, fontWeight: 900, color: "#000", fontFamily: T.fontMono, lineHeight: 1 }}>{readiness?.grade || "—"}</span>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: readinessColor, textTransform: "uppercase", letterSpacing: "1px" }}>
                  {readiness?.mode === "real_capital_ok" ? "CAPITAL REAL HABILITADO" : "PAPER ONLY"}
                </span>
                {readiness?.capitalPolicy?.stage && (
                  <StageBadge stage={readiness.capitalPolicy.stage} color={readinessColor} />
                )}
              </div>
              <div style={{ fontSize: 13, color: T.textMuted, maxWidth: 500, lineHeight: 1.6 }}>
                {readiness?.capitalPolicy?.summary || readiness?.summary || "Evaluando readiness del sistema..."}
              </div>
              {(readiness?.blockers || []).length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: T.textDim }}>
                  Blockers: {readiness.blockers.join(" · ")}
                </div>
              )}
            </div>
          </div>
          <div style={{ textAlign: "right", minWidth: 180 }}>
            <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 6 }}>Readiness Score</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: readinessColor, fontFamily: T.fontMono, lineHeight: 1 }}>
              {readiness?.scorePct ?? 0}%
            </div>
            <ScoreBar value={readiness?.scorePct ?? 0} color={readinessColor} h={6} />
          </div>
        </div>
      </GlassCard>

      {/* AI Analysis Section */}
      <GlassCard glowColor={T.blue} style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              fontWeight: 900,
              color: "#000",
              boxShadow: `0 8px 24px ${T.blue}30`,
            }}>
              AI
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: T.text }}>Analisis Mensual con IA</div>
              <div style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>Genera plan bajo gobernanza de capital</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {showCapitalInput ? (
              <>
                <input
                  type="number"
                  value={capitalToInvest}
                  onChange={(e) => setCapitalToInvest(e.target.value)}
                  placeholder="Capital ARS"
                  style={{ ...S.input, width: 160 }}
                />
                <button onClick={() => runAI(parseFloat(capitalToInvest) || 0)} disabled={aiLoading} style={{ ...S.btn("primary"), opacity: aiLoading ? 0.6 : 1 }}>
                  {aiLoading ? "Analizando..." : "Ejecutar"}
                </button>
                <button onClick={() => setShowCapitalInput(false)} style={{ ...S.btn("ghost") }}>Cancelar</button>
              </>
            ) : (
              <button onClick={() => setShowCapitalInput(true)} style={{ ...S.btn("primary") }}>
                Nuevo Analisis
              </button>
            )}
          </div>
        </div>

        {cooldownInfo && <StatusMsg type="error">{cooldownInfo.message}</StatusMsg>}

        {aiLoading && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ maxWidth: 400, margin: "0 auto" }}>
              <Skeleton width="100%" height={14} />
              <div style={{ height: 8 }} />
              <Skeleton width="70%" height={14} />
              <div style={{ height: 8 }} />
              <Skeleton width="85%" height={14} />
            </div>
          </div>
        )}

        {aiAnalysis && !aiLoading && (
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            {aiAnalysis.error ? (
              <StatusMsg type="error">Error: {aiAnalysis.error}</StatusMsg>
            ) : (
              <>
                {aiAnalysis.sin_cambios_necesarios && (
                  <GlassCard glowColor={T.green} style={{ marginBottom: 18, borderColor: `${T.green}25`, background: `${T.green}06` }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: T.green, marginBottom: 6 }}>Cartera alineada</div>
                    <div style={{ color: T.textMuted, fontSize: 13 }}>{aiAnalysis.mensaje_sin_cambios || "Sin cambios necesarios."}</div>
                  </GlassCard>
                )}

                {aiAnalysis.resumen_mercado && (
                  <GlassCard style={{ marginBottom: 16, borderLeft: `3px solid ${T.blue}` }}>
                    <div style={S.label}>Resumen Mercado</div>
                    <p style={{ margin: 0, color: T.textMuted, fontSize: 13, lineHeight: 1.8 }}>{aiAnalysis.resumen_mercado}</p>
                  </GlassCard>
                )}

                {aiAnalysis._paper_only_reason?.length > 0 && (
                  <GlassCard style={{ marginBottom: 16, borderColor: `${T.red}25`, background: `${T.red}05` }}>
                    <div style={{ color: T.red, fontWeight: 800, fontSize: 11, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>Plan real bloqueado</div>
                    <div style={{ fontSize: 12, color: T.textMuted }}>{aiAnalysis._paper_only_reason.join(" · ")}</div>
                  </GlassCard>
                )}

                {aiAnalysis._capital_limits && (
                  <GlassCard style={{ marginBottom: 16, borderColor: `${T.blue}25`, background: `${T.blue}05` }}>
                    <div style={{ color: T.blue, fontWeight: 800, fontSize: 11, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>Capital aplicado</div>
                    <div style={{ fontSize: 12, color: T.textMuted }}>
                      Solicitado ${aiAnalysis._capital_limits.requestedCapitalArs?.toLocaleString("es-AR") || 0} · habilitado {aiAnalysis._capital_limits.allowedCapitalPct}% · efectivo ${aiAnalysis._capital_limits.allowedCapitalArs?.toLocaleString("es-AR") || 0}
                    </div>
                  </GlassCard>
                )}
              </>
            )}
          </div>
        )}
      </GlassCard>

      {/* Top Picks */}
      <div>
        <SectionHeader title="Top Picks del Mes" subtitle="CEDEARs con mejor ranking compuesto" />
        {topPicks.length === 0 ? (
          <div style={{ ...S.grid(240), gap: 14 }}>
            {[1, 2, 3, 4].map((v) => (
              <GlassCard key={v}><Skeleton width="100%" height={80} /></GlassCard>
            ))}
          </div>
        ) : (
          <div style={{ ...S.grid(240), gap: 14 }}>
            {topPicks.map((item, index) => (
              <GlassCard
                key={index}
                glowColor={item.scores.signalColor || signalColors[item.scores.signal] || T.textDim}
                style={{ borderLeft: `3px solid ${item.scores.signalColor || signalColors[item.scores.signal] || T.textDim}`, cursor: "pointer" }}
                onClick={() => setView("ranking")}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <strong style={{ fontSize: 15, color: T.text, fontFamily: T.fontMono }}>{item.cedear.ticker}</strong>
                  <span style={{ ...S.badge(signalColors[item.scores.signal] || T.textDim), fontSize: 9 }}>{item.scores.signal}</span>
                </div>
                <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>{item.cedear.name}</div>
                <ScoreBar value={item.scores.composite} label="Score" color={item.scores.signalColor || signalColors[item.scores.signal] || T.green} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.textDim, marginTop: 10, fontFamily: T.fontMono }}>
                  <span>T:{item.scores.techScore} F:{item.scores.fundScore}</span>
                  <span style={{ color: T.textMuted }}>${item.priceARS?.toLocaleString("es-AR") || "—"}</span>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
