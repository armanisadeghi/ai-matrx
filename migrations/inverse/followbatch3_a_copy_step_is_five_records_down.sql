-- chair-step: inverse of followbatch3_a_copy_step_is_five_records.sql (lane FOLLOW-BATCH-3) — puts knob copy/batch_records back to 10 (its FOLLOW-BATCH-2 value) where it says 5.
-- lane: FOLLOW-BATCH-3
-- lock: platform
set local statement_timeout = '60s';

update platform.feature_knob
   set value = to_jsonb(10), default_value = to_jsonb(10),
       basis = regexp_replace(basis, ' Lane FOLLOW-BATCH-3, 2026-09-29: lowered to 5 .*$', '')
 where feature = 'copy' and key = 'batch_records' and value = to_jsonb(5);
