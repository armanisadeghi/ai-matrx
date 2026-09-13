import { client } from "./_tmp_lib";
const c = client();
async function main(){
await c.connect();
console.log((await c.query(`select organization_id::text, count(*) from iam.invitations group by 1 order by 2 desc limit 10`)).rows);
const orgs = (await c.query(`select organization_id::text o from iam.organization_member where user_id=(select id from auth.users where email='admin@admin.com')`)).rows.map((r:any)=>r.o);
console.log("admin orgs", orgs.length);
await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
