// news.test.ts + registry.test.ts — pure unit tests, no network.
import { describe, test, expect } from "bun:test";
import { parseFeed } from "../src/news";
import { REGISTRY, bySym, searchRegistry, DASH_INDICES, DASH_FX, DASH_CMD, DASH_STOCKS, DASH_STARTUPS, DASH_GLOBAL } from "../src/registry";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
<item><title>Rand rallies &amp; stocks</title><link>https://x.test/1</link><pubDate>Fri, 02 Oct 2026 12:00:00 GMT</pubDate></item>
<item><title><![CDATA[Cocoa <b>hits</b> record]]></title><link>https://x.test/2</link><pubDate>Fri, 02 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title></title><link>https://x.test/3</link></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Chile copper output rises</title><link href="https://y.test/9"/><published>2026-10-02T08:00:00Z</published></entry>
</feed>`;

const FEED = { url: "https://x.test/", source: "X", region: "africa" as const };

describe("parseFeed", () => {
  test("RSS items with entities + CDATA", () => {
    const items = parseFeed(RSS, FEED);
    expect(items.length).toBe(2); // empty-title item skipped
    expect(items[0].title).toBe("Rand rallies & stocks");
    expect(items[0].link).toBe("https://x.test/1");
    expect(items[0].source).toBe("X");
    expect(items[0].published).toBe(Date.parse("2026-10-02T12:00:00Z"));
    expect(items[1].title).toBe("Cocoa hits record"); // tags stripped
  });
  test("Atom entries with href links", () => {
    const items = parseFeed(ATOM, { ...FEED, region: "latam" });
    expect(items.length).toBe(1);
    expect(items[0].link).toBe("https://y.test/9");
    expect(items[0].region).toBe("latam");
  });
  test("numeric HTML entities decode", () => {
    const xml = `<rss><channel><item><title>&#8216;Quoted&#8217; &#x26; more</title><link>https://x.test/1</link></item></channel></rss>`;
    const items = parseFeed(xml, FEED);
    expect(items[0].title).toBe("\u2018Quoted\u2019 & more");
  });
});

describe("registry", () => {
  test("every dashboard symbol is registered", () => {
    for (const s of [...DASH_INDICES, ...DASH_FX, ...DASH_CMD, ...DASH_STOCKS, ...DASH_STARTUPS, ...DASH_GLOBAL]) {
      expect(bySym.has(s), s).toBe(true);
    }
  });
  test("no duplicate symbols", () => {
    const syms = REGISTRY.map((s) => s.sym);
    expect(new Set(syms).size).toBe(syms.length);
  });
  test("searchRegistry ranking", () => {
    const r1 = searchRegistry("vale");
    expect(r1[0].sym).toBe("VALE");
    const r2 = searchRegistry("USDZAR");
    expect(r2[0].sym).toBe("USDZAR=X");
    const r3 = searchRegistry("rand");
    expect(r3.some((r) => r.sym === "USDZAR=X")).toBe(true);
    expect(searchRegistry("nubank")[0].sym).toBe("NU");
    expect(searchRegistry("jumia")[0].sym).toBe("JMIA");
    expect(searchRegistry("")).toEqual([]);
    expect(searchRegistry("zzzz-no-match")).toEqual([]);
  });
  test("regions are valid", () => {
    for (const s of REGISTRY) {
      expect(["africa", "caribbean", "latam", "global"]).toContain(s.region);
      expect(["index", "etf", "fx", "cmd", "stock"]).toContain(s.kind);
    }
  });
});
