/* Baobab terminal — Bloomberg-style markets UI for Africa, Caribbean & LatAm. */
const $ = (s) => document.querySelector(s);
const view = $("#view"), cmd = $("#cmd"), tapeInner = $("#tape-inner");

const state = {
  view: "top", secSym: null, secRange: "1Y", newsRegion: "all",
  overview: null, watch: [], news: [],
};

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2600);
}
async function jget(path) {
  const r = await fetch(path);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ("Request failed (" + r.status + ")"));
  return d;
}
function fmtP(p) {
  if (p == null || isNaN(p)) return "—";
  const a = Math.abs(p);
  if (a !== 0 && a < 1) return p.toFixed(4);
  return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtV(v) {
  if (v == null) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(Math.round(v));
}
function chgHtml(q) {
  const cls = q.chg >= 0 ? "up" : "down";
  const s = q.chg >= 0 ? "+" : "";
  return `<span class="${cls}">${s}${fmtP(q.chg)} (${s}${q.chgPct.toFixed(2)}%)</span>`;
}
function timeAgo(ts) {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "now";
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  return Math.floor(h / 24) + "d";
}
const REGION_LABEL = { africa: "AFRICA", caribbean: "CARIBBEAN", latam: "LATIN AMERICA", global: "GLOBAL" };

/* ---------- exchange open/closed ---------- */
const EXCHANGES = [
  { name: "B3 São Paulo", tz: -180, open: "10:00", close: "18:00" },
  { name: "BMV Mexico", tz: -360, open: "08:30", close: "15:00" },
  { name: "BCBA Buenos Aires", tz: -180, open: "11:00", close: "17:00" },
  { name: "NYSE (ETFs/ADRs)", tz: -240, open: "09:30", close: "16:00" },
];
function exchangeOpen(e) {
  const now = new Date(Date.now() + (e.tz + new Date().getTimezoneOffset()) * 60000);
  const d = now.getDay();
  if (d === 0 || d === 6) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = e.open.split(":").map(Number), [ch, cm] = e.close.split(":").map(Number);
  return t >= oh * 60 + om && t < ch * 60 + cm;
}
function marketStrip() {
  return `<div style="display:flex;gap:14px;flex-wrap:wrap;margin:2px 0 6px;font-size:11px;color:var(--dim)">` +
    EXCHANGES.map((e) => {
      const open = exchangeOpen(e);
      return `<span><span class="badge ${open ? "open" : ""}">${open ? "● OPEN" : "○ SHUT"}</span> ${esc(e.name)}</span>`;
    }).join("") + `</div>`;
}

/* ---------- charts ---------- */
function drawSpark(cv, bars) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 180, h = cv.clientHeight || 36;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
  if (!bars || bars.length < 2) return;
  const cs = bars.map((b) => b.c);
  const min = Math.min(...cs), max = Math.max(...cs), rng = max - min || 1;
  const up = cs[cs.length - 1] >= cs[0];
  ctx.strokeStyle = up ? "#26d07c" : "#ff5a5a"; ctx.lineWidth = 1.5;
  ctx.beginPath();
  cs.forEach((c, i) => {
    const x = (i / (cs.length - 1)) * w, y = h - 3 - ((c - min) / rng) * (h - 6);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}
function drawChart(cv, bars) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
  cv._bars = bars;
  if (!bars || bars.length < 2) {
    ctx.fillStyle = "#8a8f98"; ctx.font = "12px monospace";
    ctx.fillText("No chart data.", 16, 30); return;
  }
  const cs = bars.map((b) => b.c);
  const min = Math.min(...cs), max = Math.max(...cs), rng = (max - min) || 1;
  const padL = 8, padR = 64, padT = 14, padB = 22;
  const X = (i) => padL + (i / (bars.length - 1)) * (w - padL - padR);
  const Y = (c) => padT + (1 - (c - min) / rng) * (h - padT - padB);
  const up = cs[cs.length - 1] >= cs[0];
  const line = up ? "#26d07c" : "#ff5a5a";
  // grid
  ctx.strokeStyle = "#1c222b"; ctx.fillStyle = "#5a616b"; ctx.font = "10px monospace"; ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const v = min + (rng * g) / 4, y = Y(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(fmtP(v), w - padR + 6, y + 3);
  }
  // x labels: first / mid / last dates
  ctx.fillStyle = "#5a616b";
  const dstr = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  ctx.fillText(dstr(bars[0].t), padL, h - 6);
  ctx.fillText(dstr(bars[Math.floor(bars.length / 2)].t), w / 2 - 20, h - 6);
  const dl = dstr(bars[bars.length - 1].t);
  ctx.fillText(dl, w - padR - ctx.measureText(dl).width, h - 6);
  // area + line
  const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
  grad.addColorStop(0, up ? "rgba(38,208,124,.25)" : "rgba(255,90,90,.25)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.beginPath();
  bars.forEach((b, i) => i ? ctx.lineTo(X(i), Y(b.c)) : ctx.moveTo(X(i), Y(b.c)));
  ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke();
  ctx.lineTo(X(bars.length - 1), h - padB); ctx.lineTo(X(0), h - padB); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  // last price tag
  const lx = X(bars.length - 1), ly = Y(cs[cs.length - 1]);
  ctx.fillStyle = line; ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, 7); ctx.fill();
  // hover crosshair
  cv.onmousemove = (ev) => {
    const r = cv.getBoundingClientRect();
    const mx = ev.clientX - r.left;
    const i = Math.round(((mx - padL) / (w - padL - padR)) * (bars.length - 1));
    const bi = Math.max(0, Math.min(bars.length - 1, i));
    const b = bars[bi];
    drawChartStatic();
    ctx.strokeStyle = "#3a4450"; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(X(bi), padT); ctx.lineTo(X(bi), h - padB); ctx.stroke();
    ctx.setLineDash([]);
    const label = `${dstr(b.t)}  ${fmtP(b.c)}`;
    ctx.font = "11px monospace";
    const tw = ctx.measureText(label).width + 12;
    const tx = Math.min(Math.max(X(bi) - tw / 2, padL), w - padR - tw);
    ctx.fillStyle = "#161a20"; ctx.strokeStyle = "#3a4450";
    ctx.beginPath(); ctx.roundRect(tx, padT + 4, tw, 20, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#e8e6e3"; ctx.fillText(label, tx + 6, padT + 18);
  };
  cv.onmouseleave = drawChartStatic;
  function drawChartStatic() {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#1c222b"; ctx.fillStyle = "#5a616b"; ctx.font = "10px monospace"; ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const v = min + (rng * g) / 4, y = Y(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillText(fmtP(v), w - padR + 6, y + 3);
    }
    ctx.fillStyle = "#5a616b";
    ctx.fillText(dstr(bars[0].t), padL, h - 6);
    ctx.fillText(dstr(bars[Math.floor(bars.length / 2)].t), w / 2 - 20, h - 6);
    const dl2 = dstr(bars[bars.length - 1].t);
    ctx.fillText(dl2, w - padR - ctx.measureText(dl2).width, h - 6);
    ctx.beginPath();
    bars.forEach((b, i) => i ? ctx.lineTo(X(i), Y(b.c)) : ctx.moveTo(X(i), Y(b.c)));
    ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineTo(X(bars.length - 1), h - padB); ctx.lineTo(X(0), h - padB); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.fillStyle = line; ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, 7); ctx.fill();
  }
}

