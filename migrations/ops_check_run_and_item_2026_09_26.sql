-- chair-step: the REVOKE withdraws client write privileges from the two tables this same file creates (empty, never granted to anyone before this transaction) until _26b/_26c regenerate them read-only; nothing that existed before is narrowed.
--
-- ops_check_run_and_item_2026_09_26.sql
--
-- CHECKS RUN IN THE APP, P2 STORAGE: the static-check catalog columns on ops.proof_check, the
-- two new tables ops.check_run / ops.check_item, and the SECURITY DEFINER functions that are the
-- ONLY write path into them. Design: common-docs/projects/checks-run-in-the-app/
-- P2-STORAGE-DESIGN.md (v2, §2–§4); attack: P2-STORAGE-ATTACK.md (F1–F17); build log: §7 there.
--
-- ACCESS (F1). Both tables are `system` variant, data_class `confidential`,
-- suppress_platform_admin_lane = true — the shape the F1 fix proved on ops.proof_check: no
-- global_readable system-org lane, `platform_admin_read` still emitted (the admin law), the staff
-- WRITE arm removed. Rows are `internal` visibility, never `personal`: DD-165 walls the platform-
-- admin read arm to visibility >= 'internal', so a personal row would hide from our own admin.
--
-- WRITES (F4). `client_read_only = true` on both tokens, so iam.apply_table_grants issues
-- `authenticated` SELECT only on EVERY regeneration and asserts no client mutation privilege
-- remains (a hand REVOKE would last only until the next apply_rls). EXECUTE on the functions is
-- service_role only; no platform.client_callable_door row, because no client calls them. The
-- aidream ORM connects as `postgres` (owner, bypassrls), so privileges do not bind it — its
-- guard is code: aidream/services/checks_ingest is the one caller.
--
-- RETENTION (F2). Inert today (the lifecycle sweep's handler gate is closed). Growth is bounded
-- by the writer: check_items_apply_run soft-deletes a check's check_run rows older than the knob
-- `checks.check_run_trash_days` (30), and two policy rows purge trashed rows once the sweep runs.

--
-- SPLIT INTO FOUR TRANSACTIONS ON PURPOSE (POLICY-LOCK). Every CREATE/DROP POLICY freezes sign-in
-- (supautils takes ACCESS EXCLUSIVE on the auth.* relations) until COMMIT. As one transaction this
-- held that freeze ~20 s on the clone (two provisioner calls + two regenerations + the functions).
-- So: _26 (this file) creates the tables and sets their flags (window ~1 s); _26b and _26c each
-- regenerate ONE table (window = one generator's policy emission to commit); _26d adds the write
-- path, knobs, retention and the assertions and emits no policy at all. Between _26 and _26b the
-- client write grants are withdrawn by hand below; _26b/_26c make that permanent through
-- client_read_only (a hand REVOKE alone would last only until the next regeneration).
-- ── M1: the static-check catalog columns on ops.proof_check (nullable/defaulted) ──────────────
alter table ops.proof_check
  add column if not exists kind text not null default 'scenario',
  add column if not exists stable_id text,
  add column if not exists repo text,
  add column if not exists command text,
  add column if not exists reads_class text,
  add column if not exists timeout_seconds integer,
  add column if not exists level text,
  add column if not exists fix_kind text,
  add column if not exists itemized boolean not null default false,
  add column if not exists watch text,
  add column if not exists last_applied_run_id uuid,
  add column if not exists last_applied_started_at timestamptz;

alter table ops.proof_check
  add constraint proof_check_kind_check check (kind in ('scenario', 'static')),
  add constraint proof_check_repo_check check (repo is null or repo in ('matrx-frontend', 'aidream')),
  add constraint proof_check_reads_class_check
    check (reads_class is null or reads_class in ('repo', 'catalog', 'live_rows', 'network', 'writes_repo', 'writes_db')),
  add constraint proof_check_level_check check (level is null or level in ('error', 'warning', 'advisory')),
  add constraint proof_check_fix_kind_check check (fix_kind is null or fix_kind in ('code', 'migration', 'data', 'external')),
  -- A static check is identified by its DECLARED id within its repo (F8); both repos may declare
  -- the same id, so the key is the pair.
  add constraint proof_check_static_identity check (kind = 'scenario' or (stable_id is not null and repo is not null)),
  add constraint proof_check_repo_stable_id_key unique (repo, stable_id);

-- ── M2: the two tables, through the provisioner ───────────────────────────────────────────────
select platform.create_entity_table(
  p_schema => 'ops', p_table => 'check_run', p_token => 'ops_check_run', p_label => 'Check Run',
  p_fields => array[
    'check_id uuid NOT NULL REFERENCES ops.proof_check(id) ON DELETE CASCADE',
    'status text NOT NULL CHECK (status IN (''completed'',''errored'',''timed_out'',''skipped''))',
    'git_sha text',
    'host text CHECK (host IS NULL OR host IN (''ci'',''worker'',''fargate'',''local''))',
    'started_at timestamptz NOT NULL',
    'finished_at timestamptz',
    'duration_ms integer',
    'exit_code integer',
    'new_count integer NOT NULL DEFAULT 0',
    'known_count integer NOT NULL DEFAULT 0',
    'findings_count integer NOT NULL DEFAULT 0',
    'peak_rss_mb integer',
    'skipped_reason text',
    'run_scope text NOT NULL CHECK (run_scope IN (''full'',''partial''))',
    'scan_complete boolean NOT NULL DEFAULT false',
    'verdict text CHECK (verdict IS NULL OR verdict IN (''pass'',''fail''))',
    'headline text',
    'applied boolean NOT NULL DEFAULT false',
    'apply_note text'
  ],
  p_variant => 'system', p_versioned => false, p_soft_delete => true, p_visibility => 'internal',
  p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
  p_data_class => 'confidential', p_default_list_scope => 'organization');

select platform.create_entity_table(
  p_schema => 'ops', p_table => 'check_item', p_token => 'ops_check_item', p_label => 'Check Item',
  p_fields => array[
    'check_id uuid NOT NULL REFERENCES ops.proof_check(id) ON DELETE CASCADE',
    'item_key text NOT NULL CHECK (char_length(item_key) BETWEEN 1 AND 300)',
    'unit_key text NOT NULL',
    'state text NOT NULL CHECK (state IN (''open'',''handed_off'',''fixed'',''accepted'',''check_broken'',''check_retired''))',
    'accept_basis text CHECK (accept_basis IS NULL OR accept_basis IN (''allowlist'',''baseline'',''db''))',
    'title text',
    'file text',
    'line integer',
    'rule text',
    'first_seen_run_id uuid REFERENCES ops.check_run(id) ON DELETE SET NULL',
    'last_transition_run_id uuid REFERENCES ops.check_run(id) ON DELETE SET NULL',
    'handed_off_at timestamptz',
    'handed_off_to text',
    'fixed_at timestamptz',
    'review_after timestamptz',
    'db_accept_reason text'
  ],
  p_variant => 'system', p_versioned => false, p_soft_delete => true, p_visibility => 'internal',
  p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
  p_data_class => 'confidential', p_default_list_scope => 'organization');

alter table ops.check_item
  add constraint check_item_check_key unique (check_id, item_key),
  add constraint check_item_accept_basis_iff_accepted check ((state = 'accepted') = (accept_basis is not null)),
  add constraint check_item_db_accept_reviewed
    check (accept_basis is distinct from 'db' or (review_after is not null and db_accept_reason is not null));
create index if not exists check_item_state_unit_idx on ops.check_item (state, unit_key);
create index if not exists check_item_check_state_idx on ops.check_item (check_id, state);
create index if not exists check_run_check_started_idx on ops.check_run (check_id, started_at desc);
-- Every FK needs a covering index (provision_shape_guard, enforced at COMMIT).
create index if not exists check_item_first_seen_run_idx on ops.check_item (first_seen_run_id);
create index if not exists check_item_last_transition_run_idx on ops.check_item (last_transition_run_id);
-- A nullable FK into a tenant-scoped table carries a validation-only same-org trigger.
create trigger trg_same_org_ops_check_item_first_seen_run_id
  before insert or update of first_seen_run_id on ops.check_item
  for each row execute function platform.assert_same_org('first_seen_run_id', 'ops.check_run');
create trigger trg_same_org_ops_check_item_last_transition_run_id
  before insert or update of last_transition_run_id on ops.check_item
  for each row execute function platform.assert_same_org('last_transition_run_id', 'ops.check_run');

-- ── Access: admin-only reads, no client writes, regenerated (never hand policies) ────────────
update platform.entity_types
   set suppress_platform_admin_lane = true,
       client_read_only = true,
       retention_owner_column = 'created_by',
       data_class_reason = 'The platform''s own check findings and run log (security-scanner output, file paths, table names): internal operational records for platform admins only (P2-STORAGE-ATTACK F1). Written only by ops.check_* SECURITY DEFINER functions.'
 where token in ('ops_check_run', 'ops_check_item');


-- Stopgap until _26b/_26c regenerate: no client write privilege on the brand-new, empty tables.
revoke insert, update, delete on ops.check_run, ops.check_item from anon, authenticated;
