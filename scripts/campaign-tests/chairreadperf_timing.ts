#!/usr/bin/env npx tsx
/**
 * CHAIR-READPERF — THE TIMING AND PARITY GATE for the store doors under the agent hand-off.
 *
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/chairreadperf_timing.ts --label before --dump /tmp/x/before.json
 *   … apply the chairreadperf files to the clone …
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/chairreadperf_timing.ts --label after  --dump /tmp/x/after.json --same /tmp/x/before.json
 *   flags: --target clone|production (default clone) · --reps 7 (rep 1 is the warm-up; the verdict is the median
 *          of the rest) · --seat admin|member|both · --probe (time the three doors on their own as well)
 *
 * THE SET is lane 9 sublane G's (scopesg_timing.ts): for the seat, every live scope type of every live organization
 * she is an active member of, each with every live scope of it — the scopes as the selection, the type as the active
 * Table, no System item. The OLD hand-off is public.resolve_full_context, the LIVE one custom.resolve_context as
 * the database holds it right now. Every call is its own read-only transaction and statement, timed on the server
 * once the answer is materialized and before it is hashed; the sides are interleaved per (rep, type).
 *
 * Unlike scopesg_timing.ts this gate does not carry its own copies of a body: the doors it measures
 * (custom.levels_of, custom._read_record_with, custom._where_ids_open_with) are called by schema-qualified name
 * from inside custom.resolve_context, so the way to see "after" is to apply the files to the clone and run again.
 * `--dump` writes every (seat, type) answer digest and the timings; `--same <before.json>` compares this run's
 * digests with that file's and is RED when any (seat, type) answers different bytes.
 *
 * VERDICTS (exit 1 on any RED):
 *   BUDGET  live / old <= 1.5 for each seat.
 *   SAME    (with --same) every (seat, type) digest equals the earlier run's.
 */
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { currentCloneRef, dsnFor } from "../lib/pooled-db.mjs";

const SEATS: Record<string, string> = {
  admin: "87a6e699-3622-4869-8843-d0867456c0dd", // admin@admin.com
  member: "4060701e-706a-4c76-b3ca-0bbc69fa5a14", // test@test.com
};
const BUDGET = 1.5;
const CTX = "00000000-0000-4000-8000-0000000c0de2";

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const TARGET = arg("target", "clone");
const REPS = Number(arg("reps", "7"));
const SEAT_ARG = arg("seat", "both");
const LABEL = arg("label", "run");
const DUMP = arg("dump", "");
const SAME = arg("same", "");
const PROBE = process.argv.includes("--probe");

