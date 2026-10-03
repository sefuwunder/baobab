// jse.test.ts — Stacks JSE integration: client parsing, key lifecycle, API routes.
// Spawns a real server as a child (like api.test.ts) with STACKS_BASE pointed at a stub.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---- stub Stacks API ----
const JSE_LIST = [
  { symbol: "NCBFG", company_name: "NCB Financial Group", closing_price: "105.50", change_percent: 2.24, volume: "1,234,567", pe_ratio: 8.2 },
  { symbol: "GK", company_name: "GraceKennedy Ltd", closing_price: "88.10", change_percent: -0.5, volume: "456,789", pe_ratio: 12.1 },
];
let stubHits: string[] = [];
const stub = Bun.serve({
  port: 0,
  async fetch(req) {
    const u = new URL(req.url);
    stubHits.push(u.pathname + u.search);
    const key = req.headers.get("x-api-key") || "";
    if (key !== "pk_test_123") return Response.json({ error: "unauthorized" }, { status: 401 });
    if (u.pathname === "/key/status")
      return Response.json({ status: "active", tier: "free", limits: { per_minute: 60, per_day: 2500 }, usage_today: { requests: 1 } });
    if (u.pathname === "/stocks") return Response.json({ count: 2, stocks: JSE_LIST });
    const m = u.pathname.match(/^\/stock\/([A-Z]+)(\/history)?$/);
    if (m) {
      const s = JSE_LIST.find((x) => x.symbol === m[1]);
      if (!s) return Response.json({ error: "not found" }, { status: 404 });
      if (m[2]) {
        const limit = Math.min(3650, Number(u.searchParams.get("limit") || 30));
        const hist = Array.from({ length: limit }, (_, i) => ({
          trade_date: `2026-0${9 - (i % 9)}-15`, // most-recent-first, like the real API
          closing_price: (100 - i * 0.1).toFixed(2),
          price_change: "-0.10",
          change_percent: -0.1,
          volume: "1,000",
        }));
        return Response.json({ symbol: s.symbol, count: limit, history: hist });
      }
      return Response.json(s);
    }
    return Response.json({ error: "nope" }, { status: 404 });
  },
});
const STUB = `http://127.0.0.1:${stub.port}`;

process.env.STACKS_BASE = STUB;
const { jseStocks, jseHistory, jseKeyStatus } = await import("../src/jse.ts");

let server: any, port = 0;
const jget = (p: string, init?: any) => fetch(`http://127.0.0.1:${port}${p}`, init).then(async (r) => ({ s: r.status, d: await r.json() }));
const J = (o: any) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) });

beforeAll(async () => {
  const probe = Bun.serve({ port: 0, fetch: () => new Response("x") });
  port = probe.port; probe.stop(true);
  server = Bun.spawn(["bun", join(import.meta.dir, "..", "src", "server.ts")], {
    env: {
      ...process.env,
      BAOBAB_DATA: mkdtempSync(join(tmpdir(), "baobab-jse-")),
      BAOBAB_PORT: String(port),
      YAHOO_BASE: STUB, // any Yahoo call 404s at the stub; unused here
      STACKS_BASE: STUB,
    },
    stdout: "ignore", stderr: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/status`); if (r.ok) break; } catch {}
    await Bun.sleep(250);
  }
});
afterAll(() => { try { server.kill(); } catch {} stub.stop(true); });

describe("jse client", () => {
  test("shapes list quotes, parsing comma strings", async () => {
    const list = await jseStocks("pk_test_123");
    expect(list.length).toBe(2);
    expect(list[0]).toMatchObject({ sym: "NCBFG", price: 105.5, chgPct: 2.24, volume: 1234567, pe: 8.2 });
    expect(list[0].chg).toBeCloseTo(2.3632, 3);
  });
  test("history maps to chronological bars with close-only OHLC", async () => {
    const bars = await jseHistory("pk_test_123", "NCBFG", 5);
    expect(bars.length).toBe(5);
    expect(bars[0].t).toBeLessThan(bars[4].t);
    expect(bars[0].o).toBe(bars[0].h);
    expect(bars[0].h).toBe(bars[0].l);
    expect(bars[0].l).toBe(bars[0].c);
  });
  test("key status distinguishes valid from invalid", async () => {
    expect((await jseKeyStatus("pk_test_123")).active).toBe(true);
    expect((await jseKeyStatus("bogus")).active).toBe(false);
  });
});

describe("keys API", () => {
  test("starts unconfigured", async () => {
    const { d } = await jget("/api/keys");
    expect(d.stacks.configured).toBe(false);
  });
  test("rejects a bad key without storing it", async () => {
    const bad = await jget("/api/keys", J({ key: "bogus" }));
    expect(bad.s).toBe(401);
    const { d } = await jget("/api/keys");
    expect(d.stacks.configured).toBe(false);
  });
  test("accepts a valid key, masks it, reports tier", async () => {
    const { s, d } = await jget("/api/keys", J({ key: "pk_test_123" }));
    expect(s).toBe(200);
    expect(d.ok).toBe(true);
    expect(d.tier).toBe("free");
    const g = (await jget("/api/keys")).d;
    expect(g.stacks.configured).toBe(true);
    expect(g.stacks.tier).toBe("free");
    expect(JSON.stringify(g)).not.toContain("pk_test_123");
    expect(JSON.stringify((await jget("/api/overview")).d)).not.toContain("pk_test_123");
  });
});

describe("jse routes", () => {
  beforeAll(async () => {
    await jget("/api/keys", J({ key: "pk_test_123" }));
  });
  test("overview carries the jamaica board with JSE: syms", async () => {
    const { d } = await jget("/api/overview");
    expect(d.jse_configured).toBe(true);
    expect(d.jamaica.length).toBe(2);
    expect(d.jamaica[0]).toMatchObject({ sym: "JSE:NCBFG", region: "caribbean", ccy: "JMD", note: "JSE Jamaica" });
  });
  test("/api/jse/quote returns a shaped quote", async () => {
    const { d } = await jget("/api/jse/quote?sym=GK");
    expect(d.quote).toMatchObject({ sym: "JSE:GK", name: "GraceKennedy Ltd", price: 88.1 });
  });
  test("/api/jse/history maps range to limit", async () => {
    stubHits = [];
    const { d } = await jget("/api/jse/history?sym=NCBFG&range=1M");
    expect(d.bars.length).toBe(30);
    const hit = stubHits.find((p) => p.includes("/stock/NCBFG/history"))!;
    expect(new URLSearchParams(hit.split("?")[1]).get("limit")).toBe("30");
  });
  test("/api/quotes resolves JSE: syms (watchlist path)", async () => {
    const { d } = await jget("/api/quotes?syms=JSE:NCBFG");
    expect(d.quotes.length).toBe(1);
    expect(d.quotes[0].sym).toBe("JSE:NCBFG");
    const add = await jget("/api/watchlist", J({ sym: "JSE:NCBFG" }));
    expect(add.s).toBe(200);
    const wl = (await jget("/api/watchlist")).d;
    expect(wl.watchlist.some((q: any) => q.sym === "JSE:NCBFG")).toBe(true);
    await fetch(`http://127.0.0.1:${port}/api/watchlist/JSE:NCBFG`, { method: "DELETE" });
  });
  test("jse endpoints 503 when unconfigured", async () => {
    await jget("/api/keys", J({ key: "" }));
    expect((await jget("/api/jse/quote?sym=NCBFG")).s).toBe(503);
    expect((await jget("/api/jse/history?sym=NCBFG")).s).toBe(503);
  });
});
