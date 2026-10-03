// bvl.ts — Bolsa de Valores de Lima (BVL) keyless API.
// The exchange's own site backend: https://dataondemand.bvl.com.pe (/v1/).
// No key, no auth. BVL_BASE env overrides the host for tests.
const base = () => (process.env.BVL_BASE || "https://dataondemand.bvl.com.pe").replace(/\/+$/, "");
const UA = "Mozilla/5.0 (compatible; Baobab/1.0; +https://github.com/sefuwunder/baobab)";

export interface BvlQuote {
  sym: string; name: string; price: number; prevClose: number | null; chg: number | null;
  chgPct: number | null; dayHigh: number | null; dayLow: number | null;
  volume: number | null; ccy: string | null;
}
export interface BvlIndex extends BvlQuote { bars: Array<{ t: number; o: number; h: number; l: number; c: number; v: null }> }

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return isFinite(n) ? n : null;
}
function normCcy(c: unknown): string | null {
  const s = String(c || "").trim();
  if (/^us\$?$/i.test(s)) return "USD";
  if (/^s\//i.test(s)) return "PEN";
  return s || null;
}

async function bget(path: string, init?: RequestInit): Promise<any> {
  const r = await fetch(base() + path, {
    ...init,
    headers: { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/json", ...(init?.headers || {}) },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`bvl ${r.status}`);
  return r.json();
}

/** Full BVL quote board; returns top N by traded amount, shaped. */
export async function bvlBoard(limit = 12): Promise<BvlQuote[]> {
  const arr = await bget("/v1/stock-quote/home", { method: "POST", body: "{}" });
  if (!Array.isArray(arr)) return [];
  const rows = arr
    .map((q: any) => {
      const price = num(q.last);
      if (price == null || !q.nemonico) return null;
      const prev = num(q.previous);
      return {
        sym: String(q.nemonico).toUpperCase(),
        name: String(q.shortName || q.companyName || q.nemonico),
        price, prevClose: prev,
        chg: prev != null ? price - prev : null,
        chgPct: num(q.percentageChange),
        dayHigh: num(q.maximun), dayLow: num(q.minimun),
        volume: num(q.negotiatedQuantity),
        ccy: normCcy(q.currency),
        _amt: num(q.negotiatedAmount) || 0,
      };
    })
    .filter(Boolean) as Array<BvlQuote & { _amt: number }>;
  rows.sort((a, b) => b._amt - a._amt);
  return rows.slice(0, limit).map(({ _amt, ...q }) => q);
}

export async function bvlQuote(sym: string): Promise<BvlQuote | null> {
  const board = await bvlBoard(500);
  return board.find((q) => q.sym === sym.toUpperCase()) || null;
}

/** MSCI NUAM indices with intraday bars from dailyValues. */
export async function bvlIndices(): Promise<BvlIndex[]> {
  const d = await bget("/v1/indices");
  const arr = d.content || d || [];
  if (!Array.isArray(arr)) return [];
  return arr.map((x: any) => {
    const price = num(x.value);
    if (price == null || !x.nemonico) return null;
    const close = num(x.close);
    const bars = (Array.isArray(x.dailyValues) ? x.dailyValues : [])
      .map((p: any) => {
        const t = Date.parse(p[0]);
        const c = num(p[1]);
        return isFinite(t) && c != null ? { t, o: c, h: c, l: c, c, v: null } : null;
      })
      .filter(Boolean);
    return {
      sym: String(x.nemonico).toUpperCase(),
      name: String(x.name || x.shortName || x.nemonico),
      price, prevClose: close,
      chg: close != null ? price - close : null,
      chgPct: num(x.variation),
      dayHigh: num(x.high), dayLow: num(x.low),
      volume: null, ccy: "PEN", bars,
    };
  }).filter(Boolean) as BvlIndex[];
}
