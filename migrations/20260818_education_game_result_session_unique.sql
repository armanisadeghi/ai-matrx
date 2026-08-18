-- WP7 / IC-14: one durable game result per study session.
-- This file intentionally contains only the concurrent index so the migration
-- runner can execute it outside a transaction on the live table.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS game_result_session_live_idx
  ON education.game_result (session_id)
  WHERE session_id IS NOT NULL AND deleted_at IS NULL;
