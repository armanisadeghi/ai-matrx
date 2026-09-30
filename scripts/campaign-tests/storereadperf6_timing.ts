#!/usr/bin/env npx tsx
/**
 * LANE STORE-READ-PERF-6 — THE TIMING GATE for the per-organization answer of custom.visible_set (dev clone only).
 *
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/storereadperf6_timing.ts
 *
 * Every call is its OWN TRANSACTION, the way PostgREST runs one request (every per-transaction cache is
 * paid by every call). Server side: clock_timestamp() - statement_timestamp() after the door's answer is
 * materialized; median of RUNS (default 7) warm calls, the first call dropped. Nothing is written.
 *
 * Budgets (brief STORE-READ-PERF-6, 2026-09-30), warm:
 *   custom.context_tree(all her live organizations)   admin@admin.com <= 250 ms, test@test.com <= 90 ms
 *   custom.data_home()                                 admin@admin.com <= 400 ms (test@test.com measured)
 * Prints every measurement and GREEN / RED; exits 1 on RED.
 */
import { resolve } from "node:path";
import pg from "pg";
import { testDbEnvFrom } from "../lib/direct-db-env";

const ROOT = resolve(__dirname, "..", "..");
const RUNS = Number(process.env.RUNS ?? 7);
const SEATS = ["admin@admin.com", "test@test.com"] as const;
const BUDGET: Record<string, Record<string, number | null>> = {
  context_tree: { "admin@admin.com": 250, "test@test.com": 90 },
  data_home: { "admin@admin.com": 400, "test@test.com": null },
};

async function main() {
  const env = testDbEnvFrom(ROOT);
  const client = new pg.Client({
    user: env.user, password: env.password, host: env.host, port: env.port, database: env.database,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  // THE CLONE, NEVER PRODUCTION: its quarantine facts are never true of production.
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

  async function timed(uid: string, sql: string, params: unknown[]): Promise<number> {
    await client.query("begin");
    try {
      await client.query(
        "select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)",
        [uid],
      );
      await client.query("set local statement_timeout = '120s'");
      const r = await client.query(
        `with a as materialized (select length((${sql})::text) as n)
         select n, (extract(epoch from clock_timestamp() - statement_timestamp()) * 1000)::float8 as ms,
                pg_current_xact_id_if_assigned() is null as ro from a`,
        params,
      );
      if (!r.rows[0].ro) throw new Error(`${sql} wrote something: it measured the no-memo path`);
      return Number(r.rows[0].ms);
    } finally {
      await client.query("rollback");
    }
  }
  async function median(uid: string, sql: string, params: unknown[]): Promise<number> {
    const t: number[] = [];
    for (let i = 0; i <= RUNS; i++) t.push(await timed(uid, sql, params));
    const warm = t.slice(1).sort((a, b) => a - b);
    return warm[Math.floor(warm.length / 2)]!;
  }

  let green = true;
  for (const email of SEATS) {
    const s = await client.query(
      `select u.id::text as id, array_agg(m.organization_id::text order by m.organization_id) as orgs
         from auth.users u
         join iam.organization_member m on m.user_id = u.id
         join iam.organizations o on o.id = m.organization_id and o.archived_at is null
        where u.email = $1 group by u.id`,
      [email],
    );
    const uid: string = s.rows[0].id;
    const orgs: string[] = s.rows[0].orgs;
    const measured: Array<[string, number]> = [
      ["context_tree", await median(uid, "custom.context_tree($1::uuid[])", [orgs])],
      ["data_home", await median(uid, "custom.data_home(null)", [])],
    ];
    for (const [door, ms] of measured) {
      const b = BUDGET[door]![email];
      const ok = b == null || ms <= b;
      green &&= ok;
      console.log(`${b == null ? "MEAS " : ok ? "GREEN" : "RED  "}  ${email.padEnd(16)} ${door.padEnd(14)} ${ms.toFixed(1).padStart(8)} ms  ${b == null ? "(measured)" : `<= ${b} ms`}  ${orgs.length} organizations`);
    }
  }
  await client.end();
  console.log(green ? "GREEN" : "RED");
  process.exit(green ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
