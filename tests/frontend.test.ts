// frontend.test.ts — eval public/app.js against a stub DOM + stub API,
// then assert each view renders without throwing.
import { describe, test, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function ctx2d() {
  return new Proxy({}, {
    get(t, p) {
      if (p === "measureText") return () => ({ width: 10 });
      if (p === "createLinearGradient") return () => ({ addColorStop() {} });
      if (typeof p === "string") return (..._a: any[]) => {};
      return undefined;
    },
    set() { return true; },
  });
}
function makeEl(tag = "div") {
  const el: any = {
    tagName: String(tag).toUpperCase(),
    children: [], dataset: {}, style: {},
    _html: "", textContent: "", value: "",
    clientWidth: 800, clientHeight: 320,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c: any) { el.children.push(c); return c; },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getContext() { return ctx2d(); },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    click() {}, focus() {}, blur() {},
    setAttribute() {}, getAttribute() { return null; },
  };
  Object.defineProperty(el, "innerHTML", {
    get() { return el._html; }, set(v: any) { el._html = String(v); },
  });
  return el;
}

const viewEl = makeEl("main");
const tabsEl = makeEl("nav");
const tapeEl = makeEl("div");
const cmdEl = makeEl("input");
const goEl = makeEl("button");
const clockEl = makeEl("div");
const toastEl = makeEl("div");
const byId: Record<string, any> = {
  view: viewEl, tabs: tabsEl, "tape-inner": tapeEl, cmd: cmdEl, go: goEl, clock: clockEl, toast: toastEl,
};

function cannedQuote(sym: string) {
  return {
    sym, name: sym + " Name", region: "latam", kind: "index", note: "Test", ccy: "USD",
    price: 105.5, prevClose: 100, chg: 5.5, chgPct: 5.5, dayHigh: 106, dayLow: 99,
    wk52High: 120, wk52Low: 80, volume: 1000000, asof: Date.now(), stale: false,
  };
}
const GROUPS = ["indices", "fx", "cmd", "stocks", "global"];
async function stubFetch(url: string) {
  const u = String(url);
  const ok = (d: any) => ({ ok: true, status: 200, json: async () => d });
  if (u.includes("/api/overview")) {
    const d: any = { asof: Date.now() };
    for (const g of GROUPS) d[g] = [`${g}1`, `${g}2`].map(cannedQuote);
    return ok(d);
  }
  if (u.includes("/api/history")) {
    const bars = Array.from({ length: 20 }, (_, i) => ({ t: 1_750_000_000_000 + i * 86400000, o: 100 + i, h: 102 + i, l: 99 + i, c: 101 + i, v: 1000 }));
    return ok({ sym: "TST", range: "1M", bars, stale: false });
  }
  if (u.includes("/api/quotes")) {
    const syms = decodeURIComponent(u.split("syms=")[1] || "").split(",");
    return ok({ quotes: syms.filter(Boolean).map(cannedQuote) });
  }
  if (u.includes("/api/watchlist")) return ok({ watchlist: [] });
  if (u.includes("/api/news")) return ok({ news: [{ title: "Test headline", link: "https://x.test", source: "X", published: Date.now(), region: "africa" }] });
  if (u.includes("/api/search")) return ok({ results: [{ sym: "VALE", name: "Vale", region: "latam", kind: "stock", note: "BR" }] });
  return ok({});
}

const listeners: Record<string, Function[]> = {};
const documentStub: any = {
  querySelector: (s: string) => {
    if (s.startsWith("#")) return byId[s.slice(1)] || null;
    return null;
  },
  querySelectorAll: () => [],
  addEventListener: (t: string, f: Function) => { (listeners[t] = listeners[t] || []).push(f); },
  activeElement: { tagName: "BODY" },
  createElement: (t: string) => makeEl(t),
};
const windowStub: any = { devicePixelRatio: 1, scrollTo() {}, onresize: null };
const cssStub = { escape: (s: string) => s };

let bootError: any = null;
beforeAll(async () => {
  const src = readFileSync(join(import.meta.dir, "..", "public", "app.js"), "utf8");
  new Function(src); // throws on syntax error
  const run = new Function("document", "window", "fetch", "CSS", "setInterval", "clearTimeout", "setTimeout", src);
  try {
    run(documentStub, windowStub, stubFetch, cssStub, () => 0, () => {}, (f: any) => 0);
  } catch (e) { bootError = e; }
  await Bun.sleep(300); // let go("top") resolve
});

describe("frontend", () => {
  test("boots without throwing", () => {
    expect(bootError).toBeNull();
  });
  test("TOP view renders sections", () => {
    expect(viewEl.innerHTML).toContain("Market overview");
    expect(viewEl.innerHTML).toContain("Foreign exchange");
    expect(viewEl.innerHTML).toContain("Commodities");
  });
  test("tape rendered", () => {
    expect(tapeEl.innerHTML.length).toBeGreaterThan(0);
  });
  test("keyboard listener registered", () => {
    expect((listeners["keydown"] || []).length).toBeGreaterThan(0);
  });
});
