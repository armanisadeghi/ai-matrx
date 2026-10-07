#!/usr/bin/env npx tsx
/**
 * CHAIR-READPERF — custom.mask_document hands back the same bytes as the one expression it has always been.
 *
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/chairreadperf_mask_parity.ts                       (dev clone)
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/chairreadperf_mask_parity.ts --target production   (read-only)
 *   flags: --old-copy (clone only: also compare against session-temporary copies of the SQL-language bodies in the
 *          inverse file, so old function, new function and the expression are all three compared)
 *
 * THE SET. Every record of every Table in every live organization admin@admin.com or test@test.com is an active
 * member of. For each (organization, Table) the masks are the real ones: custom.read_mask_for(seat, organization,
 * Table, rung, 'read') for each seat and each rung (none, viewer, commenter, editor, admin), de-duplicated. Each
 * record's whole stored document (a superset of the keys the read door hands in) is masked under every such mask,
 * keyed by key and by id, through the six-argument overload (the only one a call can reach: fewer arguments are
 * refused as ambiguous), and compared as text with the expression written inline here —
 * which is the statement inside the plpgsql body of chairreadperf_d and, word for word, the SQL-language body it
 * replaced. So before the apply this proves old function == expression, and after it new function == expression.
 *
 * Read-only: one `begin read only` transaction per (organization, Table); nothing is created on production.
 * RED (exit 1) on any differing output, or when nothing was compared.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { currentCloneRef, dsnFor } from "../lib/pooled-db.mjs";
import { formatDurationMs } from "@ai-matrx/kit/format";

const ROOT = resolve(__dirname, "..", "..");
const DOWN = "migrations/inverse/chairreadperf_d_the_mask_keeps_its_plan_down.sql";
const SEATS = ["87a6e699-3622-4869-8843-d0867456c0dd", "4060701e-706a-4c76-b3ca-0bbc69fa5a14"];
const TARGET = (() => { const i = process.argv.indexOf("--target"); return i > 0 ? process.argv[i + 1] : "clone"; })();
const OLD_COPY = process.argv.includes("--old-copy");

const INLINE6 = `(coalesce((select jsonb_object_agg(
      case when b.by_id then coalesce(mm.kids ->> e.key, e.key) else e.key end,
      case when e.key = any (mm.vis) then e.value
           when mm.decl is not null and not (e.key = any (mm.decl)) then e.value
           else 'null'::jsonb end)
    from jsonb_each(coalesce(r.data, '{}'::jsonb)) e), '{}'::jsonb)
  || case when mm.notices = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('_hidden', mm.notices) end)`;

async function main() {
  let cfg: pg.ClientConfig;
  if (TARGET === "production") {
    cfg = { connectionString: dsnFor("production", { app: "chair-readperf-mask-parity" }), ssl: { rejectUnauthorized: false }, query_timeout: 300_000 };
  } else {
    const url = new URL(dsnFor("clone", { app: "chair-readperf-mask-parity" }));
    cfg = { host: `db.${currentCloneRef()}.supabase.co`, port: 5432, user: "postgres", password: decodeURIComponent(url.password), database: "postgres",
      ssl: { rejectUnauthorized: false }, application_name: "chair-readperf-mask-parity", query_timeout: 300_000 };
  }
  const client = new pg.Client(cfg);
  await client.connect();
  const who = (await client.query(`select (select count(*) from cron.job where active)::int as jobs, exists (select 1 from pg_extension where extname = 'pg_net') as net`)).rows[0];
  const onClone = who.jobs === 0 && !who.net;
  if ((TARGET === "clone") !== onClone) throw new Error(`REFUSED: --target ${TARGET} reached the other database`);
  if (OLD_COPY && TARGET !== "clone") throw new Error("REFUSED: --old-copy creates session-temporary functions; the clone only");
  if (OLD_COPY) {
    const text = readFileSync(resolve(ROOT, DOWN), "utf8");
    const parts = text.split("CREATE OR REPLACE FUNCTION custom.mask_document(").slice(1);
    if (parts.length !== 1) throw new Error("the inverse file does not carry the one mask_document body");
    await client.query("CREATE OR REPLACE FUNCTION pg_temp.mask_old6(" + parts[0]);
  }
  const lang = (await client.query(`select string_agg(p.pronargs || '-arg ' || l.lanname, ', ' order by p.pronargs) as langs from pg_proc p join pg_language l on l.oid = p.prolang
     where p.pronamespace = 'custom'::regnamespace and p.proname = 'mask_document'`)).rows[0].langs;
  const tables = (await client.query(
    `select r.organization_id, r.table_id, count(*)::int as n
       from custom.record r
      where r.table_id is not null
        and r.organization_id in (select m.organization_id from iam.memberships m
                                    join iam.organizations o on o.id = m.organization_id and o.archived_at is null
                                   where m.user_id = any ($1::uuid[]) and m.container_type = 'organization' and m.status = 'active' and m.deleted_at is null)
      group by 1, 2 order by 3 desc`, [SEATS])).rows as { organization_id: string; table_id: string; n: number }[];
  console.log(`# ${TARGET}: custom.mask_document is ${lang}; ${tables.length} (organization, Table) pairs, ${tables.reduce((a, t) => a + t.n, 0)} records${OLD_COPY ? "; old SQL bodies compared too" : ""}`);
  let records = 0, outputs = 0, differ = 0, masks = 0;
  const t0 = Date.now();
  for (const t of tables) {
    await client.query("begin read only");
    try {
      await client.query("set local statement_timeout = '4min'");
      const oldCols = OLD_COPY
        ? `, count(*) filter (where pg_temp.mask_old6(r.data, mm.vis, mm.notices, b.by_id, mm.kids, mm.decl)::text is distinct from custom.mask_document(r.data, mm.vis, mm.notices, b.by_id, mm.kids, mm.decl)::text)::int as differ_old`
        : `, 0 as differ_old`;
      const r = await client.query(
        `with masks as (
           select distinct m from (
             select custom.read_mask_for(s.uid, $1::uuid, $2::uuid, l.lvl, 'read') as m
               from unnest($3::uuid[]) s(uid), unnest(array[null, 'viewer', 'commenter', 'editor', 'admin']::public.permission_level[]) l(lvl)) z),
         mm as materialized (
           select array(select jsonb_array_elements_text(m -> 'visible')) as vis, array(select jsonb_array_elements_text(m -> 'declared')) as decl,
                  m -> 'notices' as notices, coalesce(m -> 'all_key_ids', m -> 'key_ids') as kids from masks)
         select (select count(*) from mm)::int as masks, count(distinct r.id)::int as records, count(*)::int as outputs,
                count(*) filter (where custom.mask_document(r.data, mm.vis, mm.notices, b.by_id, mm.kids, mm.decl)::text is distinct from ${INLINE6}::text)::int as differ
                ${oldCols}
           from custom.record r, mm, unnest(array[false, true]) b(by_id)
          where r.organization_id = $1::uuid and r.table_id = $2::uuid`, [t.organization_id, t.table_id, SEATS]);
      const x = r.rows[0];
      records += x.records; outputs += x.outputs; masks += x.masks; differ += x.differ + x.differ_old;
      if (x.differ + x.differ_old > 0) console.log(`RED  ${t.organization_id} / ${t.table_id}: ${x.differ} outputs differ from the expression, ${x.differ_old} from the old body`);
    } finally {
      await client.query("rollback");
    }
  }
  await client.end();
  const ok = differ === 0 && outputs > 0;
  console.log(`${ok ? "GREEN" : "RED  "} SAME ${outputs - differ}/${outputs} masked outputs over ${records} records (${masks} masks, ${tables.length} Tables, ${formatDurationMs(Date.now() - t0, { style: "compact" })})`);
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