/* ---------- tape ---------- */
function renderTape() {
  const o = state.overview;
  if (!o) return;
  const items = [...o.indices, ...o.fx, ...o.cmd].filter(Boolean);
  const html = items.map((q) => {
    const cls = q.chg >= 0 ? "up" : "down";
    const s = q.chg >= 0 ? "▲" : "▼";
    return `<span><b style="color:var(--amber)">${esc(q.sym)}</b> ${fmtP(q.price)} <span class="${cls}">${s} ${Math.abs(q.chgPct).toFixed(2)}%</span></span>`;
  }).join("");
  tapeInner.innerHTML = html + html; // duplicated for the seamless loop
}

/* ---------- command bar ---------- */
const TABS = [
  ["top", "TOP"], ["watch", "WATCH"], ["fx", "FX"], ["cmd", "COMMOD"], ["news", "NEWS"], ["keys", "KEYS"], ["help", "HELP"],
];
function renderTabs() {
  $("#tabs").innerHTML = TABS.map(([k, label]) =>
    `<button data-tab="${k}" class="${state.view === k ? "on" : ""}">${label}</button>`).join("");
  $("#tabs").querySelectorAll("button").forEach((b) => b.onclick = () => go(b.dataset.tab));
}
function resolveSym(input) {
  const u = input.trim().toUpperCase();
  if (!u) return null;
  const cands = [u, u + "=X", "^" + u, u + ".F"];
  for (const c of cands) {
    if (state.overview) {
      for (const g of ["indices", "fx", "cmd", "stocks", "global"])
        if ((state.overview[g] || []).some((q) => q.sym === c)) return c;
    }
  }
  return u; // let the server validate
}
async function runCommand(raw) {
  const input = raw.trim();
  if (!input) return;
  const u = input.toUpperCase();
  if (u === "TOP") return go("top");
  if (u === "W" || u === "WATCH") return go("watch");
  if (u === "N" || u === "NEWS") return go("news");
  if (u === "FX") return go("fx");
  if (u === "CMD" || u === "COMMOD" || u === "COMMODITIES") return go("cmd");
  if (u === "HELP" || u === "?") return go("help");
  const addM = u.match(/^ADD\s+(.+)$/);
  if (addM) {
    const sym = resolveSym(addM[1]);
    try {
      await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sym }) });
      toast(sym + " added to watchlist.");
      if (state.view === "watch") go("watch", true);
    } catch (e) { toast("Couldn't add " + sym + "."); }
    return;
  }
  const secM = u.match(/^(SEC|CHART)\s+(.+)$/);
  const sym = resolveSym(secM ? secM[2] : u);
  try {
    const d = await jget("/api/quotes?syms=" + encodeURIComponent(sym));
    if (d.quotes.length) return go("sec", d.quotes[0].sym);
  } catch (e) {}
  // JSE fallback: a bare Jamaican ticker like NCBFG
  if (/^[A-Z0-9]{2,8}$/.test(sym)) {
    try {
      const j = await jget("/api/jse/quote?sym=" + encodeURIComponent(sym));
      if (j.quote) return go("sec", j.quote.sym);
    } catch (e) { /* not configured or unknown */ }
    // BVL fallback: a bare Lima ticker like BAP or VOLCABC1
    try {
      const b = await jget("/api/quotes?syms=" + encodeURIComponent("BVL:" + sym));
      if (b.quotes.length) return go("sec", b.quotes[0].sym);
    } catch (e) { /* unknown */ }
  }
  toast("Unknown symbol: " + sym);
}

