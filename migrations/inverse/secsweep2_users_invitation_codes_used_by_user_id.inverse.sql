-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on
-- users.invitation_codes.used_by_user_id, which re-opens the column to a client naming anybody at all.

drop policy if exists "invitation_codes_used_by_user_id_is_the_caller_insert" on users.invitation_codes;
drop policy if exists "invitation_codes_used_by_user_id_is_the_caller_update" on users.invitation_codes;
