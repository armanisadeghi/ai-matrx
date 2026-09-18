#!/usr/bin/env tsx
/**
 * Refresh the live-DB truth snapshot → scripts/schema-check/current-schema.json.
 *
 * The FE has no direct Postgres connection (PostgREST only), so it pulls truth
 * from the read-only `public.schema_truth_snapshot()` RPC (migration
 * `schema_truth_snapshot_rpc.sql`) — structural metadata only, no row data. Same
 * live DB the aidream backend reads, so the two snapshots agree.
 *
 *   pnpm check:schema:snapshot       # pull live, rewrite the snapshot
 *
 * ONE source, no fallback. If the RPC cannot be reached, refuses, or answers
 * without a snapshot, this exits non-zero with the cause and the remedy and
 * writes NOTHING — the committed snapshot stays exactly as it was. Until
 * 2026-09-14 a refused RPC (42501, wrong key) wrote the older aidream snapshot
 * (fewer tables, no exposed schemas) and exited 0, which made
 * entity-registry-drift report 17 live tables as dead.
 * Guard: snapshot-source.test.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveSupabaseEnv, type SupabaseEnv } from "./supabase-env";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "scripts/schema-check/current-schema.json";
const OUT = resolve(ROOT, OUT_REL);
const C = { reset: "\x1b[0m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", cyan: "\x1b[36m" };

type LiveSnapshot = {
  generated_at: string;
  project: string;
  source: string;
  exposed_schemas: string[];
  schemas: Record<string, string[]>;
  views: Record<string, string[]>;
};

class RefreshError extends Error {
  constructor(
    readonly cause_: string,
    readonly remedy: string,
  ) {
    super(cause_);
  }
}

function loadEnv(): SupabaseEnv {
  // ONE name for the URL — no second candidate, no fallback chain.
  // See common-docs/policies/package-vs-implementation.md
  // Key precedence is by name (secret → publishable), never by line order — see supabase-env.ts.
  const files = [".env.local", ".env.production.local", ".env.production", ".env"]
    .map((f) => resolve(ROOT, f))
    .filter((p) => existsSync(p))
    .map((p) => readFileSync(p, "utf8"));
  const env = resolveSupabaseEnv(process.env, files);
  if (!env) {
    throw new RefreshError(
      "no NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY in the environment or .env* files",
      "set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local",
    );
  }
  if (env.keyName !== "SUPABASE_SECRET_KEY") {
    throw new RefreshError(
      `only ${env.keyName} is set — schema_truth_snapshot() is granted to service_role only, so it would be refused (42501)`,
      "set SUPABASE_SECRET_KEY in .env.local",
    );
  }
  return env;
}

async function pullViaRpc(url: string, key: string): Promise<LiveSnapshot> {
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/rpc/schema_truth_snapshot`;
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Profile": "public",
        "Accept-Profile": "public",
      },
      body: "{}",
    });
  } catch (err) {
    throw new RefreshError(
      `could not reach ${endpoint}: ${String(err)}`,
      "check the network and NEXT_PUBLIC_SUPABASE_URL, then re-run pnpm check:schema:snapshot",
    );
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    const refused = res.status === 401 || res.status === 403 || body.includes("42501");
    throw new RefreshError(
      `RPC schema_truth_snapshot answered ${res.status}: ${body}`,
      refused
        ? "the key is not service_role — set SUPABASE_SECRET_KEY in .env.local to the project's secret key"
        : "confirm public.schema_truth_snapshot() exists on the live DB (migrations/schema_truth_snapshot_rpc.sql) and NEXT_PUBLIC_SUPABASE_URL is right",
    );
  }
  const snap = (await res.json()) as Partial<LiveSnapshot> | null;
  const isRecord = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
  if (
    !snap ||
    typeof snap.generated_at !== "string" ||
    !isRecord(snap.schemas) ||
    Object.keys(snap.schemas!).length === 0 ||
    !isRecord(snap.views) ||
    !Array.isArray(snap.exposed_schemas)
  ) {
    throw new RefreshError(
      "RPC schema_truth_snapshot answered without generated_at / schemas / views / exposed_schemas",
      "the live function no longer returns the snapshot shape — fix public.schema_truth_snapshot(), never hand-edit the snapshot",
    );
  }
  return snap as LiveSnapshot;
}

function write(snap: LiveSnapshot): void {
  const nTables = Object.values(snap.schemas).reduce((a, v) => a + v.length, 0);
  const payload = {
    _comment:
      "LIVE schema snapshot (tables + views + PostgREST-exposed schemas) — the truth scripts/schema-check diffs the code against. AUTOGENERATED by `pnpm check:schema:refresh` (pulls public.schema_truth_snapshot()). Do NOT hand-edit — refresh it.",
    generated_at: snap.generated_at,
    project: snap.project,
    source: snap.source,
    exposed_schemas: snap.exposed_schemas,
    schemas: snap.schemas,
    views: snap.views,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(
    `${C.green}✓${C.reset} snapshot written → ${C.cyan}${OUT_REL}${C.reset}  ` +
      `${C.dim}(${Object.keys(snap.schemas).length} schemas, ${nTables} tables, ${snap.exposed_schemas.length} exposed; generated_at ${snap.generated_at})${C.reset}`,
  );
}

async function main(): Promise<number> {
  try {
    const env = loadEnv();
    write(await pullViaRpc(env.url, env.key));
    return 0;
  } catch (err) {
    if (!(err instanceof RefreshError)) throw err;
    console.error(
      `${C.red}[FAIL]${C.reset} schema snapshot NOT refreshed — ${err.cause_}\n` +
        `       remedy: ${err.remedy}\n` +
        `       Nothing was written; ${OUT_REL} is unchanged.`,
    );
    return 1;
  }
}

main().then((code) => process.exit(code));
