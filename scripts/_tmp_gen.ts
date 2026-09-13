import { client } from "./_tmp_lib";
import { writeFileSync } from "node:fs";
const c = client();
async function main(){
await c.connect();
const d:any = (await c.query(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_access_audit_query'`)).rows[0];
writeFileSync('/tmp/hraq_body.sql', d.d);
console.log("written", d.d.length);
console.log((await c.query(`select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname in ('has_org_access_for','employments_of','capability') and pronamespace::regnamespace::text in ('iam','hr')`)).rows);
await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
