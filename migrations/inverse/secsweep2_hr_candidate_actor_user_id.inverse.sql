-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on
-- hr.candidate.actor_user_id, which re-opens the column to a client naming anybody at all.

drop policy if exists "candidate_actor_user_id_is_the_caller_insert" on hr.candidate;
drop policy if exists "candidate_actor_user_id_is_the_caller_update" on hr.candidate;
