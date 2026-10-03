// jse.ts — Stacks API client for Jamaica Stock Exchange data.
// https://stacksja.com/developers — free key in the X-API-Key header.
// STACKS_BASE env overrides the host so tests can point at a local stub.
const base = () => (process.env.STACKS_BASE || "https://stacksja.com/api/v1/public").replace(/\/+$/, "");

export interface JseQuote {
  sym: string; name: string; price: number; chg: number; chgPct: number;
  volume: number | null; pe: number | null;
}
export interface JseBar { t: number; o: number; h: number; l: number; c: number; v: number | null }

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return isFinite(n) ? n : null;
}

async function jget(path: string, key: string): Promise<any> {
  const r = await fetch(base() + path, {
    headers: { "X-API-Key": key, Accept: "application/json", "User-Agent": "Baobab/1.0" },
    signal: AbortSignal.timeout(12000),
  });
  if (r.status === 401 || r.status === 403) throw new Error("invalid Stacks API key");
  if (!r.ok) throw new Error(`stacks ${r.status}`);
  return r.json();
}

function shapeQuote(o: any): JseQuote | null {
  const price = num(o.closing_price ?? o.price);
  if (price == null || !o.symbol) return null;
  const chgPct = num(o.change_percent) ?? 0;
  return {
    sym: String(o.symbol).toUpperCase(),
    name: String(o.company_name || o.symbol),
    price,
    chgPct,
    chg: (price * chgPct) / 100,
    volume: num(o.volume),
    pe: num(o.pe_ratio),
  };
}

/** All JSE stocks with latest prices. Accepts {stocks:[...]} or a bare array. */
export async function jseStocks(key: string): Promise<JseQuote[]> {
  const d = await jget("/stocks", key);
  const arr = Array.isArray(d) ? d : d.stocks || d.data || [];
  return arr.map(shapeQuote).filter(Boolean) as JseQuote[];
}

export async function jseQuote(key: string, sym: string): Promise<JseQuote | null> {
  const d = await jget(`/stock/${encodeURIComponent(sym.toUpperCase())}`, key);
  return shapeQuote(d);
}

/** Daily history, most-recent-first from the API → chronological bars. */
export async function jseHistory(key: string, sym: string, limit = 365): Promise<JseBar[]> {
  const d = await jget(`/stock/${encodeURIComponent(sym.toUpperCase())}/history?limit=${limit}`, key);
  const arr = d.history || d.data || [];
  const bars: JseBar[] = [];
  for (const h of arr) {
    const c = num(h.closing_price);
    const t = h.trade_date ? Date.parse(h.trade_date + "T00:00:00Z") : NaN;
    if (c == null || !isFinite(t)) continue;
    bars.push({ t, o: c, h: c, l: c, c, v: num(h.volume) });
  }
  return bars.reverse();
}

/** Validate a key; returns tier info when active. */
export async function jseKeyStatus(key: string): Promise<{ active: boolean; tier: string | null }> {
  try {
    const d = await jget("/key/status", key);
    return { active: d.status === "active", tier: d.tier || null };
  } catch {
    return { active: false, tier: null };
  }
}
