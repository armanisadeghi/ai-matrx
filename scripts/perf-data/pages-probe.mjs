#!/usr/bin/env node
// pnpm perf:pages [--base https://www.aimatrx.com] [--group 1|2|all] [--calls 3] [--record] [--bundle] [--dry]
//
// PERF-WATCH-2 pages: a server-side, signed-in fetch of each top route, measuring time to first byte and HTML bytes
// (no browser). Registers into the existing performance watch: watch pageprobe:<route> (perf_kind 'page', p95 budget),
// sample source 'probe' through the service-only ops.perf_page_probe_report. --bundle instead reads the build's
// .next/diagnostics/route-bundle-stats.json (first-load JS per route, gzip KB) and posts it through
// ops.perf_page_bundle_report (sample source 'cli', never judged; first_load_js_kb lands on the watch).
//
// AUTH (sanctioned, no browser, no typed password): the probe seat's vaulted test credentials from env
// (AI_MEMBER_USERNAME/AI_MEMBER_PASSWORD = test@test.com; --seat admin uses AI_ADMIN_*) go through Supabase Auth's
// password grant from this process (the same path scripts/perf-data/lib.mjs signIn uses), and the session is turned
// into the app's cookie (sb-matrx-auth-v2, chunked) by @supabase/ssr's own cookie writer — exactly what a browser
// login leaves behind. Credentials are never printed. Run it where the vaulted env exists (a developer machine, or a
// runner that holds those secrets). The aidream dev-login door is deliberately NOT used: it is never mounted on production.
//
// Run cap: 75 s per run (knob perf.page_probe_run_cap_seconds), one warm-up + >= 3 timed requests per route, sequential.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { performance } from "node:perf_hooks";
import { createServerClient } from "@supabase/ssr";
import { env, root, UA, pct } from "./lib.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : (process.argv[i + 1] === undefined || process.argv[i + 1].startsWith("--") ? true : process.argv[i + 1]); };
const base = String(arg("base", "https://www.aimatrx.com")).replace(/\/$/, "");
const group = String(arg("group", "all"));
const seatName = String(arg("seat", "member"));
const record = !!arg("record", false), wantBundle = !!arg("bundle", false), dry = !!arg("dry", false);
const cfg = JSON.parse(fs.readFileSync(path.join(here, "page-probe-routes.json"), "utf8"));
const routes = cfg.routes.filter((r) => group === "all" || String(r.group) === group);

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL, SB_KEY = env.SUPABASE_SECRET_KEY;
async function rpc(fn, body) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "User-Agent": UA, apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", "Content-Profile": "ops", "Accept-Profile": "ops" },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (r.status >= 300) throw new Error(`${fn} answered ${r.status} ${t.slice(0, 300)}`);
  return JSON.parse(t);
}
import { execFileSync } from "node:child_process";
const gitSha = (() => { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { return null; } })();

// ── first-load JS from the build ──────────────────────────────────────────────────────────────
if (wantBundle) {
  const statsFile = path.join(root, ".next/diagnostics/route-bundle-stats.json");
  if (!fs.existsSync(statsFile)) { console.error("perf:pages --bundle: .next/diagnostics/route-bundle-stats.json is missing — run a production build first (pnpm build)."); process.exit(2); }
  const stats = JSON.parse(fs.readFileSync(statsFile, "utf8"));
  const byRoute = new Map(stats.map((s) => [s.route, s]));
  const gz = new Map();
  const out = [];
  for (const r of cfg.routes) {
    const s = byRoute.get(r.route);
    if (!s) { console.log(`  ! ${r.route}: not in the build's route stats`); continue; }
    let bytes = 0;
    for (const c of s.firstLoadChunkPaths) {
      if (!gz.has(c)) { const f = path.join(root, c); gz.set(c, fs.existsSync(f) ? zlib.gzipSync(fs.readFileSync(f), { level: 6 }).length : 0); }
      bytes += gz.get(c);
    }
    out.push({ route: r.route, first_load_js_kb: Math.round((bytes / 1024) * 10) / 10, js_bytes: bytes, chunks: s.firstLoadChunkPaths.length, uncompressed_kb: Math.round(s.firstLoadUncompressedJsBytes / 1024) });
  }
  console.table(out.map((o) => ({ route: o.route, gzip_kb: o.first_load_js_kb, uncompressed_kb: o.uncompressed_kb, chunks: o.chunks })));
  if (record && !dry) console.log("posted:", JSON.stringify(await rpc("perf_page_bundle_report", { p_report: { sha: gitSha, routes: out } })));
  process.exit(0);
}

