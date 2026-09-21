-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on
-- hr.eeo_response.actor_user_id, which re-opens the column to a client naming anybody at all.

drop policy if exists "eeo_response_actor_user_id_is_the_caller_insert" on hr.eeo_response;
drop policy if exists "eeo_response_actor_user_id_is_the_caller_update" on hr.eeo_response;
