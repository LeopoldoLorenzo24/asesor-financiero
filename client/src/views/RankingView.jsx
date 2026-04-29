import React, { useState } from "react";
import { TrendingUp, TrendingDown, ChevronUp, ChevronDown, ChevronsUpDown, Medal, Filter, SlidersHorizontal, BarChart2 } from "lucide-react";
import { T, S, signalColors } from "../theme";
import { GlassCard, Skeleton, SectionHeader, HeatBadge } from "../components/common";

const RANK_MEDALS = {
  1: { label: "1", bg: "linear-gradient(135deg, #fbbf24, #f59e0b)", shadow: "0 0 16px rgba(251,191,36,0.45)", color: "#000" },
  2: { label: "2", bg: "linear-gradient(135deg, #94a3b8, #64748b)", shadow: "0 0 12px rgba(148,163,184,0.35)", color: "#000" },
  3: { label: "3", bg: "linear-gradient(135deg, #fb923c, #ea580c)", shadow: "0 0 12px rgba(251,146,60,0.35)", color: "#000" },
};

const SIGNAL_META = {
  STRONG_BUY:  { color: "#00f5a0", label: "SB",  pulse: true  },
  BUY:         { color: "#22d3ee", label: "B",   pulse: false },
  HOLD:        { color: "#fbbf24", label: "H",   pulse: false },
  SELL:        { color: "#fb923c", label: "S",   pulse: false },
  STRONG_SELL: { color: "#ff3366", label: "SS",  pulse: true  },
};

function RankBadge({ rank }) {
  if (rank <= 3) {
    const m = RANK_MEDALS[rank];
    return (
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: m.bg, boxShadow: m.shadow,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 900, color: m.color,
        fontFamily: T.fontMono, flexShrink: 0,
      }}>
        {rank}
      </div>
    );
  }
  return (
    <span style={{ fontFamily: T.fontMono, fontWeight: 600, color: T.textDark, fontSize: 11 }}>
      {rank}
    </span>
  );
}

function SignalBadge({ signal, color }) {
  const meta = SIGNAL_META[signal] || { color, label: signal?.slice(0, 2) || "?", pulse: false };
  const c = meta.color || color || T.textDim;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {meta.pulse && (
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: c, boxShadow: `0 0 8px ${c}`,
          animation: "pulse 2s ease-in-out infinite",
          flexShrink: 0,
        }} />
      )}
      <span style={{
        ...S.badge(c),
        fontSize: 9, padding: "4px 10px",
        letterSpacing: "1px",
      }}>
        {signal?.replace("_", " ")}
      </span>
    </div>
  );
}

function ScoreBar({ value, max = 100, color }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const c = color || (value >= 70 ? T.green : value >= 50 ? T.yellow : T.red);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontFamily: T.fontMono, fontWeight: 800, fontSize: 13, color: c, minWidth: 26, textAlign: "right" }}>
        {Math.round(value)}
      </span>
      <div style={{ flex: 1, height: 4, background: "rgba(148,163,184,0.1)", borderRadius: 4, overflow: "hidden", minWidth: 48 }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 4,
          background: `linear-gradient(90deg, ${c}80, ${c})`,
          transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
        }} />
      </div>
    </div>
  );
}

function MiniScore({ value }) {
  if (value == null) return <span style={{ color: T.textDark, fontFamily: T.fontMono, fontSize: 11 }}>—</span>;
  const c = value >= 70 ? T.green : value >= 50 ? T.yellow : value >= 30 ? T.orange : T.red;
  return <span style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, color: c }}>{Math.round(value)}</span>;
}

function SortHeader({ label, field, sortBy, sortDir, onSort }) {
  const active = sortBy === field;
  return (
    <th
      style={{ ...S.th, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => onSort(field)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ color: active ? T.text : T.textDim, transition: "color 0.2s" }}>{label}</span>
        <div style={{ opacity: active ? 1 : 0.3, transition: "opacity 0.2s" }}>
          {active
            ? (sortDir === "desc" ? <ChevronDown size={11} color={T.cyan} /> : <ChevronUp size={11} color={T.cyan} />)
            : <ChevronsUpDown size={10} color={T.textDim} />}
        </div>
      </div>
    </th>
  );
}