/* ---------- views ---------- */
function cardHtml(q, spark) {
  return `<div class="card" data-sym="${esc(q.sym)}">
    <div class="nm">${esc(q.name)} <span class="stale">${esc(q.sym)}</span></div>
    <div class="px">${fmtP(q.price)}${q.ccy && q.kind === "fx" && q.ccy !== "USD" ? `<span class="stale"> ${esc(q.ccy)}</span>` : ""}</div>
    <div class="ch">${chgHtml(q)}</div>
    ${spark ? `<canvas data-spark="${esc(q.sym)}"></canvas>` : ""}
  </div>`;
}
function regionCards(list, sparkSyms) {
  return list.map((q) => cardHtml(q, sparkSyms && sparkSyms.has(q.sym))).join("");
}
async function loadSparks(syms) {
  for (const sym of syms) {
    try {
      const d = await jget("/api/history?sym=" + encodeURIComponent(sym) + "&range=1M");
      document.querySelectorAll(`canvas[data-spark="${CSS.escape(sym)}"]`).forEach((cv) => drawSpark(cv, d.bars));
    } catch (e) { /* leave blank */ }
  }
}

async function go(v, arg, force) {
  state.view = v;
  renderTabs();
  window.scrollTo(0, 0);
  if (v === "top") return vTop();
  if (v === "watch") return vWatch(force);
  if (v === "fx") return vFx();
  if (v === "cmd") return vCmd();
  if (v === "news") return vNews();
  if (v === "keys") return vKeys();
  if (v === "help") return vHelp();
  if (v === "sec") return vSec(arg);
}

