import { open, q } from "./_dd4_lib.mts";
import { fixture, seat } from "./_dd4_fix.mts";
const c = await open();
try {
  await q(c, "begin");
  let t = Date.now();
  const { org, tbl } = await fixture(c, 100, 6);
  console.log("fixture ms", Date.now() - t, org, tbl);
  await seat(c, "postgres");
  console.log(await q(c, `select count(*) from custom.record where organization_id=$1 and data_class='work_approval'`, [org]));
  // explain analyze archive update
  await q(c, `select set_config('custom.archive_bulk','on',true)`);
  const ex = await c.query(`explain (analyze, timing on) update custom.record set deleted_at=now() where organization_id=$1 and table_id=$2 and data_class='record' and deleted_at is null`, [org, tbl]);
  console.log(ex.rows.map((r:any)=>r["QUERY PLAN"]).join("\n"));
} finally { await q(c, "rollback").catch(()=>{}); await c.end(); }
