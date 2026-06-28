-- migrate: pc_studio_runs_base_retrofit
-- Additive base-entity retrofit: adds org/created_by/updated_by/updated_at/version,
-- backfills, attaches _touch_row + _stamp_actor triggers.
-- Also adds deleted_at.
-- pc_studio_runs_updated_at legacy trigger dropped by retrofit.
-- DO NOT drop existing columns (user_id, organization_id kept).

select platform.retrofit_entity('pc_studio_runs','pc_studio_run','personal','user_id',null,null,'pc_studio_runs_updated_at');

alter table public.pc_studio_runs
  add column if not exists deleted_at timestamptz;

insert into platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
select 'pc_studio_run','public','pc_studio_runs','Podcast Studio Run','private',false,true
where not exists (select 1 from platform.entity_types where token='pc_studio_run');
