function toStooqSymbol(ticker) {
  const clean = String(ticker || "").replace(/\.BA$/i, "").trim().toLowerCase();
  if (!clean) return null;
  return `${clean}.us`;
}

function parseCsvRows(csv) {
  const lines = String(csv || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] || "").trim();
    });
    return row;
  });
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function fetchStooqQuote(ticker) {
  const symbol = toStooqSymbol(ticker);
  if (!symbol) return null;
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    const rows = parseCsvRows(text);
    if (!rows.length) return null;
    const row = rows[0];

    const close = num(row.close);
    if (!close || row.close === "N/D") return null;
    const open = num(row.open);
    const high = num(row.high);
    const low = num(row.low);
    const volume = num(row.volume);
    const change = open != null ? close - open : null;
    const changePercent = open && open !== 0 ? (change / open) * 100 : null;

    return {
      ticker: String(ticker || "").replace(/\.BA$/i, "").toUpperCase(),
      price: close,
      previousClose: open,
      change,
      changePercent,
      dayHigh: high,
      dayLow: low,
      volume,
      avgVolume: null,
      marketCap: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      trailingPE: null,
      forwardPE: null,
      epsTrailingTwelveMonths: null,
      dividendYield: 0,
      beta: null,
      shortName: null,
      currency: "USD",
      exchange: "STOOQ",
      source: "stooq_fallback",
    };
  } catch (e) {
    console.warn("[marketFallback] fetchStooqQuote failed:", e.message);
    return null;
  }
}

export async function fetchStooqHistory(ticker, months = 6) {
  const symbol = toStooqSymbol(ticker);
  if (!symbol) return [];
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    const rows = parseCsvRows(text);
    if (!rows.length) return [];

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);

    return rows
      .map((row) => {
        const date = row.date;
        const open = num(row.open);
        const high = num(row.high);
        const low = num(row.low);
        const close = num(row.close);
        const volume = num(row.volume);
        if (!date || open == null || high == null || low == null || close == null) return null;
        return { date, open, high, low, close, volume: volume || 0 };
      })
      .filter((row) => row && new Date(row.date) >= cutoff)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  } catch (e) {
    console.warn("[marketFallback] fetchStooqHistory failed:", e.message);
    return [];
  }
}
