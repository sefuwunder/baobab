// registry.ts — the curated Baobab symbol universe.
// Every symbol here was verified live against Yahoo Finance (2026-10-03).
// kind: index | etf | fx | cmd (commodity) | stock
export interface Sym {
  sym: string;      // Yahoo symbol
  name: string;     // display name
  region: "africa" | "caribbean" | "latam" | "global";
  kind: "index" | "etf" | "fx" | "cmd" | "stock";
  ccy?: string;     // quote currency for FX (per 1 USD)
  note?: string;    // exchange / context
}

export const REGISTRY: Sym[] = [
  // ---- indices (direct feeds) ----
  { sym: "^BVSP", name: "Bovespa", region: "latam", kind: "index", note: "B3 São Paulo" },
  { sym: "^MXX", name: "IPC", region: "latam", kind: "index", note: "BMV Mexico" },
  { sym: "^MERV", name: "Merval", region: "latam", kind: "index", note: "BCBA Buenos Aires" },
  // ---- region ETFs (proxies where index feeds don't exist) ----
  { sym: "AFK", name: "VanEck Africa Index", region: "africa", kind: "etf", note: "Africa proxy" },
  { sym: "EZA", name: "MSCI South Africa", region: "africa", kind: "etf", note: "JSE proxy" },
  { sym: "EGY", name: "VanEck Egypt", region: "africa", kind: "etf", note: "EGX proxy" },
  { sym: "EWZ", name: "MSCI Brazil", region: "latam", kind: "etf", note: "Bovespa proxy" },
  { sym: "EWW", name: "MSCI Mexico", region: "latam", kind: "etf", note: "IPC proxy" },
  { sym: "ARGT", name: "Global X Argentina", region: "latam", kind: "etf", note: "Merval proxy" },
  { sym: "ECH", name: "MSCI Chile", region: "latam", kind: "etf", note: "IPSA proxy" },
  { sym: "EPU", name: "MSCI Peru", region: "latam", kind: "etf", note: "BVL proxy" },
  { sym: "ILF", name: "Latin America 40", region: "latam", kind: "etf", note: "LatAm broad" },
  // ---- heavyweight names (ADRs / listings) ----
  { sym: "VALE", name: "Vale", region: "latam", kind: "stock", note: "Iron ore · BR" },
  { sym: "PBR", name: "Petrobras", region: "latam", kind: "stock", note: "Oil · BR" },
  { sym: "ITUB", name: "Itaú Unibanco", region: "latam", kind: "stock", note: "Bank · BR" },
  { sym: "AMX", name: "América Móvil", region: "latam", kind: "stock", note: "Telecom · MX" },
  { sym: "FMX", name: "FEMSA", region: "latam", kind: "stock", note: "Retail · MX" },
  { sym: "MELI", name: "MercadoLibre", region: "latam", kind: "stock", note: "E-commerce · LatAm" },
  { sym: "YPF", name: "YPF", region: "latam", kind: "stock", note: "Oil · AR" },
  { sym: "GGAL", name: "Grupo Galicia", region: "latam", kind: "stock", note: "Bank · AR" },
  { sym: "SQM", name: "SQM", region: "latam", kind: "stock", note: "Lithium · CL" },
  { sym: "BAP", name: "Credicorp", region: "latam", kind: "stock", note: "Bank · PE" },
  { sym: "EC", name: "Ecopetrol", region: "latam", kind: "stock", note: "Oil · CO" },
  { sym: "CIB", name: "Bancolombia", region: "latam", kind: "stock", note: "Bank · CO" },
  // ---- startups & new economy (the region's unicorns, now listed) ----
  { sym: "NU", name: "Nubank", region: "latam", kind: "stock", note: "Fintech · BR" },
  { sym: "STNE", name: "StoneCo", region: "latam", kind: "stock", note: "Fintech · BR" },
  { sym: "PAGS", name: "PagSeguro", region: "latam", kind: "stock", note: "Fintech · BR" },
  { sym: "XP", name: "XP Inc", region: "latam", kind: "stock", note: "Broker · BR" },
  { sym: "DLO", name: "dLocal", region: "latam", kind: "stock", note: "Fintech · UY" },
  { sym: "GLOB", name: "Globant", region: "latam", kind: "stock", note: "Software · AR" },
  { sym: "JMIA", name: "Jumia", region: "africa", kind: "stock", note: "E-commerce · pan-African" },
  // ---- FX: local currency per 1 USD ----
  { sym: "USDZAR=X", name: "USD / Rand", region: "africa", kind: "fx", ccy: "ZAR", note: "South Africa" },
  { sym: "USDNGN=X", name: "USD / Naira", region: "africa", kind: "fx", ccy: "NGN", note: "Nigeria" },
  { sym: "USDEGP=X", name: "USD / Pound", region: "africa", kind: "fx", ccy: "EGP", note: "Egypt" },
  { sym: "USDKES=X", name: "USD / Shilling", region: "africa", kind: "fx", ccy: "KES", note: "Kenya" },
  { sym: "USDGHS=X", name: "USD / Cedi", region: "africa", kind: "fx", ccy: "GHS", note: "Ghana" },
  { sym: "USDBRL=X", name: "USD / Real", region: "latam", kind: "fx", ccy: "BRL", note: "Brazil" },
  { sym: "USDMXN=X", name: "USD / Peso", region: "latam", kind: "fx", ccy: "MXN", note: "Mexico" },
  { sym: "USDARS=X", name: "USD / Peso", region: "latam", kind: "fx", ccy: "ARS", note: "Argentina · official" },
  { sym: "USDCLP=X", name: "USD / Peso", region: "latam", kind: "fx", ccy: "CLP", note: "Chile" },
  { sym: "USDCOP=X", name: "USD / Peso", region: "latam", kind: "fx", ccy: "COP", note: "Colombia" },
  { sym: "USDPEN=X", name: "USD / Sol", region: "latam", kind: "fx", ccy: "PEN", note: "Peru" },
  { sym: "USDJMD=X", name: "USD / Dollar", region: "caribbean", kind: "fx", ccy: "JMD", note: "Jamaica" },
  { sym: "USDTTD=X", name: "USD / Dollar", region: "caribbean", kind: "fx", ccy: "TTD", note: "Trinidad & Tobago" },
  // ---- commodities that move the region ----
  { sym: "BZ=F", name: "Brent Crude", region: "global", kind: "cmd", note: "NG/AO exporter lifeline" },
  { sym: "CL=F", name: "WTI Crude", region: "global", kind: "cmd", note: "MX/CO/BR/TT" },
  { sym: "GC=F", name: "Gold", region: "global", kind: "cmd", note: "ZA/GH exporter" },
  { sym: "SI=F", name: "Silver", region: "global", kind: "cmd", note: "MX/PE" },
  { sym: "HG=F", name: "Copper", region: "global", kind: "cmd", note: "CL/PE/ZM" },
  { sym: "PL=F", name: "Platinum", region: "global", kind: "cmd", note: "ZA exporter" },
  { sym: "KC=F", name: "Coffee", region: "global", kind: "cmd", note: "BR/CO/ET/KE" },
  { sym: "CC=F", name: "Cocoa", region: "global", kind: "cmd", note: "CI/GH exporter" },
  { sym: "SB=F", name: "Sugar", region: "global", kind: "cmd", note: "BR/Caribbean" },
  // ---- global context ----
  { sym: "^SPX", name: "S&P 500", region: "global", kind: "index", note: "US" },
  { sym: "^DJI", name: "Dow Jones", region: "global", kind: "index", note: "US" },
  { sym: "^NDQ", name: "Nasdaq 100", region: "global", kind: "index", note: "US" },
  { sym: "^FTSE", name: "FTSE 100", region: "global", kind: "index", note: "London" },
  { sym: "EURUSD=X", name: "EUR / USD", region: "global", kind: "fx", ccy: "USD", note: "Euro" },
];

