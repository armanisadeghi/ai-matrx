-- chair-step: lane FOLLOW-BATCH-3 (2026-09-29). A COPY STEP IS FIVE RECORDS. Knob copy/batch_records (how many records one short step of a copy into the record store lands or brings current) goes from 10 to 5, as the platform default and as its seeded value, only where it still says the 10 lane FOLLOW-BATCH-2 seeded (an organization's own override is left alone). Measured on clone-20260929 with the read-only auth.users sampler (aidream packages/matrx-records/tests/auth_lock_sampler.py): a step of ten held clinics brought current took up to 1.4 s of server work while it held the sign-in table (the store runs its statement triggers, ~90 ms each, and a deferred relation check per row), over knob copy/max_auth_lock_ms (1000); five keeps a step near half that. No row outside platform.feature_knob is changed.
-- lane: FOLLOW-BATCH-3
-- lock: platform
--
-- Inverse: migrations/inverse/followbatch3_a_copy_step_is_five_records_down.sql.
--
-- THE USE CASE. The final switch's Step 1 brings Arman's Org's 4,785 scopes current. Each step now holds the
-- sign-in table for about half a second of work, so a person signing in, or a migration, waits at most that.

set local statement_timeout = '60s';

update platform.feature_knob
   set value = to_jsonb(5), default_value = to_jsonb(5),
       basis = basis || ' Lane FOLLOW-BATCH-3, 2026-09-29: lowered to 5 — a step of ten held clinics brought current took up to 1.4 s of server work on clone-20260929 while it held auth.users, over copy/max_auth_lock_ms.'
 where feature = 'copy' and key = 'batch_records' and value = to_jsonb(10);
