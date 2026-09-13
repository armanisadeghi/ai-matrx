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
const base = `
 from platform.client_callable_door d
 join pg_namespace n on n.nspname = d.schema_name
 join pg_proc p on p.proname=d.function_name and p.pronamespace=n.oid and pg_get_function_identity_arguments(p.oid)=d.identity_args
 where has_function_privilege('authenticated', p.oid,'EXECUTE') and not has_function_privilege('anon', p.oid,'EXECUTE')`;
console.log("signed-in doors", await q(`select count(*) ${base}`));
console.log("b75 signed-in", await q(`select count(*) ${base} and d.declared_by='DD-169 batch 3 / B-75'`));
// arg-name histogram over the 477
const rows = await q(`select d.schema_name, d.function_name, d.identity_args, p.provolatile, p.oid::int as oid ${base} and d.declared_by='DD-169 batch 3 / B-75' order by 1,2`);
console.log("rows", rows.length, "volatile", rows.filter(r=>r.provolatile==='v').length);
const names: Record<string,number> = {};
for (const r of rows) for (const a of String(r.identity_args).split(/,\s*/)) { const nm=a.trim().split(/\s+/)[0]; if(nm) names[nm]=(names[nm]||0)+1; }
console.log(Object.entries(names).sort((a,b)=>b[1]-a[1]).slice(0,80));
console.log("no-arg doors", rows.filter(r=>!r.identity_args).length);
await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
