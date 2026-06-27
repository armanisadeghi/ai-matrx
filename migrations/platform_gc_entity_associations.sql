-- platform_gc_entity_associations.sql
--
-- Make "soft-deleting a base entity leaks its polymorphic edges" a structurally
-- impossible class of failure.
--
-- `platform.associations` is a polymorphic edge table — (source_type, source_id)
-- and (target_type, target_id) are loose tokens, NOT foreign keys, so a normal
-- ON DELETE CASCADE cannot exist. Today nothing reaps an entity's edges when the
-- entity goes away; the only cleanup is a best-effort client thunk
-- (`assoc.purgeContainerEdges`) that fires fire-and-forget, swallows its failure,
-- and never runs for non-browser delete paths (agent `data_action`, a second
-- client, a cascade, a bulk admin op). Result: dangling membership edges, phantom
-- room members, and threads stranded under a deleted room.
--
-- The platform already has the idiom for this — `platform._gc_scope_associations()`
-- reaps a SCOPE's edges, but it is scope-specific and fires only on HARD delete.
-- War-room (and every `_base_entity` table) SOFT-deletes via `deleted_at`, which
-- it never covers. This generalizes that primitive: ONE token-parameterized GC
-- trigger function (mirroring the `_mirror_fk_to_assoc(token,...)` convention) that
-- reaps an entity's edges on BOTH a hard DELETE and the soft-delete transition
-- (deleted_at NULL -> NOT NULL). Any base-entity table adopts it with one trigger.
--
-- This is layer 2 (the DB guarantee). The optimistic client purge stays as layer 1
-- (it removes edges a beat sooner for concurrent readers); its silent-failure risk
-- is now backstopped here, so a missed/failed client purge can no longer leak.
--
-- Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS + a self-healing cleanup
-- DELETE that only ever removes already-orphaned edges.

-- ── 1. Generic GC trigger function ──────────────────────────────────────────
create or replace function platform._gc_entity_associations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token text := tg_argv[0];   -- the entity_types token for THIS table
  v_id    uuid;
begin
  if tg_op = 'DELETE' then
    v_id := old.id;
  elsif tg_op = 'UPDATE' then
    -- Act ONLY on the soft-delete transition (NULL -> NOT NULL). An un-delete
    -- (NOT NULL -> NULL) or a no-op re-stamp must not reap live edges.
    if old.deleted_at is not null or new.deleted_at is null then
      return null;
    end if;
    v_id := new.id;
  else
    return null;
  end if;

  delete from platform.associations
   where (source_type = v_token and source_id = v_id)
      or (target_type = v_token and target_id = v_id);

  return null;  -- AFTER trigger: return value is ignored
end
$function$;

comment on function platform._gc_entity_associations() is
  'Generic edge GC: reaps every platform.associations row touching the entity '
  '(token = TG_ARGV[0]) on hard DELETE or the soft-delete transition. Attach to '
  'any base-entity table. Generalizes platform._gc_scope_associations() to '
  'soft-deletes. See migrations/platform_gc_entity_associations.sql.';

-- ── 2. Attach to the war-room base-entity tables ────────────────────────────
-- threads (token 'thread')
drop trigger if exists _gc_assoc_softdelete on workspace.threads;
create trigger _gc_assoc_softdelete
  after update of deleted_at on workspace.threads
  for each row execute function platform._gc_entity_associations('thread');

drop trigger if exists _gc_assoc_harddelete on workspace.threads;
create trigger _gc_assoc_harddelete
  after delete on workspace.threads
  for each row execute function platform._gc_entity_associations('thread');

-- war_rooms (token 'war_room')
drop trigger if exists _gc_assoc_softdelete on workspace.war_rooms;
create trigger _gc_assoc_softdelete
  after update of deleted_at on workspace.war_rooms
  for each row execute function platform._gc_entity_associations('war_room');

drop trigger if exists _gc_assoc_harddelete on workspace.war_rooms;
create trigger _gc_assoc_harddelete
  after delete on workspace.war_rooms
  for each row execute function platform._gc_entity_associations('war_room');

-- ── 3. One-time cleanup of existing cruft (self-healing, safe to re-run) ─────
-- Remove every edge whose thread/war_room endpoint is already soft-deleted or
-- gone. This only ever deletes orphaned edges, so re-running is a no-op.
delete from platform.associations a
 where (a.source_type = 'thread'
        and not exists (select 1 from workspace.threads t
                         where t.id = a.source_id and t.deleted_at is null))
    or (a.target_type = 'thread'
        and not exists (select 1 from workspace.threads t
                         where t.id = a.target_id and t.deleted_at is null))
    or (a.source_type = 'war_room'
        and not exists (select 1 from workspace.war_rooms w
                         where w.id = a.source_id and w.deleted_at is null))
    or (a.target_type = 'war_room'
        and not exists (select 1 from workspace.war_rooms w
                         where w.id = a.target_id and w.deleted_at is null));
