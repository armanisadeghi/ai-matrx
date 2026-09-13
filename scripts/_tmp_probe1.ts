import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
const ROOT = process.cwd();
function parseEnvFile(p: string) { const out: Record<string,string> = {}; for (const line of readFileSync(p,"utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) out[m[1]] = (m[2]??"").replace(/^['"]|['"]$/g,""); } return out; }
const VARS = ["SUPABASE_MATRIX_USER","SUPABASE_MATRIX_PASSWORD","SUPABASE_MATRIX_HOST","SUPABASE_MATRIX_PORT","SUPABASE_MATRIX_DATABASE_NAME"];
let bag: Record<string,string> = {};
for (const f of [".env.local",".env.production.local",".env.production",".env", resolve(ROOT,"..","aidream",".env")]) {
  const p = f.startsWith("/") ? f : resolve(ROOT,f); if (!existsSync(p)) continue;
  const b = parseEnvFile(p); if (VARS.every(v=>b[v])) { bag = b; break; }
}
const c = new pg.Client({ user: bag.SUPABASE_MATRIX_USER, password: bag.SUPABASE_MATRIX_PASSWORD, host: bag.SUPABASE_MATRIX_HOST, port: Number(bag.SUPABASE_MATRIX_PORT), database: bag.SUPABASE_MATRIX_DATABASE_NAME, ssl: { rejectUnauthorized: false } });
async function main(){
await c.connect();
const q = async (s:string, p?:any[]) => (await c.query(s,p)).rows;
console.log("total doors", await q(`select count(*) from platform.client_callable_door`));
console.log("by declared_by", await q(`select declared_by, count(*) from platform.client_callable_door group by 1 order by 2 desc limit 20`));
console.log("gate_predicate null?", await q(`select (gate_predicate is null) gp_null, count(*) from platform.client_callable_door group by 1`));
console.log("anon vs auth", await q(`
 select has_function_privilege('anon', p.oid,'EXECUTE') anon_x, has_function_privilege('authenticated', p.oid,'EXECUTE') auth_x, count(*)
 from platform.client_callable_door d
 join pg_proc p on p.proname=d.function_name and p.pronamespace = (select oid from pg_namespace where nspname=d.schema_name)
   and pg_get_function_identity_arguments(p.oid)=d.identity_args
 group by 1,2`));
await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
