/**
 * ONLY A MANDATE'S OWNER CHANGES IT — AND THE DATABASE SAYS SO, NOT ONLY THE SERVER.
 *
 * The server's owner rule (aidream `services/mandates/owner_access.py`, 2026-09-25): a super
 * admin maintains platform mandates; anyone else may change a mandate's definition only when it
 * is SOFT (`origin = 'user'`), NOT homed in the Matrx System organization, and they hold `admin`
 * on it through the one access answer (`iam.has_access_for` — the creator, or an owner/admin of
 * its home organization). Bindings: an ORG binding only by an owner/admin of that organization,
 * a USER binding only by that user, a GLOBAL (system default) binding only by a super admin.
 *
 * The generated row policies (`std_update` / `std_delete`) asked for `editor`, which every
 * ordinary organization member holds — so a plain member could rewrite or soft-delete an
 * org-homed mandate, its org binding or its presentation by writing straight through
 * supabase-js, around the server rule. The restrictive `*_owner_writes_*` policies
 * (`migrations/mandate_owner_writes_restrictive_policies.sql`) close that door.
 *
 * Every probe runs from the seat the person really has — `role authenticated` with
 * `request.jwt.claims` naming them — inside ONE transaction that is ROLLED BACK: the fixture
 * organization, its memberships and every probe row never survive the run. Seats:
 * admin@admin.com (org OWNER, and super admin only when the admin lane is opened),
 * test@test.com (plain org MEMBER, and creator of a personal soft mandate) and a random uuid
 * that belongs to nothing (stranger).
 *
 * RED/GREEN: run against the policies before the migration, the "denied" clauses FAIL (that is
 * the finding); after it, all pass. UNMEASURED IS NOT PASSED — no credentials or an unreachable
 * database is a failure.
 *
 *   pnpm check:mandate-owner-writes
 */

import { randomUUID } from "node:crypto";
import type pg from "pg";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

const OWNER_EMAIL = "admin@admin.com";
const MEMBER_EMAIL = "test@test.com";
/** Fixed ids: the fixture is always rolled back, never minted per run and kept. */
const FIXTURE_ORG = "3ef10000-0000-4a00-8a00-0000000000a1";

function fail(message: string): never {
  console.error(`[FAIL] ${message}`);
  exitAfterDrain(1);
}

/** Become one person. `adminLane` opens the admin lane (the only place admin powers exist). */
async function asSeat(client: pg.Client, uid: string, adminLane = false): Promise<void> {
  await client.query(`reset role`);
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);
  await client.query(`select set_config('matrx.admin_lane', $1, true)`, [adminLane ? "on" : "off"]);
  await client.query(`set local role authenticated`);
}

async function asOperator(client: pg.Client): Promise<void> {
  await client.query(`reset role`);
  await client.query(`select set_config('matrx.admin_lane', 'off', true)`);
}

/**
 * Run one write from the current seat inside a savepoint that is always rolled back. Returns
 * the number of rows it touched, or the error text. A denied UPDATE/DELETE touches 0 rows
 * (RLS filters it); a denied INSERT raises.
 */
