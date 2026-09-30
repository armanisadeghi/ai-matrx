#!/usr/bin/env npx tsx
/**
 * LANE STORE-READ-PERF-5 — THE TIMING GATE for the scope screens' store read path (dev clone only).
 *
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/storereadperf5_timing.ts
 *
 * Every call is its OWN TRANSACTION, the way PostgREST runs one request: every per-transaction cache
 * (platform.shown_to_context, the wall's yes) is paid by every call, as the browser pays it. Server
 * side: clock_timestamp() - statement_timestamp() after the door's answer is materialized; median of
 * RUNS (default 7; 3 for each organization's archived read) warm calls, the first call of each dropped. Nothing is written: the DB read switch
 * (custom/scope_readers_read_the_store, OFF on the clone) is read ON for one transaction by leaving its
 * resolved value in that transaction's knob memo (platform.memo_put, a transaction-local setting; the
 * readers ask the switch first), never by setting the knob.
 *
 * Budgets (brief STORE-READ-PERF-5, 2026-09-30), warm, both seats:
 *   custom.context_tree(all her live organizations)       admin@admin.com <= 300 ms, test@test.com <= 100 ms
 *   custom.context_values(a type page: its first 200 scopes, ONE call)                       <= 200 ms
 *   custom.context_archived_types(org), every organization she belongs to (the slowest)      <= 200 ms
 *   public.get_scope_tree(org) and public.get_user_full_context, switch ON vs OFF             <= 1.5x
 * Prints every measurement and GREEN / RED; exits 1 on RED.
 */
import { resolve } from "node:path";
import pg from "pg";
import { testDbEnvFrom } from "../lib/direct-db-env";

const ROOT = resolve(__dirname, "..", "..");
const RUNS = Number(process.env.RUNS ?? 7);
const SEATS = ["admin@admin.com", "test@test.com"] as const;
const TREE_BUDGET: Record<string, number> = { "admin@admin.com": 300, "test@test.com": 100 };
const VALUES_BUDGET = 200;
const ARCHIVED_BUDGET = 200;
const RATIO_BUDGET = 1.5;
const SWITCH_KEY = "knob|custom|scope_readers_read_the_store||";

type Row = { seat: string; door: string; arg: string; ms: number; budget: string; ok: boolean };

