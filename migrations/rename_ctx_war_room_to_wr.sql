-- rename_ctx_war_room_to_wr.sql
-- Applied 2026-06-24 (Wave 4). ctx_war_room_* → wr_* — the ctx_ prefix wrongly implied the
-- context system; war room is its own domain.
--
-- NON-BREAKING: each old name is kept as a security_invoker auto-updatable compat VIEW so the
-- War Room FE + functions keep working until they migrate to wr_*, then the views are dropped.
-- platform.entity_types tokens (war_room, thread) repointed to the new table names. Idempotent.
-- 6 tables: sessions, tiles, assignments, tile_attachments, tile_audio_sessions, tile_notes.
-- ("tile" kept per the directive — only the ctx_war_room_ prefix changed; tile→thread is a
-- separate naming decision for the War Room owner.)

do $$
declare r record;
begin
  for r in select * from (values
    ('ctx_war_room_sessions','wr_sessions'),
    ('ctx_war_room_tiles','wr_tiles'),
    ('ctx_war_room_assignments','wr_assignments'),
    ('ctx_war_room_tile_attachments','wr_tile_attachments'),
    ('ctx_war_room_tile_audio_sessions','wr_tile_audio_sessions'),
    ('ctx_war_room_tile_notes','wr_tile_notes')) as v(old_name, new_name)
  loop
    if to_regclass('public.'||r.new_name) is null and to_regclass('public.'||r.old_name) is not null then
      execute format('alter table public.%I rename to %I', r.old_name, r.new_name);
      execute format('create view public.%I with (security_invoker=true) as select * from public.%I', r.old_name, r.new_name);
    end if;
  end loop;
end $$;

update platform.entity_types set schema_name='public', table_name='wr_sessions' where token='war_room';
update platform.entity_types set schema_name='public', table_name='wr_tiles'    where token='thread';

do $$
declare n_tbl int; n_view int; et_ok int;
begin
  select count(*) into n_tbl from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE' and table_name in
    ('wr_sessions','wr_tiles','wr_assignments','wr_tile_attachments','wr_tile_audio_sessions','wr_tile_notes');
  select count(*) into n_view from information_schema.views
    where table_schema='public' and table_name like 'ctx\_war\_room\_%';
  select count(*) into et_ok from platform.entity_types where token in ('war_room','thread') and table_name in ('wr_sessions','wr_tiles');
  if n_tbl <> 6 then raise exception 'war-room rename: expected 6 wr_ tables, got %', n_tbl; end if;
  if n_view <> 6 then raise exception 'war-room rename: expected 6 compat views, got %', n_view; end if;
  if et_ok <> 2 then raise exception 'war-room rename: entity_types not repointed (%/2)', et_ok; end if;
  raise notice 'war-room rename OK';
end $$;
