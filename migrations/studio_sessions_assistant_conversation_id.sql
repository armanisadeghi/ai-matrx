-- Durable link from a Scribe studio session to its audio-first assistant
-- conversation (cx_conversation.id).
--
-- Without this, useStudioAssistant generated a fresh, client-only conversation
-- id on every mount/refresh — so a page reload silently started a NEW
-- conversation and the prior assistant turns (still persisted server-side under
-- their old id) became unreachable. Persisting the id on the session lets the
-- Assistant screen reuse it across refreshes and rehydrate full history via
-- loadConversation.
--
-- Plain uuid, no FK to cx_conversation: the conversation row is created
-- server-side only on the first turn, but the id is minted client-side at
-- instance creation, so we store it before any row exists.

ALTER TABLE public.studio_sessions
  ADD COLUMN IF NOT EXISTS assistant_conversation_id uuid;
