-- chair-step: inverse of followbatch3_a_copy_step_never_deadlocks_with_a_migration.sql (lane FOLLOW-BATCH-3) — removes the knob copy/step_wait_s. aidream's copy steps then use their named fallback of 300 s and say so in the log.
-- lane: FOLLOW-BATCH-3
-- lock: platform
set local statement_timeout = '60s';

delete from platform.feature_knob where feature = 'copy' and key = 'step_wait_s';
