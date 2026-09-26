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
 * SEAM: the test database (scripts/lib/direct-db-env.ts: the dev clone, never
 * the live one). Inside ONE transaction that is ALWAYS rolled back: the
 * resolver's CURRENT body is executed (the newest migration that defines it),
 * the world the ruling is about is built — admin@admin.com as a platform
 * admin, and test@test.com's own rows in an organization the admin is not in —
 * and the resolver is called as the admin under the `authenticated` role,
 * beside a real RLS read of the same row. Nothing is committed. Expected
 * levels are literals from the ruling and the live policies, never from the
 * resolver.
 *
 * Why the rows are built here (2026-09-24): this suite used to name four live
 * row ids. The clone holds none of them (no notes, no scheduler tasks), so the
 * two `none` cases passed without measuring anything and the two `admin` cases
 * could never pass. It also executed the 2026-09-15 body, while the resolver
 * had moved on (2026-09-20, every level is a real read) and named this suite
 * as its guard.
 *
 * No credentials → the suite FAILS (unmeasured is not a pass).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

import { testDbEnvFrom } from "@/scripts/lib/direct-db-env";

/**
 * The resolver's CURRENT body: the newest migration that defines it (V24-TAILS, 2026-09-25: the
 * stranger's answer is the missing answer). Only its CREATE FUNCTION statement is executed — the
 * file also declares the blind ask's door and notice kind, which the clone already holds.
 */
const MIGRATION = resolve(
  __dirname,
  "../../../migrations/campaign/v24tails_a_stranger_is_told_what_a_missing_id_is_told.sql",
);
function resolverBody(): string {
  const sql = readFileSync(MIGRATION, "utf8");
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.access_denied_context");
  const end = sql.indexOf("$function$;", start);
  if (start < 0 || end < 0) throw new Error(`${MIGRATION} no longer defines public.access_denied_context`);
  return sql.slice(start, end + "$function$;".length);
}

const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd"; // admin@admin.com — a platform admin on live
const OTHER = "4060701e-706a-4c76-b3ca-0bbc69fa5a14"; // test@test.com — the non-admin seat

// Each row belongs to test@test.com, in an organization admin@admin.com is not
// a member of, so no ownership / membership / grant path can admit the admin:
// only the platform-admin lane, where the table has one, and only at
// `visibility >= 'internal'`.
const CASES = [
  {
    name: "another person's personal conversation (no platform-staff lane at all)",
    token: "conversation",
    table: "chat.conversation",
    insert: `insert into chat.conversation (organization_id, created_by, visibility, title)
             values ($1, $2, 'personal', 'Kitchen remodel budget questions') returning id`,
    level: "none",
  },
  {
    name: "a personal note (platform_admin_all admits only internal+)",
    token: "note",
    table: "workbench.notes",
    insert: `insert into workbench.notes (organization_id, created_by, visibility, label, content)
             values ($1, $2, 'personal', 'Tile supplier callbacks', 'Call Brenda at Coastal Tile about the grout delay.') returning id`,
    level: "none",
  },
  {
    name: "an internal note the platform-admin lane really admits",
    token: "note",
    table: "workbench.notes",
    insert: `insert into workbench.notes (organization_id, created_by, visibility, label, content)
             values ($1, $2, 'internal', 'Crew schedule — week of Oct 5', 'Framing Mon-Tue, electrical rough-in Wed.') returning id`,
    level: "admin",
  },
  {
    name: "an internal scheduler task the admin can really read",
    token: "sch_task",
    table: "scheduler.sch_task",
    insert: `insert into scheduler.sch_task (organization_id, created_by, user_id, visibility, kind, title)
             values ($1, $2, $2, 'internal', 'ping', 'Weekly permit status check') returning id`,
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
const LANES = ["user page", "admin section"] as const;
type Lane = (typeof LANES)[number];
/** On a user page a platform admin is an ordinary person: no admin arm is live, so nothing here is theirs. */
const levelOn = (lane: Lane, c: (typeof CASES)[number]): string =>
  lane === "user page" ? "none" : c.level;
const SEATS = LANES.flatMap((lane) => CASES.map((c) => ({ lane, ...c, expected: levelOn(lane, c) })));
const observed = new Map<string, Observed>();

beforeAll(async () => {
  const client = new pg.Client(loadEnv());
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '60s'");
    // The file under test, as written — rolled back below, never committed.
    await client.query(resolverBody());

    // The world, built as the table owner, inside the same rolled-back transaction.
    await client.query(
      "insert into admin.admins (user_id, level) values ($1, 'super_admin') on conflict (user_id) do nothing",
      [ADMIN],
    );
    const org = await client.query<{ organization_id: string }>(
      `select om.organization_id from iam.organization_member om
        where om.user_id = $1 and om.role = 'owner'
          and not exists (select 1 from iam.organization_member a
                           where a.organization_id = om.organization_id and a.user_id = $2)
        order by om.organization_id limit 1`,
      [OTHER, ADMIN],
    );
    const organizationId = org.rows[0]?.organization_id;
    if (!organizationId) {
      throw new Error(
        "UNMEASURED: the test database has no organization test@test.com owns that admin@admin.com is not in.",
      );
    }
    const ids = new Map<string, string>();
    for (const c of CASES) {
      const row = await client.query<{ id: string }>(c.insert, [organizationId, OTHER]);
      ids.set(c.name, row.rows[0]!.id);
    }

    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: ADMIN, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
    // THE ADMIN LANE (utils/supabase/adminLane.ts, 2026-09-25): every platform-admin arm in RLS
    // is live only on a request carrying `x-matrx-admin-lane: 1` — the admin section. Measured
    // on both seats: a user page (no header) and the admin section (the header PostgREST forwards).
    for (const lane of LANES) {
      await client.query("select set_config('request.headers', $1, true)", [
        lane === "admin section" ? JSON.stringify({ "x-matrx-admin-lane": "1" }) : "",
      ]);
      for (const c of CASES) {
        const id = ids.get(c.name)!;
        const ctx = await client.query<{ level: string }>(
          "select public.access_denied_context($1, $2::uuid) ->> 'level' as level",
          [c.token, id],
        );
        const rls = await client.query<{ n: string }>(
          `select count(*)::text as n from ${c.table} where id = $1::uuid`,
          [id],
        );
        observed.set(`${lane}: ${c.name}`, {
          level: ctx.rows[0]!.level,
          visible: Number(rls.rows[0]!.n),
        });
      }
    }
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end();
  }
}, 120_000);

describe("access_denied_context reports the level the row's real RLS ceiling allows", () => {
  it.each(SEATS)("on a $lane, reports level '$expected' to a platform admin for $name", (c) => {
    expect(observed.get(`${c.lane}: ${c.name}`)?.level).toBe(c.expected);
  });

  it.each(SEATS)(
    "on a $lane, never claims access the admin's own RLS read of the row refuses: $name",
    (c) => {
      const o = observed.get(`${c.lane}: ${c.name}`);
      expect(o).toBeDefined();
      // The two answers must agree: a level above 'none' iff the row is readable.
      expect({ claimsAccess: o!.level !== "none", rowReadable: o!.visible === 1 }).toEqual({
        claimsAccess: c.expected !== "none",
        rowReadable: c.expected !== "none",
      });
    },
  );
});
