-- prune_phantom_conversation_associations.sql
--
-- Backfill: delete `platform.associations` edges whose source is a conversation
-- that has no `chat.conversation` row and never will.
--
-- WHY THESE EXIST
-- A conversation id is minted CLIENT-side; the backend only commits the
-- `chat.conversation` row at the end of the FIRST streamed turn. War Room wrote
-- the `conversation -> thread | war_room` edge at MINT time, so every chat that
-- was provisioned but never sent into left an immortal ghost: an edge naming a
-- conversation that never came to exist. Those ghosts render in the container's
-- chat switcher forever, and — falling back to the agent name for their missing
-- title — read as a duplicate of a real chat.
--
-- The creation paths are fixed (edges are now written only after the
-- conversation is confirmed materialized — see
-- features/agents/hooks/useConversationMaterialized.ts and
-- `materializeConversationEdge`). This clears the debris those paths already
-- left behind.
--
-- SAFETY
--   * Deletes ONLY edges with `source_type = 'conversation'` whose conversation
--     row is absent — a live chat is untouchable by this statement.
--   * The 15-minute floor means a chat whose very first turn is streaming right
--     now (row not yet committed) can never be caught.
--   * Deletes the EDGE only, never a conversation, thread, or room.
--   * Idempotent: re-running finds nothing once the debris is gone.
--
-- The standing guard is the `dangling-conversation-associations` data-integrity
-- check (lib/integrity/checks.ts) — if it ever reports non-zero again, a writer
-- regressed; fix the writer, do not just re-run this.

delete from platform.associations a
using (
  select a2.id
  from platform.associations a2
  left join chat.conversation c on c.id = a2.source_id
  where a2.source_type = 'conversation'
    and c.id is null
    and a2.created_at < now() - interval '15 minutes'
) doomed
where a.id = doomed.id;
