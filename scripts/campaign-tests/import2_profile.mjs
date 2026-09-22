// IMPORT-2 — where the per-row time goes. Server-side: builds a realistic 8-column dispatch
// table, then EXPLAIN ANALYZE of ONE 250-row insert through custom.record_write_many, which
// reports every trigger's own time and calls. Everything is rolled back.
import { readFileSync } from "node:fs";
import pg from "pg";
const ROOT = "/Users/armanisadeghi/code/matrx-frontend";
const parse = (p) => { const o = {}; try { for (const l of readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) o[m[1]] = (m[2] ?? "").replace(/^['"]|['"]$/g, ""); } } catch {} return o; };
const bag = { ...parse(ROOT + "/.env"), ...parse("/Users/armanisadeghi/code/aidream/.env"), ...parse(ROOT + "/.env.local") };
const c = new pg.Client({ user: bag.SUPABASE_MATRIX_USER, password: bag.SUPABASE_MATRIX_PASSWORD, host: bag.SUPABASE_MATRIX_HOST, port: Number(bag.SUPABASE_MATRIX_PORT), database: bag.SUPABASE_MATRIX_DATABASE_NAME, ssl: { rejectUnauthorized: false } });
await c.connect();
const ORG = "6069a466-1445-42df-a64e-cf37ecdc1b99";
const HOME = "7e56a871-971e-4122-9652-145b0d14efe1";
await c.query("begin");
await c.query("set local statement_timeout = '600s'");
try {
  const t = await c.query(`select custom.table_declare($1, $2::jsonb) as id`, [ORG, JSON.stringify({
    name: `Profile board ${Date.now()}`, slug: `profile_board_${Date.now()}`.slice(0, 60), type: "entity",
    display: "list", weight: "light", ordered: false, row_order: "manual", title_field: "title",
    label_singular: "ticket", label_plural: "tickets", retention_days: 365, agent_writable: true,
    default_sort: [{ field: "title", direction: "asc" }], parent_id: HOME, fields: [{ name: "title" }],
  })]);
  const tableId = t.rows[0].id;
  const cols = [["job_number","Job Number","text"],["customer","Customer","text"],["service_address","Service Address","text"],["service_type","Service Type","text"],["scheduled_date","Scheduled Date","date"],["crew","Crew","text"],["status","Status","text"],["notes","Notes","long_text"]];
  for (const [key, label, kind] of cols) {
    await c.query(`select custom.field_declare($1, $2, $3::jsonb)`, [ORG, tableId, JSON.stringify(
      kind === "date" ? { key, label, parity_type: "datetime", kind: "date", sort: 10 }
      : kind === "long_text" ? { key, label, plain: "long_text", sort: 10 }
      : { key, label, plain: "text", sort: 10 })]);
  }
  const docs = [];
  for (let i = 0; i < 250; i += 1) docs.push(JSON.stringify({
    title: `RPC-PR-${i}`, job_number: `RPC-PR-${90000 + i}`, customer: `Nadia Quintanilla ${i}`,
    service_address: `${1200 + i} Telegraph Rd, Ventura CA`, service_type: "Drain Cleaning",
    scheduled_date: "2026-09-14", crew: "Truck 4 — Benavides", status: "Scheduled",
    notes: "Gate code at the alley side; dog is friendly but loud.", _actor: "system",
  }));
  const ids = docs.map(() => null);
  const r = await c.query(
    `explain (analyze, buffers, verbose off, costs off, timing on)
     insert into custom.record (organization_id, table_id, id, data)
     select $1::uuid, $2::uuid, gen_random_uuid(), d
       from unnest($3::jsonb[]) with ordinality as u(d, s) order by s`,
    [ORG, tableId, docs]);
  console.log(r.rows.map((x) => x["QUERY PLAN"]).join("\n"));
} finally {
  await c.query("rollback");
  await c.end();
}
