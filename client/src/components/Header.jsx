import React, { useState, useEffect } from "react";
import { T, PROFILES } from "../theme";
import { auth } from "../api";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "◆" },
  { id: "readiness", label: "Readiness", icon: "●" },
  { id: "ranking", label: "Ranking", icon: "◎" },
  { id: "operaciones", label: "Operaciones", icon: "◈" },
  { id: "paper", label: "Paper", icon: "◇" },
  { id: "trackrecord", label: "Track Record", icon: "◉" },
  { id: "trading", label: "Señales", icon: "○" },
  { id: "adherence", label: "Seguimiento", icon: "◐" },
  { id: "risk", label: "Riesgo", icon: "◑" },
  { id: "performance", label: "Performance", icon: "◒" },
  { id: "benchmarks", label: "Benchmarks", icon: "◓" },
  { id: "backtest", label: "Backtest", icon: "◔" },
  { id: "predicciones", label: "Predicciones", icon: "◕" },
  { id: "evolution", label: "Evolución", icon: "◖" },
  { id: "health", label: "Salud", icon: "◗" },
  { id: "historial", label: "Historial", icon: "◘" },
];

function getReadinessTone(readiness) {
  if (!readiness) return { color: T.textDim, label: "--", dot: "●" };
  if (readiness.mode === "real_capital_ok") {
    return { color: T.green, label: `${readiness.grade || "A"}`, dot: "●" };
  }
  return { color: T.red, label: `${readiness.grade || "F"}`, dot: "○" };
}

