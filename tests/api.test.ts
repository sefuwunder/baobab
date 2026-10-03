// api.test.ts — full server e2e against a stubbed Yahoo (no live network).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function chartJson(symbol: string) {
  const closes = [100, 101, 102, 103, 105];
  const t0 = 1_750_000_000;
  return {
    chart: {
      result: [{
        meta: { symbol, longName: symbol + " Ltd", currency: "USD", exchangeName: "NYQ", regularMarketVolume: 999 },
        timestamp: closes.map((_, i) => t0 + i * 86400),
        indicators: { quote: [{ open: closes, high: closes, low: closes, close: closes, volume: closes.map(() => 10) }] },
      }],
      error: null,
    },
  };
}

let yahoo: any, server: any, port = 0, dataDir = "";
const jget = (p: string) => fetch(`http://127.0.0.1:${port}${p}`).then(async (r) => ({ s: r.status, d: await r.json() }));

beforeAll(async () => {
  yahoo = Bun.serve({
    port: 0,
    fetch(req) {
      const m = new URL(req.url).pathname.match(/^\/v8\/finance\/chart\/(.+)$/);
      if (!m) return new Response("nf", { status: 404 });
      const sym = decodeURIComponent(m[1]);
      if (sym === "NOPE") return Response.json({ chart: { result: null, error: { code: "Not Found" } } });
      return Response.json(chartJson(sym));
    },
  });
  // free port for the app server
  const probe = Bun.serve({ port: 0, fetch: () => new Response("x") });
  port = probe.port; probe.stop(true);
  dataDir = mkdtempSync(join(tmpdir(), "baobab-test-"));
  server = Bun.spawn(["bun", join(import.meta.dir, "..", "src", "server.ts")], {
    env: {
      ...process.env,
      BAOBAB_DATA: dataDir,
      BAOBAB_PORT: String(port),
      YAHOO_BASE: `http://127.0.0.1:${yahoo.port}`,
    },
    stdout: "ignore", stderr: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/status`); if (r.ok) break; } catch {}
    await Bun.sleep(250);
  }
});
afterAll(() => { try { server.kill(); } catch {} yahoo.stop(true); });

describe("api", () => {
  test("status", async () => {
    const { s, d } = await jget("/api/status");
    expect(s).toBe(200); expect(d.ok).toBe(true);
  });
  test("search", async () => {
    const { s, d } = await jget("/api/search?q=vale");
    expect(s).toBe(200);
    expect(d.results[0].sym).toBe("VALE");
  });
  test("quotes", async () => {
    const { s, d } = await jget("/api/quotes?syms=VALE,USDZAR=X");
    expect(s).toBe(200);
    expect(d.quotes.length).toBe(2);
    expect(d.quotes[0].price).toBeCloseTo(105, 6);
    expect(d.quotes[0].chgPct).toBeCloseTo(200 / 103, 6);
  });
  test("quotes rejects empty", async () => {
    const { s } = await jget("/api/quotes");
    expect(s).toBe(400);
  });
  test("history", async () => {
    const { s, d } = await jget("/api/history?sym=VALE&range=1M");
    expect(s).toBe(200);
    expect(d.bars.length).toBe(5);
    // second hit comes from cache
    const again = await jget("/api/history?sym=VALE&range=1M");
    expect(again.s).toBe(200);
    expect(again.d.bars.length).toBe(5);
  });
  test("history 502 for unknown", async () => {
    const { s } = await jget("/api/history?sym=NOPE&range=1M");
    expect(s).toBe(502);
  });
  test("watchlist CRUD", async () => {
    let r = await jget("/api/watchlist");
    expect(r.d.watchlist).toEqual([]);
    const add = await fetch(`http://127.0.0.1:${port}/api/watchlist`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sym: "VALE" }),
    });
    expect(add.status).toBe(200);
    r = await jget("/api/watchlist");
    expect(r.d.watchlist.length).toBe(1);
    expect(r.d.watchlist[0].sym).toBe("VALE");
    const bad = await fetch(`http://127.0.0.1:${port}/api/watchlist`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sym: "NOPE" }),
    });
    expect(bad.status).toBe(404);
    const del = await fetch(`http://127.0.0.1:${port}/api/watchlist/VALE`, { method: "DELETE" });
    expect((await del.json()).removed).toBe(true);
    r = await jget("/api/watchlist");
    expect(r.d.watchlist).toEqual([]);
  });
  test("overview shape", async () => {
    const { s, d } = await jget("/api/overview");
    expect(s).toBe(200);
    for (const k of ["indices", "fx", "cmd", "stocks", "global"]) {
      expect(Array.isArray(d[k]), k).toBe(true);
      expect(d[k].length).toBeGreaterThan(0);
    }
    expect(d.indices[0].sym).toBe("^BVSP");
  });
});
