// server.ts — Baobab: a Bloomberg-style markets terminal for Africa,
// the Caribbean & Latin America. Bun + zero deps + SQLite. Port 3015.
import { initDataDir, getDb, cacheGet, cacheSet, watchlist, watchAdd, watchRemove, getSetting, setSetting } from "./db";
import { quote, quotes, history, type Quote } from "./yahoo";
import { REGISTRY, bySym, searchRegistry, DASH_INDICES, DASH_FX, DASH_CMD, DASH_STOCKS, DASH_STARTUPS, DASH_GLOBAL } from "./registry";
import { fetchNews } from "./news";
import { fetchFunding } from "./funding";
import { bvlBoard, bvlQuote, bvlIndices } from "./bvl";
import { bymaIndices, bymaQuote } from "./byma";
import { jseStocks, jseQuote, jseHistory, jseKeyStatus, type JseQuote } from "./jse";

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
  if (sym.startsWith("JSE:")) {
    const jq = await getJseQuote(sym.slice(4));
    return { q: jq.q as unknown as Quote | null, stale: jq.stale };
  }
  if (sym.startsWith("BVL:")) {
    const bq = await getBvlQuote(sym.slice(4));
    return { q: bq.q as unknown as Quote | null, stale: bq.stale };
  }
  if (sym.startsWith("BYMA:")) {
    const yq = await getBymaQuote(sym.slice(5));
    return { q: yq.q as unknown as Quote | null, stale: yq.stale };
  }
  const key = "q:" + sym;
  const hit = cacheGet(key, QUOTE_TTL);
  if (!hit.stale && hit.val) return { q: hit.val, stale: false };
  try {
    const q = await quote(sym);
    if (q) { cacheSet(key, q); return { q, stale: false }; }
  } catch { /* fall through to stale */ }
  return { q: hit.val || null, stale: true };
}

/** Stacks API key, server-side only. */
function jseKey(): string | null { return getSetting("stacks_api_key"); }

function shapeBvlQuote(q: any, stale: boolean) {
  return {
    sym: "BVL:" + q.sym, name: q.name, region: "latam", kind: "stock",
    note: "BVL Lima", ccy: q.ccy || "PEN",
    price: q.price, prevClose: q.prevClose, chg: q.chg, chgPct: q.chgPct,
    dayHigh: q.dayHigh, dayLow: q.dayLow, wk52High: null, wk52Low: null,
    volume: q.volume, asof: Date.now(), stale,
  };
}

async function getBvlQuote(sym: string): Promise<{ q: ReturnType<typeof shapeBvlQuote> | null; stale: boolean }> {
  const ck = "bvlq:" + sym.toUpperCase();
  const hit = cacheGet(ck, QUOTE_TTL);
  if (!hit.stale && hit.val) return { q: hit.val, stale: false };
  try {
    const q = await bvlQuote(sym);
    if (q) { const s = shapeBvlQuote(q, false); cacheSet(ck, s); return { q: s, stale: false }; }
  } catch { /* fall through to stale */ }
  return { q: hit.val || null, stale: true };
}

/** BVL board + indices, keyless, cached. */
async function getBvlBoard(): Promise<{ stocks: Array<ReturnType<typeof shapeBvlQuote>>; indices: Array<ReturnType<typeof shapeBvlIndex>>; stale: boolean }> {
  const hit = cacheGet("bvl:board", QUOTE_TTL);
  if (!hit.stale && hit.val) return { ...hit.val, stale: false };
  try {
    const [stocks, indices] = await Promise.all([bvlBoard(12), bvlIndices()]);
    const out = {
      stocks: stocks.map((q) => shapeBvlQuote(q, false)),
      indices: indices.map((x) => shapeBvlIndex(x, false)),
    };
    cacheSet("bvl:board", out);
    return { ...out, stale: false };
  } catch {
    return { stocks: hit.val?.stocks || [], indices: hit.val?.indices || [], stale: true };
  }
}

function shapeBvlIndex(x: any, stale: boolean) {
  return {
    sym: "BVL:" + x.sym, name: x.name, region: "latam", kind: "index",
    note: "BVL Lima", ccy: "PEN",
    price: x.price, prevClose: x.prevClose, chg: x.chg, chgPct: x.chgPct,
    dayHigh: x.dayHigh, dayLow: x.dayLow, wk52High: null, wk52Low: null,
    volume: null, asof: Date.now(), stale,
  };
}

