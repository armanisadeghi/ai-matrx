#!/usr/bin/env npx tsx
/**
 * `refresh-merge-proof.ts` — RED THEN GREEN for §13's MERGE.
 *
 * WHAT IT PROVES, and why each half is needed
 * -------------------------------------------
 * §13 turns THE REFRESH from a replace into a merge because a replace ninety
 * minutes before the terminal gate would `delete from platform.associations` and
 * `platform.reachability` and take the campaign's entire relation graph with it.
 * The claim is therefore a NEGATIVE — "this cannot destroy the campaign's rows" —
 * and a negative is only ever shown by making it happen on purpose first.
 *
 *   RED, in a disposable `zz_w0_*` schema and NEVER against the live branch
 *   tables: the replace path (`replaceDeleteSql`, the exact statement
 *   `restore-graph.ts` runs today for a `replace` table) takes the campaign-owned
 *   count to ZERO.
 *
 *   GREEN, in that same schema and against the same planted rows: the merge
 *   path (`mergeInsertSql` + `mergeDeleteSql`, the exact statements
 *   `restore-graph.ts --merge` runs) leaves the campaign-owned count EQUAL and
 *   NON-ZERO, while the production-origin rows MOVE — updated, and the ones the
 *   new snapshot no longer holds deleted. A merge that changed nothing would pass
 *   a "campaign rows survived" check by doing nothing at all, so the movement is
 *   asserted too.
 *
 *   GREEN ON THE REAL BRANCH: a campaign-marked association is planted on
 *   `platform.associations` — which makes the live trigger write the matching
 *   `platform.reachability` row, so both tables §13 names carry a planted row —
 *   `restore-graph.ts --merge` is run for real, and BOTH rows are still there
 *   afterwards with the receipt counting them as spared. The planted rows are
 *   removed in a `finally`, whatever happened.
 *
 * WHY THE `zz_w0_*` SCHEMA EXISTS AT ALL. Rule 2: the RED half runs in a
 * disposable schema, never by weakening a real file and never against a real
 * table. `delete from platform.associations` on the branch would destroy exactly
 * what this campaign is building — so the statement under test is pointed at a
 * copy that carries the same shape, the same primary key and the same unique
 * constraints, and the schema is dropped at the end of the run.
 *
 * 🚨 THE ZZ TABLES CARRY AN `origin` COLUMN AND THE REAL ONES DO NOT (measured
 * 2026-09-17). `W1-REL` has not landed it yet. That is not a hole in the proof,
 * it is the reason the proof is shaped this way: the zz half exercises §13's OWN
 * marker end to end, so the predicate that will run once the column exists is
 * proven now; the live half exercises the conservative fallback the merge uses
 * until then. Both are real runs of the shipped code.
 *
 *   npx tsx scripts/gate-corpus/refresh-merge-proof.ts              both halves
 *   npx tsx scripts/gate-corpus/refresh-merge-proof.ts --red-only   the zz half
 *   npx tsx scripts/gate-corpus/refresh-merge-proof.ts --skip-merge plant + check
 *                                                                   without
 *                                                                   re-running
 *                                                                   the merge
 *
 * THE BRANCH, NEVER PRODUCTION. The only connection this file opens comes from
 * `SUPABASE_BRANCH_DATABASE_URL`, and it is checked against `plan/BRANCH-REF`'s
 * `system_identifier` before a single statement runs — the same refusal every
 * other gate-corpus runner makes.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadBranchDbEnv, loadBranchRef } from "../lib/migration-target";
import {
  type Marker,
  campaignOwnedPredicate,
  mergeDeleteSql,
  mergeInsertSql,
  replaceDeleteSql,
  resolveMarker,
  withSnapshotKeys,
} from "./merge-plan";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
} as const;
const OK = `${C.green}[ OK ]${C.reset}`;
const FAIL = `${C.red}[FAIL]${C.reset}`;
const INFO = `${C.dim}[INFO]${C.reset}`;

/**
 * THE PLANTED ROWS' IDS, fixed and recognisable on sight.
 *
 * `dd000000-…` is this proof's own prefix — `W0-CORPUS` owns `d0000000-%` and
 * `c5000000-%`, so a planted row can never be mistaken for a corpus row, and a
 * leftover is one `delete … where id like 'dd000000-%'` away from gone. Every id
 * is written out rather than generated, so a run that dies before its `finally`
 * leaves a fingerprint anybody can clean up without reading this file.
 */
