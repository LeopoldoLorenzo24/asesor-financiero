import React from "react";
import { T, S } from "../theme";
import { GlassCard, MetricCard, SectionHeader, PulseDot, ScoreBar, Skeleton } from "../components/common";

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return "ahora";
  if (diff < 60) return `hace ${diff} min`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

function toMB(v) {
  if (v == null) return "0.0";
  return (v / 1024 / 1024).toFixed(1);
}

export default function SystemHealthView({ health }) {
  if (!health) {
    return (
      <div className="ca-main" style={{ padding: "28px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
        <SectionHeader title="Salud del Sistema" subtitle="Monitoreo en tiempo real" />
        <Skeleton width="100%" height={400} />
      </div>
    );
  }

  const { status, uptimeFormatted, memory, cedearsLoaded, aiBudget, marketProviders, alerting, recentAlerts, recentWindow, selfChecks, featureFlags, timestamp } = health;

  const aiColor = aiBudget?.usagePct >= 90 ? T.red : aiBudget?.usagePct >= 70 ? T.yellow : T.green;

  return (
    <div className="ca-main" style={{ padding: "28px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader title="Salud del Sistema" subtitle={`Última actualización: ${timestamp ? new Date(timestamp).toLocaleString("es-AR") : "—"}`} />

      {/* Status row */}
      <div style={{ ...S.grid(240), gap: 16, marginBottom: 28 }}>
        <GlassCard glowColor={status === "ok" ? T.green : T.red}>
          <div style={S.label}>Estado</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <PulseDot color={status === "ok" ? T.green : T.red} size={8} />
            <span style={{ ...S.value, fontSize: 22, color: status === "ok" ? T.green : T.red }}>{(status || "unknown").toUpperCase()}</span>
          </div>
        </GlassCard>
        <GlassCard>
          <div style={S.label}>Uptime</div>
          <div style={{ ...S.value, fontSize: 22, marginTop: 8 }}>{uptimeFormatted || "—"}</div>
        </GlassCard>
        <GlassCard>
          <div style={S.label}>Memoria</div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textMuted }}>
              <span>RSS</span>
              <span style={{ fontFamily: T.fontMono, color: T.text }}>{toMB(memory?.rss)} MB</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textMuted }}>
              <span>Heap Used</span>
              <span style={{ fontFamily: T.fontMono, color: T.text }}>{toMB(memory?.heapUsed)} MB</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textMuted }}>
              <span>Heap Total</span>
              <span style={{ fontFamily: T.fontMono, color: T.text }}>{toMB(memory?.heapTotal)} MB</span>
            </div>
          </div>
        </GlassCard>
        <MetricCard label="CEDEARs Cargados" value={cedearsLoaded ?? 0} color={T.purple} delay={240} />
      </div>

      {/* AI Budget */}
      <GlassCard style={{ marginBottom: 28 }}>
        <SectionHeader title="Presupuesto IA" />
        <div style={{ ...S.grid(240), gap: 16, marginBottom: 16 }}>
          <div>
            <div style={S.label}>Diario (USD)</div>
            <div style={{ ...S.value, fontSize: 22 }}>${(aiBudget?.dailyUsd ?? 0).toLocaleString("es-AR")}</div>
          </div>
          <div>
            <div style={S.label}>Usado Hoy (USD)</div>
            <div style={{ ...S.value, fontSize: 22, color: aiColor }}>${(aiBudget?.usedTodayUsd ?? 0).toLocaleString("es-AR")}</div>
          </div>
          <div>
            <div style={S.label}>Restante (USD)</div>
            <div style={{ ...S.value, fontSize: 22 }}>${(aiBudget?.remainingUsd ?? 0).toLocaleString("es-AR")}</div>
          </div>
        </div>
        <ScoreBar value={aiBudget?.usagePct ?? 0} label="Uso %" color={aiColor} h={8} />
      </GlassCard>

      {/* Market Providers */}
      <GlassCard style={{ marginBottom: 28 }}>
        <SectionHeader title="Proveedores de Mercado" />
        <div style={{ ...S.grid(200), gap: 16 }}>
          {marketProviders && Object.entries(marketProviders).map(([key, p]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, background: "rgba(3,7,17,0.4)", borderRadius: 12, border: `1px solid ${T.border}` }}>
              <PulseDot color={p.status === "up" ? T.green : T.red} size={8} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{p.name || key}</div>
                <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{p.status === "up" ? "ONLINE" : "OFFLINE"} • {timeAgo(p.lastSuccessAt)}</div>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Alerting + Recent Window */}
      <div style={{ ...S.grid(360), gap: 16, marginBottom: 28 }}>
        <GlassCard>
          <SectionHeader title="Alerting" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={S.label}>Habilitado</div>
              <div style={{ ...S.value, fontSize: 18 }}>{alerting?.enabled ? "Sí" : "No"}</div>
            </div>
            <div>
              <div style={S.label}>Telegram</div>
              <div style={{ ...S.value, fontSize: 18 }}>{alerting?.telegram ? "Sí" : "No"}</div>
            </div>
            <div>
              <div style={S.label}>Webhook</div>
              <div style={{ ...S.value, fontSize: 18 }}>{alerting?.webhook ? "Sí" : "No"}</div>
            </div>
            <div>
              <div style={S.label}>Cooldown</div>
              <div style={{ ...S.value, fontSize: 18 }}>{alerting?.cooldownMin ?? "—"} min</div>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <SectionHeader title="Ventana Reciente (10 min)" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <div style={S.label}>Requests</div>
              <div style={{ ...S.value, fontSize: 18 }}>{recentWindow?.requests ?? 0}</div>
            </div>
            <div>
              <div style={S.label}>Errores</div>
              <div style={{ ...S.value, fontSize: 18, color: (recentWindow?.errors ?? 0) > 0 ? T.red : T.text }}>{recentWindow?.errors ?? 0}</div>
            </div>
            <div>
              <div style={S.label}>Error Rate</div>
              <div style={{ ...S.value, fontSize: 18, color: (recentWindow?.errorRate ?? 0) > 5 ? T.red : T.text }}>{recentWindow?.errorRate ?? 0}%</div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Recent Alerts */}
      <GlassCard style={{ marginBottom: 28, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "24px 28px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ ...S.label, margin: 0 }}>Alertas Recientes</div>
        </div>
        {(!recentAlerts || recentAlerts.length === 0) ? (
          <div style={{ padding: 40, color: T.textDim, textAlign: "center" }}>Sin alertas recientes.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={S.th}>Nivel</th>
                  <th style={S.th}>Código</th>
                  <th style={S.th}>Mensaje</th>
                  <th style={S.th}>Tiempo</th>
                </tr>
              </thead>
              <tbody>
                {recentAlerts.map((a, i) => (
                  <tr key={i} style={{ transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(148,163,184,0.03)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td style={S.td}><span style={{ ...S.badge(a.level === "error" ? T.red : a.level === "warn" ? T.yellow : T.blue), fontSize: 9 }}>{(a.level || "info").toUpperCase()}</span></td>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>{a.code}</td>
                    <td style={S.td}>{a.message}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: T.textDim }}>{timeAgo(a.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Self Checks */}
      <GlassCard style={{ marginBottom: 28 }}>
        <SectionHeader title="Self Checks" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <div>
            <div style={S.label}>Total</div>
            <div style={{ ...S.value, fontSize: 18 }}>{selfChecks?.total ?? 0}</div>
          </div>
          <div>
            <div style={S.label}>Fallidos</div>
            <div style={{ ...S.value, fontSize: 18, color: (selfChecks?.failed ?? 0) > 0 ? T.red : T.text }}>{selfChecks?.failed ?? 0}</div>
          </div>
          <div>
            <div style={S.label}>Último Resultado</div>
            <div style={{ ...S.value, fontSize: 18, color: selfChecks?.lastResult === "ok" ? T.green : T.red }}>{(selfChecks?.lastResult || "—").toUpperCase()}</div>
          </div>
        </div>
      </GlassCard>

      {/* Feature Flags */}
      <GlassCard>
        <SectionHeader title="Feature Flags" />
        <div style={{ ...S.grid(160), gap: 12 }}>
          {featureFlags && Object.entries(featureFlags).map(([key, enabled]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(3,7,17,0.4)", borderRadius: 10, border: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 11, fontFamily: T.fontMono, color: T.textMuted }}>{key}</span>
              <span style={{ ...S.badge(enabled ? T.green : T.red), fontSize: 9 }}>{enabled ? "ON" : "OFF"}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
