/**
 * scripts/access-matrix/check-org-ownership.ts
 *
 * Forcing tests for THE ORGANIZATION OWNERSHIP RULINGS (Arman, 2026-09-10 —
 * Data Doctrine R21, recorded in
 * common-docs/systems/platform/access/DECISIONS.md):
 *
 *   1. Exactly ONE owner per organization. `transfer_organization_ownership`
 *      promotes the new owner and demotes the outgoing owner to admin in the
 *      same step; no other path may mint a second owner.
 *   2. Organization delete is gated on the OWNER ROLE (iam.memberships), never
 *      on `created_by`. After a transfer the new owner deletes and the old one
 *      cannot.
 *   3. Admins add and remove admins and members. Only the owner is untouchable
 *      by admins.
 *   4. A user cannot leave, be removed from, or delete their LAST remaining
 *      organization.
 *
 * Every probe is a REAL PostgREST / RPC call with a REAL minted user JWT for a
 * REAL throwaway user created through the GoTrue admin API (which fires the
 * live signup trigger chain). No mocks, no manufactured rows in our own code
 * path. Fixtures are torn down in a finally block.
 *
 * Usage: pnpm check:org-ownership [--strict]
 *   exit 0  all cases hold, OR credentials absent (never a silent green:
 *           UNMEASURED is printed loudly)
 *   exit 1  a case failed and --strict
 *   exit 2  the harness itself could not run
 */

import { randomUUID } from "node:crypto";
import {
  baselineCount,
  C,
  loadEnv,
  mintUserJwt,
  type Env,
  type WriteRows,
} from "./lib";

const STRICT = process.argv.includes("--strict");

interface Result {
  label: string;
  expected: "refused" | "allowed";
  ok: boolean;
  detail: string;
}

const results: Result[] = [];

function record(
  label: string,
  expected: "refused" | "allowed",
  ok: boolean,
  detail: string,
) {
  results.push({ label, expected, ok, detail });
  const mark = ok ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`;
  console.log(`  ${mark}  ${label}\n        expected ${expected} — ${detail}`);
}

// ───────────────────────────── plumbing ─────────────────────────────

interface RpcProbe {
  status: number;
  ok: boolean;
  /** Parsed JSON body when the call succeeded. */
  data: unknown;
  /** DB error message when the call was refused. */
  error?: string;
  code?: string;
}

/** Call a public-schema RPC as a specific signed-in user (TRUE RLS path). */
async function rlsRpc(
  env: Env,
  jwt: string,
  fn: string,
  args: Record<string, unknown>,
): Promise<RpcProbe> {
  const res = await fetch(`${env.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.publishableKey,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Accept: "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 400);
    let code: string | undefined;
    try {
      const parsed = JSON.parse(text) as { message?: string; code?: string };
      if (parsed.message) message = parsed.message;
      code = parsed.code;
    } catch {
      /* non-JSON body — keep the raw text */
    }
    return { status: res.status, ok: false, data: null, error: message, code };
  }
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* empty body (void RPC) */
  }
  return { status: res.status, ok: true, data };
}