const PLANT = {
  assocId: "dd000000-0000-4000-8000-000000000001",
  sourceId: "dd000000-0000-4000-8000-0000000000a1",
  targetId: "dd000000-0000-4000-8000-0000000000b1",
  sourceType: "corpus_home_b",
  targetType: "corpus_item",
  role: "holds",
} as const;

const ASSOC = "platform.associations";
const REACH = "platform.reachability";

let failures = 0;
const fail = (what: string) => {
  failures += 1;
  console.error(`${FAIL}${what}`);
};
const ok = (what: string) => console.log(`${OK}${what}`);

async function count(c: pg.Client, sql: string, values: unknown[] = []): Promise<number> {
  const r = await c.query<{ n: string }>(sql, values);
  return Number(r.rows[0]!.n);
}

/** Every non-generated column of a table, quoted, in attribute order. */
async function columnList(c: pg.Client, qualified: string): Promise<string[]> {
  const [schema, table] = qualified.split(".");
  const r = await c.query<{ attname: string }>(
    `select a.attname from pg_attribute a
       join pg_class k on k.oid = a.attrelid
       join pg_namespace n on n.oid = k.relnamespace
      where n.nspname = $1 and k.relname = $2 and a.attnum > 0
        and not a.attisdropped and a.attgenerated = ''
      order by a.attnum`,
    [schema, table],
  );
  return r.rows.map((x) => x.attname);
}

async function pkOf(c: pg.Client, qualified: string): Promise<string[]> {
  const r = await c.query<{ attname: string }>(
    `select a.attname from pg_constraint k
       join lateral unnest(k.conkey) with ordinality u(attnum, ord) on true
       join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.attnum
      where k.conrelid = $1::regclass and k.contype = 'p' order by u.ord`,
    [qualified],
  );
  return r.rows.map((x) => x.attname);
}

