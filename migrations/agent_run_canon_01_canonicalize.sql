-- agent_run_canon_01_canonicalize
-- agent_run was already base-retrofitted + registered (entity) with _version_capture/stamp_run_org/
-- emit_run_lifecycle triggers. Finish canonicalization; register agent_run_stage as a component.
-- Idempotent. Applied live to txzxabzwovsujtloxrus via Supabase MCP.

-- Backfill created_by from user_id (service-role writes left it null) without churning version/history.
alter table public.agent_run disable trigger user;
update public.agent_run set created_by = user_id where created_by is null and user_id is not null;
alter table public.agent_run enable trigger user;

alter table public.agent_run add column if not exists visibility platform.visibility not null default 'private';
update platform.entity_types set is_versioned = true where token = 'agent_run';

-- Canonical RLS (drops legacy agent_run_self_select; entity = owner short-circuit + org + has_access).
select iam.apply_rls('public','agent_run','agent_run','entity');

-- agent_run_stage -> component of agent_run (via run_id).
insert into platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_versioned, is_active)
select 'agent_run_stage','public','agent_run_stage','Agent Run Stage','private', true, false, true
where not exists (select 1 from platform.entity_types where token='agent_run_stage');

insert into platform.entity_relationships (child_type, parent_type, fk_column, kind)
select 'agent_run_stage','agent_run','run_id','composition'
where not exists (select 1 from platform.entity_relationships where child_type='agent_run_stage' and kind='composition');

select iam.apply_rls('public','agent_run_stage','agent_run_stage','component');
