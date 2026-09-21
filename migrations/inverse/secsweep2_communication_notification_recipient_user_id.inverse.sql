-- chair-step: withdraws the SECURITY-SWEEP-2 addressability check on
-- communication.notification.recipient_user_id, which re-opens the column to a client naming anybody at all.

drop policy if exists "notification_recipient_user_id_is_addressable_insert" on communication.notification;
drop policy if exists "notification_recipient_user_id_is_addressable_update" on communication.notification;
