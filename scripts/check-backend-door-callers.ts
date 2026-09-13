#!/usr/bin/env npx tsx
/**
 * `pnpm check:backend-door-callers` — a SECURITY DEFINER door that the SERVER
 * itself calls must not refuse the server.
 *
 * THE DEFECT THIS GATE EXISTS FOR (live, 2026-09-13)
 * --------------------------------------------------
 * `migrations/dd169_batch3_signed_in_gates.sql` gave `public.lookup_user_by_email`
 * the gate `if auth.uid() is null then raise 42501`. That predicate does not mean
 * "nobody is signed in" — it is ALSO true for every trusted server-side caller,
 * because none of them carry an end-user JWT: the `sb_secret_*` service key over
 * PostgREST, and every direct Postgres connection (aidream's matrx-orm, the
 * migration runners, this repo's scripts).
 *
 * From 08:45 UTC that day every agent feedback submission failed — the MCP path
 * resolves its service account through that RPC on the admin client, and the
 * 42501 surfaced to agents as "the agent service account … was not found".
 * `seo.fn_upsert_keyword` carried the identical gate and closed aidream's keyword
 * intake the same way, silently.
 *
 * WHAT IT CHECKS (both halves, against the LIVE database)
 * ------------------------------------------------------
 *  1. END TO END: the real attribution path — the real service key, the real
 *     RPC, the real `claude-01@aimatrx.com` row. Green only if an agent could
 *     actually file feedback right now.
 *  2. THE CLASS: for every door in REGISTRY (a definer function with a real
 *     server-side call site), the live body must not carry a signed-in refusal
 *     without the canonical `iam.is_trusted_backend()` exemption beside it.
 *
 * There is no mock and no fixture here: with the migration reverted, half 1
 * fails with the verbatim 42501 and half 2 names the body that lost the
 * exemption.
 *
 * USAGE
 *   pnpm check:backend-door-callers
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", x: "\x1b[0m" };

/** Every definer door a SERVER-SIDE caller reaches, with that caller named. */
const REGISTRY: ReadonlyArray<{
  schema: string;
  fn: string;
  caller: string;
}> = [
  {
    schema: "public",
    fn: "lookup_user_by_email",
    caller:
      "lib/services/agent-feedback.service.ts (admin client) — resolves the agent service account for every MCP/REST feedback submission",
  },
  {
    schema: "seo",
    fn: "fn_upsert_keyword",
    caller:
      "aidream packages/matrx-seo/matrx_seo/orm_identity.py (direct Postgres connection) — THE keyword intake path",
  },
];

/** The account agent feedback is attributed to when the caller is not a Matrx user. */
const AGENT_SERVICE_ACCOUNT_EMAIL = "claude-01@aimatrx.com";

function loadEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) {
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (!key && m[1] === "SUPABASE_SECRET_KEY") key = v;
      }
      if (url && key) break;
    }
  }
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

async function rpc(
  env: { url: string; key: string },
  name: string,
  body: Record<string, unknown>,
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${env.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
      "Content-Type": "application/json",
      "Content-Profile": "public",
      "Accept-Profile": "public",
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

async function door(
  env: { url: string; key: string },
  sql: string,
): Promise<Array<Record<string, unknown>>> {
  const res = await rpc(env, "execute_admin_query", { query: sql });
  if (res.status !== 200) throw new Error(`execute_admin_query ${res.status}: ${res.text.slice(0, 600)}`);
  const payload = JSON.parse(res.text) as unknown;
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (payload && typeof payload === "object" && Array.isArray((payload as { result?: unknown[] }).result)) {
    return (payload as { result: Array<Record<string, unknown>> }).result;
  }
  return [];
}

/**
 * The pure detector, exported so it can be reasoned about (and fed a body) without
 * the database: a body that refuses on a missing session, with no trusted-backend
 * exemption beside it, refuses the server too.
 */
export function refusesTheServer(prosrc: string): boolean {
  const src = prosrc.toLowerCase();
  const refusesWithoutSession = /auth\.uid\(\)\s+is\s+null/.test(src);
  const admitsTheServer =
    src.includes("is_trusted_backend") ||
    src.includes("service_role");
  return refusesWithoutSession && !admitsTheServer;
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env) {
    console.error(
      `${C.r}check:backend-door-callers cannot run: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY were not found in the environment or in .env.local${C.x}`,
    );
    process.exit(1);
  }

  const failures: string[] = [];

  // ── 1. End to end: the real agent-feedback attribution lookup ─────────────
  const lookup = await rpc(env, "lookup_user_by_email", {
    lookup_email: AGENT_SERVICE_ACCOUNT_EMAIL,
  });
  if (lookup.status !== 200) {
    failures.push(
      `the agent service account cannot be resolved with the service key: ` +
        `POST /rpc/lookup_user_by_email returned ${lookup.status} ${lookup.text.slice(0, 400)} — ` +
        `every agent feedback submission fails with "the agent service account ${AGENT_SERVICE_ACCOUNT_EMAIL} was not found"`,
    );
  } else {
    const rows = JSON.parse(lookup.text) as Array<{ user_id?: string }>;
    if (!Array.isArray(rows) || !rows[0]?.user_id) {
      failures.push(
        `lookup_user_by_email('${AGENT_SERVICE_ACCOUNT_EMAIL}') returned no user to the service key: ${lookup.text.slice(0, 400)}`,
      );
    } else {
      console.log(
        `${C.g}✓${C.x} agent service account resolves for the server: ${AGENT_SERVICE_ACCOUNT_EMAIL} → ${rows[0].user_id}`,
      );
    }
  }

  // ── 2. The class: no registered backend door refuses the server ───────────
  const bodies = await door(
    env,
    `select n.nspname as schema_name, p.proname as fn, p.prosrc as prosrc
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where (n.nspname, p.proname) in (${REGISTRY.map((r) => `('${r.schema}','${r.fn}')`).join(",")})`,
  );
  for (const entry of REGISTRY) {
    const row = bodies.find(
      (b) => b.schema_name === entry.schema && b.fn === entry.fn,
    );
    if (!row) {
      failures.push(
        `${entry.schema}.${entry.fn} is registered as server-called but does not exist in the live database`,
      );
      continue;
    }
    if (refusesTheServer(String(row.prosrc ?? ""))) {
      failures.push(
        `${entry.schema}.${entry.fn} refuses a caller with no auth.uid() and has no iam.is_trusted_backend() exemption — ` +
          `its server-side caller is ${entry.caller}`,
      );
    } else {
      console.log(`${C.g}✓${C.x} ${entry.schema}.${entry.fn} admits the server (${C.d}${entry.caller}${C.x})`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n${C.r}${C.b}check:backend-door-callers FAILED${C.x}`);
    for (const f of failures) console.error(`  ${C.r}✗${C.x} ${f}`);
    console.error(
      `\nFix: put \`and not iam.is_trusted_backend()\` beside the \`auth.uid() is null\` refusal ` +
        `(see migrations/dd169_batch3_trusted_backend_callers.sql). A bare session check also refuses ` +
        `the service key and every direct connection.`,
    );
    process.exit(1);
  }
  console.log(`\n${C.g}${C.b}check:backend-door-callers passed${C.x} (${REGISTRY.length} server-called doors)`);
}

main().catch((e) => {
  console.error(`${C.r}check:backend-door-callers crashed:${C.x}`, e);
  process.exit(1);
});
