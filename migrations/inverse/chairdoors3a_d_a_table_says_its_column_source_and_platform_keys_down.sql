-- chair-step: undo chairdoors3a_d_a_table_says_its_column_source_and_platform_keys.sql - restores the body of custom.table_kind_facts(uuid) exactly as CHAIR-DOORS-1 a left it. Nothing else is touched.
-- lane: CHAIR-DOORS-3A
-- based-on: custom.table_kind_facts(uuid) d82986fdf136db6bf6d6a7911b643dc19c897cf085b05be6d23fe12f282e27ff

CREATE OR REPLACE FUNCTION custom.table_kind_facts(p_table_id uuid)
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
  -- A TABLE IN AN ORGANIZATION SHE IS NOT IN IS REFUSED IN THE SAME SENTENCE AS AN INVENTED ID.
  -- assert_client_may_reach's own sentence ("You are not a member of that organization…") would
  -- tell her the id is a real Table somewhere; the decision is the wall's, only the words are kept.
  begin
    perform custom.assert_client_may_reach(v_org, 'custom.table_kind_facts');
    perform custom.assert_may_know_table(v_org, p_table_id, 'custom.table_kind_facts');
  exception when insufficient_privilege then
    raise exception 'You do not have access to this table, so % has nothing to show you.', 'custom.table_kind_facts'
      using errcode = '42501',
            hint = 'VIS-5 / T10: you know a table if you may open the table itself, or if anything in it has been shared with you. Ask whoever owns it to share the table, or a record in it, with you.';
  end;

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
