-- migrate: studio_runs_base_retrofit
-- Additive base-entity retrofit: adds org/created_by/updated_by/updated_at/version,
-- backfills, attaches _touch_row + _stamp_actor triggers.
-- Also adds deleted_at, metadata.
-- DO NOT drop existing columns (user_id kept).

select platform.retrofit_entity('studio_runs','studio_run','personal','user_id',null,null,null);

alter table public.studio_runs
  add column if not exists deleted_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

insert into platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
select 'studio_run','public','studio_runs','Studio Run','private',false,true
where not exists (select 1 from platform.entity_types where token='studio_run');
