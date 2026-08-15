/**
 * scripts/access-matrix/check-governance-tier.ts
 *
 * Acceptance probe for THE GOVERNANCE-COLUMN TIER — the column axis of the
 * tiered access model (viewer < editor < admin). See
 * common-docs/systems/access-architecture/FEATURE.md §2.6 and
 * migrations/iam_governance_column_tier.sql (FOUND_DEFECTS D119).
 *
 * It asserts BOTH halves, because over-tightening is a defect too (db-rules §6):
 *   1. An `editor` sharee CANNOT change who can reach the row —
 *      `visibility`, `created_by`, or an already-owned `organization_id`.
 *   2. That same editor CAN still do all their real work — rename, edit the
 *      body, edit metadata, trash and un-trash.
 *   3. The owner and an `admin` grantee CAN govern.
 *
 * Every probe is a REAL PostgREST write with a REAL minted user JWT — the exact
 * path a sharee would use to walk around a UI-only check. No mocks, ever.
 * Fixtures are created with the service key and deleted in a finally block.
 *
 * Usage: pnpm check:governance-tier [--strict]
 */

import { C, loadEnv, mintUserJwt, rlsPatch, type Env, type WriteProbe } from "./lib";

const STRICT = process.argv.includes("--strict");

const SCHEMA = "workbench";
const TABLE = "working_documents";
const TOKEN = "working_document";
const OWNER_EMAIL = "admin@admin.com";
const SHAREE_EMAIL = "test@test.com";

interface Result {
  label: string;
  expected: "refused" | "allowed";
  ok: boolean;
  detail: string;
}

const results: Result[] = [];

