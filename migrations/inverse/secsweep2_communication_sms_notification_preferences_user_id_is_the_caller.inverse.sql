-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on communication.sms_notification_preferences.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "sms_notification_preferences_user_id_is_the_caller_insert" on communication.sms_notification_preferences;
drop policy if exists "sms_notification_preferences_user_id_is_the_caller_update" on communication.sms_notification_preferences;
