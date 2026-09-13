import { client } from "./_tmp_lib";
const c = client();
async function main(){
await c.connect();
const d = (await c.query(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='hr' and p.proname='reveal_ssn'`)).rows[0].d;
console.log(d);
await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
