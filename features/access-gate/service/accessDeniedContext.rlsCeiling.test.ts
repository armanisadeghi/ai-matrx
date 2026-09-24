/**
 * @jest-environment node
 */
/**
 * THE RESOLVER'S LEVEL MUST AGREE WITH THE ROW'S REAL RLS CEILING.
 *
 * The break this catches (live, 2026-09-15): `public.access_denied_context`
 * promoted EVERY platform admin to `level: 'admin'` on the belief that
 * `platform_admin_all` sits on every canonical table. It does not — private
 * tokens (a `conversation`) carry no platform-staff lane at all (the privacy
 * wall), and 217 of the `platform_admin_all` policies admit only rows at
 * `visibility >= 'internal'`. So admin@admin.com opening another person's
 * personal conversation was told "You do have access to it — something went
 * wrong on our side", while the row read it had just made under RLS returned
 * nothing. A super admin has no standing read of a person's private data
 * (Data Doctrine access DECISIONS 2026-09-12); the gate must say so.
 *
 * SEAM: the live database. The migration file under test is executed inside a
 * transaction that is ALWAYS rolled back, then the resolver is called as the
 * admin under the `authenticated` role, beside a real RLS read of the same row.
 * Nothing is committed. Expected levels are literals from the ruling and the
 * live policies, never from the resolver.
 *
 * No credentials → the suite FAILS (unmeasured is not a pass).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

import { testDbEnvFrom } from "@/scripts/lib/direct-db-env";

const MIGRATION = resolve(
  __dirname,
  "../../../migrations/access_gate_resolver_reports_the_real_rls_ceiling.sql",
);

const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd"; // admin@admin.com, a platform admin

// Real rows, none owned by ADMIN, none granted to ADMIN through iam.has_access_for.
const CASES = [
  {
    name: "another person's personal conversation (no platform-staff lane at all)",
    token: "conversation",
    table: "chat.conversation",
    id: "48ace2e1-d348-40dd-956f-54d226775600",
    level: "none",
  },
  {
    name: "a personal note (platform_admin_all admits only internal+)",
    token: "note",
    table: "workbench.notes",
    id: "004ad4fa-fda8-4ddc-bb17-d048ffbc18a0",
    level: "none",
  },
  {
    name: "an internal note the platform-admin lane really admits",
    token: "note",
    table: "workbench.notes",
    id: "00920e60-e777-4415-b482-32aaab5b552e",
    level: "admin",
  },
  {
    name: "the 2026-09-11 internal scheduler task the admin can really read",
    token: "sch_task",
    table: "scheduler.sch_task",
    id: "a7c1e2d3-0000-4e5f-9a00-000000000006",
    level: "admin",
  },
] as const;

function loadEnv(): pg.ClientConfig {
  // THE ONE DOOR for a live test (scripts/lib/direct-db-env.ts): never the live database by
  // accident — repointed to MATRX_TEST_DATABASE_URL / SUPABASE_BRANCH_DATABASE_URL, or refused.
  const db = testDbEnvFrom(resolve(__dirname, "../../.."));
  return {
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    ssl: { rejectUnauthorized: false },
    application_name: "access-gate-rls-ceiling-test",
    connectionTimeoutMillis: 15_000,
  };
}

type Observed = { level: string; visible: number };
const observed = new Map<string, Observed>();

beforeAll(async () => {
  const client = new pg.Client(loadEnv());
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '60s'");
    // The file under test, as written — rolled back below, never committed.
    await client.query(readFileSync(MIGRATION, "utf8"));
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: ADMIN, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
    for (const c of CASES) {
      const ctx = await client.query<{ level: string }>(
        "select public.access_denied_context($1, $2::uuid) ->> 'level' as level",
        [c.token, c.id],
      );
      const rls = await client.query<{ n: string }>(
        `select count(*)::text as n from ${c.table} where id = $1::uuid`,
        [c.id],
      );
      observed.set(c.id, { level: ctx.rows[0]!.level, visible: Number(rls.rows[0]!.n) });
    }
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end();
  }
}, 120_000);

describe("access_denied_context reports the level the row's real RLS ceiling allows", () => {
  it.each(CASES)("reports level '$level' to a platform admin for $name", (c) => {
    expect(observed.get(c.id)?.level).toBe(c.level);
  });

  it.each(CASES)(
    "never claims access the admin's own RLS read of the row refuses: $name",
    (c) => {
      const o = observed.get(c.id);
      expect(o).toBeDefined();
      // The two answers must agree: a level above 'none' iff the row is readable.
      expect({ claimsAccess: o!.level !== "none", rowReadable: o!.visible === 1 }).toEqual({
        claimsAccess: o!.visible === 1,
        rowReadable: o!.visible === 1,
      });
    },
  );
});
