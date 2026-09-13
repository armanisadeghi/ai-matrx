import { client } from "./_tmp_lib";
const c = client();
async function main(){
await c.connect();
const q = async (s:string,p?:any[]) => (await c.query(s,p)).rows;
console.table(await q(`select m.organization_id, o.name, m.role from iam.organization_member m join iam.organizations o on o.id=m.organization_id where m.user_id=(select id from auth.users where email='test@test.com')`));
console.table(await q(`select m.organization_id, o.name, m.role from iam.organization_member m join iam.organizations o on o.id=m.organization_id where m.user_id=(select id from auth.users where email='admin@admin.com')`));
console.log("orgless", await q(`select u.id, u.email from auth.users u where not exists (select 1 from iam.organization_member m where m.user_id=u.id) limit 5`));
console.log("total orgs", await q(`select count(*) from iam.organizations`));
await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
