import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { T, S } from "../theme";
import api from "../api";
import { AnimatedNumber, GlassCard, MetricCard, SectionHeader, StatusMsg } from "../components/common";

function formatMoney(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `$${Number(value).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function reasonLabel(reason) {
  if (reason === "increase_to_match_broker") return "Aumentar para matchear broker";
  if (reason === "new_position_from_broker") return "Nueva posición del broker";
  if (reason === "reduce_to_match_broker") return "Reducir para matchear broker";
  if (reason === "close_position_missing_in_broker") return "Cerrar faltante en broker";
  return reason || "—";
}

function actionColor(type) {
  return type === "BUY" ? T.green : T.red;
}

export default function OperationsView({ portfolioDB, ranking, transactions, onReconciled }) {
  const [broker, setBroker] = useState("bull_market");
  const [csvText, setCsvText] = useState("");
  const [cclRate, setCclRate] = useState("");
  const [snapshotDate, setSnapshotDate] = useState(new Date().toISOString().slice(0, 10));
  const [reconcileNote, setReconcileNote] = useState("sync broker");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [reconcilePreview, setReconcilePreview] = useState(null);
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const [reconcileError, setReconcileError] = useState(null);
  const [reconcileSuccess, setReconcileSuccess] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const fileInputRef = useRef(null);

  const totalValue = portfolioDB.summary.reduce((sum, position) => {
    const ranked = ranking.find((item) => item.cedear?.ticker === position.ticker);
    const price = ranked?.priceARS || position.weighted_avg_price;
    return sum + price * position.total_shares;
  }, 0);
  const totalCost = portfolioDB.summary.reduce((sum, position) => sum + position.weighted_avg_price * position.total_shares, 0);
  const totalPnl = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
  const previewSummary = reconcilePreview?.reconciliation?.summary || null;
  const previewActions = reconcilePreview?.reconciliation?.actions || [];

  const hasReconciliationChanges = useMemo(
    () => (previewSummary?.totalActions || 0) > 0,
    [previewSummary]
  );

  const loadAuditLog = useCallback(async () => {
    try {
      setAuditLog(await api.getBrokerReconciliationAudit(8));
    } catch (_) {
      // Silent on purpose: audit log is supportive data, not blocking UI.
    }
  }, []);

  useEffect(() => {
    loadAuditLog();
  }, [loadAuditLog]);

  const handleCsvFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      let text = "";
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          throw new Error("El Excel no tiene hojas legibles.");
        }
        text = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName], { FS: ";", blankrows: false });
      } else {
        text = await file.text();
      }
      setCsvText(text);
      setSelectedFileName(file.name);
      setReconcilePreview(null);
      setReconcileError(null);
      setReconcileSuccess(`Archivo cargado: ${file.name}`);
    } catch (err) {
      setReconcileError(`No pude leer el archivo: ${err.message}`);
    }
  };

  const clearImportState = () => {
    setReconcilePreview(null);
    setReconcileError(null);
    setReconcileSuccess(null);
  };

  const buildPayload = () => {
    if (!csvText.trim()) {
      throw new Error("Pegá un CSV del broker o cargá un archivo antes de previsualizar.");
    }
    return {
      broker,
      csv: csvText,
      cclRate: cclRate === "" ? undefined : Number(cclRate),
      snapshotDate: snapshotDate || undefined,
      note: reconcileNote || undefined,
      sourceName: selectedFileName || undefined,
    };
  };

  const handlePreviewReconciliation = async () => {
    setReconcileBusy(true);
    setReconcileError(null);
    setReconcileSuccess(null);
    try {
      const preview = await api.previewBrokerReconciliation(buildPayload());
      setReconcilePreview(preview);
      await loadAuditLog();
      const totalActions = preview?.reconciliation?.summary?.totalActions || 0;
      setReconcileSuccess(
        totalActions > 0
          ? `Preview listo: ${totalActions} acción(es) para alinear la cartera con el broker.`
          : "Preview listo: la cartera local ya coincide con el broker."
      );
    } catch (err) {
      setReconcileError(err.message);
    } finally {
      setReconcileBusy(false);
    }
  };

  const handleApplyReconciliation = async () => {
    setReconcileBusy(true);
    setReconcileError(null);
    setReconcileSuccess(null);
    try {
      const result = await api.applyBrokerReconciliation(buildPayload());
      setReconcilePreview(result);
      await loadAuditLog();
      setReconcileSuccess(`Reconciliación aplicada: ${result.count || 0} transacción(es) auditables generadas.`);
      if (onReconciled) await onReconciled();
    } catch (err) {
      setReconcileError(err.message);
    } finally {
      setReconcileBusy(false);
    }
  };

  return (
    <div className="ca-main" style={{ padding: "32px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader title="Operaciones" subtitle="Portfolio real, reconciliación con broker e historial de transacciones" />

      <div style={{ ...S.grid(240), gap: 16, marginBottom: 28 }}>
        <GlassCard glowColor={T.blue}>
          <div style={S.label}>Valor del Portfolio</div>
          <div style={{ ...S.value, fontSize: 26 }}><AnimatedNumber value={totalValue} prefix="$" /></div>
        </GlassCard>
        <GlassCard glowColor={totalPnl >= 0 ? T.green : T.red}>
          <div style={S.label}>P&L Total</div>
          <div style={{ ...S.value, fontSize: 26, color: totalPnl >= 0 ? T.green : T.red }}>
            <AnimatedNumber value={totalPnl} suffix="%" decimals={2} />
          </div>
        </GlassCard>
        <GlassCard glowColor={T.purple}>
          <div style={S.label}>Posiciones</div>
          <div style={{ ...S.value, fontSize: 26 }}>{portfolioDB.summary.length}</div>
        </GlassCard>
        <GlassCard glowColor={T.yellow}>
          <div style={S.label}>Transacciones</div>
          <div style={{ ...S.value, fontSize: 26 }}>{transactions.length}</div>
        </GlassCard>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={api.exportPortfolio} style={{ ...S.btn("ghost"), fontSize: 11, padding: "8px 14px" }}>◆ Exportar Portfolio CSV</button>
        <button onClick={api.exportTransactions} style={{ ...S.btn("ghost"), fontSize: 11, padding: "8px 14px" }}>◆ Exportar Transacciones CSV</button>
      </div>

      <GlassCard glowColor={T.cyan} style={{ marginBottom: 28 }}>
        <SectionHeader
          title="Reconciliación Broker"
          subtitle="Cargá un snapshot del broker, mirá el diff y recién después aplicalo sobre la cartera local."
        />

        {reconcileError && <StatusMsg type="error">{reconcileError}</StatusMsg>}
        {reconcileSuccess && <StatusMsg type="success">{reconcileSuccess}</StatusMsg>}

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 18 }}>
          <div>
            <div style={{ ...S.label, marginBottom: 8 }}>Broker</div>
            <select
              value={broker}
              onChange={(event) => {
                setBroker(event.target.value);
                setReconcilePreview(null);
              }}
              style={S.input}
            >
              <option value="bull_market">Bull Market</option>
              <option value="generic">CSV Genérico</option>
            </select>
          </div>
          <div>
            <div style={{ ...S.label, marginBottom: 8 }}>Snapshot Date</div>
            <input
              type="date"
              value={snapshotDate}
              onChange={(event) => {
                setSnapshotDate(event.target.value);
                setReconcilePreview(null);
              }}
              style={S.input}
            />
          </div>
          <div>
            <div style={{ ...S.label, marginBottom: 8 }}>CCL Opcional</div>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cclRate}
              onChange={(event) => {
                setCclRate(event.target.value);
                setReconcilePreview(null);
              }}
              placeholder="Solo si el CSV trae PPC USD"
              style={S.input}
            />
          </div>
          <div>
            <div style={{ ...S.label, marginBottom: 8 }}>Nota Auditable</div>
            <input
              value={reconcileNote}
              onChange={(event) => setReconcileNote(event.target.value.slice(0, 120))}
              placeholder="Ej: sync broker IOL cierre"
              style={S.input}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleCsvFile}
            style={{ display: "none" }}
          />
          <button onClick={() => fileInputRef.current?.click()} style={S.btn("secondary")}>
            ◈ Cargar CSV o Excel
          </button>
          <button
            onClick={() => {
              setCsvText("");
              setSelectedFileName("");
              clearImportState();
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            style={S.btn("ghost")}
          >
            Limpiar importación
          </button>
          <div style={{ fontSize: 12, color: T.textDim }}>
            {selectedFileName ? `Archivo: ${selectedFileName}` : "También podés pegar el CSV manualmente abajo."}
            {` · Parser: ${broker === "bull_market" ? "Bull Market" : "Genérico"}`}
          </div>
        </div>

        <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.7, marginBottom: 16 }}>
          Si exportás desde <strong style={{ color: T.text }}>Cuenta Corriente</strong>, revisá que el archivo represente la
          cartera actual y no solo movimientos. Para reconciliar posiciones, un snapshot de tenencias es mejor que un ledger histórico.
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ ...S.label, marginBottom: 8 }}>CSV / Excel Del Broker</div>
          <textarea
            value={csvText}
            onChange={(event) => {
              setCsvText(event.target.value);
              clearImportState();
            }}
            placeholder={"Producto;Cantidad;PPC USD\nSPY;12;1,10\nGOOGL;5;0,90"}
            style={{
              ...S.input,
              minHeight: 180,
              resize: "vertical",
              lineHeight: 1.6,
              whiteSpace: "pre",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: previewSummary ? 18 : 0 }}>
          <button
            onClick={handlePreviewReconciliation}
            disabled={reconcileBusy}
            style={{ ...S.btn("secondary"), opacity: reconcileBusy ? 0.7 : 1 }}
          >
            {reconcileBusy ? "Procesando..." : "Previsualizar Diff"}
          </button>
          <button
            onClick={handleApplyReconciliation}
            disabled={reconcileBusy || !reconcilePreview}
            style={{ ...S.btn("primary"), opacity: reconcileBusy || !reconcilePreview ? 0.6 : 1 }}
          >
            Aplicar Reconciliación
          </button>
        </div>

        {previewSummary && (
          <>
            <div style={{ ...S.grid(220), gap: 16, marginBottom: 20 }}>
              <MetricCard label="Acciones" value={previewSummary.totalActions || 0} color={T.cyan} glowColor={T.cyan} icon="≋" />
              <MetricCard label="Compras" value={previewSummary.buyActions || 0} color={T.green} glowColor={T.green} icon="▲" />
              <MetricCard label="Ventas" value={previewSummary.sellActions || 0} color={T.red} glowColor={T.red} icon="▼" />
              <MetricCard label="Bruto Compra" value={previewSummary.grossBuyArs || 0} prefix="$" color={T.blue} glowColor={T.blue} icon="$" />
              <MetricCard label="Bruto Venta" value={previewSummary.grossSellArs || 0} prefix="$" color={T.yellow} glowColor={T.yellow} icon="$" />
            </div>

            <div style={{ fontSize: 12, color: T.textDim, marginBottom: 14 }}>
              Cartera local: <strong style={{ color: T.text }}>{previewSummary.currentPositions}</strong>
              {" · "}
              Broker: <strong style={{ color: T.text }}>{previewSummary.brokerPositions}</strong>
              {" · "}
              Tickers con cambios: <strong style={{ color: T.text }}>{previewSummary.tickersWithChanges}</strong>
            </div>

            {!hasReconciliationChanges ? (
              <div style={{ padding: 18, borderRadius: 16, background: `${T.green}08`, border: `1px solid ${T.green}18`, color: T.green }}>
                No hay diferencias entre la cartera local y el snapshot del broker.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={S.th}>Ticker</th>
                      <th style={S.th}>Acción</th>
                      <th style={S.th}>Cantidad</th>
                      <th style={S.th}>Precio ARS</th>
                      <th style={S.th}>Precio USD</th>
                      <th style={S.th}>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewActions.map((action, index) => {
                      const color = actionColor(action.type);
                      return (
                        <tr key={`${action.ticker}-${action.type}-${index}`}>
                          <td style={S.td}><strong style={{ color: T.text, fontFamily: T.fontMono }}>{action.ticker}</strong></td>
                          <td style={S.td}>
                            <span style={{ ...S.badge(color), fontSize: 9 }}>{action.type}</span>
                          </td>
                          <td style={{ ...S.td, fontFamily: T.fontMono }}>{action.shares}</td>
                          <td style={{ ...S.td, fontFamily: T.fontMono }}>{formatMoney(action.priceArs)}</td>
                          <td style={{ ...S.td, fontFamily: T.fontMono }}>{action.priceUsd != null ? `$${Number(action.priceUsd).toFixed(4)}` : "—"}</td>
                          <td style={{ ...S.td, color: T.textMuted }}>{reasonLabel(action.reason)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </GlassCard>

      <GlassCard style={{ marginBottom: 28, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "24px 28px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ ...S.label, margin: 0 }}>Últimos Imports de Broker</div>
        </div>
        {auditLog.length === 0 ? (
          <div style={{ padding: 28, color: T.textDim, textAlign: "center" }}>Todavía no hay imports auditados.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={S.th}>Fecha</th>
                  <th style={S.th}>Broker</th>
                  <th style={S.th}>Origen</th>
                  <th style={S.th}>Snapshot</th>
                  <th style={S.th}>Modo</th>
                  <th style={S.th}>Tx</th>
                  <th style={S.th}>Hash</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: T.textDim }}>{entry.created_at}</td>
                    <td style={S.td}>{entry.broker_key}</td>
                    <td style={{ ...S.td, color: T.textMuted }}>
                      {entry.source_name || entry.source_type || "manual"}
                    </td>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>{entry.snapshot_date || "—"}</td>
                    <td style={S.td}>
                      <span style={{ ...S.badge(entry.applied ? T.green : T.blue), fontSize: 9 }}>
                        {entry.applied ? "APPLY" : "PREVIEW"}
                      </span>
                    </td>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>{entry.applied_transaction_count || 0}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: T.textDim }}>
                      {String(entry.input_hash || "").slice(0, 12)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <GlassCard style={{ marginBottom: 28, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "24px 28px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ ...S.label, margin: 0 }}>Portfolio Actual</div>
        </div>
        {portfolioDB.summary.length === 0 ? (
          <div style={{ padding: 40, color: T.textDim, textAlign: "center" }}>No hay posiciones registradas.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={S.th}>Ticker</th>
                  <th style={S.th}>Cantidad</th>
                  <th style={S.th}>Precio Promedio</th>
                  <th style={S.th}>Precio Actual</th>
                  <th style={S.th}>Valor Estimado</th>
                  <th style={S.th}>P&L</th>
                </tr>
              </thead>
              <tbody>
                {portfolioDB.summary.map((position) => {
                  const ranked = ranking.find((item) => item.cedear?.ticker === position.ticker);
                  const currentPrice = ranked?.priceARS || position.weighted_avg_price;
                  const value = currentPrice * position.total_shares;
                  const pnl = position.weighted_avg_price > 0 ? ((currentPrice - position.weighted_avg_price) / position.weighted_avg_price) * 100 : 0;
                  return (
                    <tr
                      key={position.ticker}
                      style={{ transition: "background 0.2s" }}
                      onMouseEnter={(event) => { event.currentTarget.style.background = "rgba(148,163,184,0.03)"; }}
                      onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={S.td}><strong style={{ color: T.text, fontFamily: T.fontMono, fontSize: 14 }}>{position.ticker}</strong></td>
                      <td style={{ ...S.td, fontFamily: T.fontMono }}>{position.total_shares}</td>
                      <td style={{ ...S.td, fontFamily: T.fontMono }}>{formatMoney(position.weighted_avg_price)}</td>
                      <td style={{ ...S.td, fontFamily: T.fontMono, color: T.textMuted }}>{formatMoney(currentPrice)}</td>
                      <td style={S.td}>
                        <span style={{ fontWeight: 700, fontFamily: T.fontMono, color: T.text }}>{formatMoney(value)}</span>
                      </td>
                      <td style={S.td}>
                        <span style={{ fontSize: 12, fontFamily: T.fontMono, fontWeight: 800, color: pnl >= 0 ? T.green : T.red, background: pnl >= 0 ? T.greenGlow : T.redGlow, padding: "3px 10px", borderRadius: 8 }}>
                          {pnl >= 0 ? "▲" : "▼"} {Math.abs(pnl).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "24px 28px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ ...S.label, margin: 0 }}>Últimas Transacciones</div>
        </div>
        {transactions.length === 0 ? (
          <div style={{ padding: 40, color: T.textDim, textAlign: "center" }}>Sin transacciones.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={S.th}>Fecha</th>
                  <th style={S.th}>Tipo</th>
                  <th style={S.th}>Ticker</th>
                  <th style={S.th}>Cantidad</th>
                  <th style={S.th}>Precio</th>
                  <th style={S.th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 20).map((transaction) => (
                  <tr
                    key={transaction.id}
                    style={{ transition: "background 0.2s" }}
                    onMouseEnter={(event) => { event.currentTarget.style.background = "rgba(148,163,184,0.03)"; }}
                    onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ ...S.td, fontFamily: T.fontMono, color: T.textDim }}>{transaction.date_executed}</td>
                    <td style={S.td}>
                      <span style={{ ...S.badge(transaction.type === "BUY" ? T.green : T.red), fontSize: 9 }}>{transaction.type}</span>
                    </td>
                    <td style={S.td}><strong style={{ color: T.text, fontFamily: T.fontMono }}>{transaction.ticker}</strong></td>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>{transaction.shares}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono }}>{formatMoney(transaction.price_ars)}</td>
                    <td style={{ ...S.td, fontFamily: T.fontMono, fontWeight: 700, color: T.text }}>{formatMoney(transaction.total_ars)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
