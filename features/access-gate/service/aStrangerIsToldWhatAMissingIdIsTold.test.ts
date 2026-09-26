/**
 * @jest-environment node
 */
/**
 * A STRANGER IS TOLD WHAT A MISSING ID IS TOLD (lane V24-TAILS, chair ruling 2026-09-25).
 *
 * The break (VERIFIER-24 item 10, production): test@test.com, who is not in Castellano & Reyes,
 * opened admin's unshared Matter table and read "You don't have access … It belongs to Castellano
 * & Reyes, LLP … OWNER AI Matrx Admin … Request access", while a random id read "We couldn't find
 * this record". `access_denied_context` returned the owner, the avatar and the organization for
 * the real one — anyone guessing ids learned what exists, where, and whose it is.
 *
 * RED on the prior resolver body (migrations/access_gate_resolver_every_level_is_a_real_read.sql):
 * the stranger's payload carries `exists: true`, an owner and an organization. GREEN on the
 * campaign body: the two payloads are identical, the owner still reads the full answer, and the
 * blind ask files one request + one in-app notice for the real note and nothing for the random id.
 *
 * SEAM: the test database (scripts/lib/direct-db-env.ts — the dev clone, never live), ONE
 * transaction, always rolled back. No credentials → the suite FAILS (unmeasured is not a pass).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

import { testDbEnvFrom } from "@/scripts/lib/direct-db-env";

const MIGRATION = resolve(
  __dirname,
  process.env.V24_RESOLVER_FILE ??
    "../../../migrations/campaign/v24tails_a_stranger_is_told_what_a_missing_id_is_told.sql",
);
const CAMPAIGN = resolve(
  __dirname,
  "../../../migrations/campaign/v24tails_a_stranger_is_told_what_a_missing_id_is_told.sql",
);
/** The blind ask as the campaign file defines it (the test database may predate it). */
function blindAskBody(): string {
  const sql = readFileSync(CAMPAIGN, "utf8");
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.access_request_blind");
  const end = sql.indexOf("$function$;", start);
  if (start < 0 || end < 0) throw new Error(`${CAMPAIGN} does not define public.access_request_blind`);
  return sql.slice(start, end + "$function$;".length);
}
/** Its door row and grant, as the file declares them (a door register revokes an undeclared grant). */
function blindAskDoor(): string {
  const sql = readFileSync(CAMPAIGN, "utf8");
  const start = sql.indexOf("INSERT INTO platform.client_callable_door");
  const grant = "GRANT EXECUTE ON FUNCTION public.access_request_blind(text, uuid, text, text) TO authenticated;";
  const end = sql.indexOf(grant, start);
  if (start < 0 || end < 0) throw new Error(`${CAMPAIGN} does not declare the blind ask's door`);
  return sql.slice(start, end + grant.length);
}
function resolverBody(): string {
  const sql = readFileSync(MIGRATION, "utf8");
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.access_denied_context");
  const end = sql.indexOf("$function$;", start);
  if (start < 0 || end < 0) throw new Error(`${MIGRATION} does not define public.access_denied_context`);
  return sql.slice(start, end + "$function$;".length);
}

const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd"; // admin@admin.com — the owner
const STRANGER = "4060701e-706a-4c76-b3ca-0bbc69fa5a14"; // test@test.com — not in the org
const RANDOM = "5b0e3c1a-9d2f-4c11-8f00-0c0ffee00001";

type Json = Record<string, unknown>;
const seen: {
  real?: Json;
  random?: Json;
  owner?: Json;
  askReal?: Json;
  askRandom?: Json;
  requestsReal?: number;
  requestsRandom?: number;
  notices?: number;
} = {};

function loadEnv(): pg.ClientConfig {
  const db = testDbEnvFrom(resolve(__dirname, "../../.."));
  return {
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    ssl: { rejectUnauthorized: false },
    application_name: "access-gate-stranger-is-missing-test",
    connectionTimeoutMillis: 15_000,
  };
}

async function as(client: pg.Client, uid: string) {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
}

