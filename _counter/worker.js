// Visitor counter for alexfarren.com, running as a Cloudflare Worker with a D1 database.
//
// What it records, per day: page views and unique visitors for each page, plus the site
// that sent the visitor, their country and device type. No cookies, and no IP addresses are
// stored: a visitor is recognised within one day by a scrambled code made from their IP
// address, browser and a random value that is replaced every day (the same idea Plausible uses).
//
// Endpoints:
//   POST /c            a page view, sent by count.js on the website
//   GET  /             the stats page (asks for the password in STATS_PASSWORD)
//   GET  /stats.json   the same numbers as JSON
//
// Setup: bind a D1 database as DB and add a secret STATS_PASSWORD. The tables create themselves.

const ALLOWED_HOSTS = ["alexfarren.com", "www.alexfarren.com", "farrenal.github.io"];
const BOT = /bot|crawl|spider|slurp|headless|preview|fetch|monitor|lighthouse|python|curl|wget/i;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS hits (
     day TEXT NOT NULL, path TEXT NOT NULL, referrer TEXT NOT NULL, country TEXT NOT NULL, device TEXT NOT NULL,
     views INTEGER NOT NULL DEFAULT 0, visitors INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (day, path, referrer, country, device))`,
  `CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, visitors INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS seen (day TEXT NOT NULL, hash TEXT NOT NULL, path TEXT NOT NULL,
     PRIMARY KEY (day, hash, path))`,
  `CREATE TABLE IF NOT EXISTS salt (day TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];
let schemaReady = false;

async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch(SCHEMA.map(sql => env.DB.prepare(sql)));
  schemaReady = true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.DB) return new Response("No D1 database bound as DB.", { status: 500 });
    await ensureSchema(env);

    if (url.pathname === "/c") {
      if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }), request);
      if (request.method === "POST") return withCors(await recordHit(request, env), request);
    }
    if (url.pathname === "/" || url.pathname === "/stats.json") {
      const denied = checkPassword(request, env);
      if (denied) return denied;
      const data = await getStats(env, url);
      if (url.pathname === "/stats.json") return Response.json(data);
      return new Response(statsPage(data), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return new Response("Not found", { status: 404 });
  },

  // optional daily tidy-up (add a cron trigger); the same tidy-up also runs on each day's first visit
  async scheduled(event, env) {
    await ensureSchema(env);
    await tidy(env, today());
  },
};

// ---------------------------------------------------------------- recording

const today = () => new Date().toISOString().slice(0, 10); // UTC

function withCors(response, request) {
  const origin = request.headers.get("Origin") || "";
  const h = new Headers(response.headers);
  if (isAllowedOrigin(origin)) h.set("Access-Control-Allow-Origin", origin);
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, { status: response.status, headers: h });
}

function isAllowedOrigin(origin) {
  try { return ALLOWED_HOSTS.includes(new URL(origin).hostname); } catch { return false; }
}

async function tidy(env, day) {
  // forget the previous days' visitor codes and random values, so nobody can be followed across days
  await env.DB.batch([
    env.DB.prepare("DELETE FROM seen WHERE day < ?").bind(day),
    env.DB.prepare("DELETE FROM salt WHERE day < ?").bind(day),
  ]);
}

async function saltFor(env, day) {
  const row = await env.DB.prepare("SELECT value FROM salt WHERE day = ?").bind(day).first();
  if (row) return row.value;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const value = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  await env.DB.prepare("INSERT OR IGNORE INTO salt (day, value) VALUES (?, ?)").bind(day, value).run();
  await tidy(env, day); // first visit of a new day
  return (await env.DB.prepare("SELECT value FROM salt WHERE day = ?").bind(day).first()).value;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
}

function deviceOf(ua) {
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|Android/i.test(ua)) return "mobile";
  return "desktop";
}

