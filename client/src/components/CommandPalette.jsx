import React, { useState, useEffect, useRef, useCallback } from "react";
import { LayoutDashboard, ShieldCheck, BarChart2, Wallet, FlaskConical, Trophy, TrendingUp, Target, LineChart, Activity, History, Zap, Brain, CheckSquare, AlertTriangle, Layers, Search, ArrowRight, Command, CornerDownLeft } from "lucide-react";
import { T } from "../theme";

const NAV_ITEMS = [
  { id: "dashboard",    label: "Dashboard",       group: "Visión General",  Icon: LayoutDashboard, desc: "Análisis IA, picks y patrimonio" },
  { id: "readiness",    label: "Readiness",        group: "Visión General",  Icon: ShieldCheck,     desc: "Gobernanza y habilitación de capital real" },
  { id: "ranking",      label: "Ranking",           group: "Portfolio",       Icon: BarChart2,       desc: "Score compuesto de todos los CEDEARs" },
  { id: "operaciones",  label: "Operaciones",       group: "Portfolio",       Icon: Wallet,          desc: "Cartera real y reconciliación con broker" },
  { id: "paper",        label: "Paper Trading",     group: "Portfolio",       Icon: FlaskConical,    desc: "Portfolio virtual con costos reales" },
  { id: "trading",      label: "Señales",           group: "Análisis",        Icon: Zap,             desc: "Señales de trading activas" },
  { id: "predicciones", label: "Predicciones",      group: "Análisis",        Icon: Brain,           desc: "Predicciones del bot evaluadas" },
  { id: "backtest",     label: "Backtest",          group: "Análisis",        Icon: Layers,          desc: "Simulación histórica de estrategias" },
  { id: "trackrecord",  label: "Track Record",      group: "Performance",     Icon: Trophy,          desc: "Evidencia real vs SPY" },
  { id: "benchmarks",   label: "Benchmarks",        group: "Performance",     Icon: TrendingUp,      desc: "Comparativa vs SPY y DCA" },
  { id: "performance",  label: "Performance",       group: "Performance",     Icon: Target,          desc: "Accuracy y retorno del bot" },
  { id: "evolution",    label: "Evolución",         group: "Performance",     Icon: LineChart,       desc: "Evolución del capital en el tiempo" },
  { id: "adherence",    label: "Seguimiento",       group: "Performance",     Icon: CheckSquare,     desc: "Adherencia a recomendaciones" },
  { id: "risk",         label: "Riesgo",            group: "Performance",     Icon: AlertTriangle,   desc: "Sharpe, drawdown, VaR, beta" },
  { id: "goal",         label: "Meta $1M",          group: "Performance",     Icon: Target,          desc: "Proyección de crecimiento hasta $1M USD" },
  { id: "monitor",      label: "Monitor Intradía",  group: "Sistema",         Icon: Activity,        desc: "Snapshots intradía y eventos del mercado abierto" },
  { id: "health",       label: "Salud del Sistema", group: "Sistema",         Icon: Activity,        desc: "Estado operativo y providers" },
  { id: "historial",    label: "Historial",         group: "Sistema",         Icon: History,         desc: "Sesiones de análisis pasadas" },
];

const GROUP_ORDER = ["Visión General", "Portfolio", "Análisis", "Performance", "Sistema"];

