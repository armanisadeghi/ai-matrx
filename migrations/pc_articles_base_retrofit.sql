-- migrate: pc_articles_base_retrofit
-- Additive base-entity retrofit: adds org/created_by/updated_by/updated_at/version,
-- backfills, attaches _touch_row + _stamp_actor triggers.
-- Also adds deleted_at, metadata.
-- Parent strategy: inherits org from pc_episodes via episode_id.
-- set_updated_at legacy trigger dropped by retrofit.
-- DO NOT drop existing columns (user_id kept).

select platform.retrofit_entity('pc_articles','pc_article','parent','user_id','pc_episodes','episode_id','set_updated_at');

alter table public.pc_articles
  add column if not exists deleted_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

insert into platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
select 'pc_article','public','pc_articles','Podcast Article','private',false,true
where not exists (select 1 from platform.entity_types where token='pc_article');
