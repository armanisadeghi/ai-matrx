-- REACH — THE THREE WRITE DOORS THAT DID NOT ASK THE STORE'S SWITCH.
--
-- `custom.home_add`, `custom.record_reparent` and `custom.relation_own` all write
-- `custom.record`, and all three became reachable by a signed-in person minutes
-- ago. Measured on the live catalogue straight after that: every other write door
-- in the store calls `custom.assert_store_door` — the OFF switch, the thing that
-- makes a store that is switched off answer a sentence instead of silently taking
-- a write — and these three never did, because until now nothing but the store's
-- own role could reach them and the switch never had anything to refuse.
--
-- One line each, in the same place every other door puts it: after the access
-- decision, before the first write. Nothing else in any of the three moved.
--
-- This is the second half of the rule the guard now enforces: a client door into
-- the record store decides the CALLER and the ROW on the one ladder, and a client
-- door that WRITES also asks whether the store is open for that organization.
--
-- ADDITIVE: it replaces three functions. It grants nothing and revokes nothing.
--
-- THE INVERSE: migrations/inverse/reach_the_write_doors_ask_the_switch_down.sql.

-- based-on: custom.home_add(uuid, uuid, uuid) b5de0147b5ccee58003aea4c7899d2dcf6e90d8b2f610f45f65511fd455d4931
-- based-on: custom.record_reparent(uuid, uuid, uuid) 185e0fd9de133fba6c2fe2400e9f9336968a8474e4eb92ac99af71d63439d168
-- based-on: custom.relation_own(uuid, uuid, uuid) ab44011ab1dcdc7d666730a3686923e1df784aa08abe217e3275681ede4133b1

set lock_timeout = '5s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION custom.home_add(p_organization_id uuid, p_table_id uuid, p_home_record_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id        uuid;
  v_is_table  boolean;
  v_home_type text;
  v_already   uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.home_add');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.home_add', 'admin'::public.permission_level, 'table');
  perform custom.assert_store_door(p_organization_id, 'custom.home_add');
  if p_organization_id is null or p_table_id is null or p_home_record_id is null then
    raise exception 'custom.home_add: the organization, the table and the home record are all required'
      using errcode = '22004';
  end if;

  select (r.table_id = custom.table_kernel_id()) into v_is_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_table_id;
  if v_is_table is not true then
    raise exception 'that is not a table, so it cannot be given another home'
      using errcode = '23503', hint = 'REC-3: additional Homes are placements of a Table.';
  end if;

  -- REC-11: a detail Table's records cannot be Homes.
  select t.data ->> 'type' into v_home_type
    from custom.record h
    join custom.record t
      on t.organization_id = h.organization_id and t.id = h.table_id
   where h.organization_id = p_organization_id and h.id = p_home_record_id;
  if v_home_type is null then
    raise exception 'that home record is not in this organization'
      using errcode = '23503', hint = 'REC-3: a Home is a Record of this organization.';
  end if;
  if v_home_type = 'detail' then
    raise exception 'a detail record cannot be a home'
      using errcode = '23514',
            hint = 'REC-11: a detail table inherits only - its records take no direct shares and cannot be Homes.';
  end if;

  -- REC-3: the same Table in the same Record twice is one placement, not two. Announced by
  -- name rather than quietly de-duplicated.
  select hr.relation_id into v_already
    from custom.home_relations() hr
   where hr.organization_id = p_organization_id
     and hr.table_id = p_table_id
     and hr.home_record_id = p_home_record_id
   limit 1;
  if v_already is not null then
    raise exception 'that table already has a home there'
      using errcode = '23505',
            hint = 'REC-3: a Table appears in a Record once. Nothing was written and the existing placement is unchanged.';
  end if;

  -- REC-26: a referenced CARRYING relation, from the Home record to the Table record.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'relation',
          jsonb_build_object('kind', 'referenced', 'carrying', true, 'role', 'home',
                             'from', p_home_record_id, 'to', p_table_id))
  returning id into v_id;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.record_reparent(p_organization_id uuid, p_record_id uuid, p_parent_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_reparent');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_reparent', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.record_reparent');
  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_reparent: the organization and the record are required'
      using errcode = '22004';
  end if;
  update custom.record r
     set data = case when p_parent_id is null
                     then r.data - 'parent_id'
                     else r.data || jsonb_build_object('parent_id', p_parent_id::text) end
   where r.organization_id = p_organization_id and r.id = p_record_id;
  if not found then
    raise exception 'that record is not in this organization' using errcode = '23503';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.relation_own(p_organization_id uuid, p_owner_id uuid, p_target_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_own');
  perform custom.assert_client_may_change(p_organization_id, p_target_id, 'custom.relation_own', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.relation_own');
  if p_organization_id is null or p_owner_id is null or p_target_id is null then
    raise exception 'custom.relation_own: the organization, the owner and the target are all required'
      using errcode = '22004';
  end if;

  -- REC-10: an owned relation MAKES ITS TARGET CONTAINED. The containment edge and the
  -- relation are written in one transaction, so the target cannot be owned without being
  -- contained. Every REC-7 / REC-8 / REC-N-4 refusal applies, because the edge goes in
  -- through custom._containment_guard like any other write.
  update custom.record r
     set data = r.data || jsonb_build_object('parent_id', p_owner_id::text)
   where r.organization_id = p_organization_id and r.id = p_target_id;
  if not found then
    raise exception 'that record is not in this organization'
      using errcode = '23503';
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'relation',
          jsonb_build_object('kind', 'owned', 'carrying', true,
                             'from', p_owner_id, 'to', p_target_id))
  returning id into v_id;
  return v_id;
end;
$function$;
