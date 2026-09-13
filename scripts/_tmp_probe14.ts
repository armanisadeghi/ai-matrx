import { client } from "./_tmp_lib";
const c = client();
const OURS = `(pg_xact_status(((case when xmin::text::bigint <= (pg_current_xact_id()::text::bigint % 4294967296)
    then (pg_current_xact_id()::text::bigint / 4294967296)
    else (pg_current_xact_id()::text::bigint / 4294967296) - 1 end) * 4294967296
  + xmin::text::bigint)::text::xid8) = 'in progress')`;
async function main(){
await c.connect();
await c.query("begin");
await c.query(`create temp table _t(id uuid primary key default gen_random_uuid(), n int)`);
await c.query(`insert into _t(n) values (1)`);
console.log("our own row:", (await c.query(`select id::text, ${OURS} ours from _t`)).rows);
// a committed row from another transaction must NOT be ours
const c2 = client(); await c2.connect();
await c2.query(`create table if not exists public._dd192_probe(id uuid primary key default gen_random_uuid())`);
await c2.query(`insert into public._dd192_probe default values`);
console.log("other tx row:", (await c.query(`select id::text, ${OURS} ours from public._dd192_probe limit 1`)).rows);
await c2.query(`drop table public._dd192_probe`); await c2.end();
await c.query("rollback"); await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
