import { client } from "./_tmp_lib";
const c = client();
async function main(){
await c.connect();
console.log((await c.query(`select oid::regprocedure::text from pg_proc where proname like 'dd192_selftest%'`)).rows);
await c.query(`drop function if exists public.dd192_selftest_leaking_door(uuid)`);
console.log("after drop:", (await c.query(`select count(*) from pg_proc where proname like 'dd192_selftest%'`)).rows);
await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