// ── the synthetic page fetch ──────────────────────────────────────────────────────────────────
const email = seatName === "admin" ? env.AI_ADMIN_USERNAME : env.AI_MEMBER_USERNAME;
const password = seatName === "admin" ? env.AI_ADMIN_PASSWORD : env.AI_MEMBER_PASSWORD;
if (!email || !password || !SB_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) { console.error("perf:pages: the probe seat's vaulted sign-in (or the Supabase url/key) is missing from the environment (.env.local / aidream/.env). Nothing was measured."); process.exit(2); }
const jar = new Map();
const sb = createServerClient(SB_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  cookieOptions: { name: "sb-matrx-auth-v2" },
  cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))) },
});
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email, password });
if (authErr || !auth?.session) { console.error(`perf:pages: sign-in of the ${seatName} seat failed (${authErr?.status ?? "?"}). Nothing was measured.`); process.exit(2); }
const seatEmail = auth.user.email;
const cookie = [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
console.log(`perf:pages: ${routes.length} routes on ${base} as ${seatEmail} (${seatName} seat)`);

async function fetchOnce(url) {
  let u = url, ttfb = 0, status = 0, hops = 0;
  for (;;) {
    const t0 = performance.now();
    const res = await fetch(u, { redirect: "manual", headers: { Cookie: cookie, "User-Agent": UA, Accept: "text/html" } });
    ttfb += performance.now() - t0;
    status = res.status;
    if (status >= 300 && status < 400 && res.headers.get("location") && hops++ < 4) { await res.arrayBuffer(); u = new URL(res.headers.get("location"), u).toString(); continue; }
    const body = Buffer.from(await res.arrayBuffer());
    return { ttfb, status, bytes: body.length, final: new URL(u).pathname };
  }
}

const calls = Math.max(3, Number(arg("calls", 3)));
const cap = Number(arg("cap", 75)) * 1000;
const t0 = performance.now();
const pages = [], skipped = [];
let slowest = 0; // the longest route so far: a route that cannot finish inside the cap is skipped, never cut short
for (const r of routes) {
  const rt0 = performance.now();
  if (rt0 - t0 + slowest > cap) { skipped.push(r.route); continue; }
  const url = base + r.path;
  const row = { route: r.route, url_path: r.path, door_slugs: r.doors ?? [], ttfb_ms: [], errors: 0, status: null, html_bytes: null, final_path: null };
  try {
    await fetchOnce(url); // warm-up, discarded
    for (let i = 0; i < calls; i++) {
      const x = await fetchOnce(url);
      row.status = x.status; row.final_path = x.final; row.html_bytes = x.bytes;
      // A redirect to the sign-in screen means the session was not accepted: that is an error, never a fast reading.
      if (x.status >= 400 || x.final.startsWith("/login")) { row.errors++; row.error = x.final.startsWith("/login") ? "redirected to /login (session not accepted)" : `HTTP ${x.status}`; }
      else row.ttfb_ms.push(Math.round(x.ttfb * 10) / 10);
    }
  } catch (e) { row.errors = calls; row.error = String(e?.message ?? e).slice(0, 160); }
  pages.push(row);
  slowest = Math.max(slowest, performance.now() - rt0);
}
const sorted = (a) => [...a].sort((x, y) => x - y);
console.table(pages.map((p) => ({ route: p.route, status: p.status, final: p.final_path, p50_ms: pct(sorted(p.ttfb_ms), 50), p95_ms: pct(sorted(p.ttfb_ms), 95), html_kb: p.html_bytes == null ? null : Math.round(p.html_bytes / 102.4) / 10, errors: p.errors, error: p.error ?? "" })));
if (skipped.length) console.log(`skipped (run cap ${cap / 1000} s): ${skipped.join(", ")}`);
console.log(`run took ${Math.round((performance.now() - t0) / 100) / 10} s`);
if (record && !dry) console.log("posted:", JSON.stringify((await rpc("perf_page_probe_report", { p_report: { sha: gitSha, base, seat_email: seatEmail, pages } })).results?.map((x) => `${x.slug}:${x.state}`)));
else if (skipped.length === 0) console.log("(not recorded: pass --record)");
