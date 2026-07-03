-- =============================================================================
-- agent_surface_to_associations.sql
--
-- Canonicalize the CONDEMNED agent↔surface binding (agent.agent_surface) onto
-- the ONE association edge (platform.associations), per the canonical-associations
-- skill (Recipe A-DB) and features/surfaces/FEATURE.md "⛔️ CONDEMNED" section.
--
-- This is the PRODUCT DECISION the WORK-QUEUE flagged: surfaces become a
-- first-class UUID entity, so the agent→surface link is a real association edge
-- (RESOURCE=source=agent → CONTAINER=target=surface) instead of a bespoke M2M.
--
-- STAGE 1 (this file) is ADDITIVE and non-destructive:
--   1. Give ui.ui_surface a stable UUID identity (its PK is text `name`).
--   2. Register `surface` in platform.entity_types so it is a canonical token.
--   3. Backfill every agent.agent_surface row into platform.associations,
--      count-verified or ROLLBACK. The old table is left intact as a reversible
--      fallback until the FE repoint is verified in the maintenance window.
--
-- Edge model (verified against live data 2026-07-03: 30 rows — 24 user-tier on
-- personal orgs, 6 org-tier on shared orgs, 0 project/task/global):
--   source_type = 'agent'   source_id = agent_id
--   target_type = 'surface' target_id = ui_surface.id
--   organization_id         = binding org (personal org keeps user-tier private
--                             via iam.has_org_access; shared org = member-visible)
--   role                    = tier+scope discriminator, unique within (agent,
--                             surface) under associations_unique(src,src_id,tgt,
--                             tgt_id,role):
--                               user    → 'binding:u:'||user_id
--                               org     → 'binding:o:'||organization_id
--                               project → 'binding:p:'||project_id  (none today)
--                               task    → 'binding:t:'||task_id      (none today)
--                               global  → 'binding:g'                (none today)
--   metadata                = { value_mappings, version, visibility, tier,
--                               user_id/project_id/task_id, legacy_table,
--                               legacy_id } — value_mappings is the load-bearing
--                             payload the launch-time resolver reads.
--
-- STAGE 2 (repoint menu_surface view + create_shortcut_from_agent_surface RPC +
-- FE service/stats onto associations) and STAGE 3 (graveyard agent_surface) ship
-- once the FE path is verified. See the migration for those steps.
--
-- Idempotent: safe to re-run. IF NOT EXISTS / ON CONFLICT / to_regclass guards.
-- =============================================================================

-- ── 1. UUID identity for ui.ui_surface ──────────────────────────────────────
alter table ui.ui_surface
  add column if not exists id uuid not null default gen_random_uuid();

create unique index if not exists ui_surface_id_key on ui.ui_surface (id);

-- ── 2. Register `surface` as a canonical entity token ───────────────────────
-- Minimal metadata row (assoc_add/assoc_for_entity only read schema_name/
-- table_name/is_active). ui_surface is an unversioned, non-soft-delete global
-- catalog, so is_versioned/has_soft_delete = false.
insert into platform.entity_types
  (token, schema_name, table_name, label, base_tier, is_versioned,
   has_soft_delete, is_active, is_listed, is_component, is_module,
   category, default_visibility, default_scopeable, table_ref)
values
  ('surface', 'ui', 'ui_surface', 'UI Surface', 1, false,
   false, true, true, false, false,
   null, 'public'::platform.visibility, true, 'ui.ui_surface'::regclass)
on conflict (token) do update set
  schema_name = excluded.schema_name,
  table_name  = excluded.table_name,
  label       = excluded.label,
  is_active   = true,
  is_listed   = excluded.is_listed,
  is_versioned = excluded.is_versioned,
  has_soft_delete = excluded.has_soft_delete,
  table_ref   = excluded.table_ref;

-- ── 3. Backfill agent.agent_surface → platform.associations (count-verified) ─
do $$
declare
  v_src   integer;
  v_dst   integer;
begin
  if to_regclass('agent.agent_surface') is null then
    raise notice 'agent.agent_surface already retired; skipping backfill';
    return;
  end if;

  insert into platform.associations
    (source_type, source_id, target_type, target_id, organization_id,
     role, label, position, metadata, created_by, created_at)
  select
    'agent'                              as source_type,
    s.agent_id                           as source_id,
    'surface'                            as target_type,
    us.id                                as target_id,
    s.organization_id                    as organization_id,
    case
      when s.user_id       is not null then 'binding:u:' || s.user_id
      when s.project_id    is not null then 'binding:p:' || s.project_id
      when s.task_id       is not null then 'binding:t:' || s.task_id
      when s.organization_id is not null then 'binding:o:' || s.organization_id
      else 'binding:g'
    end                                  as role,
    null                                 as label,
    null                                 as position,
    jsonb_build_object(
      'value_mappings', s.value_mappings,
      'version',        s.version,
      'visibility',     s.visibility::text,
      'tier', case
                when s.user_id    is not null then 'user'
                when s.project_id is not null then 'project'
                when s.task_id    is not null then 'task'
                when s.organization_id is not null then 'org'
                else 'global'
              end,
      'user_id',      s.user_id,
      'project_id',   s.project_id,
      'task_id',      s.task_id,
      'legacy_table', 'agent.agent_surface',
      'legacy_id',    s.id
    )                                    as metadata,
    coalesce(s.created_by, s.user_id)    as created_by,
    s.created_at                         as created_at
  from agent.agent_surface s
  join ui.ui_surface us on us.name = s.surface_name
  where s.deleted_at is null
  on conflict on constraint associations_unique do nothing;

  -- Count-verify: every live binding must have a matching backfilled edge.
  select count(*) into v_src
    from agent.agent_surface s
    join ui.ui_surface us on us.name = s.surface_name
   where s.deleted_at is null;

  select count(*) into v_dst
    from platform.associations a
   where a.target_type = 'surface'
     and a.metadata->>'legacy_table' = 'agent.agent_surface';

  if v_src <> v_dst then
    raise exception
      'agent_surface backfill count mismatch: % live bindings vs % association edges (role collision or orphan surface_name?)',
      v_src, v_dst;
  end if;

  raise notice 'agent_surface → associations backfill OK: % edges', v_dst;
end $$;
