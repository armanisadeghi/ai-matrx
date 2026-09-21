-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on
-- hr.reference_check.actor_user_id, which re-opens the column to a client naming anybody at all.

drop policy if exists "reference_check_actor_user_id_is_the_caller_insert" on hr.reference_check;
drop policy if exists "reference_check_actor_user_id_is_the_caller_update" on hr.reference_check;
