-- lane: SECURITY-SWEEP — the inverse of
-- migrations/campaign/secsweep_the_claim_guard_can_actually_see_the_client.sql
-- There is no meaningful "down" here: the previous bytes were a guard that could not see a
-- client and a door that refused a platform admin. Reverting means re-breaking both. The real
-- undo is the pair's own inverse, secsweep_a_run_claim_is_minted_by_the_door.inverse.sql,
-- which removes the door and the trigger together.
do $$
begin
  raise notice 'secsweep: to undo the claim door entirely, run secsweep_a_run_claim_is_minted_by_the_door.inverse.sql. This file has no separate down-migration: its "before" state is a guard that never fired.';
end $$;
