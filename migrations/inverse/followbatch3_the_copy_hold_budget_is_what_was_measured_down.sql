-- chair-step: inverse of followbatch3_the_copy_hold_budget_is_what_was_measured.sql (lane FOLLOW-BATCH-3) — puts knob copy/max_auth_lock_ms back to 1000 where it says 3000.
-- lane: FOLLOW-BATCH-3
-- lock: platform
set local statement_timeout = '60s';

update platform.feature_knob
   set value = to_jsonb(1000), default_value = to_jsonb(1000),
       basis = regexp_replace(basis, ' Lane FOLLOW-BATCH-3, 2026-09-30: raised to 3000 .*$', '')
 where feature = 'copy' and key = 'max_auth_lock_ms' and value = to_jsonb(3000);
