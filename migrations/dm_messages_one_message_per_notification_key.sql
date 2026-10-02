-- draft: owner-session(board+notify) — applied to the clone; production apply awaits Arman together with dm_soft_expiry_and_dm_pairs_with_email.sql (an index on communication.dm_messages)
--
-- ONE NOTICE, ONE MESSAGE — ENFORCED BY THE DATABASE, NOT BY A LOOKUP.
--
-- The notification spine's DM leg writes `communication.dm_messages.client_message_id =
-- 'notification:<notification id>'` (aidream services/notifications/channels/dm.py). The server's
-- DM primitive (`direct_message.send_direct_message`) is idempotent on that key, but until this
-- index only by READING first: two workers that both read "absent" — a lease that expired mid-send,
-- a doorbell and a sweep racing — could each write the message, and the person got the notice
-- twice. With the index the second insert fails 23505 and the primitive treats that as the replay it
-- is (it re-reads the winner's row and verifies it is the same message).
--
-- Partial, on the prefix the spine owns, exactly like the two existing replay indexes
-- (`dm_task_assignment_client_message_id_uidx`, `dm_messages_early_user_feedback_replay`): other
-- writers' keys keep their own rules. CONCURRENTLY, so writers are never blocked while it builds —
-- which is why this is its own autocommit file (apply with aidream `db/apply_migrations.py`).
-- Measured before writing: 0 rows carry the prefix on the main database, 3 (all distinct) on the
-- clone, so the build cannot fail on an existing duplicate.

-- A CONCURRENTLY build that is cancelled (lock timeout behind a long transaction) leaves an
-- INVALID index that `if not exists` would then skip forever — so the file drops whatever is
-- there and builds it, which is re-runnable after any partial attempt.
drop index concurrently if exists communication.dm_messages_notification_replay_key_uidx;

create unique index concurrently dm_messages_notification_replay_key_uidx
  on communication.dm_messages (client_message_id)
  where client_message_id like 'notification:%';
