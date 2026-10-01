-- Bound interactive outreach retries without changing legacy clients.
SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- Fail before starting the concurrent build when existing rows would violate uniqueness.
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM communication.dm_messages
    WHERE client_message_id LIKE 'early-user-feedback:%'
    GROUP BY sender_id, client_message_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'early-user-feedback replay keys are duplicated; no index was created';
  END IF;
END
$preflight$;

-- The previous DROP + ordinary CREATE took a write-blocking table lock. This is a new index,
-- so there is nothing to replace; build it without blocking message inserts or updates.
CREATE UNIQUE INDEX CONCURRENTLY dm_messages_early_user_feedback_replay
ON communication.dm_messages (sender_id, client_message_id)
WHERE client_message_id LIKE 'early-user-feedback:%';