async function ensureOverview() {
  if (!state.overview) {
    view.innerHTML = `<div class="empty">Loading markets…</div>`;
    state.overview = await jget("/api/overview");
    renderTape();
  }
  return state.overview;
}

async function vTop() {
  const o = await ensureOverview();
  const byRegion = (list) => {
    const groups = {};
    for (const q of list) (groups[q.region] = groups[q.region] || []).push(q);
    return Object.entries(groups).map(([r, qs]) =>
      `<div class="sec-label">${REGION_LABEL[r] || r}</div><div class="grid idx">${regionCards(qs, new Set(o.indices.map((x) => x.sym)))}</div>`).join("");
  };
  view.innerHTML = `
    <div class="sec-label">Market overview <span class="stale">${o.indices.some((q) => q.stale) ? "· delayed/offline" : ""}</span></div>
    ${marketStrip()}
    ${byRegion(o.indices)}
    <div class="sec-label">Heavyweights</div>
    <div class="grid stocks">${regionCards(o.stocks, null)}</div>
    <div class="sec-label">Startups & new economy</div>
    ${byRegion(o.startups)}
    <div class="sec-label">Jamaica — JSE ${o.jse_configured ? (o.jse_stale ? '<span class="stale">· delayed</span>' : "") : '<span class="stale">· needs a free Stacks key</span>'}</div>
    ${o.jse_configured
      ? (o.jamaica.length
        ? `<div class="grid stocks">${regionCards(o.jamaica, null)}</div>`
        : `<div class="empty">JSE feed unreachable right now.</div>`)
      : `<div class="card" id="jse-prompt" style="max-width:440px"><div class="nm">STACKS API KEY</div><div style="margin-top:6px">Add your free Stacks key in <b style="color:var(--amber)">KEYS</b> to light up the Jamaica board.</div></div>`}
    <div class="sec-label">Peru — BVL ${o.peru_stale ? '<span class="stale">· delayed</span>' : ""}</div>
    ${o.peru && o.peru.length
      ? `<div class="grid stocks">${regionCards(o.peru, null)}</div>`
      : `<div class="empty">BVL board unreachable right now.</div>`}
    <div class="sec-label">Argentina — BYMA ${o.argentina_stale ? '<span class="stale">· delayed</span>' : ""}</div>
    ${o.argentina && o.argentina.length
      ? `<div class="grid stocks">${regionCards(o.argentina, null)}</div>`
      : `<div class="empty">BYMA board unreachable right now.</div>`}
    <div class="sec-label">Foreign exchange <span class="stale">per USD</span></div>
    <table class="q"><thead><tr><th>PAIR</th><th>MARKET</th><th class="num">LAST</th><th class="num">CHG %</th></tr></thead>
    <tbody>${o.fx.map((q) => `<tr class="row" data-sym="${esc(q.sym)}">
      <td><b style="color:var(--amber)">${esc(q.sym.replace("=X", ""))}</b></td><td>${esc(q.note || "")}</td>
      <td class="num">${fmtP(q.price)}</td><td class="num">${chgHtml(q)}</td></tr>`).join("")}</tbody></table>
    <div class="sec-label">Commodities</div>
    <div class="grid stocks">${regionCards(o.cmd, null)}</div>
    <div class="sec-label">Global context</div>
    <div class="grid stocks">${regionCards(o.global, null)}</div>`;
  bindCards();
  const jp = document.querySelector("#jse-prompt");
  if (jp) jp.onclick = () => go("keys");
  loadSparks(o.indices.map((x) => x.sym));
}

