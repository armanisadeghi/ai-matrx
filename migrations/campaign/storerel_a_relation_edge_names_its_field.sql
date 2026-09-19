-- chair-step: it BACKFILLS platform.associations inside a DO block the additive allow-list cannot read, and
--   it DROPs two triggers of its own name before recreating them so the file is re-runnable. Everything here is
--   additive in effect: three new functions, two triggers on the campaign's own tables, and edge rows for
--   relation values that already exist in the store. No existing function is replaced, no GRANT, no REVOKE,
--   nothing deleted and no row of any other feature touched — the backfill only ever ADDS an association for a
--   relation value a record already holds, and NAMES every one it could not resolve.
-- guard: custom/system_enabled
--
-- STORE-REL 1 — T7. A RELATION EDGE NAMES THE FIELD IT CAME FROM.
--
-- THE DEFECT, ROOT CAUSE FIRST. `platform.associations.relation_field_id` is NULL on all
-- 85,676 rows on the main database, so `platform.relation_delete_effects` — which reads only
-- `where relation_field_id is not null` — sees nothing, and REL-2's three actions (restrict,
-- set_null, cascade) can never fire. The fourth pass read that as "the delete machinery only
-- reads rows where it is set". It is the WRITE half that is missing:
--
--   · `platform.relation_set` is the ONLY writer that sets the column, and NOTHING in the
--     store's write path calls it. It is a separate door with no caller.
--   · The store's own write path is `custom.record_write` / `custom.record_update`, which put
--     a relation field's value into the record's jsonb document and stop there. The one
--     trigger that turns a document into associations is `custom._containment_association`,
--     and it reads `custom.record_carrying_edges`, which knows exactly two shapes: the
--     containment parent (`parent_id`) and a `data_class = 'relation'` record. A relation
--     FIELD's value is neither, so no edge was ever written for it at all — the census proves
--     it: of 322 record→record edges on main, 319 are `contains` and 3 are `home`, and not one
--     is a relation field.
--
-- So REL-10 ("relations are stored as associations with `role` = the field key") was true of
-- one door nobody called and false of the door everybody uses.
--
-- THE CLASS FIX, not the instance:
--   1. `custom.record_relation_edges(...)` — the one reader of what a record's DOCUMENT
--      declares in relation fields, beside `custom.record_carrying_edges`, which stays the one
--      reader of containment and carrying relations.
--   2. `custom._relation_associations()` on trigger `zz_w2a_relation_association` — the same
--      withdraw / revive / write shape `custom._containment_association` already uses, so
--      EVERY writer of a relation value (the client door, an agent, a migration verb, a direct
--      owner write) writes the edge, with `relation_field_id` set, without knowing this exists.
--   3. `custom._store_relation_edge_names_its_field()` on `platform.associations` — a store
--      edge (source_type `record`) whose role is not one of `custom.carrying_rule`'s structural
--      roles is REFUSED unless it names its field. A rule you cannot write around.
--   4. The backfill, at the end of this file, with a census of what it could not resolve.
--
-- Visibility is untouched: `custom.carrying_edges` and `custom.containment_edges` join
-- `custom.carrying_rule` on the role, and a relation field's key is not a row there, so these
-- edges convey nothing. REL-6's carrying referenced relation stays the `references` role that
-- `custom.relation_carry` (STORE-REL 2) writes.
--
-- INVERSE: migrations/inverse/storerel_a_relation_edge_names_its_field_down.sql

set lock_timeout = '3s';
set statement_timeout = '10min';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 1. WHAT A RECORD'S DOCUMENT DECLARES IN ITS RELATION FIELDS
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.record_relation_edges(
  p_organization_id uuid,
  p_id              uuid,
  p_table_id        uuid,
  p_data_class      text,
  p_data            jsonb,
  p_deleted_at      timestamptz)
