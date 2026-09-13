import { client } from "./_tmp_lib";
const c = client();
async function main(){
await c.connect();
await c.query("begin");
console.log((await c.query(`select txid_current() t, txid_current()::text::xid x, pg_current_xact_id()::text::bigint b`)).rows);
await c.query(`create temp table _t(id uuid primary key default gen_random_uuid())`);
await c.query(`insert into _t default values`);
console.log((await c.query(`select id::text, xmin::text, (xmin = txid_current()::text::xid) minted, (xmin::text::bigint = (pg_current_xact_id()::text::bigint % 4294967296)) minted2 from _t`)).rows);
await c.query("rollback");
await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
