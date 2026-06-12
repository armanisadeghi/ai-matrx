-- Multiple audio-first assistant conversations per Scribe studio session.
--
-- Until now a session had exactly ONE assistant conversation
-- (studio_sessions.assistant_conversation_id) bound to the hardcoded
-- AUDIO_ASSISTANT_AGENT_ID. Users can now pick which agent the Scribe assistant
-- uses (per-session, on top of a user-wide default), and switching the agent
-- spins up a separate conversation — a conversation is bound to its agent at
-- creation and cannot be re-pointed at another agent.
--
-- This column tracks every assistant conversation that belongs to the session
-- so the user can flip between them (each remembers its own agent + history).
-- `assistant_conversation_id` remains the ACTIVE pointer; this is the roster.
--
-- Shape: jsonb array of
--   { "conversationId": uuid-string,
--     "agentId":        uuid-string,
--     "createdAt":      iso-8601,
--     "lastUsedAt":     iso-8601 }
--
-- Plain jsonb, no FKs: conversation ids are minted client-side at instance
-- creation (the cx_conversation row only lands on the first turn), mirroring the
-- existing assistant_conversation_id column.

ALTER TABLE public.studio_sessions
  ADD COLUMN IF NOT EXISTS assistant_conversations jsonb NOT NULL DEFAULT '[]'::jsonb;