async function vSec(sym) {
  state.secSym = sym;
  const isJse = sym.startsWith("JSE:");
  const isBvl = sym.startsWith("BVL:");
  const isByma = sym.startsWith("BYMA:");
  const xSym = (isJse || isBvl || isByma) ? sym.slice(4) : null;
  view.innerHTML = `<div class="empty">Loading ${esc(sym)}…</div>`;
  let q;
  try {
    if (isJse) q = (await jget("/api/jse/quote?sym=" + encodeURIComponent(xSym))).quote;
    else q = (await jget("/api/quotes?syms=" + encodeURIComponent(sym))).quotes[0];
  } catch (e) { view.innerHTML = `<div class="empty">Couldn't load ${esc(sym)}.</div>`; return; }
  if (!q) { view.innerHTML = `<div class="empty">Unknown symbol: ${esc(sym)}.</div>`; return; }
  const inWatch = state.watch.some((w) => w.sym === q.sym);
  view.innerHTML = `
    <div class="sec-head">
      <div><h1>${esc(q.name)}</h1><div class="sym">${esc(q.sym)} · ${esc(q.note || "")} ${q.stale ? '<span class="stale">· stale</span>' : ""}</div></div>
      <div class="big">${fmtP(q.price)}</div>
      <div>${chgHtml(q)}</div>
      <button class="btn" id="wadd" style="margin-left:auto">${inWatch ? "★ Watching" : "+ Watch"}</button>
    </div>
    <div class="rangebar" id="ranges">${["1D", "1W", "1M", "3M", "1Y", "5Y"].map((r) =>
      `<button data-r="${r}" class="${state.secRange === r ? "on" : ""}">${r}</button>`).join("")}</div>
    <canvas id="chart"></canvas>
    <div class="statgrid">
      <div class="stat"><div class="k">PREV CLOSE</div><div class="v">${fmtP(q.prevClose)}</div></div>
      <div class="stat"><div class="k">DAY RANGE</div><div class="v">${fmtP(q.dayLow)} – ${fmtP(q.dayHigh)}</div>
        <div class="daybar">${q.dayLow != null && q.dayHigh != null && q.dayHigh > q.dayLow ?
          `<i style="left:${Math.min(100, Math.max(0, ((q.price - q.dayLow) / (q.dayHigh - q.dayLow)) * 100))}%"></i>` : ""}</div></div>
      <div class="stat"><div class="k">52W RANGE</div><div class="v">${fmtP(q.wk52Low)} – ${fmtP(q.wk52High)}</div></div>
      <div class="stat"><div class="k">VOLUME</div><div class="v">${fmtV(q.volume)}</div></div>
      ${q.pe != null ? `<div class="stat"><div class="k">P/E</div><div class="v">${q.pe}</div></div>` : ""}
      <div class="stat"><div class="k">CURRENCY</div><div class="v">${esc(q.ccy || "—")}</div></div>
    </div>`;
  $("#wadd").onclick = async () => {
    try {
      if (inWatch) {
        await fetch("/api/watchlist/" + encodeURIComponent(q.sym), { method: "DELETE" });
        state.watch = state.watch.filter((w) => w.sym !== q.sym);
        toast("Removed from watchlist.");
      } else {
        await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sym: q.sym }) });
        toast(q.sym + " added to watchlist.");
      }
      vSec(sym);
    } catch (e) { toast("Watchlist update failed."); }
  };
  $("#ranges").querySelectorAll("button").forEach((b) => b.onclick = () => {
    state.secRange = b.dataset.r;
    $("#ranges").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    loadChart();
  });
  async function loadChart() {
    try {
      const url = isJse
        ? "/api/jse/history?sym=" + encodeURIComponent(xSym) + "&range=" + state.secRange
        : isBvl && q.kind === "index"
        ? "/api/bvl/history?sym=" + encodeURIComponent(xSym)
        : isBvl || isByma
        ? null // no history feed for these yet
        : "/api/history?sym=" + encodeURIComponent(sym) + "&range=" + state.secRange;
      const d = url ? await jget(url) : { bars: [] };
      drawChart($("#chart"), d.bars);
    } catch (e) { drawChart($("#chart"), []); }
  }
  loadChart();
  window.onresize = () => { const cv = $("#chart"); if (cv && cv._bars) drawChart(cv, cv._bars); };
}

