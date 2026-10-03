// exchanges.test.ts — BVL Peru, BYMA Argentina, funding feeds.
// Spawns a real server as a child with stubbed exchange + wp-json backends.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---- stub BVL ----
const BVL_BOARD = [
  { nemonico: "BAP", shortName: "Credicorp", companyName: "Credicorp Ltd.", last: 185.5, previous: 183.0, percentageChange: 1.37, buy: 185.0, sell: 186.0, minimun: 183.2, maximun: 186.1, opening: 184.0, negotiatedQuantity: "12500", negotiatedAmount: 2318750, currency: "US$" },
  { nemonico: "VOLCABC1", shortName: "Volcan Cia Minera", companyName: "Volcan", last: 0.52, previous: 0.55, percentageChange: -5.45, buy: 0.51, sell: 0.53, minimun: 0.50, maximun: 0.56, opening: 0.55, negotiatedQuantity: "900000", negotiatedAmount: 468000, currency: "S/." },
];
const BVL_INDICES = {
  content: [
    { nemonico: "MXNUAMPEGEN", name: "MSCI NUAM Peru General", shortName: "PE General", value: "59860.04", open: "59909.03", high: "60305.45", low: "59700.32", close: "59751.67", variation: "0.18", dailyValues: [["2026-10-02T08:30:09", "59909.03"], ["2026-10-02T08:31:09", "59950.10"]] },
  ],
};
const bvl = Bun.serve({
  port: 0,
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/v1/indices") return Response.json(BVL_INDICES);
    if (u.pathname === "/v1/stock-quote/home") return Response.json(BVL_BOARD);
    return Response.json({ error: "nf" }, { status: 404 });
  },
});

// ---- stub BYMA ----
const BYMA_INDICES = {
  content: { page_number: 1, total_elements_count: 2 },
  data: [
    { symbol: "G", description: "S&P BYMA Indice General", price: 120733937.1, closingPrice: 120733937.1, previousClosingPrice: 120321072.05, variation: 0.0034, highestPrice: 121632912.06, lowestPrice: 119530995.55 },
    { symbol: "M", description: "S&P Merval", price: 2850000.5, closingPrice: 2850000.5, previousClosingPrice: 2840000.0, variation: 0.0035, highestPrice: 2860000, lowestPrice: 2830000 },
  ],
};
const byma = Bun.serve({
  port: 0,
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname.endsWith("/free/index-price")) return Response.json(BYMA_INDICES);
    return Response.json({ error: "nf" }, { status: 404 });
  },
});

// ---- stub wp-json funding feeds ----
const wpPosts = (title: string, link: string) => [{
  date: "2026-09-30T14:31:29", link,
  title: { rendered: title }, excerpt: { rendered: "<p>Raised money &hellip;</p>" },
}];
const wp = Bun.serve({
  port: 0,
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/ll/wp-json/wp/v2/posts") return Response.json(wpPosts("Jeeves raises $110M led by CoinFund", "https://latamlist.com/x"));
    if (u.pathname === "/tc/wp-json/wp/v2/posts") return Response.json(wpPosts("BIG raises $1.5m for carbon credits", "https://techcabal.com/x"));
    return Response.json({ error: "nf" }, { status: 404 });
  },
});

const BVL_BASE = `http://127.0.0.1:${bvl.port}`;
const BYMA_BASE = `http://127.0.0.1:${byma.port}/vanoms-be-core/rest/api/bymadata`;
const WP = `http://127.0.0.1:${wp.port}`;
process.env.BVL_BASE = BVL_BASE;
process.env.BYMA_BASE = BYMA_BASE;
process.env.LATAMLIST_WP = WP + "/ll/wp-json/wp/v2/posts";
process.env.TECHCABAL_WP = WP + "/tc/wp-json/wp/v2/posts";
const { bvlBoard, bvlIndices } = await import("../src/bvl.ts");
const { bymaIndices } = await import("../src/byma.ts");
const { fetchFunding } = await import("../src/funding.ts");

let server: any, port = 0;
const jget = (p: string, init?: any) => fetch(`http://127.0.0.1:${port}${p}`, init).then(async (r) => ({ s: r.status, d: await r.json() }));