export default function Header({ view, setView, profile, setProfile, ccl, readiness }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const readinessTone = getReadinessTone(readiness);

  const changeProfile = (nextProfile) => {
    setProfile(nextProfile);
    localStorage.setItem("cedear_profile", nextProfile);
  };

  const activeItem = navItems.find((n) => n.id === view);

  return (
    <>
      <style>{`
        .sidebar-link {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 10px 16px;
          border-radius: 14px;
          border: none;
          background: transparent;
          color: ${T.textDim};
          font-family: ${T.font};
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          width: 100%;
          text-align: left;
          position: relative;
          overflow: hidden;
        }
        .sidebar-link:hover {
          background: rgba(255,255,255,0.04);
          color: ${T.textMuted};
        }
        .sidebar-link.active {
          background: linear-gradient(135deg, rgba(0,229,160,0.12), rgba(0,229,160,0.04));
          color: ${T.green};
          box-shadow: inset 0 1px 0 rgba(0,229,160,0.1);
        }
        .sidebar-link.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 20px;
          background: ${T.green};
          border-radius: 0 4px 4px 0;
          box-shadow: 0 0 12px ${T.green};
        }
        .nav-badge {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1px;
          padding: 2px 8px;
          border-radius: 10px;
          background: ${T.bgElevated};
          color: ${T.textDim};
          font-family: ${T.fontMono};
        }
      `}</style>

      {/* Mobile hamburger */}
      <div style={{ display: "none" }} className="mobile-menu-trigger">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: "none", border: "none", color: T.text, fontSize: 24, cursor: "pointer" }}>☰</button>
      </div>

      {/* Top Header Bar */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 64,
          background: "rgba(3,5,8,0.85)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 32px",
          zIndex: 100,
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 40,
              height: 40,
              background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 900,
              color: T.bg,
              fontFamily: T.fontMono,
              boxShadow: `0 4px 24px ${T.green}40, 0 0 0 1px rgba(255,255,255,0.1) inset`,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <span style={{ position: "relative", zIndex: 2 }}>CA</span>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)" }} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.5px", color: T.text, lineHeight: 1.2 }}>
              CEDEAR ADVISOR
            </div>
            <div style={{ fontSize: 9, color: T.textDark, letterSpacing: "3px", fontWeight: 700, fontFamily: T.fontMono, marginTop: 1 }}>
              MOTOR DE INVERSION IA
            </div>
          </div>
        </div>

        {/* Center: Active View */}
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "2px" }}>
            {activeItem?.label}
          </span>
        </div>

        {/* Right: Info */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {ccl && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(14,18,32,0.6)", padding: "7px 14px", borderRadius: 12, border: `1px solid ${T.border}` }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.cyan, boxShadow: `0 0 10px ${T.cyan}`, animation: "pulse 2s infinite" }} />
              <span style={{ color: T.textDim, fontWeight: 600, fontSize: 10, fontFamily: T.fontMono }}>CCL</span>
              <span style={{ color: T.cyan, fontWeight: 800, fontFamily: T.fontMono, fontSize: 13 }}>${ccl.venta}</span>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(14,18,32,0.6)", padding: "7px 14px", borderRadius: 12, border: `1px solid ${T.border}` }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: readinessTone.color, boxShadow: `0 0 10px ${readinessTone.color}` }} />
            <span style={{ color: T.textDim, fontWeight: 600, fontSize: 10, fontFamily: T.fontMono }}>READINESS</span>
            <span style={{ color: readinessTone.color, fontWeight: 800, fontFamily: T.fontMono, fontSize: 13 }}>{readinessTone.label}</span>
          </div>

          <div style={{ display: "flex", gap: 2, background: "rgba(14,18,32,0.6)", borderRadius: 12, padding: 3, border: `1px solid ${T.border}` }}>
            {Object.values(PROFILES).map((item) => (
              <button
                key={item.id}
                onClick={() => changeProfile(item.id)}
                title={item.desc}
                style={{
                  padding: "6px 12px",
                  borderRadius: 10,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: T.font,
                  fontSize: 10,
                  fontWeight: 700,
                  transition: "all 0.2s",
                  background: profile === item.id ? `${item.color}18` : "transparent",
                  color: profile === item.id ? item.color : T.textDark,
                  boxShadow: profile === item.id ? `0 0 12px ${item.color}15` : "none",
                }}
              >
                {item.icon}
              </button>
            ))}
          </div>

          <button
            onClick={() => auth.logout()}
            title="Cerrar sesion"
            style={{
              background: "transparent",
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              color: T.textDim,
              cursor: "pointer",
              padding: "7px 12px",
              fontSize: 10,
              fontFamily: T.font,
              fontWeight: 600,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.target.style.borderColor = T.red; e.target.style.color = T.red; }}
            onMouseLeave={(e) => { e.target.style.borderColor = T.border; e.target.style.color = T.textDim; }}
          >
            Salir
          </button>
        </div>
      </header>

      {/* Left Sidebar */}
      <aside
        style={{
          position: "fixed",
          top: 64,
          left: 0,
          bottom: 0,
          width: 220,
          background: "rgba(3,5,8,0.7)",
          backdropFilter: "blur(40px) saturate(160%)",
          WebkitBackdropFilter: "blur(40px) saturate(160%)",
          borderRight: `1px solid ${T.border}`,
          padding: "20px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          overflowY: "auto",
          zIndex: 90,
        }}
      >
        <div style={{ fontSize: 9, color: T.textDark, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "2px", fontWeight: 700, padding: "0 16px 12px", borderBottom: `1px solid ${T.border}`, marginBottom: 8 }}>
          Navegacion
        </div>

        {navItems.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              className={`sidebar-link ${active ? "active" : ""}`}
              onClick={() => setView(item.id)}
            >
              <span style={{ fontSize: 13, opacity: active ? 1 : 0.5, width: 20, textAlign: "center" }}>{item.icon}</span>
              <span>{item.label}</span>
              {item.id === "readiness" && readiness?.mode === "real_capital_ok" && (
                <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: T.green, boxShadow: `0 0 8px ${T.green}` }} />
              )}
            </button>
          );
        })}

        <div style={{ marginTop: "auto", padding: "16px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 10, color: T.textDark, fontFamily: T.fontMono, textAlign: "center" }}>
            v3.0 · {new Date().getFullYear()}
          </div>
        </div>
      </aside>
    </>
  );
}
