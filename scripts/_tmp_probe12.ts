import { client } from "./_tmp_lib";
const c = client();
async function main(){
await c.connect();
const q = async (s:string,p?:any[]) => (await c.query(s,p)).rows;
for (const [sch,fn] of [['public','edu_export_study_data'],['public','hr_access_audit_query']]) {
  const d:any = (await q(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=$2`,[sch,fn]))[0];
  console.log("==========", sch+'.'+fn, "==========");
  console.log(d.d.slice(0,3500));
}
await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
