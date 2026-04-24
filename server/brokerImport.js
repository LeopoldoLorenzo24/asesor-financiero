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
