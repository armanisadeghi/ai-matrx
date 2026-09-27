-- chair-step: lane FOLLOW-BATCH-2 (2026-09-27). NO COPY HOLDS THE SIGN-IN TABLE. Every row a copy lands in the record store carries foreign keys to auth.users (created_by) and iam.organizations (organization_id); the first such insert takes a lock on auth.users that PostgreSQL holds until COMMIT, so a copy that lands a whole organization in one transaction holds the sign-in table for the whole copy (TAG-COPY-PERF measured 97 s, 56 s and 252 s through the tag copy; a peer on the clone held it 5 minutes through custom.context_tag_copy(uuid)). While it is held no table can be sealed (PROVISION-LOCK's freeze door refuses after 8 s) and any ACCESS EXCLUSIVE request on auth.users queues every sign-in behind it. (1) custom.context_tag_copy(uuid) — the one-transaction whole-organization door — now REFUSES, in a sentence naming custom.context_tag_copy_batch and the follow that commits after each batch. It is SECURITY DEFINER, and a SECURITY DEFINER function cannot commit, so it cannot be a committing loop; the SC-4 and PROOF-DEFECTS suites carry their own test-only loop over the batch door. (2) Two knobs: copy/max_auth_lock_ms (1000) — the longest any copy transaction may hold auth.users, read by the guard aidream packages/matrx-records/tests/test_no_copy_holds_the_sign_in_table_live.py; copy/batch_records (10) — how many records one short transaction of a copy lands (the context follow's main copy, the table mover's Copy again), read by aidream matrx_records.movers. No row outside platform.feature_knob is changed by this file.
-- lane: FOLLOW-BATCH-2
-- lock: platform
-- based-on: custom.context_tag_copy(uuid) 94872339696774ee76e8544f67b77f3dcec08c7eae28dbdc657c8d9a88bffc54
--
-- Inverse: migrations/inverse/followbatch2_no_copy_holds_the_sign_in_table_down.sql.
--
-- THE USE CASE. Arman's Org copies 4,758 scopes and hundreds of tables into the record store. A person
-- signing in, or an owner building a new table in another organization, must never wait behind that copy.

set local statement_timeout = '60s';

insert into platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  min_value, max_value, allowed_values, label, description,
  set_by, basis, overridable_by, override_direction, ui, propagation
)
values
  ('copy', 'max_auth_lock_ms',
   to_jsonb(1000), to_jsonb(1000), 'integer', 'ms',
   50::numeric, 30000::numeric, null::jsonb,
   'Longest copy step holding the sign-in table',
   'The longest one step of a copy into the record store may hold the sign-in table (every row it lands names who created it). A copy is split into steps short enough to stay under this, so a person signing in or a table being built never waits behind a copy.',
   'agent',
   'Lane FOLLOW-BATCH-2, 2026-09-27: PROVISION-LOCK measured that a sign-in read waits behind any ACCESS EXCLUSIVE request on auth.users, which waits behind the longest transaction holding any lock on it; a copy of a whole organization in one transaction held it 10.7 s (production) to 190 s (clone). One second keeps a build''s 8 s freeze budget and a sign-in''s patience far away.',
   array[]::text[], 'any', '{}'::jsonb, 'next_load'),
  ('copy', 'batch_records',
   to_jsonb(10), to_jsonb(10), 'integer', 'records',
   1::numeric, 500::numeric, null::jsonb,
   'Copy step size',
   'How many records one step of a copy into the record store lands. Each step is its own short transaction; a smaller number keeps every step short, a larger one finishes a big organization in fewer steps.',
   'agent',
   'Lane FOLLOW-BATCH-2, 2026-09-27, measured on the clone with the read-only auth.users hold sampler: a first copy of a 200-row table in one transaction held auth.users 97 s (48 s of it server work); in steps of 25 the longest step held it 2.1 s from a Mac (1.0 s server work, the store''s insert triggers), 0.25–0.3 s for the rest. 10 records keeps a step at a few hundred milliseconds of server work, under copy/max_auth_lock_ms with room, and a 200-row table is 20 steps.',
   array[]::text[], 'any', '{}'::jsonb, 'next_load')
on conflict (feature, key) do nothing;

create or replace function custom.context_tag_copy(p_organization_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
begin
  -- RETIRED AS A ONE-TRANSACTION DOOR (lane FOLLOW-BATCH-2). Copying a whole organization's tags in
  -- the caller's transaction holds the sign-in table (auth.users, every copied tag's created_by) until
  -- that transaction commits: minutes for a large organization. A SECURITY DEFINER function cannot
  -- commit between batches, so this door refuses and names the one that can be committed per step.
  raise exception 'custom.context_tag_copy copies a whole organization in one transaction, which holds the sign-in table until it commits, so it no longer runs'
    using errcode = '0A000',
          detail = format('Organization %s: nothing was copied.', coalesce(p_organization_id::text, '(none named)')),
          hint = 'Call custom.context_tag_copy_batch(organization_id, cursor) and COMMIT after each call, passing back the "next" cursor it returns until it is null, then platform.reachability_flush(5) in short transactions until it returns less than 5. The context follow (aidream matrx_records.movers.context_follow) does exactly that; a new edit to any of the organization''s scopes wakes it.';
end;
$function$;

comment on function custom.context_tag_copy(uuid) is
  'Retired (lane FOLLOW-BATCH-2): refuses with 0A000 and names custom.context_tag_copy_batch, which a caller commits after each step. One transaction for a whole organization held auth.users until COMMIT.';
