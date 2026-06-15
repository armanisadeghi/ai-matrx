-- ctx_war_room_tiles_active_tab_agent.sql
--
-- War Room: widen the tile `active_tab` CHECK constraint to allow a new 'agent'
-- tab. The Agent tab embeds the real Scribe "Agent+" collaboration panel
-- (conversation + voice + co-edited working document) bound to the tile's own
-- studio_sessions row — see features/war-room/components/tile/TileAgentTab.tsx.
--
-- The constraint was originally task/notes/audio/combined (ctx_war_room_schema.sql),
-- then widened to add 'files' (ctx_war_room_tile_attachments.sql). This adds
-- 'agent'. Idempotent: drop-if-exists then re-add with the full value set.

ALTER TABLE public.ctx_war_room_tiles
  DROP CONSTRAINT IF EXISTS ctx_war_room_tiles_active_tab_check;

ALTER TABLE public.ctx_war_room_tiles
  ADD CONSTRAINT ctx_war_room_tiles_active_tab_check
  CHECK (active_tab IN ('task','notes','audio','combined','files','agent'));