async function main() {
  const env = testDbEnvFrom(ROOT);
  const client = new pg.Client({
    user: env.user, password: env.password, host: env.host, port: env.port, database: env.database,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  // THE CLONE, NEVER PRODUCTION: its quarantine facts (no active pg_cron job, pg_net absent) are never
  // true of production, and the pooler user names the project.
  const who = await client.query(
    `select current_user as u,
            (select count(*) from cron.job where active)::int as active_jobs,
            exists (select 1 from pg_extension where extname = 'pg_net') as has_pg_net`,
  );
  const { u, active_jobs, has_pg_net } = who.rows[0];
  if (active_jobs !== 0 || has_pg_net || /brsgrqvjdzwihsvnfqkf/.test(u)) {
    throw new Error(`REFUSED: ${u} is not the quarantined dev clone (active cron jobs ${active_jobs}, pg_net ${has_pg_net}).`);
  }
  console.log(`# timing on ${u} (${env.from}), ${RUNS} warm calls each, one transaction per call`);

  async function timed(uid: string, sql: string, params: unknown[], switchOn = false): Promise<number> {
    await client.query("begin");
    try {
      await client.query(
        "select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)",
        [uid],
      );
      await client.query("set local statement_timeout = '120s'");
      if (switchOn) await client.query("select platform.memo_put($1, 'true')", [SWITCH_KEY]);
      const r = await client.query(
        `with a as materialized (select length((${sql})::text) as n)
         select n, (extract(epoch from clock_timestamp() - statement_timestamp()) * 1000)::float8 as ms from a`,
        params,
      );
      return Number(r.rows[0].ms);
    } finally {
      await client.query("rollback");
    }
  }
  // The clone is shared and its load swings (other lanes rehearse on it): a median of several warm
  // calls, never one call, is the number.
  async function median(uid: string, sql: string, params: unknown[], switchOn = false, runs = RUNS): Promise<number> {
    const t: number[] = [];
    for (let i = 0; i <= runs; i++) t.push(await timed(uid, sql, params, switchOn));
    const warm = t.slice(1).sort((a, b) => a - b);
    return warm[Math.floor(warm.length / 2)]!;
  }

  const rows: Row[] = [];
  for (const email of SEATS) {
    const s = await client.query(
      `select u.id::text as id,
              array_agg(m.organization_id::text order by m.organization_id) as orgs
         from auth.users u
         join iam.organization_member m on m.user_id = u.id
         join iam.organizations o on o.id = m.organization_id and o.archived_at is null
        where u.email = $1 group by u.id`,
      [email],
    );
    const uid: string = s.rows[0].id;
    const orgs: string[] = s.rows[0].orgs;

    const tree = await median(uid, "custom.context_tree($1::uuid[])", [orgs]);
    rows.push({ seat: email, door: "context_tree", arg: `${orgs.length} organizations`, ms: tree,
                budget: `<= ${TREE_BUDGET[email]} ms`, ok: tree <= TREE_BUDGET[email]! });

    // The type pages she can open with the most scopes: one values call for the first 200 of each.
    const pages = await client.query(
      `select t.id::text as tbl, o.name || ' / ' || (t.data ->> 'label_plural') as label,
              (array_agg(r.id::text order by r.id))[1:200] as ids, count(r.id)::int as n
         from custom.record t
         join iam.organizations o on o.id = t.organization_id
         join custom.record r on r.organization_id = t.organization_id and r.table_id = t.id and r.deleted_at is null
        where t.organization_id = any ($1::uuid[]) and t.table_id = custom.table_kernel_id()
          and t.deleted_at is null and t.data ->> 'kept_for' = 'context'
        group by 1, 2 order by count(r.id) desc, 1 limit 3`,
      [orgs],
    );
    for (const p of pages.rows) {
      const ms = await median(uid, "custom.context_values($1::uuid[])", [p.ids]);
      rows.push({ seat: email, door: "context_values (type page, one call)", arg: `${p.label} (${p.ids.length} of ${p.n})`,
                  ms, budget: `<= ${VALUES_BUDGET} ms`, ok: ms <= VALUES_BUDGET });
    }

    let worst = { ms: 0, org: "" };
    for (const org of orgs) {
      const ms = await median(uid, "custom.context_archived_types($1::uuid)", [org], false, 3);
      if (ms > worst.ms) worst = { ms, org };
    }
    rows.push({ seat: email, door: "context_archived_types (slowest organization)", arg: worst.org, ms: worst.ms,
                budget: `<= ${ARCHIVED_BUDGET} ms`, ok: worst.ms <= ARCHIVED_BUDGET });

    const scoped = await client.query(
      `select t.organization_id::text as org, count(r.id)::int as n
         from custom.record t
         join custom.record r on r.organization_id = t.organization_id and r.table_id = t.id and r.deleted_at is null
        where t.organization_id = any ($1::uuid[]) and t.table_id = custom.table_kernel_id()
          and t.deleted_at is null and t.data ->> 'kept_for' = 'context'
        group by 1 order by 2 desc limit 4`,
      [orgs],
    );
    for (const o of scoped.rows) {
      const off = await median(uid, "public.get_scope_tree($1::uuid)", [o.org]);
      const on = await median(uid, "public.get_scope_tree($1::uuid)", [o.org], true);
      rows.push({ seat: email, door: "get_scope_tree ON / OFF", arg: `${o.org} (${o.n} scopes): ${on.toFixed(0)} / ${off.toFixed(0)} ms`,
                  ms: on / off, budget: `<= ${RATIO_BUDGET}x`, ok: on / off <= RATIO_BUDGET });
    }
    const off = await median(uid, "public.get_user_full_context(null)", []);
    const on = await median(uid, "public.get_user_full_context(null)", [], true);
    rows.push({ seat: email, door: "get_user_full_context ON / OFF", arg: `${on.toFixed(0)} / ${off.toFixed(0)} ms`,
                ms: on / off, budget: `<= ${RATIO_BUDGET}x`, ok: on / off <= RATIO_BUDGET });
  }
  await client.end();

  for (const r of rows) {
    const v = r.budget.endsWith("x") ? `${r.ms.toFixed(2)}x` : `${r.ms.toFixed(1)} ms`;
    console.log(`${r.ok ? "GREEN" : "RED  "}  ${r.seat.padEnd(16)} ${r.door.padEnd(46)} ${v.padStart(10)}  ${r.budget.padEnd(10)} ${r.arg}`);
  }
  const green = rows.every((r) => r.ok);
  console.log(green ? "GREEN" : "RED");
  process.exit(green ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
