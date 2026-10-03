# 🌳 Baobab

A Bloomberg-style markets terminal for **Africa, the Caribbean & Latin America** — Bun + zero dependencies + SQLite.

## What it does

- **TOP** — market overview: regional indices & ETF trackers with sparklines, heavyweight stocks, an FX table (13 local currencies per USD), commodities, and global context. Live exchange open/shut badges for B3, BMV, BCBA, and NYSE.
- **Security view** — any symbol: big interactive chart (1D–5Y, hover crosshair), prev close, day range with position marker, 52-week range, volume.
- **WATCH** — persistent watchlist (SQLite), add/remove, live quotes.
- **FX / COMMOD** — currency and commodity boards. Commodities are the region's lifelines: Brent, WTI, gold, silver, copper, platinum, coffee, cocoa, sugar.
- **NEWS** — business headlines from African Business, Premium Times (Nigeria), AllAfrica, Jamaica Observer, Barbados Today, and MercoPress, filterable by region.
- **Command bar** — Bloomberg-style functions: `TOP`, `W`, `FX`, `CMD`, `N`, `HELP`, `SEC VALE`, `ADD USDZAR`, or just type a symbol. `/` focuses it, `1–6` jumps between views.
- Scrolling ticker tape, auto-refresh every 90s, graceful stale-data mode when a feed is unreachable.

## Coverage

| Region | Instruments |
|---|---|
| Latin America | Bovespa, IPC, Merval indices · Brazil/Mexico/Argentina/Chile/Peru/LatAm ETFs · Vale, Petrobras, Itaú, América Móvil, FEMSA, MercadoLibre, YPF, Galicia, SQM, Credicorp, Ecopetrol, Bancolombia · BRL, MXN, ARS, CLP, COP, PEN |
| Africa | Africa/South Africa/Egypt index ETFs · ZAR, NGN, EGP, KES, GHS |
| Caribbean | JMD, TTD + regional news (no public equity index feed exists) |
| Global | S&P 500, Dow, Nasdaq 100, FTSE 100, EUR/USD, 9 commodities |

## Run it

```sh
bun src/server.ts
# → http://localhost:3015
```

Data lives in `./data/baobab.db` (created on boot, gitignored). Quotes via Yahoo Finance (cached 90s), history cached 1h, news cached 20min. `BAOBAB_PORT` and `BAOBAB_DATA` env overrides supported.

## Test

```sh
bun test   # 26 checks: stubbed Yahoo client, feed parsing, registry, full API e2e, DOM-stubbed frontend render
```