// ────────────────────────────────────────────────────────────────────────────
// RED and GREEN in a disposable schema, over §13's OWN marker
// ────────────────────────────────────────────────────────────────────────────
async function zzHalf(branch: pg.Client, schema: string): Promise<void> {
  console.log(`\n${C.bold}── RED / GREEN in ${schema} — §13's own \`origin\` marker ──${C.reset}`);
  await branch.query(`create schema ${schema}`);

  // THE FIXTURE IS WRITTEN OUT, NOT `LIKE`d, and the reason is a live guard.
  // `create table … (like platform.associations …)` is REFUSED by the DB-wide
  // `ddl_guard` event trigger — "an entity-looking table created outside
  // platform.create_entity_table", because the copied shape carries four of the
  // seven columns it counts (measured 2026-09-17). The documented escape is to
  // DISABLE that event trigger for the statement, and this proof will not: it is
  // database-wide, another lane is applying DDL to this same branch right now,
  // and turning a guard off to make a test pass is the thing the campaign's own
  // rules forbid by name.
  //
  // So the fixture carries EXACTLY what the statements under test read — the
  // primary key, the natural unique key, and the marker column — and nothing
  // else. What is proven is the row disposition, which is all these three
  // statements do; the real tables' remaining columns ride along in the `set`
  // list and never appear in a predicate.
  await branch.query(
    `create table ${schema}.associations (
       id uuid primary key,
       source_type text not null,
       source_id uuid not null,
       target_type text not null,
       target_id uuid not null,
       role text,
       label text,
       origin text,
       constraint associations_unique unique nulls not distinct (source_type, source_id, target_type, target_id, role)
     )`,
  );
  await branch.query(
    `insert into ${schema}.associations (id, source_type, source_id, target_type, target_id, role, label)
       select id, source_type, source_id, target_type, target_id, role, label from ${ASSOC} limit 200`,
  );
  await branch.query(
    `create table ${schema}.reachability (
       container_type text not null,
       container_id uuid not null,
       item_type text not null,
       item_id uuid not null,
       depth integer not null,
       origin text,
       primary key (container_type, container_id, item_type, item_id)
     )`,
  );
  await branch.query(
    `insert into ${schema}.reachability (container_type, container_id, item_type, item_id, depth)
       select container_type, container_id, item_type, item_id, depth from ${REACH} limit 200`,
  );

  // ── plant two campaign rows, one per table ────────────────────────────────
  const plantAssoc = async () =>
    branch.query(
      `insert into ${schema}.associations (id, source_type, source_id, target_type, target_id, role, label, origin)
       values ($1::uuid, $2, $3::uuid, $4, $5::uuid, $6, 'planted by refresh-merge-proof', 'campaign')`,
      [
        PLANT.assocId,
        PLANT.sourceType,
        PLANT.sourceId,
        PLANT.targetType,
        PLANT.targetId,
        PLANT.role,
      ],
    );
  const plantReach = async () =>
    branch.query(
      `insert into ${schema}.reachability (container_type, container_id, item_type, item_id, depth, origin)
       values ($1, $2::uuid, $3, $4::uuid, 1, 'campaign')`,
      [PLANT.sourceType, PLANT.sourceId, PLANT.targetType, PLANT.targetId],
    );
  await plantAssoc();
  await plantReach();

  const campaignRows = async (table: string) =>
    count(branch, `select count(*)::text n from ${schema}.${table} where origin = 'campaign'`);
  const productionRows = async (table: string) =>
    count(branch, `select count(*)::text n from ${schema}.${table} where origin is distinct from 'campaign'`);

  const beforeRed = { a: await campaignRows("associations"), r: await campaignRows("reachability") };
  if (beforeRed.a < 1 || beforeRed.r < 1) {
    fail(`the fixture planted ${beforeRed.a} association(s) and ${beforeRed.r} reachability row(s) — the proof needs at least one of each, or RED and GREEN both read zero and both "pass".`);
    return;
  }
  ok(
    `fixture: ${schema} holds ${await productionRows("associations")} production-origin association(s) ` +
      `and ${beforeRed.a} campaign-origin, ${await productionRows("reachability")} production-origin ` +
      `reachability row(s) and ${beforeRed.r} campaign-origin`,
  );

  // ── RED: the replace path, the statement restore-graph runs today ─────────
  await branch.query("begin");
  for (const name of ["associations", "reachability"]) {
    const sql = replaceDeleteSql(`${schema}.${name}`);
    console.log(`${INFO}RED runs the shipped replace statement: ${C.dim}${sql}${C.reset}`);
    await branch.query(sql);
  }
  const afterRed = { a: await campaignRows("associations"), r: await campaignRows("reachability") };
  if (afterRed.a === 0 && afterRed.r === 0)
    ok(
      `${C.bold}RED${C.reset} — the replace path took the campaign-owned count from ` +
        `${beforeRed.a}/${beforeRed.r} to 0/0. That is the defect §13 exists to stop, reproduced ` +
        `on purpose in a disposable schema.`,
    );
  else
    fail(
      `RED did not go red: the replace path left ${afterRed.a}/${afterRed.r} campaign-owned row(s). ` +
        `If a replace cannot be shown destroying them, the merge has not been shown preserving them.`,
    );
  await branch.query("rollback"); // the fixture comes back, planted rows and all

  // ── GREEN: the merge path, over the same fixture ──────────────────────────
  await branch.query("begin");
  const summary: string[] = [];
  for (const name of ["associations", "reachability"] as const) {
    const table = `${schema}.${name}`;
    const marker: Marker = await resolveMarker(branch, table);
    if (marker.kind !== "origin-column") {
      fail(`${table} resolved to the ${marker.kind} marker — the fixture was supposed to carry \`origin\`.`);
      continue;
    }
    const pk = await pkOf(branch, table);
    const cols = await columnList(branch, table);
    const quoted = cols.map((c) => `"${c}"`).join(", ");
    const quotedPk = pk.map((c) => `"${c}"`).join(", ");
    const setList = cols
      .filter((c) => !pk.includes(c))
      .map((c) => `"${c}" = excluded."${c}"`)
      .join(", ");

    // "Production's new snapshot": every production-origin key in the fixture
    // EXCEPT five, which stand for rows production has dropped since the copy.
    // The merge must delete those five and spare every campaign row.
    const keyRows = await branch.query(
      `select ${pk.map((c) => `"${c}"::text as "${c}"`).join(", ")} from ${table} ` +
        `where origin is distinct from 'campaign'`,
    );
    const allKeys = keyRows.rows.map((r) =>
      pk.map((c) => String((r as Record<string, unknown>)[c])).join("\\0"),
    );
    const dropped = allKeys.slice(0, 5);
    const snapshot = new Set(allKeys.slice(5));

    // The upsert: re-send ten of production's surviving rows, with one column
    // changed, so `updated` is provably non-zero rather than "probably fine".
    const sample = await branch.query(
      `select ${quoted} from ${table} where origin is distinct from 'campaign' offset 5 limit 10`,
    );
    const values: unknown[] = [];
    const tuples = sample.rows.map((row, i) => {
      const r = row as Record<string, unknown>;
      const ph = cols.map((c, j) => {
        values.push(r[c]);
        return `$${i * cols.length + j + 1}`;
      });
      return `(${ph.join(",")})`;
    });
    const insertSql = mergeInsertSql({
      table,
      quotedColumns: quoted,
      quotedPk,
      setList,
      tuples: tuples.join(","),
      marker,
    });
    const upserted = await branch.query<{ inserted: boolean }>(insertSql, values);

    const pkTypesRow = await branch.query<{ typ: string }>(
      `select format_type(a.atttypid, a.atttypmod) typ from pg_attribute a
         where a.attrelid = $1::regclass and a.attname = any($2::text[]) order by a.attnum`,
      [table, pk],
    );
    const keysTable = await withSnapshotKeys(
      branch,
      table,
      pk,
      pkTypesRow.rows.map((x) => x.typ),
      snapshot,
    );
    const deleteSql = mergeDeleteSql({ table, pk, keysTable, marker });
    if (!deleteSql) {
      fail(`${table}: the merge produced no delete statement although the marker is the origin column.`);
      continue;
    }
    const deleted = await branch.query(deleteSql);

    const campaignAfter = await campaignRows(name);
    const before = name === "associations" ? beforeRed.a : beforeRed.r;
    if (campaignAfter !== before || campaignAfter === 0)
      fail(
        `${table}: campaign-owned rows went ${before} → ${campaignAfter}. §13 requires them EQUAL ` +
          `and NON-ZERO after a merge.`,
      );
    if ((deleted.rowCount ?? 0) !== dropped.length)
      fail(
        `${table}: the merge deleted ${deleted.rowCount} row(s); the fixture removed ` +
          `${dropped.length} production row(s) from the snapshot, so a merge that deletes fewer is ` +
          `not merging and one that deletes more is taking something it should not.`,
      );
    const updated = upserted.rows.filter((x) => !x.inserted).length;
    if (updated === 0)
      fail(
        `${table}: the merge updated 0 production row(s). A merge that changes nothing would pass ` +
          `the "campaign rows survived" check by doing nothing at all.`,
      );
    summary.push(
      `${table}: campaign ${before} → ${campaignAfter} (unchanged), ${updated} production row(s) ` +
        `updated, ${deleted.rowCount} deleted as absent from the new snapshot`,
    );
  }
  if (!failures)
    ok(
      `${C.bold}GREEN${C.reset} — the merge path over the same fixture:\n      ` +
        summary.join("\n      "),
    );
  await branch.query("rollback");
  await branch.query(`drop schema ${schema} cascade`);
  ok(`${schema} dropped — nothing this half touched outlives it`);
}

