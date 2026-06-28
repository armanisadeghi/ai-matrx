-- migrate: pc_episodes_base_retrofit
-- Additive base-entity retrofit: adds org/created_by/updated_by/updated_at/version,
-- backfills, attaches _touch_row + _stamp_actor triggers.
-- Also adds deleted_at, metadata.
-- pc_shows has no user_id so personal strategy used on pc_episodes directly.
-- DO NOT drop existing columns (user_id, is_published kept).

select platform.retrofit_entity('pc_episodes','pc_episode','personal','user_id',null,null,'pc_episodes_updated_at');

alter table public.pc_episodes
  add column if not exists deleted_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

insert into platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
select 'pc_episode','public','pc_episodes','Podcast Episode','private',false,true
where not exists (select 1 from platform.entity_types where token='pc_episode');
