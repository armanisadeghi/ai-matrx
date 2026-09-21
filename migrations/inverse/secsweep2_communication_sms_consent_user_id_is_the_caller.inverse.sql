-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on communication.sms_consent.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "sms_consent_user_id_is_the_caller_insert" on communication.sms_consent;
drop policy if exists "sms_consent_user_id_is_the_caller_update" on communication.sms_consent;