// ────────────────────────────────────────────────────────────────────────────
// GREEN on the real branch tables, over the marker the merge uses TODAY
// ────────────────────────────────────────────────────────────────────────────
async function liveHalf(branch: pg.Client, skipMerge: boolean): Promise<void> {
  console.log(
    `\n${C.bold}── GREEN on the live branch — the marker restore-graph.ts --merge uses today ──${C.reset}`,
  );
  const plantedAssoc = async () =>
    count(branch, `select count(*)::text n from ${ASSOC} where id = $1::uuid`, [PLANT.assocId]);
  const plantedReach = async () =>
    count(
      branch,
      `select count(*)::text n from ${REACH} where container_id = $1::uuid and item_id = $2::uuid`,
      [PLANT.sourceId, PLANT.targetId],
    );

  try {
    // The actor-tier trigger REFUSES a write that declares `code` and names no
    // system (measured 2026-09-17). Naming this proof is the honest answer, and
    // it is what a reader of the row will see.
    await branch.query(`select set_config('app.actor_system', 'W0-DATA refresh-merge-proof', false)`);
    await branch.query(
      `insert into ${ASSOC} (id, source_type, source_id, target_type, target_id, role, metadata)
       values ($1::uuid, $2, $3::uuid, $4, $5::uuid, $6, '{"planted":"refresh-merge-proof"}'::jsonb)
       on conflict (id) do nothing`,
      [PLANT.assocId, PLANT.sourceType, PLANT.sourceId, PLANT.targetType, PLANT.targetId, PLANT.role],
    );
    const a0 = await plantedAssoc();
    const r0 = await plantedReach();
    if (a0 !== 1 || r0 < 1) {
      fail(
        `the plant did not take: ${a0} association row and ${r0} reachability row. The live trigger ` +
          `is what writes the reachability half, so a zero there means the association landed ` +
          `without the graph noticing, and this half would prove nothing.`,
      );
      return;
    }
    ok(
      `planted 1 campaign-owned association (${PLANT.assocId}) and the ${r0} reachability row(s) the ` +
        `live trigger derived from it — both absent from production, which is what makes them ` +
        `campaign-owned under the fallback marker`,
    );

    if (!skipMerge) {
      console.log(`${INFO}running restore-graph.ts --merge for real…`);
      const res = spawnSync(
        "npx",
        ["tsx", "scripts/gate-corpus/restore-graph.ts", "--merge", "--lane=W0-DATA"],
        { cwd: ROOT, stdio: "inherit", encoding: "utf8" },
      );
      if (res.status !== 0) {
        fail(`restore-graph.ts --merge exited ${res.status}. The planted rows are removed below.`);
        return;
      }
    }

    const a1 = await plantedAssoc();
    const r1 = await plantedReach();
    if (a1 !== 1 || r1 !== r0)
      fail(
        `THE MERGE ATE THE CAMPAIGN'S ROWS: association ${a0} → ${a1}, reachability ${r0} → ${r1}. ` +
          `That is the exact failure §13 exists to make impossible.`,
      );
    else
      ok(
        `${C.bold}GREEN${C.reset} — both planted rows survived the merge (association ${a1}, ` +
          `reachability ${r1})`,
      );

    // ── the receipt, which is what W7-GATE actually reads ──────────────────
    const receipt = await branch.query<{
      id: string;
      ran_at: string;
      marker: string;
      per_table: Record<string, Record<string, number>>;
      campaign_rows_before: Record<string, number>;
      campaign_rows_after: Record<string, number>;
      rehearsed_in_wave_2: boolean;
      prod_snapshot: string;
    }>(
      `select id::text, ran_at::text, marker, per_table, campaign_rows_before, campaign_rows_after,
              rehearsed_in_wave_2, prod_snapshot
         from campaign_watch.refresh_run order by id desc limit 1`,
    );
    const row = receipt.rows[0];
    if (!row) {
      fail(`campaign_watch.refresh_run is empty — the merge wrote no receipt, so W7-GATE would FAIL.`);
      return;
    }
    console.log(
      `${INFO}receipt #${row.id} at ${row.ran_at}, marker ${row.marker}, snapshot ${row.prod_snapshot}, ` +
        `rehearsed_in_wave_2 ${row.rehearsed_in_wave_2}`,
    );
    for (const t of [ASSOC, REACH]) {
      const before = row.campaign_rows_before[t];
      const after = row.campaign_rows_after[t];
      const spared = row.per_table[t]?.skipped_campaign_owned ?? 0;
      if (before === undefined || after === undefined)
        fail(`the receipt carries no campaign row count for ${t} — W7-GATE's own query returns null.`);
      else if (before !== after)
        fail(`the receipt says ${t} went ${before} → ${after} campaign-owned rows. W7-GATE FAILS on that.`);
      else if (spared < 1)
        fail(
          `the receipt counts ${spared} spared row(s) for ${t}, but this run planted one there. A ` +
            `receipt that does not count the row it preserved is not evidence that it preserved it.`,
        );
      else
        ok(
          `receipt: ${t.padEnd(24)} campaign-owned ${before} → ${after}, ${spared} row(s) counted as ` +
            `skipped-as-campaign-owned, ${row.per_table[t]?.inserted ?? 0} inserted, ` +
            `${row.per_table[t]?.updated ?? 0} updated, ${row.per_table[t]?.deleted ?? 0} deleted`,
        );
    }
  } finally {
    // The plant is disposable, and "disposable" means it goes even when the run
    // failed — a leftover campaign-marked row on the branch would quietly change
    // every later count.
    await branch
      .query(`select set_config('app.actor_system', 'W0-DATA refresh-merge-proof', false)`)
      .catch(() => {});
    const delA = await branch
      .query(`delete from ${ASSOC} where id = $1::uuid`, [PLANT.assocId])
      .catch((e) => {
        console.error(`${FAIL}could not remove the planted association: ${(e as Error).message}`);
        return { rowCount: -1 };
      });
    const delR = await branch
      .query(`delete from ${REACH} where container_id = $1::uuid`, [PLANT.sourceId])
      .catch((e) => {
        console.error(`${FAIL}could not remove the planted reachability row: ${(e as Error).message}`);
        return { rowCount: -1 };
      });
    console.log(
      `${INFO}planted rows removed — ${delA.rowCount} association(s), ${delR.rowCount} reachability row(s)`,
    );
    const left = await count(
      branch,
      `select (select count(*) from ${ASSOC} where id = $1::uuid)
            + (select count(*) from ${REACH} where container_id = $2::uuid) as n`,
      [PLANT.assocId, PLANT.sourceId],
    ).catch(() => -1);
    if (left !== 0)
      fail(`${left} planted row(s) are still on the branch. Remove them by the dd000000- prefix.`);
    else ok(`the branch carries none of this proof's rows`);

    // 🚨 REMOVING THE PLANT LEAVES THE BOUNDARY ONE ROW AHEAD OF THE BRANCH.
    // The merge recorded `restore_graph.run` WITH the planted rows counted among
    // the branch-only extras — which is correct, they were there — so once they
    // are gone `--verify` reads the two marker tables as one row BELOW the
    // boundary and fails by name (measured 2026-09-17: "branch holds 34216,
    // BELOW the recorded boundary's 34206 + 11"). That is `--verify` working, and
    // it is this proof's own mess to clear: the boundary is re-recorded by
    // running the same merge again, over a branch that no longer carries the
    // plant. Editing the recorded boundary instead would be forging the thing
    // the verifier exists to check.
    if (!skipMerge && failures === 0) {
      console.log(
        `${INFO}re-running --merge over the cleaned branch, so the recorded boundary describes ` +
          `the branch as it now is rather than as it was with this proof's rows in it…`,
      );
      const res = spawnSync(
        "npx",
        ["tsx", "scripts/gate-corpus/restore-graph.ts", "--merge", "--lane=W0-DATA"],
        { cwd: ROOT, stdio: "inherit", encoding: "utf8" },
      );
      if (res.status !== 0)
        fail(
          `the boundary re-record exited ${res.status}. --verify will read the two marker tables ` +
            `as one row below the boundary until restore-graph.ts --merge is run again.`,
        );
      else ok(`boundary re-recorded — --verify now measures the branch this proof left behind`);
    }
  }
}

