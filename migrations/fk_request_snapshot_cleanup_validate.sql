-- fk_request_snapshot_cleanup_validate
-- Resolve the request_snapshot conversation_id / user_request_id FKs that were
-- added NOT VALID (fk_coverage_request_snapshot_not_valid.sql) and had ~1.5% legacy
-- orphans whose parents were already deleted. conversation_id is NOT NULL so the 34
-- orphan snapshots are deleted; user_request_id is nullable so its 29 dangling refs
-- are nulled (snapshot preserved). Then VALIDATE both FKs -> fully enforced.
DELETE FROM chat.request_snapshot rs
WHERE rs.conversation_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM chat.conversation c WHERE c.id = rs.conversation_id);

UPDATE chat.request_snapshot rs SET user_request_id = NULL
WHERE rs.user_request_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM chat.user_request u WHERE u.id = rs.user_request_id);

ALTER TABLE chat.request_snapshot VALIDATE CONSTRAINT request_snapshot_conversation_id_fkey;
ALTER TABLE chat.request_snapshot VALIDATE CONSTRAINT request_snapshot_user_request_id_fkey;