async function recordHit(request, env) {
  const ignored = new Response(null, { status: 204 });
  if (!isAllowedOrigin(request.headers.get("Origin") || "")) return ignored;
  const ua = request.headers.get("User-Agent") || "";
  if (!ua || BOT.test(ua)) return ignored;

  let msg;
  try { msg = JSON.parse(await request.text()); } catch { return ignored; }
  const path = String(msg.p || "");
  if (!/^\/[\w\-./?=%]{0,150}$/.test(path)) return ignored;
  const referrer = String(msg.r || "").toLowerCase().replace(/[^\w.\-]/g, "").slice(0, 60);
  const country = (request.cf && request.cf.country) || "??";
  const device = deviceOf(ua);

  const day = today();
  const salt = await saltFor(env, day);
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const hash = await sha256(`${salt}|${ip}|${ua}`);

  const [pageSeen, siteSeen] = await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO seen (day, hash, path) VALUES (?, ?, ?)").bind(day, hash, path),
    env.DB.prepare("INSERT OR IGNORE INTO seen (day, hash, path) VALUES (?, ?, '*')").bind(day, hash),
  ]);
  const newOnPage = pageSeen.meta.changes > 0 ? 1 : 0;
  const newOnSite = siteSeen.meta.changes > 0 ? 1 : 0;

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO hits (day, path, referrer, country, device, views, visitors) VALUES (?, ?, ?, ?, ?, 1, ?)
                    ON CONFLICT (day, path, referrer, country, device)
                    DO UPDATE SET views = views + 1, visitors = visitors + excluded.visitors`)
      .bind(day, path, referrer, country, device, newOnPage),
    env.DB.prepare(`INSERT INTO daily (day, visitors) VALUES (?, ?)
                    ON CONFLICT (day) DO UPDATE SET visitors = visitors + excluded.visitors`)
      .bind(day, newOnSite),
  ]);
  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------- stats

function checkPassword(request, env) {
  if (!env.STATS_PASSWORD) return new Response("Add a secret called STATS_PASSWORD to see the stats.", { status: 503 });
  const header = request.headers.get("Authorization") || "";
  let password = "";
  try { password = atob(header.replace(/^Basic\s+/i, "")).split(":").slice(1).join(":"); } catch {}
  if (header.startsWith("Basic ") && password === env.STATS_PASSWORD) return null;
  return new Response("Password needed", {
    status: 401, headers: { "WWW-Authenticate": 'Basic realm="Site stats", charset="UTF-8"' },
  });
}

const RANGES = { "7": 7, "30": 30, "90": 90, "365": 365, "all": 100000 };

async function getStats(env, url) {
  const range = RANGES[url.searchParams.get("days")] ? url.searchParams.get("days") : "30";
  const since = new Date(Date.now() - (RANGES[range] - 1) * 86400000).toISOString().slice(0, 10);
  const page = url.searchParams.get("page") || "";
  const where = page ? "day >= ? AND path = ?" : "day >= ?";
  const args = page ? [since, page] : [since];
  const q = (sql, ...extra) => env.DB.prepare(sql).bind(...args, ...extra).all().then(r => r.results);

  const [byDay, pages, referrers, countries, devices, siteDaily] = await Promise.all([
    q(`SELECT day, SUM(views) AS views, SUM(visitors) AS visitors FROM hits WHERE ${where} GROUP BY day ORDER BY day`),
    q(`SELECT path, SUM(views) AS views, SUM(visitors) AS visitors FROM hits WHERE ${where} GROUP BY path ORDER BY views DESC LIMIT 50`),
    q(`SELECT referrer, SUM(views) AS views, SUM(visitors) AS visitors FROM hits WHERE ${where} AND referrer != '' GROUP BY referrer ORDER BY visitors DESC LIMIT 30`),
    q(`SELECT country, SUM(views) AS views, SUM(visitors) AS visitors FROM hits WHERE ${where} GROUP BY country ORDER BY visitors DESC LIMIT 30`),
    q(`SELECT device, SUM(views) AS views, SUM(visitors) AS visitors FROM hits WHERE ${where} GROUP BY device ORDER BY visitors DESC`),
    env.DB.prepare("SELECT day, visitors FROM daily WHERE day >= ? ORDER BY day").bind(since).all().then(r => r.results),
  ]);

  // site-wide visitors come from the daily table (one person reading three pages counts once)
  const siteVisitors = Object.fromEntries(siteDaily.map(r => [r.day, r.visitors]));
  const days = [];
  for (let t = new Date(since + "T00:00:00Z").getTime(); t <= Date.now(); t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    const row = byDay.find(r => r.day === d) || { views: 0, visitors: 0 };
    days.push({ day: d, views: row.views, visitors: page ? row.visitors : (siteVisitors[d] ?? row.visitors) });
    if (range === "all" && days.length > 3000) break;
  }
  if (range === "all") while (days.length && days[0].views === 0) days.shift();

  const sum = k => days.reduce((s, d) => s + d[k], 0);
  return { range, page, since, totals: { views: sum("views"), visitors: sum("visitors") },
           days, pages, referrers, countries, devices };
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function table(title, rows, key, label = k => esc(k), link = null) {
  if (!rows.length) return `<section><h2>${title}</h2><p class="none">Nothing yet.</p></section>`;
  const max = Math.max(...rows.map(r => r.visitors || r.views), 1);
  return `<section><h2>${title}</h2><table>
    <tr><th></th><th>Visitors</th><th>Views</th></tr>
    ${rows.map(r => `<tr>
      <td class="name"><div class="bar" style="width:${(100 * (r.visitors || r.views) / max).toFixed(1)}%"></div>
        <span>${link ? `<a href="${link(r[key])}">${label(r[key])}</a>` : label(r[key])}</span></td>
      <td>${r.visitors.toLocaleString("en-GB")}</td><td>${r.views.toLocaleString("en-GB")}</td></tr>`).join("")}
  </table></section>`;
}

function chart(days) {
  const W = 900, H = 180, n = days.length, max = Math.max(1, ...days.map(d => d.views));
  const bw = W / Math.max(n, 1);
  const bars = days.map((d, i) => {
    const hv = (H - 20) * d.views / max, hu = (H - 20) * d.visitors / max;
    return `<g><title>${d.day}: ${d.visitors} visitors, ${d.views} views</title>
      <rect x="${(i * bw + bw * 0.1).toFixed(1)}" y="${(H - hv).toFixed(1)}" width="${(bw * 0.8).toFixed(1)}" height="${hv.toFixed(1)}" class="v"/>
      <rect x="${(i * bw + bw * 0.1).toFixed(1)}" y="${(H - hu).toFixed(1)}" width="${(bw * 0.8).toFixed(1)}" height="${hu.toFixed(1)}" class="u"/></g>`;
  }).join("");
  const first = days[0]?.day || "", last = days[n - 1]?.day || "";
  return `<svg viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="Visitors and views per day">
    <text x="0" y="12" class="axis">max ${max} views</text>${bars}
    <text x="0" y="${H + 15}" class="axis">${first}</text><text x="${W}" y="${H + 15}" text-anchor="end" class="axis">${last}</text></svg>`;
}

function statsPage(s) {
  const flag = cc => cc && cc.length === 2 && cc !== "??"
    ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 127397 + c.charCodeAt(0))) + " " + cc : "unknown";
  const rangeLink = (r, text) => `<a class="${s.range === r ? "on" : ""}" href="?days=${r}${s.page ? "&page=" + encodeURIComponent(s.page) : ""}">${text}</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Site stats</title>
