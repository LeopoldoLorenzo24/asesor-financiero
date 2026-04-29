import CEDEARS from "./cedears.js";

const TICKER_SET = new Set(CEDEARS.map((item) => item.ticker));
const DEFAULT_BROKER = "generic";

const BROKER_IMPORT_CONFIG = {
  generic: {
    aliases: {
      ticker: ["ticker", "simbolo", "symbol", "especie"],
      product: ["producto", "descripcion", "instrumento", "activo"],
      shares: ["cantidad", "shares", "tenencia", "posicion"],
      priceArs: [
        "ppc",
        "ppc ars",
        "precio promedio",
        "precio promedio ars",
        "precio promedio compra ars",
        "promedio ars",
        "avg price ars",
        "price ars",
        "precio ars",
      ],
      priceUsd: [
        "ppc usd",
        "precio promedio usd",
        "precio promedio compra usd",
        "promedio usd",
        "avg price usd",
        "price usd",
        "precio usd",
      ],
      lastPriceArs: ["ultimo precio", "último precio", "last price", "precio ultimo"],
      totalArs: ["total", "importe total", "valuacion", "valuación", "market value ars"],
    },
  },
  bull_market: {
    aliases: {
      ticker: ["ticker", "simbolo", "símbolo", "especie"],
      product: ["producto", "descripcion", "descripción", "activo"],
      shares: ["cantidad", "tenencia"],
      priceArs: [
        "ppc",
        "ppc ars",
        "precio promedio compra",
        "precio promedio compra ars",
        "precio promedio",
      ],
      priceUsd: [
        "ppc usd",
        "precio promedio compra usd",
      ],
      lastPriceArs: ["ultimo precio", "último precio"],
      totalArs: ["total", "mis inversiones", "importe total"],
    },
  },
};

const BROKER_LEDGER_CONFIG = {
  bull_market: {
    aliases: {
      settlementDate: ["liquida", "liquidacion", "liquidación"],
      tradeDate: ["operado", "fecha operada", "fecha"],
      voucherType: ["comprobante", "tipo", "movimiento"],
      voucherNumber: ["numero", "número"],
      shares: ["cantidad"],
      ticker: ["especie", "ticker", "simbolo", "símbolo"],
      priceArs: ["precio"],
      amountArs: ["importe", "monto"],
      balanceArs: ["saldo"],
      reference: ["referencia", "detalle", "concepto"],
    },
  },
};

function stripBom(value) {
  return String(value || "").replace(/^\uFEFF/, "");
}

function normalizeHeader(value) {
  return stripBom(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeText(value) {
  return normalizeHeader(String(value || "").replace(/\./g, " "));
}

function splitCsvLine(line, separator) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === separator && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"(.*)"$/, "$1").trim());
}

function detectSeparator(headerLine) {
  const semicolons = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return semicolons > commas ? ";" : ",";
}

