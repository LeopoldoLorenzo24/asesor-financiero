import React, { useState } from "react";
import {
  Wallet, DollarSign, TrendingUp, TrendingDown, PieChart,
  Brain, Zap, Play, X, ChevronRight, ArrowUpRight,
  ShieldCheck, AlertTriangle,
} from "lucide-react";
import { T, S, signalColors } from "../theme";
import {
  GlassCard, MetricCard, ScoreBar, Skeleton, StatusMsg,
  SectionHeader, Sparkline, HeatBadge, AnimatedNumber,
} from "../components/common";
import Tooltip, { InfoBadge } from "../components/Tooltip";
import WelcomeView from "./WelcomeView";

function getReadinessColor(readiness) {
  if (!readiness) return T.textDim;
  return readiness.mode === "real_capital_ok" ? T.green : T.red;
}

// Hero card — total wealth displayed prominently
function HeroCard({ totalWealth, portfolioValue, capital, portfolioPct, portfolioCount }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        borderRadius: 28,
        overflow: "hidden",
        marginBottom: 20,
        border: `1px solid rgba(0,245,160,0.12)`,
        transition: "border-color 0.3s ease, box-shadow 0.3s ease",
        boxShadow: hovered
          ? `0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,245,160,0.18)`
          : `0 8px 32px rgba(0,0,0,0.35)`,
        background: "rgba(15,23,42,0.65)",
        backdropFilter: "blur(32px) saturate(160%)",
        WebkitBackdropFilter: "blur(32px) saturate(160%)",
      }}
    >
      {/* Top gradient accent */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${T.green}80 20%, ${T.green} 50%, ${T.cyan}80 80%, transparent)`,
        opacity: hovered ? 1 : 0.6,
        transition: "opacity 0.3s ease",
      }} />

      {/* Ambient glow */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        background: `radial-gradient(ellipse at 15% 0%, ${T.green}07 0%, transparent 50%), radial-gradient(ellipse at 85% 100%, ${T.cyan}05 0%, transparent 50%)`,
        pointerEvents: "none",
      }} />

      <div style={{ padding: "28px 32px", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>

          {/* Left: main value */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: T.textDim,
              textTransform: "uppercase", letterSpacing: "2.5px",
              fontFamily: T.fontMono, marginBottom: 10,
            }}>
              Patrimonio Total
            </div>
            <div style={{
              fontSize: 52,
              fontWeight: 900,
              fontFamily: T.fontMono,
              letterSpacing: "-2.5px",
              lineHeight: 1,
              background: `linear-gradient(135deg, ${T.text} 50%, ${T.textMuted})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              marginBottom: 14,
            }}>
              ${totalWealth > 0 ? totalWealth.toLocaleString("es-AR") : "—"}
            </div>

            {/* Allocation bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160, maxWidth: 280 }}>
                <div style={{
                  height: 5,
                  background: "rgba(148,163,184,0.08)",
                  borderRadius: 5,
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(portfolioPct, 100)}%`,
                    background: `linear-gradient(90deg, ${T.green}, ${T.cyan})`,
                    borderRadius: 5,
                    boxShadow: `0 0 10px ${T.green}40`,
                    transition: "width 1s cubic-bezier(0.4,0,0.2,1)",
                  }} />
                </div>
              </div>
              <span style={{
                fontSize: 12, color: T.textDim, fontFamily: T.fontMono, fontWeight: 600, whiteSpace: "nowrap",
              }}>
                {portfolioPct.toFixed(0)}% invertido · {portfolioCount} CEDEAR{portfolioCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Right: breakdown */}
          <div style={{ display: "flex", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
            {/* Portfolio value */}
            <div style={{
              background: "rgba(56,189,248,0.07)",
              border: `1px solid rgba(56,189,248,0.15)`,
              borderRadius: 16,
              padding: "14px 18px",
              minWidth: 140,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <Wallet size={13} color={T.blue} strokeWidth={2} />
                <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px" }}>Portfolio</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: T.text, fontFamily: T.fontMono, letterSpacing: "-0.8px" }}>
                ${portfolioValue > 0 ? portfolioValue.toLocaleString("es-AR") : "—"}
              </div>
            </div>
            {/* Cash */}
            <div style={{
              background: "rgba(0,245,160,0.06)",
              border: `1px solid rgba(0,245,160,0.12)`,
              borderRadius: 16,
              padding: "14px 18px",
              minWidth: 140,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <DollarSign size={13} color={T.green} strokeWidth={2} />
                <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px" }}>Cash</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: T.green, fontFamily: T.fontMono, letterSpacing: "-0.8px" }}>
                ${capital > 0 ? capital.toLocaleString("es-AR") : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Readiness banner
function ReadinessBanner({ readiness, readinessColor }) {
  const isOk = readiness?.mode === "real_capital_ok";
  return (
    <div style={{
      background: isOk ? `rgba(0,245,160,0.06)` : `rgba(255,51,102,0.05)`,
      border: `1px solid ${readinessColor}20`,
      borderLeft: `3px solid ${readinessColor}`,
      borderRadius: 16,
      padding: "16px 20px",
      marginBottom: 20,
      display: "flex",
      alignItems: "center",
      gap: 16,
      flexWrap: "wrap",
    }}>
      <div style={{
        width: 44, height: 44,
        borderRadius: 12,
        background: `linear-gradient(135deg, ${readinessColor}, ${readinessColor}80)`,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        boxShadow: `0 4px 16px ${readinessColor}25`,
      }}>
        <span style={{ fontSize: 8, fontWeight: 800, color: "#000", fontFamily: T.fontMono, lineHeight: 1 }}>GRADE</span>
        <span style={{ fontSize: 20, fontWeight: 900, color: "#000", fontFamily: T.fontMono, lineHeight: 1 }}>{readiness?.grade || "—"}</span>
      </div>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: readinessColor, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>
          {isOk ? "Capital Real Habilitado" : "Paper Only"}
          {readiness?.capitalPolicy?.stage && (
            <span style={{
              marginLeft: 10,
              fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 10,
              background: `${readinessColor}18`, border: `1px solid ${readinessColor}30`,
              fontFamily: T.fontMono, letterSpacing: "1px",
            }}>
              {readiness.capitalPolicy.stage}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>
          {readiness?.capitalPolicy?.summary || readiness?.summary || "Evaluando readiness..."}
        </div>
        {(readiness?.blockers || []).length > 0 && (
          <div style={{ marginTop: 6, fontSize: 11, color: T.textDim }}>
            <AlertTriangle size={10} style={{ verticalAlign: "middle", marginRight: 4 }} />
            {readiness.blockers.join(" · ")}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", minWidth: 80, flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Score</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: readinessColor, fontFamily: T.fontMono, lineHeight: 1 }}>
          {readiness?.scorePct ?? 0}%
        </div>
      </div>
    </div>
  );
}

// Pick card for top picks grid
function PickCard({ item, index, onClick }) {
  const [hovered, setHovered] = useState(false);
  const signalColor = item.scores.signalColor || signalColors[item.scores.signal] || T.textDim;
  const month1 = item.technical?.indicators?.performance?.month1 || 0;
  const isPositive = month1 >= 0;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        background: T.bgCard,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: `1px solid ${hovered ? signalColor + "35" : T.border}`,
        borderTop: `2px solid ${signalColor}`,
        borderRadius: 18,
        padding: "18px 20px",
        cursor: "pointer",
        transition: "all 0.22s cubic-bezier(0.4,0,0.2,1)",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hovered
          ? `0 14px 40px rgba(0,0,0,0.45), 0 0 20px ${signalColor}10`
          : `0 2px 8px rgba(0,0,0,0.25)`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Rank badge */}
      <div style={{
        position: "absolute",
        top: 14, right: 14,
        fontSize: 10, fontWeight: 800,
        color: index < 3 ? ["#fbbf24", "#94a3b8", "#fb923c"][index] : T.textDark,
        fontFamily: T.fontMono,
      }}>
        #{index + 1}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 900, color: T.text, fontFamily: T.fontMono, letterSpacing: "-0.5px" }}>
            {item.cedear.ticker}
          </div>
          <div style={{ fontSize: 11, color: T.textDim, marginTop: 2, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.cedear.name}
          </div>
        </div>
      </div>

      {/* Signal badge */}
      <div style={{ marginBottom: 12 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "4px 10px", borderRadius: 16,
          fontSize: 9, fontWeight: 800,
          letterSpacing: "0.8px",
          background: `${signalColor}12`,
          color: signalColor,
          border: `1px solid ${signalColor}25`,
          fontFamily: T.fontMono,
          textTransform: "uppercase",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: signalColor, flexShrink: 0 }} />
          {item.scores.signal}
        </span>
      </div>

      {/* Score bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, fontWeight: 600 }}>SCORE</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: signalColor, fontFamily: T.fontMono }}>{item.scores.composite}</span>
        </div>
        <div style={{ height: 4, background: "rgba(148,163,184,0.07)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${item.scores.composite}%`,
            background: `linear-gradient(90deg, ${signalColor}70, ${signalColor})`,
            borderRadius: 4,
            boxShadow: `0 0 8px ${signalColor}40`,
          }} />
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, fontFamily: T.fontMono }}>
          ${item.priceARS?.toLocaleString("es-AR") || "—"}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 800, fontFamily: T.fontMono,
          color: isPositive ? T.green : T.red,
          display: "flex", alignItems: "center", gap: 3,
        }}>
          {isPositive
            ? <TrendingUp size={11} strokeWidth={2.5} />
            : <TrendingDown size={11} strokeWidth={2.5} />
          }
          {isPositive ? "+" : ""}{month1.toFixed(1)}%
        </span>
      </div>
    </div>
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
  const readiness = aiAnalysis?._governance || systemReadiness;
  const readinessColor = getReadinessColor(readiness);

  return (
    <div style={{ padding: "28px 32px 40px", maxWidth: 1440, margin: "0 auto" }}>

      {/* ── Hero: total wealth ── */}
      <HeroCard
        totalWealth={totalWealth}
        portfolioValue={portfolioValue}
        capital={capital}
        portfolioPct={portfolioPct}
        portfolioCount={portfolioCount}
      />

      {/* ── Readiness banner ── */}
      <ReadinessBanner readiness={readiness} readinessColor={readinessColor} />

      {/* ── Welcome / Quick Start (no data yet) ── */}
      {!aiAnalysis && !aiLoading && (
        <WelcomeView
          setView={setView}
          readiness={readiness}
          portfolioValue={portfolioValue}
          capital={capital}
        />
      )}

      {/* ── AI Analysis Panel ── */}
      <div style={{
        background: "rgba(56,189,248,0.05)",
        border: `1px solid rgba(56,189,248,0.12)`,
        borderLeft: `3px solid ${T.blue}`,
        borderRadius: 18,
        padding: "20px 24px",
        marginBottom: 28,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 44, height: 44,
              borderRadius: 13,
              background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 4px 16px ${T.blue}30`,
              flexShrink: 0,
            }}>
              <Brain size={20} color="#020617" strokeWidth={1.8} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text, letterSpacing: "-0.2px" }}>
                Análisis Mensual con IA
              </div>
              <div style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>
                Claude analiza 226+ CEDEARs bajo gobernanza de capital
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {showCapitalInput ? (
              <>
                <input
                  type="number"
                  value={capitalToInvest}
                  onChange={(e) => setCapitalToInvest(e.target.value)}
                  placeholder="Capital ARS"
                  style={{
                    ...S.input, width: 150, fontSize: 13,
                    borderColor: `rgba(56,189,248,0.3)`,
                  }}
                />
                <button
                  onClick={() => runAI(parseFloat(capitalToInvest) || 0)}
                  disabled={aiLoading}
                  style={{
                    ...S.btn("primary"),
                    opacity: aiLoading ? 0.6 : 1,
                    fontSize: 13, padding: "10px 18px",
                  }}
                >
                  <Play size={13} strokeWidth={2.5} />
                  {aiLoading ? "Analizando…" : "Ejecutar"}
                </button>
                <button
                  onClick={() => setShowCapitalInput(false)}
                  style={{ ...S.btn("ghost"), fontSize: 13, padding: "10px 14px" }}
                >
                  <X size={13} strokeWidth={2.5} />
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowCapitalInput(true)}
                style={{ ...S.btn("primary"), fontSize: 13, padding: "10px 18px" }}
              >
                <Zap size={13} strokeWidth={2.5} />
                Nuevo Análisis
              </button>
            )}
          </div>
        </div>

        {cooldownInfo && (
          <div style={{ marginTop: 14 }}>
            <StatusMsg type="warning">{cooldownInfo.message}</StatusMsg>
          </div>
        )}

        {aiLoading && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Skeleton width="100%" height={12} radius={6} />
              <Skeleton width="72%" height={12} radius={6} />
              <Skeleton width="88%" height={12} radius={6} />
            </div>
          </div>
        )}

        {aiAnalysis && !aiLoading && !aiAnalysis.error && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {aiAnalysis.sin_cambios_necesarios && (
              <div style={{
                background: "rgba(0,245,160,0.06)",
                border: `1px solid rgba(0,245,160,0.18)`,
                borderRadius: 12, padding: "12px 16px",
              }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: T.green, marginBottom: 3 }}>
                  ✓ Cartera alineada
                </div>
                <div style={{ fontSize: 12, color: T.textMuted }}>
                  {aiAnalysis.mensaje_sin_cambios || "Sin cambios necesarios."}
                </div>
              </div>
            )}
            {aiAnalysis.resumen_mercado && (
              <div style={{
                background: "rgba(56,189,248,0.04)",
                border: `1px solid rgba(56,189,248,0.12)`,
                borderRadius: 12, padding: "12px 16px",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.blue, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 6 }}>
                  Resumen Mercado
                </div>
                <p style={{ margin: 0, color: T.textMuted, fontSize: 13, lineHeight: 1.7 }}>
                  {aiAnalysis.resumen_mercado}
                </p>
              </div>
            )}
          </div>
        )}
        {aiAnalysis?.error && (
          <div style={{ marginTop: 14 }}>
            <StatusMsg type="error">Error: {aiAnalysis.error}</StatusMsg>
          </div>
        )}
      </div>

      {/* ── Top Picks ── */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{
                width: 3, height: 20,
                background: `linear-gradient(180deg, ${T.green}, ${T.cyan})`,
                borderRadius: 2,
              }} />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: "-0.4px" }}>
                Top Picks del Mes
              </h2>
            </div>
            <div style={{ fontSize: 12, color: T.textDim, marginLeft: 13 }}>
              CEDEARs con mejor score compuesto
            </div>
          </div>
          <button
            onClick={() => setView("ranking")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "transparent",
              border: `1px solid ${T.border}`,
              borderRadius: 10, padding: "8px 14px",
              color: T.textDim, cursor: "pointer",
              fontSize: 12, fontWeight: 600, fontFamily: T.font,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.borderLight; e.currentTarget.style.color = T.textMuted; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textDim; }}
          >
            Ver todos <ArrowUpRight size={13} strokeWidth={2} />
          </button>
        </div>

        {topPicks.length === 0 ? (
          <div style={{ ...S.grid(220), gap: 14 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((v) => (
              <div key={v} style={{
                background: T.bgCard, borderRadius: 18, padding: 20,
                border: `1px solid ${T.border}`,
                animation: `fadeUp 0.4s ease ${v * 0.04}s both`,
              }}>
                <Skeleton width="60%" height={18} radius={6} />
                <div style={{ height: 8 }} />
                <Skeleton width="90%" height={11} radius={5} />
                <div style={{ height: 14 }} />
                <Skeleton width="100%" height={4} radius={4} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ ...S.grid(220), gap: 14 }}>
            {topPicks.map((item, index) => (
              <PickCard
                key={item.cedear.ticker}
                item={item}
                index={index}
                onClick={() => setView("ranking")}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
