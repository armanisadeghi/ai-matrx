-- chair-step: lane FOLLOW-BATCH-3 (2026-09-29). A COPY STEP NEVER DEADLOCKS WITH A MIGRATION ON THE AUTH TABLES. On production 2026-09-28 22:11–22:23Z eight organizations' final-switch context copies (Arman's Org 3e790542 four times, AI Matrx, Matrx System, Dmotazedi's Org, Arman's Org 9083f992) died with DeadlockDetectedError: the copy held RowExclusive on realtime.messages (the store's change broadcast, taken by its first update) and waited for RowShare on auth.users (its first archive or insert), while a peer's access-ladder migration held ACCESS EXCLUSIVE on auth.* (Supabase's supautils hook) and waited for realtime.messages. The steps were already short (lane FOLLOW-BATCH-2; measured on clone-20260929: a 15-minute pass of Arman's Org held auth.users in no transaction at all) — one step is enough to cross the orders. aidream matrx_records.movers.base.run_step now makes every copy step (the context follow's steps, tag batches and reachability flushes; the table mover's Copy again steps and attribute pass) take auth.users, iam.organizations and realtime.messages FIRST, in the migration's order, waiting at most 300 ms, and roll back and try again on a lock collision (55P03, 40P01, 40001). This file seeds the knob for how long one step keeps trying before the copy stops and says so: copy/step_wait_s (300). No row outside platform.feature_knob is changed.
-- lane: FOLLOW-BATCH-3
-- lock: platform
--
-- Inverse: migrations/inverse/followbatch3_a_copy_step_never_deadlocks_with_a_migration_down.sql.
--
-- THE USE CASE. The final switch's Step 1 copies Arman's Org's 4,785 scopes while another lane applies a
-- migration to the sign-in tables. Neither is ever killed by the other: the copy waits its turn a step at a time.

set local statement_timeout = '60s';

insert into platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  min_value, max_value, allowed_values, label, description,
  set_by, basis, overridable_by, override_direction, ui, propagation
)
values
  ('copy', 'step_wait_s',
   to_jsonb(300), to_jsonb(300), 'integer', 's',
   5::numeric, 3600::numeric, null::jsonb,
   'How long a copy step waits its turn',
   'When a copy step into the record store meets a migration or another writer holding the sign-in or broadcast tables, it steps back and tries again. This is how long one step keeps trying before the copy stops and says so; running the copy again resumes where it stopped.',
   'agent',
   'Lane FOLLOW-BATCH-3, 2026-09-29: the access-ladder migrations of 2026-09-28 held the auth tables for 22:01–22:18Z (17 minutes, several statements); a step that tries again every 0.2–3 s for five minutes outlasts any one of them and never holds the migration up for more than 300 ms.',
   array[]::text[], 'any', '{}'::jsonb, 'next_load')
on conflict (feature, key) do nothing;