function parseLocaleNumber(value) {
  const raw = String(value ?? "")
    .replace(/[A-Za-z$]/g, "")
    .replace(/\s/g, "")
    .trim();

  if (!raw) return null;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw;

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = raw.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = raw.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = raw.replace(/,/g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickValue(row, aliases) {
  for (const alias of aliases) {
    const match = Object.keys(row).find((key) => normalizeHeader(key) === alias);
    if (match) return row[match];
  }
  return null;
}

function normalizeBrokerKey(value) {
  const raw = String(value || DEFAULT_BROKER)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return BROKER_IMPORT_CONFIG[raw] ? raw : DEFAULT_BROKER;
}

function normalizeLedgerBrokerKey(value) {
  const raw = String(value || DEFAULT_BROKER)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return BROKER_LEDGER_CONFIG[raw] ? raw : "bull_market";
}

function extractTickerFromProduct(value) {
  const text = String(value || "").toUpperCase();
  if (!text) return null;
  const tokens = text.split(/[^A-Z0-9.]+/).filter(Boolean);
  for (const token of tokens) {
    if (TICKER_SET.has(token)) return token;
  }
  return null;
}

function resolvePriceArs({ priceArs, priceUsd, totalArs, shares, cclRate }) {
  if (priceArs != null && Number.isFinite(Number(priceArs)) && Number(priceArs) > 0) {
    return Number(priceArs);
  }
  if (totalArs != null && Number.isFinite(Number(totalArs)) && Number(totalArs) > 0 && Number(shares) > 0) {
    return Math.round((Number(totalArs) / Number(shares)) * 100) / 100;
  }
  if (priceUsd != null && Number.isFinite(Number(priceUsd)) && Number(priceUsd) > 0) {
    if (!Number.isFinite(Number(cclRate)) || Number(cclRate) <= 0) {
      return null;
    }
    return Math.round(priceUsd * Number(cclRate) * 100) / 100;
  }
  return null;
}

function parseSpreadsheetDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000 && serial < 100000) {
    const utcMillis = Math.round((serial - 25569) * 86400 * 1000);
    return new Date(utcMillis).toISOString().slice(0, 10);
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (isoMatch) return raw;

  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  return null;
}

function getLedgerAliases(broker) {
  const brokerKey = normalizeLedgerBrokerKey(broker);
  return BROKER_LEDGER_CONFIG[brokerKey]?.aliases || BROKER_LEDGER_CONFIG.bull_market.aliases;
}

function classifyLedgerMovement(voucherType, reference) {
  const voucher = normalizeText(voucherType);
  const ref = normalizeText(reference);

  if (voucher.includes("compra")) return "BUY";
  if (voucher === "venta" || voucher.includes("venta")) return "SELL";
  if (voucher.includes("divid") || ref.includes("divid")) return "DIVIDEND";
  if (ref.includes("credito cta cte")) return "CASH_IN";
  if (ref.includes("transferencia via mep")) return "CASH_OUT";
  if (voucher.includes("recibo de cobro")) return "CASH_IN";
  if (voucher.includes("orden de pago")) return "CASH_OUT";
  return "OTHER";
}

function replayHistoricalEntries(entries) {
  const sortedEntries = [...entries].sort((a, b) => {
    const dateCompare = String(a.executedAt).localeCompare(String(b.executedAt));
    if (dateCompare !== 0) return dateCompare;
    return (a.sourceRow || 0) - (b.sourceRow || 0);
  });

  const lotsByTicker = new Map();
  const warnings = [];

  for (const entry of sortedEntries) {
    const lots = lotsByTicker.get(entry.ticker) || [];
    if (entry.type === "BUY") {
      lots.push({
        ticker: entry.ticker,
        shares: entry.shares,
        priceArs: entry.priceArs,
        executedAt: entry.executedAt,
        notes: entry.notes,
      });
      lotsByTicker.set(entry.ticker, lots);
      continue;
    }

    if (entry.type !== "SELL") continue;

    let remaining = entry.shares;
    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0];
      if (lot.shares <= remaining) {
        remaining -= lot.shares;
        lots.shift();
      } else {
        lot.shares -= remaining;
        remaining = 0;
      }
    }

    if (remaining > 0) {
      warnings.push(`Fila ${entry.sourceRow}: venta de ${entry.ticker} excede las compras históricas por ${remaining} CEDEARs.`);
    }

    if (lots.length > 0) {
      lotsByTicker.set(entry.ticker, lots);
    } else {
      lotsByTicker.delete(entry.ticker);
    }
  }

  const resultingPositions = Array.from(lotsByTicker.entries())
    .map(([ticker, lots]) => {
      const totalShares = lots.reduce((sum, lot) => sum + lot.shares, 0);
      const totalCost = lots.reduce((sum, lot) => sum + lot.shares * lot.priceArs, 0);
      return {
        ticker,
        shares: totalShares,
        priceArs: totalShares > 0 ? Math.round((totalCost / totalShares) * 100) / 100 : 0,
      };
    })
    .filter((position) => position.shares > 0)
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  const remainingLots = Array.from(lotsByTicker.values())
    .flat()
    .filter((lot) => lot.shares > 0)
    .sort((a, b) => {
      const tickerCompare = a.ticker.localeCompare(b.ticker);
      if (tickerCompare !== 0) return tickerCompare;
      return String(a.executedAt).localeCompare(String(b.executedAt));
    });

  return { sortedEntries, resultingPositions, remainingLots, warnings };
}

