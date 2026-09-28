import { connectDirect, loadDbEnv, type DbEnv } from "./lib/direct-db";
import { writeFileSync } from "node:fs";
const out = process.argv[2];
const names = process.argv.slice(3);
(async () => {
  const env = loadDbEnv() as DbEnv;
  const c = await connectDirect(env, "d2-dumpfn-readonly");
  for (const n of names) {
    const [s, f] = n.split(".");
    const r = await c.query("select p.oid::regprocedure::text sig, pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname=$1 and p.proname=$2", [s, f]);
    r.rows.forEach((row: {sig:string;d:string}, i: number) => writeFileSync(`${out}/${n}${r.rows.length>1?`.${i}`:""}.sql`, `-- ${row.sig}\n${row.d};\n`));
    console.log(n, r.rows.length);
  }
  await c.end();
})();
