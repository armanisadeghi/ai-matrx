#!/usr/bin/env npx tsx
/**
 * LANE 9 SCOPES-G — THE TIMING GATE for the agent hand-off, custom.resolve_context.
 *
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/scopesg_timing.ts                 (dev clone: before / after / floor)
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/scopesg_timing.ts --target production   (read-only: old vs live)
 *   flags: --reps 8 (rep 1 is the warm-up; the verdict is the median of the rest) · --seat admin|member|both
 *
 * THE SET (the parity sweep's turn, as SCOPES-HANDOFF-BUDGET judged it): for the seat, every live scope type of
 * every live organization she is an active member of, each with every live scope of it — the scopes as the
 * selection, the type as the active Table, no System item. The OLD hand-off is public.resolve_full_context (with
 * custom/scope_readers_read_the_store off it answers from the old tables), asked as the server asks it.
 *
 * HOW IT TIMES. Every call is its OWN read-only transaction and its own statement (an agent turn is one: the
 * store's statement memos live one statement, so a loop inside one statement would share them and flatter the
 * new side). Server side: clock_timestamp() - statement_timestamp() after the answer is materialized. Sides are
 * interleaved per (rep, type) in a rotating order, so the clone's load swings land on every side alike.
 *
 * ON THE CLONE (the default) three bodies are timed beside the old hand-off, each a session-temporary copy
 * (pg_temp) so all three are asked in one session: BEFORE = the body the inverse file restores, AFTER = the
 * migration file's, FLOOR = the after body with everything but the store's own doors cut out (custom.levels_of,
 * custom._where_ids_open_with, the organization wall and custom._read_record_with per record, the active Table's
 * where) — what no change to custom.resolve_context's own body can take away. A temporary copy is a SECURITY
 * DEFINER function the signed-in seat must EXECUTE, and the database's DDL sweeps revoke a client grant on any
 * definer that has no platform.client_callable_door row, so each copy carries one for the length of the run
 * (copied from custom.resolve_context's own row) and every such row is deleted when the run ends.
 *
 * VERDICTS (exit 1 on any RED):
 *   BUDGET    after / old <= 1.5 for each seat — and before / old > 1.5 (the gate is seen failing at the old body).
 *             On production: live / old <= 1.5.
 *   OWN BODY  after / floor <= 1.10 — custom.resolve_context's own work adds at most 10% to the store doors it
 *             calls — and before / floor > 1.10 (seen failing at the old body).
 *   SAME      before and after hand every (seat, type) the same bytes (md5 of the answer less resolved_at).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { currentCloneRef, dsnFor } from "../lib/pooled-db.mjs";

const ROOT = resolve(__dirname, "..", "..");
const UP = "migrations/campaign/scopesg_the_agent_handoff_reads_each_tables_fields_by_its_own_key.sql";
const DOWN = "migrations/inverse/scopesg_the_agent_handoff_reads_each_tables_fields_by_its_own_key_down.sql";
const SEATS: Record<string, string> = {
  admin: "87a6e699-3622-4869-8843-d0867456c0dd", // admin@admin.com
  member: "4060701e-706a-4c76-b3ca-0bbc69fa5a14", // test@test.com
};
const BUDGET = 1.5;
const OWN_BODY = 1.1;
const CTX = "00000000-0000-4000-8000-0000000c0de2";
const DOOR_REASON = "lane 9 SCOPES-G timing harness: a session-temporary copy of custom.resolve_context, removed when the run ends";
const SIG = "(text,uuid,uuid[],uuid[],text[])";

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const TARGET = arg("target", "clone");
const REPS = Number(arg("reps", "8"));
const SEAT_ARG = arg("seat", "both");

/** The CREATE OR REPLACE statement of custom.resolve_context in a file, renamed into pg_temp. */
function bodyFrom(file: string, name: string): string {
  const text = readFileSync(resolve(ROOT, file), "utf8");
  const at = text.indexOf("CREATE OR REPLACE FUNCTION custom.resolve_context(");
  if (at < 0) throw new Error(`${file}: no CREATE OR REPLACE FUNCTION custom.resolve_context( in it`);
  return text.slice(at).replace("CREATE OR REPLACE FUNCTION custom.resolve_context(", `CREATE OR REPLACE FUNCTION pg_temp.${name}(`);
}

/** The floor: the after body with its own work cut out — only the store doors it calls are left. */
function floorFrom(after: string): string {
  const read = "      continue;\n    end;\n";
  const labels = "  -- ── SCOPE LABELS";
  if (after.split(read).length !== 2 || after.split(labels).length !== 2) {
    throw new Error("NOT MEASURED: the floor's two cut points are not each in the after body exactly once");
  }
  return after
    .replace("CREATE OR REPLACE FUNCTION pg_temp.sg_after(", "CREATE OR REPLACE FUNCTION pg_temp.sg_floor(")
    .replace(read, read + "    continue;  -- FLOOR: the record has been read; nothing of this body's own work follows\n")
    .replace(labels, "  return jsonb_build_object('floor', true);  -- FLOOR\n" + labels);
}

