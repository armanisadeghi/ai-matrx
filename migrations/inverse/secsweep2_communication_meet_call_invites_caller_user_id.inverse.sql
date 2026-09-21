-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on
-- communication.meet_call_invites.caller_user_id, which re-opens the column to a client naming anybody at all.

drop policy if exists "meet_call_invites_caller_user_id_is_the_caller_insert" on communication.meet_call_invites;
drop policy if exists "meet_call_invites_caller_user_id_is_the_caller_update" on communication.meet_call_invites;
