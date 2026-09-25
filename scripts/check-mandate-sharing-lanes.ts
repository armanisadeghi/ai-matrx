/**
 * A MANDATE SOMEBODY SHARES STAYS THEIRS, AND LANDS IN THE RIGHT LIST FOR EVERY VIEWER.
 *
 * Share ≠ move (mandates UI register, 2026-09-25). A person's own soft mandate stays homed in
 * their personal organization with `visibility = 'personal'`; sharing writes the platform's
 * ordinary grants (`iam.permissions`, the rows ShareModal writes) or flips the row to the
 * published lane. What each viewer must then see, from the seat they really have
 * (`role authenticated`, `request.jwt.claims` = that person), through `public.mnd_member_list`:
 *
 *   granted to a person        → that person's "Shared" tab
 *   granted to an organization → every member's "Organizations" tab (and the org's own list)
 *   visibility public          → everyone's "Public" tab (the community lane)
 *   nothing granted            → nobody but the creator, in no tab at all
 *
 * and the creator keeps ownership through every step (`created_by` and `organization_id`
 * never change).
 *
 * Everything runs inside ONE transaction that is ROLLED BACK — the probe mandate, its grants
 * and its visibility never survive the run. The identities are the two test accounts
 * (test@test.com creates, admin@admin.com views) and a random uuid that belongs to nothing.
 *
 * UNMEASURED IS NOT PASSED. No credentials or an unreachable database is a FAILURE.
 *
 *   pnpm check:mandate-sharing-lanes
 */

import { randomUUID } from "node:crypto";
import type pg from "pg";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

const TEST_EMAIL = "test@test.com";
const VIEWER_EMAIL = "admin@admin.com";

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

async function asOperator(client: pg.Client): Promise<void> {
  await client.query(`reset role`);
}

interface ListAnswer {
  total: number;
  rows: { mandate_key: string; created_by_me: boolean; organization_id: string }[];
}

