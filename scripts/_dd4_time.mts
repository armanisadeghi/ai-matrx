import { open, q } from "./_dd4_lib.mts";
import { fixture, seat } from "./_dd4_fix.mts";
const N = Number(process.argv[2] ?? 1000), mode = process.argv[3] ?? "table_restore";
const c = await open();
try {
  await q(c, "begin");
  let t = Date.now();
  const { org, tbl } = await fixture(c, N, 5);
  console.log(`N=${N} fixture ${Date.now() - t} ms`);
  const live = async () => { await seat(c, "postgres"); const r = (await q(c, `select count(*) filter (where deleted_at is null) l, count(*) filter (where deleted_at is not null) a from custom.record where organization_id=$1 and table_id=$2 and data_class='record'`, [org, tbl]))[0]; await seat(c, "authenticated"); return `${r.l} live / ${r.a} archived`; };
  console.log("before:", await live());
  await seat(c, "authenticated");
  let calls = 0, res: any, max = 0; t = Date.now();
  for (;;) { const s = Date.now(); res = (await q(c, `select custom.table_archive($1,$2,20,true) r`, [org, tbl]))[0].r; max = Math.max(max, Date.now() - s); calls++; if (res.done || calls > 200) break; }
  console.log(`archive: ${calls} calls, ${Date.now() - t} ms total, slowest call ${max} ms, done=${res.done}`, "|", await live());
  calls = 0; max = 0; t = Date.now(); let flagged = 0;
  if (mode === "table_restore") {
    for (;;) { const s = Date.now(); res = (await q(c, `select custom.table_restore($1,$2,20) r`, [org, tbl]))[0].r; max = Math.max(max, Date.now() - s); calls++; if (res.done || calls > 300) break; }
  } else {
    for (;;) { const s = Date.now(); res = (await q(c, `select custom.record_restore($1,$2) r`, [org, tbl]))[0].r; max = Math.max(max, Date.now() - s); calls++; if (res.done || calls > 300) break; }
  }
  console.log(`restore(${mode}): ${calls} calls, ${Date.now() - t} ms total, slowest call ${max} ms, done=${res.done}, remaining=${res.remaining}, left=${res.left}, flagged=${res.flagged}`, "|", await live());
} finally { await q(c, "rollback").catch(() => {}); await c.end(); }