async function svc<T>(
  env: Env,
  path: string,
  init: RequestInit & { schema?: string } = {},
): Promise<T> {
  const { schema, ...rest } = init;
  const res = await fetch(`${env.url}/rest/v1/${path}`, {
    ...rest,
    headers: {
      apikey: env.secretKey,
      Authorization: `Bearer ${env.secretKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(schema ? { "Content-Profile": schema, "Accept-Profile": schema } : {}),
      ...(rest.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

function record(label: string, expected: Result["expected"], probe: WriteProbe): void {
  const refused = probe.error !== undefined;
  const ok = expected === "refused" ? refused : !refused && probe.rows > 0;
  const detail = refused ? `${probe.status} ${probe.error}` : `${probe.status}, ${probe.rows} row(s)`;
  results.push({ label, expected, ok, detail });
  const tag = ok ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`;
  console.log(`  [${tag}] ${label.padEnd(46)} expected ${expected.padEnd(7)} — ${C.dim}${detail}${C.reset}`);
}

async function userIdByEmail(env: Env, email: string): Promise<string> {
  const rows = await svc<Array<{ id: string }>>(
    env,
    `rpc/admin_find_user_by_email`,
    { method: "POST", body: JSON.stringify({ p_email: email }) },
  ).catch(() => null as unknown as Array<{ id: string }>);
  if (rows && rows.length > 0 && rows[0]?.id) return rows[0].id;

  // Fall back to the GoTrue admin list — admin_find_user_by_email is
  // super-admin-gated and the service key is not an admin *user*.
  const res = await fetch(
    `${env.url}/auth/v1/admin/users?page=1&per_page=200&filter=${encodeURIComponent(email)}`,
    { headers: { apikey: env.secretKey, Authorization: `Bearer ${env.secretKey}` } },
  );
  if (!res.ok) throw new Error(`admin list users -> ${res.status}`);
  const body = (await res.json()) as { users?: Array<{ id: string; email?: string }> };
  const hit = (body.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!hit) throw new Error(`no auth user for ${email}`);
  return hit.id;
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env) {
    console.log(`${C.yellow}check:governance-tier skipped — Supabase env not found.${C.reset}`);
    return;
  }

  const ownerId = await userIdByEmail(env, OWNER_EMAIL);
  const shareeId = await userIdByEmail(env, SHAREE_EMAIL);
  const orgs = await svc<Array<{ id: string; created_by: string }>>(
    env,
    `organizations?select=id,created_by&is_personal=is.true&created_by=in.(${ownerId},${shareeId})`,
    { schema: "iam" },
  );
  const ownerOrg = orgs.find((o) => o.created_by === ownerId)?.id;
  const shareeOrg = orgs.find((o) => o.created_by === shareeId)?.id;
  if (!ownerOrg || !shareeOrg) throw new Error("could not resolve both personal orgs");

  const shareeJwt = await mintUserJwt(env, shareeId);
  const ownerJwt = await mintUserJwt(env, ownerId);

  const [doc] = await svc<Array<{ id: string }>>(env, TABLE, {
    schema: SCHEMA,
    method: "POST",
    body: JSON.stringify({
      title: "governance-tier probe",
      created_by: ownerId,
      organization_id: ownerOrg,
      visibility: "personal",
    }),
  });
  const docId = doc?.id;
  if (!docId) throw new Error("fixture insert returned no id");

  let grantId: string | undefined;
  try {
    const [grant] = await svc<Array<{ id: string }>>(env, "permissions", {
      schema: "iam",
      method: "POST",
      body: JSON.stringify({
        resource_type: TOKEN,
        resource_id: docId,
        granted_to_user_id: shareeId,
        permission_level: "editor",
        status: "active",
        created_by: ownerId,
      }),
    });
    grantId = grant?.id;

    const f = `id=eq.${docId}`;
    const asSharee = (patch: Record<string, unknown>) =>
      rlsPatch(env, shareeJwt, SCHEMA, TABLE, f, patch);
    const asOwner = (patch: Record<string, unknown>) =>
      rlsPatch(env, ownerJwt, SCHEMA, TABLE, f, patch);

    console.log(`\n${C.bold}EDITOR — may not govern${C.reset}`);
    record("editor: visibility -> public", "refused", await asSharee({ visibility: "public" }));
    record("editor: created_by -> self", "refused", await asSharee({ created_by: shareeId }));
    record("editor: organization_id -> own org", "refused", await asSharee({ organization_id: shareeOrg }));

    console.log(`\n${C.bold}EDITOR — may still work${C.reset}`);
    record("editor: rename", "allowed", await asSharee({ title: "renamed by editor" }));
    record("editor: edit content", "allowed", await asSharee({ content: "edited by editor" }));
    record("editor: edit metadata", "allowed", await asSharee({ metadata: { probe: true } }));
    record("editor: trash", "allowed", await asSharee({ deleted_at: new Date().toISOString() }));
    record("editor: un-trash", "allowed", await asSharee({ deleted_at: null }));

    console.log(`\n${C.bold}OWNER — governs${C.reset}`);
    record("owner: visibility -> public", "allowed", await asOwner({ visibility: "public" }));
    record("owner: visibility -> personal", "allowed", await asOwner({ visibility: "personal" }));
    record("owner: created_by is never transferable", "refused", await asOwner({ created_by: shareeId }));

    console.log(`\n${C.bold}ADMIN grantee — governs${C.reset}`);
    if (grantId) {
      await svc(env, `permissions?id=eq.${grantId}`, {
        schema: "iam",
        method: "PATCH",
        body: JSON.stringify({ permission_level: "admin" }),
      });
    }
    record("admin: visibility -> public", "allowed", await asSharee({ visibility: "public" }));
    record("admin: organization_id -> own org", "allowed", await asSharee({ organization_id: shareeOrg }));
    record("admin: created_by still refused", "refused", await asSharee({ created_by: shareeId }));
  } finally {
    if (grantId) {
      await svc(env, `permissions?id=eq.${grantId}`, { schema: "iam", method: "DELETE" }).catch(() => {});
    }
    await svc(env, `${TABLE}?id=eq.${docId}`, { schema: SCHEMA, method: "DELETE" }).catch(() => {});
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${C.bold}${results.length - failed.length}/${results.length} probes passed${C.reset}`,
  );
  if (failed.length > 0) {
    console.log(
      `\n${C.red}${C.bold}THE GOVERNANCE-COLUMN TIER IS BROKEN${C.reset} — ${failed.length} probe(s) failed.`,
    );
    console.log(
      `${C.dim}A "refused" failure means an editor can govern access. An "allowed" failure means a legitimate editor is blocked — equally serious (db-rules §6).${C.reset}`,
    );
    console.log(
      `${C.dim}Repair: re-run the sweep — select iam.sweep_governance_guards(); then re-check.${C.reset}`,
    );
    if (STRICT) process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  console.error(`${C.red}check:governance-tier errored:${C.reset}`, e);
  if (STRICT) process.exitCode = 1;
});
