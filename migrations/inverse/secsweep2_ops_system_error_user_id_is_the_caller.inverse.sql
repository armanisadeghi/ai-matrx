-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on ops.system_error.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "system_error_user_id_is_the_caller_insert" on ops.system_error;
drop policy if exists "system_error_user_id_is_the_caller_update" on ops.system_error;
