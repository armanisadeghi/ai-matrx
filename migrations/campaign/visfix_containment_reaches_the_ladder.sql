-- chair-step: it BACKFILLS platform.associations (an INSERT the production allow-list refuses by name, and
--   a DO block it cannot read), because repointing custom.containment_edges at the associations without
--   that backfill in the SAME transaction would forget 190 existing containments between two statements.
--   Everything here is additive in effect: two functions, one trigger on the campaign's own custom.record,
--   and edge rows for containments that already exist in the store. No DROP, no REVOKE, no GRANT, nothing
--   deleted, nothing rewritten, and no row of any other feature touched.
-- based-on: custom.containment_edges(uuid) 222c49a311aa54ff59925937783625bcf52d7cdd9902c7356ffcf3963301fe1a
-- VIS-FIX — THE STORE'S CONTAINMENT NOW REACHES THE VISIBILITY LADDER, BY BEING THE SAME EDGE.
--
-- WHAT WAS BROKEN, measured on the MAIN database 2026-09-19 (V9's headline defect, the
-- 19 Sep verdict's "worst thing we found"). A record's containment lived in TWO places
-- that never met:
--
--   · `custom.record.data.parent_id` — the only containment a client can write — reached
--     `custom.containment_edges()`, which nothing in the access path reads.
--   · `custom.carrying_edges` — which `custom.visibility_ancestors` → `custom.has_visibility`
--     → every read door actually walk — is `platform.containment_edges ∪ (platform.associations
--     ⋈ custom.carrying_rule)`, and NOTHING wrote a `platform.associations` row when a record
--     was written with a parent.
--
--   RED, reproduced in a rolled-back transaction before this file was written: a child under
--   a parent, a `viewer` grant on the parent for a principal who is NOT a member of that
--   organization → 1 store edge, 0 ladder edges, `has_visibility(child)` FALSE. One
--   `platform.associations` row `role='contains'` for the same pair → TRUE, immediately.
--   VIS-1 says visibility is derived from the associations ALONE; half the store's
--   containment was never in them.
--
-- WHAT THIS FILE DOES — and it closes the class rather than adding a second path:
--
--   1. `custom.record_carrying_edges(id, data_class, data, deleted_at)` — ONE function that
--      says which carrying edge a record row declares. The containment parent (REC-7, REC-14)
--      and a referenced carrying relation record (REC-26, REL-6) are the only two, and they
--      are read here and nowhere else.
--   2. `custom._containment_association()` + `zz_w2_containment_association` on `custom.record`
--      — an AFTER INSERT/UPDATE row trigger that writes, revives or withdraws exactly that edge
--      in `platform.associations` IN THE SAME TRANSACTION as the record write. It is on the
--      TABLE, not in a door, so create, update, reparent and restore are all covered by
--      construction, whichever door (or migration) did the writing. Soft delete, restore and
--      hard delete are already `platform._gc_entity_associations`'s job and stay there.
--   3. `custom.containment_edges(organization)` is REPOINTED at `platform.associations`. It no
--      longer reads `data.parent_id` at all. That is the second path being REMOVED, not fenced
--      off: after this file there is exactly one stored form of "this record is inside that
--      one", and both the ladder and the store's own cascade read it.
--   4. THE BACKFILL, in this same file: every live record that already carries a parent, and
--      every live referenced carrying relation, gets its edge. Without it step 3 would silently
--      forget 189 existing containments.
--
-- 🚨 WHAT `-- guard: custom/system_enabled` DOES AND DOES NOT HOLD OFF HERE, said out loud
-- rather than implied, because this file's guard is NOT a branch in its own body.
--
--   · What the knob holds off is THE STORE — `custom.has_visibility`, the read doors and every
--     consumer of them are gated on it by W7-OFF's ramp. Nothing outside schema `custom` reads
--     a `role='contains'` record→record edge: `platform.association_types` registers
--     `record → record` with `container_side = 'none'`, so `platform.containment_edges` — and
--     therefore `platform.reachability` and every pre-campaign consumer of it — cannot see one.
--     The rows this file writes are inert everywhere except the new store.
--   · What it does NOT hold off is THE WRITE, deliberately. MEASURED on the main database
--     2026-09-19: of the 190 live records that already carry a parent, 185 sit in organizations
--     where `custom/system_enabled` resolves FALSE. A trigger that returned early on that knob
--     would leave those 185 containments with no edge, and the day an organization's knob went
--     true its records would be invisible to everybody they should reach, with nothing saying
--     so. That is the silent failure this system exists to refuse, so the edge — the store's
--     own integrity — is written unconditionally and the knob keeps its real job.
--
-- Nothing in this file touches a row of any other feature.
--
-- REVERSIBLE: yes — `visfix_containment_reaches_the_ladder.inverse.sql` beside this file drops
-- the trigger and restores `custom.containment_edges` to its `data.parent_id` body. The
-- backfilled association rows are left in place deliberately: they are true statements about
-- the graph, and `platform._gc_entity_associations` already retires them with their records.

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- 1 — THE ONE PLACE THAT SAYS WHICH CARRYING EDGE A RECORD ROW DECLARES
-- ═════════════════════════════════════════════════════════════════════════════════════════
-- Both arms are exactly the two the retired body of `custom.containment_edges` carried, with
-- one deliberate change: an OWNED relation record emits nothing of its own, because
-- `custom.relation_own` writes `parent_id` onto its target in the same transaction and arm 1
-- already carries that. Emitting both made the same pair twice and, worse, left the relation's
-- copy behind after a reparent moved the parent.
create or replace function custom.record_carrying_edges(
  p_id         uuid,
  p_data_class text,
  p_data       jsonb,
  p_deleted_at timestamptz
) returns table(container_id uuid, item_id uuid, edge_role text)
language sql
stable
set search_path to ''
as $$
  -- arm 1 — REC-7 / REC-14: the parent IS the containment edge, and there is at most one.
  select custom.containment_parent(p_data), p_id, 'contains'::text
  where p_deleted_at is null
    and p_id is not null
    and custom.containment_parent(p_data) is not null
  union all
  -- arm 2 — REC-26 / REL-6: a referenced CARRYING relation reaches what it points at, so the
  -- `from` end is the container and the `to` end is the item. Its declared role is honoured
  -- when `custom.carrying_rule` knows it (that table is what decides how much a role conveys);
  -- a role nobody declared falls back to `references`, the rule for a plain referenced
  -- relation, rather than producing an edge `custom.carrying_edges` would drop in silence.
  select (p_data ->> 'from')::uuid,
         (p_data ->> 'to')::uuid,
         case
           when exists (select 1 from custom.carrying_rule cr
                         where cr.role = (p_data ->> 'role') and cr.is_active)
             then p_data ->> 'role'
           else 'references'
         end
  where p_deleted_at is null
    and p_data_class = 'relation'
    and coalesce((p_data ->> 'carrying')::boolean, false)
    and coalesce(p_data ->> 'kind', 'referenced') <> 'owned'
    and p_data ->> 'from' is not null
    and p_data ->> 'to' is not null;
$$;

comment on function custom.record_carrying_edges(uuid, text, jsonb, timestamptz) is
  'VIS-1/REC-7/REC-26: the carrying edge(s) a custom.record row declares. Read by the trigger that keeps platform.associations level with the store and by nothing else.';

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- 2 — THE EDGE IS WRITTEN IN THE SAME TRANSACTION AS THE RECORD
-- ═════════════════════════════════════════════════════════════════════════════════════════
create or replace function custom._containment_association() returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_named boolean := false;
begin
  -- Nothing that can move an edge moved.
  if tg_op = 'UPDATE'
     and old.data       is not distinct from new.data
     and old.data_class is not distinct from new.data_class
     and old.deleted_at is not distinct from new.deleted_at then
    return null;
  end if;

  -- `platform._stamp_actor_tier` refuses an automated write that names no system, and it is
  -- right to: "an AI did it" with no name is not provenance. A person's write and an agent's
  -- write already name themselves and are left exactly as they are. A server or migration
  -- channel that declared nothing would otherwise have its RECORD write refused by this edge,
  -- so the edge names ITSELF as the system and the row says so — announced in the data, never
  -- swallowed.
  if nullif(current_setting('app.actor_system', true), '') is null
     and coalesce(platform.declared_actor_tier(), platform.actor_tier()) in ('ai', 'code') then
    perform set_config('app.actor_system', 'custom.containment', true);
    v_named := true;
  end if;

  -- WITHDRAW what this row used to declare and no longer does (a reparent, a relation
  -- repointed, a parent removed). `deleted_via_*` is deliberately NOT stamped: this is not a
  -- trashing, so `platform._gc_entity_associations`'s restore must not bring it back.
  if tg_op = 'UPDATE' then
    update platform.associations a
       set deleted_at = now()
     where a.deleted_at is null
       and a.source_type = 'record'
       and a.target_type = 'record'
       and (a.source_id, a.target_id, a.role) in (
             select o.container_id, o.item_id, o.edge_role
               from custom.record_carrying_edges(old.id, old.data_class, old.data, old.deleted_at) o)
       and (a.source_id, a.target_id, a.role) not in (
             select n.container_id, n.item_id, n.edge_role
               from custom.record_carrying_edges(new.id, new.data_class, new.data, new.deleted_at) n);
  end if;

  -- BRING BACK a tombstoned edge this row declares again (a reparent back where it came from,
  -- a relation repointed at its old target). This is an UPDATE of its own rather than the
  -- `on conflict do update` it used to be: `platform.revive_tombstoned_association` is a BEFORE
  -- INSERT trigger that un-tombstones the very row the ON CONFLICT clause then targets, and
  -- Postgres refuses that as "cannot affect row a second time" — measured on the main database
  -- when this file was rehearsed, on the second reparent of the same pair.
  update platform.associations a
     set deleted_at       = null,
         deleted_via_type = null,
         deleted_via_id   = null
   where a.deleted_at is not null
     and a.source_type = 'record'
     and a.target_type = 'record'
     and (a.source_id, a.target_id, a.role) in (
           select n.container_id, n.item_id, n.edge_role
             from custom.record_carrying_edges(new.id, new.data_class, new.data, new.deleted_at) n);

  -- WRITE what it declares now.
  insert into platform.associations
    (source_type, source_id, target_type, target_id, role, organization_id)
  select 'record', n.container_id, 'record', n.item_id, n.edge_role, new.organization_id
    from custom.record_carrying_edges(new.id, new.data_class, new.data, new.deleted_at) n
  on conflict (source_type, source_id, target_type, target_id, role) do nothing;

  if v_named then
    perform set_config('app.actor_system', '', true);
  end if;
  return null;
end;
$$;

comment on function custom._containment_association() is
  'VIS-1: a record written with a parent (or a referenced carrying relation) writes its platform.associations edge in the SAME transaction, so custom.carrying_edges - what has_visibility walks - is never behind the store. IT IS DELIBERATELY NOT GATED ON custom/system_enabled: 185 of the 190 live parented records sit in organizations where that knob resolves false, and a trigger that skipped them would leave their containment edgeless and silently invisible the day the knob went true. The knob holds off the STORE (the read doors and every consumer); a record->record contains edge is registered container_side=none in platform.association_types, so platform.reachability and every pre-campaign consumer cannot see one.';

create trigger zz_w2_containment_association
  after insert or update on custom.record
  for each row execute function custom._containment_association();

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- 3 — THE SECOND PATH IS REMOVED: containment_edges now READS the associations
-- ═════════════════════════════════════════════════════════════════════════════════════════
-- Same signature, same columns, same meaning, one source. `custom.reachable_from` (the cascade
-- walk) and `custom.migrate_delete` follow it here without a line of their own changing, which
-- is the point: there is no "safe path beside the unsafe one" left to pick.
create or replace function custom.containment_edges(p_organization_id uuid)
 returns table(parent_id uuid, child_id uuid, via text)
 language sql
 stable
 set search_path to ''
as $$
  select case when cr.container_side = 'target' then a.target_id else a.source_id end,
         case when cr.container_side = 'target' then a.source_id else a.target_id end,
         case when a.role = 'contains' then 'contained'::text else 'carrying'::text end
    from platform.associations a
    join custom.carrying_rule cr
      on cr.role = a.role
     and cr.is_active
   where a.deleted_at is null
     and a.source_type = 'record'
     and a.target_type = 'record'
     and a.organization_id = p_organization_id;
$$;

comment on function custom.containment_edges(uuid) is
  'VIS-1: the organization''s containment, projected out of platform.associations — the ONE stored form. It no longer reads data.parent_id; the trigger zz_w2_containment_association is what puts a parent there.';

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- 4 — THE BACKFILL, so step 3 forgets nothing that already exists
-- ═════════════════════════════════════════════════════════════════════════════════════════
do $backfill$
declare
  v_before integer;
  v_after  integer;
  v_want   integer;
begin
  select count(*) into v_before
    from platform.associations
   where deleted_at is null and source_type = 'record' and target_type = 'record'
     and role in (select role from custom.carrying_rule where is_active);

  if nullif(current_setting('app.actor_system', true), '') is null
     and coalesce(platform.declared_actor_tier(), platform.actor_tier()) in ('ai', 'code') then
    perform set_config('app.actor_system', 'custom.containment', true);
  end if;

  update platform.associations a
     set deleted_at       = null,
         deleted_via_type = null,
         deleted_via_id   = null
   where a.deleted_at is not null
     and a.source_type = 'record'
     and a.target_type = 'record'
     and (a.source_id, a.target_id, a.role) in (
           select e.container_id, e.item_id, e.edge_role
             from custom.record r
             cross join lateral custom.record_carrying_edges(r.id, r.data_class, r.data, r.deleted_at) e
            where r.deleted_at is null);

  insert into platform.associations
    (source_type, source_id, target_type, target_id, role, organization_id)
  select 'record', e.container_id, 'record', e.item_id, e.edge_role, r.organization_id
    from custom.record r
    cross join lateral custom.record_carrying_edges(r.id, r.data_class, r.data, r.deleted_at) e
   where r.deleted_at is null
  on conflict (source_type, source_id, target_type, target_id, role) do nothing;

  select count(*) into v_after
    from platform.associations
   where deleted_at is null and source_type = 'record' and target_type = 'record'
     and role in (select role from custom.carrying_rule where is_active);

  select count(*) into v_want
    from custom.record r
    cross join lateral custom.record_carrying_edges(r.id, r.data_class, r.data, r.deleted_at) e
   where r.deleted_at is null;

  raise notice '[VIS-FIX] containment edges in platform.associations: % before, % after; % declared by live records.',
    v_before, v_after, v_want;

  -- The backfill is not allowed to be approximately right. Every edge a live record declares
  -- is now an association, or this file refuses to land.
  if exists (
    select 1
      from custom.record r
      cross join lateral custom.record_carrying_edges(r.id, r.data_class, r.data, r.deleted_at) e
     where r.deleted_at is null
       and not exists (
             select 1 from platform.associations a
              where a.deleted_at is null
                and a.source_type = 'record' and a.source_id = e.container_id
                and a.target_type = 'record' and a.target_id = e.item_id
                and a.role = e.edge_role)
  ) then
    raise exception '[VIS-FIX] the backfill left a live record''s containment without its association edge'
      using errcode = '23514';
  end if;
end;
$backfill$;