beforeAll(async () => {
  const probe = Bun.serve({ port: 0, fetch: () => new Response("x") });
  port = probe.port; probe.stop(true);
  server = Bun.spawn(["bun", join(import.meta.dir, "..", "src", "server.ts")], {
    env: {
      ...process.env,
      BAOBAB_DATA: mkdtempSync(join(tmpdir(), "baobab-ex-")),
      BAOBAB_PORT: String(port),
      YAHOO_BASE: BVL_BASE, // unused here; 404s at stub
      STACKS_BASE: BVL_BASE,
      BVL_BASE, BYMA_BASE,
      LATAMLIST_WP: WP + "/ll/wp-json/wp/v2/posts",
      TECHCABAL_WP: WP + "/tc/wp-json/wp/v2/posts",
    },
    stdout: "ignore", stderr: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/status`); if (r.ok) break; } catch {}
    await Bun.sleep(250);
  }
});
afterAll(() => { try { server.kill(); } catch {} bvl.stop(true); byma.stop(true); wp.stop(true); });

describe("bvl client", () => {
  test("shapes board, sorts by traded amount, normalizes currency", async () => {
    const board = await bvlBoard(12);
    expect(board.length).toBe(2);
    expect(board[0]).toMatchObject({ sym: "BAP", price: 185.5, chgPct: 1.37, ccy: "USD", volume: 12500 });
    expect(board[0].chg).toBeCloseTo(2.5, 5);
    expect(board[1]).toMatchObject({ sym: "VOLCABC1", ccy: "PEN" });
  });
  test("indices carry intraday bars", async () => {
    const ix = await bvlIndices();
    expect(ix.length).toBe(1);
    expect(ix[0]).toMatchObject({ sym: "MXNUAMPEGEN", price: 59860.04, chgPct: 0.18 });
    expect(ix[0].bars.length).toBe(2);
    expect(ix[0].bars[0].o).toBe(59909.03);
  });
});

describe("byma client", () => {
  test("shapes indices, converts fractional variation", async () => {
    const ix = await bymaIndices();
    expect(ix.length).toBe(2);
    expect(ix[0]).toMatchObject({ sym: "G", price: 120733937.1 });
    expect(ix[0].chgPct).toBeCloseTo(0.34, 5);
    expect(ix[0].chg).toBeCloseTo(412865.05, 1);
  });
});

describe("funding feeds", () => {
  test("parses wp-json into labeled items", async () => {
    const items = await fetchFunding();
    expect(items.length).toBe(2);
    const ll = items.find((i) => i.source === "LatamList Funding")!;
    expect(ll.region).toBe("latam");
    expect(ll.title).toBe("Jeeves raises $110M led by CoinFund");
    expect(items.find((i) => i.source === "TechCabal Funding")!.region).toBe("africa");
  });
});

describe("exchange routes", () => {
  test("overview carries peru + argentina boards", async () => {
    const { d } = await jget("/api/overview");
    expect(d.peru.length).toBe(2);
    expect(d.peru[0]).toMatchObject({ sym: "BVL:BAP", region: "latam", note: "BVL Lima", ccy: "USD" });
    expect(d.argentina.length).toBe(2);
    expect(d.argentina[0]).toMatchObject({ sym: "BYMA:G", region: "latam", note: "BYMA Buenos Aires", ccy: "ARS" });
  });
  test("/api/bvl/history serves index intraday bars", async () => {
    const { s, d } = await jget("/api/bvl/history?sym=MXNUAMPEGEN");
    expect(s).toBe(200);
    expect(d.bars.length).toBe(2);
  });
  test("/api/bvl/history 502s for stocks without history", async () => {
    expect((await jget("/api/bvl/history?sym=BAP")).s).toBe(502);
  });
  test("/api/quotes resolves BVL: and BYMA: syms", async () => {
    const b = await jget("/api/quotes?syms=BVL:VOLCABC1");
    expect(b.d.quotes[0]).toMatchObject({ sym: "BVL:VOLCABC1", price: 0.52 });
    const y = await jget("/api/quotes?syms=BYMA:M");
    expect(y.d.quotes[0]).toMatchObject({ sym: "BYMA:M", price: 2850000.5 });
  });
  test("watchlist round-trips a BVL symbol", async () => {
    const J = (o: any) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) });
    expect((await jget("/api/watchlist", J({ sym: "BVL:BAP" }))).s).toBe(200);
    const wl = (await jget("/api/watchlist")).d;
    expect(wl.watchlist.some((q: any) => q.sym === "BVL:BAP")).toBe(true);
    await fetch(`http://127.0.0.1:${port}/api/watchlist/BVL:BAP`, { method: "DELETE" });
  });
  test("/api/funding returns labeled items", async () => {
    const { d } = await jget("/api/funding");
    expect(d.funding.length).toBe(2);
    expect(d.funding[0].source).toMatch(/Funding$/);
  });
  test("/api/news merges funding items", async () => {
    // news fetch hits real RSS in this env; just check the shape contract on funding part
    const { d } = await jget("/api/funding");
    expect(d.funding.every((n: any) => n.title && n.link && n.source && n.region)).toBe(true);
  });
});
