// yahoo.test.ts — client parsing against a local stub (no live network).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { quote, quotes, history, rangeParams } from "../src/yahoo";

function chartJson(symbol: string, closes: number[]) {
  const t0 = 1_750_000_000;
  return {
    chart: {
      result: [{
        meta: {
          symbol, longName: symbol + " Inc.", currency: "USD", exchangeName: "NYQ",
          regularMarketDayHigh: Math.max(...closes), regularMarketDayLow: Math.min(...closes),
          fiftyTwoWeekHigh: 20, fiftyTwoWeekLow: 5, regularMarketVolume: 1234567,
        },
        timestamp: closes.map((_, i) => t0 + i * 86400),
        indicators: {
          quote: [{ open: closes, high: closes, low: closes, close: closes, volume: closes.map(() => 1000) }],
        },
      }],
      error: null,
    },
  };
}

let server: any; let base = "";
beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const m = new URL(req.url).pathname.match(/^\/v8\/finance\/chart\/(.+)$/);
      if (!m) return new Response("nf", { status: 404 });
      const sym = decodeURIComponent(m[1]);
      if (sym === "BOGUS") return new Response(JSON.stringify({ chart: { result: null, error: { code: "Not Found" } } }));
      const closes = sym === "DOWN" ? [10, 9, 8, 7, 6] : [10, 11, 12, 13, 14];
      return Response.json(chartJson(sym, closes));
    },
  });
  base = `http://127.0.0.1:${server.port}`;
  process.env.YAHOO_BASE = base;
});
afterAll(() => { server.stop(true); delete process.env.YAHOO_BASE; });

describe("quote", () => {
  test("parses last two bars into price/prevClose/chg", async () => {
    const q = await quote("TST");
    expect(q).not.toBeNull();
    expect(q!.price).toBeCloseTo(14, 6);
    expect(q!.prevClose).toBeCloseTo(13, 6);
    expect(q!.chg).toBeCloseTo(1, 6);
    expect(q!.chgPct).toBeCloseTo(100 / 13, 6);
    expect(q!.wk52High).toBe(20);
    expect(q!.volume).toBe(1234567);
    expect(q!.name).toBe("TST Inc.");
  });
  test("negative change for a falling symbol", async () => {
    const q = await quote("DOWN");
    expect(q!.chg).toBeLessThan(0);
    expect(q!.chgPct).toBeCloseTo(-100 / 7, 6);
  });
  test("null for unknown symbol", async () => {
    expect(await quote("BOGUS")).toBeNull();
  });
});

describe("quotes", () => {
  test("batch with concurrency", async () => {
    const out = await quotes(["TST", "BOGUS", "DOWN"], 2);
    expect(out.length).toBe(3);
    expect(out[0]!.sym).toBe("TST");
    expect(out[1]).toBeNull();
    expect(out[2]!.chg).toBeLessThan(0);
  });
});

describe("history", () => {
  test("returns bars with timestamps in ms", async () => {
    const bars = await history("TST", "1Y");
    expect(bars.length).toBe(5);
    expect(bars[0].t).toBe(1_750_000_000 * 1000);
    expect(bars[4].c).toBeCloseTo(14, 6);
  });
  test("empty for unknown symbol", async () => {
    expect(await history("BOGUS", "1Y")).toEqual([]);
  });
  test("range params map", () => {
    expect(rangeParams("1D")).toEqual({ range: "1d", interval: "5m" });
    expect(rangeParams("5Y")).toEqual({ range: "5y", interval: "1wk" });
    expect(rangeParams("bogus")).toEqual({ range: "1y", interval: "1d" });
  });
});
