-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on users.user_email_preferences.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "user_email_preferences_user_id_is_the_caller_insert" on users.user_email_preferences;
drop policy if exists "user_email_preferences_user_id_is_the_caller_update" on users.user_email_preferences;
