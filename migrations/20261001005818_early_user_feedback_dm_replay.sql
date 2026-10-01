-- Bound interactive outreach retries without changing legacy clients.
SET lock_timeout = '3s';
SET statement_timeout = '30s';
DROP INDEX IF EXISTS communication.dm_messages_early_user_feedback_replay;
CREATE UNIQUE INDEX dm_messages_early_user_feedback_replay
ON communication.dm_messages (sender_id, client_message_id)
WHERE client_message_id LIKE 'early-user-feedback:%';
