/**
 * scripts/access-matrix/lib.ts — shared plumbing for the Shared Knowledge
 * acceptance matrix (`pnpm check:access-matrix`) and the access drift guards
 * (`pnpm check:access-drift`). See scripts/access-matrix/FEATURE.md.
 *
 * Two probe channels, deliberately different:
 *   1. Kernel/judge probes — service-key RPC calls to the SECURITY DEFINER
 *      predicates (`has_access_as`, `can_read_processed_document`,
 *      `can_curate_library_document`, `access_matrix_tree`,
 *      `access_drift_report`).
 *   2. TRUE RLS probes — a REAL user JWT minted via the GoTrue admin API
 *      (generate_link -> verify), then PostgREST row counts as that user.
 *      This is what catches judge-yes/RLS-zero-rows contradictions (the
 *      rag.data_stores bug found 2026-07-23) — never simulated, never mocked.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

export interface Env {
  url: string;
  secretKey: string;
  publishableKey: string;
}

/** Reads .env* like scripts/check-migrations.ts. Returns null when absent. */
export function loadEnv(): Env | null {
  // ONE name for the URL — no second candidate, no fallback chain.
  // See common-docs/policies/package-vs-implementation.md
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
  let publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

  if (!url || !secretKey || !publishableKey) {
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (!secretKey && m[1] === "SUPABASE_SECRET_KEY") secretKey = v;
        if (!publishableKey && m[1] === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") publishableKey = v;
      }
      if (url && secretKey && publishableKey) break;
    }
  }
  if (!url || !secretKey || !publishableKey) return null;
  return { url: url.replace(/\/$/, ""), secretKey, publishableKey };
}

/** Call a public-schema RPC with the service key. Throws on HTTP failure. */
export async function rpc<T>(env: Env, fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${env.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.secretKey,
      Authorization: `Bearer ${env.secretKey}`,
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Accept: "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    throw new Error(`rpc ${fn} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Mint a REAL session JWT for a user via the GoTrue admin API. */
export async function mintUserJwt(env: Env, userId: string): Promise<string> {
  const userRes = await fetch(`${env.url}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: env.secretKey, Authorization: `Bearer ${env.secretKey}` },
  });
  if (!userRes.ok) throw new Error(`admin get user ${userId} -> ${userRes.status}`);
  const user = (await userRes.json()) as { email?: string };
  if (!user.email) throw new Error(`user ${userId} has no email — cannot mint JWT`);

  const linkRes = await fetch(`${env.url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: env.secretKey,
      Authorization: `Bearer ${env.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email: user.email }),
  });
  if (!linkRes.ok) throw new Error(`generate_link for ${user.email} -> ${linkRes.status}`);
  const link = (await linkRes.json()) as { hashed_token?: string };
  if (!link.hashed_token) throw new Error(`generate_link returned no hashed_token for ${user.email}`);

  const verifyRes = await fetch(`${env.url}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: env.publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }),
  });
  if (!verifyRes.ok) throw new Error(`verify magiclink for ${user.email} -> ${verifyRes.status}`);
  const session = (await verifyRes.json()) as { access_token?: string };
  if (!session.access_token) throw new Error(`verify returned no access_token for ${user.email}`);
  return session.access_token;
}

/**
 * TRUE-RLS row count over PostgREST as a specific user.
 * Returns -1 when the read itself errors (e.g. schema not exposed / USAGE
 * missing) — callers decide whether that is a finding.
 */
export async function rlsCount(
  env: Env,
  jwt: string,
  schema: string,
  table: string,
  filter?: string,
  countCol = "id",
): Promise<number> {
  // select one named column: select=* trips column-level privilege errors on
  // tables with per-column grants, and some tables (data_store_members) have
  // no id column — callers pass countCol for those.
  const qs = filter ? `?select=${countCol}&${filter}&limit=1` : `?select=${countCol}&limit=1`;
  const res = await fetch(`${env.url}/rest/v1/${table}${qs}`, {
    headers: {
      apikey: env.publishableKey,
      Authorization: `Bearer ${jwt}`,
      "Accept-Profile": schema,
      Prefer: "count=exact",
    },
  });
  if (!res.ok && res.status !== 206) return -1;
  const cr = res.headers.get("content-range"); // e.g. "0-0/123" or "*/0"
  const total = cr?.split("/")[1];
  if (total === undefined || total === "*") return -1;
  return Number(total);
}

/** Service-key (RLS-bypassing) baseline count — "how many rows exist at all". */
export async function baselineCount(
  env: Env,
  schema: string,
  table: string,
  filter?: string,
  countCol = "id",
): Promise<number> {
  const qs = filter ? `?select=${countCol}&${filter}&limit=1` : `?select=${countCol}&limit=1`;
  const res = await fetch(`${env.url}/rest/v1/${table}${qs}`, {
    headers: {
      apikey: env.secretKey,
      Authorization: `Bearer ${env.secretKey}`,
      "Accept-Profile": schema,
      Prefer: "count=exact",
    },
  });
  if (!res.ok && res.status !== 206) return -1;
  const total = res.headers.get("content-range")?.split("/")[1];
  if (total === undefined || total === "*") return -1;
  return Number(total);
}
