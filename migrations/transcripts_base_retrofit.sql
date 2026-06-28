-- migrate: transcripts_base_retrofit
-- Additive base-entity retrofit: adds org/created_by/updated_by/updated_at/version,
-- backfills, attaches _touch_row + _stamp_actor triggers.
-- Also adds deleted_at, visibility; backfills from is_public/is_deleted.
-- DO NOT drop existing columns (user_id, is_public, is_deleted kept).

select platform.retrofit_entity('transcripts','transcript','personal','user_id',null,null,'update_transcripts_updated_at');

alter table public.transcripts
  add column if not exists deleted_at timestamptz,
  add column if not exists visibility platform.visibility not null default 'private';

update public.transcripts set visibility='public' where is_public is true and visibility='private';
update public.transcripts set deleted_at = now() where is_deleted is true and deleted_at is null;

insert into platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
select 'transcript','public','transcripts','Transcript','private',false,true
where not exists (select 1 from platform.entity_types where token='transcript');
