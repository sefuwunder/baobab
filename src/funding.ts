// funding.ts — startup funding-round feeds via WordPress JSON (keyless).
// LatamList "Startup Funding" (cat 9230) + TechCabal "Funding" (cat 8436).
// Amount/stage/investors live in title+excerpt text, so these surface as
// labeled news items; a parser can come later.
import type { NewsItem } from "./news";

const UA = "Mozilla/5.0 (compatible; Baobab/1.0; +https://github.com/sefuwunder/baobab)";

const FEEDS = [
  {
    url: (process.env.LATAMLIST_WP || "https://latamlist.com/wp-json/wp/v2/posts") + "?categories=9230&per_page=30&_fields=date,link,title,excerpt",
    source: "LatamList Funding", region: "latam" as const,
  },
  {
    url: (process.env.TECHCABAL_WP || "https://techcabal.com/wp-json/wp/v2/posts") + "?categories=8436&per_page=30&_fields=date,link,title,excerpt",
    source: "TechCabal Funding", region: "africa" as const,
  },
];

function unesc(s: string): string {
  return String(s || "")
    .replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 31 && c < 0x10ffff ? String.fromCodePoint(c) : ""; })
    .replace(/&hellip;/g, "…").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchFeed(f: (typeof FEEDS)[number]): Promise<NewsItem[]> {
  try {
    const r = await fetch(f.url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return [];
    const arr = await r.json();
    if (!Array.isArray(arr)) return [];
    return arr.map((p: any) => ({
      title: unesc(p.title?.rendered).slice(0, 220),
      link: String(p.link || ""),
      source: f.source,
      published: p.date ? Date.parse(p.date) || 0 : 0,
      region: f.region,
    })).filter((n) => n.title);
  } catch {
    return [];
  }
}

/** Funding-round announcements, newest first. Never throws. */
export async function fetchFunding(): Promise<NewsItem[]> {
  const all = (await Promise.all(FEEDS.map(fetchFeed))).flat();
  const seen = new Set<string>();
  return all
    .filter((n) => (seen.has(n.title) ? false : (seen.add(n.title), true)))
    .sort((a, b) => b.published - a.published)
    .slice(0, 60);
}
