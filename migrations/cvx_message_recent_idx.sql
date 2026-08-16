-- Supports `last_activity_at` in public.cvx_list_scoped.
--
-- "Last activity" is the newest VISIBLE message in a conversation, which means
-- one `ORDER BY created_at DESC LIMIT 1` probe per candidate row. The existing
-- user-view index is keyed on `position`, so without this the probe had to sort
-- every message of every conversation on the page. Keyed DESC on created_at so
-- the probe is a single index tuple.
--
-- CONCURRENTLY, in its own file: chat.message is a hot table and a plain
-- CREATE INDEX would queue behind every in-flight writer (CLAUDE.md § migrations).

CREATE INDEX CONCURRENTLY IF NOT EXISTS cx_message_conversation_recent_idx
  ON chat.message (conversation_id, created_at DESC)
  WHERE deleted_at IS NULL AND is_visible_to_user = true;