async function main(): Promise<number> {
  const redOnly = process.argv.includes("--red-only");
  const skipMerge = process.argv.includes("--skip-merge");
  const ref = loadBranchRef(ROOT);
  const env = loadBranchDbEnv(ROOT, ref);
  const branch = new pg.Client({
    host: env.host,
    port: env.port,
    user: env.user,
    password: env.password,
    database: env.database,
    ssl: { rejectUnauthorized: false },
    application_name: "refresh-merge-proof (branch)",
  });
  await branch.connect();
  const schema = `zz_w0_merge_${Date.now()}`;
  try {
    const sys = (
      await branch.query<{ s: string }>("select system_identifier::text s from pg_control_system()")
    ).rows[0]!.s;
    if (sys !== ref.systemIdentifier) {
      console.error(
        `${FAIL}this connection is not the branch BRANCH-REF names (${sys} vs ${ref.systemIdentifier}). ` +
          `Nothing was read and nothing was written.`,
      );
      return 1;
    }
    ok(`branch ${ref.branchRef} (${sys}) — this proof opens no other connection`);
    await zzHalf(branch, schema);
    if (!redOnly) await liveHalf(branch, skipMerge);
  } catch (err) {
    console.error(`${FAIL}refresh-merge-proof aborted: ${err instanceof Error ? err.message : String(err)}`);
    await branch.query("rollback").catch(() => {});
    await branch.query(`drop schema if exists ${schema} cascade`).catch(() => {});
    failures += 1;
  } finally {
    await branch.end().catch(() => {});
  }
  if (failures) {
    console.error(`${FAIL}refresh-merge-proof FAILED (${failures} assertion(s))`);
    return 1;
  }
  console.log(
    `${C.bold}${OK}refresh-merge-proof: the replace path destroys the campaign's rows, the merge ` +
      `path does not, and the receipt says so${C.reset}`,
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${C.red}refresh-merge-proof — unexpected error:${C.reset}`, err);
    process.exit(2);
  },
);
