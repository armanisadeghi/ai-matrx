-- observability_prune_war_room_watch.sql
-- The War Room DROP is complete: the base tables became workspace.war_rooms /
-- workspace.threads, and the four link tables (wr_assignments,
-- wr_tile_attachments, wr_tile_audio_sessions, wr_tile_notes) were hard-dropped
-- from graveyard on 2026-07-21 (drop_graveyard_wr_link_tables.sql). Prune the
-- six war-room watch rows from platform.v_deprecated_table_access — nothing to
-- monitor once the names no longer exist. The unrelated file_* -> cld_* rows
-- stay (that migration is still being watched).
-- Idempotent: CREATE OR REPLACE.

create or replace view platform.v_deprecated_table_access as
with watched(relname, target) as (values
  ('file_analysis','cld_analysis'),
  ('file_analysis_result','cld_analysis_result'),
  ('file_entities','cld_entities'),
  ('file_overrides','cld_overrides'),
  ('file_page_annotations','cld_page_annotations'),
  ('file_pages','cld_pages'),
  ('file_structure','cld_structure')
)
select w.relname as deprecated_name, w.target as new_name,
  coalesce(sum(s.calls),0)::bigint as calls,
  coalesce(round(sum(s.total_exec_time)::numeric,1),0) as total_ms,
  count(distinct s.queryid) as distinct_statements
from watched w
left join extensions.pg_stat_statements s
  on s.query ~* ('\m'||w.relname||'\M')
group by w.relname, w.target
order by calls desc, w.relname;
