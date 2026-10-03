-- draft: TABLE-ACTIONS (2026-10-03) — NOT rehearsed or applied. Fix for merge being refused when a single-valued link points at the merged-in record: `a.id is distinct from new.id` in both cardinality queries of platform.enforce_relation_edge. Needs: -- based-on: line (pnpm db:based-on), clone rehearsal, and merge Undo must also move links back + drop the survivor's alternates before it ships.
CREATE OR REPLACE FUNCTION platform.enforce_relation_edge()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  -- GATE ZERO (RELATION-DECLARE, 2026-09-20): A ROW THAT IS NOT LIVE STATES NOTHING.
  -- Every unmaking of an edge in this platform is soft (REL-13), so a withdrawal arrives here
  -- as an UPDATE — and this trigger used to re-read the field's DECLARATION for it, which made
  -- the last act of a relation's life impossible once the column had stopped being a relation:
  --   ERROR: the field Crew behaves as text, so it declares no relation
  -- A withdrawal takes a fact back; there is nothing in it to check. An UNDELETE is a
  -- different thing entirely — that row becomes live and does state a fact again — and it
  -- carries `deleted_at is null`, so it still goes through every gate below.
  if new.deleted_at is not null then
    return new;
  end if;

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
    -- 🚨 VIS-2 (2026-09-19) — BOTH ORGANIZATIONS, NOT ONE. Same rule, same two
    -- knobs and the same sentence as `custom.assert_organization_wall`: the Table the
    -- relation STARTS at has to allow it, and both organizations have to have turned
    -- cross-organization links on. One organization's flag is not consent from the other.
    if not (coalesce(v_opened, false)
            and custom.cross_organization_links_open(new.organization_id, v_tgt_org)) then
      raise exception 'the record this relation points at belongs to a different organization'
        using errcode = '23503',
              hint = format('REC-29 / REL-12 / T15 / VIS-23: organizations are hard walls. A relation reaches into another organization only when the table it starts from allows it AND both organizations have turned on cross-organization links in their settings. Right now: this table %s, this organization %s, the other organization %s.',
                            case when coalesce(v_opened, false) then 'allows it' else 'does not allow it - set cross_organization_relations on that table' end,
                            case when custom.cross_organization_links_open(new.organization_id, new.organization_id) then 'allows them' else 'does not - turn on "Links to other organizations" in its settings' end,
                            case when custom.cross_organization_links_open(v_tgt_org, v_tgt_org) then 'allows them' else 'does not - it has to turn on "Links to other organizations" too' end);
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
     and a.id is distinct from new.id
     and not (a.target_type = new.target_type and a.target_id = new.target_id);
  if v_live >= v_max then
    select a.target_id into v_other
      from platform.associations a
     where a.source_type = new.source_type and a.source_id = new.source_id
       and a.role = new.role and a.deleted_at is null and a.relation_field_id is not null
       and a.id is distinct from new.id
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
$function$

