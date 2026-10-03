#!/usr/bin/env npx tsx
/**
 * CHAIR-DOORS-3A (a) — ARCHIVED ROWS ARE COUNTED IN ONE CALL: same answer (dev clone only).
 *
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/chairdoors3a_archived_count_same_answer.ts               # GREEN
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/chairdoors3a_archived_count_same_answer.ts --plant nolist # must go RED
 *
 * Needs migrations/campaign/chairdoors3a_a_archived_rows_are_counted_in_one_call.sql live on the clone. In ONE
 * REPEATABLE READ transaction, rolled back, as every seat lane 9's own harness uses (every member of an
 * organization that keeps a scope type, plus admin@admin.com and test@test.com in every organization holding an
 * archived scope type) and, per organization, every Table that holds an archived row (capped) plus one invented id:
 *   COUNT  custom.count_records_archived(org, tables, lane)                       — the new door, one call
 *   REF    custom.read_records_archived(org, table, lane) paged and counted, once per Table; a 42501 Table is
 *          "left out", as the new door leaves it out                              — the contract's own right side
 *   SET    custom.visible_set(seat, org, table, viewer) for every one of those Tables, live body and then the
 *          body before the file (from the inverse, put in place inside this transaction): byte-identical rows.
 * Both lanes ("org" for every seat, "mine" for the two test seats).
 *
 * --plant NAME puts a faulty copy of the file's body in place inside the transaction and expects RED:
 *   nolist   the count-only answer drops the "Only me" list rule
 *   mine     the count-only answer ignores the "mine" lane
 *   early    custom.visible_set answers all-visible for every Table that is not the kernel
 * Exit 0 GREEN, 1 RED, 2 could not run.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { testDbEnvFrom } from "../lib/direct-db-env";

const ROOT = resolve(__dirname, "..", "..");
const UP = resolve(ROOT, "migrations/campaign/chairdoors3a_a_archived_rows_are_counted_in_one_call.sql");
const INVERSE = resolve(ROOT, "migrations/inverse/chairdoors3a_a_archived_rows_are_counted_in_one_call_down.sql");
const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd";
const TEST = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";
const INVENTED = "00000000-0000-4000-8000-00000000c3a0";
const TABLES_PER_ORG = Number(process.env.TABLES_PER_ORG ?? 12);

function fn(file: string, name: string): string {
  const text = readFileSync(file, "utf8");
  const at = text.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  if (at < 0) throw new Error(`UNMEASURED: no ${name} body in ${file}`);
  const end = text.indexOf("$function$;", at);
  return text.slice(at, end + "$function$;".length);
}
function planted(name: string): string {
  const swap = (b: string, from: string, to: string) => {
    if (!b.includes(from)) throw new Error(`UNMEASURED: plant ${name} found nothing to change`);
    return b.replace(from, to);
  };
  switch (name) {
    case "nolist":
      return swap(fn(UP, "custom.read_records_archived"),
        "|| format(' and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, %L::uuid, %L::jsonb)',\n                v_me, custom._record_shown_to_ctx(array[p_organization_id], p_table_id)),\n      case when v_lane = 'mine'",
        ",\n      case when v_lane = 'mine'");
    case "mine":
      return swap(fn(UP, "custom.read_records_archived"),
        "case when v_lane = 'mine'\n           then format('custom.record_archiver(",
        "case when false\n           then format('custom.record_archiver(");
    case "early":
      return swap(fn(UP, "custom.visible_set"),
        "     and not exists (select 1 from custom.record t\n                      where t.organization_id = p_organization_id\n                        and t.id = p_table_id\n                        and t.deleted_at is null)\n     and not exists (select 1 from custom.record r\n                      where r.organization_id = p_organization_id\n                        and r.table_id = p_table_id\n                        and r.deleted_at is null) then\n    o_all_visible := true;",
        " then\n    o_all_visible := true;");
    default:
      throw new Error(`unknown plant ${name} (nolist | mine | early)`);
  }
}

async function main() {
  const plantAt = process.argv.indexOf("--plant");
  const plant = plantAt > 0 ? process.argv[plantAt + 1] : null;
  const plantBody = plant ? planted(plant) : null;
  const env = testDbEnvFrom(ROOT);
  const client = new pg.Client({
    user: env.user, password: env.password, host: env.host, database: env.database, port: 5432,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const who = await client.query(
    `select (select count(*) from cron.job where active)::int as jobs,
            exists (select 1 from pg_extension where extname = 'pg_net') as net,
            to_regprocedure('custom.count_records_archived(uuid,uuid[],text)') is not null as door`,
  );
  const { jobs, net, door } = who.rows[0];
  if (jobs !== 0 || net || /brsgrqvjdzwihsvnfqkf/.test(env.user)) {
    console.log(`REFUSED: ${env.user} is not the quarantined dev clone (cron ${jobs}, pg_net ${net}).`);
    process.exit(2);
  }
  if (!door) {
    console.log("UNMEASURED: custom.count_records_archived is not on the clone; apply the file first.");
    process.exit(2);
  }
  console.log(`# ${env.user} (${env.from})${plant ? `; plant ${plant}` : ""}`);

  await client.query("begin isolation level repeatable read");
  let red = 0;
  try {
    await client.query("set local statement_timeout = '900s'");
    await client.query("set local lock_timeout = '10s'");
    const seats = (
      await client.query(
        `with so as (select distinct r.organization_id as org from custom.record r
                      where r.table_id = custom.table_kernel_id() and r.data ->> 'kept_for' = 'context'),
              arch as (select distinct r.organization_id as org from custom.record r
                        where r.table_id = custom.table_kernel_id() and r.deleted_at is not null
                          and r.data ->> 'kept_for' = 'context')
         select m.user_id::text as uid, m.organization_id::text as org
           from so join iam.organization_member m on m.organization_id = so.org join auth.users u on u.id = m.user_id
         union
         select s.uid, a.org::text from arch a cross join (values ($1::text), ($2::text)) s(uid)
         order by 1, 2`,
        [ADMIN, TEST],
      )
    ).rows as { uid: string; org: string }[];
    const orgs = [...new Set(seats.map((s) => s.org))];
    const tablesOf = new Map<string, string[]>();
    for (const org of orgs) {
      const t = await client.query(
        `select x.table_id::text as t
           from (select r.table_id, count(*) as n,
                        bool_or(exists (select 1 from custom.record k where k.organization_id = r.organization_id
                                         and k.id = r.table_id and k.deleted_at is not null)) as archived_table
                   from custom.record r
                  where r.organization_id = $1::uuid and r.deleted_at is not null and r.table_id is not null
                    and r.table_id not in (custom.table_kernel_id(), custom.field_kernel_id())
                  group by r.table_id) x
          order by x.archived_table desc, x.n desc, x.table_id
          limit ${TABLES_PER_ORG}`,
        [org],
      );
      tablesOf.set(org, [...t.rows.map((r) => r.t as string), INVENTED]);
    }
    const nTables = [...tablesOf.values()].reduce((n, v) => n + v.length, 0);
    console.log(`# ${seats.length} (seat, organization) pairs, ${new Set(seats.map((s) => s.uid)).size} seats, ${orgs.length} organizations, ${nTables} (organization, Table) pairs`);

    async function as<T>(uid: string, run: () => Promise<T>, onErr: (code: string) => T): Promise<T> {
      await client.query("savepoint s");
      try {
        await client.query(
          "select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)",
          [uid],
        );
        await client.query("set local role authenticated");
        const out = await run();
        await client.query("reset role");
        await client.query("release savepoint s");
        return out;
      } catch (e) {
        await client.query("rollback to savepoint s");
        return onErr((e as { code?: string }).code ?? String(e));
      }
    }
    const countDoor = (uid: string, org: string, lane: string) =>
      as(uid, async () => {
        const r = await client.query(
          "select coalesce(jsonb_object_agg(c.table_id::text, c.n order by c.table_id), '{}'::jsonb)::text as v from custom.count_records_archived($1::uuid, $2::uuid[], $3) c",
          [org, tablesOf.get(org), lane],
        );
        return r.rows[0].v as string;
      }, (code) => `ERR ${code}`);
    // One role switch per (seat, organization); one savepoint per Table (a 42501 Table is "left out").
    const reference = (uid: string, org: string, lane: string) =>
      as(uid, async () => {
        const out: Record<string, number> = {};
        let wall: string | null = null;
        for (const t of [...tablesOf.get(org)!].sort()) {
          await client.query("savepoint t");
          try {
            let got = 0;
            for (;;) {
              const r = await client.query(
                "select count(*)::int as n from custom.read_records_archived($1::uuid, $2::uuid, $3, false, 200, $4) x",
                [org, t, lane, got],
              );
              got += r.rows[0].n;
              if (r.rows[0].n < 200) break;
            }
            await client.query("release savepoint t");
            out[t] = got;
          } catch (e) {
            await client.query("rollback to savepoint t");
            const err = e as { code?: string; message?: string };
            if (err.code !== "42501") throw e;
            // The organization's wall (custom.assert_client_may_reach) speaks before the Table decision does; a
            // Table she may not know is refused in the read door's own sentence. The new door refuses the whole
            // call at the wall and leaves an unknown Table out.
            if (!/^You do not have access to this table/.test(err.message ?? "")) wall = "ERR 42501";
          }
        }
        if (wall) return wall;
        return JSON.stringify(Object.fromEntries(Object.entries(out).sort(([x], [y]) => x.localeCompare(y))));
      }, (code) => `ERR ${code}`);
    const norm = (v: string) => (v.startsWith("ERR") ? v : JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(v)).sort(([a], [b]) => a.localeCompare(b)))));
    const setOf = async (uid: string, org: string) => {
      const r = await client.query(
        `select string_agg(t::text || '=' || (custom.visible_set($1::uuid, $2::uuid, t, 'viewer'::public.permission_level))::text, E'\\n' order by t) as v
           from unnest($3::uuid[]) t`,
        [uid, org, tablesOf.get(org)],
      );
      return r.rows[0].v as string;
    };

    if (plantBody) await client.query(plantBody);

    const lanes = (uid: string) => (uid === ADMIN || uid === TEST ? ["org", "mine"] : ["org"]);
    let same = 0, asked = 0, nonEmpty = 0, counted = 0, refusals = 0;
    const differ: string[] = [];
    let done = 0;
    for (const s of process.env.SKIP_COUNT ? [] : seats) {
      if (++done % 10 === 0) console.log(`# … ${done} of ${seats.length} seats asked`);
      for (const lane of lanes(s.uid)) {
        const got = norm(await countDoor(s.uid, s.org, lane));
        const ref = await reference(s.uid, s.org, lane);
        asked++;
        if (got === ref) same++;
        else differ.push(`${s.uid.slice(0, 8)}@${s.org.slice(0, 8)}/${lane}`);
        if (ref.startsWith("ERR")) refusals++;
        else {
          const o = JSON.parse(ref) as Record<string, number>;
          if (Object.keys(o).length) nonEmpty++;
          counted += Object.values(o).filter((n) => n > 0).length;
        }
      }
    }
    if (differ.length) red++;
    if (process.env.SKIP_COUNT) console.log('# COUNT phase skipped (SKIP_COUNT)');
    else
    console.log(`${differ.length ? "RED  " : "GREEN"} COUNT = REF: ${same} of ${asked} identical (${refusals} refused at the wall, ${nonEmpty} non-empty, ${counted} Tables with a count above 0)` +
      (differ.length ? `; differ: ${differ.slice(0, 8).join(", ")}` : ""));

    // custom.visible_set: the live body, then the body before the file, same transaction. Putting the
    // before-body in place assigns a transaction id, which turns the statement memos off for the rest of
    // the transaction; so the live body is asked with memos ON (information) and again with them OFF, and
    // it is the OFF answer that must equal the before-body's byte for byte.
    const liveOn = new Map<string, string>();
    for (const s of seats) liveOn.set(`${s.uid}|${s.org}`, await setOf(s.uid, s.org));
    await client.query("select pg_current_xact_id()");
    const live = new Map<string, string>();
    for (const s of seats) live.set(`${s.uid}|${s.org}`, await setOf(s.uid, s.org));
    await client.query(fn(INVERSE, "custom.visible_set"));
    const setDiff = [] as string[];
    let early = 0;
    for (const s of seats) {
      const before = await setOf(s.uid, s.org);
      if (before !== live.get(`${s.uid}|${s.org}`)) {
        setDiff.push(`${s.uid.slice(0, 8)}@${s.org.slice(0, 8)}`);
        const l = (live.get(`${s.uid}|${s.org}`) ?? "").split("\n"), b = before.split("\n");
        for (let i = 0; i < Math.max(l.length, b.length); i++) if (l[i] !== b[i]) console.log(`#   differs ${s.uid.slice(0, 8)}@${s.org.slice(0, 8)}\n#     live   ${l[i]}\n#     before ${b[i]}`);
      }
      early += (before.match(/=\(t,\{\},\{\},\{\},\{\},0,f,\)/g) ?? []).length;
    }
    if (setDiff.length) red++;
    const onOff = seats.filter((s) => liveOn.get(`${s.uid}|${s.org}`) !== live.get(`${s.uid}|${s.org}`)).length;
    console.log(`# custom.visible_set live with memos on = live with memos off for ${seats.length - onOff} of ${seats.length} seats (information: the memos change the ladder-call count, never the set)`);
    console.log(`${setDiff.length ? "RED  " : "GREEN"} custom.visible_set live (memos off) = before: ${seats.length - setDiff.length} of ${seats.length} seats identical over every Table asked` +
      ` (${early} answers of the early shape: all-visible, nothing listed, no ladder call)` +
      (setDiff.length ? `; differ: ${setDiff.slice(0, 8).join(", ")}` : ""));
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
  if (plant) {
    console.log(red ? `RED (${red}) — the plant was caught` : "GREEN — THE PLANT WAS NOT CAUGHT");
    process.exit(red ? 1 : 0);
  }
  console.log(red ? `RED (${red})` : "GREEN");
  process.exit(red ? 1 : 0);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
