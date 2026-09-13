import { client } from "./_tmp_lib";
const c = client();
async function main(){
await c.connect();
const q = async (s:string,p?:any[]) => (await c.query(s,p)).rows;
const t = await q(`
 select c.relnamespace::regnamespace::text as sch, c.relname as tab,
        exists(select 1 from pg_attribute a2 where a2.attrelid=c.oid and a2.attname='organization_id' and not a2.attisdropped) as has_org
 from pg_class c
 join pg_attribute a on a.attrelid=c.oid and a.attname='id' and not a.attisdropped
 join pg_type ty on ty.oid=a.atttypid and ty.typname='uuid'
 where c.relkind in ('r','p') and c.relnamespace::regnamespace::text not in ('pg_catalog','information_schema','pgsodium','extensions','vault','_realtime','realtime','storage','supabase_migrations','net','cron','graphql','graphql_public','pgbouncer')
 order by 1,2`);
console.log("uuid-id tables:", t.length, "with org col:", t.filter((r:any)=>r.has_org).length);
console.log("schemas:", [...new Set(t.map((r:any)=>r.sch))].join(","));
await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
