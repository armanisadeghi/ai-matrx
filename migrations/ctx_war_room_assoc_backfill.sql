-- ctx_war_room_assoc_backfill.sql
-- Wave 3 (ctx / War Room) — ADDITIVE / idempotent backfill of War Room relationships
-- into platform.associations. Invisible to the DEPLOYED app (which still reads
-- ctx_war_room_assignments) until the frontend repoint ships.
--
-- ** RE-RUN this migration immediately before the branch deploy ** to capture any
--    attachments created in ctx_war_room_assignments while testing the live app
--    (ON CONFLICT DO NOTHING makes re-running a safe no-op for existing edges).
--
-- Mapping (war-room vocabulary -> platform.associations):
--   * source = the attached entity; target = the container (member -> container).
--   * container_type 'room'  -> target_type 'war_room';  'thread' -> 'thread'.
--   * entity_type   'user_file' -> source_type 'file' (canonical token; matches the
--     99 edges already mirrored). note/task/project/studio_session pass through.
--   * org_id from the container (room = session org; thread = tile org, both backfilled
--     in ctx_war_room_base_retrofit -- verified 0 orphan / 0 null-org before this runs).
--   * is_active + position -> metadata; label -> label column.
--   * created_by = the assignment's created_by, else its user_id.
--
-- Also seeds the thread<->room MEMBERSHIP edge (thread -> war_room) from tiles.session_id
-- -- the mechanism that powers thread mobility + the Unassigned holding area (no edge =
-- unassigned). 0 such edges exist today.
--
-- DEFERRED (separate steps): reversed -> scope edges (via ctx_scope_assignments + its
-- _mirror_assoc trigger), and all litter/table drops.

-- 1) Content edges: every attached resource -> its container.
insert into platform.associations (source_type, source_id, target_type, target_id, org_id, label, metadata, created_by)
select
  case when a.entity_type = 'user_file' then 'file' else a.entity_type end,
  a.entity_id,
  case when a.container_type = 'room' then 'war_room' else 'thread' end,
  a.container_id,
  case when a.container_type = 'room'
       then (select s.organization_id from public.ctx_war_room_sessions s where s.id = a.container_id)
       else (select t.organization_id from public.ctx_war_room_tiles    t where t.id = a.container_id) end,
  a.label,
  coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object('is_active', a.is_active, 'position', a.position),
  coalesce(a.created_by, a.user_id)
from public.ctx_war_room_assignments a
on conflict (source_type, source_id, target_type, target_id) do nothing;

-- 2) Membership edges: thread -> war_room (the mobility mechanism).
insert into platform.associations (source_type, source_id, target_type, target_id, org_id, metadata, created_by)
select 'thread', t.id, 'war_room', t.session_id, t.organization_id,
       jsonb_build_object('membership', true),
       coalesce(t.created_by, t.user_id)
from public.ctx_war_room_tiles t
where t.session_id is not null and t.organization_id is not null
on conflict (source_type, source_id, target_type, target_id) do nothing;

-- 3) Self-verify (whole migration rolls back on failure).
do $$
declare v_content int; v_member int; v_nullorg int;
begin
  select count(*) into v_member  from platform.associations where source_type='thread' and target_type='war_room';
  select count(*) into v_content from platform.associations where target_type in ('thread','war_room') and not (source_type='thread' and target_type='war_room');
  select count(*) into v_nullorg from platform.associations where target_type in ('thread','war_room') and org_id is null;
  if v_member < 1   then raise exception 'WR assoc backfill FAIL: no thread->war_room membership edges'; end if;
  if v_nullorg > 0  then raise exception 'WR assoc backfill FAIL: % null-org war-room edges', v_nullorg; end if;
  raise notice 'WR assoc backfill OK -- % content edges, % membership edges, 0 null-org', v_content, v_member;
end $$;
