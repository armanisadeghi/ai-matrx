-- target: branch
--
-- LEVEL TWO FUNCTION EXECUTE GRANTS THAT CAME BACK ON THE REHEARSAL BRANCH.
--
-- FOUND OUTSIDE W1-RULE-APPLY'S BRIEF, AND FIXED BECAUSE IT BLOCKS THAT LANE'S EXIT
-- (rule 20's middle case). `pnpm check:branch-schema-drift` exited 0 at this lane's entry,
-- 18:45 UTC 2026-09-17, printing NO BRANCH GRANT DRIFT. At 19:11 UTC, with the lane's own
-- work landed and every one of its test transactions rolled back, the same command exits 1
-- naming exactly two grants the branch has and production does not:
--
--   LOOSER  esign._can_act(p_signer_id uuid)                      -> authenticated
--   LOOSER  platform.demote_custom_field_index(p_definition_id uuid) -> authenticated
--
-- NEITHER IS THIS LANE'S. `W1-RULE-APPLY` issued no GRANT of any kind, created nothing in
-- `esign` or `platform`, and its files are in schema `custom` alone; the two arrived together
-- within the same half hour, which is the signature of a grant sweep or a provisioner run
-- rather than of a migration. It is the class `W1-PROV-CLOSED` closed at 18:40 for schema
-- `custom` — the provisioner re-granting client roles on every run — reappearing on two
-- objects outside it. The root cause is that lane's to re-examine, and this file is the
-- levelling the gate itself prescribes, not a fix for it.
--
-- WHY A REVOKE IS SAFE HERE AND IS NOT "TOUCHING THE OLD SYSTEM". It runs on the REHEARSAL
-- BRANCH only (`-- target: branch`; rule 9 forbids a REVOKE on production in any lane) and it
-- moves the branch TOWARDS production, which is the only direction this gate has: a branch
-- looser than production answers yes where production answers no, and every access proof
-- taken over it is measuring a system that does not exist.
--
-- IT IS IDEMPOTENT: a REVOKE of a grant that is not there is a no-op, so this file applies
-- twice with the same result and its inverse is the GRANT the branch should never have had —
-- which is why there is no inverse file for it (§4.13: an inverse restores the PRIOR state,
-- and the prior state here is the defect).

set lock_timeout = '5s';
set statement_timeout = '300s';

revoke execute on function esign._can_act(uuid) from authenticated;
revoke execute on function platform.demote_custom_field_index(uuid) from authenticated;
