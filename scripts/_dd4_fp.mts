import { open, q } from "./_dd4_lib.mts";
import { fixture, seat } from "./_dd4_fix.mts";
import { createHash } from "node:crypto";
const mode = process.argv[2] ?? "table_restore";   // table_restore | record_restore
const N = Number(process.argv[3] ?? 150), A = Number(process.argv[4] ?? 12);
const c = await open();
const md5 = (s: string) => createHash("md5").update(s).digest("hex");
async function fp(org: string, tbl: string, label: string) {
  await seat(c, "postgres");
  const norm = (s: string) => s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>").replace(/\d{4}-\d{2}-\d{2}[T ][0-9:.]+Z?/g, "<ts>");
  const rows = (sql: string) => q(c, sql, sql.includes("$2") ? [org, tbl] : [org]);
  const names = `(select jsonb_object_agg(id::text, coalesce(data->>'vehicle', data->>'key', data->>'name', data_class)) from custom.record where organization_id=$1)`;
  const out: Record<string, string> = {};
  out.approvals = (await rows(`select string_agg(concat_ws('|', (select r2.data->>'vehicle' from custom.record r2 where r2.organization_id=$1 and r2.id::text=a.data->>'subject_id'), a.data->>'state', a.data->>'withdrawn_reason', a.data->>'outcome', (a.data->>'withdrawn_by') is not null, a.deleted_at is not null, a.version), E'\\n' order by (select r2.data->>'vehicle' from custom.record r2 where r2.organization_id=$1 and r2.id::text=a.data->>'subject_id'), a.data->>'state') s from custom.record a where a.organization_id=$1 and a.data_class='work_approval'`))[0].s ?? "";
  out.event = (await rows(`with m as (select * from history.migration_log where organization_id=$1 and verb='archive' and target_id=$2), nm as (select ${names} n)
    select string_agg(concat_ws('|', m.verb, m.target_kind, m.inverse->>'kind', m.inverse->>'whole', m.inverse->>'open', m.undone_at is not null,
      (select count(*) from jsonb_array_elements(m.inverse->'took')), (select count(*) from jsonb_array_elements(m.inverse->'also')),
      (select string_agg(coalesce(nm.n->>(t->>0),'?') , ',' order by coalesce(nm.n->>(t->>0),'?')) from jsonb_array_elements(m.inverse->'took') with ordinality x(t,o)),
      (select string_agg(coalesce(nm.n->>(a#>>'{}'),'?'), ',' order by coalesce(nm.n->>(a#>>'{}'),'?')) from jsonb_array_elements(m.inverse->'also') with ordinality y(a,o)),
      (select count(distinct t->>1) from jsonb_array_elements(m.inverse->'took') t),
      coalesce(m.inverse->'restore_left','{}')::text), E'\\n') s from m, nm`))[0].s ?? "";
  out.history = (await rows(`select string_agg(concat_ws('|', h.entity_type, h.operation, h.operation_name, h.migration_id is not null, (select coalesce(r.data->>'vehicle', r.data_class) from custom.record r where r.organization_id=h.organization_id and r.id=h.row_id), h.version), E'\\n' order by h.entity_type, h.operation, (select coalesce(r.data->>'vehicle', r.data_class) from custom.record r where r.organization_id=h.organization_id and r.id=h.row_id), h.version, h.operation_name) s from history.row_versions h where h.organization_id=$1`))[0].s ?? "";
  out.feed = (await rows(`select string_agg(concat_ws('|', e.event_key, e.operation, e.metadata->'change'->>'kind', e.metadata->'change'->>'via', (select coalesce(r.data->>'vehicle', r.data_class) from custom.record r where r.organization_id=e.organization_id and r.id=e.record_id), (e.metadata->'change'->>'version')), E'\\n' order by e.event_key, e.operation, (select coalesce(r.data->>'vehicle', r.data_class) from custom.record r where r.organization_id=e.organization_id and r.id=e.record_id), e.metadata->'change'->>'version') s from custom.io_outbox e where e.organization_id=$1`))[0].s ?? "";
  out.keys = (await rows(`select string_agg(line, E'\\n' order by line) s from (select concat_ws('|', coalesce(r.data->>'vehicle', r.data_class), r.deleted_at is not null, r.version, (select string_agg(k, ',' order by k) from jsonb_object_keys(r.data) k), (select string_agg(k, ',' order by k) from jsonb_object_keys(coalesce(r.data->'_derived','{}')) k)) line from custom.record r where r.organization_id=$1 and r.data_class in ('record','work_approval')) z`))[0].s ?? "";
  const res: any = {};
  for (const [k, v] of Object.entries(out)) { const t = norm(v); res[k] = { md5: md5(t), lines: t.split("\n").length }; }
  console.log(label, JSON.stringify(res));
  return out;
}
try {
  await q(c, "begin");
  const { org, tbl } = await fixture(c, N, A);
  let t0 = Date.now();
  await fp(org, tbl, "after-fixture");
  await seat(c, "authenticated");
  let calls = 0, res: any;
  for (;;) { res = (await q(c, `select custom.table_archive($1,$2,20,true) r`, [org, tbl]))[0].r; calls++; if (res.done || calls > 60) break; }
  console.log("archive calls", calls, "ms", Date.now() - t0, res.done, res.message);
  const a = await fp(org, tbl, "after-archive");
  t0 = Date.now(); calls = 0;
  if (mode === "table_restore") {
    for (;;) { res = (await q(c, `select custom.table_restore($1,$2,20) r`, [org, tbl]))[0].r; calls++; if (res.done || calls > 80) break; }
  } else {
    res = (await q(c, `select custom.record_restore($1,$2) r`, [org, tbl]))[0].r; calls = 1;
  }
  console.log("restore calls", calls, "ms", Date.now() - t0, JSON.stringify(res)?.slice(0, 300));
  const b = await fp(org, tbl, "after-restore");
  if (process.env.DUMP) { const fs = await import("node:fs"); fs.writeFileSync(process.env.DUMP, JSON.stringify({ a, b }, null, 1)); }
} finally { await q(c, "rollback").catch(() => {}); await c.end(); }