beforeAll(async () => {
  const client = new pg.Client(loadEnv());
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '60s'");
    await client.query(resolverBody());
    if (!process.env.V24_RESOLVER_FILE) {
      await client.query(blindAskBody());
      await client.query("savepoint door");
      try {
        await client.query(blindAskDoor());
      } catch {
        // The test database already holds the door row: keep it, and just grant.
        await client.query("rollback to savepoint door");
        await client.query("GRANT EXECUTE ON FUNCTION public.access_request_blind(text, uuid, text, text) TO authenticated");
      }
    }

    const org = await client.query<{ organization_id: string }>(
      `select om.organization_id from iam.organization_member om
        join iam.organizations o on o.id = om.organization_id and not coalesce(o.is_personal, false)
        where om.user_id = $1 and om.role = 'owner'
          and not exists (select 1 from iam.organization_member a
                           where a.organization_id = om.organization_id and a.user_id = $2)
        order by om.organization_id limit 1`,
      [ADMIN, STRANGER],
    );
    const organizationId = org.rows[0]?.organization_id;
    if (!organizationId) throw new Error("UNMEASURED: no organization admin owns that test@test.com is not in.");
    const note = await client.query<{ id: string }>(
      `insert into workbench.notes (organization_id, created_by, visibility, label, content)
       values ($1, $2, 'personal', 'Deposition prep — Alvarez v. Coastal Freight',
               'Exhibits 4-9 still need Bates numbers before Thursday.') returning id`,
      [organizationId, ADMIN],
    );
    const noteId = note.rows[0]!.id;

    const ctx = async (id: string) =>
      (await client.query<{ r: Json }>("select public.access_denied_context('note', $1::uuid) as r", [id])).rows[0]!.r;

    await as(client, STRANGER);
    seen.real = await ctx(noteId);
    seen.random = await ctx(RANDOM);
    const ask = async (id: string) =>
      (
        await client.query<{ r: Json }>(
          "select public.access_request_blind('note', $1::uuid, 'Co-counsel on Alvarez; need the exhibit list.', null) as r",
          [id],
        )
      ).rows[0]!.r;
    if (process.env.V24_RESOLVER_FILE) {
      // RED run against the prior body: the blind ask does not exist there; measure the payloads only.
    } else {
      seen.askReal = await ask(noteId);
      seen.askRandom = await ask(RANDOM);
    }

    await as(client, ADMIN);
    seen.owner = await ctx(noteId);

    await client.query("reset role");
    const counts = await client.query<{ real: string; random: string; notices: string }>(
      `select (select count(*) from iam.access_requests where created_by = $1 and resource_id = $2::uuid)::text as real,
              (select count(*) from iam.access_requests where created_by = $1 and resource_id = $3::uuid)::text as random,
              (select count(*) from communication.notification
                where event_key = 'platform.access.request_received' and recipient_user_id = $4
                  and (payload ->> 'resource_id') = $2::text)::text as notices`,
      [STRANGER, noteId, RANDOM, ADMIN],
    );
    seen.requestsReal = Number(counts.rows[0]!.real);
    seen.requestsRandom = Number(counts.rows[0]!.random);
    seen.notices = Number(counts.rows[0]!.notices);
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end();
  }
}, 120_000);

describe("a stranger is told what a missing id is told", () => {
  it("the stranger's answer about a real unshared note equals the answer about a random id", () => {
    expect(seen.real).toEqual(seen.random);
    expect(seen.real).not.toHaveProperty("owner");
    expect(seen.real).not.toHaveProperty("organization");
    expect(seen.real?.["exists"]).toBe(false);
  });

  it("the owner still reads the full answer", () => {
    expect(seen.owner?.["exists"]).toBe(true);
    expect(seen.owner?.["is_owner"]).toBe(true);
    expect(seen.owner).toHaveProperty("owner");
  });

  it("the blind ask answers the same sentence, files for the real note only, and tells its owner", () => {
    if (process.env.V24_RESOLVER_FILE) return;
    expect(seen.askReal).toEqual(seen.askRandom);
    expect(seen.askReal?.["says"]).toBe("If it exists, its owner has been asked.");
    expect(seen.requestsReal).toBe(1);
    expect(seen.requestsRandom).toBe(0);
    expect(seen.notices).toBe(1);
  });
});
