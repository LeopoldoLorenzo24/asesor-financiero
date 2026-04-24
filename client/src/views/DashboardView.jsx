import React from "react";
import { T, S, signalColors } from "../theme";
import { GlassCard, MetricCard, ScoreBar, Skeleton, StatusMsg, SectionHeader, Sparkline, HeatBadge } from "../components/common";

function getReadinessColor(readiness) {
  if (!readiness) return T.textDim;
  return readiness.mode === "real_capital_ok" ? T.green : T.red;
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
    <div className="ca-main" style={{ padding: "32px", maxWidth: 1440, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <div className="ca-stat-grid" style={{ ...S.grid(260), marginBottom: 32 }}>
        <MetricCard
          label="Valor del Portfolio"
          value={portfolioValue}
          prefix="$"
          color={T.text}
          subtext={`${portfolioCount} posiciones activas`}
          glowColor={T.blue}
          icon="PV"
          delay={0}
        />
        <MetricCard
          label="Capital Disponible"
          value={capital}
          prefix="$"
          color={T.green}
          subtext="Liquido para nuevas operaciones"
          glowColor={T.green}
          icon="CA"
          delay={80}
        />
        <MetricCard
          label="Patrimonio Total"
          value={totalWealth}
          prefix="$"
          color={T.cyan}
          subtext={`${portfolioPct.toFixed(1)}% invertido · ${(100 - portfolioPct).toFixed(1)}% liquido`}
          glowColor={T.cyan}
          icon="PT"
          delay={160}
        />
        <GlassCard glowColor={T.purple} style={{ animation: "fadeUp 0.5s ease 240ms both", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <span style={S.label}>Distribucion</span>
            <Sparkline data={sparkFlat} width={70} height={24} color={T.purple} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
            <span style={{ ...S.value, fontSize: 26, color: T.text }}>{portfolioCount}</span>
            <span style={{ fontSize: 12, color: T.textDim, fontWeight: 600 }}>CEDEARs</span>
          </div>
          <div style={{ height: 6, background: "rgba(148,163,184,0.05)", borderRadius: 6, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.min(portfolioPct, 100)}%`,
                background: `linear-gradient(90deg, ${T.green}, ${T.cyan})`,
                borderRadius: 6,
                transition: "width 1s ease",
                boxShadow: `0 0 10px ${T.green}40`,
              }}
            />
          </div>
        </GlassCard>
      </div>

      <GlassCard glowColor={readinessColor} style={{ marginBottom: 24, borderColor: `${readinessColor}30`, background: readiness?.mode === "real_capital_ok" ? `${T.green}08` : `${T.red}08` }}>
        <SectionHeader title="Deployment Governance" subtitle="El sistema no deberia pedir mas capital del que todavia se gano" />
        {!readiness ? (
          <Skeleton width="100%" height={120} />
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
              <div>
                <div style={{ color: readinessColor, fontWeight: 800, fontSize: 22 }}>
                  {readiness.mode === "real_capital_ok" ? "Capital real habilitado" : "Paper only"}
                </div>
                <div style={{ fontSize: 13, color: T.textMuted, marginTop: 6 }}>
                  {readiness.capitalPolicy?.summary || readiness.summary}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: T.textDim }}>Readiness</div>
                <div style={{ fontSize: 22, color: readinessColor, fontWeight: 800, fontFamily: T.fontMono }}>
                  {readiness.grade || "—"} · {readiness.scorePct ?? 0}%
                </div>
              </div>
            </div>
            <div style={{ ...S.grid(220), gap: 12 }}>
              <GlassCard style={{ background: "rgba(3,7,17,0.35)" }}>
                <div style={S.label}>Capital Maximo</div>
                <div style={{ ...S.value, fontSize: 24, marginTop: 8, color: readinessColor }}>{readiness.capitalPolicy?.maxCapitalPct ?? 0}%</div>
              </GlassCard>
              <GlassCard style={{ background: "rgba(3,7,17,0.35)" }}>
                <div style={S.label}>Etapa</div>
                <div style={{ ...S.value, fontSize: 24, marginTop: 8, color: readinessColor }}>{readiness.capitalPolicy?.stage || "paper_only"}</div>
              </GlassCard>
              <GlassCard style={{ background: "rgba(3,7,17,0.35)" }}>
                <div style={S.label}>Regimen</div>
                <div style={{ ...S.value, fontSize: 24, marginTop: 8 }}>{readiness.marketRegime?.regime || "unknown"}</div>
              </GlassCard>
            </div>
            {(readiness.blockers || []).length > 0 && (
              <div style={{ marginTop: 14, fontSize: 12, color: T.textMuted }}>
                Blockers: {readiness.blockers.join(" | ")}
              </div>
            )}
          </>
        )}
      </GlassCard>

      <GlassCard glowColor={T.green} style={{ marginBottom: 32, animation: "fadeUp 0.5s ease 320ms both" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                boxShadow: `0 4px 20px ${T.green}30`,
              }}
            >
              AI
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: T.text, letterSpacing: "-0.3px" }}>Analisis Mensual con IA</div>
              <div style={{ fontSize: 12, color: T.textDim, marginTop: 3 }}>Genera plan, pero bajo la gobernanza de capital definida arriba</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {showCapitalInput ? (
              <>
                <input
                  type="number"
                  value={capitalToInvest}
                  onChange={(event) => setCapitalToInvest(event.target.value)}
                  placeholder="Capital en ARS"
                  style={{ ...S.input, width: 170, fontFamily: T.fontMono }}
                />
                <button onClick={() => runAI(parseFloat(capitalToInvest) || 0)} disabled={aiLoading} style={{ ...S.btn(), opacity: aiLoading ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}>
                  {aiLoading ? "Analizando..." : "Ejecutar"}
                </button>
                <button onClick={() => setShowCapitalInput(false)} style={{ ...S.btn("ghost") }}>Cancelar</button>
              </>
            ) : (
              <button onClick={() => setShowCapitalInput(true)} style={{ ...S.btn(), display: "flex", alignItems: "center", gap: 8 }}>
                Nuevo Analisis
              </button>
            )}
          </div>
        </div>

        {cooldownInfo && <StatusMsg type="error">{cooldownInfo.message}</StatusMsg>}

        {aiLoading && (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div style={{ marginTop: 20, maxWidth: 400, margin: "20px auto 0" }}>
              <Skeleton width="100%" height={14} />
              <div style={{ height: 8 }} />
              <Skeleton width="70%" height={14} />
              <div style={{ height: 8 }} />
              <Skeleton width="85%" height={14} />
            </div>
          </div>
        )}

        {aiAnalysis && !aiLoading && (
          <div style={{ fontSize: 13, lineHeight: 1.8, animation: "fadeUp 0.4s ease" }}>
            {aiAnalysis.error ? (
              <StatusMsg type="error">Error: {aiAnalysis.error}</StatusMsg>
            ) : (
              <>
                {aiAnalysis.sin_cambios_necesarios && (
                  <GlassCard glowColor={T.green} style={{ marginBottom: 20, borderColor: `${T.green}30`, background: `${T.green}08` }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: T.green, marginBottom: 6 }}>Cartera alineada</div>
                    <div style={{ color: T.textMuted, fontSize: 13, lineHeight: 1.7 }}>
                      {aiAnalysis.mensaje_sin_cambios || "No hay cambios necesarios por ahora."}
                    </div>
                  </GlassCard>
                )}

                {aiAnalysis.resumen_mercado && (
                  <GlassCard style={{ marginBottom: 18, borderLeft: `3px solid ${T.green}` }}>
                    <div style={S.label}>Resumen de Mercado</div>
                    <p style={{ margin: 0, color: T.textMuted, fontSize: 13, lineHeight: 1.8 }}>{aiAnalysis.resumen_mercado}</p>
                  </GlassCard>
                )}

                {aiAnalysis.decision_mensual?.picks_activos?.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <SectionHeader title="Picks Activos" subtitle="Recomendaciones ya ajustadas por gobernanza y riesgo" />
                    <div className="ca-picks-grid" style={{ ...S.grid(220), gap: 14 }}>
                      {aiAnalysis.decision_mensual.picks_activos.map((pick, index) => (
                        <GlassCard key={index} glowColor={pick.conviction >= 80 ? T.green : pick.conviction >= 60 ? T.yellow : T.orange} style={{ borderLeft: `3px solid ${pick.conviction >= 80 ? T.green : pick.conviction >= 60 ? T.yellow : T.orange}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <strong style={{ fontSize: 16, color: T.text, fontFamily: T.fontMono }}>{pick.ticker}</strong>
                            <HeatBadge value={pick.conviction} max={100} suffix="%" label="Conv" />
                          </div>
                          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>{pick.nombre} · {pick.sector}</div>
                          <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.6 }}>{pick.por_que_le_gana_a_spy}</div>
                          {(pick.cantidad_cedears != null || pick.monto_total_ars != null) && (
                            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 10 }}>
                              {pick.cantidad_cedears != null ? `${pick.cantidad_cedears} cedears` : "—"} · ${pick.monto_total_ars?.toLocaleString("es-AR") || 0}
                            </div>
                          )}
                        </GlassCard>
                      ))}
                    </div>
                  </div>
                )}

                {aiAnalysis._paper_only_reason?.length > 0 && (
                  <GlassCard style={{ marginBottom: 16, borderColor: `${T.red}25`, background: `${T.red}06` }}>
                    <div style={{ color: T.red, fontWeight: 800, marginBottom: 8, fontSize: 12, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px" }}>Plan real bloqueado</div>
                    <div style={{ fontSize: 12, color: T.textMuted }}>
                      {aiAnalysis._paper_only_reason.join(" | ")}
                    </div>
                  </GlassCard>
                )}

                {aiAnalysis._capital_limits && (
                  <GlassCard style={{ marginBottom: 16, borderColor: `${T.blue}25`, background: `${T.blue}06` }}>
                    <div style={{ color: T.blue, fontWeight: 800, marginBottom: 8, fontSize: 12, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px" }}>Capital aplicado</div>
                    <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.7 }}>
                      Solicitado ${aiAnalysis._capital_limits.requestedCapitalArs?.toLocaleString("es-AR") || 0} · habilitado {aiAnalysis._capital_limits.allowedCapitalPct}% · efectivo ${aiAnalysis._capital_limits.allowedCapitalArs?.toLocaleString("es-AR") || 0}
                    </div>
                  </GlassCard>
                )}

                {aiAnalysis._warnings?.length > 0 && (
                  <GlassCard style={{ marginBottom: 16, borderColor: `${T.yellow}25`, background: `${T.yellow}06` }}>
                    <div style={{ color: T.yellow, fontWeight: 800, marginBottom: 8, fontSize: 12, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px" }}>Warnings de gobernanza</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: T.textMuted, fontSize: 12, lineHeight: 1.8 }}>
                      {aiAnalysis._warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                    </ul>
                  </GlassCard>
                )}

                {aiAnalysis._risk_notes?.length > 0 && (
                  <GlassCard style={{ borderColor: `${T.red}25`, background: `${T.red}05` }}>
                    <div style={{ color: T.red, fontWeight: 800, marginBottom: 8, fontSize: 12, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px" }}>Ajustes de riesgo aplicados</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: T.textMuted, fontSize: 12, lineHeight: 1.8 }}>
                      {aiAnalysis._risk_notes.map((note, index) => <li key={index}>{note}</li>)}
                    </ul>
                  </GlassCard>
                )}
              </>
            )}
          </div>
        )}
      </GlassCard>

      <div style={{ animation: "fadeUp 0.5s ease 400ms both" }}>
        <SectionHeader title="Top Picks del Mes" subtitle="Los CEDEARs con mejor ranking compuesto" />
        {topPicks.length === 0 ? (
          <div style={{ ...S.grid(240), gap: 14 }}>
            {[1, 2, 3, 4].map((value) => (
              <GlassCard key={value}>
                <Skeleton width="100%" height={80} />
              </GlassCard>
            ))}
          </div>
        ) : (
          <div className="ca-picks-grid" style={{ ...S.grid(240), gap: 14 }}>
            {topPicks.map((item, index) => (
              <GlassCard
                key={index}
                glowColor={item.scores.signalColor || signalColors[item.scores.signal] || T.textDim}
                style={{ borderLeft: `3px solid ${item.scores.signalColor || signalColors[item.scores.signal] || T.textDim}`, cursor: "pointer" }}
                onClick={() => setView("ranking")}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong style={{ fontSize: 15, color: T.text, fontFamily: T.fontMono }}>{item.cedear.ticker}</strong>
                  <span style={{ ...S.badge(signalColors[item.scores.signal] || T.textDim), fontSize: 10 }}>{item.scores.signal}</span>
                </div>
                <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>{item.cedear.name}</div>
                <ScoreBar value={item.scores.composite} label="Score Compuesto" color={item.scores.signalColor || signalColors[item.scores.signal] || T.green} />
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
