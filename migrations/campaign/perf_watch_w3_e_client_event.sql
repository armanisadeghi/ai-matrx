-- chair-step: the REVOKE withdraws client write privileges from ops.perf_client_event, the table this same file creates (empty, never granted to anyone before this transaction) until _f regenerates it read-only. Nothing that existed before is narrowed.
--
-- perf_watch_w3_e_client_event.sql
--
-- PERFORMANCE WATCH, WAVE 3 — RAW REAL-USER PAGE SPEED. Design: common-docs/systems/architecture/
-- observability/performance-watch/PLAN.md §2 (real-user vitals). A sampled page load (perf.client_sample_rate)
-- sends one batch of web-vitals (LCP, INP, CLS ×1000, TTFB, FCP) to ops.perf_client_report (_g); each
-- metric is one row here: the route TEMPLATE (never a raw path), the value, nothing about the person.
-- Rolled up hourly into ops.perf_sample (source 'vital'); raw rows kept perf.client_raw_retention_days (7).
--
-- ACCESS: exactly the flags of ops.perf_sample (perf_watch_w1_a): `system` variant, data_class
-- `organization`, visibility `internal`, suppress_platform_admin_lane + client_read_only — platform
-- admins read every row through `platform_admin_read`; no client writes anything directly; the only
-- writer is the SECURITY DEFINER door ops.perf_client_report, which stores no user id (created_by is
-- the platform actor, organization_id the system organization).
-- SPLIT ON PURPOSE (POLICY-LOCK): this file emits no policy; _f regenerates this table alone.
-- Inverse: migrations/inverse/perf_watch_w3_e_client_event_down.sql.
set local lock_timeout = '3s';

select platform.create_entity_table(
  p_schema => 'ops', p_table => 'perf_client_event', p_token => 'ops_perf_client_event',
  p_label => 'Performance Client Event',
  p_fields => array[
    'measured_at timestamptz NOT NULL DEFAULT now()',
    'metric text NOT NULL CHECK (metric IN (''LCP'',''INP'',''CLS'',''TTFB'',''FCP''))',
    'route text NOT NULL CHECK (route ~ ''^/'' AND length(route) <= 200)',
    'value_ms numeric NOT NULL CHECK (value_ms >= 0 AND value_ms <= 600000)',
    'rating text CHECK (rating IS NULL OR rating IN (''good'',''needs-improvement'',''poor''))',
    'navigation_type text CHECK (navigation_type IS NULL OR length(navigation_type) <= 40)',
    'release_sha text CHECK (release_sha IS NULL OR length(release_sha) <= 64)'
  ],
  p_variant => 'system', p_versioned => false, p_soft_delete => true, p_visibility => 'internal',
  p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
  p_data_class => 'organization', p_default_list_scope => 'organization');

create index if not exists perf_client_event_measured_idx on ops.perf_client_event (measured_at);

update platform.entity_types
   set suppress_platform_admin_lane = true,
       client_read_only = true,
       retention_owner_column = 'created_by',
       data_class_reason = 'Raw real-user page-speed numbers (route template, metric, value; no person, no raw path): internal operational records for platform admins only (performance-watch PLAN §2). Written only by ops.perf_client_report.'
 where token = 'ops_perf_client_event';

-- Stopgap until _f regenerates: no client write privilege on the brand-new, empty table.
revoke insert, update, delete on ops.perf_client_event from anon, authenticated;
