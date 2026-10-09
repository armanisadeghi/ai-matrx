#!/usr/bin/env npx tsx
/**
 * MAX-tier hold liveness — the reader for `ai.__cost_tier_hold_conformance()`.
 *
 * WHAT IT PROTECTS: trigger `ai._cost_tier_hold` on `ai.model_definition`. An agent
 * (or any non-person writer) moving a model's cost_rating into or out of the MAX
 * tier (6, "5+") is held for admin review; a person's own change and any change
 * that stays on one side of the line apply untouched.
 *
 * The function runs each case in a subtransaction it rolls back, so no row changes.
 * Dropped, disabled, or replaced with `return new`, the agent cases go red.
 *
 *   pnpm check:cost-tier-hold            # loud, exit 0
 *   pnpm check:cost-tier-hold:strict     # exit 1 on any finding or an unmeasured run
 *
 * UNMEASURED IS NOT PASSED: no credentials, an unreachable DB, an empty answer or a
 * missing case are all failures under --strict.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RPC = "__cost_tier_hold_conformance";
const STRICT = process.argv.includes("--strict");
const EXPECTED = [
  "agent_crossing_in_is_held",
  "agent_crossing_out_is_held",
  "agent_non_crossing_passes",
  "person_crossing_passes",
] as const;

function loadEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key = process.env.SUPABASE_SECRET_KEY ?? "";
  for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
    if (url && key) break;
    const p = resolve(ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (!m) continue;
      const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
      if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
      if (!key && m[1] === "SUPABASE_SECRET_KEY") key = v;
    }
  }
  return url && key ? { url, key } : null;
}

interface Row {
  check_key: string;
  ok: boolean;
  detail: unknown;
}

function isRow(v: unknown): v is Row {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.check_key === "string" && typeof r.ok === "boolean";
}

function unmeasured(reason: string): number {
  console.log(`[WARN] LIVE PULL FAILED - the MAX-tier hold is UNMEASURED: ${reason}`);
  return STRICT ? 1 : 0;
}

async function main(): Promise<number> {
  const env = loadEnv();
  if (!env) return unmeasured("no Supabase URL/secret key in env or .env* files");
  let rows: Row[];
  try {
    const res = await fetch(`${env.url.replace(/\/$/, "")}/rest/v1/rpc/${RPC}`, {
      method: "POST",
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
        "Content-Profile": "ai",
        "Accept-Profile": "ai",
      },
      body: "{}",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return unmeasured(`rpc/${RPC} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const parsed: unknown = JSON.parse(await res.text());
    if (!Array.isArray(parsed) || !parsed.every(isRow)) return unmeasured("unexpected rpc shape");
    rows = parsed;
  } catch (err) {
    return unmeasured(err instanceof Error ? err.message : String(err));
  }
  if (rows.length === 0) return unmeasured("zero rows - it measured nothing");

  const byKey = new Map(rows.map((r) => [r.check_key, r]));
  let bad = 0;
  for (const key of EXPECTED) {
    const row = byKey.get(key);
    if (!row) {
      console.log(`[FAIL] ${key} - not returned`);
      bad++;
    } else if (!row.ok) {
      console.log(`[FAIL] ${key} ${JSON.stringify(row.detail)}`);
      bad++;
    } else console.log(`[ OK ] ${key}`);
  }
  for (const r of rows) if (!(EXPECTED as readonly string[]).includes(r.check_key) && !r.ok) {
    console.log(`[FAIL] ${r.check_key} ${JSON.stringify(r.detail)}`);
    bad++;
  }
  if (bad > 0) console.log("MAX-tier hold is NOT LIVE: agents can cross the tier without review.");
  return bad > 0 && STRICT ? 1 : 0;
}

main().then(
  (code) => exitAfterDrain(code),
  (err) => {
    console.error("check-cost-tier-hold crashed:", err);
    exitAfterDrain(2);
  },
);
