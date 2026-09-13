import { client } from "./_tmp_lib";
const c = client();
async function main(){
await c.connect();
const q = async (s:string,p?:any[]) => (await c.query(s,p)).rows;
const r = await q(`select jsonb_pretty(jsonb_build_object('id',id,'org',organization_id,'created_by',created_by,'deleted_at',deleted_at)) j from education.fc_card where id = any($1::uuid[])`,
  [['001980f2-3d13-4e62-ab25-c8f68445e6e1','9f5cafc2-bc49-4329-923a-1ee43ebcce67']]);
r.forEach((x:any)=>console.log(x.j));
console.log("--- policies on education.fc_card ---");
(await q(`select polname||' ['||polcmd||'] '||coalesce(pg_get_expr(polqual,polrelid),'-') p from pg_policy where polrelid='education.fc_card'::regclass`)).forEach((x:any)=>console.log(x.p));
console.log("--- hr_access_audit_query ---");
const d:any = (await q(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_access_audit_query'`))[0];
console.log(d.d.slice(0,3000));
await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