export default function RankingView({ sectors, filterSector, setFilterSector, sortBy, setSortBy, loading, filtered, loadDetail }) {
  const [sortDir, setSortDir] = useState("desc");
  const [internalSort, setInternalSort] = useState(sortBy || "composite");

  const handleSort = (field) => {
    const fieldMap = { composite: "composite", technical: "technical", fundamental: "fundamental", change: "change" };
    if (internalSort === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setInternalSort(field);
      setSortDir("desc");
      if (setSortBy && fieldMap[field]) setSortBy(fieldMap[field]);
    }
  };

  // Stats summary
  const strongBuy = filtered.filter((x) => x.scores?.signal === "STRONG_BUY").length;
  const buy = filtered.filter((x) => x.scores?.signal === "BUY").length;
  const avgScore = filtered.length ? Math.round(filtered.reduce((s, x) => s + (x.scores?.composite || 0), 0) / filtered.length) : 0;

  return (
    <div className="ca-main" style={{ padding: "32px", maxWidth: 1440, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader
        title="Ranking de CEDEARs"
        subtitle={`${filtered.length} tickers · Score compuesto técnico + fundamental + sentimiento`}
        action={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 14 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: T.green, fontFamily: T.fontMono, lineHeight: 1 }}>{strongBuy}</div>
                <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginTop: 3 }}>Strong Buy</div>
              </div>
              <div style={{ width: 1, background: T.border }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: T.cyan, fontFamily: T.fontMono, lineHeight: 1 }}>{buy}</div>
                <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginTop: 3 }}>Buy</div>
              </div>
              <div style={{ width: 1, background: T.border }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: T.textMuted, fontFamily: T.fontMono, lineHeight: 1 }}>{avgScore}</div>
                <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px", marginTop: 3 }}>Avg Score</div>
              </div>
            </div>
          </div>
        }
      />

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginRight: 4 }}>
          <Filter size={13} color={T.textDim} />
          <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "1.5px" }}>Sector</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {sectors.map((s) => {
            const active = filterSector === s;
            return (
              <button key={s} onClick={() => setFilterSector(s)} style={{
                padding: "7px 15px", borderRadius: 10,
                border: `1px solid ${active ? T.green + "40" : T.border}`,
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.fontMono,
                background: active ? `linear-gradient(135deg, ${T.green}20, ${T.cyan}10)` : "rgba(13,18,30,0.5)",
                color: active ? T.green : T.textDim,
                boxShadow: active ? `0 2px 12px ${T.green}18` : "none",
                transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
                whiteSpace: "nowrap",
              }}>
                {s}
              </button>
            );
          })}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <SlidersHorizontal size={13} color={T.textDim} />
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setInternalSort(e.target.value); }}
            style={{ ...S.input, width: "auto", padding: "8px 14px", fontSize: 11, borderRadius: 10, fontFamily: T.fontMono, cursor: "pointer" }}
          >
            <option value="composite">Score Compuesto</option>
            <option value="technical">Técnico</option>
            <option value="fundamental">Fundamental</option>
            <option value="change">Cambio 1M</option>
          </select>
        </div>
      </div>

      {loading ? (
        <GlassCard><Skeleton width="100%" height={500} /></GlassCard>
      ) : filtered.length === 0 ? (
        <GlassCard style={{ textAlign: "center", padding: 64 }}>
          <BarChart2 size={40} color={T.textDark} style={{ margin: "0 auto 16px" }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: T.textMuted, marginBottom: 8 }}>Sin resultados</div>
          <div style={{ fontSize: 12, color: T.textDim }}>Cambiá el filtro de sector para ver tickers</div>
        </GlassCard>
      ) : (
        <GlassCard style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...S.th, width: 44, textAlign: "center" }}>#</th>
                  <th style={S.th}>Ticker</th>
                  <th style={S.th}>Nombre</th>
                  <th style={S.th} className="ca-hide-mobile">Sector</th>
                  <SortHeader label="Score" field="composite" sortBy={internalSort} sortDir={sortDir} onSort={handleSort} />
                  <th style={S.th}>Señal</th>
                  <SortHeader label="Téc" field="technical" sortBy={internalSort} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Fund" field="fundamental" sortBy={internalSort} sortDir={sortDir} onSort={handleSort} />
                  <th style={S.th} className="ca-hide-mobile">Sent</th>
                  <th style={S.th}>Precio ARS</th>
                  <SortHeader label="1M" field="change" sortBy={internalSort} sortDir={sortDir} onSort={handleSort} />
                  <th style={S.th} className="ca-hide-mobile">RSI</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, i) => {
                  const rank = i + 1;
                  const signalColor = item.scores?.signalColor || signalColors[item.scores?.signal] || T.textDim;
                  const signal = item.scores?.signal || "";
                  const month1 = item.technical?.indicators?.performance?.month1 || 0;
                  const isTop3 = rank <= 3;
                  const rowSignalColor = SIGNAL_META[signal]?.color || signalColor;

                  return (
                    <tr
                      key={item.cedear.ticker}
                      onClick={() => loadDetail(item.cedear.ticker)}
                      style={{
                        cursor: "pointer",
                        transition: "background 0.18s ease",
                        background: isTop3 ? `${rowSignalColor}04` : "transparent",
                        borderLeft: isTop3 ? `3px solid ${rowSignalColor}60` : `3px solid transparent`,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = isTop3 ? `${rowSignalColor}09` : "rgba(148,163,184,0.035)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isTop3 ? `${rowSignalColor}04` : "transparent";
                      }}
                    >
                      {/* Rank */}
                      <td style={{ ...S.td, textAlign: "center", width: 44, paddingLeft: 12, paddingRight: 12 }}>
                        <RankBadge rank={rank} />
                      </td>

                      {/* Ticker */}
                      <td style={S.td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {signal && (
                            <div style={{
                              width: 3, height: 28, borderRadius: 3,
                              background: rowSignalColor,
                              boxShadow: isTop3 ? `0 0 8px ${rowSignalColor}80` : "none",
                              flexShrink: 0,
                            }} />
                          )}
                          <strong style={{ color: T.text, fontFamily: T.fontMono, fontSize: 13, fontWeight: 900, letterSpacing: "0.3px" }}>
                            {item.cedear.ticker}
                          </strong>
                        </div>
                      </td>

                      {/* Name */}
                      <td style={S.td}>
                        <span style={{ color: T.textMuted, fontSize: 12, maxWidth: 160, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.cedear.name}
                        </span>
                      </td>

                      {/* Sector */}
                      <td style={S.td} className="ca-hide-mobile">
                        <span style={{ fontSize: 10, color: T.textDim, fontWeight: 700, fontFamily: T.fontMono, background: "rgba(148,163,184,0.07)", padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>
                          {item.cedear.sector}
                        </span>
                      </td>

                      {/* Composite Score bar */}
                      <td style={{ ...S.td, minWidth: 110 }}>
                        <ScoreBar value={item.scores?.composite || 0} />
                      </td>

                      {/* Signal badge */}
                      <td style={S.td}>
                        <SignalBadge signal={signal} color={signalColor} />
                      </td>

                      {/* Technical */}
                      <td style={{ ...S.td, textAlign: "center" }} className="ca-hide-mobile">
                        <MiniScore value={item.scores?.techScore} />
                      </td>

                      {/* Fundamental */}
                      <td style={{ ...S.td, textAlign: "center" }} className="ca-hide-mobile">
                        <MiniScore value={item.scores?.fundScore} />
                      </td>

                      {/* Sentiment */}
                      <td style={{ ...S.td, textAlign: "center" }} className="ca-hide-mobile">
                        <MiniScore value={item.scores?.sentScore} />
                      </td>

                      {/* Price */}
                      <td style={S.td}>
                        <span style={{ fontFamily: T.fontMono, fontWeight: 700, color: T.text, fontSize: 12 }}>
                          ${item.priceARS?.toLocaleString("es-AR") || "—"}
                        </span>
                      </td>

                      {/* 1M change */}
                      <td style={{ ...S.td }} className="ca-hide-mobile">
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {month1 >= 0
                            ? <TrendingUp size={11} color={T.green} />
                            : <TrendingDown size={11} color={T.red} />
                          }
                          <span style={{ fontFamily: T.fontMono, fontWeight: 700, fontSize: 12, color: month1 >= 0 ? T.green : T.red }}>
                            {month1 >= 0 ? "+" : ""}{month1.toFixed(1)}%
                          </span>
                        </div>
                      </td>

                      {/* RSI */}
                      <td style={{ ...S.td, textAlign: "center" }} className="ca-hide-mobile">
                        {(() => {
                          const rsi = item.technical?.indicators?.rsi;
                          if (rsi == null) return <span style={{ color: T.textDark, fontFamily: T.fontMono, fontSize: 11 }}>—</span>;
                          const c = rsi >= 70 ? T.red : rsi <= 30 ? T.green : T.textDim;
                          return <span style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, color: c }}>{rsi}</span>;
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: T.textDark, fontFamily: T.fontMono }}>
              {filtered.length} resultados
            </span>
            <div style={{ display: "flex", gap: 16 }}>
              {Object.entries(SIGNAL_META).map(([key, meta]) => {
                const count = filtered.filter((x) => x.scores?.signal === key).length;
                if (!count) return null;
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color }} />
                    <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono }}>{key.replace("_", " ")}</span>
                    <span style={{ fontSize: 10, color: meta.color, fontFamily: T.fontMono, fontWeight: 700 }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
