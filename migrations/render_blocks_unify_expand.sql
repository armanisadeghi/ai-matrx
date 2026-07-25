-- Render-block canonicalization — EXPAND phase (additive, reversible).
--
-- Consolidates public.content_blocks (OLD) onto skill.render_definition (canonical,
-- what the v3 context menu reads). This migration ONLY adds — no drop — so old and
-- new code both keep working until the separate CONTRACT migration drops content_blocks.
--
-- 1. block_type classification column (render_kind | xml | markdown).
-- 2. partial-unique index on block_id (makes it a reliable upsert key).
-- 3. backfill block_type on existing rows.
-- 4. backfill the 112 content_blocks-only rows with FAITHFUL scope
--    (public ONLY for system-org globals; user/other-org rows keep their scope).
--
-- Idempotent. Reversible: delete where metadata->>'migrated_from'='content_blocks',
-- drop the index + column. Access model needs NO RLS change — render_definition's
-- std_select (own OR has_access viewer) already yields see-all-public + edit-own.

-- 1. Classification column
alter table skill.render_definition
  add column if not exists block_type text not null default 'markdown';

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'render_definition_block_type_check'
  ) then
    alter table skill.render_definition
      add constraint render_definition_block_type_check
      check (block_type in ('render_kind', 'xml', 'markdown'));
  end if;
end $$;

-- 2. block_id becomes a reliable upsert key (0 current dupes; anti-join backfill adds none)
create unique index if not exists render_definition_block_id_key
  on skill.render_definition (block_id) where deleted_at is null;

-- 3. Classify existing rows
update skill.render_definition set block_type = case
    when skill_id is not null then 'render_kind'
    when template ~ '"__kind"' then 'render_kind'
    when template ~ '</?[a-zA-Z][a-zA-Z0-9:_-]*\s*/?>' then 'xml'
    else 'markdown'
  end
where deleted_at is null;

-- 4. Backfill the 112 content_blocks-only rows
insert into skill.render_definition (
  block_id, label, description, icon_name, template, sort_order, is_active,
  skill_id, category_id, organization_id, project_id, task_id, created_by,
  visibility, version, block_type, metadata
)
select
  b.block_id,
  b.label,
  b.description,
  coalesce(nullif(btrim(b.icon_name), ''), 'FileText'),
  b.template,
  coalesce(b.sort_order, 100),
  b.is_active,
  -- best-effort skill link: metadata.__kind_source or the kind-<slug>-simple|full block_id
  (select d.id from skill.definition d
     where d.skill_id = 'kind_' || coalesce(
             b.metadata->>'__kind_source',
             replace(regexp_replace(regexp_replace(b.block_id, '^kind-', ''), '-(simple|full)$', ''), '-', '_'))
       and d.deleted_at is null
     limit 1),
  b.category_id,
  b.organization_id,
  b.project_id,
  b.task_id,
  coalesce(b.created_by, b.user_id),
  -- FAITHFUL visibility: only system-org globals become public
  (case when b.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
        then 'public' else 'internal' end)::platform.visibility,
  1,
  (case when b.template ~ '"__kind"' then 'render_kind'
        when b.template ~ '</?[a-zA-Z][a-zA-Z0-9:_-]*\s*/?>' then 'xml'
        else 'markdown' end),
  coalesce(b.metadata, '{}'::jsonb) || jsonb_build_object('migrated_from', 'content_blocks')
from public.content_blocks b
where b.deleted_at is null
  and b.block_id not in (select block_id from skill.render_definition where deleted_at is null);
