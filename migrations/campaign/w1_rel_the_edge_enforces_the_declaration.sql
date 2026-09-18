-- target: branch,production
-- additive: yes
-- guard: custom/associations_guard
--
-- W1-REL, FILE 3 — THE TRIGGER ON `platform.associations` (REL-5 · REL-7 · REL-8 · REL-12).
--
-- REL-12: *a trigger on associations enforces target token, cardinality, and organization.* All
-- three, plus REL-5's loops and REL-8's three target modes, are one BEFORE trigger reading one
-- declaration, because a rule that lives in the write door only is a rule any other writer walks
-- past - and `platform.associations` has many writers: 27 demanded RPCs in
-- `@ai-matrx/associations`, the `assoc_*` family, and this campaign's own
-- `platform.relation_set`. The edge table is where the answer has to be true.
--
-- WHY IT IS STRUCTURALLY INERT ON EVERY EXISTING ROW, AND WHY THAT IS NOT A CLAIM.
-- The first statement of the body is `if new.relation_field_id is null then return new; end if;`.
-- `relation_field_id` was added by file 1 with no default and no backfill, so it is NULL on all
-- 34,216 existing rows and on every association any other writer in the platform has ever
-- written or will write. The guard is the SECOND gate, not the first: even with
-- `custom/associations_guard` switched ON, an edge nobody declared as a relation is returned
-- untouched. Two independent reasons the old path cannot change answer, rather than one.
--
-- THE ORGANIZATION WALL IS THE SAME WALL, NOT A SECOND ONE (`V1-STORE-FIXES`, 2026-09-18).
-- That lane closed the wall at the store's door: `custom.assert_organization_wall` over
-- `custom.organization_references`, whose census knows the KINDS `custom.record` and
-- `custom.external_link` and refuses an id that resolves into another organization, with ONE
-- opening - REC-29's `cross_organization_relations` on the Table the relation starts at. This
-- trigger enforces the same law at the edge, reads THE SAME opening off THE SAME Table column,
-- and raises the same `23503` with the same two hints. It does not add a policy, does not widen
-- one, and does not keep a second copy of the census: the census covers ids inside a
-- `custom.record` document, and an edge's `source_id` / `target_id` are not in any document -
-- which is precisely the site the store's door cannot see.
--
-- WHAT THE FIVE REFUSALS SAY, AND WHY EACH IS THE TRIGGER'S OWN MESSAGE
-- --------------------------------------------------------------------
--   REL-8   target mode. `one` - the target's Table must BE the declared one. `several` - it
--           must be one of the declared list, and the refusal NAMES the tables it may be. `any`
--           - anything registered, refused by nothing here, which is what "polymorphic without
--           restriction" has to mean to be worth writing down. (BUILD-LOG 01:45 UTC.)
--   REL-7   cardinality. `at_most_one` caps the live edges for this (record, role) at one and
--           the refusal says which record is already there; `many` caps at the Field's
--           `relation_max`. The count is taken over LIVE edges, so unsetting one frees the slot.
--   REL-12  organization. Both ends must sit in the edge's own organization unless the Table
--           the relation starts at opens the wall.
--   REL-5   loops. A relation whose declaration refuses loops may not close a cycle along its
--           OWN role: the walk follows `relation_field_id`, so two different relations between
--           the same two records are not a loop, and the same relation pointing back is.
--   REL-N-1 external targets are READ-ONLY in v1 (the REL-8 ruling): an edge may POINT at an
--           external stub, and the refusal that keeps it read-only lives on the write side
--           (file 5's `on_delete`), which is where a write down a relation would happen. Said
--           here rather than left implied, so nobody reads this trigger's silence as permission.
--
-- THE INVERSE: `migrations/inverse/w1_rel_the_edge_enforces_the_declaration_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '300s';

create function platform.enforce_relation_edge()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  d          jsonb;
  v_tables   uuid[];
  v_mode     text;
  v_live     integer;
  v_max      integer;
  v_other    uuid;
  v_ttable   uuid;
  v_src_org  uuid;
  v_tgt_org  uuid;
  v_opened   boolean;
  v_names    text;
  v_loop     boolean;
begin
  -- GATE ONE, and it is structural: an edge nobody declared as a relation is not this
  -- trigger's business, whatever the switch says.
  if new.relation_field_id is null then
    return new;
  end if;

  -- GATE TWO, the switch. `custom/associations_guard` holds the MEANING of these columns off.
  -- A relation edge written while it is off is returned untouched rather than half-enforced:
  -- half a contract is the silent failure this system is built to refuse.
  if not platform.relations_are_on(new.organization_id) then
    return new;
  end if;

  d := platform.relation_declaration(new.organization_id, new.relation_field_id);

  -- ------------------------------------------------------------------ REL-10, the role itself
  if coalesce(new.role, '') <> coalesce(d ->> 'key', '') then
    raise exception 'this relation is stored under the role "%" but its field is called "%"',
      coalesce(new.role, '<none>'), coalesce(d ->> 'key', '<none>')
      using errcode = '23514',
            hint = 'REL-10: a relation is an association whose `role` IS the field key. They are the same string or the edge belongs to no field.';
  end if;

  -- ------------------------------------------------------------------------- REL-12, the wall
  select r.organization_id into v_src_org from custom.record r where r.id = new.source_id limit 1;
  select r.organization_id, r.table_id into v_tgt_org, v_ttable
    from custom.record r where r.id = new.target_id limit 1;

  v_opened := false;
  if v_tgt_org is not null and v_tgt_org is distinct from new.organization_id then
    -- REC-29's ONE opening, read off the Table the relation STARTS at - the same column
    -- `custom.assert_organization_wall` reads, never a second flag.
    select coalesce((t.data ->> 'cross_organization_relations')::boolean, false) into v_opened
      from custom.record s join custom.record t on t.id = s.table_id
     where s.id = new.source_id limit 1;
    if not coalesce(v_opened, false) then
      raise exception 'the record this relation points at belongs to a different organization'
        using errcode = '23503',
              hint = 'REC-29 / REL-12 / T15: organizations are hard walls. A relation reaches into another organization only when the table it starts from allows it, which this one does not - set cross_organization_relations on that table first.';
    end if;
  end if;
  if v_src_org is not null and v_src_org is distinct from new.organization_id then
    raise exception 'the record this relation starts at belongs to a different organization'
      using errcode = '23503',
            hint = 'REC-29 / REL-12 / T15: organizations are hard walls. An edge is stamped with the organization of the record it starts at; a relation cannot be filed under an organization that does not own its own source.';
  end if;

  -- --------------------------------------------------------------- REL-8, the target's token
  v_mode := d ->> 'target_mode';
  if v_mode <> 'any' then
    select array_agg((t #>> '{}')::uuid) into v_tables
      from jsonb_array_elements(coalesce(d -> 'target_tables', '[]'::jsonb)) t;
    if new.target_type <> 'record' then
      raise exception 'this relation points at tables of ours, and "%" is not one of them', new.target_type
        using errcode = '23514',
              hint = 'REL-8: a relation whose target mode is one or several names tables in this organization. To point at anything registered, declare target_mode `any`.';
    end if;
    if v_ttable is null or not (v_ttable = any (v_tables)) then
      select string_agg(coalesce(t.data ->> 'name', t.id::text), ', ' order by t.data ->> 'name')
        into v_names from custom.record t where t.id = any (v_tables);
      raise exception 'this relation points at %, and that record is not one of them',
        coalesce(v_names, 'a table it does not name')
        using errcode = '23514',
              hint = 'REL-8: target_mode `one` allows exactly the declared table, `several` allows exactly the declared list, and `any` allows anything. Widen the declaration or point at a record of a table it allows.';
    end if;
  end if;

  -- ------------------------------------------------------------------- REL-7, the cardinality
  v_max := case when d ->> 'cardinality' = 'at_most_one' then 1
                else greatest(coalesce((d ->> 'max')::integer, 1), 1) end;
  select count(*) into v_live
    from platform.associations a
   where a.source_type = new.source_type and a.source_id = new.source_id
     and a.role = new.role and a.deleted_at is null
     and a.relation_field_id is not null
     and not (a.target_type = new.target_type and a.target_id = new.target_id);
  if v_live >= v_max then
    select a.target_id into v_other
      from platform.associations a
     where a.source_type = new.source_type and a.source_id = new.source_id
       and a.role = new.role and a.deleted_at is null and a.relation_field_id is not null
     limit 1;
    if v_max = 1 then
      raise exception 'this points at one thing at a time, and it already points at %',
        coalesce(platform.relation_label(new.organization_id, new.target_type, v_other), v_other::text)
        using errcode = '23514',
              hint = 'REL-7: cardinality is `at most one` or `many`. Remove the one that is there, or let the field point at many.';
    end if;
    raise exception 'this points at at most % things and already points at that many', v_max
      using errcode = '23514',
            hint = 'REL-7: the field''s own relation_max is the cap. Remove one, or raise the cap on the field.';
  end if;

  -- ------------------------------------------------------------------------ REL-5, the loops
  if not coalesce((d ->> 'loops')::boolean, false) then
    with recursive walk(id, depth) as (
      select new.target_id, 1
      union all
      select a.target_id, w.depth + 1
        from walk w
        join platform.associations a
          on a.source_id = w.id
         and a.relation_field_id = new.relation_field_id
         and a.deleted_at is null
       where w.depth < 32
    )
    select exists (select 1 from walk where id = new.source_id) into v_loop;
    if coalesce(v_loop, false) then
      raise exception 'that would make this point back at itself through the same relation'
        using errcode = '23514',
              hint = 'REL-5 / T11: a relation says whether loops are allowed. This one does not allow them - set loops on the field to let two records point at each other along it. The walk follows this relation only, so two DIFFERENT relations between the same two records were never a loop.';
    end if;
  end if;

  return new;
end;
$fn$;

comment on function platform.enforce_relation_edge() is
  'W1-REL / REL-5, REL-7, REL-8, REL-10, REL-12: the relation contract, enforced at the edge table rather than at one write door. Returns NEW untouched when relation_field_id is NULL (every association that is not one of this campaign''s relations - all 34,216 that predate it) and again when custom/associations_guard resolves false.';

-- The trigger name sorts after `trg_associations_auto_orient` and `trg_associations_enforce_known`
-- deliberately: the platform's own direction and registry checks answer first, so an edge with an
-- unregistered token gets the platform's message rather than this contract's. `zz` is not
-- available - `trg_associations_zz_no_carrying_cycle` holds it - so `trg_associations_zzz_*` is
-- the slot after every existing one, read off pg_trigger before this line was written.
-- `CREATE OR REPLACE TRIGGER`, never a DROP-then-CREATE: a DROP is refused by the additive
-- allow-list in any file that names production (§6b.2's floor), and re-running this file has to
-- be idempotent (rule 27). It also leaves no window in which the contract is absent.
create trigger trg_associations_zzz_relation_contract
  before insert or update on platform.associations
  for each row execute function platform.enforce_relation_edge();
