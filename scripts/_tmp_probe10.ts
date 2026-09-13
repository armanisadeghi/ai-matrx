import { client } from "./_tmp_lib";
const c = client();
async function main(){
await c.connect();
const q = async (s:string,p?:any[]) => (await c.query(s,p)).rows;
console.log("=== fc_card owners ===");
console.table(await q(`select to_jsonb(t) - 'front' - 'back' - 'content' from education.fc_card t where id = any($1::uuid[])`,
  [['001980f2-3d13-4e62-ab25-c8f68445e6e1','9f5cafc2-bc49-4329-923a-1ee43ebcce67']]));
console.log("A id", (await q(`select id from auth.users where email='test@test.com'`))[0]);
console.log("=== fc_card policies ===");
console.table(await q(`select polname, pg_get_expr(polqual, polrelid) qual, polcmd from pg_policy where polrelid='education.fc_card'::regclass`));
console.log("=== hr_access_audit_query def ===");
const d = (await q(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_access_audit_query'`))[0] as any;
console.log(d.d.slice(0,2600));
await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
