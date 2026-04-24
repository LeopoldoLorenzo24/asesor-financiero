import React from "react";
import { T, S } from "../theme";
import { GlassCard, MetricCard, PulseDot, ScoreBar, SectionHeader, Skeleton, StatusMsg } from "../components/common";

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return "ahora";
  if (diff < 60) return `hace ${diff} min`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

export default function SystemHealthView({ health, readiness }) {
  if (!health) {
    return (
      <div className="ca-main" style={{ padding: "28px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
        <SectionHeader title="Salud del Sistema" subtitle="Monitoreo operativo y de despliegue" />
        <Skeleton width="100%" height={400} />
      </div>
    );
  }

  const { status, uptimeFormatted, memory, cedearsLoaded, aiBudget, marketProviders, alerting, recentAlerts, recentWindow, selfChecks, featureFlags, timestamp } = health;
  const aiColor = aiBudget?.usagePct >= 90 ? T.red : aiBudget?.usagePct >= 70 ? T.yellow : T.green;
  const providerEntries = Object.entries(marketProviders || {}).filter(([key]) => key !== "degraded");

  return (
    <div className="ca-main" style={{ padding: "28px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader title="Salud del Sistema" subtitle={`Ultima actualizacion: ${timestamp ? new Date(timestamp).toLocaleString("es-AR") : "—"}`} />

      {readiness?.mode === "paper_only" && (
        <StatusMsg type="error">
          {`Readiness en paper_only. Blockers: ${(readiness.blockers || []).join(" | ") || "sin detalle"}`}
        </StatusMsg>
      )}

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
              <span style={{ fontFamily: T.fontMono, color: T.text }}>{memory?.rssMb ?? 0} MB</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textMuted }}>
              <span>Heap Used</span>
              <span style={{ fontFamily: T.fontMono, color: T.text }}>{memory?.heapUsedMb ?? 0} MB</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textMuted }}>
              <span>Heap Total</span>
              <span style={{ fontFamily: T.fontMono, color: T.text }}>{memory?.heapTotalMb ?? 0} MB</span>
            </div>
          </div>
        </GlassCard>
        <MetricCard label="CEDEARs Cargados" value={cedearsLoaded ?? 0} color={T.purple} delay={240} />
      </div>

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

      <GlassCard style={{ marginBottom: 28 }}>
        <SectionHeader title="Proveedores de Mercado" />
        <div style={{ ...S.grid(220), gap: 16 }}>
          {providerEntries.map(([key, provider]) => {
            const hasFailures = (provider?.failures || 0) > 0;
            const healthy = !hasFailures || (provider?.success || 0) >= (provider?.failures || 0);
            const lastSeen = provider?.lastUsedAt || provider?.lastError;
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, background: "rgba(3,7,17,0.4)", borderRadius: 12, border: `1px solid ${T.border}` }}>
                <PulseDot color={healthy ? T.green : T.yellow} size={8} />
                <div style={{ width: "100%" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{key.toUpperCase()}</div>
                  <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, marginTop: 4 }}>
                    ok {provider?.success ?? 0} · fail {provider?.failures ?? 0}
                  </div>
                  {lastSeen && <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>{typeof lastSeen === "string" && lastSeen.includes("T") ? timeAgo(lastSeen) : String(lastSeen).slice(0, 72)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      <div style={{ ...S.grid(360), gap: 16, marginBottom: 28 }}>
        <GlassCard>
          <SectionHeader title="Alerting" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={S.label}>Habilitado</div>
              <div style={{ ...S.value, fontSize: 18 }}>{alerting?.enabled ? "Si" : "No"}</div>
            </div>
            <div>
              <div style={S.label}>Telegram</div>
              <div style={{ ...S.value, fontSize: 18 }}>{alerting?.telegram ? "Si" : "No"}</div>
            </div>
            <div>
              <div style={S.label}>Webhook</div>
              <div style={{ ...S.value, fontSize: 18 }}>{alerting?.webhook ? "Si" : "No"}</div>
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
              <div style={S.label}>Errores 5xx</div>
              <div style={{ ...S.value, fontSize: 18, color: (recentWindow?.errors5xx ?? 0) > 0 ? T.red : T.text }}>{recentWindow?.errors5xx ?? 0}</div>
            </div>
            <div>
              <div style={S.label}>Error Rate</div>
              <div style={{ ...S.value, fontSize: 18, color: (recentWindow?.errorRatePct ?? 0) > 5 ? T.red : T.text }}>{recentWindow?.errorRatePct ?? 0}%</div>
            </div>
          </div>
        </GlassCard>
      </div>

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
                  <th style={S.th}>Codigo</th>
                  <th style={S.th}>Mensaje</th>
                  <th style={S.th}>Tiempo</th>
                </tr>
              </thead>
              <tbody>
                {recentAlerts.map((alert, index) => (
                  <tr key={index}>
                    <td style={S.td}><span style={{ ...S.badge(alert.level === "critical" ? T.red : T.yellow), fontSize: 9 }}>{(alert.level || "info").toUpperCase()}</span></td>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>{alert.code}</td>
                    <td style={S.td}>{alert.message}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: T.textDim }}>{timeAgo(alert.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

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
            <div style={S.label}>Ultimo Resultado</div>
            <div style={{ ...S.value, fontSize: 18, color: selfChecks?.last?.ok ? T.green : T.red }}>{selfChecks?.last?.ok ? "OK" : "FAIL"}</div>
          </div>
        </div>
      </GlassCard>

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
