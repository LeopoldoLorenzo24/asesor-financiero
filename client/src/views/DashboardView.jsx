import React from "react";
import { T, S, signalColors } from "../theme";
import { GlassCard, MetricCard, ScoreBar, Skeleton, StatusMsg, SectionHeader, Sparkline, HeatBadge, GradientText } from "../components/common";

export default function DashboardView({
  portfolioValue, capital, portfolioCount,
  showCapitalInput, setShowCapitalInput, capitalToInvest, setCapitalToInvest,
  runAI, aiLoading, cooldownInfo, aiAnalysis, topPicks, setView,
}) {
  const totalWealth = portfolioValue + capital;
  const portfolioPct = totalWealth > 0 ? (portfolioValue / totalWealth) * 100 : 0;

  // Dummy sparkline data for visual effect (in real app would come from history)
  const sparkUp = [45, 48, 47, 52, 55, 53, 58, 62, 60, 65];
  const sparkFlat = [100, 102, 99, 101, 100, 103, 101, 102, 100, 101];

  return (
    <div className="ca-main" style={{ padding: "32px", maxWidth: 1440, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>

      {/* ── Hero Stats Row ── */}
      <div className="ca-stat-grid" style={{ ...S.grid(260), marginBottom: 32 }}>
        <MetricCard
          label="Valor del Portfolio"
          value={portfolioValue}
          prefix="$"
          color={T.text}
          subtext={`${portfolioCount} posiciones activas`}
          glowColor={T.blue}
          icon="◆"
          delay={0}
        />
        <MetricCard
          label="Capital Disponible"
          value={capital}
          prefix="$"
          color={T.green}
          subtext="Liquido para nuevas operaciones"
          glowColor={T.green}
          icon="◈"
          delay={80}
        />
        <MetricCard
          label="Patrimonio Total"
          value={totalWealth}
          prefix="$"
          color={T.cyan}
          subtext={`${portfolioPct.toFixed(1)}% invertido · ${(100 - portfolioPct).toFixed(1)}% liquido`}
          glowColor={T.cyan}
          icon="▲"
          delay={160}
        />
        <GlassCard glowColor={T.purple} style={{ animation: `fadeUp 0.5s ease 240ms both`, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <span style={S.label}>Distribución</span>
            <Sparkline data={sparkFlat} width={70} height={24} color={T.purple} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
            <span style={{ ...S.value, fontSize: 26, color: T.text }}>{portfolioCount}</span>
            <span style={{ fontSize: 12, color: T.textDim, fontWeight: 600 }}>CEDEARs</span>
          </div>
          <div style={{ height: 6, background: "rgba(148,163,184,0.05)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${Math.min(portfolioPct, 100)}%`,
              background: `linear-gradient(90deg, ${T.green}, ${T.cyan})`,
              borderRadius: 6, transition: "width 1s ease",
              boxShadow: `0 0 10px ${T.green}40`,
            }} />
          </div>
        </GlassCard>
      </div>

      {/* ── AI Analysis Panel ── */}
      <GlassCard glowColor={T.green} style={{ marginBottom: 32, animation: "fadeUp 0.5s ease 320ms both" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 16,
              background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, boxShadow: `0 4px 20px ${T.green}30`,
            }}>◈</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: T.text, letterSpacing: "-0.3px" }}>Análisis Mensual con IA</div>
              <div style={{ fontSize: 12, color: T.textDim, marginTop: 3 }}>Claude analiza tu cartera, el mercado y genera un plan de acción</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {showCapitalInput ? (
              <>
                <input
                  type="number"
                  value={capitalToInvest}
                  onChange={(e) => setCapitalToInvest(e.target.value)}
                  placeholder="Capital en ARS"
                  style={{ ...S.input, width: 170, fontFamily: T.fontMono }}
                />
                <button onClick={() => runAI(parseFloat(capitalToInvest) || 0)} disabled={aiLoading} style={{ ...S.btn(), opacity: aiLoading ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14 }}>▶</span> {aiLoading ? "Analizando..." : "Ejecutar"}
                </button>
                <button onClick={() => setShowCapitalInput(false)} style={{ ...S.btn("ghost") }}>✕</button>
              </>
            ) : (
              <button onClick={() => setShowCapitalInput(true)} style={{ ...S.btn(), display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>◈</span> Nuevo Análisis
              </button>
            )}
          </div>
        </div>

        {cooldownInfo && <StatusMsg type="error">{cooldownInfo.message}</StatusMsg>}

        {aiLoading && (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                border: `2px solid ${T.border}`,
                borderTopColor: T.green,
                animation: "spin 1s linear infinite",
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
            <div style={{ fontSize: 14, color: T.textMuted, marginBottom: 8, fontWeight: 600 }}>Claude está analizando tu cartera...</div>
            <div style={{ fontSize: 12, color: T.textDim }}>Revisando noticias, comparando contra SPY, evaluando riesgo</div>
            <div style={{ marginTop: 20, maxWidth: 400, margin: "20px auto 0" }}>
              <Skeleton width="100%" height={14} /><div style={{ height: 8 }} />
              <Skeleton width="70%" height={14} /><div style={{ height: 8 }} />
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
                    <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 14,
                        background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 20, flexShrink: 0, boxShadow: `0 4px 16px ${T.green}30`,
                      }}>✓</div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: T.green, marginBottom: 6 }}>Cartera alineada — no necesitás hacer nada</div>
                        <div style={{ color: T.textMuted, fontSize: 13, lineHeight: 1.7 }}>{aiAnalysis.mensaje_sin_cambios || "Tu cartera está en orden. Las tesis anteriores siguen vigentes."}</div>
                      </div>
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
                    <SectionHeader title="Picks Activos" subtitle="Recomendaciones de alto convicción este mes" />
                    <div className="ca-picks-grid" style={{ ...S.grid(220), gap: 14 }}>
                      {aiAnalysis.decision_mensual.picks_activos.map((pick, i) => (
                        <GlassCard key={i} glowColor={pick.conviction >= 80 ? T.green : pick.conviction >= 60 ? T.yellow : T.orange} style={{ borderLeft: `3px solid ${pick.conviction >= 80 ? T.green : pick.conviction >= 60 ? T.yellow : T.orange}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <strong style={{ fontSize: 16, color: T.text, fontFamily: T.fontMono }}>{pick.ticker}</strong>
                            <HeatBadge value={pick.conviction} max={100} suffix="%" label="Conv" />
                          </div>
                          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>{pick.nombre} · {pick.sector}</div>
                          <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.6 }}>{pick.por_que_le_gana_a_spy}</div>
                        </GlassCard>
                      ))}
                    </div>
                  </div>
                )}

                {aiAnalysis._risk_notes?.length > 0 && (
                  <GlassCard style={{ borderColor: `${T.red}25`, background: `${T.red}05` }}>
                    <div style={{ color: T.red, fontWeight: 800, marginBottom: 8, fontSize: 12, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px" }}>Ajustes de riesgo aplicados</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: T.textMuted, fontSize: 12, lineHeight: 1.8 }}>
                      {aiAnalysis._risk_notes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  </GlassCard>
                )}
              </>
            )}
          </div>
        )}
      </GlassCard>

      {/* ── Top Picks ── */}
      <div style={{ animation: "fadeUp 0.5s ease 400ms both" }}>
        <SectionHeader title="Top Picks del Mes" subtitle="Los CEDEARs con mejor ranking compuesto" />
        {topPicks.length === 0 ? (
          <div style={{ ...S.grid(240), gap: 14 }}>
            {[1,2,3,4].map((i) => (
              <GlassCard key={i}><Skeleton width="100%" height={80} /></GlassCard>
            ))}
          </div>
        ) : (
          <div className="ca-picks-grid" style={{ ...S.grid(240), gap: 14 }}>
            {topPicks.map((item, i) => (
              <GlassCard
                key={i}
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
