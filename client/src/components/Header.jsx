import React, { useState } from "react";
import {
  LayoutDashboard, ShieldCheck, BarChart2, Wallet, FlaskConical,
  Trophy, TrendingUp, Target, LineChart, Activity, History,
  Zap, Brain, CheckSquare, AlertTriangle, Menu, X,
  LogOut, ChevronRight, Layers, Command,
} from "lucide-react";
import { T, PROFILES } from "../theme";
import { auth } from "../api";

// ─── Navigation structure ───────────────────────────────────
const NAV_GROUPS = [
  {
    label: "Visión General",
    items: [
      { id: "dashboard",  label: "Dashboard",       Icon: LayoutDashboard },
      { id: "readiness",  label: "Readiness",        Icon: ShieldCheck },
    ],
  },
  {
    label: "Portfolio",
    items: [
      { id: "ranking",    label: "Ranking",           Icon: BarChart2 },
      { id: "operaciones",label: "Operaciones",       Icon: Wallet },
      { id: "paper",      label: "Paper Trading",     Icon: FlaskConical },
    ],
  },
  {
    label: "Análisis",
    items: [
      { id: "trading",    label: "Señales",           Icon: Zap },
      { id: "predicciones",label: "Predicciones",    Icon: Brain },
      { id: "backtest",   label: "Backtest",          Icon: Layers },
    ],
  },
  {
    label: "Performance",
    items: [
      { id: "trackrecord",label: "Track Record",      Icon: Trophy },
      { id: "benchmarks", label: "Benchmarks",        Icon: TrendingUp },
      { id: "performance",label: "Performance",       Icon: Target },
      { id: "evolution",  label: "Evolución",         Icon: LineChart },
      { id: "adherence",  label: "Seguimiento",       Icon: CheckSquare },
      { id: "risk",       label: "Riesgo",            Icon: AlertTriangle },
      { id: "goal",       label: "Meta $1M",          Icon: Target },
    ],
  },
  {
    label: "Sistema",
    items: [
      { id: "monitor",    label: "Monitor",           Icon: Activity },
      { id: "health",     label: "Salud",             Icon: Activity },
      { id: "historial",  label: "Historial",         Icon: History },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function getReadinessTone(readiness) {
  if (!readiness) return { color: T.textDark, label: "—" };
  if (readiness.mode === "real_capital_ok") return { color: T.green, label: readiness.grade || "A" };
  return { color: T.red, label: readiness.grade || "F" };
}

// ─── Sidebar ────────────────────────────────────────────────
function Sidebar({ view, setView, readiness, onClose }) {
  const readinessTone = getReadinessTone(readiness);

  return (
    <aside
      style={{
        position: "fixed",
        top: 64, left: 0, bottom: 0,
        width: 232,
        background: "rgba(2,6,23,0.82)",
        backdropFilter: "blur(48px) saturate(180%)",
        WebkitBackdropFilter: "blur(48px) saturate(180%)",
        borderRight: `1px solid ${T.border}`,
        display: "flex",
        flexDirection: "column",
        zIndex: 90,
        overflowY: "auto",
        padding: "12px 10px 24px",
      }}
    >
      {NAV_GROUPS.map((group) => (
        <div key={group.label} style={{ marginBottom: 4 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            color: T.textDark,
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            fontFamily: T.fontMono,
            padding: "12px 14px 6px",
          }}>
            {group.label}
          </div>
          {group.items.map(({ id, label, Icon }) => {
            const active = view === id;
            return (
              <button
                key={id}
                onClick={() => { setView(id); onClose?.(); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  width: "100%",
                  padding: "9px 14px",
                  borderRadius: 11,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: T.font,
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  transition: "all 0.18s cubic-bezier(0.4,0,0.2,1)",
                  position: "relative",
                  background: active
                    ? `linear-gradient(135deg, rgba(0,245,160,0.1), rgba(0,245,160,0.04))`
                    : "transparent",
                  color: active ? T.green : T.textDim,
                  textAlign: "left",
                  marginBottom: 1,
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = T.bgHover;
                    e.currentTarget.style.color = T.textMuted;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = T.textDim;
                  }
                }}
              >
                {/* Active indicator */}
                {active && (
                  <div style={{
                    position: "absolute",
                    left: 0, top: "50%", transform: "translateY(-50%)",
                    width: 3, height: 18,
                    background: `linear-gradient(180deg, ${T.green}, ${T.cyan})`,
                    borderRadius: "0 3px 3px 0",
                    boxShadow: `0 0 8px ${T.green}60`,
                  }} />
                )}
                <Icon
                  size={15}
                  strokeWidth={active ? 2.2 : 1.8}
                  style={{ flexShrink: 0, opacity: active ? 1 : 0.6 }}
                />
                <span>{label}</span>
                {id === "readiness" && readiness?.mode === "real_capital_ok" && (
                  <span style={{
                    marginLeft: "auto",
                    width: 6, height: 6, borderRadius: "50%",
                    background: T.green,
                    boxShadow: `0 0 6px ${T.green}`,
                    animation: "pulse-dot 2s ease-in-out infinite",
                  }} />
                )}
              </button>
            );
          })}
        </div>
      ))}

      {/* Footer — Readiness mini gauge */}
      <div style={{
        marginTop: "auto",
        padding: "14px 12px 0",
        borderTop: `1px solid ${T.border}`,
      }}>
        {readiness ? (() => {
          const score = readiness.scorePct || 0;
          const color = score >= 85 ? T.green : score >= 70 ? T.yellow : T.red;
          const isReal = readiness.mode === "real_capital_ok";
          const sz = 52;
          const r = (sz - 8) / 2;
          const circ = 2 * Math.PI * r;
          const dashoff = circ - (score / 100) * circ;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* Mini ring */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <svg width={sz} height={sz} style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="rgba(148,163,184,0.07)" strokeWidth={7} />
                  <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke={color} strokeWidth={7}
                    strokeDasharray={circ} strokeDashoffset={dashoff}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)", filter: `drop-shadow(0 0 4px ${color}80)` }}
                  />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color, fontFamily: T.fontMono, lineHeight: 1 }}>{Math.round(score)}</span>
                  <span style={{ fontSize: 8, color: T.textDark, fontFamily: T.fontMono, lineHeight: 1, marginTop: 1 }}>{readiness.grade || "—"}</span>
                </div>
              </div>
              {/* Labels */}
              <div>
                <div style={{ fontSize: 9, color: T.textDark, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 3 }}>Readiness</div>
                <div style={{ fontSize: 11, fontWeight: 800, color, lineHeight: 1.3, maxWidth: 100 }}>
                  {isReal ? "Capital Real OK" : "Paper Only"}
                </div>
                <div style={{ fontSize: 9, color: T.textDark, fontFamily: T.fontMono, marginTop: 3 }}>v3.0 · {new Date().getFullYear()}</div>
              </div>
            </div>
          );
        })() : (
          <div style={{ fontSize: 10, color: T.textDark, fontFamily: T.fontMono }}>
            CEDEAR ADVISOR v3.0 · {new Date().getFullYear()}
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Main Header ─────────────────────────────────────────────
export default function Header({ view, setView, profile, setProfile, ccl, readiness }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const readinessTone = getReadinessTone(readiness);
  const activeItem = ALL_ITEMS.find((n) => n.id === view);

  const changeProfile = (nextProfile) => {
    setProfile(nextProfile);
    localStorage.setItem("cedear_profile", nextProfile);
  };

  return (
    <>
      {/* ─ Responsive CSS ─ */}
      <style>{`
        .ca-sidebar-desktop {
          display: flex !important;
        }
        .ca-sidebar-mobile {
          display: none !important;
        }
        @media (max-width: 900px) {
          .ca-sidebar-desktop { display: none !important; }
          .ca-sidebar-mobile  { display: flex !important; }
          .ca-main-content    { margin-left: 0 !important; }
          .ca-header-center   { display: none !important; }
        }
        .ca-profile-label {
          display: inline;
        }
        @media (max-width: 600px) {
          .ca-ccl-pill { display: none !important; }
          .ca-profile-label { display: none !important; }
        }
      `}</style>

      {/* ─── Top Header Bar ─── */}
      <header
        style={{
          position: "fixed",
          top: 0, left: 0, right: 0,
          height: 64,
          background: "rgba(2,6,23,0.88)",
          backdropFilter: "blur(48px) saturate(200%)",
          WebkitBackdropFilter: "blur(48px) saturate(200%)",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          zIndex: 100,
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Mobile menu toggle */}
          <button
            className="ca-sidebar-mobile"
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            aria-label="Abrir menú"
            style={{
              background: T.bgHover,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              color: T.textMuted,
              cursor: "pointer",
              width: 38, height: 38,
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
              flexShrink: 0,
            }}
          >
            {mobileSidebarOpen
              ? <X size={17} strokeWidth={2} />
              : <Menu size={17} strokeWidth={2} />
            }
          </button>

          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 38, height: 38,
              background: `linear-gradient(135deg, ${T.green} 0%, ${T.cyan} 100%)`,
              borderRadius: 11,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 4px 20px ${T.green}30, inset 0 1px 0 rgba(255,255,255,0.2)`,
              position: "relative",
              overflow: "hidden",
              flexShrink: 0,
            }}>
              <span style={{
                fontFamily: T.fontMono,
                fontWeight: 900,
                fontSize: 14,
                color: "#020617",
                position: "relative",
                zIndex: 2,
                letterSpacing: "-0.5px",
              }}>
                CA
              </span>
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)",
              }} />
            </div>
            <div>
              <div style={{
                fontSize: 15, fontWeight: 800, color: T.text,
                letterSpacing: "-0.4px", lineHeight: 1.2,
                fontFamily: T.font,
              }}>
                CEDEAR <span style={{ color: T.green }}>ADVISOR</span>
              </div>
              <div style={{
                fontSize: 9, color: T.textDark,
                letterSpacing: "2.5px", fontWeight: 700,
                fontFamily: T.fontMono, marginTop: 1,
                textTransform: "uppercase",
              }}>
                Motor de Inversión IA
              </div>
            </div>
          </div>
        </div>

        {/* Center: Cmd+K search trigger */}
        <div
          className="ca-header-center"
          onClick={() => {
            const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
            window.dispatchEvent(event);
          }}
          style={{
            position: "absolute", left: "50%", transform: "translateX(-50%)",
            display: "flex", alignItems: "center", gap: 8,
            padding: "7px 16px",
            borderRadius: 11,
            border: `1px solid rgba(148,163,184,0.09)`,
            background: "rgba(148,163,184,0.04)",
            cursor: "pointer",
            transition: "all 0.2s",
            minWidth: 220,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = `${T.green}30`;
            e.currentTarget.style.background = `${T.green}06`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(148,163,184,0.09)";
            e.currentTarget.style.background = "rgba(148,163,184,0.04)";
          }}
        >
          {activeItem ? (
            <>
              <activeItem.Icon size={13} strokeWidth={1.8} color={T.textDim} />
              <span style={{ fontSize: 12, color: T.textDim, fontWeight: 500, flex: 1 }}>{activeItem.label}</span>
            </>
          ) : (
            <span style={{ fontSize: 12, color: T.textDark, flex: 1 }}>Buscar...</span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
            <Command size={10} color={T.textDark} />
            <span style={{ fontSize: 10, color: T.textDark, fontFamily: T.fontMono }}>K</span>
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* CCL Rate */}
          {ccl && (
            <div
              className="ca-ccl-pill"
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: T.bgElevated,
                padding: "7px 13px", borderRadius: 10,
                border: `1px solid ${T.border}`,
              }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: T.cyan, boxShadow: `0 0 8px ${T.cyan}`,
                animation: "pulse-dot 2s ease-in-out infinite",
                flexShrink: 0,
              }} />
              <span style={{ color: T.textDim, fontWeight: 600, fontSize: 10, fontFamily: T.fontMono }}>
                CCL
              </span>
              <span style={{ color: T.cyan, fontWeight: 800, fontFamily: T.fontMono, fontSize: 13 }}>
                ${ccl.venta}
              </span>
            </div>
          )}

          {/* Profile switcher */}
          <div style={{
            display: "flex", gap: 2,
            background: T.bgElevated,
            borderRadius: 11, padding: 3,
            border: `1px solid ${T.border}`,
          }}>
            {Object.values(PROFILES).map((item) => (
              <button
                key={item.id}
                onClick={() => changeProfile(item.id)}
                title={item.desc}
                style={{
                  padding: "5px 11px",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: T.font,
                  fontSize: 11,
                  fontWeight: 700,
                  transition: "all 0.18s",
                  background: profile === item.id ? `${item.color}18` : "transparent",
                  color: profile === item.id ? item.color : T.textDark,
                  boxShadow: profile === item.id ? `0 0 10px ${item.color}15` : "none",
                  letterSpacing: "0.3px",
                }}
              >
                <span className="ca-profile-label">{item.icon}</span>
              </button>
            ))}
          </div>

          {/* Logout */}
          <button
            onClick={() => auth.logout()}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            style={{
              background: T.bgHover,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              color: T.textDim,
              cursor: "pointer",
              width: 36, height: 36,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = T.red + "60";
              e.currentTarget.style.color = T.red;
              e.currentTarget.style.background = T.redGlow;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = T.border;
              e.currentTarget.style.color = T.textDim;
              e.currentTarget.style.background = T.bgHover;
            }}
          >
            <LogOut size={14} strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* ─── Desktop Sidebar ─── */}
      <div className="ca-sidebar-desktop">
        <Sidebar
          view={view}
          setView={setView}
          readiness={readiness}
        />
      </div>

      {/* ─── Mobile Sidebar Overlay ─── */}
      {mobileSidebarOpen && (
        <>
          <div
            onClick={() => setMobileSidebarOpen(false)}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.6)",
              zIndex: 88,
              backdropFilter: "blur(4px)",
              animation: "fadeIn 0.2s ease",
            }}
          />
          <Sidebar
            view={view}
            setView={setView}
            readiness={readiness}
            onClose={() => setMobileSidebarOpen(false)}
          />
        </>
      )}
    </>
  );
}
