// yahoo.ts — Yahoo Finance v8 chart client: quotes + history.
// No API key; a browser User-Agent keeps it reachable. YAHOO_BASE env
// overrides the host so tests can point at a local stub server.
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const base = () => (process.env.YAHOO_BASE || "https://query1.finance.yahoo.com").replace(/\/+$/, "");

export interface Quote {
  sym: string; price: number; prevClose: number; chg: number; chgPct: number;
  dayHigh: number | null; dayLow: number | null;
  wk52High: number | null; wk52Low: number | null;
  volume: number | null; ccy: string; name: string; exchange: string; asof: number;
}

export interface Bar { t: number; o: number | null; h: number | null; l: number | null; c: number | null; v: number | null }

interface ChartResult { meta: any; bars: Bar[] }

async function getJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function parseChart(sym: string, d: any): ChartResult | null {
  const res = d?.chart?.result?.[0];
  if (!res || !Array.isArray(res.timestamp)) return null;
  const q = res.indicators?.quote?.[0] || {};
  const adj = res.indicators?.adjclose?.[0]?.adjclose;
  const bars: Bar[] = res.timestamp.map((t: number, i: number) => ({
    t: t * 1000,
    o: q.open?.[i] ?? null,
    h: q.high?.[i] ?? null,
    l: q.low?.[i] ?? null,
    c: (adj?.[i] ?? q.close?.[i]) ?? null,
    v: q.volume?.[i] ?? null,
  })).filter((b: Bar) => b.c != null);
  if (!bars.length) return null;
  return { meta: res.meta || {}, bars };
}

/** A quote is the last two daily bars: live-ish price vs previous close. */
export async function quote(sym: string): Promise<Quote | null> {
  const d = await getJson(`${base()}/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`);
  const p = parseChart(sym, d);
  if (!p || p.bars.length < 1) return null;
  const last = p.bars[p.bars.length - 1];
  const prev = p.bars.length > 1 ? p.bars[p.bars.length - 2].c! : (p.meta.chartPreviousClose ?? last.c!);
  const m = p.meta;
  const price = last.c!;
  return {
    sym,
    price,
    prevClose: prev,
    chg: price - prev,
    chgPct: prev ? ((price - prev) / prev) * 100 : 0,
    dayHigh: m.regularMarketDayHigh ?? last.h,
    dayLow: m.regularMarketDayLow ?? last.l,
    wk52High: m.fiftyTwoWeekHigh ?? null,
    wk52Low: m.fiftyTwoWeekLow ?? null,
    volume: m.regularMarketVolume ?? last.v,
    ccy: m.currency || "",
    name: m.longName || m.shortName || sym,
    exchange: m.exchangeName || "",
    asof: last.t,
  };
}

/** Batch quotes with a concurrency cap so we don't hammer the API. */
export async function quotes(syms: string[], concurrency = 6): Promise<Array<Quote | null>> {
  const out: Array<Quote | null> = new Array(syms.length).fill(null);
  let i = 0;
  async function worker() {
    while (i < syms.length) {
      const idx = i++;
      try { out[idx] = await quote(syms[idx]); } catch { out[idx] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, syms.length) }, worker));
  return out;
}

const RANGES: Record<string, { range: string; interval: string }> = {
  "1D": { range: "1d", interval: "5m" },
  "1W": { range: "5d", interval: "15m" },
  "1M": { range: "1mo", interval: "1d" },
  "3M": { range: "3mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
  "5Y": { range: "5y", interval: "1wk" },
};

export function rangeParams(r: string): { range: string; interval: string } {
  return RANGES[r] || RANGES["1Y"];
}

export async function history(sym: string, r = "1Y"): Promise<Bar[]> {
  const { range, interval } = rangeParams(r);
  const d = await getJson(
    `${base()}/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}`
  );
  return parseChart(sym, d)?.bars || [];
}
