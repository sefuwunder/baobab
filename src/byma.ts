// byma.ts — BYMA (Bolsas y Mercados Argentinos) Open Data, keyless.
// https://open.bymadata.com.ar — official /free/ endpoints, no auth.
// BYMA_BASE env overrides the host for tests.
const base = () => (process.env.BYMA_BASE || "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata").replace(/\/+$/, "");
const UA = "Mozilla/5.0 (compatible; Baobab/1.0; +https://github.com/sefuwunder/baobab)";

export interface BymaIndex {
  sym: string; name: string; price: number; prevClose: number | null; chg: number | null;
  chgPct: number | null; dayHigh: number | null; dayLow: number | null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

/** The 16 live BYMA indices (S&P BYMA Indice General, Merval variants, etc). */
export async function bymaIndices(): Promise<BymaIndex[]> {
  const r = await fetch(base() + "/free/index-price", {
    method: "POST",
    headers: { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`byma ${r.status}`);
  const d = await r.json();
  const arr = d.data || [];
  return arr.map((x: any) => {
    const price = num(x.price ?? x.closingPrice);
    if (price == null || !x.symbol) return null;
    const prev = num(x.previousClosingPrice);
    const variation = num(x.variation); // fraction, e.g. 0.0034
    return {
      sym: String(x.symbol).toUpperCase(),
      name: String(x.description || x.symbol),
      price, prevClose: prev,
      chg: prev != null ? price - prev : null,
      chgPct: variation != null ? variation * 100 : null,
      dayHigh: num(x.highestPrice), dayLow: num(x.lowestPrice),
    };
  }).filter(Boolean) as BymaIndex[];
}

export async function bymaQuote(sym: string): Promise<BymaIndex | null> {
  const all = await bymaIndices();
  return all.find((x) => x.sym === sym.toUpperCase()) || null;
}
