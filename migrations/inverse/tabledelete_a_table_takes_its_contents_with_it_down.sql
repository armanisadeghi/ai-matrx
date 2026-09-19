-- INVERSE of tabledelete_a_table_takes_its_contents_with_it.sql — the one delete rule,
-- the door and REC-18's dependant search exactly as they stood on the main database on
-- 2026-09-19, before a Table took its contents with it; and the four new helper functions
-- dropped. Run it only to undo that file.

set lock_timeout = '3s';
set statement_timeout = '5min';

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
  begin
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
        raise exception 'this is still used by %, so it was not deleted', v_names
          using errcode = '23503',
                hint = 'REL-2 / T7: this relation is set to refuse the delete while anything still points at it. Remove those first, or change what the field does when the thing it points at is deleted.';
      end if;
      select coalesce(array_agg(x.other_id), '{}') into v_cascade
        from platform.relation_delete_effects(p_organization_id, p_record_id) x
       where x.action = 'cascade' and x.other_type = 'record';
      v_effects := jsonb_build_object('detached', 0, 'cascade_to', to_jsonb(v_cascade));
    end if;
  exception when undefined_function then
    -- The relation surface is not on this database at all. That is a fact about the database,
    -- not a rule, and it is carried back in the answer rather than swallowed.
    v_effects := jsonb_build_object('note', 'platform.relation_on_delete is not on this database');
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

CREATE OR REPLACE FUNCTION custom.record_delete(p_organization_id uuid, p_record_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_at    timestamptz;
  v_plan  jsonb;
  v_child uuid;
begin
  -- THE SWITCH. Every line below is behind custom/system_enabled: custom.assert_store_door
  -- resolves that knob and, while it is false, this store takes writes only from the role that
  -- owns custom.record. The switch never removes a check; it closes the door.
  perform custom.assert_store_door(p_organization_id, 'custom.record_delete');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_delete');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_delete: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  -- THE RULE, BEFORE ANYTHING IS WRITTEN. It raises the refusals by name (a Field a formula
  -- reads, a Home its Tables live in, a relation set to refuse), detaches the set_null edges,
  -- and hands back everything this delete has to take with it.
  v_plan := custom.delete_rule(p_organization_id, p_record_id, true);

  update custom.record
     set deleted_at = now()
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
  returning deleted_at into v_at;

  if v_at is null then
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = p_record_id) then
      raise exception 'That record was already deleted, so nothing changed.'
        using errcode = '02000',
              hint = 'REC-23: it is still here and still reversible - custom.record_restore(organization, record) brings it back.';
    end if;
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000',
            hint = 'Nothing was deleted. The store is keyed (organization_id, id), so a record of another organization is not found by this one.';
  end if;

  -- THE CASCADE GOES THROUGH THIS SAME DOOR — so every record it takes is judged by the
  -- caller's own access, gets its own history capture, and applies its own rule in turn. The
  -- container is marked deleted first, which is also what stops a containment loop here.
  for v_child in select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x loop
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is null) then
      perform custom.record_delete(p_organization_id, v_child);
    end if;
  end loop;

  return v_at;
end
$function$
;


drop function if exists custom.table_contents(uuid, uuid);
drop function if exists custom.owning_table_gone(uuid, uuid);
drop function if exists custom.owning_table(uuid, uuid);
drop function if exists custom.table_is_live(uuid, uuid);
CREATE OR REPLACE FUNCTION custom.field_dependants(p_organization_id uuid, p_field_id uuid)
 RETURNS TABLE(kind text, dependant_id uuid, label text, how text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_key   text;
  v_table uuid;
begin
  select f.data ->> 'key', nullif(f.data ->> 'entity_definition_id', '')::uuid
    into v_key, v_table
    from custom.record f
   where f.organization_id = p_organization_id and f.id = p_field_id and f.data_class = 'field';
  if v_key is null then
    return;                        -- not a Field of this organization: nothing depends on it
  end if;

  return query
  -- (1) BY ID. A Rule's `expr` names a Field as {"field": "<uuid>"}; a formula or derived
  --     Field's `config` names it the same way. A Field has no top-level `expr` and a Rule
  --     may have no `config`, so each document is coalesced and searched on its own — a
  --     concatenation through a NULL is how this arm came to match nothing at all.
  select case r.data_class when 'rule' then 'rule'
                           when 'merge_field' then 'merge field'
                           else 'field' end,
         r.id,
         coalesce(nullif(r.data ->> 'name', ''), nullif(r.data ->> 'label', ''),
                  nullif(r.data ->> 'key', ''), r.id::text),
         'names it by id'
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.id <> p_field_id
     and r.data_class in ('rule', 'field', 'merge_field')
     and (coalesce((r.data -> 'expr')::text, '')   like '%' || p_field_id::text || '%'
       or coalesce((r.data -> 'config')::text, '') like '%' || p_field_id::text || '%'
       or coalesce((r.data -> 'rules')::text, '')  like '%' || p_field_id::text || '%'
       or coalesce(r.data ->> 'target_field_id', '') = p_field_id::text)
  union
  -- (2) BY KEY, within the same Table. `depends_on` is a list of Field KEYS, so a formula
  --     that reads `amount_usd` by name is just as dependent as one that reads it by id.
  select 'field', r.id,
         coalesce(nullif(r.data ->> 'label', ''), r.data ->> 'key', r.id::text),
         'reads it by name in depends_on'
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.data_class = 'field'
     and r.id <> p_field_id
     and nullif(r.data ->> 'entity_definition_id', '')::uuid is not distinct from v_table
     and exists (select 1 from jsonb_array_elements_text(coalesce(r.data -> 'depends_on', '[]'::jsonb)) d
                  where d = v_key);
end;
$function$

;