function connection(): pg.ClientConfig {
  if (TARGET === "production") {
    return { connectionString: dsnFor("production", { app: "chair-readperf-timing" }), ssl: { rejectUnauthorized: false }, keepAlive: true, query_timeout: 300_000 };
  }
  // THE CLONE over its DIRECT host: one real backend for the whole run.
  const url = new URL(dsnFor("clone", { app: "chair-readperf-timing" }));
  const ref = currentCloneRef();
  return {
    host: `db.${ref}.supabase.co`, port: 5432, user: "postgres", password: decodeURIComponent(url.password),
    database: "postgres", ssl: { rejectUnauthorized: false }, application_name: "chair-readperf-timing",
    keepAlive: true, query_timeout: 300_000,
  };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

type TypeRow = { type_id: string; scope_ids: string[] };
type SeatDump = { types: Record<string, string>; totals: Record<string, number>; probes?: Record<string, unknown> };

/** The door probes run as the store's owner with the seat's claims: the three doors are internal (no client
 *  grant), and auth.uid() — the person every one of them reads — comes from the claims. The organization wall
 *  is memoized for the owner, so the probe measures the doors' own work. */
async function asSeat(client: pg.Client, uid: string) {
  await client.query("begin isolation level repeatable read read only");
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
}

async function probeDoors(client: pg.Client, uid: string, types: TypeRow[]): Promise<Record<string, unknown>> {
  // the biggest type and the biggest type of at most 20 scopes (the "Classes" shape)
  const big = [...types].sort((a, b) => b.scope_ids.length - a.scope_ids.length)[0];
  const small = [...types].filter((t) => t.scope_ids.length >= 5 && t.scope_ids.length <= 20).sort((a, b) => b.scope_ids.length - a.scope_ids.length)[0] ?? big;
  const out: Record<string, unknown> = {};
  for (const [name, t] of [["big", big], ["small", small]] as const) {
    const reps: Record<string, number[]> = { levels_of: [], where_ids: [], read_records: [] };
    let n = 0;
    for (let rep = 0; rep < 4; rep++) {
      await asSeat(client, uid);
      try {
        const lv = await client.query(
          `select (extract(epoch from clock_timestamp() - statement_timestamp()) * 1000)::float8 as ms, j
             from (select custom.levels_of($1::uuid, $2::uuid[]) as j offset 0) x`, [uid, t.scope_ids]);
        if (rep > 0) reps.levels_of.push(lv.rows[0].ms);
        const wh = await client.query(
          `select (extract(epoch from clock_timestamp() - statement_timestamp()) * 1000)::float8 as ms, j
             from (select custom._where_ids_open_with($1::uuid[], $2::uuid, $3::jsonb) as j offset 0) x`, [t.scope_ids, uid, lv.rows[0].j]);
        if (rep > 0) reps.where_ids.push(wh.rows[0].ms);
        // every admitted record read through the one read door, the cache carried as resolve_context carries it
        const notices: string[] = [];
        const onNotice = (m: { message?: string }) => { if (m.message?.startsWith("READ ")) notices.push(m.message); };
        client.on("notice", onNotice);
        await client.query(
          `do $do$ declare c jsonb := '{}'::jsonb; d jsonb; t0 timestamptz; n int := 0; r record;
                        lv jsonb := ${client.escapeLiteral(JSON.stringify(lv.rows[0].j))}::jsonb;
                        wh jsonb := ${client.escapeLiteral(JSON.stringify(wh.rows[0].j))}::jsonb;
           begin
             t0 := clock_timestamp();
             for r in select e.key::uuid as id, (e.value ->> 'organization_id')::uuid as org from jsonb_each(wh) e
                       where e.value ->> 'kind' = 'record' and coalesce((e.value ->> 'live')::boolean, true) loop
               begin
                 select w.o_doc, w.o_cache into d, c from custom._read_record_with(r.org, r.id, false, lv, c) w;
                 n := n + 1;
               exception when others then null;
               end;
             end loop;
             raise notice 'READ % %', n, extract(epoch from clock_timestamp() - t0) * 1000;
           end $do$`);
        client.off("notice", onNotice);
        const m = notices.at(-1)?.match(/^READ (\d+) ([\d.]+)/);
        if (m) { n = Number(m[1]); if (rep > 0) reps.read_records.push(Number(m[2])); }
      } finally {
        await client.query("rollback");
      }
    }
    out[name] = {
      type_id: t.type_id, scopes: t.scope_ids.length, records_read: n,
      levels_of_ms: median(reps.levels_of), where_ids_ms: median(reps.where_ids), read_records_ms: median(reps.read_records),
      per_record_ms: n ? median(reps.read_records) / n : null,
    };
  }
  return out;
}

async function main() {
  const client = new pg.Client(connection());
  await client.connect();
  const who = (await client.query(
    `select (select count(*) from cron.job where active)::int as jobs,
            exists (select 1 from pg_extension where extname = 'pg_net') as net`,
  )).rows[0];
  const onClone = who.jobs === 0 && !who.net;
  if (TARGET === "clone" && !onClone) throw new Error("REFUSED: --target clone reached a database that is not the quarantined dev clone");
  if (TARGET === "production" && onClone) throw new Error("REFUSED: --target production reached the clone");
  const bodies = (await client.query(
    `select p.proname, left(encode(sha256(pg_get_functiondef(p.oid)::bytea), 'hex'), 8) as sha
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'custom' and p.proname in ('levels_of', '_read_record_with', '_where_ids_open_with', 'resolve_context')
      order by 1`)).rows.map((r: { proname: string; sha: string }) => `${r.proname}=${r.sha}`).join(" ");
  console.log(`# ${LABEL} on ${TARGET}: ${REPS} reps (rep 1 warm-up), one read-only transaction per call, sides interleaved`);
  console.log(`# live bodies: ${bodies}`);

  const sides = [{ name: "old", fn: null as string | null }, { name: "live", fn: "custom.resolve_context" }];
  const dump: Record<string, SeatDump> = {};
  const earlier: Record<string, SeatDump> | null = SAME ? JSON.parse(readFileSync(SAME, "utf8")).seats : null;
  let red = false;
  try {
    for (const seat of SEAT_ARG === "both" ? ["admin", "member"] : [SEAT_ARG]) {
      const uid = SEATS[seat];
      const types = (await client.query(
        `select st.id as type_id, coalesce(array_agg(s.id order by s.name, s.id) filter (where s.id is not null), '{}') as scope_ids
           from context.scope_types st
           join iam.organizations o on o.id = st.organization_id and o.archived_at is null
           left join context.scopes s on s.scope_type_id = st.id and s.deleted_at is null
          where st.deleted_at is null
            and exists (select 1 from iam.memberships m where m.user_id = $1 and m.organization_id = st.organization_id
                         and m.container_type = 'organization' and m.status = 'active')
          group by st.id order by count(s.id), st.id`, [uid],
      )).rows as TypeRow[];
      const ms: Record<string, number[][]> = {};
      const md5: Record<string, Set<string>[]> = {};
      for (const s of sides) { ms[s.name] = []; md5[s.name] = types.map(() => new Set()); }
      for (let rep = 0; rep < REPS; rep++) {
        for (const s of sides) ms[s.name].push(new Array(types.length).fill(0));
        for (let t = 0; t < types.length; t++) {
          for (let k = 0; k < sides.length; k++) {
            const s = sides[(k + rep + t) % sides.length];
            await client.query("begin isolation level repeatable read read only");
            try {
              let r;
              if (s.fn === null) {
                await client.query("set local role none");
                r = await client.query(
                  `select md5(j::text) as h, ms
                     from (select j, (extract(epoch from clock_timestamp() - statement_timestamp()) * 1000)::float8 as ms
                             from (select public.resolve_full_context($1::uuid, 'conversation', $2::uuid, $3::uuid[], '{}'::text[]) as j offset 0) x
                           offset 0) y`,
                  [uid, CTX, types[t].scope_ids],
                );
              } else {
                await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
                await client.query("set local role authenticated");
                r = await client.query(
                  `select md5((j - 'resolved_at')::text) as h, ms
                     from (select j, (extract(epoch from clock_timestamp() - statement_timestamp()) * 1000)::float8 as ms
                             from (select ${s.fn}('conversation', $1::uuid, $2::uuid[], $3::uuid[], '{}'::text[]) as j offset 0) x
                           offset 0) y`,
                  [CTX, types[t].scope_ids, [types[t].type_id]],
                );
              }
              ms[s.name][rep][t] = r.rows[0].ms;
              md5[s.name][t].add(r.rows[0].h);
            } finally {
              await client.query("rollback");
            }
          }
        }
      }
      const sum = (name: string) => median(ms[name].slice(1).map((row) => row.reduce((a, b) => a + b, 0)));
      const scopes = types.reduce((a, t) => a + t.scope_ids.length, 0);
      console.log(`\n## ${seat} (${uid}): ${types.length} scope types, ${scopes} scopes`);
      const totals: Record<string, number> = {};
      for (const s of sides) {
        totals[s.name] = sum(s.name);
        const reps = ms[s.name].slice(1).map((row) => Math.round(row.reduce((a, b) => a + b, 0)));
        console.log(`  ${s.name.padEnd(5)} median of ${REPS - 1} = ${totals[s.name].toFixed(0).padStart(7)} ms   ${s.name === "old" ? "" : `${(totals[s.name] / totals.old).toFixed(2)}x old`}   reps ${reps.join(" ")}`);
      }
      const verdict = (ok: boolean, line: string) => { console.log(`  ${ok ? "GREEN" : "RED  "} ${line}`); if (!ok) red = true; };
      verdict(totals.live / totals.old <= BUDGET, `BUDGET live ${(totals.live / totals.old).toFixed(2)}x <= ${BUDGET}x the old hand-off`);
      const unstable = types.filter((_, t) => md5.live[t].size !== 1).length;
      verdict(unstable === 0, `STABLE ${types.length - unstable}/${types.length} types answer the same bytes on every rep`);
      const typesDump: Record<string, string> = {};
      types.forEach((ty, t) => { typesDump[ty.type_id] = [...md5.live[t]].sort().join("|"); });
      const seatDump: SeatDump = { types: typesDump, totals };
      if (earlier) {
        const was = earlier[seat]?.types ?? {};
        const keys = Object.keys(typesDump);
        const differ = keys.filter((k) => was[k] !== undefined && was[k] !== typesDump[k]);
        const missing = keys.filter((k) => was[k] === undefined);
        verdict(differ.length === 0 && missing.length === 0, `SAME ${keys.length - differ.length}/${keys.length} types answer the bytes of ${SAME}${differ.length ? ` (differ: ${differ.join(", ")})` : ""}${missing.length ? ` (${missing.length} not in the earlier run)` : ""}`);
        const e = earlier[seat]?.totals;
        if (e) console.log(`  earlier: old ${e.old.toFixed(0)} ms, live ${e.live.toFixed(0)} ms (${(e.live / e.old).toFixed(2)}x); now ${(totals.live / totals.old).toFixed(2)}x`);
      }
      if (PROBE) {
        seatDump.probes = await probeDoors(client, uid, types);
        for (const [k, v] of Object.entries(seatDump.probes)) {
          const p = v as Record<string, number | string | null>;
          console.log(`  doors/${k}: ${p.scopes} scopes, ${p.records_read} read — levels_of ${Number(p.levels_of_ms).toFixed(1)} ms, where_ids ${Number(p.where_ids_ms).toFixed(1)} ms, reads ${Number(p.read_records_ms).toFixed(1)} ms (${p.per_record_ms === null ? "-" : Number(p.per_record_ms).toFixed(2)} ms/record)`);
        }
      }
      dump[seat] = seatDump;
      if (DUMP) writeFileSync(DUMP, JSON.stringify({ label: LABEL, target: TARGET, bodies, at: new Date().toISOString(), seats: dump }, null, 1));
    }
  } finally {
    await client.end();
  }
  if (DUMP) writeFileSync(DUMP, JSON.stringify({ label: LABEL, target: TARGET, bodies, at: new Date().toISOString(), seats: dump }, null, 1));
  console.log(red ? "\nchairreadperf_timing: RED" : "\nchairreadperf_timing: ALL GREEN");
  process.exit(red ? 1 : 0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
