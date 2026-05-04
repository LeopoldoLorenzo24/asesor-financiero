import React, { useState, useMemo } from "react";
import { DollarSign, ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import { T, S } from "../theme";
import { GlassCard, SectionHeader } from "../components/common";

// ── Math ─────────────────────────────────────────────────────

function annualToMonthly(annualPct) {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

function monthsToGoal(pvUsd, pmtUsd, r, target = 1_000_000) {
  if (pvUsd >= target) return 0;
  if (r === 0) return pmtUsd > 0 ? (target - pvUsd) / pmtUsd : Infinity;
  const num = target * r + pmtUsd;
  const den = pvUsd * r + pmtUsd;
  if (den <= 0 || num / den <= 0) return Infinity;
  return Math.log(num / den) / Math.log(1 + r);
}

function buildYearlyTable(pvUsd, pmtUsd, r, maxYears = 50) {
  const rows = [];
  let balance = pvUsd;
  let totalDeposited = pvUsd;

  for (let year = 1; year <= maxYears; year++) {
    let yearInterest = 0;
    for (let m = 0; m < 12; m++) {
      const interest = balance * r;
      yearInterest += interest;
      balance += interest + pmtUsd;
    }
    totalDeposited += pmtUsd * 12;
    rows.push({
      year,
      yearDeposited: pmtUsd * 12,
      yearInterest: Math.round(yearInterest),
      totalDeposited: Math.round(totalDeposited),
      balance: Math.round(balance),
      reachedGoal: balance >= 1_000_000,
    });
    if (balance >= 1_000_000) break;
  }
  return rows;
}

function fmt(val, compact = false) {
  if (!Number.isFinite(val)) return "—";
  if (compact) {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}k`;
  }
  return `$${Math.round(val).toLocaleString("es-AR")}`;
}

function fmtYears(months) {
  if (!Number.isFinite(months) || months > 600 * 12) return "∞";
  const y = Math.floor(months / 12);
  const m = Math.round(months % 12);
  if (m === 0 || y === 0) return y === 0 ? `${m} meses` : `${y} años`;
  return `${y}a ${m}m`;
}

// ── Chart ─────────────────────────────────────────────────────

function CompoundChart({ pvUsd, pmtUsd, scenarios, target = 1_000_000 }) {
  const MAX_YEARS = 40;
  const W = 640, H = 200;
  const P = { t: 16, r: 52, b: 32, l: 56 };
  const cW = W - P.l - P.r;
  const cH = H - P.t - P.b;

  const allCurves = useMemo(() => scenarios.map((sc) => {
    const r = annualToMonthly(sc.annualPct);
    const pts = [{ yr: 0, bal: pvUsd }];
    let bal = pvUsd;
    for (let yr = 1; yr <= MAX_YEARS; yr++) {
      for (let m = 0; m < 12; m++) bal = bal * (1 + r) + pmtUsd;
      pts.push({ yr, bal });
      if (bal >= target * 1.05) break;
    }
    return { ...sc, pts };
  }), [pvUsd, pmtUsd, scenarios, target]);

  const maxBal = Math.max(target * 1.15, ...allCurves.flatMap((c) => c.pts.map((p) => p.bal)));
  const xMax = Math.max(...allCurves.flatMap((c) => c.pts.map((p) => p.yr)));

  const toX = (yr) => P.l + (yr / xMax) * cW;
  const toY = (bal) => P.t + cH - (bal / maxBal) * cH;
  const toPath = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.yr).toFixed(1)} ${toY(p.bal).toFixed(1)}`).join(" ");

  const targetY = toY(target);
  const yLabels = [0, 250_000, 500_000, 750_000, 1_000_000].filter((v) => v <= maxBal);
  const xLabels = [0, 5, 10, 15, 20, 25, 30, 35, 40].filter((v) => v <= xMax);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {/* Grid lines */}
      {yLabels.map((v) => {
        const y = toY(v);
        return (
          <g key={v}>
            <line x1={P.l} y1={y} x2={P.l + cW} y2={y}
              stroke="rgba(148,163,184,0.06)" strokeWidth="1" />
            <text x={P.l - 6} y={y + 4} fill="#475569" fontSize="9"
              textAnchor="end" fontFamily="monospace">
              {v === 0 ? "$0" : v >= 1_000_000 ? "$1M" : `$${v / 1000}k`}
            </text>
          </g>
        );
      })}

      {/* Target line */}
      <line x1={P.l} y1={targetY} x2={P.l + cW} y2={targetY}
        stroke="rgba(0,245,160,0.3)" strokeWidth="1.5" strokeDasharray="5,4" />
      <text x={P.l + cW + 5} y={targetY + 4} fill={T.green} fontSize="9"
        fontFamily="monospace" fontWeight="700">$1M</text>

      {/* Curves */}
      {allCurves.map((sc) => (
        <path key={sc.id} d={toPath(sc.pts)} fill="none"
          stroke={sc.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          opacity="0.85" />
      ))}

      {/* Goal intersection dots */}
      {allCurves.map((sc) => {
        const m = monthsToGoal(pvUsd, pmtUsd, annualToMonthly(sc.annualPct), target);
        if (!Number.isFinite(m) || m / 12 > xMax) return null;
        const dotX = toX(m / 12);
        return (
          <circle key={sc.id + "_dot"} cx={dotX} cy={targetY} r="4"
            fill={sc.color} stroke={T.bg} strokeWidth="2" />
        );
      })}

      {/* X axis */}
      {xLabels.map((yr) => (
        <text key={yr} x={toX(yr)} y={H - 2} fill="#475569" fontSize="9"
          textAnchor="middle" fontFamily="monospace">
          {yr === 0 ? "Hoy" : `${yr}a`}
        </text>
      ))}
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────

const SCENARIOS = [
  { id: "conservative", label: "Conservador", sublabel: "S&P 500 histórico", annualPct: 10, color: T.blue },
  { id: "moderate",     label: "Moderado",    sublabel: "CEDEAR con alpha",   annualPct: 18, color: T.green },
  { id: "aggressive",   label: "Agresivo",    sublabel: "Top performance",    annualPct: 25, color: T.yellow },
];

const TARGET = 1_000_000;

export default function GoalView({ portfolioValue = 0, capital = 0, ccl = null }) {
  const cclRate = ccl?.venta || ccl?.compra || (typeof ccl === "number" ? ccl : 0) || 1500;
  const currentUsd = cclRate > 0 ? (portfolioValue + capital) / cclRate : 0;

  const [monthlyUsd, setMonthlyUsd] = useState(300);
  const [selectedId, setSelectedId]  = useState("moderate");
  const [showFullTable, setShowFullTable] = useState(false);

  const scenario = SCENARIOS.find((s) => s.id === selectedId) || SCENARIOS[1];
  const monthlyRate = annualToMonthly(scenario.annualPct);

  const progressPct = Math.min(100, (currentUsd / TARGET) * 100);
  const remaining   = Math.max(0, TARGET - currentUsd);

  const months      = monthsToGoal(currentUsd, monthlyUsd, monthlyRate);
  const yearlyTable = useMemo(
    () => buildYearlyTable(currentUsd, monthlyUsd, monthlyRate, 50),
    [currentUsd, monthlyUsd, monthlyRate],
  );

  const accelRows = useMemo(() => {
    const deps = [50, 100, 200, 300, 500, 750, 1000, 1500, 2000];
    const base  = monthsToGoal(currentUsd, deps[0], monthlyRate);
    return deps.map((dep) => {
      const m = monthsToGoal(currentUsd, dep, monthlyRate);
      return { dep, months: m, savedMonths: base - m };
    });
  }, [currentUsd, monthlyRate]);

  const displayTable = showFullTable ? yearlyTable : yearlyTable.slice(0, 10);

  return (
    <div style={{ padding: "28px 32px 60px", maxWidth: 1200, margin: "0 auto" }}>
      <SectionHeader
        title="La Meta: $1,000,000 USD"
        subtitle="Proyección de crecimiento compuesto hasta la independencia financiera"
      />

      {/* ── Hero: posición actual vs objetivo ── */}
      <div style={{
        position: "relative", borderRadius: 28, overflow: "hidden",
        marginBottom: 24, padding: "28px 32px",
        border: `1px solid rgba(0,245,160,0.12)`,
        background: "rgba(15,23,42,0.65)",
        backdropFilter: "blur(32px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${T.green}80 30%, ${T.green} 50%, ${T.cyan}80 70%, transparent)`,
        }} />

        {/* Valores */}
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 20, marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 8 }}>
              Patrimonio actual (USD)
            </div>
            <div style={{ fontSize: 48, fontWeight: 900, fontFamily: T.fontMono, letterSpacing: "-2.5px", color: T.text, lineHeight: 1 }}>
              {fmt(currentUsd)}
            </div>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 8 }}>
              CCL ${Math.round(cclRate).toLocaleString("es-AR")} · {fmt(portfolioValue + capital)} ARS
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 8 }}>
              Objetivo
            </div>
            <div style={{
              fontSize: 48, fontWeight: 900, fontFamily: T.fontMono, letterSpacing: "-2.5px", lineHeight: 1,
              background: `linear-gradient(135deg, ${T.green}, ${T.cyan})`,
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              $1,000,000
            </div>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 8 }}>
              Faltan {fmt(remaining)} · {(100 - progressPct).toFixed(2)}% restante
            </div>
          </div>
        </div>

        {/* Barra de progreso */}
        <div style={{ height: 12, background: "rgba(148,163,184,0.07)", borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
          <div style={{
            height: "100%", borderRadius: 10,
            width: `${Math.max(0.4, progressPct)}%`,
            background: `linear-gradient(90deg, ${T.green}, ${T.cyan})`,
            boxShadow: `0 0 20px ${T.green}40`,
            transition: "width 1s cubic-bezier(0.4,0,0.2,1)",
          }} />
        </div>

        {/* Hitos */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {[100_000, 250_000, 500_000, 750_000, 1_000_000].map((m) => {
            const reached = currentUsd >= m;
            return (
              <div key={m} style={{ textAlign: "center" }}>
                <div style={{
                  width: 10, height: 10, borderRadius: "50%", margin: "0 auto 5px",
                  background: reached ? T.green : "rgba(148,163,184,0.15)",
                  boxShadow: reached ? `0 0 10px ${T.green}` : "none",
                  transition: "all 0.3s",
                }} />
                <div style={{ fontSize: 10, fontFamily: T.fontMono, color: reached ? T.green : T.textDark, fontWeight: reached ? 700 : 400 }}>
                  {m >= 1_000_000 ? "$1M" : `$${m / 1000}k`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Depósito mensual ── */}
      <GlassCard style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 240 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: `linear-gradient(135deg, ${T.green}, ${T.teal})`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <DollarSign size={20} color="#020617" strokeWidth={2} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Depósito mensual</div>
              <div style={{ fontSize: 11, color: T.textDim }}>¿Cuánto podés invertir por mes?</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: T.green, fontFamily: T.fontMono }}>USD</span>
            <input
              type="number"
              min={0}
              value={monthlyUsd}
              onChange={(e) => setMonthlyUsd(Math.max(0, parseInt(e.target.value) || 0))}
              style={{
                ...S.input, width: 110, fontSize: 22, fontWeight: 900,
                fontFamily: T.fontMono, textAlign: "center", color: T.green,
              }}
            />
            <div style={{ fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>
              ≈ ${Math.round(monthlyUsd * cclRate).toLocaleString("es-AR")} ARS
            </div>
          </div>
        </div>

        {/* Presets */}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {[50, 100, 200, 300, 500, 1000, 2000].map((v) => {
            const active = monthlyUsd === v;
            return (
              <button key={v} onClick={() => setMonthlyUsd(v)} style={{
                padding: "6px 14px", borderRadius: 10, cursor: "pointer",
                fontSize: 12, fontWeight: 700, fontFamily: T.fontMono,
                background: active ? `${T.green}15` : "transparent",
                border: `1px solid ${active ? T.green : T.border}`,
                color: active ? T.green : T.textDim,
                transition: "all 0.15s",
              }}>
                ${v}/mes
              </button>
            );
          })}
        </div>
      </GlassCard>

      {/* ── Escenarios ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 16, marginBottom: 24 }}>
        {SCENARIOS.map((sc) => {
          const r   = annualToMonthly(sc.annualPct);
          const m   = monthsToGoal(currentUsd, monthlyUsd, r);
          const isSelected = sc.id === selectedId;
          const totalDep = Number.isFinite(m) ? monthlyUsd * m : null;
          const totalInt = totalDep != null ? Math.max(0, TARGET - currentUsd - totalDep) : null;

          return (
            <div key={sc.id} onClick={() => setSelectedId(sc.id)} style={{
              background: isSelected ? `${sc.color}07` : T.bgCard,
              border: `1px solid ${isSelected ? sc.color + "35" : T.border}`,
              borderTop: `3px solid ${sc.color}`,
              borderRadius: 20, padding: "22px 24px", cursor: "pointer",
              backdropFilter: "blur(24px)",
              boxShadow: isSelected ? `0 8px 32px ${sc.color}18` : "none",
              transition: "all 0.2s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: sc.color, marginBottom: 3 }}>{sc.label}</div>
                  <div style={{ fontSize: 11, color: T.textDim }}>{sc.sublabel}</div>
                </div>
                <div style={{
                  fontSize: 18, fontWeight: 900, color: sc.color, fontFamily: T.fontMono,
                  background: `${sc.color}12`, padding: "4px 10px", borderRadius: 8,
                }}>
                  {sc.annualPct}% /año
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 5 }}>
                  Tiempo estimado
                </div>
                <div style={{ fontSize: 34, fontWeight: 900, color: T.text, fontFamily: T.fontMono, letterSpacing: "-1.5px", lineHeight: 1 }}>
                  {Number.isFinite(m) ? fmtYears(m) : "∞"}
                </div>
              </div>

              {totalDep != null && totalInt != null && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ background: "rgba(148,163,184,0.04)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Aportado</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.textMuted, fontFamily: T.fontMono }}>{fmt(totalDep + currentUsd, true)}</div>
                  </div>
                  <div style={{ background: "rgba(148,163,184,0.04)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Interés</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: sc.color, fontFamily: T.fontMono }}>{fmt(totalInt, true)}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Gráfico de curvas ── */}
      <GlassCard style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 4 }}>Curva de crecimiento compuesto</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {SCENARIOS.map((sc) => (
              <div key={sc.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 20, height: 3, borderRadius: 2, background: sc.color }} />
                <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{sc.label} {sc.annualPct}%</span>
              </div>
            ))}
          </div>
        </div>
        <CompoundChart pvUsd={currentUsd} pmtUsd={monthlyUsd} scenarios={SCENARIOS} target={TARGET} />
      </GlassCard>

      {/* ── Tabla de aceleración ── */}
      <GlassCard style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 4 }}>
            Tabla de aceleración — {scenario.label} ({scenario.annualPct}% anual)
          </div>
          <div style={{ fontSize: 12, color: T.textDim }}>
            Cuántos años ahorrás aumentando el depósito mensual
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Depósito/mes", "Tiempo al $1M", "Años ahorrados", "Capital aportado", "Interés generado"].map((h) => (
                  <th key={h} style={{
                    padding: "9px 14px", textAlign: "right",
                    fontSize: 9, fontWeight: 700, color: T.textDim,
                    fontFamily: T.fontMono, textTransform: "uppercase",
                    letterSpacing: "1px", borderBottom: `1px solid ${T.border}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accelRows.map(({ dep, months: m, savedMonths }, i) => {
                const isCurrent = dep === monthlyUsd;
                const totalDep = Number.isFinite(m) ? dep * m + currentUsd : null;
                const totalInt = totalDep != null ? Math.max(0, TARGET - totalDep) : null;
                return (
                  <tr key={dep} onClick={() => setMonthlyUsd(dep)}
                    style={{ background: isCurrent ? `${scenario.color}08` : "transparent", cursor: "pointer", transition: "background 0.15s" }}
                    onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = "rgba(148,163,184,0.04)"; }}
                    onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`, textAlign: "right" }}>
                      <span style={{ fontFamily: T.fontMono, fontWeight: isCurrent ? 800 : 600, color: isCurrent ? scenario.color : T.text }}>
                        ${dep}/mes
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`, textAlign: "right" }}>
                      <span style={{ fontFamily: T.fontMono, fontWeight: 700, color: T.text }}>
                        {Number.isFinite(m) ? fmtYears(m) : "∞"}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`, textAlign: "right" }}>
                      <span style={{ fontFamily: T.fontMono, fontWeight: 700, color: i === 0 ? T.textDim : T.green }}>
                        {i === 0 ? "—" : Number.isFinite(savedMonths) && savedMonths > 0 ? `−${fmtYears(savedMonths)}` : "—"}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`, textAlign: "right" }}>
                      <span style={{ fontFamily: T.fontMono, color: T.textMuted }}>
                        {totalDep != null ? fmt(totalDep, true) : "—"}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`, textAlign: "right" }}>
                      <span style={{ fontFamily: T.fontMono, color: scenario.color }}>
                        {totalInt != null ? fmt(totalInt, true) : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* ── Proyección año a año ── */}
      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 4 }}>
              Proyección año a año — {scenario.label}
            </div>
            <div style={{ fontSize: 12, color: T.textDim }}>
              ${monthlyUsd}/mes · {scenario.annualPct}% anual · partiendo de {fmt(currentUsd, true)} USD
            </div>
          </div>
          <button onClick={() => setShowFullTable(!showFullTable)} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "transparent", border: `1px solid ${T.border}`,
            borderRadius: 10, padding: "8px 14px", cursor: "pointer",
            color: T.textDim, fontSize: 12, fontWeight: 600, fontFamily: T.font,
            transition: "all 0.15s",
          }}>
            {showFullTable ? "Ver menos" : "Ver todo"}
            {showFullTable ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Año", "Aportado (año)", "Interés (año)", "Total aportado", "Interés acumulado", "Balance"].map((h) => (
                  <th key={h} style={{
                    padding: "9px 14px", textAlign: "right",
                    fontSize: 9, fontWeight: 700, color: T.textDim,
                    fontFamily: T.fontMono, textTransform: "uppercase",
                    letterSpacing: "1px", borderBottom: `1px solid ${T.border}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayTable.map((row) => {
                const accrued = row.balance - row.totalDeposited;
                return (
                  <tr key={row.year} style={{ background: row.reachedGoal ? `${scenario.color}08` : "transparent" }}>
                    <td style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`, textAlign: "right" }}>
                      <span style={{ fontFamily: T.fontMono, fontWeight: row.reachedGoal ? 900 : 600, color: row.reachedGoal ? scenario.color : T.text }}>
                        {row.reachedGoal ? `★ Año ${row.year}` : row.year}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`, textAlign: "right" }}>
                      <span style={{ fontFamily: T.fontMono, color: T.textMuted }}>{fmt(row.yearDeposited)}</span>
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`, textAlign: "right" }}>
                      <span style={{ fontFamily: T.fontMono, color: scenario.color }}>{fmt(row.yearInterest)}</span>
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`, textAlign: "right" }}>
                      <span style={{ fontFamily: T.fontMono, color: T.textMuted }}>{fmt(row.totalDeposited, true)}</span>
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`, textAlign: "right" }}>
                      <span style={{ fontFamily: T.fontMono, color: accrued > 0 ? scenario.color : T.red }}>{fmt(Math.max(0, accrued), true)}</span>
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`, textAlign: "right" }}>
                      <span style={{ fontFamily: T.fontMono, fontWeight: row.reachedGoal ? 900 : 700, fontSize: row.reachedGoal ? 14 : 12, color: row.reachedGoal ? scenario.color : T.text }}>
                        {fmt(row.balance, true)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!showFullTable && yearlyTable.length > 10 && (
          <div style={{ textAlign: "center", paddingTop: 14 }}>
            <button onClick={() => setShowFullTable(true)} style={{
              background: "transparent", border: `1px solid ${T.border}`,
              borderRadius: 10, padding: "8px 20px", cursor: "pointer",
              color: T.textDim, fontSize: 12, fontFamily: T.font,
            }}>
              Ver {yearlyTable.length - 10} años más
            </button>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
