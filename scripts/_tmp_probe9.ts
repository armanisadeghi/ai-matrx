import { client } from "./_tmp_lib";
const c = client();
async function main(){
await c.connect();
const q = async (s:string,p?:any[]) => (await c.query(s,p)).rows;
console.table(await q(`
 select d.schema_name||'.'||d.function_name as fn, d.identity_args,
   (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname=d.schema_name and p.proname=d.function_name) as overloads,
   (select bool_or(has_function_privilege('authenticated', p.oid,'EXECUTE') or has_function_privilege('anon', p.oid,'EXECUTE'))
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname=d.schema_name and p.proname=d.function_name) as any_client_x,
   (select count(*) from pg_class cl join pg_namespace n2 on n2.oid=cl.relnamespace
      where n2.nspname=d.schema_name and cl.relname=d.function_name) as is_relation
 from platform.client_callable_door d
 where not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname=d.schema_name and p.proname=d.function_name
                      and pg_get_function_identity_arguments(p.oid)=d.identity_args)
 order by 1`));
await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
