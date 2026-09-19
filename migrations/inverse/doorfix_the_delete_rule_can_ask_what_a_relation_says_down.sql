-- chair-step: DOOR-FIX 1b's inverse — the relations door and the delete rule exactly as they stood before DOOR-FIX 1b.

CREATE OR REPLACE FUNCTION platform.assert_relations_door(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner oid;
  v_who   name := coalesce(nullif(current_setting('role', true), 'none'), session_user);
begin
  if platform.relations_are_on(p_organization_id) then
    return;
  end if;
  -- Read the owner from the catalogue, never as a role literal (rule 15).
  select c.relowner into v_owner from pg_class c where c.oid = 'platform.associations'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    return;
  end if;
  raise exception 'Relations are switched off, so this is not answering "%" yet.', v_who
    using errcode = '42501',
          hint = 'custom/associations_guard resolves false. While it does, the relation surface over platform.associations belongs to the campaign that owns it and takes callers only from the role that owns platform.associations. The switch checklist turns the knob on; a lane never does. Nothing here skips a check while the switch is off: it is a closed door, not a quiet one.';
end;
$function$

;
CREATE OR REPLACE FUNCTION custom.delete_rule(p_organization_id uuid, p_record_id uuid, p_apply boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- The callers of this rule (custom.record_delete, custom.migrate_delete) are behind
  -- custom/system_enabled through custom.assert_store_door; the rule itself only decides.
  v_row      custom.record%rowtype;
  v_names    text;
  v_cascade  uuid[] := '{}';
  v_detached integer := 0;
  v_effects  jsonb;
  v_child    uuid;
  v_role     text;
  v_owner    name;
begin
  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    return jsonb_build_object('cascade_to', '[]'::jsonb, 'detached', 0,
                              'note', 'nothing here to delete');
  end if;

  -- ── REC-18. A Field a Rule or a formula depends on is refused, NAMING the dependant,
  --    because "this field is in use" tells a person nothing about what to go and change.
  if v_row.data_class = 'field' then
    select string_agg(distinct d.kind || ' "' || d.label || '"', ', ') into v_names
      from custom.field_dependants(p_organization_id, p_record_id) d;
    if v_names is not null then
      raise exception 'This field is used by %, so it was not deleted.', v_names
        using errcode = '23503',
              hint = 'REC-18 / T7: a Rule or a formula that reads a Field it can no longer find is a calculation that silently stops being right. Change or remove what depends on it first, and then this delete goes through.';
    end if;
  end if;

  -- ── REC-13. A Home is a RECORD, and the Tables living there have a say. The default is
  --    restrict, stated here rather than inherited from a nullable column.
  select string_agg(distinct coalesce(t.data ->> 'name', h.table_id::text), ', ') into v_names
    from custom.tables_at_home(p_organization_id, array[p_record_id]) h
    left join custom.record t
      on t.organization_id = p_organization_id and t.id = h.table_id and t.deleted_at is null
   where coalesce(t.data ->> 'on_delete', 'restrict') = 'restrict';
  if v_names is not null then
    raise exception 'This is home to %, so it was not deleted.', v_names
      using errcode = '23503',
            hint = 'REC-13 / T7: deleting a place that tables live in would take those tables and everything in them. The default is to refuse. Move those tables to another home first, or set them to cascade deliberately.';
  end if;

  -- ── REC-12, through W1-REL's own function. It RESTRICTS by name, detaches the set_null
  --    edges itself and RETURNS what must be cascaded; it deletes nothing — the door does.
  --    Asked AS THE OWNER of platform.associations, because that surface's product switch
  --    (custom/associations_guard) refuses `authenticated` outright and a delete that could
  --    not ask would be a delete that ignores on_delete. The role is put back on both paths.
  select c.relowner::regrole::name into v_owner
    from pg_class c where c.oid = 'platform.associations'::regclass;
  v_role := current_setting('role', true);
  begin
    perform set_config('role', v_owner::text, true);
    if p_apply then
      v_effects := platform.relation_on_delete(p_organization_id, p_record_id);
      v_detached := coalesce((v_effects ->> 'detached')::integer, 0);
      select coalesce(array_agg((x #>> '{}')::uuid), '{}') into v_cascade
        from jsonb_array_elements(coalesce(v_effects -> 'cascade_to', '[]'::jsonb)) x;
    else
      select string_agg(distinct coalesce(x.label, x.other_id::text), ', ') into v_names
        from platform.relation_delete_effects(p_organization_id, p_record_id) x
       where x.action = 'restrict';
      if v_names is not null then
        perform set_config('role', coalesce(v_role, 'none'), true);
        raise exception 'this is still used by %, so it was not deleted', v_names
          using errcode = '23503',
                hint = 'REL-2 / T7: this relation is set to refuse the delete while anything still points at it. Remove those first, or change what the field does when the thing it points at is deleted.';
      end if;
      select coalesce(array_agg(x.other_id), '{}') into v_cascade
        from platform.relation_delete_effects(p_organization_id, p_record_id) x
       where x.action = 'cascade' and x.other_type = 'record';
      v_effects := jsonb_build_object('detached', 0, 'cascade_to', to_jsonb(v_cascade));
    end if;
    perform set_config('role', coalesce(v_role, 'none'), true);
  exception
    when undefined_function then
      perform set_config('role', coalesce(v_role, 'none'), true);
      v_effects := jsonb_build_object('note', 'platform.relation_on_delete is not on this database');
    when others then
      perform set_config('role', coalesce(v_role, 'none'), true);
      raise;
  end;

  -- ── REC-12 for CONTAINMENT: the 500 serial numbers inside Widget. A contained record has no
  --    independent existence, so it goes with its container. This is not a relation's
  --    `on_delete` — it is what containment MEANS, and it is the cascade T7 names first.
  for v_child in
    select e.child_id from custom.containment_edges(p_organization_id) e
     where e.parent_id = p_record_id and e.via = 'contained'
  loop
    v_cascade := v_cascade || v_child;
  end loop;

  return jsonb_build_object('cascade_to', to_jsonb(v_cascade),
                            'detached', v_detached,
                            'relation_effects', coalesce(v_effects, '{}'::jsonb));
end;
$function$

;
