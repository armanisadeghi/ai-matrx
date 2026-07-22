-- Drop the four retired War Room link tables from the graveyard schema.
--
-- These were the pre-cutover M2M/link tables (tile↔assignment/attachment/
-- audio-session/note). The 2026-06-25 platform.associations cutover replaced
-- every one of them with association edges, and the 2026-06-26 workspace-schema
-- move retired them into `graveyard` (reversible). Verified 2026-07-21 before
-- this hard drop: no inbound FKs, no functions/views physically depend on them,
-- no platform.entity_types / shareable_resource_registry rows, 0 calls in
-- pg_stat_statements (platform.v_deprecated_table_access), and zero code
-- references in matrx-frontend or aidream. Data (432 rows) is fully superseded
-- by platform.associations edges. PITR is the recovery net for this final step.
--
-- Idempotent: safe to re-run.

drop table if exists graveyard.wr_assignments;
drop table if exists graveyard.wr_tile_attachments;
drop table if exists graveyard.wr_tile_audio_sessions;
drop table if exists graveyard.wr_tile_notes;