async function listKeys(
  client: pg.Client,
  args: { level: "person" | "organization"; scope: string; orgId?: string | null },
): Promise<{ keys: Set<string>; error: string | null }> {
  await client.query("savepoint probe");
  try {
    const res = await client.query<{ out: ListAnswer }>(
      `select public.mnd_member_list('page', $1, $2, $3::uuid, null, null, '{}'::jsonb,
                                     'name', 'asc', 500, 0) as out`,
      [args.level, args.scope, args.orgId ?? null],
    );
    await client.query("release savepoint probe");
    return { keys: new Set(res.rows[0]!.out.rows.map((r) => r.mandate_key)), error: null };
  } catch (error: unknown) {
    await client.query("rollback to savepoint probe");
    return { keys: new Set(), error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Bind the probe mandate at a level, the way the server's binding door writes it (as the
 * operator, under mandate.guard_binding_containment). A settings-only binding (no holder),
 * so the holder-runnability check never masks the containment answer. Returns the refusal,
 * or null.
 */
async function tryBind(
  client: pg.Client,
  args: { mandateId: string; principal: "org" | "user"; orgId: string; subject?: string; actor: string },
): Promise<string | null> {
  // The actor stamp (`_stamp_actor`) reads the request's claims, so they name the binder.
  await asSeat(client, args.actor);
  await asOperator(client);
  await client.query("savepoint bind");
  try {
    await client.query(
      `insert into mandate.binding (mandate_id, principal_type, organization_id, subject_user_id,
                                    holder_type, holder_id, config_overrides, created_by)
       values ($1, $2, $3, $4, 'agent', null, '{"temperature": 0.2}'::jsonb, $5)`,
      [args.mandateId, args.principal, args.orgId, args.subject ?? null, args.actor],
    );
    await client.query("rollback to savepoint bind");
    return null;
  } catch (error: unknown) {
    await client.query("rollback to savepoint bind");
    return error instanceof Error ? error.message : String(error);
  }
}

async function main(): Promise<void> {
  const env = loadDbEnv();
  if (!("host" in env)) fail("UNMEASURED: no database credentials. A guard that cannot measure has not passed.");
  const client = await connectDirect(env, "check-mandate-sharing-lanes").catch((error: unknown) =>
    fail(`UNMEASURED: could not reach the database — ${String(error)}`),
  );

  const failures: string[] = [];
  const expect = (ok: boolean, what: string) => {
    console.log(`${ok ? "[ OK ]" : "[FAIL]"} ${what}`);
    if (!ok) failures.push(what);
  };

  try {
    await client.query("begin");
    const ids = await client.query<{ email: string; id: string }>(
      `select email, id from auth.users where email = any($1)`,
      [[TEST_EMAIL, VIEWER_EMAIL]],
    );
    const creator = ids.rows.find((r) => r.email === TEST_EMAIL)?.id;
    const viewer = ids.rows.find((r) => r.email === VIEWER_EMAIL)?.id;
    if (!creator || !viewer) fail("UNMEASURED: the two test accounts do not both exist.");
    const stranger = randomUUID();

    const personal = await client.query<{ id: string }>(
      `select o.id from iam.organizations o join iam.organization_member om on om.organization_id = o.id
        where om.user_id = $1 and o.is_personal and om.role = 'owner' limit 1`,
      [creator],
    );
    const shared = await client.query<{ id: string }>(
      `select o.id from iam.organizations o
         join iam.organization_member a on a.organization_id = o.id and a.user_id = $1
         join iam.organization_member b on b.organization_id = o.id and b.user_id = $2
        where not o.is_personal and o.archived_at is null order by o.name limit 1`,
      [creator, viewer],
    );
    const personalOrg = personal.rows[0]?.id;
    const sharedOrg = shared.rows[0]?.id;
    if (!personalOrg || !sharedOrg) fail("UNMEASURED: no personal org for the creator, or no organization both accounts share.");

    // The creator makes a personal soft mandate from their own seat.
    const key = `probe.sharing_lanes_${randomUUID().slice(0, 8)}`;
    await asSeat(client, creator);
    const made = await client.query<{ id: string }>(
      `insert into mandate.definition (mandate_key, label, goal, default_holder_type, origin,
                                       organization_id, created_by, visibility)
       values ($1, 'Sharing lanes probe', 'Prove who sees a shared mandate.', 'agent', 'user',
               $2, $3, 'personal') returning id`,
      [key, personalOrg, creator],
    );
    const mandateId = made.rows[0]!.id;

    const ownership = async (): Promise<{ created_by: string; organization_id: string }> => {
      await asOperator(client);
      const r = await client.query<{ created_by: string; organization_id: string }>(
        `select created_by, organization_id from mandate.definition where id = $1`,
        [mandateId],
      );
      return r.rows[0]!;
    };

    // ── 0. Nothing shared: only the creator sees it ───────────────────────────
    await asSeat(client, creator);
    expect((await listKeys(client, { level: "person", scope: "mine" })).keys.has(key),
      "creator sees their personal mandate under Mine");
    for (const scope of ["shared", "orgs", "public"]) {
      await asSeat(client, viewer);
      const r = await listKeys(client, { level: "person", scope });
      expect(!r.keys.has(key), `before any share, the viewer does not see it under ${scope}${r.error ? ` (${r.error})` : ""}`);
    }

    let bind = await tryBind(client, { mandateId, principal: "org", orgId: sharedOrg, actor: viewer });
    expect(/cannot bind mandate/.test(bind ?? ""), `before any share, another organization cannot bind it (containment holds)${bind ? "" : " — it was allowed"}`);
    bind = await tryBind(client, { mandateId, principal: "user", orgId: sharedOrg, subject: viewer, actor: viewer });
    expect(/cannot be bound to mandate/.test(bind ?? ""), `before any share, another person cannot bind it for themselves${bind ? "" : " — it was allowed"}`);

    // ── 1. Person-to-person grant (what ShareModal's People tab writes) ───────
    await asSeat(client, creator);
    await client.query(`select public.share_resource_with_user('mandate', $1, $2, 'viewer')`, [mandateId, viewer]);
    await asSeat(client, viewer);
    let r = await listKeys(client, { level: "person", scope: "shared" });
    expect(r.keys.has(key), `granted to one person → in that person's Shared tab${r.error ? ` (${r.error})` : ""}`);
    await asSeat(client, stranger);
    r = await listKeys(client, { level: "person", scope: "shared" });
    expect(!r.keys.has(key), "granted to one person → a stranger still sees nothing");
    bind = await tryBind(client, { mandateId, principal: "user", orgId: sharedOrg, subject: viewer, actor: viewer });
    expect(bind === null, `granted to one person → that person can bind it for themselves${bind ? ` (${bind})` : ""}`);
    bind = await tryBind(client, { mandateId, principal: "org", orgId: sharedOrg, actor: viewer });
    expect(/cannot bind mandate/.test(bind ?? ""), "granted to one person → still not bindable organization-wide");
    let own = await ownership();
    expect(own.created_by === creator && own.organization_id === personalOrg,
      "after a person share the creator still owns it and it stays in their personal organization");
    await asOperator(client);
    await client.query(`delete from iam.permissions where resource_type = 'mandate' and resource_id = $1`, [mandateId]);

    // ── 2. Organization grant (ShareModal's Organizations tab) ───────────────
    await asSeat(client, creator);
    await client.query(`select public.share_resource_with_org('mandate', $1, $2, 'viewer')`, [mandateId, sharedOrg]);
    await asSeat(client, viewer);
    r = await listKeys(client, { level: "person", scope: "orgs" });
    expect(r.keys.has(key), `granted to an organization → in a member's Organizations tab${r.error ? ` (${r.error})` : ""}`);
    r = await listKeys(client, { level: "person", scope: "orgs", orgId: sharedOrg });
    expect(r.keys.has(key), "granted to an organization → in that organization's narrowed Organizations tab");
    r = await listKeys(client, { level: "organization", scope: "orgs", orgId: sharedOrg });
    expect(r.keys.has(key), `granted to an organization → in the organization seat's own list${r.error ? ` (${r.error})` : ""}`);
    await asSeat(client, stranger);
    r = await listKeys(client, { level: "person", scope: "orgs" });
    expect(!r.keys.has(key), "granted to an organization → a non-member still sees nothing");
    bind = await tryBind(client, { mandateId, principal: "org", orgId: sharedOrg, actor: viewer });
    expect(bind === null, `granted to an organization → that organization can bind it org-wide${bind ? ` (${bind})` : ""}`);
    bind = await tryBind(client, { mandateId, principal: "user", orgId: sharedOrg, subject: viewer, actor: viewer });
    expect(bind === null, `granted to an organization → a member can bind it for themselves${bind ? ` (${bind})` : ""}`);
    own = await ownership();
    expect(own.created_by === creator && own.organization_id === personalOrg,
      "after an organization share the creator still owns it (share never moves it)");
    await asOperator(client);
    await client.query(`delete from iam.permissions where resource_type = 'mandate' and resource_id = $1`, [mandateId]);

    // ── 3. Published (the community lane) ────────────────────────────────────
    await asSeat(client, creator);
    await client.query(`update mandate.definition set visibility = 'public' where id = $1`, [mandateId]);
    await asSeat(client, viewer);
    r = await listKeys(client, { level: "person", scope: "public" });
    expect(r.keys.has(key), `published → in another person's Public tab${r.error ? ` (${r.error})` : ""}`);
    await asSeat(client, stranger);
    r = await listKeys(client, { level: "person", scope: "public" });
    expect(r.keys.has(key), "published → in a signed-in stranger's Public tab");
    await asSeat(client, creator);
    r = await listKeys(client, { level: "person", scope: "public" });
    expect(!r.keys.has(key), "published → never duplicated into the creator's own Public tab (it is under Mine)");
    bind = await tryBind(client, { mandateId, principal: "user", orgId: sharedOrg, subject: viewer, actor: viewer });
    expect(bind === null, `published → anyone signed in can bind it for themselves${bind ? ` (${bind})` : ""}`);
    bind = await tryBind(client, { mandateId, principal: "org", orgId: sharedOrg, actor: viewer });
    expect(bind === null, `published → any organization can bind it org-wide${bind ? ` (${bind})` : ""}`);
    own = await ownership();
    expect(own.created_by === creator && own.organization_id === personalOrg,
      "after publishing the creator still owns it");
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end().catch(() => undefined);
  }

  if (failures.length > 0) {
    fail(`${failures.length} sharing lane(s) broken:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  }
  console.log("✅ MANDATE SHARING LANES: person, organization and published shares each land in the right list, for the right people only, and the creator keeps ownership.");
}

void main();
