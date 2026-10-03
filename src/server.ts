// server.ts — Baobab: a Bloomberg-style markets terminal for Africa,
// the Caribbean & Latin America. Bun + zero deps + SQLite. Port 3015.
import { initDataDir, getDb, cacheGet, cacheSet, watchlist, watchAdd, watchRemove } from "./db";
import { quote, quotes, history, type Quote } from "./yahoo";
import { REGISTRY, bySym, searchRegistry, DASH_INDICES, DASH_FX, DASH_CMD, DASH_STOCKS, DASH_STARTUPS, DASH_GLOBAL } from "./registry";
import { fetchNews } from "./news";

const PORT = Number(process.env.BAOBAB_PORT || 3015);
const QUOTE_TTL = 90_000;
const HIST_TTL = 3_600_000;
const NEWS_TTL = 1_200_000;

initDataDir();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function err(message: string, status = 400): Response { return json({ error: message }, status); }
async function body(req: Request): Promise<any> {
  try { return await req.json(); } catch { return {}; }
}

/** Cached single quote; serves stale data with stale:true when the fetch fails. */
async function getQuote(sym: string): Promise<{ q: Quote | null; stale: boolean }> {
  const key = "q:" + sym;
  const hit = cacheGet(key, QUOTE_TTL);
  if (!hit.stale && hit.val) return { q: hit.val, stale: false };
  try {
    const q = await quote(sym);
    if (q) { cacheSet(key, q); return { q, stale: false }; }
  } catch { /* fall through to stale */ }
  return { q: hit.val || null, stale: true };
}

async function getQuotes(syms: string[]): Promise<Array<{ q: Quote | null; stale: boolean }>> {
  const out: Array<{ q: Quote | null; stale: boolean }> = new Array(syms.length);
  let i = 0;
  async function worker() {
    while (i < syms.length) { const idx = i++; out[idx] = await getQuote(syms[idx]); }
  }
  await Promise.all(Array.from({ length: Math.min(8, syms.length) }, worker));
  return out;
}

function shapeQuote(r: { q: Quote | null; stale: boolean }) {
  const q = r.q;
  if (!q) return null;
  const reg = bySym.get(q.sym);
  return {
    sym: q.sym, name: reg?.name || q.name, region: reg?.region || "global", kind: reg?.kind || "stock",
    note: reg?.note || q.exchange, ccy: reg?.ccy || q.ccy,
    price: q.price, prevClose: q.prevClose, chg: q.chg, chgPct: q.chgPct,
    dayHigh: q.dayHigh, dayLow: q.dayLow, wk52High: q.wk52High, wk52Low: q.wk52Low,
    volume: q.volume, asof: q.asof, stale: r.stale,
  };
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const pub = `${import.meta.dir}/../public`;

  if (req.method === "GET" && (path === "/" || path === "/index.html"))
    return new Response(Bun.file(`${pub}/index.html`), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (req.method === "GET" && path === "/app.js")
    return new Response(Bun.file(`${pub}/app.js`), { headers: { "Content-Type": "text/javascript" } });
  if (req.method === "GET" && path === "/styles.css")
    return new Response(Bun.file(`${pub}/styles.css`), { headers: { "Content-Type": "text/css" } });
  if (req.method === "GET" && path === "/favicon.svg")
    return new Response(Bun.file(`${pub}/favicon.svg`), { headers: { "Content-Type": "image/svg+xml" } });

  if (req.method === "GET" && path === "/api/status")
    return json({ ok: true, time: Date.now() });

  // dashboard payload: one call for everything on TOP
  if (req.method === "GET" && path === "/api/overview") {
    const groups: Record<string, string[]> = {
      indices: DASH_INDICES, fx: DASH_FX, cmd: DASH_CMD, stocks: DASH_STOCKS, startups: DASH_STARTUPS, global: DASH_GLOBAL,
    };
    const out: Record<string, unknown> = { asof: Date.now() };
    for (const [k, syms] of Object.entries(groups)) {
      const qs = await getQuotes(syms);
      out[k] = qs.map(shapeQuote).filter(Boolean);
    }
    return json(out);
  }

  if (req.method === "GET" && path === "/api/quotes") {
    const syms = String(url.searchParams.get("syms") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 40);
    if (!syms.length) return err("syms required", 400);
    const qs = await getQuotes(syms);
    return json({ quotes: qs.map(shapeQuote).filter(Boolean) });
  }

  if (req.method === "GET" && path === "/api/history") {
    const sym = String(url.searchParams.get("sym") || "").trim();
    const range = String(url.searchParams.get("range") || "1Y").toUpperCase();
    if (!sym) return err("sym required", 400);
    const key = `h:${sym}:${range}`;
    const hit = cacheGet(key, HIST_TTL);
    if (!hit.stale && hit.val) return json({ sym, range, bars: hit.val, stale: false });
    try {
      const bars = await history(sym, range);
      if (bars.length) { cacheSet(key, bars); return json({ sym, range, bars, stale: false }); }
    } catch { /* fall through */ }
    if (hit.val) return json({ sym, range, bars: hit.val, stale: true });
    return err("No history for " + sym, 502);
  }

  if (req.method === "GET" && path === "/api/search") {
    const q = String(url.searchParams.get("q") || "");
    return json({ results: searchRegistry(q).map((s) => ({ sym: s.sym, name: s.name, region: s.region, kind: s.kind, note: s.note })) });
  }

  if (req.method === "GET" && path === "/api/news") {
    const region = String(url.searchParams.get("region") || "all");
    const hit = cacheGet("news", NEWS_TTL);
    let items = (!hit.stale && hit.val) ? hit.val : null;
    if (!items) {
      try { items = await fetchNews(); cacheSet("news", items); }
      catch { items = hit.val || []; }
    }
    const filtered = region === "all" ? items : items.filter((n: any) => n.region === region);
    return json({ news: filtered.slice(0, 60), stale: hit.stale && !items });
  }

  if (path === "/api/watchlist" && req.method === "GET") {
    const syms = watchlist();
    const qs = await getQuotes(syms);
    return json({ watchlist: qs.map(shapeQuote).filter(Boolean) });
  }
  if (path === "/api/watchlist" && req.method === "POST") {
    const b = await body(req);
    const sym = String(b.sym || "").trim();
    if (!sym) return err("sym required", 400);
    // validate the symbol resolves before storing
    const { q } = await getQuote(sym);
    if (!q) return err("Unknown symbol: " + sym, 404);
    watchAdd(sym);
    return json({ ok: true, quote: shapeQuote({ q, stale: false }) });
  }
  const delW = path.match(/^\/api\/watchlist\/(.+)$/);
  if (delW && req.method === "DELETE") {
    return json({ removed: watchRemove(decodeURIComponent(delW[1])) });
  }

  return err("Not found.", 404);
}

if (import.meta.main) {
  Bun.serve({ port: PORT, fetch: handle });
  console.log(`Baobab listening on http://localhost:${PORT}`);
}

export { handle };
