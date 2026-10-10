import { open, q } from "./_dd4_lib.mts";
import { writeFileSync } from "node:fs";
const c = await open();
for (const [oid, f] of [["custom.record_restore(uuid,uuid)","record_restore"],["custom.table_restore(uuid,uuid,integer)","table_restore"]]) {
  const r = await q(c, `select pg_get_functiondef($1::regprocedure) d`, [oid]);
  writeFileSync(`/private/tmp/claude-501/dd4/live_${f}.sql`, r[0].d);
}
await c.end();