async function vWatch(force) {
  if (!state.watch.length || force) {
    try { state.watch = (await jget("/api/watchlist")).watchlist; }
    catch (e) { state.watch = []; }
  }
  const rows = state.watch.map((q) => `<tr class="row" data-sym="${esc(q.sym)}">
    <td><b style="color:var(--amber)">${esc(q.sym)}</b><div class="stale">${esc(q.name)}</div></td>
    <td class="num">${fmtP(q.price)}</td><td class="num">${chgHtml(q)}</td>
    <td class="num stale">${fmtP(q.dayLow)}–${fmtP(q.dayHigh)}</td>
    <td><button class="btn danger" data-rm="${esc(q.sym)}">✕</button></td></tr>`).join("");
  view.innerHTML = `
    <div class="sec-label">Watchlist</div>
    <div class="inline-form">
      <input id="wadd-in" placeholder="ADD SYMBOL — e.g. VALE, USDZAR" list="symlist">
      <datalist id="symlist"></datalist>
      <button class="btn primary" id="wadd-go">Add</button>
    </div>
    <div id="wsearch" style="margin-bottom:10px"></div>
    ${state.watch.length ? `<table class="q"><thead><tr><th>SECURITY</th><th class="num">LAST</th><th class="num">CHG</th><th class="num">DAY RANGE</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : `<div class="empty">Nothing watched yet. Add a symbol above — or type <kbd>ADD VALE</kbd> in the command bar.</div>`}`;
  bindCards();
  view.querySelectorAll("[data-rm]").forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    await fetch("/api/watchlist/" + encodeURIComponent(b.dataset.rm), { method: "DELETE" });
    state.watch = state.watch.filter((w) => w.sym !== b.dataset.rm);
    vWatch();
  });
  const inp = $("#wadd-in");
  const addSym = async () => {
    const sym = resolveSym(inp.value);
    if (!sym) return;
    try {
      await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sym }) });
      state.watch = (await jget("/api/watchlist")).watchlist;
      vWatch();
    } catch (e) { toast("Unknown symbol: " + sym); }
  };
  $("#wadd-go").onclick = addSym;
  inp.onkeydown = (e) => { if (e.key === "Enter") addSym(); };
  let deb;
  inp.oninput = () => {
    clearTimeout(deb);
    deb = setTimeout(async () => {
      const q = inp.value.trim();
      if (q.length < 2) { $("#wsearch").innerHTML = ""; return; }
      try {
        const d = await jget("/api/search?q=" + encodeURIComponent(q));
        $("#wsearch").innerHTML = d.results.map((r) =>
          `<button class="btn" data-pick="${esc(r.sym)}" style="margin:0 6px 6px 0"><b style="color:var(--amber)">${esc(r.sym)}</b> ${esc(r.name)}</button>`).join("");
        $("#wsearch").querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => { inp.value = b.dataset.pick; $("#wsearch").innerHTML = ""; addSym(); });
      } catch (e) {}
    }, 250);
  };
}

async function vFx() {
  const o = await ensureOverview();
  view.innerHTML = `
    <div class="sec-label">Foreign exchange <span class="stale">local currency per 1 USD — ▲ means the dollar strengthened</span></div>
    <div class="grid idx">${o.fx.map((q) => cardHtml(q, false)).join("")}</div>`;
  bindCards();
}

async function vCmd() {
  const o = await ensureOverview();
  view.innerHTML = `
    <div class="sec-label">Commodities <span class="stale">the region's lifelines</span></div>
    <div class="grid idx">${o.cmd.map((q) => cardHtml(q, false)).join("")}</div>`;
  bindCards();
}

async function vNews() {
  const regions = [["all", "ALL"], ["africa", "AFRICA"], ["caribbean", "CARIBBEAN"], ["latam", "LATAM"]];
  view.innerHTML = `
    <div class="sec-label">News</div>
    <div class="nfilters">${regions.map(([k, l]) =>
      `<button data-nr="${k}" class="${state.newsRegion === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div id="newslist"><div class="empty">Loading headlines…</div></div>`;
  view.querySelectorAll("[data-nr]").forEach((b) => b.onclick = () => { state.newsRegion = b.dataset.nr; vNews(); });
  try {
    const d = await jget("/api/news?region=" + state.newsRegion);
    $("#newslist").innerHTML = d.news.length ? d.news.map((n) => `
      <a class="newsitem" href="${esc(n.link)}" target="_blank" rel="noopener">
        <div class="t">${esc(n.title)}</div>
        <div class="m"><b>${esc(n.source)}</b> · ${esc(REGION_LABEL[n.region] || "")} · ${timeAgo(n.published)}</div>
      </a>`).join("") : `<div class="empty">No headlines right now.</div>`;
  } catch (e) { $("#newslist").innerHTML = `<div class="empty">News feed unreachable.</div>`; }
}

async function vKeys() {
  view.innerHTML = `<div class="sec-label">API keys</div><div class="empty">Checking…</div>`;
  let st = { stacks: { configured: false } };
  try { st = await jget("/api/keys"); } catch (e) {}
  const s = st.stacks || {};
  view.innerHTML = `
    <div class="sec-label">API keys</div>
    <div class="card" style="max-width:520px;cursor:default">
      <div class="nm">STACKS — JAMAICA STOCK EXCHANGE</div>
      <div style="margin:8px 0">${s.configured
        ? `<span class="badge open">● CONNECTED</span>${s.tier ? ` <span class="stale">${esc(s.tier)} tier</span>` : ""}`
        : `<span class="badge">○ NOT CONFIGURED</span>`}</div>
      <div class="inline-form" style="margin:10px 0 0">
        <input id="k-in" type="password" placeholder="pk_…" autocomplete="off" style="text-transform:none">
        <button class="btn primary" id="k-save">Save</button>
        ${s.configured ? `<button class="btn danger" id="k-del">Remove</button>` : ""}
      </div>
      <div class="stale" id="k-msg" style="margin-top:8px;min-height:18px"></div>
      <div class="stale" style="margin-top:8px">Free key at stacksja.com/developers — paste it here. It is validated once, then lives only on this server, never in the page.</div>
    </div>`;
  const save = async () => {
    const key = $("#k-in").value.trim();
    if (!key) return;
    $("#k-msg").textContent = "Validating with Stacks…";
    try {
      const r = await fetch("/api/keys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      }).then((x) => x.json());
      if (r.ok) {
        toast("Key saved — Jamaica is live.");
        state.overview = null; // reload so TOP picks up the board
        vKeys();
      } else $("#k-msg").textContent = r.error || "That key didn't validate.";
    } catch (e) { $("#k-msg").textContent = "Couldn't reach the server."; }
  };
  $("#k-save").onclick = save;
  $("#k-in").onkeydown = (e) => { if (e.key === "Enter") save(); };
  const del = $("#k-del");
  if (del) del.onclick = async () => {
    await fetch("/api/keys", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "" }),
    });
    toast("Key removed.");
    state.overview = null;
    vKeys();
  };
}

