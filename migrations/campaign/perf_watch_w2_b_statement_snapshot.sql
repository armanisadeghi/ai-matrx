-- chair-step: the REVOKE withdraws client write privileges from ops.perf_statement_snapshot, the table this same file creates (empty, never granted to anyone before this transaction) until _c regenerates it read-only. Nothing that existed before is narrowed.
--
-- perf_watch_w2_b_statement_snapshot.sql
--
-- PERFORMANCE WATCH, WAVE 2 — THE RAW STATEMENT SNAPSHOT. Design: common-docs/systems/
-- architecture/observability/performance-watch/PLAN.md §2 (statement history). Every hour the
-- collector (ops.perf_statement_collect, _d) copies the raw pg_stat_statements counters of each
-- statement watch's queryids and the top perf.statement_top_n by total time, plus
-- pg_stat_statements_info.stats_reset; a statement sample is the difference of two snapshots.
--
-- ACCESS: exactly the flags of ops.perf_sample (perf_watch_w1_a): `system` variant, data_class
-- `organization`, visibility `internal`, suppress_platform_admin_lane + client_read_only — platform
-- admins read every row through `platform_admin_read`; no client writes anything; the only writer
-- is the ops.perf_* SECURITY DEFINER collector.
-- SPLIT ON PURPOSE (POLICY-LOCK): this file emits no policy; _c regenerates this table alone.
-- Inverse: migrations/inverse/perf_watch_w2_b_statement_snapshot_down.sql.
set local lock_timeout = '3s';

select platform.create_entity_table(
  p_schema => 'ops', p_table => 'perf_statement_snapshot', p_token => 'ops_perf_statement_snapshot',
  p_label => 'Performance Statement Snapshot',
  p_fields => array[
    'run_id uuid NOT NULL',
    'taken_at timestamptz NOT NULL DEFAULT now()',
    'stats_reset timestamptz',
    'userid bigint NOT NULL',
    'dbid bigint NOT NULL',
    'queryid bigint NOT NULL',
    'toplevel boolean NOT NULL DEFAULT true',
    'calls bigint NOT NULL CHECK (calls >= 0)',
    'total_exec_time_ms double precision NOT NULL',
    'max_exec_time_ms double precision',
    'stddev_exec_time_ms double precision',
    'stats_since timestamptz',
    'minmax_stats_since timestamptz',
    'watch_slugs text[] NOT NULL DEFAULT ''{}''::text[]',
    'in_top boolean NOT NULL DEFAULT false',
    'query_head text'
  ],
  p_variant => 'system', p_versioned => false, p_soft_delete => true, p_visibility => 'internal',
  p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
  p_data_class => 'organization', p_default_list_scope => 'organization');

create index if not exists perf_statement_snapshot_run_idx on ops.perf_statement_snapshot (run_id);
create index if not exists perf_statement_snapshot_taken_idx on ops.perf_statement_snapshot (taken_at desc);

update platform.entity_types
   set suppress_platform_admin_lane = true,
       client_read_only = true,
       retention_owner_column = 'created_by',
       data_class_reason = 'Raw pg_stat_statements counters the performance watch diffs into statement samples (normalised query text, call counts, timings): internal operational records for platform admins only (performance-watch PLAN §2). Written only by ops.perf_statement_collect.'
 where token = 'ops_perf_statement_snapshot';

-- Stopgap until _c regenerates: no client write privilege on the brand-new, empty table.
revoke insert, update, delete on ops.perf_statement_snapshot from anon, authenticated;
