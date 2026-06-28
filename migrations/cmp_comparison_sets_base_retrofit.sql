-- migrate: cmp_comparison_sets_base_retrofit
-- Additive base-entity retrofit: adds org/created_by/updated_by/updated_at/version,
-- backfills, attaches _touch_row + _stamp_actor triggers.
-- Also adds deleted_at.
-- trg_cmp_comparison_sets_touch is not an updated_at trigger; not passed to retrofit.
-- DO NOT drop existing columns (user_id, organization_id, metadata kept).

select platform.retrofit_entity('cmp_comparison_sets','comparison_set','personal','user_id',null,null,null);

alter table public.cmp_comparison_sets
  add column if not exists deleted_at timestamptz;

insert into platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
select 'comparison_set','public','cmp_comparison_sets','Comparison Set','private',false,true
where not exists (select 1 from platform.entity_types where token='comparison_set');
