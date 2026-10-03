// news.ts — regional business news via RSS/RDF/Atom. Zero-dep parsing,
// failures skip silently (a dead feed never breaks the terminal).
export interface NewsItem {
  title: string; link: string; source: string;
  published: number; region: "africa" | "caribbean" | "latam";
}

interface Feed { url: string; source: string; region: NewsItem["region"] }

const FEEDS: Feed[] = [
  { url: "https://african.business/feed/", source: "African Business", region: "africa" },
  { url: "https://www.premiumtimesng.com/feed/", source: "Premium Times", region: "africa" },
  { url: "https://allafrica.com/tools/headlines/rdf/business/headlines.rdf", source: "AllAfrica", region: "africa" },
  { url: "https://www.jamaicaobserver.com/feed/", source: "Jamaica Observer", region: "caribbean" },
  { url: "https://barbadostoday.bb/feed/", source: "Barbados Today", region: "caribbean" },
  { url: "https://en.mercopress.com/rss/", source: "MercoPress", region: "latam" },
];

const UA = "Mozilla/5.0 (compatible; Baobab/1.0; +https://github.com/sefuwunder/baobab)";

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1");
}
function unesc(s: string): string {
  return stripCdata(s)
    .replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 31 && c < 0x10ffff ? String.fromCodePoint(c) : ""; })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => { const c = parseInt(n, 16); return c > 31 && c < 0x10ffff ? String.fromCodePoint(c) : ""; })
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/<[^>]*>/g, "").trim();
}
function field(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? unesc(m[1]) : "";
}

export function parseFeed(xml: string, feed: Feed): NewsItem[] {
  const out: NewsItem[] = [];
  // RSS/RDF <item> … </item>  or Atom <entry> … </entry>
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) || [];
  for (const b of blocks.slice(0, 30)) {
    const title = field(b, "title");
    if (!title) continue;
    let link = field(b, "link");
    const lm = b.match(/<link[^>]*href="([^"]+)"/i);
    if (lm) link = lm[1];
    const datestr = field(b, "pubDate") || field(b, "published") || field(b, "updated") || field(b, "dc:date");
    const published = datestr ? Date.parse(datestr) || 0 : 0;
    out.push({ title: title.slice(0, 220), link, source: feed.source, published, region: feed.region });
  }
  return out;
}

async function fetchFeed(feed: Feed): Promise<NewsItem[]> {
  try {
    const r = await fetch(feed.url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return [];
    const xml = await r.text();
    if (!/<(item|entry)[\s>]/i.test(xml)) return [];
    return parseFeed(xml, feed);
  } catch {
    return [];
  }
}

/** Aggregate all feeds, newest first. */
export async function fetchNews(): Promise<NewsItem[]> {
  const all = (await Promise.all(FEEDS.map(fetchFeed))).flat();
  const seen = new Set<string>();
  return all
    .filter((n) => n.title && (seen.has(n.title) ? false : (seen.add(n.title), true)))
    .sort((a, b) => b.published - a.published)
    .slice(0, 120);
}