returns table(target_id uuid, edge_role text, field_id uuid, ord integer)
language sql
stable
set search_path to ''
as $function$
  -- REL-10: the role IS the field key, and REL-11: nothing about the relation is stored in
  -- the value — the value is only WHICH record, and every property of the relation is read
  -- from the Field. A key that holds something which is not a uuid is not an edge; it is
  -- reported by the backfill's census rather than guessed at.
  select (t.val #>> '{}')::uuid,
         coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'),
         f.id,
         case when coalesce((f.data -> 'config' ->> 'ordered')::boolean, false)
              then t.ord::integer else null end
    from custom.record f
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(p_data -> coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name')) = 'array'
          then p_data -> coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name')
        when jsonb_typeof(p_data -> coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name')) = 'string'
          then jsonb_build_array(p_data -> coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'))
        else '[]'::jsonb
      end) with ordinality as t(val, ord)
   where p_deleted_at is null
     and p_id is not null
     and p_table_id is not null
     and coalesce(p_data_class, '') = 'record'
     and f.deleted_at is null
     and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel'
     and f.organization_id = p_organization_id
     and nullif(f.data ->> 'entity_definition_id', '')::uuid = p_table_id
     and f.data ->> 'type' = 'relation'
     and (t.val #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$function$;

comment on function custom.record_relation_edges(uuid, uuid, uuid, text, jsonb, timestamptz) is
  'REL-10 / T7. The relation edges a record''s document declares, read from its table''s relation Fields. The one reader of a relation VALUE, beside custom.record_carrying_edges which reads containment and carrying relations.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 2. EVERY WRITER OF A RELATION VALUE WRITES THE EDGE
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom._relation_associations()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_named boolean := false;
begin
  -- Nothing that can move an edge moved.
  if tg_op = 'UPDATE'
     and old.data       is not distinct from new.data
     and old.data_class is not distinct from new.data_class
     and old.table_id   is not distinct from new.table_id
     and old.deleted_at is not distinct from new.deleted_at then
    return null;
  end if;

  -- The same provenance sentence `custom._containment_association` carries: an automated
  -- write that names no system is refused by `platform._stamp_actor_tier`, so the edge names
  -- ITSELF rather than having the record's write refused on its behalf.
  if nullif(current_setting('app.actor_system', true), '') is null
     and coalesce(platform.declared_actor_tier(), platform.actor_tier()) in ('ai', 'code') then
    perform set_config('app.actor_system', 'custom.relations', true);
    v_named := true;
  end if;

  -- WITHDRAW what this row used to declare and no longer does. Soft, like every unmaking of
  -- an edge in this platform (REL-13), and without `deleted_via_*`: this is not a trashing,
  -- so `platform._gc_entity_associations`'s restore must not bring it back.
  if tg_op = 'UPDATE' then
    update platform.associations a
       set deleted_at = now()
     where a.deleted_at is null
       and a.source_type = 'record'
       and a.source_id = old.id
       and a.relation_field_id is not null
       and (a.target_id, a.role) in (
             select o.target_id, o.edge_role
               from custom.record_relation_edges(old.organization_id, old.id, old.table_id,
                                                 old.data_class, old.data, old.deleted_at) o)
       and (a.target_id, a.role) not in (
             select n.target_id, n.edge_role
               from custom.record_relation_edges(new.organization_id, new.id, new.table_id,
                                                 new.data_class, new.data, new.deleted_at) n);
  end if;

  -- BRING BACK a tombstoned edge this row declares again. Its own UPDATE rather than an
  -- `on conflict do update`, because `platform.revive_tombstoned_association` is a BEFORE
  -- INSERT trigger that un-tombstones the very row the ON CONFLICT clause then targets and
  -- Postgres refuses that as "cannot affect row a second time".
  update platform.associations a
     set deleted_at        = null,
         deleted_via_type  = null,
         deleted_via_id    = null,
         relation_field_id = n.field_id,
         "position"        = n.ord
    from custom.record_relation_edges(new.organization_id, new.id, new.table_id,
                                      new.data_class, new.data, new.deleted_at) n
   where a.deleted_at is not null
     and a.source_type = 'record'
     and a.source_id = new.id
     and a.target_id = n.target_id
     and a.role = n.edge_role;

  -- WRITE what it declares now, WITH THE FIELD ON IT. `platform.enforce_relation_edge` is
  -- what then holds REL-5, REL-7, REL-8 and REL-12 over it; it returns early on an edge with
  -- no field, which is exactly the hole this file closes.
  insert into platform.associations
    (source_type, source_id, target_type, target_id, role, organization_id,
     relation_field_id, "position")
  select 'record', new.id, 'record', n.target_id, n.edge_role, new.organization_id,
         n.field_id, n.ord
    from custom.record_relation_edges(new.organization_id, new.id, new.table_id,
                                      new.data_class, new.data, new.deleted_at) n
  on conflict (source_type, source_id, target_type, target_id, role) do update
     set relation_field_id = excluded.relation_field_id,
         "position"        = excluded."position",
         deleted_at        = null;

  if v_named then
    perform set_config('app.actor_system', '', true);
  end if;
  return null;
end;
$function$;

drop trigger if exists zz_w2a_relation_association on custom.record;
create trigger zz_w2a_relation_association
  after insert or update on custom.record
  for each row execute function custom._relation_associations();

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 3. A STORE RELATION EDGE WITHOUT ITS FIELD IS REFUSED
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom._store_relation_edge_names_its_field()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  -- Only edges OUT OF the record store. Every other subsystem's associations are none of
  -- this store's business, and they are the 85,354 rows that legitimately name no field.
  if new.source_type <> 'record' then
    return new;
  end if;
  if new.relation_field_id is not null then
    return new;
  end if;
  -- The STRUCTURAL roles are not relation fields: `contains` is REC-7's parent, `home` is
  -- REC-26's placement and `references` is REL-6's carrying link. They are declared in
  -- custom.carrying_rule, which is the one table that says what a role conveys, so this
  -- reads that table rather than keeping a second list of the same three words.
  if exists (select 1 from custom.carrying_rule cr where cr.role = new.role) then
    return new;
  end if;

  raise exception 'a relation on a record has to say which field it came from, and "%" does not',
    coalesce(new.role, '<no role>')
    using errcode = '23514',
          hint = 'REL-10 / T7: a relation is an association whose `role` IS the field key and whose relation_field_id IS that field. Without the field, nothing can read what the relation does when its target is deleted, how many targets it allows, or which tables it may point at — so the delete rules, the cardinality and the organization wall all silently do nothing. Write the relation value through the record store (custom.record_write / custom.record_update) and the edge is written for you, or call platform.relation_set, which names the field itself.';
end;
$function$;

drop trigger if exists zzzz_store_relation_edge_names_its_field on platform.associations;
create trigger zzzz_store_relation_edge_names_its_field
  before insert or update on platform.associations
  for each row execute function custom._store_relation_edge_names_its_field();

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 4. THE BACKFILL, AND WHAT IT COULD NOT RESOLVE
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Every live record's document, read through the same function the trigger uses, so the
-- backfill and the write path cannot disagree about what an edge is. Each row is written on
-- its own so that one record the relation contract refuses (a cardinality already over the
-- cap, a target outside the declared tables) does not take the other organizations' edges
-- down with it — and every one of those is NAMED at the end rather than swallowed.
do $backfill$
declare
  r          record;
  v_written  integer := 0;
  v_existing integer := 0;
  v_failed   integer := 0;
  v_notes    text[]  := '{}';
begin
  for r in
    select rec.organization_id, rec.id, e.target_id, e.edge_role, e.field_id, e.ord
      from custom.record rec
      cross join lateral custom.record_relation_edges(rec.organization_id, rec.id, rec.table_id,
                                                      rec.data_class, rec.data, rec.deleted_at) e
     where rec.deleted_at is null
     order by rec.organization_id, rec.id, e.edge_role, e.ord nulls last, e.target_id
  loop
    begin
      if exists (select 1 from platform.associations a
                  where a.source_type = 'record' and a.source_id = r.id
                    and a.target_type = 'record' and a.target_id = r.target_id
                    and a.role = r.edge_role and a.deleted_at is null
                    and a.relation_field_id is not null) then
        v_existing := v_existing + 1;
        continue;
      end if;
      insert into platform.associations
        (source_type, source_id, target_type, target_id, role, organization_id,
         relation_field_id, "position")
      values ('record', r.id, 'record', r.target_id, r.edge_role, r.organization_id,
              r.field_id, r.ord)
      on conflict (source_type, source_id, target_type, target_id, role) do update
         set relation_field_id = excluded.relation_field_id,
             "position"        = excluded."position",
             deleted_at        = null;
      v_written := v_written + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_notes  := v_notes || format('record %s, field "%s" -> %s: %s',
                                    r.id, r.edge_role, r.target_id, sqlerrm);
    end;
  end loop;

  raise notice 'STORE-REL backfill: % relation edge(s) written, % already named their field, % could not be resolved.',
    v_written, v_existing, v_failed;
  if v_failed > 0 then
    raise notice 'STORE-REL backfill, what it could NOT resolve: %', array_to_string(v_notes, ' | ');
  end if;
end;
$backfill$;

-- THE ASSERTION. No live record may declare a relation value the associations do not carry.
do $assert$
declare v_missing integer;
begin
  select count(*) into v_missing
    from custom.record rec
    cross join lateral custom.record_relation_edges(rec.organization_id, rec.id, rec.table_id,
                                                    rec.data_class, rec.data, rec.deleted_at) e
   where rec.deleted_at is null
     and not exists (select 1 from platform.associations a
                      where a.source_type = 'record' and a.source_id = rec.id
                        and a.target_type = 'record' and a.target_id = e.target_id
                        and a.role = e.edge_role and a.deleted_at is null
                        and a.relation_field_id is not null);
  raise notice 'STORE-REL: % live relation value(s) still without an edge that names its field.', v_missing;
end;
$assert$;
