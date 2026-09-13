import { client } from "./_tmp_lib";
const c = client();
async function main(){
await c.connect();
const q = async (s:string,p?:any[]) => (await c.query(s,p)).rows;
console.log("stale door rows (declared but no client EXECUTE):");
console.table(await q(`
 select d.schema_name||'.'||d.function_name as fn, d.identity_args, d.declared_by,
        has_function_privilege('authenticated', p.oid,'EXECUTE') auth_x,
        has_function_privilege('anon', p.oid,'EXECUTE') anon_x
 from platform.client_callable_door d
 join pg_namespace n on n.nspname=d.schema_name
 join pg_proc p on p.proname=d.function_name and p.pronamespace=n.oid and pg_get_function_identity_arguments(p.oid)=d.identity_args
 where not has_function_privilege('authenticated', p.oid,'EXECUTE')
   and not has_function_privilege('anon', p.oid,'EXECUTE')
 order by 1`));
console.log("door rows naming a function that does not exist at all:");
console.table(await q(`
 select d.schema_name||'.'||d.function_name as fn, d.identity_args, d.declared_by
 from platform.client_callable_door d
 where not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname=d.schema_name and p.proname=d.function_name
                      and pg_get_function_identity_arguments(p.oid)=d.identity_args)
 order by 1`));
console.log("fn_is_site_editor:");
console.table(await q(`select n.nspname||'.'||p.proname fn, pg_get_function_identity_arguments(p.oid) args,
  has_function_privilege('authenticated',p.oid,'EXECUTE') auth_x, has_function_privilege('anon',p.oid,'EXECUTE') anon_x,
  exists(select 1 from platform.client_callable_door d where d.schema_name=n.nspname and d.function_name=p.proname) declared
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='fn_is_site_editor'`));
await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
