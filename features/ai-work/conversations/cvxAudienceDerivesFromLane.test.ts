/**
 * @jest-environment node
 */
/**
 * ONE CLASSIFIER, PROVEN OVER THE LIVE TABLE.
 *
 * The break this catches (live, measured 2026-09-20): the platform had TWO
 * functions answering "what kind of conversation is this" — `chat.conversation_lane`
 * (the sidebar's five lanes) and `public.cvx_audience` (/work's three buckets),
 * written a day apart, each restating the rules from its own column list. They had
 * already drifted on 662 of 30,216 live conversations: every one lane `auto` but
 * audience `chat`, because cvx_audience short-circuited on `origin_class = 'human'`
 * and never looked at `source_feature` or the server apps, so server-initiated MCP
 * agent runs, aidream/system rows and podcast + research builds were filed under a
 * person's chats. `cvx_audience` now DERIVES from the lane and decides nothing.
 *
 * Nothing stops the next lane from restating the rules again, so this suite holds
 * the derivation to the live data rather than to a file's text:
 *   1. over EVERY conversation, cvx_audience is exactly the documented function of
 *      chat.conversation_lane (the mapping is written here, independently);
 *   2. cvx_audience's body actually CALLS chat.conversation_lane — a body that
 *      merely agrees on today's rows is a second classifier waiting to drift;
 *   3. exactly ONE cvx_audience exists (a re-added 4-argument overload answers from
 *      fewer columns and can disagree — that is the defect, not the fix);
 *   4. both call sites pass source_feature, which the lane needs.
 *
 * SEAM: the live database, read as the owner. The RED proof is in the suite: a
 * perturbed cvx_audience is installed inside a transaction that is ALWAYS rolled
 * back, and check 1 must report violations against it. A guard nobody has seen fail
 * is not a guard.
 *
 * No credentials → the suite FAILS (unmeasured is not a pass).
 */
import { resolve } from "node:path";
import pg from "pg";

import { testDbEnvFrom } from "@/scripts/lib/direct-db-env";

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
    application_name: "cvx-audience-derives-from-lane-test",
    connectionTimeoutMillis: 15_000,
  };
}

/**
 * THE DOCUMENTED MAPPING, written here and nowhere else in this file, so the
 * assertion cannot be satisfied by cvx_audience agreeing with itself:
 *   external  lane 'plugin', or a live coding-session binding (provider);
 *   internal  lane 'auto' or 'subagent';
 *   chat      lane 'chat' or 'matrx'.
 */
const DISAGREEMENTS = `
  with b as (
    select
      c.id,
      c.source_app, c.source_feature, c.origin_class, c.conversation_type,
      (select cs.provider
         from chat.coding_session cs
        where cs.conversation_id = c.id and cs.deleted_at is null
        order by cs.last_seen_at desc nulls last, cs.created_at desc, cs.id
        limit 1) as provider
    from chat.conversation c
  ),
  judged as (
    select
      b.*,
      public.cvx_audience(b.provider, b.source_app, b.source_feature,
                          b.origin_class, b.conversation_type) as audience,
      chat.conversation_lane(b.source_app, b.source_feature,
                             b.origin_class, b.conversation_type) as lane
    from b
  )
  select j.id::text as id, j.audience, j.lane, (j.provider is not null) as bound
  from judged j
  where j.audience is distinct from (
    case
      when j.provider is not null or j.lane = 'plugin' then 'external'
      when j.lane in ('auto', 'subagent') then 'internal'
      else 'chat'
    end
  )
  limit 20
`;

type Row = { id: string; audience: string; lane: string; bound: boolean };

let live: Row[] = [];
let perturbed: Row[] = [];
let audienceBody = "";
let overloads: { args: string }[] = [];
let callSites: { name: string; def: string }[] = [];

beforeAll(async () => {
  const client = new pg.Client(loadEnv());
  await client.connect();
  try {
    await client.query("set statement_timeout = '120s'");
    live = (await client.query<Row>(DISAGREEMENTS)).rows;

    audienceBody = (
      await client.query<{ src: string }>(
        `select p.prosrc as src
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'cvx_audience'`,
      )
    ).rows
      .map((r) => r.src)
      .join("\n");

    overloads = (
      await client.query<{ args: string }>(
        `select pg_get_function_identity_arguments(p.oid) as args
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'cvx_audience'
          order by 1`,
      )
    ).rows;

    callSites = (
      await client.query<{ name: string; def: string }>(
        `select p.proname as name, pg_get_functiondef(p.oid) as def
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('cvx_list_scoped', 'cvx_list_facets')`,
      )
    ).rows;

    // THE RED PROOF. A cvx_audience that stops being the documented function of
    // the lane — here, one that files subagents under a person's chats, the exact
    // class of drift this guard exists for. Rolled back, never committed.
    await client.query("begin");
    try {
      await client.query(`
        create or replace function public.cvx_audience(
          p_provider text, p_source_app text, p_source_feature text,
          p_origin_class text, p_conversation_type text
        ) returns text language sql immutable parallel safe as $mutant$
          select case
            when p_provider is not null
              or chat.conversation_lane(p_source_app, p_source_feature,
                                        p_origin_class, p_conversation_type) = 'plugin'
              then 'external'
            when chat.conversation_lane(p_source_app, p_source_feature,
                                        p_origin_class, p_conversation_type) = 'auto'
              then 'internal'
            else 'chat'
          end
        $mutant$
      `);
      perturbed = (await client.query<Row>(DISAGREEMENTS)).rows;
    } finally {
      await client.query("rollback");
    }
  } finally {
    await client.end();
  }
}, 180_000);

describe("public.cvx_audience is exactly the documented function of chat.conversation_lane", () => {
  it("classifies every live conversation the way the lane says", () => {
    expect(
      live.map((r) => `${r.id} audience=${r.audience} lane=${r.lane} bound=${r.bound}`),
    ).toEqual([]);
  });

  it("derives: its body calls chat.conversation_lane instead of restating the rules", () => {
    expect(audienceBody).toContain("chat.conversation_lane");
  });

  it("is ONE function — no overload answering from fewer columns", () => {
    expect(overloads.map((o) => o.args)).toEqual([
      "p_provider text, p_source_app text, p_source_feature text, p_origin_class text, p_conversation_type text",
    ]);
  });

  it.each(["cvx_list_scoped", "cvx_list_facets"])("%s passes source_feature to it", (name) => {
    const def = callSites.find((c) => c.name === name)?.def ?? "";
    expect(def).toMatch(/cvx_audience\([^)]*source_feature[^)]*\)/);
  });

  it("RED PROOF: reports the drift when cvx_audience stops deriving", () => {
    expect(perturbed.length).toBeGreaterThan(0);
    expect(perturbed.every((r) => r.lane === "subagent" && r.audience === "chat")).toBe(true);
  });
});
