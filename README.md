# 🌳 Baobab

A Bloomberg-style markets terminal for **Africa, the Caribbean & Latin America** — Bun + zero dependencies + SQLite.

## What it does

- **TOP** — market overview: regional indices & ETF trackers with sparklines, heavyweight stocks, a startups board, the Jamaica (JSE) board, **Peru (BVL)** and **Argentina (BYMA)** boards — all keyless exchange feeds — an FX table (13 local currencies per USD), commodities, and global context. Live exchange open/shut badges for B3, BMV, BCBA, and NYSE.
- **Security view** — any symbol: big interactive chart (1D–5Y, hover crosshair), prev close, day range with position marker, 52-week range, volume.
- **WATCH** — persistent watchlist (SQLite), add/remove, live quotes. Jamaican stocks work too (`JSE:NCBFG`).
- **FX / COMMOD** — currency and commodity boards. Commodities are the region's lifelines: Brent, WTI, gold, silver, copper, platinum, coffee, cocoa, sugar.
- **KEYS** — paste your free [Stacks API](https://stacksja.com/developers) key to light up the Jamaica board (JSE Main + Junior Market — live prices, daily history, P/E). The key is validated once, stored server-side only, and never shown in the page.
- **NEWS** — business headlines from African Business, Premium Times (Nigeria), AllAfrica, Jamaica Observer, Barbados Today, and MercoPress, filterable by region. Startup funding rounds flow in from LatamList Funding and TechCabal Funding.
- **Command bar** — Bloomberg-style functions: `TOP`, `W`, `FX`, `CMD`, `N`, `KEYS`, `HELP`, `SEC VALE`, `JSE:NCBFG`, `ADD USDZAR`, or just type a symbol — bare Jamaican tickers (e.g. `NCBFG`) resolve via the JSE feed when a key is configured. `/` focuses it, `1–7` jumps between views.
- Scrolling ticker tape, auto-refresh every 90s, graceful stale-data mode when a feed is unreachable.

## Coverage

| Region | Instruments |
|---|---|
| Latin America | Bovespa, IPC, Merval indices · Brazil/Mexico/Argentina/Chile/Peru/LatAm ETFs · Vale, Petrobras, Itaú, América Móvil, FEMSA, MercadoLibre, YPF, Galicia, SQM, Credicorp, Ecopetrol, Bancolombia · **BVL Lima board + MSCI NUAM indices** (keyless) · **16 BYMA Buenos Aires indices** (keyless) · BRL, MXN, ARS, CLP, COP, PEN |
| Africa | Africa/South Africa/Egypt index ETFs · ZAR, NGN, EGP, KES, GHS |
| Caribbean | **Jamaica Stock Exchange via the Stacks API** (needs a free key in KEYS) · JMD, TTD + regional news |
| Global | S&P 500, Dow, Nasdaq 100, FTSE 100, EUR/USD, 9 commodities |

## Run it

```sh
bun src/server.ts
# → http://localhost:3015
```

Data lives in `./data/baobab.db` (created on boot, gitignored). Quotes via Yahoo Finance (cached 90s), history cached 1h, news cached 20min. `BAOBAB_PORT` and `BAOBAB_DATA` env overrides supported.

## Test

```sh
bun test   # 48 checks: stubbed Yahoo/Stacks/BVL/BYMA/wp-json clients, feed parsing, registry, full API e2e, DOM-stubbed frontend render
```
