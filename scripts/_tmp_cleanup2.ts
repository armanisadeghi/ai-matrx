import { client } from "./_tmp_lib";
const c = client();
async function main(){ await c.connect();
await c.query(`drop table if exists public._dd192_probe`);
console.log("left:", (await c.query(`select count(*) from pg_class where relname like '%dd192%'`)).rows);
await c.end(); }
main().catch(e=>{console.error(e);process.exit(1)});
