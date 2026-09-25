/**
 * A MANDATE LIST NEVER UNDER-COUNTS THE WORKSPACES YOU BELONG TO.
 *
 * Review 2026-09-25: test@test.com is a member of 12 workspaces — one of them another
 * person's personal workspace ("admin's Workspace", slug `admin`). The new lists
 * (/mandates/list-preview, /organizations/admin/mandates) said "My Orgs 0 / No mandates
 * here" while the original /mandates showed every one of those mandates, because the `orgs`
 * scope threw away every row homed in ANY personal workspace. Membership is access.
 *
 * What this proves, from the seat the person really has (`role authenticated`,
 * `request.jwt.claims` = test@test.com), through `public.mnd_member_list`:
 *
 *   person level  `orgs` count = every live mandate the seat can read that is homed in one
 *                 of its organizations (not the system, not its own personal home) or
 *                 granted to one of them — counted independently, straight off the table.
 *   org level     for EVERY organization the seat belongs to, `orgs` count = the live
 *                 mandates homed in that organization or granted to it.
 *   page = count  the page's `total` under scope `orgs` equals the `orgs` count.
 *   narrowing     no narrowing option names another person's personal workspace.
 *
 * Read-only; runs inside a transaction that is rolled back.
 * UNMEASURED IS NOT PASSED: no credentials or an unreachable database is a FAILURE.
 *
 *   pnpm check:mandate-member-counts
 */

import type pg from "pg";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

const VIEWER_EMAIL = "test@test.com";

function fail(message: string): never {
  console.error(`[FAIL] ${message}`);
  exitAfterDrain(1);
}

async function asSeat(client: pg.Client, uid: string): Promise<void> {
  await client.query(`reset role`);
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);
  await client.query(`set local role authenticated`);
}

interface Counts {
  orgs: number;
  orgs_narrow: { id: string; label: string; count: number }[];
}

const LIVE = `m.deleted_at is null
  and coalesce(m.metadata->>'migration_status', '') <> 'placeholder'`;

const GRANTED_TO = (orgExpr: string) => `exists (
  select 1 from iam.permissions p
   where p.resource_type = 'mandate' and p.resource_id = m.id
     and p.granted_to_organization_id ${orgExpr}
     and p.status <> 'rejected'
     and (p.expires_at is null or p.expires_at > now()))`;

async function main(): Promise<void> {
  const env = loadDbEnv();
  if (!("host" in env))
    fail("UNMEASURED: no database credentials. A guard that cannot measure has not passed.");
  const client = await connectDirect(env, "check-mandate-member-counts").catch(
    (error: unknown) =>
      fail(`database unreachable: ${error instanceof Error ? error.message : String(error)}`),
  );
  const problems: string[] = [];
  try {
    await client.query("begin");
    const who = await client.query<{ id: string }>(
      `select id from auth.users where email = $1`,
      [VIEWER_EMAIL],
    );
    const uid = who.rows[0]?.id;
    if (!uid) fail(`${VIEWER_EMAIL} does not exist`);
    const sys = await client.query<{ organization_id: string }>(
      `select organization_id from iam.system_orgs where key = 'system'`,
    );
    const systemOrg = sys.rows[0]!.organization_id;

    await asSeat(client, uid);

    // ── person level ────────────────────────────────────────────────────────
    const expectedPerson = await client.query<{ n: string }>(
      `select count(*)::text as n from mandate.definition m
        left join iam.organizations o on o.id = m.organization_id
        where ${LIVE} and m.organization_id <> $1
          and ((m.organization_id in (select iam.my_orgs())
                and not (coalesce(o.is_personal, false) and m.created_by = $2))
               or ${GRANTED_TO("in (select iam.my_orgs())")})`,
      [systemOrg, uid],
    );
    const person = await client.query<{ out: Counts }>(
      `select public.mnd_member_list('counts', 'person', 'orgs') as out`,
    );
    const personPage = await client.query<{ out: { total: number } }>(
      `select public.mnd_member_list('page', 'person', 'orgs', null, null, null, '{}'::jsonb,
                                     'name', 'asc', 1, 0) as out`,
    );
    const want = Number(expectedPerson.rows[0]!.n);
    const got = person.rows[0]!.out.orgs;
    console.log(`person · orgs: expected ${want}, list says ${got}, page total ${personPage.rows[0]!.out.total}`);
    if (want === 0) problems.push("the probe viewer has no organization mandates — the check measures nothing");
    if (got !== want) problems.push(`person-level orgs count ${got} ≠ ${want} readable mandates homed in or granted to the viewer's organizations`);
    if (personPage.rows[0]!.out.total !== got)
      problems.push(`person-level page total ${personPage.rows[0]!.out.total} ≠ orgs count ${got}`);

    const personalOrgs = await client.query<{ id: string; name: string }>(
      `select o.id, o.name from iam.organizations o
        where o.is_personal and o.id in (select iam.my_orgs())`,
    );
    for (const option of person.rows[0]!.out.orgs_narrow) {
      const named = personalOrgs.rows.find((o) => o.id === option.id && option.label === o.name);
      if (named) problems.push(`narrowing names a personal workspace: "${option.label}"`);
    }

    // ── organization level, for every organization the viewer belongs to ────
    const orgs = await client.query<{ id: string; name: string }>(
      `select o.id, o.name from iam.organizations o where o.id in (select iam.my_orgs())`,
    );
    for (const org of orgs.rows) {
      const expected = await client.query<{ n: string }>(
        `select count(*)::text as n from mandate.definition m
          where ${LIVE} and m.organization_id <> $2
            and (m.organization_id = $1 or ${GRANTED_TO("= $1")})`,
        [org.id, systemOrg],
      );
      const answer = await client.query<{ out: Counts }>(
        `select public.mnd_member_list('counts', 'organization', 'orgs', $1::uuid) as out`,
        [org.id],
      );
      const e = Number(expected.rows[0]!.n);
      const g = answer.rows[0]!.out.orgs;
      if (e !== g) problems.push(`organization "${org.name}" (${org.id}): orgs count ${g} ≠ ${e} mandates homed in or granted to it`);
      else if (e > 0) console.log(`org "${org.name}" · orgs: ${g}`);
    }
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end();
  }
  if (problems.length) {
    for (const p of problems) console.error(`[FAIL] ${p}`);
    exitAfterDrain(1);
  }
  console.log("[PASS] mandate member counts match what the viewer belongs to");
  exitAfterDrain(0);
}

void main();
