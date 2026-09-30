-- chair-step: lane FOLLOW-BATCH-3 (2026-09-30). THE COPY HOLD BUDGET IS WHAT WAS MEASURED. Knob copy/max_auth_lock_ms (the longest one step of a copy may hold the sign-in table) goes from 1000 to 3000 where it still says the 1000 lane FOLLOW-BATCH-2 seeded before any server-side measurement existed. Measured on clone-20260929 by the database's own clock (aidream packages/matrx-records/tests/auth_lock_sampler.py: each statement's query_start to state_change in pg_stat_activity, sampled inside the database; self-test 1.5 s pg_sleep reads 1,502 ms, a 2.28 s idle hold reads 80 ms): a context copy's steps took median 102 ms, p95 571 ms, p99 952 ms and max 1,768–2,913 ms of server time across four runs, the tail being steps that land a new Table and a tag batch's commit-time relation checks while the shared clone was loaded (a single knob read took 425 ms at that moment), 0 ms of it waiting on anybody's lock. 3 s stays well inside PROVISION-LOCK's 8 s freeze-grab budget. custom.io_import_rows aims at half of this knob, so an import call's measured writing target becomes 1.5 s (IMPORT-2 originally chose 2 s). No row outside platform.feature_knob is changed.
-- lane: FOLLOW-BATCH-3
-- lock: platform
--
-- Inverse: migrations/inverse/followbatch3_the_copy_hold_budget_is_what_was_measured_down.sql.
--
-- THE USE CASE. The final switch's Step 1 copies Arman's Org while people sign in and owners build tables. No
-- copy step holds the sign-in table longer than a few seconds, and nearly all hold it for a tenth of a second.

set local statement_timeout = '60s';

update platform.feature_knob
   set value = to_jsonb(3000), default_value = to_jsonb(3000),
       basis = basis || ' Lane FOLLOW-BATCH-3, 2026-09-30: raised to 3000 after measuring by the database''s own clock — median 102 ms, p95 571 ms, p99 952 ms, max 1.8–2.9 s of server time per copy step on the shared clone.'
 where feature = 'copy' and key = 'max_auth_lock_ms' and value = to_jsonb(1000);
