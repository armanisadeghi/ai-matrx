import { client } from "./_tmp_lib";
const c = client();
async function main(){
await c.connect();
const uid = (await c.query(`select id from auth.users where email='admin@admin.com'`)).rows[0].id;
await c.query("begin");
await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({sub:uid, role:'authenticated', email:'admin@admin.com', aud:'authenticated'})]);
await c.query("set local role authenticated");
const r = await c.query(`select public.hr_access_audit_query(p_organization_id => '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'::uuid)`);
console.log("own org as admin:", JSON.stringify(r.rows[0]).slice(0,240));
await c.query("rollback");
await c.end();
}
main().catch(e=>{console.error("ERR",e.message);process.exit(1)});
