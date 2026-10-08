-- chair-step: two CHECK constraints on ops.proof_check are dropped and re-added WIDER (kind gains 'perf'; the static-identity rule exempts perf rows the way it exempts scenario rows), so every existing row still satisfies them; and the REVOKE withdraws client write privileges from ops.perf_sample, the table this same file creates (empty, never granted to anyone before this transaction) until _b regenerates it read-only. Nothing that existed before is narrowed.
--
-- perf_watch_w1_a_catalog_and_sample.sql
--
-- PERFORMANCE WATCH, WAVE 1 — STORAGE. Design: common-docs/systems/architecture/observability/
-- performance-watch/PLAN.md §1 (the watch is a check: ops.proof_check kind 'perf'), §3 (the
-- sample history ops.perf_sample). Shape copied from the sibling checks store
-- (migrations/ops_check_run_and_item_2026_09_26*.sql).
--
-- ACCESS. ops.perf_sample is `system` variant, data_class `organization` (the class its siblings
-- ops.check_run / ops.check_item / ops.proof_check carry today; Confidential needs Arman's own
-- words, access-ladder law), visibility `internal`, suppress_platform_admin_lane + client_read_only: platform admins read every row through
-- `platform_admin_read`; no client writes anything. The only writers are the ops.perf_*
-- SECURITY DEFINER functions (_c), EXECUTE service-only.
--
-- SPLIT ON PURPOSE (POLICY-LOCK): this file emits no policy; _b regenerates ops.perf_sample alone
-- (the sign-in freeze window is that one generator call to COMMIT); _c adds the functions, knobs
-- and assertions and emits no policy; _d seeds the watches and the pg_cron jobs.
-- Inverse: migrations/inverse/perf_watch_w1_a_catalog_and_sample_down.sql.
set local lock_timeout = '3s';

-- ── 1. The perf catalog columns on ops.proof_check (all nullable / defaulted) ─────────────────
alter table ops.proof_check
  add column if not exists perf_kind text,
  add column if not exists perf_subject jsonb,
  add column if not exists budget_ms numeric,
  add column if not exists budget_stat text,
  add column if not exists owner text,
  add column if not exists perf_state text,
  add column if not exists perf_state_since timestamptz,
  add column if not exists perf_baseline_ms numeric,
  add column if not exists perf_baseline_pinned boolean not null default false,
  add column if not exists perf_last_alert_at timestamptz;

alter table ops.proof_check
  drop constraint proof_check_kind_check,
  add constraint proof_check_kind_check check (kind in ('scenario', 'static', 'perf')),
  drop constraint proof_check_static_identity,
  add constraint proof_check_static_identity
    check (kind in ('scenario', 'perf') or (stable_id is not null and repo is not null)),
  add constraint proof_check_perf_kind_check
    check (perf_kind is null or perf_kind in ('door', 'statement', 'job', 'vital', 'page')),
  add constraint proof_check_budget_stat_check
    check (budget_stat is null or budget_stat in ('p50', 'p95', 'mean', 'p75', 'max')),
  add constraint proof_check_perf_state_check
    check (perf_state is null or perf_state in
           ('learning', 'ok', 'over_budget', 'regressed', 'erroring', 'stale', 'probe_broken', 'paused')),
  add constraint proof_check_budget_ms_check check (budget_ms is null or budget_ms > 0),
  -- A perf watch always says what it measures and how.
  add constraint proof_check_perf_identity
    check (kind <> 'perf' or (perf_kind is not null and perf_subject is not null and perf_state is not null));

-- ── 2. ops.perf_sample through the provisioner ─────────────────────────────────────────────────
select platform.create_entity_table(
  p_schema => 'ops', p_table => 'perf_sample', p_token => 'ops_perf_sample', p_label => 'Performance Sample',
  p_fields => array[
    'check_id uuid NOT NULL REFERENCES ops.proof_check(id) ON DELETE CASCADE',
    'measured_at timestamptz NOT NULL DEFAULT now()',
    'source text NOT NULL CHECK (source IN (''probe'',''statement'',''job'',''vital'',''cli''))',
    'n integer NOT NULL DEFAULT 0 CHECK (n >= 0)',
    'p50_ms numeric',
    'p95_ms numeric',
    'max_ms numeric',
    'mean_ms numeric',
    'calls bigint',
    'errors integer NOT NULL DEFAULT 0 CHECK (errors >= 0)',
    'bytes bigint',
    'release_sha text',
    'state_after text CHECK (state_after IS NULL OR state_after IN (''learning'',''ok'',''over_budget'',''regressed'',''erroring'',''stale'',''probe_broken'',''paused''))',
    'note text'
  ],
  p_variant => 'system', p_versioned => false, p_soft_delete => true, p_visibility => 'internal',
  p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
  p_data_class => 'organization', p_default_list_scope => 'organization');

create index if not exists perf_sample_check_measured_idx on ops.perf_sample (check_id, measured_at desc);

update platform.entity_types
   set suppress_platform_admin_lane = true,
       client_read_only = true,
       retention_owner_column = 'created_by',
       data_class_reason = 'The platform''s own performance measurements (door names, fixture ids, timings): internal operational records for platform admins only (performance-watch PLAN §3). Written only by ops.perf_* SECURITY DEFINER functions.'
 where token = 'ops_perf_sample';

-- Stopgap until _b regenerates: no client write privilege on the brand-new, empty table.
revoke insert, update, delete on ops.perf_sample from anon, authenticated;