async function attempt(
  client: pg.Client,
  sql: string,
  params: unknown[],
): Promise<{ rows: number; error: string | null }> {
  await client.query("savepoint probe");
  try {
    const res = await client.query(sql, params);
    await client.query("rollback to savepoint probe");
    return { rows: res.rowCount ?? 0, error: null };
  } catch (error: unknown) {
    await client.query("rollback to savepoint probe");
    return { rows: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function main(): Promise<void> {
  const env = loadDbEnv();
  if (!("host" in env)) fail("UNMEASURED: no database credentials. A guard that cannot measure has not passed.");
  const client = await connectDirect(env, "check-mandate-owner-writes").catch((error: unknown) =>
    fail(`UNMEASURED: could not reach the database — ${String(error)}`),
  );

  const failures: string[] = [];
  const expect = (ok: boolean, what: string, detail?: string) => {
    console.log(`${ok ? "[ OK ]" : "[FAIL]"} ${what}${!ok && detail ? ` — ${detail}` : ""}`);
    if (!ok) failures.push(what);
  };
  const allowed = (r: { rows: number; error: string | null }, what: string) =>
    expect(r.rows === 1 && r.error === null, what, r.error ?? `touched ${r.rows} rows`);
  const denied = (r: { rows: number; error: string | null }, what: string) =>
    expect(r.rows === 0, what, `it was allowed (touched ${r.rows} row)`);

  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '120s'");
    await client.query("set local lock_timeout = '10s'");

    const ids = await client.query<{ email: string; id: string }>(
      `select email, id from auth.users where email = any($1)`,
      [[OWNER_EMAIL, MEMBER_EMAIL]],
    );
    const owner = ids.rows.find((r) => r.email === OWNER_EMAIL)?.id;
    const member = ids.rows.find((r) => r.email === MEMBER_EMAIL)?.id;
    if (!owner || !member) fail("UNMEASURED: the two test accounts do not both exist.");
    const stranger = randomUUID();

    const sys = (await client.query<{ id: string }>(`select public.system_org_id('system') as id`)).rows[0]?.id;
    const personal = (
      await client.query<{ id: string }>(
        `select o.id from iam.organizations o join iam.organization_member om on om.organization_id = o.id
          where om.user_id = $1 and o.is_personal and om.role = 'owner' limit 1`,
        [member],
      )
    ).rows[0]?.id;
    if (!sys || !personal) fail("UNMEASURED: no system organization, or no personal organization for the member.");

    // ── Fixture: one organization, an OWNER and a plain MEMBER ─────────────────
    await asOperator(client);
    await client.query(`select set_config('app.actor_system', 'check_mandate_owner_writes', true)`);
    await client.query(
      `insert into iam.organizations (id, name, slug, abbreviation, created_by)
       values ($1, 'Mandate owner-writes probe', 'mandate-owner-writes-probe', 'MOW', $2)`,
      [FIXTURE_ORG, owner],
    );
    await client.query(
      `insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
       values ($1, 'organization', $1, $2, 'owner', 'active'),
              ($1, 'organization', $1, $3, 'member', 'active')`,
      [FIXTURE_ORG, owner, member],
    );

    const suffix = randomUUID().slice(0, 8);
    const mkDef = async (key: string, origin: string, org: string, createdBy: string): Promise<string> => {
      const r = await client.query<{ id: string }>(
        `insert into mandate.definition (mandate_key, label, goal, default_holder_type, origin,
                                         organization_id, created_by, visibility)
         values ($1, 'Owner-writes probe', 'Prove who may change a mandate.', 'agent', $2, $3, $4, 'internal')
         returning id`,
        [`probe.owner_writes_${key}_${suffix}`, origin, org, createdBy],
      );
      return r.rows[0]!.id;
    };
    // An org-homed soft mandate the OWNER made; a second one with nothing bound yet.
    const mOrg = await mkDef("org", "user", FIXTURE_ORG, owner);
    const mOrg2 = await mkDef("org2", "user", FIXTURE_ORG, owner);
    // The member's own personal soft mandate.
    const mPersonal = await mkDef("personal", "user", personal, member);
    // Platform mandates the MEMBER is recorded as creating — the creator lane must not reach them.
    const mCode = await mkDef("code", "code", sys, member);
    const mSystemSoft = await mkDef("system_soft", "user", sys, member);

    const orgBinding = (
      await client.query<{ id: string }>(
        `insert into mandate.binding (mandate_id, principal_type, organization_id, holder_type,
                                      config_overrides, created_by)
         values ($1, 'org', $2, 'agent', '{"temperature": 0.2}'::jsonb, $3) returning id`,
        [mOrg, FIXTURE_ORG, owner],
      )
    ).rows[0]!.id;
    const memberBinding = (
      await client.query<{ id: string }>(
        `insert into mandate.binding (mandate_id, principal_type, organization_id, subject_user_id,
                                      holder_type, config_overrides, created_by)
         values ($1, 'user', $2, $3, 'agent', '{"temperature": 0.3}'::jsonb, $3) returning id`,
        [mOrg, FIXTURE_ORG, member],
      )
    ).rows[0]!.id;
    const treatment = (
      await client.query<{ id: string }>(
        `insert into mandate.treatment (mandate_id, tier, name, is_default, config, organization_id, created_by)
         values ($1, 'widget', 'Owner-writes probe', true, mandate.shortcut_treatment_config('{}'::jsonb), $2, $3) returning id`,
        [mOrg, FIXTURE_ORG, owner],
      )
    ).rows[0]!.id;

    const touchDef = `update mandate.definition set label = label || '' where id = $1`;
    const softDeleteDef = `update mandate.definition set deleted_at = now() where id = $1`;
    const deleteDef = `delete from mandate.definition where id = $1`;
    const touchBinding = `update mandate.binding set is_enabled = is_enabled where id = $1`;
    const softDeleteBinding = `update mandate.binding set deleted_at = now() where id = $1`;
    const touchTreatment = `update mandate.treatment set name = name || '' where id = $1`;

    // ── Definition ───────────────────────────────────────────────────────────
    await asSeat(client, member);
    denied(await attempt(client, touchDef, [mOrg]), "org MEMBER cannot UPDATE an org-homed mandate");
    denied(await attempt(client, softDeleteDef, [mOrg]), "org MEMBER cannot soft-delete an org-homed mandate");
    denied(await attempt(client, deleteDef, [mOrg]), "org MEMBER cannot DELETE an org-homed mandate");
    allowed(await attempt(client, touchDef, [mPersonal]), "CREATOR can UPDATE their personal soft mandate");
    allowed(await attempt(client, softDeleteDef, [mPersonal]), "CREATOR can soft-delete their personal soft mandate");
    denied(await attempt(client, touchDef, [mCode]), "a non-super-admin (even its recorded creator) cannot UPDATE a code-backed mandate");
    denied(await attempt(client, touchDef, [mSystemSoft]), "a non-super-admin (even its recorded creator) cannot UPDATE a system-homed soft mandate");
    denied(
      await attempt(client, `update mandate.definition set origin = 'code' where id = $1`, [mPersonal]),
      "CREATOR cannot turn their soft mandate into a code-backed one",
    );
    denied(
      await attempt(
        client,
        `insert into mandate.definition (mandate_key, label, goal, default_holder_type, origin, organization_id, created_by)
         values ($1, 'x', 'x', 'agent', 'code', $2, $3)`,
        [`probe.owner_writes_insert_code_${suffix}`, personal, member],
      ),
      "a non-super-admin cannot CREATE a code-backed mandate",
    );
    allowed(
      await attempt(
        client,
        `insert into mandate.definition (mandate_key, label, goal, default_holder_type, origin, organization_id, created_by)
         values ($1, 'x', 'x', 'agent', 'user', $2, $3)`,
        [`probe.owner_writes_insert_soft_${suffix}`, FIXTURE_ORG, member],
      ),
      "an org MEMBER can still CREATE a soft mandate in their organization (and owns it)",
    );

    await asSeat(client, owner);
    allowed(await attempt(client, touchDef, [mOrg]), "org OWNER can UPDATE an org-homed mandate");
    allowed(await attempt(client, softDeleteDef, [mOrg]), "org OWNER can soft-delete an org-homed mandate");
    denied(await attempt(client, touchDef, [mCode]), "outside the admin lane a super admin is an ordinary person (code-backed refused)");

    await asSeat(client, stranger);
    denied(await attempt(client, touchDef, [mPersonal]), "STRANGER cannot UPDATE someone's personal mandate");
    denied(await attempt(client, touchDef, [mOrg]), "STRANGER cannot UPDATE an org-homed mandate");

    await asSeat(client, owner, true);
    allowed(await attempt(client, touchDef, [mCode]), "SUPER ADMIN (admin lane) can UPDATE a code-backed mandate");
    allowed(await attempt(client, touchDef, [mSystemSoft]), "SUPER ADMIN (admin lane) can UPDATE a system-homed soft mandate");
    allowed(await attempt(client, touchDef, [mPersonal]), "SUPER ADMIN (admin lane) can UPDATE any mandate");

    // ── Bindings ─────────────────────────────────────────────────────────────
    await asSeat(client, member);
    denied(await attempt(client, touchBinding, [orgBinding]), "org MEMBER cannot UPDATE the organization's binding");
    denied(await attempt(client, softDeleteBinding, [orgBinding]), "org MEMBER cannot soft-delete the organization's binding");
    allowed(await attempt(client, touchBinding, [memberBinding]), "a person can UPDATE their own user binding");
    const memberOrgInsert = await attempt(
      client,
      `insert into mandate.binding (mandate_id, principal_type, organization_id, holder_type, config_overrides, created_by)
       values ($1, 'org', $2, 'agent', '{"temperature": 0.4}'::jsonb, $3)`,
      [mOrg2, FIXTURE_ORG, member],
    );
    expect(memberOrgInsert.error !== null, "org MEMBER cannot CREATE an organization-level binding", "it was allowed");

    await asSeat(client, owner);
    allowed(await attempt(client, touchBinding, [orgBinding]), "org OWNER can UPDATE the organization's binding");
    denied(await attempt(client, touchBinding, [memberBinding]), "org OWNER cannot UPDATE a member's personal user binding");
    allowed(
      await attempt(
        client,
        `insert into mandate.binding (mandate_id, principal_type, organization_id, holder_type, config_overrides, created_by)
         values ($1, 'org', $2, 'agent', '{"temperature": 0.4}'::jsonb, $3)`,
        [mOrg2, FIXTURE_ORG, owner],
      ),
      "org OWNER can CREATE an organization-level binding",
    );

    await asSeat(client, stranger);
    denied(await attempt(client, touchBinding, [orgBinding]), "STRANGER cannot UPDATE an organization's binding");

    await asSeat(client, owner, true);
    allowed(await attempt(client, touchBinding, [memberBinding]), "SUPER ADMIN (admin lane) can UPDATE any binding");

    // ── Treatment (the mandate's presentation) ───────────────────────────────
    await asSeat(client, member);
    denied(await attempt(client, touchTreatment, [treatment]), "org MEMBER cannot UPDATE an org mandate's presentation");
    expect(
      (
        await attempt(
          client,
          `insert into mandate.treatment (mandate_id, tier, name, is_default, config, organization_id, created_by)
           values ($1, 'widget', 'x', true, mandate.shortcut_treatment_config('{}'::jsonb), $2, $3)`,
          [mOrg2, FIXTURE_ORG, member],
        )
      ).error !== null,
      "org MEMBER cannot CREATE a presentation for an org mandate",
      "it was allowed",
    );
    await asSeat(client, owner);
    allowed(await attempt(client, touchTreatment, [treatment]), "org OWNER can UPDATE an org mandate's presentation");

    // ── The shortcut compat door still works for the person who owns the shortcut ──
    await asSeat(client, member);
    await client.query("savepoint sc");
    let shortcutError: string | null = null;
    let edited = 0;
    try {
      const ins = await client.query<{ id: string }>(
        `insert into mandate.vw_shortcut (label, organization_id, is_active)
         values ('Owner-writes probe shortcut', $1, true) returning id`,
        [FIXTURE_ORG],
      );
      const upd = await client.query(
        `update mandate.definition set label = 'Owner-writes probe shortcut (edited)' where id = $1`,
        [ins.rows[0]!.id],
      );
      edited = upd.rowCount ?? 0;
    } catch (error: unknown) {
      shortcutError = error instanceof Error ? error.message : String(error);
    }
    await client.query("rollback to savepoint sc");
    expect(shortcutError === null && edited === 1,
      "a MEMBER still creates a shortcut in their organization and can edit it (the creator owns it)",
      shortcutError ?? `edited ${edited} rows`);
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end().catch(() => undefined);
  }

  if (failures.length > 0) {
    fail(`${failures.length} mandate owner-write rule(s) broken:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  }
  console.log(
    "✅ MANDATE OWNER WRITES: only the creator, an owner/admin of the home organization, or a super admin in the admin lane changes a mandate; org bindings are the org admins', user bindings the person's.",
  );
}

void main();