function shapeBymaIndex(x: any, stale: boolean) {
  return {
    sym: "BYMA:" + x.sym, name: x.name, region: "latam", kind: "index",
    note: "BYMA Buenos Aires", ccy: "ARS",
    price: x.price, prevClose: x.prevClose, chg: x.chg, chgPct: x.chgPct,
    dayHigh: x.dayHigh, dayLow: x.dayLow, wk52High: null, wk52Low: null,
    volume: null, asof: Date.now(), stale,
  };
}

async function getBymaQuote(sym: string): Promise<{ q: ReturnType<typeof shapeBymaIndex> | null; stale: boolean }> {
  const ck = "bymaq:" + sym.toUpperCase();
  const hit = cacheGet(ck, QUOTE_TTL);
  if (!hit.stale && hit.val) return { q: hit.val, stale: false };
  try {
    const q = await bymaQuote(sym);
    if (q) { const s = shapeBymaIndex(q, false); cacheSet(ck, s); return { q: s, stale: false }; }
  } catch { /* fall through to stale */ }
  return { q: hit.val || null, stale: true };
}

/** BYMA indices, keyless, cached. */
async function getBymaBoard(): Promise<{ indices: Array<ReturnType<typeof shapeBymaIndex>>; stale: boolean }> {
  const hit = cacheGet("byma:board", QUOTE_TTL);
  if (!hit.stale && hit.val) return { indices: hit.val, stale: false };
  try {
    const indices = (await bymaIndices()).map((x) => shapeBymaIndex(x, false));
    cacheSet("byma:board", indices);
    return { indices, stale: false };
  } catch {
    return { indices: hit.val || [], stale: true };
  }
}

function shapeJseQuote(q: JseQuote, stale: boolean) {
  return {
    sym: "JSE:" + q.sym, name: q.name, region: "caribbean", kind: "stock",
    note: "JSE Jamaica", ccy: "JMD",
    price: q.price, prevClose: q.price - q.chg, chg: q.chg, chgPct: q.chgPct,
    dayHigh: null, dayLow: null, wk52High: null, wk52Low: null,
    volume: q.volume, pe: q.pe, asof: Date.now(), stale,
  };
}

async function getJseQuote(sym: string): Promise<{ q: ReturnType<typeof shapeJseQuote> | null; stale: boolean }> {
  const key = jseKey();
  if (!key) return { q: null, stale: true };
  const ck = "jseq:" + sym.toUpperCase();
  const hit = cacheGet(ck, QUOTE_TTL);
  if (!hit.stale && hit.val) return { q: hit.val, stale: false };
  try {
    const q = await jseQuote(key, sym);
    if (q) { const s = shapeJseQuote(q, false); cacheSet(ck, s); return { q: s, stale: false }; }
  } catch { /* fall through to stale */ }
  return { q: hit.val || null, stale: true };
}

