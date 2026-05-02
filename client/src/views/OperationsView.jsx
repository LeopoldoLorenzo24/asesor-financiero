import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { LayoutList, TrendingUp, TrendingDown, DollarSign, RefreshCw, ArrowRight, XCircle, Layers, Download, Upload } from "lucide-react";
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

function isBlockingHistoricalWarning(warning, importMode) {
  if (importMode === "delta_backfill") {
    return !warning.includes("Solo se propondrán movimientos posteriores")
      && !warning.includes("ledger no trae movimientos")
      && !warning.includes("oversells sintéticos");
  }
  return true;
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
  const [historyPreview, setHistoryPreview] = useState(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [historySuccess, setHistorySuccess] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [liquidityTarget, setLiquidityTarget] = useState("");
  const [liquidityPlan, setLiquidityPlan] = useState(null);
  const [liquidityBusy, setLiquidityBusy] = useState(false);
  const [liquidityError, setLiquidityError] = useState(null);
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
  const historySummary = historyPreview?.summary || null;
  const historyEntries = historyPreview?.entries || [];
  const historyCandidateEntries = historyPreview?.candidateEntries || [];
  const historyCandidateSummary = historyPreview?.candidateSummary || historySummary;
  const historyPositions = historyPreview?.resultingPositions || [];
  const historyIgnoredRows = historyPreview?.ignoredRows || [];
  const historyWarnings = historyPreview?.warnings || [];
  const historyDbState = historyPreview?.dbState || null;
  const historyImportMode = historyPreview?.importMode || "full_import";

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

  const handleLiquidityPlan = async () => {
    setLiquidityBusy(true);
    setLiquidityError(null);
    try {
      const target = Number(liquidityTarget);
      const result = await api.getLiquidityPlan(target);
      setLiquidityPlan(result);
    } catch (err) {
      setLiquidityError(err.message);
      setLiquidityPlan(null);
    } finally {
      setLiquidityBusy(false);
    }
  };

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
      setHistoryPreview(null);
      setReconcileError(null);
      setHistoryError(null);
      setReconcileSuccess(`Archivo cargado: ${file.name}`);
    } catch (err) {
      setReconcileError(`No pude leer el archivo: ${err.message}`);
    }
  };

  const clearImportState = () => {
    setReconcilePreview(null);
    setHistoryPreview(null);
    setReconcileError(null);
    setHistoryError(null);
    setReconcileSuccess(null);
    setHistorySuccess(null);
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

  const handlePreviewHistoricalImport = async () => {
    setHistoryBusy(true);
    setHistoryError(null);
    setHistorySuccess(null);
    try {
      const preview = await api.previewHistoricalBrokerImport({
        broker,
        csv: csvText,
        sourceName: selectedFileName || undefined,
      });
      setHistoryPreview(preview);
      await loadAuditLog();
      setHistorySuccess(
        preview.importMode === "delta_backfill"
          ? `Backfill listo: ${preview.candidateSummary?.tradeRows || 0} movimiento(s) nuevos posteriores a ${preview.dbState?.latestTransactionDate || "—"}.`
          : `Histórico listo: ${preview.summary?.tradeRows || 0} trades detectados entre ${preview.summary?.firstTradeDate || "—"} y ${preview.summary?.lastTradeDate || "—"}.`
      );
    } catch (err) {
      setHistoryError(err.message);
    } finally {
      setHistoryBusy(false);
    }
  };

  const handleApplyHistoricalImport = async () => {
    setHistoryBusy(true);
    setHistoryError(null);
    setHistorySuccess(null);
    try {
      const result = await api.applyHistoricalBrokerImport({
        broker,
        csv: csvText,
        sourceName: selectedFileName || undefined,
      });
      setHistoryPreview((current) => current ? { ...current, dbState: { ...current.dbState, isClean: false, latestTransactionDate: result.summary?.lastTradeDate || current.dbState?.latestTransactionDate } } : current);
      await loadAuditLog();
      setHistorySuccess(`Histórico aplicado: ${result.imported?.transactionsImported || 0} transacciones importadas.`);
      if (onReconciled) await onReconciled();
    } catch (err) {
      setHistoryError(err.message);
    } finally {
      setHistoryBusy(false);
    }
  };

  return (
    <div className="ca-main" style={{ padding: "32px", maxWidth: 1200, margin: "0 auto", animation: "fadeUp 0.5s ease" }}>
      <SectionHeader title="Operaciones" subtitle="Portfolio real, reconciliación con broker e historial de transacciones" />

      <div style={{ ...S.grid(240), gap: 16, marginBottom: 16 }}>
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

      {/* ── Commission estimates & net P&L ── */}
      {(() => {
        const estCommissionPct = 0.6;
        const estCommissionArs = totalValue * (estCommissionPct / 100);
        const netPnlPct = totalPnl - estCommissionPct;
        const netPnlArs = (totalValue - totalCost) - estCommissionArs;
        const profitBelowCommission = totalPnl > 0 && totalPnl < estCommissionPct;
        return (
          <div style={{
            background: T.bgCard,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            padding: "14px 20px",
            marginBottom: 28,
          }}>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", fontSize: 13, color: T.textMuted }}>
              <span>
                Comisiones estimadas: <strong style={{ color: T.text, fontFamily: T.fontMono }}>{formatMoney(estCommissionArs)} ARS ({estCommissionPct}%)</strong>
              </span>
              <span>
                P&L neto (después de comisiones): <strong style={{ color: netPnlPct >= 0 ? T.green : T.red, fontFamily: T.fontMono }}>{formatMoney(netPnlArs)} ARS</strong>
              </span>
            </div>
            {profitBelowCommission && (
              <div style={{ marginTop: 8, fontSize: 12, color: T.yellow, fontWeight: 600 }}>
                Atención: la ganancia no cubre las comisiones estimadas
              </div>
            )}
          </div>
        );
      })()}

      <GlassCard glowColor={T.orange} style={{ marginBottom: 28 }}>
        <SectionHeader
          title="Liquidez Rápida"
          subtitle="Ingresá cuánto querés tener en caja y el sistema propone qué vender primero, descontando costos."
        />

        {liquidityError && <StatusMsg type="error">{liquidityError}</StatusMsg>}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 320px) auto", gap: 12, alignItems: "end", marginBottom: 16 }}>
          <div>
            <div style={{ ...S.label, marginBottom: 8 }}>Objetivo Neto ARS</div>
            <input
              type="number"
              min="0"
              step="1000"
              value={liquidityTarget}
              onChange={(event) => setLiquidityTarget(event.target.value)}
              placeholder="Ej: 500000"
              style={S.input}
            />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={handleLiquidityPlan}
              disabled={liquidityBusy}
              style={{ ...S.btn("secondary"), opacity: liquidityBusy ? 0.7 : 1 }}
            >
              {liquidityBusy ? "Calculando..." : "Calcular ventas"}
            </button>
            <button
              onClick={() => {
                setLiquidityTarget("");
                setLiquidityPlan(null);
                setLiquidityError(null);
              }}
              style={S.btn("ghost")}
            >
              Limpiar
            </button>
          </div>
        </div>

        {liquidityPlan && (
          <>
            <div style={{ ...S.grid(220), gap: 16, marginBottom: 18 }}>
              <MetricCard label="Objetivo" value={liquidityPlan.targetNetArs || 0} prefix="$" color={T.orange} glowColor={T.orange} icon={DollarSign} />
              <MetricCard label="Caja Actual" value={liquidityPlan.availableCashArs || 0} prefix="$" color={T.blue} glowColor={T.blue} icon={DollarSign} />
              <MetricCard label="A Vender Neto" value={liquidityPlan.targetNetFromSalesArs || 0} prefix="$" color={T.yellow} glowColor={T.yellow} icon={TrendingDown} />
              <MetricCard label="Plan Neto" value={liquidityPlan.summary?.netPlannedArs || 0} prefix="$" color={liquidityPlan.feasible ? T.green : T.red} glowColor={liquidityPlan.feasible ? T.green : T.red} icon={liquidityPlan.feasible ? TrendingUp : TrendingDown} />
            </div>

            <div style={{
              padding: "14px 18px",
              borderRadius: 14,
              marginBottom: 16,
              background: liquidityPlan.feasible ? `${T.green}08` : `${T.yellow}08`,
              border: `1px solid ${liquidityPlan.feasible ? `${T.green}20` : `${T.yellow}20`}`,
              color: liquidityPlan.feasible ? T.green : T.yellow,
              fontSize: 13,
              fontWeight: 700,
            }}>
              {liquidityPlan.feasible
                ? `Plan viable: con estas ventas estimadas llegarías a ${formatMoney(liquidityPlan.summary?.netPlannedArs || 0)} netos.`
                : `No alcanza con las posiciones sugeridas. Gap estimado: ${formatMoney(liquidityPlan.summary?.remainingGapArs || 0)}.`}
            </div>

            {liquidityPlan.notes?.length > 0 && (
              <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.7, marginBottom: 14 }}>
                {liquidityPlan.notes[0]}
              </div>
            )}

            {liquidityPlan.recommendations?.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={S.th}>Ticker</th>
                      <th style={S.th}>Vender</th>
                      <th style={S.th}>Precio</th>
                      <th style={S.th}>Neto Est.</th>
                      <th style={S.th}>P&L</th>
                      <th style={S.th}>Peso</th>
                      <th style={S.th}>Por qué</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liquidityPlan.recommendations.map((item) => (
                      <tr key={item.ticker}>
                        <td style={{ ...S.td, fontFamily: T.fontMono, fontWeight: 700, color: T.text }}>{item.ticker}</td>
                        <td style={{ ...S.td, fontFamily: T.fontMono }}>{item.sharesToSell} / {item.sharesAvailable}</td>
                        <td style={{ ...S.td, fontFamily: T.fontMono }}>{formatMoney(item.currentPriceArs)}</td>
                        <td style={{ ...S.td, fontFamily: T.fontMono, color: T.text }}>{formatMoney(item.estimatedNetAmountArs)}</td>
                        <td style={{ ...S.td, fontFamily: T.fontMono, color: item.pnlPct >= 0 ? T.green : T.red }}>
                          {item.pnlPct >= 0 ? "+" : ""}{item.pnlPct?.toFixed(1)}%
                        </td>
                        <td style={{ ...S.td, fontFamily: T.fontMono }}>{item.weightPct?.toFixed(1)}%</td>
                        <td style={{ ...S.td, color: T.textMuted }}>{item.reasons?.[0] || item.latestActionReason || "Liberar caja con el menor daño posible."}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: T.textDim }}>
                No hace falta vender nada o no hay posiciones suficientes para armar un plan.
              </div>
            )}
          </>
        )}
      </GlassCard>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={api.exportPortfolio} style={{ ...S.btn("ghost"), fontSize: 11, padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: 6 }}><Download size={12} /> Exportar Portfolio CSV</button>
        <button onClick={api.exportTransactions} style={{ ...S.btn("ghost"), fontSize: 11, padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: 6 }}><Download size={12} /> Exportar Transacciones CSV</button>
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
          <button onClick={() => fileInputRef.current?.click()} style={{ ...S.btn("secondary"), display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Upload size={14} /> Cargar CSV o Excel
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
              <MetricCard label="Acciones" value={previewSummary.totalActions || 0} color={T.cyan} glowColor={T.cyan} icon={LayoutList} />
              <MetricCard label="Compras" value={previewSummary.buyActions || 0} color={T.green} glowColor={T.green} icon={TrendingUp} />
              <MetricCard label="Ventas" value={previewSummary.sellActions || 0} color={T.red} glowColor={T.red} icon={TrendingDown} />
              <MetricCard label="Bruto Compra" value={previewSummary.grossBuyArs || 0} prefix="$" color={T.blue} glowColor={T.blue} icon={DollarSign} />
              <MetricCard label="Bruto Venta" value={previewSummary.grossSellArs || 0} prefix="$" color={T.yellow} glowColor={T.yellow} icon={DollarSign} />
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

      <GlassCard glowColor={T.yellow} style={{ marginBottom: 28 }}>
        <SectionHeader
          title="Recuperación Histórica"
          subtitle="Usá el Excel de Cuenta Corriente de Bull Market para reconstruir compras y ventas reales sobre una base nueva."
        />

        {historyError && <StatusMsg type="error">{historyError}</StatusMsg>}
        {historySuccess && <StatusMsg type="success">{historySuccess}</StatusMsg>}

        <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.7, marginBottom: 16 }}>
          Este flujo es para <strong style={{ color: T.text }}>histórico transaccional</strong>, no para snapshot de tenencias.
          Si la base ya tiene histórico, el sistema entra en modo <strong style={{ color: T.text }}>delta backfill</strong> y solo propone movimientos posteriores al último registro guardado.
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: historySummary ? 18 : 0 }}>
          <button
            onClick={handlePreviewHistoricalImport}
            disabled={historyBusy}
            style={{ ...S.btn("secondary"), opacity: historyBusy ? 0.7 : 1 }}
          >
            {historyBusy ? "Procesando..." : "Previsualizar Histórico"}
          </button>
          <button
            onClick={handleApplyHistoricalImport}
            disabled={historyBusy || !historyPreview || (historyCandidateSummary?.tradeRows || 0) === 0 || historyWarnings.some((warning) => isBlockingHistoricalWarning(warning, historyImportMode))}
            style={{ ...S.btn("primary"), opacity: historyBusy || !historyPreview || (historyCandidateSummary?.tradeRows || 0) === 0 || historyWarnings.some((warning) => isBlockingHistoricalWarning(warning, historyImportMode)) ? 0.6 : 1 }}
          >
            Aplicar Histórico
          </button>
        </div>

        {historySummary && (
          <>
            <div style={{ ...S.grid(220), gap: 16, marginBottom: 20 }}>
              <MetricCard label="Trades Ledger" value={historySummary.tradeRows || 0} color={T.yellow} glowColor={T.yellow} icon={RefreshCw} />
              <MetricCard label="Delta A Importar" value={historyCandidateSummary?.tradeRows || 0} color={T.cyan} glowColor={T.cyan} icon={ArrowRight} />
              <MetricCard label="Compras" value={historyCandidateSummary?.buyRows || 0} color={T.green} glowColor={T.green} icon={TrendingUp} />
              <MetricCard label="Ventas" value={historyCandidateSummary?.sellRows || 0} color={T.red} glowColor={T.red} icon={TrendingDown} />
              <MetricCard label="Ignoradas" value={historySummary.ignoredRows || 0} color={T.blue} glowColor={T.blue} icon={XCircle} />
              <MetricCard label="Posiciones Finales" value={historySummary.resultingPositions || 0} color={T.purple} glowColor={T.purple} icon={Layers} />
            </div>

            <div style={{ fontSize: 12, color: T.textDim, marginBottom: 14, lineHeight: 1.7 }}>
              Rango: <strong style={{ color: T.text }}>{historySummary.firstTradeDate || "—"}</strong>
              {" → "}
              <strong style={{ color: T.text }}>{historySummary.lastTradeDate || "—"}</strong>
              {" · "}
              Tickers operados: <strong style={{ color: T.text }}>{historySummary.tickersTraded}</strong>
              {" · "}
              Modo: <strong style={{ color: historyImportMode === "delta_backfill" ? T.yellow : T.green }}>{historyImportMode === "delta_backfill" ? "delta backfill" : "full import"}</strong>
              {" · "}
              Última tx DB: <strong style={{ color: T.text }}>{historyDbState?.latestTransactionDate || "—"}</strong>
            </div>

            {!historyDbState?.isClean && (
              <div style={{ padding: 16, borderRadius: 14, background: `${T.yellow}08`, border: `1px solid ${T.yellow}18`, color: T.yellow, marginBottom: 16 }}>
                La base actual ya tiene histórico. Se ofrecerán solo movimientos posteriores a {historyDbState?.latestTransactionDate || "la última fecha disponible"}.
              </div>
            )}

            {historyWarnings.length > 0 && (
              <div style={{ padding: 16, borderRadius: 14, background: `${T.yellow}08`, border: `1px solid ${T.yellow}18`, color: T.yellow, marginBottom: 16 }}>
                {historyWarnings[0]}
              </div>
            )}

            <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
              <div style={{ overflowX: "auto" }}>
                <div style={{ ...S.label, marginBottom: 8 }}>Trades Detectados</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={S.th}>Fecha</th>
                      <th style={S.th}>Tipo</th>
                      <th style={S.th}>Ticker</th>
                      <th style={S.th}>Cant.</th>
                      <th style={S.th}>Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyCandidateEntries.slice(0, 20).map((entry) => (
                      <tr key={`${entry.sourceRow}-${entry.ticker}-${entry.type}`}>
                        <td style={{ ...S.td, fontFamily: T.fontMono }}>{entry.executedAt}</td>
                        <td style={S.td}><span style={{ ...S.badge(entry.type === "BUY" ? T.green : T.red), fontSize: 9 }}>{entry.type}</span></td>
                        <td style={{ ...S.td, fontFamily: T.fontMono }}>{entry.ticker}</td>
                        <td style={{ ...S.td, fontFamily: T.fontMono }}>{entry.shares}</td>
                        <td style={{ ...S.td, fontFamily: T.fontMono }}>{formatMoney(entry.priceArs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ overflowX: "auto" }}>
                <div style={{ ...S.label, marginBottom: 8 }}>Posiciones Resultantes</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={S.th}>Ticker</th>
                      <th style={S.th}>Cantidad</th>
                      <th style={S.th}>Costo Prom.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyPositions.map((position) => (
                      <tr key={position.ticker}>
                        <td style={{ ...S.td, fontFamily: T.fontMono }}>{position.ticker}</td>
                        <td style={{ ...S.td, fontFamily: T.fontMono }}>{position.shares}</td>
                        <td style={{ ...S.td, fontFamily: T.fontMono }}>{formatMoney(position.priceArs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {historyIgnoredRows.length > 0 && (
              <div style={{ fontSize: 12, color: T.textDim, marginTop: 14 }}>
                Se ignoraron {historyIgnoredRows.length} filas no operativas, como transferencias, créditos y otros movimientos de caja.
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
                        <span style={{ fontSize: 12, fontFamily: T.fontMono, fontWeight: 800, color: pnl >= 0 ? T.green : T.red, background: pnl >= 0 ? T.greenGlow : T.redGlow, padding: "3px 10px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {pnl >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {Math.abs(pnl).toFixed(1)}%
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
                  <th style={S.th}>Comisión Est.</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 20).map((transaction) => {
                  const txTotal = transaction.total_ars || (transaction.price_ars * transaction.shares) || 0;
                  const estComm = txTotal * 0.003; // 0.3% one-way
                  return (
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
                      <td style={{ ...S.td, fontFamily: T.fontMono, fontWeight: 700, color: T.text }}>{formatMoney(txTotal)}</td>
                      <td style={{ ...S.td, fontFamily: T.fontMono, color: T.textDim }}>{formatMoney(estComm)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
