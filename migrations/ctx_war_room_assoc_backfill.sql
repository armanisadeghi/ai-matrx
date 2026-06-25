-- ctx_war_room_assoc_backfill.sql
-- Wave 3 (ctx / War Room) — ADDITIVE / idempotent backfill of War Room relationships
-- into platform.associations. Invisible to the DEPLOYED app (which still reads
-- ctx_war_room_assignments) until the frontend repoint ships.
--
-- ** RE-RUN this migration immediately before the branch deploy ** to capture any
--    attachments created in ctx_war_room_assignments while testing the live app
--    (content edges ON CONFLICT DO UPDATE re-stamp is_active/position/label from
--    the source row, so re-running self-heals; membership edges DO NOTHING).
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
on conflict (source_type, source_id, target_type, target_id) do update
  -- Re-stamp is_active/position/label from the source-of-truth row. Earlier
  -- partial mirrors left ~99 edges with BARE metadata; DO NOTHING would skip
  -- them forever and the active-pointer (active note/task/audio) would silently
  -- fall back to first-by-position. DO UPDATE makes the re-run self-heal them.
  set metadata = excluded.metadata,
      label    = coalesce(excluded.label, platform.associations.label);

-- 1b) Drop STALE orphan content edges — war-room edges with NO source-of-truth
--     row in ctx_war_room_assignments (artifacts of an earlier partial mirror of
--     since-removed links). The deployed app reads only ctx_war_room_assignments,
--     so these are invisible to users today; left in place they would surface as
--     PHANTOM attachments (and an un-stamped studio_session could hijack the
--     active-audio pointer). Membership + reversed ->scope edges are exempt.
delete from platform.associations a
where a.target_type in ('thread','war_room')
  and not (a.source_type = 'thread' and a.target_type = 'war_room')   -- keep membership
  and not exists (
    select 1 from public.ctx_war_room_assignments w
    where w.entity_id    = a.source_id
      and w.container_id = a.target_id
      and (w.entity_type = a.source_type
           or (a.source_type = 'file' and w.entity_type = 'user_file'))
  );

-- 2) Membership edges: thread -> war_room (the mobility mechanism). LIVE tiles in
--    LIVE rooms only — never seed an edge for a soft-deleted thread/room (that
--    would surface a deleted thread as a live member once reads move onto the edge).
insert into platform.associations (source_type, source_id, target_type, target_id, org_id, metadata, created_by)
select 'thread', t.id, 'war_room', t.session_id, t.organization_id,
       jsonb_build_object('membership', true),
       coalesce(t.created_by, t.user_id)
from public.ctx_war_room_tiles t
where t.session_id is not null and t.organization_id is not null
  and t.is_deleted = false
  and exists (select 1 from public.ctx_war_room_sessions s
              where s.id = t.session_id and s.is_deleted = false)
on conflict (source_type, source_id, target_type, target_id) do nothing;

-- 2b) Purge ORPHANED edges — any war-room edge (membership / content / scope)
--     touching a soft-deleted or missing tile/room, in EITHER direction. The
--     deployed app's softDeleteTile/softDeleteSession don't clean edges, so this
--     self-heals on the pre-deploy re-run; post-cutover the frontend keeps it
--     clean at delete time via assoc_remove_for_entity (assoc_remove_for_entity_rpc.sql).
delete from platform.associations a
where (a.source_type = 'thread'   and not exists (select 1 from public.ctx_war_room_tiles t    where t.id = a.source_id and t.is_deleted = false))
   or (a.target_type = 'thread'   and not exists (select 1 from public.ctx_war_room_tiles t    where t.id = a.target_id and t.is_deleted = false))
   or (a.source_type = 'war_room' and not exists (select 1 from public.ctx_war_room_sessions s where s.id = a.source_id and s.is_deleted = false))
   or (a.target_type = 'war_room' and not exists (select 1 from public.ctx_war_room_sessions s where s.id = a.target_id and s.is_deleted = false));

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