export const bySym = new Map(REGISTRY.map((s) => [s.sym, s]));

export function searchRegistry(q: string, limit = 12): Sym[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const scored: Array<{ s: Sym; rank: number }> = [];
  for (const s of REGISTRY) {
    const sym = s.sym.toLowerCase();
    const name = s.name.toLowerCase();
    let rank = -1;
    if (sym === needle || sym.replace(/[^a-z]/g, "") === needle.replace(/[^a-z]/g, "")) rank = 0;
    else if (sym.startsWith(needle)) rank = 1;
    else if (name.startsWith(needle)) rank = 2;
    else if (sym.includes(needle) || name.includes(needle) || (s.note || "").toLowerCase().includes(needle)) rank = 3;
    if (rank >= 0) scored.push({ s, rank });
  }
  return scored.sort((a, b) => a.rank - b.rank).slice(0, limit).map((x) => x.s);
}

// Dashboard groupings
export const DASH_INDICES = ["^BVSP", "^MXX", "^MERV", "AFK", "EZA", "EGY", "ECH", "EPU", "EWZ", "EWW", "ARGT", "ILF"];
export const DASH_FX = ["USDZAR=X", "USDNGN=X", "USDEGP=X", "USDKES=X", "USDGHS=X", "USDBRL=X", "USDMXN=X", "USDARS=X", "USDCLP=X", "USDCOP=X", "USDPEN=X", "USDJMD=X", "USDTTD=X"];
export const DASH_CMD = ["BZ=F", "CL=F", "GC=F", "HG=F", "PL=F", "KC=F", "CC=F", "SB=F", "SI=F"];
export const DASH_STOCKS = ["VALE", "PBR", "ITUB", "AMX", "FMX", "MELI", "YPF", "GGAL", "SQM", "BAP", "EC", "CIB"];
export const DASH_STARTUPS = ["NU", "STNE", "PAGS", "XP", "DLO", "GLOB", "JMIA"];
export const DASH_GLOBAL = ["^SPX", "^DJI", "^NDQ", "^FTSE", "EURUSD=X"];

// Exchange hours for the open/closed badge (local open/close, tz offset from UTC in minutes)
export const EXCHANGES = [
  { name: "B3", tz: -180, open: "10:00", close: "18:00", days: [1, 2, 3, 4, 5] },
  { name: "BMV", tz: -360, open: "08:30", close: "15:00", days: [1, 2, 3, 4, 5] },
  { name: "BCBA", tz: -180, open: "11:00", close: "17:00", days: [1, 2, 3, 4, 5] },
  { name: "NYSE", tz: -240, open: "09:30", close: "16:00", days: [1, 2, 3, 4, 5] }, // ETFs/ADRs (EDT)
];
