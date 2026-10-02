-- chair-step: this CREATES one new read door, custom.table_kind_facts(uuid) (STABLE SECURITY DEFINER, writes nothing), declares it in platform.client_callable_door, and GRANTs EXECUTE on it to `authenticated` — the same single grant its sibling custom.applicable_fields holds. No other function, table, policy, index or data row is touched.
-- lane: CHAIR-DOORS-1 (asked by v6 lane 4 KINDS-GLUE, need N1)
--
-- A TABLE SAYS ITS KIND FACTS IN ONE ANSWER (lane 4 N1, KINDS-GLUE-WAVE3-DESIGN.md §11).
--
--   custom.table_kind_facts(p_table_id uuid) -> jsonb
--     { organization_id, table_id, name, title_field, agent_writable, purpose, version, type_field, stamp,
--       fields:  [ every live Field of the Table — those with applies_to_types included — as its document
--                  plus id and version, in the Fields' own order ],
--       choices: { <list field key>: [ {key, label, id, retired, position} ... ] } }
--
-- THE WALLS OF custom.applicable_fields, IN ITS ORDER: custom.assert_store_door, custom.assert_client_may_reach,
-- custom.assert_may_know_table — after the door has found the Table's own organization from its id, so the
-- caller never names one (a Table in another of her organizations answers; one she may not know is refused).
-- An id that is no live Table is refused with the very sentence assert_may_know_table says for a Table she
-- may not know, so an invented id and a foreign one answer identically.
--
-- THE STAMP moves on any change to the Table record, any of its Field records (added, changed, archived),
-- or any record of an options Table one of its list Fields uses (added, renamed, retired): it is the md5 of
-- (id, version, updated_at, deleted_at) of exactly those rows, in id order, plus the Field ids that are live.

CREATE FUNCTION custom.table_kind_facts(p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org     uuid;
  v_table   custom.record;
  v_fields  jsonb;
  v_choices jsonb := '{}'::jsonb;
  v_f       record;
  v_stamp   text;
begin
  -- THE TABLE NAMES ITS OWN ORGANIZATION. Read before the walls only to know which organization the
  -- walls are asked about; nothing read here is answered until all three have passed.
  select t.organization_id into v_org
    from custom.record t
   where t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null
   limit 1;
  if v_org is null then
    raise exception 'You do not have access to this table, so % has nothing to show you.', 'custom.table_kind_facts'
      using errcode = '42501',
            hint = 'VIS-5 / T10: you know a table if you may open the table itself, or if anything in it has been shared with you. Ask whoever owns it to share the table, or a record in it, with you.';
  end if;

  perform custom.assert_store_door(v_org, 'custom.table_kind_facts');
  perform custom.assert_client_may_reach(v_org, 'custom.table_kind_facts');
  perform custom.assert_may_know_table(v_org, p_table_id, 'custom.table_kind_facts');

  select * into v_table
    from custom.record t
   where t.organization_id = v_org and t.id = p_table_id
     and t.table_id = custom.table_kernel_id() and t.deleted_at is null;

  -- EVERY LIVE FIELD, typed ones included (applicable_fields(…, NULL) leaves those out on purpose).
  select coalesce(jsonb_agg((f.data - '_values' - '_sources')
                            || jsonb_build_object('id', f.id, 'version', f.version)
                            order by (f.data ->> 'sort')::numeric nulls last, f.created_at, f.id), '[]'::jsonb)
    into v_fields
    from custom.record f
   where f.organization_id = v_org
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id;

  -- THE CHOICES of every list Field, retired ones included, through the one options reader.
  for v_f in
    select f.data ->> 'key' as k, (f.data -> 'config' ->> 'options_table_id')::uuid as opts
      from custom.record f
     where f.organization_id = v_org
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
  loop
    v_choices := v_choices || jsonb_build_object(v_f.k, (
      select coalesce(jsonb_agg(jsonb_build_object('key', o.key, 'label', o.value ->> 'label',
                                                   'id', o.value ->> 'id',
                                                   'retired', coalesce((o.value ->> 'retired')::boolean, false),
                                                   'position', o.value -> 'position')
                                order by coalesce((o.value ->> 'retired')::boolean, false),
                                         (o.value ->> 'position')::integer nulls last, o.key), '[]'::jsonb)
        from jsonb_each(custom.choice_options(v_org, v_f.opts)) o));
  end loop;

  select md5(string_agg(x.part, '|' order by x.part)) into v_stamp
    from (
      select 't:' || t.id || ':' || t.version || ':' || t.updated_at || ':' || coalesce(t.deleted_at::text, '') as part
        from custom.record t
       where t.organization_id = v_org and t.id = p_table_id and t.table_id = custom.table_kernel_id()
      union all
      select 'f:' || f.id || ':' || f.version || ':' || f.updated_at || ':' || coalesce(f.deleted_at::text, '')
        from custom.record f
       where f.organization_id = v_org
         and f.table_id = custom.field_kernel_id()
         and (f.data ->> 'entity_definition_id')::uuid = p_table_id
      union all
      select 'o:' || o.id || ':' || o.version || ':' || o.updated_at || ':' || coalesce(o.deleted_at::text, '')
        from custom.record f
        join custom.record o
          on o.organization_id = f.organization_id
         and o.table_id = (f.data -> 'config' ->> 'options_table_id')::uuid
       where f.organization_id = v_org
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and (f.data ->> 'entity_definition_id')::uuid = p_table_id
         and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
    ) x;

  return jsonb_build_object(
    'organization_id', v_org,
    'table_id',        p_table_id,
    'name',            coalesce(v_table.data ->> 'name', v_table.data ->> 'title'),
    'title_field',     v_table.data ->> 'title_field',
    'agent_writable',  coalesce((v_table.data ->> 'agent_writable')::boolean, true),
    'purpose',         v_table.data ->> 'purpose',
    'version',         v_table.version,
    'type_field',      v_table.data ->> 'type_field',
    'stamp',           v_stamp,
    'fields',          v_fields,
    'choices',         v_choices);
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'table_kind_facts', 'p_table_id uuid', array['uuid'::regtype::oid],
   'One Table''s kind facts in one answer: its name, title field, agent_writable, purpose, version, type field, every live Field (typed ones included), the choices of its list Fields, and a stamp that moves on any Table, Field or choice change. The Table''s organization is read from the Table itself, then the caller is decided by custom.assert_store_door, custom.assert_client_may_reach and custom.assert_may_know_table in that order, as custom.applicable_fields decides; an id that is no live Table is refused with the same sentence. It writes nothing.',
   'chairdoors1_a_a_table_says_its_kind_facts.sql', null, true, false,
   jsonb_build_object('version', '1', 'arguments', jsonb_build_object(
     'p_table_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'The organization is read from the Table itself and decided by assert_client_may_reach and assert_may_know_table before anything is answered; a foreign or invented id is refused identically.')))));

grant execute on function custom.table_kind_facts(uuid) to authenticated;