function vHelp() {
  const fns = [
    ["TOP", "Market overview — indices, FX, commodities"],
    ["W", "Your watchlist"],
    ["FX", "Currency board"],
    ["CMD", "Commodities board"],
    ["N", "Regional news"],
    ["SEC &lt;sym&gt;", "Security detail + chart — e.g. SEC VALE"],
    ["JSE:&lt;sym&gt;", "Jamaica quote — e.g. JSE:NCBFG (needs a Stacks key)"],
    ["BVL:&lt;sym&gt;", "Lima quote — e.g. BVL:BAP (keyless BVL feed)"],
    ["BYMA:&lt;sym&gt;", "Argentine index — e.g. BYMA:G (keyless BYMA feed)"],
    ["ADD &lt;sym&gt;", "Add to watchlist — e.g. ADD USDZAR"],
    ["KEYS", "API keys — Stacks key for Jamaica"],
    ["HELP", "This screen"],
  ];
  view.innerHTML = `
    <div class="sec-label">Functions</div>
    <div class="helpgrid">${fns.map(([f, d]) =>
      `<div class="card"><div class="fn">${f}</div><div style="color:var(--dim);font-size:12px;margin-top:4px">${d}</div></div>`).join("")}</div>
    <div class="sec-label">Keyboard</div>
    <div class="helpgrid">
      <div class="card"><div class="fn"><kbd>/</kbd></div><div style="color:var(--dim);font-size:12px;margin-top:4px">Focus the command bar</div></div>
      <div class="card"><div class="fn"><kbd>1</kbd>–<kbd>7</kbd></div><div style="color:var(--dim);font-size:12px;margin-top:4px">Jump to TOP · WATCH · FX · COMMOD · NEWS · KEYS · HELP</div></div>
      <div class="card"><div class="fn"><kbd>Esc</kbd></div><div style="color:var(--dim);font-size:12px;margin-top:4px">Leave the command bar</div></div>
    </div>
    <div class="sec-label">Data</div>
    <p style="color:var(--dim);font-size:13px;max-width:640px">Quotes and history via Yahoo Finance (15-minute delayed, cached 90 seconds). News from African Business, Premium Times, AllAfrica, Jamaica Observer, Barbados Today, and MercoPress. Caribbean equity indices have no public feed — the region is covered through FX and news.</p>`;
}

