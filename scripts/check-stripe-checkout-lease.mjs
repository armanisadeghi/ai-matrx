import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { dsnFor } from './lib/pooled-db.mjs';

const db = new pg.Client({ connectionString: dsnFor('production', { app: 'stripe-lease-proof' }) });
await db.connect();
try {
  await db.query('begin');
  await db.query("set local lock_timeout='2s'");
  const customer = (await db.query("select c.stripe_customer_id from billing.customer c join auth.users u on u.id=c.beneficiary_user_id where u.email='admin@admin.com' and not c.livemode")).rows[0]?.stripe_customer_id;
  assert.ok(customer, 'An admin sandbox checkout customer is required');
  const first = randomUUID(), second = randomUUID();
  const claim = async token => (await db.query('select billing.claim_checkout($1,false,$2) value',[customer,token])).rows[0].value;
  const renew = async token => (await db.query('select billing.renew_checkout($1,false,$2) value',[customer,token])).rows[0].value;
  assert.equal(await claim(first),true);
  assert.equal(await claim(second),false,'A second checkout must be excluded');
  assert.equal(await renew(first),true,'The active request can renew');
  await db.query("update billing.customer set metadata=jsonb_set(metadata,'{checkout_lease,until}',to_jsonb(now()-interval '1 second')) where stripe_customer_id=$1 and not livemode",[customer]);
  assert.equal(await renew(first),false,'An expired worker must stop before Stripe writes');
  assert.equal(await claim(second),true);
  await db.query('select billing.release_checkout($1,false,$2)',[customer,first]);
  assert.equal(await renew(second),true,'Old cleanup must not release the new owner');
  await db.query('select billing.release_checkout($1,false,$2)',[customer,second]);
  assert.equal(await claim(first),true,'A released checkout must be available again');
  console.log('PASS: exclusion, renewal, expired-worker fence, token-safe release and recovery.');
} finally { await db.query('rollback'); await db.end(); }