function normalizeImportedPosition(position, index, cclRate) {
  const ticker = String(position.ticker || "").trim().toUpperCase();
  if (!ticker) {
    throw new Error(`Fila ${index + 1}: no se pudo determinar el ticker.`);
  }
  if (!TICKER_SET.has(ticker)) {
    throw new Error(`Fila ${index + 1}: ticker ${ticker} no pertenece al universo de CEDEARs configurado.`);
  }

  const shares = Number(position.shares);
  if (!Number.isFinite(shares) || shares < 0) {
    throw new Error(`Fila ${index + 1}: cantidad invalida para ${ticker}.`);
  }

  const priceUsd = position.priceUsd != null ? Number(position.priceUsd) : null;
  const totalArs = position.totalArs != null ? Number(position.totalArs) : null;
  const priceArs = resolvePriceArs({ priceArs: position.priceArs, priceUsd, totalArs, shares, cclRate });

  if (!Number.isFinite(Number(priceArs)) || Number(priceArs) < 0) {
    throw new Error(`Fila ${index + 1}: precio invalido para ${ticker}.`);
  }

  return {
    ticker,
    shares,
    priceArs: Number(priceArs),
    priceUsd: priceUsd != null && Number.isFinite(priceUsd) ? priceUsd : null,
  };
}

function aggregateImportedPositions(rows) {
  const aggregated = new Map();
  for (const row of rows) {
    if (row.shares <= 0) continue;
    const existing = aggregated.get(row.ticker);
    if (!existing) {
      aggregated.set(row.ticker, { ...row });
      continue;
    }
    const totalShares = existing.shares + row.shares;
    const weightedPriceArs = totalShares > 0
      ? ((existing.shares * existing.priceArs) + (row.shares * row.priceArs)) / totalShares
      : row.priceArs;
    const weightedPriceUsd = existing.priceUsd != null && row.priceUsd != null && totalShares > 0
      ? ((existing.shares * existing.priceUsd) + (row.shares * row.priceUsd)) / totalShares
      : existing.priceUsd ?? row.priceUsd ?? null;
    aggregated.set(row.ticker, {
      ticker: row.ticker,
      shares: totalShares,
      priceArs: Math.round(weightedPriceArs * 100) / 100,
      priceUsd: weightedPriceUsd != null ? Math.round(weightedPriceUsd * 10000) / 10000 : null,
    });
  }
  return Array.from(aggregated.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function getBrokerAliases(broker) {
  const brokerKey = normalizeBrokerKey(broker);
  const brokerConfig = BROKER_IMPORT_CONFIG[brokerKey] || BROKER_IMPORT_CONFIG[DEFAULT_BROKER];
  return brokerConfig.aliases;
}

export function parseBrokerSnapshotCsv(csvText, cclRate = null, broker = DEFAULT_BROKER) {
  const lines = stripBom(csvText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV invalido: no hay suficientes filas para importar.");
  }

  const separator = detectSeparator(lines[0]);
  const headers = splitCsvLine(lines[0], separator);
  const aliases = getBrokerAliases(broker);
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line, separator);
    return headers.reduce((acc, header, index) => {
      acc[header] = values[index] ?? "";
      return acc;
    }, {});
  });

  const parsed = rows.map((row, index) => {
    const ticker =
      String(pickValue(row, aliases.ticker) || "").trim().toUpperCase() ||
      extractTickerFromProduct(pickValue(row, aliases.product));
    const shares = parseLocaleNumber(pickValue(row, aliases.shares));
    const priceArs = parseLocaleNumber(pickValue(row, aliases.priceArs));
    const priceUsd = parseLocaleNumber(pickValue(row, aliases.priceUsd));
    const totalArs = parseLocaleNumber(pickValue(row, aliases.totalArs));
    const lastPriceArs = parseLocaleNumber(pickValue(row, aliases.lastPriceArs));

    return normalizeImportedPosition({
      ticker,
      shares,
      priceArs: priceArs ?? lastPriceArs,
      priceUsd,
      totalArs,
    }, index, cclRate);
  });

  return aggregateImportedPositions(parsed);
}

export function parseBrokerImportPayload({ positions, csv, cclRate = null, broker = DEFAULT_BROKER }) {
  if (Array.isArray(positions)) {
    return aggregateImportedPositions(
      positions.map((row, index) => normalizeImportedPosition(row, index, cclRate))
    );
  }
  if (typeof csv === "string" && csv.trim()) {
    return parseBrokerSnapshotCsv(csv, cclRate, broker);
  }
  throw new Error("Debes enviar positions[] o csv para reconciliar la cartera del broker.");
}