export default function CommandPalette({ onNavigate, ranking = [] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const tickerMatches = ranking
    .filter((r) => {
      if (!query || query.length < 2) return false;
      const q = query.toUpperCase();
      return r.cedear?.ticker?.includes(q) || r.cedear?.name?.toUpperCase().includes(q);
    })
    .slice(0, 4);

  const navMatches = NAV_ITEMS.filter((item) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return item.label.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q) || item.group.toLowerCase().includes(q);
  });

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: navMatches.filter((i) => i.group === group),
  })).filter((g) => g.items.length > 0);

  // Build flat list for keyboard navigation
  const flatItems = [
    ...tickerMatches.map((r) => ({ type: "ticker", id: r.cedear.ticker, label: r.cedear.ticker, desc: r.cedear.name })),
    ...navMatches,
  ];

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setCursor(0);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery("");
        setCursor(0);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === "Escape") { close(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, flatItems.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter") {
      const item = flatItems[cursor];
      if (item) { onNavigate(item.id || item.label); close(); }
    }
  };

  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector("[data-active=true]");
    if (active) active.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  let flatIdx = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(2,6,23,0.7)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          zIndex: 9000,
          animation: "fadeIn 0.15s ease",
        }}
      />

      {/* Palette */}
      <div
        style={{
          position: "fixed",
          top: "18%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(580px, calc(100vw - 32px))",
          background: "rgba(10, 15, 30, 0.95)",
          backdropFilter: "blur(48px) saturate(200%)",
          WebkitBackdropFilter: "blur(48px) saturate(200%)",
          border: `1px solid rgba(148,163,184,0.12)`,
          borderRadius: 20,
          boxShadow: "0 32px 96px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,245,160,0.06)",
          zIndex: 9001,
          overflow: "hidden",
          animation: "paletteIn 0.18s cubic-bezier(0.4,0,0.2,1)",
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 18px",
          borderBottom: `1px solid rgba(148,163,184,0.07)`,
        }}>
          <Search size={16} color={T.textDim} strokeWidth={2} style={{ flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar sección o ticker..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 15,
              color: T.text,
              fontFamily: T.font,
              caretColor: T.green,
            }}
          />
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "3px 8px",
            borderRadius: 6,
            border: `1px solid rgba(148,163,184,0.12)`,
            background: "rgba(148,163,184,0.05)",
          }}>
            <span style={{ fontSize: 10, color: T.textDark, fontFamily: T.fontMono }}>ESC</span>
          </div>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: 400, overflowY: "auto", padding: "8px 0" }}>
          {/* Ticker matches */}
          {tickerMatches.length > 0 && (
            <div>
              <div style={{ padding: "6px 18px 4px", fontSize: 10, fontWeight: 700, color: T.textDark, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px" }}>
                Tickers
              </div>
              {tickerMatches.map((r) => {
                const idx = flatIdx++;
                const active = cursor === idx;
                return (
                  <PaletteItem
                    key={r.cedear.ticker}
                    active={active}
                    icon={<span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 900, color: T.cyan }}>{r.cedear.ticker}</span>}
                    label={r.cedear.ticker}
                    desc={r.cedear.name}
                    badge={r.scores?.signal}
                    onClick={() => { onNavigate("ranking"); close(); }}
                  />
                );
              })}
            </div>
          )}

          {/* Nav groups */}
          {grouped.map(({ group, items }) => (
            <div key={group}>
              <div style={{ padding: "8px 18px 4px", fontSize: 10, fontWeight: 700, color: T.textDark, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px" }}>
                {group}
              </div>
              {items.map((item) => {
                const idx = flatIdx++;
                const active = cursor === idx;
                return (
                  <PaletteItem
                    key={item.id}
                    active={active}
                    icon={<item.Icon size={15} color={active ? T.green : T.textDim} strokeWidth={1.8} />}
                    label={item.label}
                    desc={item.desc}
                    onClick={() => { onNavigate(item.id); close(); }}
                  />
                );
              })}
            </div>
          ))}

          {flatItems.length === 0 && (
            <div style={{ padding: "32px 18px", textAlign: "center", color: T.textDim, fontSize: 13 }}>
              Sin resultados para "{query}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 18px",
          borderTop: `1px solid rgba(148,163,184,0.06)`,
          background: "rgba(148,163,184,0.02)",
        }}>
          <div style={{ display: "flex", gap: 14 }}>
            {[
              { keys: ["↑", "↓"], label: "navegar" },
              { keys: ["↵"], label: "ir" },
              { keys: ["esc"], label: "cerrar" },
            ].map(({ keys, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                {keys.map((k) => (
                  <kbd key={k} style={{
                    background: "rgba(148,163,184,0.08)",
                    border: `1px solid rgba(148,163,184,0.12)`,
                    borderRadius: 5,
                    padding: "2px 6px",
                    fontSize: 10,
                    color: T.textDim,
                    fontFamily: T.fontMono,
                    letterSpacing: "0.5px",
                  }}>{k}</kbd>
                ))}
                <span style={{ fontSize: 10, color: T.textDark }}>{label}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Command size={11} color={T.textDark} />
            <span style={{ fontSize: 10, color: T.textDark, fontFamily: T.fontMono }}>K</span>
            <span style={{ fontSize: 10, color: T.textDark }}>para abrir</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes paletteIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}

function PaletteItem({ active, icon, label, desc, badge, onClick }) {
  return (
    <div
      data-active={active}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 18px",
        cursor: "pointer",
        background: active ? `linear-gradient(90deg, ${T.green}08, transparent)` : "transparent",
        borderLeft: `2px solid ${active ? T.green : "transparent"}`,
        transition: "all 0.12s ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `${T.green}06`; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = active ? `linear-gradient(90deg, ${T.green}08, transparent)` : "transparent"; }}
    >
      <div style={{ width: 28, height: 28, borderRadius: 8, background: active ? `${T.green}14` : "rgba(148,163,184,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? T.text : T.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {label}
        </div>
        {desc && <div style={{ fontSize: 11, color: T.textDark, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{desc}</div>}
      </div>
      {badge && (
        <span style={{ fontSize: 9, fontFamily: T.fontMono, fontWeight: 800, color: T.cyan, background: `${T.cyan}14`, border: `1px solid ${T.cyan}22`, borderRadius: 5, padding: "2px 7px", flexShrink: 0 }}>
          {badge.replace("_", " ")}
        </span>
      )}
      {active && <ArrowRight size={12} color={T.green} style={{ flexShrink: 0 }} />}
    </div>
  );
}
