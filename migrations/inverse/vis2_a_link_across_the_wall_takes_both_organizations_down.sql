-- 🚨 `custom.cross_organization_links_open` IS LEFT STANDING, ON PURPOSE (lane INVERSE-GUARD, 2026-09-21).
-- It was ADOPTED after this inverse was written: `custom.share_grant`
-- (portal_the_wall_has_a_door_for_the_client_it_named.sql) calls it, and that body is on the live
-- path. Dropping it would have broken the portal lane's share door to restore a VIS-2 defect.
--   THE DEFECT IS STILL RESTORED: the two card doors go back, their
-- `platform.client_callable_door` rows are deleted and the VIS-2 knob row is removed — with the
-- knob gone the switch reads its default again, which is what this inverse exists to put back.
--
-- VIS-2 (2 of 3) — THE INVERSE. The two wall bodies exactly as they stood at
-- 5c8c8e509ac6526a7636fac72cb736ac368978bcde164786535d0b2024a4cbe0 and
-- 9f3e0d31eb4f841baba3e2aa58b5856012f525095a6354c728ac5645f092ec06 — restored FIRST, because
-- a wall still calling custom.cross_organization_links_open after it is dropped refuses every
-- record write in the store. Then the two new doors, their declarations, and the knob row.

set lock_timeout = '3s';
set statement_timeout = '120s';

CREATE OR REPLACE FUNCTION custom.assert_organization_wall(p_kind text, p_organization_id uuid, p_row jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  r        record;
  v_other  uuid;
  v_opened boolean;
begin
  for r in select * from custom.organization_references(p_kind, p_organization_id, p_row)
            where ref_id is not null loop

    -- The kernel is the platform's shared vocabulary (REC-27) and is stored in one
    -- organization, so every organization points at it. Read from the row, never a literal.
    select case when x.data_class = 'kernel' then null else x.organization_id end
      into v_other
      from custom.record x
     where x.id = r.ref_id
     limit 1;

    if v_other is null or v_other = p_organization_id then
      continue;                       -- same organization, the kernel, or resolves nowhere
    end if;

    -- REC-29's one opening: the Table whose records this relation starts at may allow it.
    v_opened := false;
    if r.openable then
      select coalesce((t.data ->> 'cross_organization_relations')::boolean, false)
        into v_opened
        from custom.record f
        join custom.record t
          on t.organization_id = f.organization_id and t.id = f.table_id
       where f.organization_id = p_organization_id
         and f.id = nullif(p_row -> 'data' ->> 'from', '')::uuid
       limit 1;
    end if;
    if coalesce(v_opened, false) then
      continue;
    end if;

    raise exception '% belongs to a different organization', r.what
      using errcode = '23503',
            hint = case when r.openable
                     then 'REC-29 / T15: organizations are hard walls. A relation reaches into another organization only when the table it starts from allows it, which this one does not - set cross_organization_relations on that table first.'
                     else 'REC-29 / T15: organizations are hard walls. What a record IS - its table, the table a field points at, the record an external link stands for - never crosses an organization. The route across organizations is a relation the table allows, never this.'
                   end;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.enforce_relation_edge()
 RETURNS trigger
 LANGUAGE plpgsql
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
$function$;


delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('relation_target_card', 'record_card', 'cross_organization_links_open');

drop function if exists custom.relation_target_card(uuid, uuid, text);
drop function if exists custom.record_card(uuid, uuid, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.cross_organization_links_open(uuid, uuid);

delete from platform.feature_knob
 where feature = 'custom' and key = 'cross_organization_links';