<style>
  :root { --bg:#f0f0f0; --card:#fff; --ink:#111; --muted:#666; --line:#ddd; --v:#c9d4ee; --u:#4066b3; }
  @media (prefers-color-scheme: dark) { :root { --bg:#161616; --card:#212121; --ink:#eee; --muted:#999; --line:#333; --v:#2c3a5c; --u:#7e9cf0; } }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.45 system-ui, sans-serif; }
  .wrap { max-width:960px; margin:0 auto; padding:20px 16px 60px; }
  h1 { margin:0 0 4px; font-size:24px; } h2 { font-size:15px; margin:0 0 8px; }
  a { color:var(--u); text-decoration:none; }
  .ranges a { margin-right:12px; } .ranges a.on { font-weight:700; color:var(--ink); }
  .totals { display:flex; gap:28px; margin:16px 0; } .totals b { display:block; font-size:28px; }
  .totals span { color:var(--muted); font-size:13px; }
  .card, section { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 16px; margin-bottom:14px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; } .grid section { margin:0; }
  @media (max-width:700px) { .grid { grid-template-columns:1fr; } }
  svg { width:100%; height:auto; } svg .v { fill:var(--v); } svg .u { fill:var(--u); } svg .axis { font-size:11px; fill:var(--muted); }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th { text-align:right; color:var(--muted); font-weight:500; font-size:12px; } th:first-child { text-align:left; }
  td { padding:3px 0; text-align:right; white-space:nowrap; } td + td, th + th { padding-left:14px; width:1%; }
  td.name { position:relative; text-align:left; white-space:normal; word-break:break-all; }
  td.name .bar { position:absolute; inset:2px auto 2px 0; background:var(--v); border-radius:3px; opacity:.6; }
  td.name span { position:relative; padding-left:6px; }
  .none, .note { color:var(--muted); font-size:13px; } .key i { display:inline-block; width:10px; height:10px; margin:0 4px 0 12px; }
</style></head><body><div class="wrap">
<h1>Site stats${s.page ? ": " + esc(s.page) : ""}</h1>
<div class="ranges">${rangeLink("7", "7 days")}${rangeLink("30", "30 days")}${rangeLink("90", "90 days")}${rangeLink("365", "1 year")}${rangeLink("all", "All time")}
${s.page ? `<a href="?days=${s.range}">← whole site</a>` : ""}</div>
<div class="totals"><div><b>${s.totals.visitors.toLocaleString("en-GB")}</b><span>visitors (counted once per day)</span></div>
<div><b>${s.totals.views.toLocaleString("en-GB")}</b><span>page views</span></div></div>
<div class="card">${chart(s.days)}<div class="note key"><i style="background:var(--u)"></i>visitors<i style="background:var(--v)"></i>views</div></div>
${s.page ? "" : table("Pages", s.pages, "path", esc, p => `?days=${s.range}&page=${encodeURIComponent(p)}`)}
<div class="grid">
${table("Came from", s.referrers, "referrer")}
${table("Countries", s.countries, "country", flag)}
${table("Devices", s.devices, "device")}
</div>
<p class="note">Days are in UTC. Visitors are recognised within a day only, so someone who comes back tomorrow counts again.</p>
</div></body></html>`;
}
