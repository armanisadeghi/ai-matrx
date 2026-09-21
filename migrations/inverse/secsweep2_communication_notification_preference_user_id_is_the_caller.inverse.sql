-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on communication.notification_preference.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "notification_preference_user_id_is_the_caller_insert" on communication.notification_preference;
drop policy if exists "notification_preference_user_id_is_the_caller_update" on communication.notification_preference;