function connection(): pg.ClientConfig {
  if (TARGET === "production") {
    return { connectionString: dsnFor("production", { app: "lane9-scopes-g-timing" }), ssl: { rejectUnauthorized: false } };
  }
  // THE CLONE over its DIRECT host: one real backend for the whole run (the pooler may hand two statements of
  // one client to two backends, and the session-temporary copies live in one).
  const url = new URL(dsnFor("clone", { app: "lane9-scopes-g-timing" }));
  const ref = currentCloneRef();
  return {
    host: `db.${ref}.supabase.co`, port: 5432, user: "postgres", password: decodeURIComponent(url.password),
    database: "postgres", ssl: { rejectUnauthorized: false }, application_name: "lane9-scopes-g-timing",
  };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

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
  console.log(`# ${TARGET}: ${REPS} reps (rep 1 warm-up), one read-only transaction per call, sides interleaved`);

  const sides: { name: string; fn: string | null }[] = [{ name: "old", fn: null }];
  if (TARGET === "clone") {
    const before = bodyFrom(DOWN, "sg_before");
    const after = bodyFrom(UP, "sg_after");
    const floor = floorFrom(after);
    await client.query(`delete from platform.client_callable_door where reason = $1`, [DOOR_REASON]);
    await client.query("begin");
    for (const sql of [before, after, floor]) await client.query(sql);
    for (const fn of ["sg_before", "sg_after", "sg_floor"]) {
      await client.query(
        `insert into platform.client_callable_door (schema_name, function_name, identity_args, reason, signed_in_callers, argument_rules)
         select n.nspname, p.proname, d.identity_args, $2, true, d.argument_rules
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace, platform.client_callable_door d
          where p.oid = $1::regprocedure and d.schema_name = 'custom' and d.function_name = 'resolve_context'`,
        [`pg_temp.${fn}${SIG}`, DOOR_REASON],
      );
      await client.query(`grant execute on function pg_temp.${fn}${SIG} to authenticated`);
    }
    await client.query("commit");
    sides.push({ name: "before", fn: "pg_temp.sg_before" }, { name: "after", fn: "pg_temp.sg_after" }, { name: "floor", fn: "pg_temp.sg_floor" });
  } else {
    sides.push({ name: "live", fn: "custom.resolve_context" });
  }

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
      )).rows as { type_id: string; scope_ids: string[] }[];
      const ms: Record<string, number[][]> = {}; // side -> rep -> per type
      const md5: Record<string, Set<string>[]> = {}; // side -> per type: digests seen
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
                  `select md5(j::text) as h, (extract(epoch from clock_timestamp() - statement_timestamp()) * 1000)::float8 as ms
                     from (select public.resolve_full_context($1::uuid, 'conversation', $2::uuid, $3::uuid[], '{}'::text[]) as j offset 0) x`,
                  [uid, CTX, types[t].scope_ids],
                );
              } else {
                await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
                await client.query("set local role authenticated");
                r = await client.query(
                  `select md5((j - 'resolved_at')::text) as h, (extract(epoch from clock_timestamp() - statement_timestamp()) * 1000)::float8 as ms
                     from (select ${s.fn}('conversation', $1::uuid, $2::uuid[], $3::uuid[], '{}'::text[]) as j offset 0) x`,
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
        console.log(`  ${s.name.padEnd(7)} median of ${REPS - 1} = ${totals[s.name].toFixed(0).padStart(7)} ms   ${s.name === "old" ? "" : `${(totals[s.name] / totals.old).toFixed(2)}x old`}   reps ${reps.join(" ")}`);
      }
      const verdict = (ok: boolean, line: string) => { console.log(`  ${ok ? "GREEN" : "RED  "} ${line}`); if (!ok) red = true; };
      if (TARGET === "clone") {
        const before = totals.before / totals.old, after = totals.after / totals.old;
        verdict(before > BUDGET, `BUDGET seen failing at the old body: before ${before.toFixed(2)}x > ${BUDGET}x`);
        verdict(after <= BUDGET, `BUDGET after ${after.toFixed(2)}x <= ${BUDGET}x the old hand-off`);
        const ob = totals.before / totals.floor, oa = totals.after / totals.floor;
        verdict(ob > OWN_BODY, `OWN BODY seen failing at the old body: before ${ob.toFixed(2)}x the floor > ${OWN_BODY}x`);
        verdict(oa <= OWN_BODY, `OWN BODY after ${oa.toFixed(2)}x the floor <= ${OWN_BODY}x (floor = the store doors alone, ${(totals.floor / totals.old).toFixed(2)}x old)`);
        const differ = types.filter((_, t) => md5.before[t].size !== 1 || md5.after[t].size !== 1 || [...md5.before[t]][0] !== [...md5.after[t]][0]).length;
        verdict(differ === 0, `SAME ${types.length - differ}/${types.length} types: before and after answer the same bytes on every rep`);
      } else {
        const live = totals.live / totals.old;
        verdict(live <= BUDGET, `BUDGET live ${live.toFixed(2)}x <= ${BUDGET}x the old hand-off`);
      }
    }
  } finally {
    if (TARGET === "clone") await client.query(`delete from platform.client_callable_door where reason = $1`, [DOOR_REASON]);
    await client.end();
  }
  console.log(red ? "\nscopesg_timing: RED" : "\nscopesg_timing: ALL GREEN");
  process.exit(red ? 1 : 0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