/** Service-key RPC/REST helpers — fixture setup only, never a probe. */
async function svcFetch(
  env: Env,
  path: string,
  init: RequestInit & { schema?: string } = {},
): Promise<Response> {
  const { schema, ...rest } = init;
  return fetch(`${env.url}/rest/v1/${path}`, {
    ...rest,
    headers: {
      apikey: env.secretKey,
      Authorization: `Bearer ${env.secretKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(schema ? { "Accept-Profile": schema, "Content-Profile": schema } : {}),
      ...(rest.headers ?? {}),
    },
  });
}

/** TRUE-RLS DELETE as a specific user. */
async function rlsDeleteRows(
  env: Env,
  jwt: string,
  schema: string,
  table: string,
  filter: string,
): Promise<WriteRows<{ id: string }>> {
  const res = await fetch(
    `${env.url}/rest/v1/${table}?${filter}&select=id`,
    {
      method: "DELETE",
      headers: {
        apikey: env.publishableKey,
        Authorization: `Bearer ${jwt}`,
        "Content-Profile": schema,
        "Accept-Profile": schema,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
    },
  );
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 400);
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      /* keep raw */
    }
    return { status: res.status, rows: 0, data: [], error: message };
  }
  let data: { id: string }[] = [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) data = parsed as { id: string }[];
  } catch {
    /* empty */
  }
  return { status: res.status, rows: data.length, data };
}

/**
 * THE FIXTURE PREFIX — the one string that makes this guard's litter findable.
 *
 * Every row this guard creates carries it: user emails are
 * `<prefix><tag>-<uuid8>@matrx-test.invalid`, and every organization's slug
 * starts with it (the ones we create explicitly AND the ones the signup trigger
 * auto-creates, because that slug is derived from the email local part).
 *
 * So a complete sweep is always two predicates, and they are the same two
 * `verifyNoFixturesRemain()` runs at the end of every run:
 *
 *   auth.users          where email like 'dd048-%@matrx-test.invalid'
 *   iam.organizations   where slug  like 'dd048-%'
 *
 * Never change this without changing the sweep, and never create a fixture row
 * that does not carry it.
 */
const FIXTURE_PREFIX = "dd048-";
const FIXTURE_EMAIL_DOMAIN = "@matrx-test.invalid";

/** TRUE-RLS rename of an organization as a specific user — the update door. */
async function rlsRename(
  env: Env,
  jwt: string,
  orgId: string,
  name: string,
): Promise<WriteRows<{ id: string }>> {
  const res = await fetch(
    `${env.url}/rest/v1/organizations?id=eq.${orgId}&select=id`,
    {
      method: "PATCH",
      headers: {
        apikey: env.publishableKey,
        Authorization: `Bearer ${jwt}`,
        "Content-Profile": "iam",
        "Accept-Profile": "iam",
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ name }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 400);
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      /* keep raw */
    }
    return { status: res.status, rows: 0, data: [], error: message };
  }
  let data: { id: string }[] = [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) data = parsed as { id: string }[];
  } catch {
    /* empty */
  }
  return { status: res.status, rows: data.length, data };
}

interface TestUser {
  id: string;
  email: string;
  jwt: string;
}

/**
 * Everything this run created, so teardown can reach ALL of it — including the
 * organizations the signup trigger makes on its own, which the first version of
 * this guard never even added to its cleanup list.
 */
const fixtures = {
  users: [] as TestUser[],
  orgs: new Set<string>(),
};

async function createUser(env: Env, tag: string): Promise<TestUser> {
  const email = `${FIXTURE_PREFIX}${tag}-${randomUUID().slice(0, 8)}${FIXTURE_EMAIL_DOMAIN}`;
  const res = await fetch(`${env.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: env.secretKey,
      Authorization: `Bearer ${env.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password: `Dd048!${randomUUID().slice(0, 12)}`,
      email_confirm: true,
      user_metadata: { display_name: `DD048 ${tag}` },
    }),
  });
  if (!res.ok) {
    throw new Error(`create user ${tag} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error(`create user ${tag} returned no id`);
  const jwt = await mintUserJwt(env, body.id);
  const user = { id: body.id, email, jwt };
  fixtures.users.push(user);
  // The signup trigger chain creates an organization for this user. It is a
  // fixture too — registering it here is what the first version of this guard
  // failed to do, which is most of why 34 organizations leaked into the shared
  // database before anyone noticed.
  for (const orgId of await svcOrgIds(env, user.id)) fixtures.orgs.add(orgId);
  return user;
}

/** Returns the HTTP status so a failed delete can never pass unnoticed. */
async function deleteUser(env: Env, userId: string): Promise<number> {
  const res = await fetch(`${env.url}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: env.secretKey, Authorization: `Bearer ${env.secretKey}` },
  });
  return res.status;
}

/** Create a normal (non-auto-created) organization as `user`, via the real RPC. */
async function createOrg(env: Env, user: TestUser, tag: string): Promise<string> {
  const slug = `${FIXTURE_PREFIX}${tag}-${randomUUID().slice(0, 8)}`;
  const probe = await rlsRpc(env, user.jwt, "org_create", {
    p_name: `DD048 ${tag}`,
    p_slug: slug,
  });
  if (!probe.ok) throw new Error(`org_create(${tag}) refused: ${probe.error}`);
  const org = probe.data as { id?: string } | null;
  if (!org?.id) throw new Error(`org_create(${tag}) returned no id`);
  fixtures.orgs.add(org.id);
  return org.id;
}

async function addMember(
  env: Env,
  actor: TestUser,
  orgId: string,
  target: TestUser,
  role: string,
): Promise<void> {
  const probe = await rlsRpc(env, actor.jwt, "mbr_add", {
    p_container_type: "organization",
    p_container_id: orgId,
    p_user_id: target.id,
    p_organization_id: orgId,
    p_role: role,
  });
  if (!probe.ok) throw new Error(`mbr_add(${role}) refused: ${probe.error}`);
}

/** Service-key soft-delete of a membership — fixture shaping, not a probe. */
async function svcDropMembership(env: Env, userId: string, orgId: string) {
  const res = await svcFetch(
    env,
    `memberships?container_type=eq.organization&container_id=eq.${orgId}&user_id=eq.${userId}&deleted_at=is.null&select=id`,
    { method: "PATCH", schema: "iam", body: JSON.stringify({ deleted_at: new Date().toISOString() }) },
  );
  if (!res.ok) throw new Error(`fixture drop membership -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Every live organization membership of a user (service key). */
async function svcOrgIds(env: Env, userId: string): Promise<string[]> {
  const res = await svcFetch(
    env,
    `memberships?container_type=eq.organization&user_id=eq.${userId}&deleted_at=is.null&status=eq.active&select=container_id`,
    { method: "GET", schema: "iam" },
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as { container_id: string }[];
  return rows.map((r) => r.container_id);
}

/** Returns the HTTP status so a failed delete can never pass unnoticed. */
async function svcDeleteOrg(env: Env, orgId: string): Promise<number> {
  const res = await svcFetch(env, `organizations?id=eq.${orgId}`, {
    method: "DELETE",
    schema: "iam",
  });
  return res.status;
}

/** Hard-delete every membership row of an organization (service key, fixtures only). */
async function svcPurgeMemberships(env: Env, orgId: string): Promise<number> {
  const res = await svcFetch(env, `memberships?container_id=eq.${orgId}`, {
    method: "DELETE",
    schema: "iam",
  });
  return res.status;
}

/**
 * TEARDOWN, AND THEN PROOF THAT IT WORKED.
 *
 * The first version of this guard tore down in a `finally` with a bare
 * `svcDeleteOrg` that never looked at the response, so every failure was
 * swallowed — and 34 organizations, 19 users and 50 memberships accumulated in
 * the ONE shared production database over four runs before an independent
 * verifier found them. The lesson is not "delete harder", it is: a cleanup that
 * does not VERIFY is not a cleanup.
 *
 * Returns the number of fixture rows still standing. Non-zero is a hard failure
 * of the whole run, whatever the probes said.
 */
async function teardownAndVerify(env: Env): Promise<number> {
  const problems: string[] = [];

  // Order matters: memberships (they FK the organization), then the users
  // (which cascades users.profiles, whose organization_id FK blocks the
  // organization delete), then the organizations themselves.
  for (const orgId of fixtures.orgs) {
    const st = await svcPurgeMemberships(env, orgId);
    if (st >= 300) problems.push(`memberships of org ${orgId} -> HTTP ${st}`);
  }
  for (const u of fixtures.users) {
    const st = await deleteUser(env, u.id);
    if (st >= 300) problems.push(`user ${u.email} -> HTTP ${st}`);
  }
  for (const orgId of fixtures.orgs) {
    const st = await svcDeleteOrg(env, orgId);
    if (st >= 300) problems.push(`org ${orgId} -> HTTP ${st}`);
  }

  // THE PROOF. Not "did my deletes return 2xx" — "is anything carrying the
  // fixture prefix still in the database".
  const orgsLeft = await baselineCount(
    env,
    "iam",
    "organizations",
    `slug=like.${FIXTURE_PREFIX}*`,
  );
  let usersLeft = 0;
  for (const u of fixtures.users) {
    const res = await fetch(`${env.url}/auth/v1/admin/users/${u.id}`, {
      headers: { apikey: env.secretKey, Authorization: `Bearer ${env.secretKey}` },
    });
    if (res.ok) usersLeft += 1;
  }

  const remaining = Math.max(orgsLeft, 0) + usersLeft;
  if (remaining === 0) {
    console.log(
      `${C.dim}  fixtures cleaned: ${fixtures.users.length} user(s), ${fixtures.orgs.size} organization(s) — verified zero remain.${C.reset}`,
    );
    return 0;
  }

  console.log("");
  console.log(
    `${C.red}${C.bold}ORG OWNERSHIP GUARD LEAKED FIXTURES INTO THE SHARED DATABASE${C.reset}`,
  );
  console.log(
    `  ${orgsLeft} organization(s) with a '${FIXTURE_PREFIX}' slug and ${usersLeft} '${FIXTURE_PREFIX}…${FIXTURE_EMAIL_DOMAIN}' user(s) are still live on brsgrqvjdzwihsvnfqkf.`,
  );
  for (const p of problems) console.log(`  - ${p}`);
  console.log(
    `  ${C.bold}Do not run this guard again until they are gone.${C.reset} A hard DELETE of an organization
` +
      `  walks 655 foreign keys (240 unindexed — FOUND_DEFECTS D307) and can exceed the HTTP
` +
      `  statement timeout, which is the usual cause. Sweep it from a direct psql/psycopg session
` +
      `  with statement_timeout = 0, using the two predicates at the top of this file:
` +
      `    delete from iam.memberships   where container_id in (select id from iam.organizations where slug like '${FIXTURE_PREFIX}%');
` +
      `    delete from auth.users        where email like '${FIXTURE_PREFIX}%${FIXTURE_EMAIL_DOMAIN}';
` +
      `    delete from iam.organizations where slug  like '${FIXTURE_PREFIX}%';
` +
      `  (Dependent rows that block those deletes are purged first by the same sweep — see the
` +
      `  DD-048 fix-round-1 report.)`,
  );
  return remaining;
}

// ───────────────────────────── the probes ─────────────────────────────

async function main(): Promise<number> {
  const env = loadEnv();
  if (!env) {
    console.log(
      `${C.yellow}${C.bold}ORG OWNERSHIP GUARD UNMEASURED${C.reset} — ` +
        `NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ` +
        `are not available, so NOTHING was checked. This is not a pass.`,
    );
    return 0;
  }

  console.log(`${C.bold}Organization ownership forcing tests (DD-048 / Doctrine R21)${C.reset}`);

  let leaked = 0;

  try {
    const owner = await createUser(env, "owner");
    const adminA = await createUser(env, "admina");
    const adminB = await createUser(env, "adminb");
    const joiner = await createUser(env, "joiner");

    // ── Fixture 1: a shared organization owned by `owner`, with two admins.
    const orgX = await createOrg(env, owner, "shared");
    await addMember(env, owner, orgX, adminA, "admin");
    await addMember(env, owner, orgX, adminB, "admin");

    // T1 — ONE OWNER: a second owner cannot be minted by a role update.
    {
      const p = await rlsRpc(env, owner.jwt, "mbr_update_role", {
        p_container_type: "organization",
        p_container_id: orgX,
        p_user_id: adminA.id,
        p_role: "owner",
      });
      // Assert the SENTENCE, not merely "it errored" — a refusal for the wrong
      // reason (a missing grant, say) must not read as a pass. That is exactly
      // the class of false pass this suite hit once already.
      const sentence =
        "An organization can have exactly one owner. Use Transfer ownership to hand it to someone else.";
      record(
        "two owners are impossible — mbr_update_role(target -> owner) as the owner",
        "refused",
        !p.ok && (p.error ?? "").includes(sentence),
        p.ok ? `ACCEPTED (status ${p.status}) — a second owner now exists` : `${p.error}`,
      );
      if (p.ok) {
        // Put the fixture back so the later cases still mean what they say.
        await rlsRpc(env, owner.jwt, "mbr_update_role", {
          p_container_type: "organization",
          p_container_id: orgX,
          p_user_id: adminA.id,
          p_role: "admin",
        });
      }
    }

    // T2 — ADMINS MANAGE ADMINS: adminA removes adminB.
    {
      const p = await rlsRpc(env, adminA.jwt, "mbr_remove", {
        p_container_type: "organization",
        p_container_id: orgX,
        p_user_id: adminB.id,
      });
      record(
        "an admin may remove another admin",
        "allowed",
        p.ok,
        p.ok ? `accepted (status ${p.status})` : `REFUSED — ${p.error}`,
      );
    }

    // T3 — THE OWNER IS UNTOUCHABLE BY ADMINS: adminA tries to remove the owner.
    {
      const p = await rlsRpc(env, adminA.jwt, "mbr_remove", {
        p_container_type: "organization",
        p_container_id: orgX,
        p_user_id: owner.id,
      });
      const sentence =
        "The owner can't be removed from their own organization. Transfer ownership first, then remove them.";
      record(
        "an admin may NOT remove the owner, and is told why in a sentence",
        "refused",
        !p.ok && (p.error ?? "").includes(sentence),
        p.ok ? `ACCEPTED (status ${p.status}) — the owner was removed by an admin` : `${p.error}`,
      );
    }

    // T4 — TRANSFER then DELETE: the delete right follows the OWNER ROLE.
    {
      const t = await rlsRpc(env, owner.jwt, "transfer_organization_ownership", {
        org_id: orgX,
        current_owner_id: owner.id,
        new_owner_id: adminA.id,
      });
      if (!t.ok) {
        record("ownership transfer succeeds", "allowed", false, `REFUSED — ${t.error}`);
      } else {
        record("ownership transfer succeeds", "allowed", true, `accepted (status ${t.status})`);

        // The outgoing owner must now be an admin — exactly one owner remains.
        const ownerRows = await svcFetch(
          env,
          `memberships?container_type=eq.organization&container_id=eq.${orgX}&role=eq.owner&deleted_at=is.null&status=eq.active&select=user_id`,
          { method: "GET", schema: "iam" },
        );
        const ownerList = ownerRows.ok
          ? ((await ownerRows.json()) as { user_id: string }[])
          : [];
        record(
          "after a transfer exactly ONE owner remains, and it is the new owner",
          "allowed",
          ownerList.length === 1 && ownerList[0]?.user_id === adminA.id,
          `owners after transfer: ${ownerList.length} (${ownerList.map((r) => r.user_id).join(", ") || "none"})`,
        );

        const oldOwnerDelete = await rlsDeleteRows(
          env,
          owner.jwt,
          "iam",
          "organizations",
          `id=eq.${orgX}`,
        );
        // A statement timeout means the policy ADMITTED the row and the cascade
        // ran — that is NOT a refusal, so it must not be counted as one.
        const oldOwnerRefused =
          oldOwnerDelete.rows === 0 &&
          !(oldOwnerDelete.error ?? "").includes("statement timeout");
        record(
          "the PREVIOUS owner cannot delete the organization after a transfer",
          "refused",
          oldOwnerRefused,
          oldOwnerRefused
            ? `no rows deleted${oldOwnerDelete.error ? ` — ${oldOwnerDelete.error}` : " (RLS filtered the row)"}`
            : oldOwnerDelete.rows > 0
              ? `DELETED ${oldOwnerDelete.rows} row(s) — created_by still rules`
              : `the policy ADMITTED the row (cascade timed out) — created_by still rules`,
        );

        if (oldOwnerRefused) {
          const newOwnerDelete = await rlsDeleteRows(
            env,
            adminA.jwt,
            "iam",
            "organizations",
            `id=eq.${orgX}`,
          );
          // A hard DELETE of an organization touches 655 foreign keys, 240 of
          // which have no leading index [live, 2026-09-11], so it can exceed the
          // PostgREST statement timeout. A TIMEOUT IS POSITIVE EVIDENCE the
          // DELETE policy ADMITTED the row — the engine only starts the cascade
          // for rows RLS let through; a policy refusal returns zero rows
          // instantly with no error. Both are counted as "allowed", and they are
          // reported differently so the cascade cost is never mistaken for a
          // passing authorization check.
          const admitted =
            newOwnerDelete.rows === 1 ||
            (newOwnerDelete.error ?? "").includes("statement timeout");
          record(
            "the NEW owner can delete the organization after a transfer",
            "allowed",
            admitted,
            newOwnerDelete.rows === 1
              ? "deleted 1 row"
              : admitted
                ? "policy ADMITTED the row (the cascade then hit the statement timeout — an indexing defect, not an access one)"
                : `deleted ${newOwnerDelete.rows} row(s)${newOwnerDelete.error ? ` — ${newOwnerDelete.error}` : " — refused with zero rows"}`,
          );
        }
      }
    }

    // ── T9..T12 — CHANGING THE ORGANIZATION follows the owner/admin ROLE.
    //    Same `created_by` class as delete, one policy over. Needs its own
    //    fixture because T4 destroyed orgX.
    {
      const orgR = await createOrg(env, owner, "rename");
      await addMember(env, owner, orgR, adminA, "admin");
      await addMember(env, owner, orgR, joiner, "member");
      // owner transfers to adminA: now adminA is owner, `owner` is an admin,
      // and `owner` is still the organization's created_by.
      const t = await rlsRpc(env, owner.jwt, "transfer_organization_ownership", {
        org_id: orgR,
        current_owner_id: owner.id,
        new_owner_id: adminA.id,
      });
      if (!t.ok) throw new Error(`fixture transfer for the rename cases failed: ${t.error}`);

      const byNewOwner = await rlsRename(env, adminA.jwt, orgR, "DD048 rename by new owner");
      record(
        "the NEW owner can rename the organization after a transfer",
        "allowed",
        byNewOwner.rows === 1,
        byNewOwner.rows === 1
          ? "updated 1 row"
          : `updated ${byNewOwner.rows} row(s)${byNewOwner.error ? ` — ${byNewOwner.error}` : " — refused, created_by still rules"}`,
      );

      // The previous owner is now an ADMIN, so under the ruling they may still
      // change settings — what must NOT happen is `created_by` granting it.
      // Demote them to member to isolate the authority question.
      const dem = await rlsRpc(env, adminA.jwt, "mbr_update_role", {
        p_container_type: "organization",
        p_container_id: orgR,
        p_user_id: owner.id,
        p_role: "member",
      });
      if (!dem.ok) throw new Error(`fixture demote for the rename cases failed: ${dem.error}`);

      const byCreator = await rlsRename(env, owner.jwt, orgR, "DD048 rename by creator");
      record(
        "the organization's CREATOR, now a plain member, can NOT rename it",
        "refused",
        byCreator.rows === 0,
        byCreator.rows === 0
          ? `no rows updated${byCreator.error ? ` — ${byCreator.error}` : " (RLS filtered the row)"}`
          : `UPDATED ${byCreator.rows} row(s) — created_by still rules`,
      );

      const byMember = await rlsRename(env, joiner.jwt, orgR, "DD048 rename by member");
      record(
        "a plain member can NOT rename the organization",
        "refused",
        byMember.rows === 0,
        byMember.rows === 0
          ? "no rows updated (RLS filtered the row)"
          : `UPDATED ${byMember.rows} row(s)`,
      );

      // Promote adminB into this org as an admin and prove an ADMIN may change it
      // (Arman: an admin "can make all kinds of changes to just about everything").
      await addMember(env, adminA, orgR, adminB, "admin");
      const byAdmin = await rlsRename(env, adminB.jwt, orgR, "DD048 rename by admin");
      record(
        "an ADMIN can rename the organization",
        "allowed",
        byAdmin.rows === 1,
        byAdmin.rows === 1
          ? "updated 1 row"
          : `updated ${byAdmin.rows} row(s)${byAdmin.error ? ` — ${byAdmin.error}` : " — refused"}`,
      );

      // T13 — DELETING an organization may not orphan ANOTHER member.
      // `joiner` is a member here and (after the fixture shaping below) has no
      // other organization; the owner adminA has their own, so the deleter is
      // NOT the orphan — which is exactly the hole the first cut left open.
      for (const oid of await svcOrgIds(env, joiner.id)) {
        if (oid !== orgR) await svcDropMembership(env, joiner.id, oid);
      }
      const del = await rlsDeleteRows(env, adminA.jwt, "iam", "organizations", `id=eq.${orgR}`);
      record(
        "an owner may NOT delete an organization that is another member's only one",
        "refused",
        del.rows === 0 && /no other organization and would be left with none/.test(del.error ?? ""),
        del.rows > 0
          ? `DELETED ${del.rows} row(s) — a member was orphaned`
          : `${del.error ?? "zero rows, no message (silent refusal)"}`,
      );

      // `joiner`'s memberships are re-shaped from scratch by Fixture 2 below,
      // so nothing to restore here.
    }

    // ── Fixture 2: `joiner` belongs to exactly two organizations, neither of
    //    them auto-created. (The auto-created one is dropped with the service
    //    key so the LAST-ORGANIZATION rule can be reached at all — with it in
    //    place the pre-existing personal-org guard answers first.)
    const orgY = await createOrg(env, owner, "orgy");
    const orgZ = await createOrg(env, owner, "orgz");
    await addMember(env, owner, orgY, joiner, "member");
    await addMember(env, owner, orgZ, joiner, "member");
    for (const oid of await svcOrgIds(env, joiner.id)) {
      if (oid !== orgY && oid !== orgZ) await svcDropMembership(env, joiner.id, oid);
    }
    const joinerOrgs = await svcOrgIds(env, joiner.id);
    if (joinerOrgs.length !== 2) {
      throw new Error(
        `fixture: joiner should belong to exactly 2 organizations, has ${joinerOrgs.length}`,
      );
    }

    // T5 — leaving a SECOND organization is allowed.
    {
      const p = await rlsRpc(env, joiner.jwt, "mbr_remove", {
        p_container_type: "organization",
        p_container_id: orgZ,
        p_user_id: joiner.id,
      });
      record(
        "a user may leave an organization while they still have another",
        "allowed",
        p.ok,
        p.ok ? `accepted (status ${p.status})` : `REFUSED — ${p.error}`,
      );
    }

    // T6 — leaving the LAST organization is refused, with a human sentence.
    {
      const p = await rlsRpc(env, joiner.jwt, "mbr_remove", {
        p_container_type: "organization",
        p_container_id: orgY,
        p_user_id: joiner.id,
      });
      const sentence = "You can't leave your only organization. Create or join another one first.";
      record(
        "a user may NOT leave their last organization, and is told why in a sentence",
        "refused",
        !p.ok && (p.error ?? "").includes(sentence),
        p.ok
          ? `ACCEPTED (status ${p.status}) — the user now belongs to no organization`
          : `${p.error}`,
      );
    }

    // T7 — an ADMIN may not remove a member out of their last organization either.
    {
      const stillIn = await svcOrgIds(env, joiner.id);
      if (stillIn.length === 1 && stillIn[0] === orgY) {
        const p = await rlsRpc(env, owner.jwt, "mbr_remove", {
          p_container_type: "organization",
          p_container_id: orgY,
          p_user_id: joiner.id,
        });
        const sentence =
          "This person can't be removed from their only organization. They need to join or create another one first.";
        record(
          "an owner/admin may NOT remove a member from that member's last organization",
          "refused",
          !p.ok && (p.error ?? "").includes(sentence),
          p.ok ? `ACCEPTED (status ${p.status})` : `${p.error}`,
        );
      } else {
        record(
          "an owner/admin may NOT remove a member from that member's last organization",
          "refused",
          false,
          `harness could not reach this case — joiner is in ${stillIn.length} organization(s)`,
        );
      }
    }
    // T8 — DELETING your last organization is refused, with a human sentence.
    {
      const solo = await createUser(env, "solo");
      const orgS = await createOrg(env, solo, "solo");
      for (const oid of await svcOrgIds(env, solo.id)) {
        if (oid !== orgS) await svcDropMembership(env, solo.id, oid);
      }
      const p = await rlsDeleteRows(env, solo.jwt, "iam", "organizations", `id=eq.${orgS}`);
      const sentence =
        "You can't delete your only organization. Create or join another one first.";
      record(
        "an owner may NOT delete their last organization, and is told why in a sentence",
        "refused",
        p.rows === 0 && (p.error ?? "").includes(sentence),
        p.rows > 0
          ? `DELETED ${p.rows} row(s) — the user now belongs to no organization`
          : `${p.error ?? "zero rows, no message (silent refusal)"}`,
      );
    }
  } catch (e) {
    console.error(`${C.red}harness error:${C.reset} ${(e as Error).message}`);
    leaked = await teardownAndVerify(env);
    return 2;
  } finally {
    if (leaked === 0) leaked = await teardownAndVerify(env);
  }

  const failed = results.filter((r) => !r.ok);
  console.log("");
  if (leaked > 0) {
    // A guard that dirties the shared database is a defect regardless of what
    // it proved. This is NOT gated on --strict: leaking is never advisory.
    console.log(
      `${C.red}${C.bold}ORG OWNERSHIP GUARD FAILED${C.reset} — ${leaked} fixture row(s) left behind (see above).` +
        (failed.length ? ` ${failed.length} case(s) also broke.` : ""),
    );
    for (const f of failed) console.log(`  - ${f.label} (expected ${f.expected}) — ${f.detail}`);
    return 1;
  }
  if (failed.length === 0) {
    console.log(`${C.green}${C.bold}ORG OWNERSHIP GUARD OK${C.reset} — ${results.length}/${results.length} cases hold.`);
    return 0;
  }
  console.log(
    `${C.red}${C.bold}ORG OWNERSHIP GUARD FAILED${C.reset} — ${failed.length} of ${results.length} cases broke:`,
  );
  for (const f of failed) console.log(`  - ${f.label} (expected ${f.expected}) — ${f.detail}`);
  return STRICT ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(2);
  },
);
