-- observability_drop_watch.sql
-- Applied 2026-06-25. DROP-phase observability: surface live access to
-- deprecated / to-be-dropped relations so we never drop something still in use.
-- pg_stat_statements is in the `extensions` schema on this project.

-- (1) "Is anyone still calling the OLD names?" — pg_stat_statements call counts
-- per renamed-away compat-view name. The drop-readiness gate for the views.
create or replace view platform.v_deprecated_table_access as
with watched(relname, target) as (values
  ('file_analysis','cld_analysis'),
  ('file_analysis_result','cld_analysis_result'),
  ('file_entities','cld_entities'),
  ('file_overrides','cld_overrides'),
  ('file_page_annotations','cld_page_annotations'),
  ('file_pages','cld_pages'),
  ('file_structure','cld_structure'),
  ('ctx_war_room_sessions','wr_sessions'),
  ('ctx_war_room_tiles','wr_tiles'),
  ('ctx_war_room_assignments','wr_assignments'),
  ('ctx_war_room_tile_attachments','wr_tile_attachments'),
  ('ctx_war_room_tile_audio_sessions','wr_tile_audio_sessions'),
  ('ctx_war_room_tile_notes','wr_tile_notes')
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

comment on view platform.v_deprecated_table_access is
  'DROP-watch: pg_stat_statements call counts for renamed-away compat-view names. calls=0 (since last stats reset) => nobody uses the old name; the view is safe to drop. calls>0 => repoint consumers first (docs/db_rebuild/compat-view-drop-repoint-list.md).';

-- (2) Broad per-table read/write + last-read — find genuinely unused tables.
create or replace view platform.v_table_access_stats as
select schemaname as schema, relname as table_name,
  (coalesce(seq_scan,0)+coalesce(idx_scan,0))::bigint as reads,
  (coalesce(n_tup_ins,0)+coalesce(n_tup_upd,0)+coalesce(n_tup_del,0))::bigint as writes,
  n_live_tup as live_rows,
  greatest(last_seq_scan, last_idx_scan) as last_read
from pg_stat_user_tables
where schemaname in ('public','platform','iam','history');

comment on view platform.v_table_access_stats is
  'DROP-watch: per-table reads/writes + last_read (pg_stat_user_tables). reads=0 AND writes=0 with an old/null last_read across a full usage cycle => drop candidate.';

do $$
begin
  perform 1 from platform.v_deprecated_table_access;
  perform 1 from platform.v_table_access_stats;
  raise notice 'drop-watch views OK';
end $$;