/** Full JSE board, one upstream request, cached. */
async function getJseBoard(): Promise<{ list: Array<ReturnType<typeof shapeJseQuote>>; stale: boolean }> {
  const key = jseKey();
  if (!key) return { list: [], stale: true };
  const hit = cacheGet("jse:stocks", QUOTE_TTL);
  if (!hit.stale && hit.val) return { list: hit.val, stale: false };
  try {
    const stocks = await jseStocks(key);
    const list = stocks.map((q) => shapeJseQuote(q, false));
    cacheSet("jse:stocks", list);
    return { list, stale: false };
  } catch {
    return { list: hit.val || [], stale: true };
  }
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
  const q = r.q as any;
  if (!q) return null;
  if (typeof q.sym === "string" && /^(JSE|BVL|BYMA):/.test(q.sym)) return { ...q, stale: r.stale }; // already shaped
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
    // Jamaica board via the Stacks API (needs a free key in KEYS)
    const jb = await getJseBoard();
    out.jamaica = jb.list;
    out.jse_configured = !!jseKey();
    out.jse_stale = jb.stale;
    // Peru + Argentina boards, keyless exchange APIs
    const [bvl, byma] = await Promise.all([getBvlBoard(), getBymaBoard()]);
    out.peru = bvl.stocks;
    out.peru_indices = bvl.indices;
    out.peru_stale = bvl.stale;
    out.argentina = byma.indices;
    out.argentina_stale = byma.stale;
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

  if (req.method === "GET" && path === "/api/keys") {
    const key = jseKey();
    if (!key) return json({ stacks: { configured: false } });
    // surface tier without ever exposing the key
    const hit = cacheGet("jse:keystatus", 3_600_000);
    let st = (!hit.stale && hit.val) ? hit.val : null;
    if (!st) {
      st = await jseKeyStatus(key);
      cacheSet("jse:keystatus", st);
    }
    return json({ stacks: { configured: true, active: st.active, tier: st.tier } });
  }

  if (req.method === "POST" && path === "/api/keys") {
    const b = await body(req);
    const key = String(b.key || "").trim();
    if (!key) {
      setSetting("stacks_api_key", null);
      return json({ ok: true, configured: false });
    }
    const st = await jseKeyStatus(key);
    if (!st.active) return err("That key didn't validate with Stacks (check it and try again).", 401);
    setSetting("stacks_api_key", key);
    cacheSet("jse:keystatus", st);
    return json({ ok: true, configured: true, tier: st.tier });
  }

  if (req.method === "GET" && path === "/api/jse/quote") {
    const sym = String(url.searchParams.get("sym") || "").trim();
    if (!sym) return err("sym required", 400);
    if (!jseKey()) return err("JSE not configured — add a Stacks API key in KEYS.", 503);
    const r = await getJseQuote(sym);
    if (!r.q) return err("No JSE quote for " + sym, 502);
    return json({ quote: r.q });
  }

  if (req.method === "GET" && path === "/api/jse/history") {
    const sym = String(url.searchParams.get("sym") || "").trim();
    const range = String(url.searchParams.get("range") || "1Y").toUpperCase();
    if (!sym) return err("sym required", 400);
    const key = jseKey();
    if (!key) return err("JSE not configured — add a Stacks API key in KEYS.", 503);
    const limit = { "1D": 5, "1W": 7, "1M": 30, "3M": 90, "1Y": 365, "5Y": 1825 }[range] || 365;
    const ck = `jh:${sym.toUpperCase()}:${limit}`;
    const hit = cacheGet(ck, HIST_TTL);
    if (!hit.stale && hit.val) return json({ sym, range, bars: hit.val, stale: false });
    try {
      const bars = await jseHistory(key, sym, limit);
      if (bars.length) { cacheSet(ck, bars); return json({ sym, range, bars, stale: false }); }
    } catch { /* fall through */ }
    if (hit.val) return json({ sym, range, bars: hit.val, stale: true });
    return err("No JSE history for " + sym, 502);
  }

  if (req.method === "GET" && path === "/api/search") {
    const q = String(url.searchParams.get("q") || "");
    return json({ results: searchRegistry(q).map((s) => ({ sym: s.sym, name: s.name, region: s.region, kind: s.kind, note: s.note })) });
  }

  if (req.method === "GET" && path === "/api/funding") {
    const hit = cacheGet("funding", NEWS_TTL);
    if (!hit.stale && hit.val) return json({ funding: hit.val, stale: false });
    try {
      const items = await fetchFunding();
      cacheSet("funding", items);
      return json({ funding: items, stale: false });
    } catch {
      return json({ funding: hit.val || [], stale: true });
    }
  }

  // BVL index intraday history (from the /v1/indices dailyValues series)
  if (req.method === "GET" && path === "/api/bvl/history") {
    const sym = String(url.searchParams.get("sym") || "").trim().toUpperCase();
    if (!sym) return err("sym required", 400);
    const ck = "bvlh:" + sym;
    const hit = cacheGet(ck, QUOTE_TTL);
    if (!hit.stale && hit.val) return json({ sym, range: "1D", bars: hit.val, stale: false });
    try {
      const indices = await bvlIndices();
      const ix = indices.find((x) => x.sym === sym);
      if (ix && ix.bars.length > 1) { cacheSet(ck, ix.bars); return json({ sym, range: "1D", bars: ix.bars, stale: false }); }
    } catch { /* fall through */ }
    if (hit.val) return json({ sym, range: "1D", bars: hit.val, stale: true });
    return err("No BVL history for " + sym, 502);
  }

  if (req.method === "GET" && path === "/api/news") {
    const region = String(url.searchParams.get("region") || "all");
    const hit = cacheGet("news", NEWS_TTL);
    let items = (!hit.stale && hit.val) ? hit.val : null;
    if (!items) {
      try {
        const [news, funding] = await Promise.all([fetchNews(), fetchFunding()]);
        items = [...funding, ...news]
          .sort((a: any, b: any) => b.published - a.published)
          .slice(0, 140);
        cacheSet("news", items);
      }
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
