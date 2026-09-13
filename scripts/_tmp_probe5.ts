import { client } from "./_tmp_lib";
const c = client();
async function main(){
await c.connect();
for (const fn of ['public.inv_list','public.inv_create','seo.starter_pack_catalog']) {
  const r = (await c.query(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=$2 limit 1`, fn.split('.'))).rows;
  const body = r[0]?.d ?? 'MISSING';
  console.log("=====", fn, "=====");
  console.log(body.split('\n').filter((l:string)=>/actor_role|_container_authz|not in|is distinct|raise exception|organization_member|membership/i.test(l)).join('\n').slice(0,1200));
}
await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
