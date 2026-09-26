#!/usr/bin/env npx tsx
/**
 * `pnpm check:trash-doors` — THE TRASH LISTING LINT (lane TRASH-2, 2026-09-25).
 *
 * Every function in the live catalogue whose name says it lists Trash (`trash`, not a restore,
 * gate, keep or purge) must filter by the PERSON before it reads a row: no `iam.has_access` per
 * row, no walk over `iam.my_orgs()`, no organization-wide grant, and an Organization Trash door
 * must pass `public._org_trash_gate` first. The judgement is `judgeTrashDoorBody` in
 * scripts/lib/trash-doors.ts (jest: scripts/lib/__tests__/trash-doors.test.ts proves it RED on the
 * pre-TRASH-2 body and GREEN on the current one). Exit 1 on any finding; exit 2 when the
 * catalogue cannot be read (UNMEASURED is never a pass).
 *
 * THE COVERAGE PASS (lane TRASH-TABLES, 2026-09-26): every soft-deletable Entity with an archived
 * row, and every record-store class (custom.record.data_class) with one, must be findable in its
 * owner's Trash — its owner's newest archived row is asked of public._trash_kind_rows — or carry a
 * reason in TRASH_COVERAGE_EXEMPT. Judgement: judgeTrashCoverage. Reads only.
 */
import process from "node:process";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import type pg from "pg";
import {
  isTrashListingDoorName,
  judgeTrashCoverage,
  judgeTrashDoorBody,
  STORE_TRASH_KINDS,
  type ArchivedThing,
} from "./lib/trash-doors";

/** Is `id` among the newest rows `owner`'s Trash lists for `kind`? */
async function listedFor(db: pg.Client, owner: string, kind: string, id: string): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>(
    `select exists (select 1 from public._trash_kind_rows($1::uuid, null, null, array[$2]::text[], 50, 0) x
                     where x.id = $3::uuid) as ok`,
    [owner, kind, id],
  );
  return rows[0]?.ok === true;
}

/** Every archivable thing with an archived row, and whether its owner's Trash finds it. */
async function coverage(db: pg.Client): Promise<ArchivedThing[]> {
  const out: ArchivedThing[] = [];
  await db.query("set statement_timeout = '20s'");
  const { rows: kinds } = await db.query<{
    token: string; kind: string | null; sch: string; tbl: string; owner_col: string;
  }>(
    `select e.token, e.user_artifact_kind as kind, e.schema_name as sch, e.table_name as tbl,
            coalesce(e.retention_owner_column,
                     case when e.token = 'credential_item' then 'user_id' else 'created_by' end) as owner_col
       from platform.entity_types e
      where e.has_soft_delete and e.is_active and e.type = 'entity'
        and to_regclass(format('%I.%I', e.schema_name, e.table_name)) is not null
      order by 1`,
  );
  const q = (x: string) => `"${x.replace(/"/g, '""')}"`;
  for (const k of kinds) {
    const rel = `${q(k.sch)}.${q(k.tbl)}`;
    try {
      const any = await db.query<{ owner: string | null }>(
        `select ${q(k.owner_col)}::text as owner from ${rel} where deleted_at is not null limit 1`,
      );
      if (!any.rows.length) continue; // nothing archived: nothing to prove
      const thing = `entity:${k.token}`;
      if (!k.kind) { out.push({ thing, covered: false, detail: "no user_artifact_kind" }); continue; }
      const withOwner = await db.query<{ owner: string }>(
        `select ${q(k.owner_col)}::text as owner from ${rel}
          where deleted_at is not null and ${q(k.owner_col)} is not null limit 1`,
      );
      const owner = withOwner.rows[0]?.owner;
      if (!owner) continue; // archived rows exist but none has an owner whose Trash could hold it
      const newest = await db.query<{ id: string }>(
        `select id::text from ${rel} where ${q(k.owner_col)} = $1::uuid and deleted_at is not null
          order by deleted_at desc, id limit 1`,
        [owner],
      );
      const id = newest.rows[0]!.id;
      const ok = await listedFor(db, owner, k.kind, id);
      out.push({ thing, covered: ok, detail: ok ? undefined : `newest archived ${id} not in its owner's Trash` });
    } catch (e) {
      out.push({ thing: `entity:${k.token}`, covered: false, detail: `probe failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  // The record store: one physical table, told apart by data_class.
  const { rows: classes } = await db.query<{ data_class: string }>(
    `select data_class from custom.record where deleted_at is not null group by 1 order by 1`,
  );
  for (const { data_class } of classes) {
    const thing = `store:${data_class}`;
    const kind = STORE_TRASH_KINDS[data_class];
    if (!kind) { out.push({ thing, covered: false, detail: "no Trash kind in the store branch" }); continue; }
    const { rows } = await db.query<{ id: string; owner: string }>(
      data_class === "record"
        ? `select r.id::text, r.created_by::text as owner from custom.record r
             join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                                 and t.data_class = 'table' and t.deleted_at is null
            where r.data_class = 'record' and r.deleted_at is not null and r.created_by is not null
            order by r.deleted_at desc, r.id limit 1`
        : `select r.id::text, r.created_by::text as owner from custom.record r
            where r.data_class = $1 and r.deleted_at is not null and r.created_by is not null
            order by r.deleted_at desc, r.id limit 1`,
      data_class === "record" ? [] : [data_class],
    );
    if (!rows.length) continue;
    const ok = await listedFor(db, rows[0]!.owner, kind, rows[0]!.id);
    out.push({ thing, covered: ok, detail: ok ? undefined : `newest archived ${rows[0]!.id} not in its owner's Trash` });
  }
  return out;
}

async function main(): Promise<number> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(`UNMEASURED: no database connection (${env.missing.join(", ")} missing; looked in ${env.looked.join(", ")})`);
    return 2;
  }
  const db = await connectDirect(env, "check:trash-doors");
  try {
    const { rows } = await db.query<{ door: string; body: string }>(
      `select n.nspname || '.' || p.proname as door, pg_get_functiondef(p.oid) as body
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where p.proname ~ '(^|_)trash(_|$)' and p.prokind = 'f'
          and n.nspname not in ('pg_catalog', 'information_schema')
        order by 1`,
    );
    const doors = rows.filter((r) => isTrashListingDoorName(r.door));
    const findings = doors.flatMap(judgeTrashDoorBody);
    for (const d of doors) {
      const mine = findings.filter((f) => f.door === d.door);
      console.log(`${mine.length ? "FAIL" : " ok "}  ${d.door}`);
      for (const f of mine) console.log(`        ${f.problem}`);
    }
    console.log(`\n${doors.length} Trash listing door(s), ${findings.length} finding(s).`);

    const things = await coverage(db);
    const gaps = judgeTrashCoverage(things);
    console.log(`\nCoverage: ${things.length} archivable thing(s) with archived rows; ` +
      `${things.filter((t) => t.covered).length} findable in Trash, ` +
      `${things.filter((t) => !t.covered).length - gaps.filter((g) => !g.problem.includes("stale")).length} exempt with a reason.`);
    for (const t of things.filter((x) => x.covered)) console.log(` ok   ${t.thing}`);
    for (const g of gaps) console.log(`FAIL  ${g.door}\n        ${g.problem}`);
    return findings.length || gaps.length ? 1 : 0;
  } finally {
    await db.end();
  }
}

main().then((c) => process.exit(c), (e) => {
  console.error(e);
  process.exit(2);
});