function bindCards() {
  view.querySelectorAll("[data-sym]").forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest("button")) return;
      go("sec", el.dataset.sym);
    };
  });
}

/* ---------- chrome ---------- */
function tickClock() {
  $("#clock").textContent = new Date().toLocaleString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}
$("#go").onclick = () => { runCommand(cmd.value); cmd.value = ""; cmd.blur(); };
cmd.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { runCommand(cmd.value); cmd.value = ""; cmd.blur(); }
  if (e.key === "Escape") cmd.blur();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== cmd && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
    e.preventDefault(); cmd.focus();
  }
  const tabs = ["top", "watch", "fx", "cmd", "news", "keys", "help"];
  if (/^[1-7]$/.test(e.key) && document.activeElement !== cmd) go(tabs[Number(e.key) - 1]);
});
setInterval(tickClock, 1000); tickClock();
// refresh quotes periodically on data views
setInterval(async () => {
  if (!["top", "watch", "fx", "cmd"].includes(state.view)) return;
  try {
    state.overview = await jget("/api/overview");
    renderTape();
    if (state.view === "top") vTop();
    if (state.view === "watch") { state.watch = (await jget("/api/watchlist")).watchlist; vWatch(); }
    if (state.view === "fx") vFx();
    if (state.view === "cmd") vCmd();
  } catch (e) { /* stay on stale data */ }
}, 90000);

go("top");
