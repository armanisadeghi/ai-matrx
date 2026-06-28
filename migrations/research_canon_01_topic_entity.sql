-- research_canon_01_topic_entity
-- 2026 DB transition: canonicalize public.rs_topic as a platform ENTITY (token research_topic).
-- Idempotent. Applied live to txzxabzwovsujtloxrus via Supabase MCP.
alter table public.rs_topic add column if not exists visibility platform.visibility not null default 'private';
alter table public.rs_topic add column if not exists deleted_at timestamptz;

-- Preserve current collaborative access: existing topics become org-internal-readable
-- (the old project-cascade RLS exposed them to anyone who could see the parent project).
-- New topics default 'private'.
update public.rs_topic set visibility = 'internal' where visibility = 'private';

insert into platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_versioned, is_active)
select 'research_topic','public','rs_topic','Research Topic','private', false, false, true
where not exists (select 1 from platform.entity_types where token='research_topic');

insert into public.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, is_public_column, display_label, url_path_template, rls_uses_has_permission)
select 'research_topic','public','rs_topic','id','created_by','visibility','Research Topic','/research/topics/{id}',true
where not exists (select 1 from public.shareable_resource_registry where resource_type='research_topic');

select iam.apply_rls('public','rs_topic','research_topic','entity');
