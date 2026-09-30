-- chair-step: lane DRILL-LEDGER-RECORDS (VERIFY-DRILL-LEDGER-RECORDS F2) — CREATES the one-row server-only table runtime._ai_usage_hourly_watermark (how far the AI usage rollup has counted: the drill answers' as_of), registers it as System machinery (token ai_usage_hourly_watermark), revokes it from every client role, and switches its row security on. A new System table must reach COMMIT with row security on (platform._provision_shape_settled refuses it otherwise), and switching it on fires the event trigger admin_read_follows_rls, whose CREATE POLICY platform_admin_read takes ACCESS EXCLUSIVE on 16 auth, 5 storage and 2 realtime relations until COMMIT — so this is its own tiny file, applied FIRST and in the 01:00–04:00 PT window with Arman told; a lost lock wait retries only this. No row of anybody's data is touched.
-- lane: DRILL-LEDGER-RECORDS
-- lock: platform
--
-- APPLY ORDER: this file first, then drillledger_the_records_behind_a_usage_number_are_the_ledger.sql
-- (whose refresh writes this table and whose door reads it by name).
-- INVERSE: migrations/inverse/drillledger_the_watermark_table_is_row_secured_down.sql

create table runtime._ai_usage_hourly_watermark (
  singleton    boolean     primary key default true check (singleton),
  covered_from timestamptz not null,
  covered_to   timestamptz not null,
  refreshed_at timestamptz not null default now(),
  constraint _ai_usage_hourly_watermark_is_a_range check (covered_from < covered_to)
);
revoke all on runtime._ai_usage_hourly_watermark from public, anon, authenticated;
comment on table runtime._ai_usage_hourly_watermark is
  'DRILL-LEDGER-RECORDS: how far runtime._ai_usage_hourly has counted. One row. covered_to is the instant the last rebuild that reached now cut the ledger at (every execution created before it is in the rollup); covered_from is where that unbroken run of counted hours starts. Written only by runtime.ai_usage_hourly_refresh; read by the drill door as the answer''s as_of and as the cut of the records behind it.';

insert into platform.entity_types (
  token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active,
  notes, is_listed, is_component, is_module, rls_variant, reference_pickable, audit_class,
  audit_class_reason, relation_kind, data_class, data_class_reason, default_list_scope,
  origin, type, type_reason, agent_writable, allow_preview, table_ref
)
values (
  'ai_usage_hourly_watermark', 'runtime', '_ai_usage_hourly_watermark', 'AI usage counted through', 1, false, false, true,
  'One row: how far the hourly AI usage rollup has counted (the drill answer''s as_of).',
  false, false, false, 'system', false, 'machinery',
  'Written only by runtime.ai_usage_hourly_refresh when a rebuild reaches now; never written by a person or a client.',
  'table', 'organization',
  'System machinery with no client lane; read only by the drill door''s definer step.',
  'organization', 'standard', 'system',
  'Lane DRILL-LEDGER-RECORDS: the freshness watermark of the ai_usage rollup (PROGRESS-DRILL-FINISH decision 26).',
  false, false, 'runtime._ai_usage_hourly_watermark'::regclass
)
on conflict (token) do nothing;

-- ROW SECURITY ON — last, so the policy hook's auth/storage/realtime locks are held for this one
-- statement to COMMIT.
alter table runtime._ai_usage_hourly_watermark enable row level security;
