import React, { useState } from "react";
import { T, PROFILES } from "../theme";
import { auth } from "../api";
import { PulseDot } from "../components/common";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "◈" },
  { id: "ranking", label: "Ranking", icon: "◆" },
  { id: "operaciones", label: "Operaciones", icon: "⟐" },
  { id: "paper", label: "Paper", icon: "◊" },
  { id: "trackrecord", label: "Track Record", icon: "◐" },
  { id: "trading", label: "Trading", icon: "▲" },
  { id: "adherence", label: "Seguimiento", icon: "◉" },
  { id: "risk", label: "Riesgo", icon: "◆" },
  { id: "performance", label: "Performance", icon: "◐" },
  { id: "benchmarks", label: "Benchmarks", icon: "◧" },
  { id: "backtest", label: "Backtest", icon: "↺" },
  { id: "predicciones", label: "Predicciones", icon: "◎" },
  { id: "evolution", label: "Evolución", icon: "◐" },
  { id: "health", label: "Salud", icon: "◈" },
  { id: "historial", label: "Historial", icon: "◉" },
];

export default function Header({ view, setView, profile, setProfile, ccl }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const changeProfile = (p) => { setProfile(p); localStorage.setItem("cedear_profile", p); };

  return (
    <header className="ca-header" style={{
      background: "rgba(2,4,10,0.85)",
      backdropFilter: "blur(24px) saturate(140%)",
      WebkitBackdropFilter: "blur(24px) saturate(140%)",
      borderBottom: `1px solid ${T.border}`,
      padding: "14px 32px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      flexWrap: "wrap", gap: 14, position: "sticky", top: 0, zIndex: 100,
    }}>
      {/* Brand */}
      <div className="ca-header-brand" style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{
          width: 44, height: 44,
          background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`,
          borderRadius: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, fontWeight: 900, color: T.bg,
          fontFamily: T.fontMono,
          boxShadow: `0 4px 24px ${T.green}40, 0 0 0 1px rgba(255,255,255,0.1) inset`,
          position: "relative", overflow: "hidden",
        }}>
          <span style={{ position: "relative", zIndex: 2 }}>₵</span>
          <div style={{
            position: "absolute", inset: 0,
            background: `linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)`,
          }} />
        </div>
        <div>
          <div style={{
            fontSize: 19, fontWeight: 900, letterSpacing: "-0.5px",
            background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>CEDEAR ADVISOR</div>
          <div style={{ fontSize: 9, color: T.textDark, letterSpacing: "3.5px", fontWeight: 700, marginTop: 2, fontFamily: T.fontMono }}>
            MOTOR DE INVERSIÓN IA v3
          </div>
        </div>
      </div>

      {/* Desktop Nav */}
      <nav className="ca-nav" style={{
        display: "flex", gap: 2,
        background: "rgba(13,18,30,0.6)",
        borderRadius: 16, padding: 4,
        border: `1px solid ${T.border}`,
        flexWrap: "wrap",
        backdropFilter: "blur(12px)",
      }}>
        {navItems.map((item) => {
          const active = view === item.id;
          return (
            <button key={item.id} onClick={() => { setView(item.id); setMobileOpen(false); }} style={{
              padding: "9px 14px", borderRadius: 12, border: "none", cursor: "pointer",
              fontFamily: T.font, fontWeight: 700, fontSize: 11,
              transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
              background: active ? `linear-gradient(135deg, ${T.green}, #00b894)` : "transparent",
              color: active ? "#fff" : T.textDim,
              boxShadow: active ? `0 2px 16px ${T.green}35` : "none",
              display: "flex", alignItems: "center", gap: 5,
              whiteSpace: "nowrap",
            }}>
              <span style={{ opacity: active ? 1 : 0.5, fontSize: 10 }}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Right section: CCL + Profile + Logout */}
      <div className="ca-header-info" style={{ display: "flex", gap: 18, fontSize: 12, alignItems: "center", flexWrap: "wrap" }}>
        {ccl && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(13,18,30,0.5)", padding: "6px 14px",
            borderRadius: 12, border: `1px solid ${T.border}`,
          }}>
            <PulseDot color={T.cyan} size={6} />
            <span style={{ color: T.textDim, fontWeight: 600, fontSize: 11 }}>CCL</span>
            <span style={{ color: T.cyan, fontWeight: 800, fontFamily: T.fontMono, fontSize: 13 }}>${ccl.venta}</span>
          </div>
        )}

        <div style={{
          display: "flex", gap: 2,
          background: "rgba(13,18,30,0.5)",
          borderRadius: 12, padding: 3,
          border: `1px solid ${T.border}`,
        }}>
          {Object.values(PROFILES).map((p) => (
            <button key={p.id} onClick={() => changeProfile(p.id)} title={p.desc} style={{
              padding: "6px 12px", borderRadius: 10, border: "none", cursor: "pointer",
              fontFamily: T.font, fontSize: 10, fontWeight: 700,
              transition: "all 0.2s ease",
              background: profile === p.id ? `${p.color}18` : "transparent",
              color: profile === p.id ? p.color : T.textDark,
              boxShadow: profile === p.id ? `0 0 10px ${p.color}12` : "none",
            }}>
              {p.icon} {p.label}
            </button>
          ))}
        </div>

        <button onClick={() => auth.logout()} title="Cerrar sesión" style={{
          background: "transparent", border: `1px solid ${T.border}`,
          borderRadius: 10, color: T.textDim, cursor: "pointer",
          padding: "6px 12px", fontSize: 10, fontFamily: T.font,
          fontWeight: 600, transition: "all 0.2s",
        }}>Salir ⏻</button>
      </div>
    </header>
  );
}
