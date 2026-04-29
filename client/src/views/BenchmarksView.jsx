import React, { Suspense } from "react";
import { BarChart2, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { T, S } from "../theme";
import { GlassCard, SectionHeader, Skeleton } from "../components/common";

const CapitalChart = React.lazy(() => import("../components/CapitalChart"));

const BENCHMARK_META = {
  spy_return_pct:         { label: "SPY Total",          desc: "Benchmark principal",         color: T.yellow },
  portfolio_return_pct:   { label: "Portfolio Real",      desc: "Retorno real del portfolio",  color: T.green  },
  alpha_pct:              { label: "Alpha",               desc: "Exceso vs SPY",               color: T.cyan   },
  spy_dca_return_pct:     { label: "SPY DCA",             desc: "DCA mensual en SPY",          color: T.blue   },
  real_vs_spy_dca_pct:    { label: "Real vs DCA",         desc: "Ventaja sobre DCA",           color: T.purple },
  virtual_return_pct:     { label: "Virtual Return",      desc: "Portfolio virtual (paper)",   color: T.teal   },
};

function BenchmarkCard({ label, desc, value, color, i }) {
  const isPositive = value >= 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  const pct = Math.min(100, Math.abs(value) / 50 * 100);

  return (
    <GlassCard
      glowColor={color}
      style={{ animation: `fadeUp 0.4s ease ${i * 60}ms both` }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ ...S.label, marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: 11, color: T.textDark, lineHeight: 1.4 }}>{desc}</div>
        </div>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: `${color}14`, border: `1px solid ${color}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={15} color={color} strokeWidth={1.8} />
        </div>
      </div>

      <div style={{ fontSize: 30, fontWeight: 900, color, fontFamily: T.fontMono, letterSpacing: "-1px", lineHeight: 1, marginBottom: 10 }}>
        {isPositive ? "+" : ""}{value.toFixed(2)}%
      </div>

      {/* Mini gauge */}
      <div style={{ height: 3, background: "rgba(148,163,184,0.08)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: `linear-gradient(90deg, ${color}60, ${color})`,
          borderRadius: 4,
          transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: `0 0 6px ${color}60`,
        }} />
      </div>

      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}80` }} />
        <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono }}>
          {isPositive ? "positivo" : "negativo"}
        </span>
      </div>
    </GlassCard>
  );
}

export default function BenchmarksView({ benchLoading, benchmarks, capitalHistory }) {
  const entries = benchmarks
    ? Object.entries(benchmarks)
        .filter(([k, v]) => k !== "timestamp" && typeof v === "number")
        .map(([k, v]) => {
          const meta = BENCHMARK_META[k] || { label: k.replace(/_/g, " "), desc: "", color: T.textMuted };
          return { key: k, value: v, ...meta };
        })
    : [];

  const alpha = entries.find((e) => e.key === "alpha_pct");
  const portfolioReturn = entries.find((e) => e.key === "portfolio_return_pct");
  const spyReturn = entries.find((e) => e.key === "spy_return_pct");

  return (
    <div className="ca-main" style={{ padding: "28px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader
        title="Benchmarks de Performance"
        subtitle="Comparativa del portfolio real vs SPY y estrategia DCA"
        action={!benchLoading && alpha && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={13} color={alpha.value >= 0 ? T.green : T.red} />
            <span style={{ fontSize: 12, fontFamily: T.fontMono, fontWeight: 700, color: alpha.value >= 0 ? T.green : T.red }}>
              Alpha: {alpha.value >= 0 ? "+" : ""}{alpha.value.toFixed(2)}%
            </span>
          </div>
        )}
      />

      {/* Hero comparison strip */}
      {!benchLoading && spyReturn && portfolioReturn && (
        <GlassCard style={{ marginBottom: 20, padding: "20px 24px" }} glowColor={portfolioReturn.value > spyReturn.value ? T.green : T.red}>
          <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 6 }}>
                Portfolio Real vs SPY
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, marginBottom: 2 }}>PORTFOLIO</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: portfolioReturn.value >= 0 ? T.green : T.red, fontFamily: T.fontMono, lineHeight: 1 }}>
                    {portfolioReturn.value >= 0 ? "+" : ""}{portfolioReturn.value.toFixed(2)}%
                  </div>
                </div>
                <div style={{ fontSize: 18, color: T.textDark, fontFamily: T.fontMono }}>vs</div>
                <div>
                  <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, marginBottom: 2 }}>SPY</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: T.yellow, fontFamily: T.fontMono, lineHeight: 1 }}>
                    {spyReturn.value >= 0 ? "+" : ""}{spyReturn.value.toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>
            {alpha && (
              <div style={{ padding: "14px 20px", borderRadius: 14, background: `${alpha.value >= 0 ? T.green : T.red}08`, border: `1px solid ${alpha.value >= 0 ? T.green : T.red}20` }}>
                <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 4 }}>Alpha generado</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: alpha.value >= 0 ? T.green : T.red, fontFamily: T.fontMono, lineHeight: 1 }}>
                  {alpha.value >= 0 ? "+" : ""}{alpha.value.toFixed(2)}%
                </div>
                <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>
                  {alpha.value >= 0 ? "Supera al mercado" : "Por debajo del mercado"}
                </div>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      <div style={{ ...S.grid(220), gap: 16, marginBottom: 24 }}>
        {benchLoading
          ? [1,2,3,4].map(i => <GlassCard key={i}><Skeleton width="60%" height={14} /><div style={{marginTop:12}}><Skeleton width="80%" height={28} /></div></GlassCard>)
          : entries.length === 0
            ? (
              <GlassCard style={{ gridColumn: "1/-1" }}>
                <div style={{ textAlign: "center", padding: 60, color: T.textDim }}>
                  <BarChart2 size={36} color={T.textDark} style={{ marginBottom: 12 }} />
                  <div>No hay datos de benchmark disponibles.</div>
                </div>
              </GlassCard>
            )
            : entries.map((e, i) => <BenchmarkCard key={e.key} {...e} i={i} />)
        }
      </div>

      {capitalHistory.length > 0 && (
        <GlassCard>
          <div style={{ ...S.label, marginBottom: 20 }}>Evolución del Patrimonio</div>
          <Suspense fallback={
            <div style={{ color: T.textDim, height: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Skeleton width="100%" height={300} />
            </div>
          }>
            <CapitalChart data={capitalHistory} />
          </Suspense>
        </GlassCard>
      )}
    </div>
  );
}
