-- migrate: cmp_response_feedback_base_retrofit
-- Additive base-entity retrofit: adds org/created_by/updated_by/updated_at/version,
-- backfills, attaches _touch_row + _stamp_actor triggers.
-- Also adds deleted_at.
-- NOTE: all 4 existing rows had null comparison_set_id (orphaned), so 'personal'
-- strategy used instead of 'parent' to backfill org from user's personal org.
-- trg_cmp_response_feedback_touch is not an updated_at trigger; not passed to retrofit.
-- DO NOT drop existing columns (user_id, metadata kept).

select platform.retrofit_entity('cmp_response_feedback','cmp_feedback','personal','user_id',null,null,null);

alter table public.cmp_response_feedback
  add column if not exists deleted_at timestamptz;

insert into platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
select 'cmp_feedback','public','cmp_response_feedback','Comparison Response Feedback','private',false,true
where not exists (select 1 from platform.entity_types where token='cmp_feedback');
