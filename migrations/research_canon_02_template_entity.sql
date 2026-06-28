-- research_canon_02_template_entity
-- 2026 DB transition: canonicalize public.rs_template as a platform ENTITY (token research_template).
-- Idempotent. Applied live to txzxabzwovsujtloxrus via Supabase MCP.
alter table public.rs_template add column if not exists visibility platform.visibility not null default 'private';
alter table public.rs_template add column if not exists deleted_at timestamptz;
alter table public.rs_template alter column metadata set default '{}'::jsonb;
update public.rs_template set metadata = '{}'::jsonb where metadata is null;

-- System templates are shared platform content → public-readable.
update public.rs_template set visibility = 'public' where is_system and visibility <> 'public';

-- Drop the legacy double-fire updated_at trigger (canonical _touch_row maintains updated_at).
drop trigger if exists set_updated_at on public.rs_template;

insert into platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_versioned, is_active)
select 'research_template','public','rs_template','Research Template','private', false, false, true
where not exists (select 1 from platform.entity_types where token='research_template');

insert into public.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, is_public_column, display_label, url_path_template, rls_uses_has_permission)
select 'research_template','public','rs_template','id','created_by','visibility','Research Template','/research/templates/{id}',true
where not exists (select 1 from public.shareable_resource_registry where resource_type='research_template');

select iam.apply_rls('public','rs_template','research_template','entity');
