#!/usr/bin/env npx tsx
/**
 * LANE 9 SCOPES-ON-THE-STORE (SCOPES-I) — THE ARCHIVED SCOPE TYPES WALK THE LADDER ONCE: same answer (dev clone only).
 *
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/scopesi_archived_types_same_answer.ts              # GREEN
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/scopesi_archived_types_same_answer.ts --plant cap1  # must go RED
 *
 * Needs migrations/campaign/scopesi_the_archived_scope_types_ask_the_ladder_once.sql live on the clone. In ONE
 * REPEATABLE READ transaction (one snapshot), rolled back, as every seat with scopes — every live member of an
 * organization that keeps a scope type, in each such organization, plus admin@admin.com and test@test.com in every
 * organization holding an archived scope type, members or not (a refusal is an answer too, compared by its code):
 *   ON   the live door, the transaction having written nothing: the statement memos are on, so the pairs this
 *        door names make the archive door walk containment once (counted per call from the transaction's own
 *        function statistics: custom.carrying_edges_in calls);
 *   OFF  the live door again after pg_current_xact_id(): every statement memo is off, each ask walks alone;
 *   REF  the body before the file, from its inverse, put in place INSIDE this transaction (memos off — the
 *        before-body names no memo of its own) and asked the same way.
 * GREEN when ON = REF and OFF = REF byte for byte for every (seat, organization), and every ON call that counted
 * more than one type walked once. Ruling 4 is the reference's own definition (each count is
 * custom.read_records_archived, asked as the seat); scopesb_version_and_archived_count_red_green.sql G4 holds it
 * to the archive door on a planted "Only me" row.
 *
 * --plant NAME puts a faulty copy of the file's body in place inside the transaction after REF and compares it to
 * REF the same way (memos off — a body written in this transaction cannot run with them on):
 *   cap1   every count over one reads as one                (admin's Workspace "Suppliers": admin sees 2)
 *   mine   the archive door asked in the "mine" lane         (scopes archived by someone else drop out)
 *   last   the last type asked is counted as 0               (every seat that sees a counted type)
 * Exit 0 GREEN, 1 RED, 2 could not run.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { requireRehearsalDbEnv } from "../lib/direct-db-env";

const ROOT = resolve(__dirname, "..", "..");
const UP = resolve(ROOT, "migrations/campaign/scopesi_the_archived_scope_types_ask_the_ladder_once.sql");
const INVERSE = resolve(ROOT, "migrations/inverse/scopesi_the_archived_scope_types_ask_the_ladder_once_down.sql");
const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd";
const TEST = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";
const DOOR = "custom.context_archived_types";

function body(file: string): string {
  const text = readFileSync(file, "utf8");
  const at = text.indexOf("CREATE OR REPLACE FUNCTION custom.context_archived_types(");
  if (at < 0) throw new Error(`UNMEASURED: no context_archived_types body in ${file}`);
  return text.slice(at);
}
function planted(name: string): string {
  const b = body(UP);
  const swap = (from: string, to: string) => {
    if (!b.includes(from)) throw new Error(`UNMEASURED: plant ${name} found nothing to change`);
    return b.replace(from, to);
  };
  switch (name) {
    case "cap1":
      return swap("jsonb_build_object(v_type::text, v_n);", "jsonb_build_object(v_type::text, least(v_n, 1));");
    case "mine":
      return swap("read_records_archived(p_organization_id, v_type, 'org',", "read_records_archived(p_organization_id, v_type, 'mine',");
    case "last":
      return swap(
        "v_counts := v_counts || jsonb_build_object(v_type::text, v_n);",
        "v_counts := v_counts || jsonb_build_object(v_type::text, case when v_pairs like '%' || v_type::text then 0 else v_n end);",
      );
    default:
      throw new Error(`unknown plant ${name} (cap1 | mine | last)`);
  }
}

async function main() {
  const plantAt = process.argv.indexOf("--plant");
  const plant = plantAt > 0 ? process.argv[plantAt + 1] : null;
  const plantBody = plant ? planted(plant) : null;
  const env = requireRehearsalDbEnv("scopesi_archived_types_same_answer installs function bodies");
  const client = new pg.Client({
    user: env.user, password: env.password, host: env.host, database: env.database, port: 5432,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const who = await client.query(
    `select (select count(*) from cron.job where active)::int as jobs,
            exists (select 1 from pg_extension where extname = 'pg_net') as net,
            encode(sha256(convert_to(pg_get_functiondef('custom.context_archived_types(uuid)'::regprocedure), 'UTF8')), 'hex') as live`,
  );
  const { jobs, net, live } = who.rows[0];
  if (jobs !== 0 || net || /brsgrqvjdzwihsvnfqkf/.test(env.user)) {
    console.log(`REFUSED: ${env.user} is not the quarantined dev clone (cron ${jobs}, pg_net ${net}).`);
    process.exit(2);
  }
  const want = (readFileSync(INVERSE, "utf8").match(/based-on: custom\.context_archived_types\(uuid\) ([0-9a-f]{64})/) ?? [])[1];
  if (live !== want) {
    console.log(`UNMEASURED: the live body (${live.slice(0, 12)}) is not the file's (${want?.slice(0, 12)}); apply it to the clone first.`);
    process.exit(2);
  }
  console.log(`# ${env.user} (${env.from}); live body ${live.slice(0, 12)} = the file's${plant ? `; plant ${plant}` : ""}`);

  await client.query("begin isolation level repeatable read");
  let red = 0;
  try {
    await client.query("set local statement_timeout = '600s'");
    await client.query("set local lock_timeout = '10s'");
    await client.query("set local track_functions = 'all'");
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
    console.log(`# ${seats.length} (seat, organization) pairs, ${new Set(seats.map((s) => s.uid)).size} seats`);

    const walksSoFar = async () =>
      Number((await client.query(
        "select coalesce(sum(calls), 0)::int as n from pg_stat_xact_user_functions where schemaname = 'custom' and funcname = 'carrying_edges_in'",
      )).rows[0].n);
    async function ask(uid: string, org: string): Promise<{ ans: string; walks: number; counted: number }> {
      const before = await walksSoFar();
      await client.query("savepoint s");
      try {
        await client.query(
          "select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)",
          [uid],
        );
        await client.query("set local role authenticated");
        const r = await client.query(`select ${DOOR}($1::uuid)::text as v`, [org]);
        await client.query("reset role");
        await client.query("release savepoint s");
        const v = JSON.parse(r.rows[0].v) as { archived_scope_count: number }[];
        return { ans: r.rows[0].v, walks: (await walksSoFar()) - before, counted: v.filter((x) => x.archived_scope_count > 0).length };
      } catch (e) {
        await client.query("rollback to savepoint s");
        return { ans: `ERR ${(e as { code?: string }).code ?? String(e)}`, walks: 0, counted: 0 };
      }
    }
    const phase = async (label: string) => {
      const out = new Map<string, { ans: string; walks: number; counted: number }>();
      for (const s of seats) out.set(`${s.uid}|${s.org}`, await ask(s.uid, s.org));
      const xid = (await client.query("select pg_current_xact_id_if_assigned()::text as x")).rows[0].x;
      console.log(`# ${label}: ${out.size} answers (transaction id ${xid ?? "none: memos on"})`);
      return out;
    };
    const on = await phase("ON");
    await client.query("select pg_current_xact_id()");
    const off = await phase("OFF");
    await client.query(body(INVERSE));
    const ref = await phase("REF (the before-body, in this transaction)");
    const compare = (label: string, got: Map<string, { ans: string }>) => {
      const diff = seats.filter((s) => got.get(`${s.uid}|${s.org}`)!.ans !== ref.get(`${s.uid}|${s.org}`)!.ans);
      if (diff.length) red++;
      console.log(`${diff.length ? "RED  " : "GREEN"} ${label} = REF: ${seats.length - diff.length} of ${seats.length} identical` +
        (diff.length ? `; differ: ${diff.slice(0, 8).map((s) => `${s.uid.slice(0, 8)}@${s.org.slice(0, 8)}`).join(", ")}` : ""));
    };
    if (plantBody) {
      await client.query(plantBody);
      compare(`PLANT ${plant} (memos off)`, await phase(`PLANT ${plant}`));
    } else {
      compare("ON  (memos on)", on);
      compare("OFF (memos off)", off);
      const multi = [...on.values()].filter((x) => x.counted > 1);
      const once = multi.filter((x) => x.walks === 1).length;
      const offWalks = [...off.values()].filter((x) => x.counted > 1).map((x) => x.walks);
      if (once !== multi.length) red++;
      console.log(`${once === multi.length ? "GREEN" : "RED  "} ON walked once in ${once} of ${multi.length} calls counting more than one type` +
        ` (OFF walked ${Math.min(...offWalks)}-${Math.max(...offWalks)} times in the same calls)`);
      const shown = [...ref.values()];
      console.log(`# REF: ${shown.filter((x) => x.ans.startsWith("ERR")).length} refusals, ` +
        `${shown.filter((x) => !x.ans.startsWith("ERR") && x.ans !== "[]").length} non-empty answers, ` +
        `${shown.reduce((n, x) => n + x.counted, 0)} counted types`);
    }
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
  console.log(red ? `RED (${red})` : "GREEN");
  process.exit(red ? 1 : 0);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