export function parseBrokerAccountLedgerPayload({ csv, broker = "bull_market" }) {
  if (typeof csv !== "string" || !csv.trim()) {
    throw new Error("Debes enviar el CSV/Excel convertido de Cuenta Corriente para importar el histórico.");
  }

  const lines = stripBom(csv)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("Archivo histórico inválido: no hay suficientes filas.");
  }

  const separator = detectSeparator(lines[0]);
  const headers = splitCsvLine(lines[0], separator);
  const aliases = getLedgerAliases(broker);
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line, separator);
    return headers.reduce((acc, header, index) => {
      acc[header] = values[index] ?? "";
      return acc;
    }, {});
  });

  const entries = [];
  const ignoredRows = [];

  rows.forEach((row, index) => {
    const sourceRow = index + 2;
    const voucherType = pickValue(row, aliases.voucherType);
    const reference = pickValue(row, aliases.reference);
    const movementType = classifyLedgerMovement(voucherType, reference);
    const tickerRaw = pickValue(row, aliases.ticker);
    const ticker = String(tickerRaw || "").trim().toUpperCase();
    const sharesRaw = parseLocaleNumber(pickValue(row, aliases.shares));
    const priceArs = parseLocaleNumber(pickValue(row, aliases.priceArs));
    const amountArs = parseLocaleNumber(pickValue(row, aliases.amountArs));
    const executedAt =
      parseSpreadsheetDate(pickValue(row, aliases.tradeDate)) ||
      parseSpreadsheetDate(pickValue(row, aliases.settlementDate));

    if (!executedAt) {
      ignoredRows.push({
        sourceRow,
        reason: "date_missing",
        movementType,
        voucherType,
        reference,
      });
      return;
    }

    if (movementType !== "BUY" && movementType !== "SELL") {
      ignoredRows.push({
        sourceRow,
        reason: "non_trade_movement",
        movementType,
        voucherType,
        reference,
        amountArs,
      });
      return;
    }

    if (!ticker || !TICKER_SET.has(ticker)) {
      ignoredRows.push({
        sourceRow,
        reason: "ticker_outside_universe",
        movementType,
        ticker,
        voucherType,
      });
      return;
    }

    const shares = Math.abs(Number(sharesRaw || 0));
    if (!Number.isFinite(shares) || shares <= 0) {
      ignoredRows.push({
        sourceRow,
        reason: "invalid_shares",
        movementType,
        ticker,
        voucherType,
      });
      return;
    }

    if (!Number.isFinite(Number(priceArs)) || Number(priceArs) <= 0) {
      ignoredRows.push({
        sourceRow,
        reason: "invalid_price",
        movementType,
        ticker,
        voucherType,
      });
      return;
    }

    entries.push({
      ticker,
      type: movementType,
      shares,
      priceArs: Number(priceArs),
      totalArs: amountArs != null ? Math.abs(Number(amountArs)) : Math.round(shares * Number(priceArs) * 100) / 100,
      executedAt,
      sourceRow,
      voucherType: String(voucherType || ""),
      voucherNumber: String(pickValue(row, aliases.voucherNumber) || ""),
      notes: [String(voucherType || "").trim(), String(reference || "").trim()].filter(Boolean).join(" · "),
    });
  });

  const { sortedEntries, resultingPositions, remainingLots, warnings } = replayHistoricalEntries(entries);
  const buyEntries = sortedEntries.filter((entry) => entry.type === "BUY");
  const sellEntries = sortedEntries.filter((entry) => entry.type === "SELL");

  return {
    entries: sortedEntries,
    ignoredRows,
    resultingPositions,
    remainingLots,
    warnings,
    summary: {
      tradeRows: sortedEntries.length,
      ignoredRows: ignoredRows.length,
      buyRows: buyEntries.length,
      sellRows: sellEntries.length,
      tickersTraded: new Set(sortedEntries.map((entry) => entry.ticker)).size,
      resultingPositions: resultingPositions.length,
      grossBuyArs: Math.round(buyEntries.reduce((sum, entry) => sum + entry.totalArs, 0) * 100) / 100,
      grossSellArs: Math.round(sellEntries.reduce((sum, entry) => sum + entry.totalArs, 0) * 100) / 100,
      firstTradeDate: sortedEntries[0]?.executedAt || null,
      lastTradeDate: sortedEntries[sortedEntries.length - 1]?.executedAt || null,
    },
  };
}
