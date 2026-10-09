// Shared bits for perf-data: env loading, sign-in, percentile, table printing, budget check.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, "../..");
export const budgets = JSON.parse(fs.readFileSync(path.join(here, "budgets.json"), "utf8"));

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}
export const env = { ...readEnv(path.join(root, "../aidream/.env")), ...readEnv(path.join(root, ".env.local")), ...process.env };

export const UA = "matrx-perf-data/1.0 (+scripts/perf-data)";

export function pct(sorted, p) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

export async function signIn() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !env.AI_ADMIN_USERNAME || !env.AI_ADMIN_PASSWORD) throw new Error("perf-data: Supabase url/key or the admin sign-in is missing from .env.local / aidream/.env");
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "User-Agent": UA, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`perf-data: sign-in failed (${r.status})`);
  return { url, key, token: j.access_token, email: j.user?.email };
}

export function table(rows, cols) {
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)));
  const line = (r) => cols.map((c, i) => String(r[c] ?? "").padEnd(w[i])).join("  ");
  console.log(line(Object.fromEntries(cols.map((c) => [c, c]))));
  console.log(w.map((n) => "-".repeat(n)).join("  "));
  for (const r of rows) console.log(line(r));
}

export const verdict = (value, budget) => (budget == null || Number.isNaN(value) ? "n/a" : value <= budget ? "pass" : "WARN");

/**
 * `--record`: post a report into the performance-watch history as source 'cli' with the git SHA,
 * through the service-only door ops.perf_cli_ingest (the service key comes from env and is never
 * printed). Door rows join the admin-seat door watch of the same label; page rows go to page:<name>.
 */
export async function recordReport(report) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("perf-data --record: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY is missing from .env.local / aidream/.env");
  const { execFileSync } = await import("node:child_process");
  let sha = null;
  try { sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { sha = null; }
  const r = await fetch(`${url}/rest/v1/rpc/perf_cli_ingest`, {
    method: "POST",
    headers: { "User-Agent": UA, apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Content-Profile": "ops", "Accept-Profile": "ops" },
    body: JSON.stringify({ p_report: { ...report, sha } }),
  });
  const text = await r.text();
  if (r.status >= 300) throw new Error(`perf-data --record: ops.perf_cli_ingest answered ${r.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}
