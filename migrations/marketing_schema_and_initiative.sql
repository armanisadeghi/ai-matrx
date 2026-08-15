-- Applied live via Supabase MCP 2026-08-15 (project txzxabzwovsujtloxrus).
--
-- Marketing's cross-channel container. Named `initiative`, never `campaign`:
-- a table name may repeat across schemas only when it means the same role
-- (common-docs/systems/db-rules/FEATURE.md §1a), and crm.outreach_list — the
-- former crm.campaign — is a worked contact list, a different thing entirely.
--
-- Its own schema because it is genuinely none of the existing ones: it spans
-- web.* (sites), seo.* (search) and channels with no tables yet, so filing it
-- under any one of them would make that schema lie about its scope.
-- Arman approved the `marketing` schema 2026-08-15.

create schema if not exists marketing;

comment on schema marketing is
  'Cross-channel marketing layer: the initiative container that content, social, email, ads and outreach report into. Website/crawl facts stay in web.*; search facts stay in seo.*.';

grant usage on schema marketing to authenticated, service_role;

do $$
begin
  if to_regclass('marketing.initiative') is null then
    perform platform.create_entity_table(
      p_schema => 'marketing', p_table => 'initiative',
      p_token => 'marketing_initiative', p_label => 'Initiative',
      p_fields => ARRAY[
        'name text NOT NULL',
        'description text',
        'brand_id uuid REFERENCES web.brand(id)',
        $f$status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed','archived'))$f$,
        $f$objective text NOT NULL DEFAULT 'other' CHECK (objective IN ('awareness','acquisition','conversion','retention','launch','seasonal','other'))$f$,
        'goal text',
        'starts_on date',
        'ends_on date',
        'budget_amount numeric(14,2)',
        $f$budget_currency text NOT NULL DEFAULT 'USD'$f$,
        $f$details jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true,
      p_visibility => 'internal', p_category => false, p_listed => true,
      p_org_default => true, p_gin_jsonb => true);
  end if;
end $$;

-- A timeline that ends before it starts is never real data.
alter table marketing.initiative
  drop constraint if exists initiative_window_ordered;
alter table marketing.initiative
  add constraint initiative_window_ordered
  check (starts_on is null or ends_on is null or ends_on >= starts_on);

create index if not exists initiative_brand_idx
  on marketing.initiative (brand_id) where deleted_at is null;
create index if not exists initiative_status_idx
  on marketing.initiative (status, starts_on desc) where deleted_at is null;

update platform.entity_types
   set title_column = 'name', content_role = 'container', reference_pickable = true
 where token = 'marketing_initiative';

-- A brand's initiatives are containment, NOT composition: an initiative is an
-- entity with its own access, not a component whose access derives from the
-- brand. Registering the edge is what lets the brand page list them.
insert into platform.entity_relationships (parent_type, child_type, fk_column, kind, note)
values ('web_brand','marketing_initiative','brand_id','containment',
        'an initiative is usually for one brand, but owns its own access')
on conflict do nothing;

-- Without this the "Shared" scope can never work: share_resource_with_user
-- raises on an unregistered resource type.
insert into platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, is_public_column,
   display_label, url_path_template, rls_uses_has_permission, is_active, content_role, is_scopeable)
values
  ('marketing_initiative','marketing','initiative','id','created_by',null,
   'Initiative','/marketing/initiatives/{id}',true,true,'container',true)
on conflict (resource_type) do update set
  schema_name = excluded.schema_name, table_name = excluded.table_name,
  display_label = excluded.display_label, url_path_template = excluded.url_path_template,
  is_active = true;

-- Per token. NEVER the global sweep: it dies on entity_types row agent_card.
select platform.sync_association_gc_triggers('marketing_initiative');
