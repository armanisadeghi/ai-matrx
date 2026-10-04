import assert from 'node:assert/strict';
import pg from 'pg';
import { dsnFor } from './lib/pooled-db.mjs';

// A paid admin sandbox purchase exercises the actual resolver. Every mutation
// is transaction-local and rolled back, including the live-mode simulation.
const db = new pg.Client({ connectionString: dsnFor('production', { app: 'stripe-lifecycle-proof' }) });
await db.connect();
try {
  await db.query('begin');
  await db.query("set local lock_timeout='2s'");
  await db.query("set local statement_timeout='15s'");
  await db.query("select set_config('app.actor_tier','system',true), set_config('app.actor_system','stripe.lifecycle.proof',true)");
  const user = (await db.query("select id from auth.users where email='admin@admin.com'")).rows[0]?.id;
  assert.ok(user, 'The authorized admin test identity must exist');
  const subscription = (await db.query("select id from billing.subscription where beneficiary_user_id=$1 and not livemode and plan_key='personal-entry' order by created_at desc limit 1", [user])).rows[0]?.id;
  assert.ok(subscription, 'Complete an admin sandbox Entry purchase first');
  const effective = async () => (await db.query('select billing.user_effective_plan($1) plan', [user])).rows[0].plan;
  const original = await effective();
  const membership = (await db.query('select * from iam.organization_member where user_id=$1 limit 1', [user])).rows[0];
  assert.ok(membership, 'Admin needs an existing organization for the authenticated snapshot');
  await db.query("update billing.subscription set livemode=true,status='active',current_period_end=now()+interval '1 month' where id=$1", [subscription]);
  assert.equal(await effective(), original, 'A less generous purchase must preserve the existing grant');
  await db.query('delete from iam.organization_member where user_id=$1', [user]);
  await db.query("update billing.user_plan set expires_at=now()-interval '1 second' where user_id=$1", [user]);
  await db.query('update billing.subscription set livemode=false where id=$1', [subscription]);
  const defaultPlan = (await db.query('select plan_key from billing.plan where is_default and active and deleted_at is null')).rows[0].plan_key;
  assert.equal(await effective(), defaultPlan, 'Sandbox payment must not grant paid access');
  await db.query('update billing.subscription set livemode=true where id=$1', [subscription]);
  assert.equal(await effective(), 'personal-entry', 'Live paid subscription must grant Entry');
  // An unrelated/ungranted organization must not erase this person's purchase.
  const resourceOrg = '00000000-0000-0000-0000-000000000001';
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  const tier = (await db.query('select billing.resolve_effective_tier($1,$2) tier', [user,resourceOrg])).rows[0].tier;
  assert.equal(tier, 'premium', 'Paid person must unlock legacy premium features');
  const capability = (await db.query("select billing.resolve_capability($1,'marketing.automation_run',$2) value", [user,resourceOrg])).rows[0].value;
  const planLimit = (await db.query("select limit_value from billing.plan_limit where plan_id='personal-entry' and capability='marketing.automation_run' and period='month'")).rows[0].limit_value;
  assert.equal(Number(capability.limit), Number(planLimit), 'The actual capability RPC must use the purchased allowance');
  await db.query('insert into iam.organization_member select * from jsonb_populate_record(null::iam.organization_member,$1::jsonb)', [JSON.stringify(membership)]);
  const snapshot = (await db.query('select billing.entitlement_snapshot($1) value', [membership.organization_id])).rows[0].value;
  assert.equal(snapshot.tier, 'premium', 'The UI snapshot must recognize the personal purchase');
  await db.query('delete from iam.organization_member where user_id=$1', [user]);
  await db.query("update billing.subscription set plan_key='personal-pro' where id=$1", [subscription]);
  assert.equal(await effective(), 'personal-pro', 'A paid upgrade must change the allowance');
  await db.query("update billing.subscription set status='canceled' where id=$1", [subscription]);
  assert.equal(await effective(), defaultPlan, 'Canceled payment must stop granting paid access');
  console.log('PASS: existing grant preserved; sandbox excluded; paid activation, upgrade and cancellation resolved correctly.');
} finally {
  await db.query('rollback');
  await db.end();
}
