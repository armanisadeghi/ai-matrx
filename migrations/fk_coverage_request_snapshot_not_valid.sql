-- fk_coverage_request_snapshot_not_valid
-- chat.request_snapshot had ~1.5% legacy orphan rows (snapshots whose
-- conversation / user_request was deleted while no FK existed to cascade).
-- Add both FKs NOT VALID so all FUTURE writes are enforced and ON DELETE CASCADE
-- prevents new orphans, while the legacy rows are tolerated (non-destructive).
-- To fully validate later, clean the legacy orphans then VALIDATE CONSTRAINT.
-- Idempotent: guarded by pg_constraint existence checks.
DO $f$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='request_snapshot_conversation_id_fkey' AND connamespace='chat'::regnamespace) THEN
    ALTER TABLE chat.request_snapshot ADD CONSTRAINT request_snapshot_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat.conversation(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='request_snapshot_user_request_id_fkey' AND connamespace='chat'::regnamespace) THEN
    ALTER TABLE chat.request_snapshot ADD CONSTRAINT request_snapshot_user_request_id_fkey FOREIGN KEY (user_request_id) REFERENCES chat.user_request(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $f$;
