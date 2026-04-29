import React, { useEffect, useMemo, useState } from "react";
import { Activity, Clock3, Play, Pause, RefreshCw, Save, Siren } from "lucide-react";
import api from "../api";
import { T, S } from "../theme";
import { GlassCard, MetricCard, PulseDot, SectionHeader, StatusMsg } from "../components/common";

function fmtMoney(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `$${Number(value).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtPct(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtTs(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-AR");
}

function severityColor(severity) {
  if (severity === "critical") return T.red;
  if (severity === "warning") return T.yellow;
  return T.blue;
}

export default function IntradayMonitorView({ data, loading, onRefresh }) {
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [marketOpenLocal, setMarketOpenLocal] = useState("10:30");
  const [marketCloseLocal, setMarketCloseLocal] = useState("17:00");
  const [actionBusy, setActionBusy] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (!data?.settings) return;
    setIntervalMinutes(data.settings.intervalMinutes || 15);
    setMarketOpenLocal(data.settings.marketOpenLocal || "10:30");
    setMarketCloseLocal(data.settings.marketCloseLocal || "17:00");
  }, [data?.settings]);

  const latestSnapshot = data?.latestSnapshot || null;
  const latestTickerSnapshots = data?.latestTickerSnapshots || [];
  const recentEvents = data?.recentEvents || [];
  const recentSnapshots = data?.recentSnapshots || [];
  const recentSessions = data?.recentSessions || [];
  const runtime = data?.runtime || null;
  const settings = data?.settings || null;

  const monitorTone = useMemo(() => {
    if (runtime?.running) return { color: T.green, label: "ACTIVO" };
    return { color: T.textDim, label: "DETENIDO" };
  }, [runtime]);

  async function runAction(label, fn) {
    setActionBusy(label);
    setError(null);
    setSuccess(null);
    try {
      await fn();
      await onRefresh?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy("");
    }
  }

  const saveSettings = () => runAction("save", async () => {
    await api.updateIntradayMonitorSettings({
      intervalMinutes: Number(intervalMinutes),
      marketOpenLocal,
      marketCloseLocal,
      timezone: settings?.timezone || "America/Argentina/Cordoba",
    });
    setSuccess("Configuración guardada. Si el monitor estaba activo, ya quedó reiniciado con la nueva ventana.");
  });

  const startMonitor = () => runAction("start", async () => {
    await api.startIntradayMonitor(true);
    setSuccess("Monitor intradía activado.");
  });

  const stopMonitor = () => runAction("stop", async () => {
    await api.stopIntradayMonitor("user_stop", true);
    setSuccess("Monitor intradía detenido.");
  });

  const runNow = () => runAction("run", async () => {
    await api.runIntradayMonitorNow();
    setSuccess("Snapshot manual ejecutado.");
  });

  if (loading && !data) {
    return (
      <div className="ca-main" style={{ padding: 28, maxWidth: 1280, margin: "0 auto" }}>
        <SectionHeader title="Monitor Intradía" subtitle="Cargando estado operativo..." />
      </div>
    );
  }

  return (
    <div className="ca-main" style={{ padding: 28, maxWidth: 1320, margin: "0 auto", animation: "fadeUp 0.35s ease" }}>
      <SectionHeader
        title="Monitor Intradía"
        subtitle={`Recolecta snapshots útiles para evidencia y análisis IA mientras el mercado está abierto. Último snapshot: ${fmtTs(latestSnapshot?.snapshotAt)}`}
      />

      <StatusMsg type="info">
        Corre solo dentro de la ventana configurada y guarda contexto útil: CCL, VIX, SPY/QQQ, valor real del portfolio, composición por ticker, breaches de stop/take-profit y eventos de mercado relevantes.
      </StatusMsg>
      {error && <StatusMsg type="error">{error}</StatusMsg>}
      {success && <StatusMsg type="success">{success}</StatusMsg>}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <button onClick={startMonitor} disabled={!!actionBusy || runtime?.running} style={{ ...S.btn("primary"), opacity: (!!actionBusy || runtime?.running) ? 0.65 : 1 }}>
          <Play size={14} /> Activar Monitor
        </button>
        <button onClick={stopMonitor} disabled={!!actionBusy || !runtime?.running} style={{ ...S.btn("danger"), opacity: (!!actionBusy || !runtime?.running) ? 0.65 : 1 }}>
          <Pause size={14} /> Detener
        </button>
        <button onClick={runNow} disabled={!!actionBusy} style={{ ...S.btn("secondary"), opacity: actionBusy ? 0.65 : 1 }}>
          <Activity size={14} /> Snapshot Manual
        </button>
        <button onClick={onRefresh} disabled={!!actionBusy} style={{ ...S.btn("ghost"), opacity: actionBusy ? 0.65 : 1 }}>
          <RefreshCw size={14} /> Refrescar
        </button>
      </div>

      <div style={{ ...S.grid(220), gap: 16, marginBottom: 28 }}>
        <GlassCard glowColor={monitorTone.color}>
          <div style={S.label}>Estado</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <PulseDot color={monitorTone.color} size={9} />
            <div style={{ ...S.value, fontSize: 24, color: monitorTone.color }}>{monitorTone.label}</div>
          </div>
        </GlassCard>
        <GlassCard glowColor={runtime?.marketOpenNow ? T.green : T.yellow}>
          <div style={S.label}>Mercado</div>
          <div style={{ ...S.value, fontSize: 24, color: runtime?.marketOpenNow ? T.green : T.yellow }}>
            {runtime?.marketOpenNow ? "ABIERTO" : "CERRADO"}
          </div>
          <div style={{ marginTop: 10, color: T.textDim, fontSize: 12 }}>
            {`${runtime?.marketState || "—"} · ${runtime?.marketClock?.weekday || "—"} ${runtime?.marketClock?.timeHHMM || "—"}`}
          </div>
        </GlassCard>
        <GlassCard>
          <div style={S.label}>Próxima Corrida</div>
          <div style={{ ...S.value, fontSize: 22 }}>{fmtTs(runtime?.nextRunAt)}</div>
        </GlassCard>
        <GlassCard>
          <div style={S.label}>Último Tick</div>
          <div style={{ ...S.value, fontSize: 22 }}>{fmtTs(runtime?.lastTickAt)}</div>
        </GlassCard>
        <MetricCard label="Intervalo" value={settings?.intervalMinutes || 15} suffix="m" color={T.cyan} icon={RefreshCw} subtext={`${settings?.marketOpenLocal || "10:30"} → ${settings?.marketCloseLocal || "17:00"}`} />
      </div>

      <div style={{ ...S.grid(420), gap: 18, marginBottom: 28 }}>
        <GlassCard>
          <SectionHeader title="Configuración" subtitle={settings?.timezone || "America/Argentina/Cordoba"} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={S.label}>Intervalo</div>
              <select value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))} style={S.input}>
                {[10, 15, 20, 30, 45, 60].map((value) => (
                  <option key={value} value={value}>{value} min</option>
                ))}
              </select>
            </div>
            <div>
              <div style={S.label}>Abre</div>
              <input type="time" value={marketOpenLocal} onChange={(e) => setMarketOpenLocal(e.target.value)} style={S.input} />
            </div>
            <div>
              <div style={S.label}>Cierra</div>
              <input type="time" value={marketCloseLocal} onChange={(e) => setMarketCloseLocal(e.target.value)} style={S.input} />
            </div>
          </div>
          <button onClick={saveSettings} disabled={!!actionBusy} style={{ ...S.btn("ghost"), opacity: actionBusy ? 0.65 : 1 }}>
            <Save size={14} /> Guardar Configuración
          </button>
        </GlassCard>

        <GlassCard>
          <SectionHeader title="Último Snapshot" subtitle={fmtTs(latestSnapshot?.snapshotAt)} />
          <div style={{ ...S.grid(170), gap: 12 }}>
            <MetricCard label="Portfolio ARS" value={latestSnapshot?.portfolioValueArs || 0} prefix="$" color={T.green} icon={Activity} />
            <MetricCard label="Caja ARS" value={latestSnapshot?.capitalAvailableArs || 0} prefix="$" color={T.blue} icon={Clock3} />
            <MetricCard label="Total ARS" value={latestSnapshot?.totalValueArs || 0} prefix="$" color={T.cyan} icon={Activity} />
            <MetricCard label="CCL" value={latestSnapshot?.cclRate || 0} prefix="$" color={T.yellow} icon={Activity} />
            <MetricCard label="VIX" value={latestSnapshot?.vixValue || 0} color={T.red} icon={Siren} subtext={latestSnapshot?.vixRegime || "—"} />
            <MetricCard label="Eventos" value={latestSnapshot?.eventCount || 0} color={(latestSnapshot?.eventCount || 0) > 0 ? T.yellow : T.textMuted} icon={Siren} />
          </div>
        </GlassCard>
      </div>

      <GlassCard style={{ marginBottom: 28, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "22px 26px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ ...S.label, marginBottom: 6 }}>Snapshot Actual por Ticker</div>
          <div style={{ color: T.textDim, fontSize: 12 }}>Se guarda composición, precio local, PnL, peso y si una recomendación activa ya tocó stop-loss o take-profit.</div>
        </div>
        {latestTickerSnapshots.length === 0 ? (
          <div style={{ padding: 30, color: T.textDim }}>Todavía no hay snapshots por ticker.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={S.th}>Ticker</th>
                  <th style={S.th}>Shares</th>
                  <th style={S.th}>Precio ARS</th>
                  <th style={S.th}>Var Día</th>
                  <th style={S.th}>PnL</th>
                  <th style={S.th}>Valor</th>
                  <th style={S.th}>Peso</th>
                  <th style={S.th}>Predicción</th>
                  <th style={S.th}>Breaches</th>
                </tr>
              </thead>
              <tbody>
                {latestTickerSnapshots.map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: T.text }}>{row.ticker}</td>
                    <td style={S.td}>{row.shares}</td>
                    <td style={S.td}>{fmtMoney(row.priceArs)}</td>
                    <td style={{ ...S.td, color: Number(row.dayChangePct || 0) >= 0 ? T.green : T.red }}>{fmtPct(row.dayChangePct)}</td>
                    <td style={{ ...S.td, color: Number(row.pnlPct || 0) >= 0 ? T.green : T.red }}>{fmtPct(row.pnlPct)}</td>
                    <td style={S.td}>{fmtMoney(row.valueArs)}</td>
                    <td style={S.td}>{fmtPct(row.positionWeightPct)}</td>
                    <td style={S.td}>{row.activePredictionAction || "—"} {row.predictionConfidence != null ? `(${row.predictionConfidence})` : ""}</td>
                    <td style={S.td}>
                      {row.stopLossBreach && <span style={{ ...S.badge(T.red), marginRight: 6 }}>STOP</span>}
                      {row.takeProfitBreach && <span style={S.badge(T.yellow)}>TP</span>}
                      {!row.stopLossBreach && !row.takeProfitBreach ? "—" : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <div style={{ ...S.grid(420), gap: 18 }}>
        <GlassCard style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "22px 26px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ ...S.label, marginBottom: 6 }}>Eventos Recientes</div>
            <div style={{ color: T.textDim, fontSize: 12 }}>Se deduplican por día para evitar ruido y dejar señales accionables.</div>
          </div>
          {recentEvents.length === 0 ? (
            <div style={{ padding: 30, color: T.textDim }}>Sin eventos recientes.</div>
          ) : (
            <div style={{ maxHeight: 420, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={S.th}>Severidad</th>
                    <th style={S.th}>Ticker</th>
                    <th style={S.th}>Mensaje</th>
                    <th style={S.th}>Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((event) => (
                    <tr key={event.id}>
                      <td style={S.td}><span style={S.badge(severityColor(event.severity))}>{event.severity}</span></td>
                      <td style={{ ...S.td, fontFamily: T.fontMono }}>{event.ticker || "—"}</td>
                      <td style={S.td}>{event.message}</td>
                      <td style={{ ...S.td, fontFamily: T.fontMono }}>{fmtTs(event.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        <GlassCard style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "22px 26px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ ...S.label, marginBottom: 6 }}>Timeline de Snapshots</div>
            <div style={{ color: T.textDim, fontSize: 12 }}>Sirve para construir una serie intradía consistente, comparable y útil para la IA.</div>
          </div>
          {recentSnapshots.length === 0 ? (
            <div style={{ padding: 30, color: T.textDim }}>Sin snapshots todavía.</div>
          ) : (
            <div style={{ maxHeight: 420, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={S.th}>Hora</th>
                    <th style={S.th}>Estado</th>
                    <th style={S.th}>Portfolio</th>
                    <th style={S.th}>Caja</th>
                    <th style={S.th}>Total</th>
                    <th style={S.th}>VIX</th>
                    <th style={S.th}>Eventos</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSnapshots.map((snapshot) => (
                    <tr key={snapshot.id}>
                      <td style={{ ...S.td, fontFamily: T.fontMono }}>{fmtTs(snapshot.snapshotAt)}</td>
                      <td style={S.td}>{snapshot.marketState}</td>
                      <td style={S.td}>{fmtMoney(snapshot.portfolioValueArs)}</td>
                      <td style={S.td}>{fmtMoney(snapshot.capitalAvailableArs)}</td>
                      <td style={S.td}>{fmtMoney(snapshot.totalValueArs)}</td>
                      <td style={S.td}>{snapshot.vixValue ?? "—"}</td>
                      <td style={S.td}>{snapshot.eventCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </div>

      <GlassCard style={{ marginTop: 28, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "22px 26px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ ...S.label, marginBottom: 6 }}>Sesiones del Monitor</div>
          <div style={{ color: T.textDim, fontSize: 12 }}>Cada start/stop deja una sesión auditable para saber cuándo el monitor estuvo realmente prendido.</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={S.th}>Inicio</th>
                <th style={S.th}>Fin</th>
                <th style={S.th}>Estado</th>
                <th style={S.th}>Usuario</th>
                <th style={S.th}>Ventana</th>
                <th style={S.th}>Stop Reason</th>
              </tr>
            </thead>
            <tbody>
              {recentSessions.map((session) => (
                <tr key={session.id}>
                  <td style={{ ...S.td, fontFamily: T.fontMono }}>{fmtTs(session.startedAt)}</td>
                  <td style={{ ...S.td, fontFamily: T.fontMono }}>{fmtTs(session.stoppedAt)}</td>
                  <td style={S.td}><span style={S.badge(session.status === "running" ? T.green : T.textMuted)}>{session.status}</span></td>
                  <td style={S.td}>{session.startedBy || "—"}</td>
                  <td style={S.td}>{session.marketOpenLocal} → {session.marketCloseLocal} · {session.intervalMinutes}m</td>
                  <td style={S.td}>{session.stopReason || "—"}</td>
                </tr>
              ))}
              {recentSessions.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...S.td, textAlign: "center", color: T.textDim }}>Sin sesiones registradas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
