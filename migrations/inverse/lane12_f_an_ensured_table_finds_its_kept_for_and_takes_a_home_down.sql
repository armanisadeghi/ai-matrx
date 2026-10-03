-- chair-step: the inverse of lane12_f_an_ensured_table_finds_its_kept_for_and_takes_a_home.sql. It restores the body of custom.table_ensure(uuid, jsonb) exactly as lane12_c_an_ensured_table_says_what_differs_from_its_spec.sql wrote it: a slug is matched alone again (kept_for ignored), an archived table of that slug is made again, a named Home is ignored (a new Home is made per table, and home_id, row_defaults and members_reach are stored on the table as before, never applied), and drift no longer names extra columns. Same signature, grants and security; nothing else is touched.
-- lane: PLATFORM-APP-DATA (v6 lane 12)
-- lock: custom
-- based-on: custom.table_ensure(uuid, jsonb) 6dbc94d40235086e17583d2530d59f6fcd87f40c37f2ea8862667c3ee937c552

set local lock_timeout = '2s';

create or replace function custom.table_ensure(p_organization_id uuid, p_spec jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_name    text := nullif(btrim(p_spec ->> 'name'), '');
  v_slug    text := nullif(btrim(p_spec ->> 'slug'), '');
  v_fields  jsonb := case when jsonb_typeof(p_spec -> 'fields') = 'array' then p_spec -> 'fields' else '[]'::jsonb end;
  v_field   jsonb;
  v_table   uuid;
  v_home    uuid;
  v_created boolean := false;
  v_stored  jsonb;
  v_doc     jsonb;
  v_key     text;
  v_drift   jsonb := '[]'::jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_ensure');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_ensure');

  if v_name is null then
    raise exception 'Give the table a name.'
      using errcode = '22023',
            hint = 'A table is found by its slug and made with its name. Nothing was made.';
  end if;
  if v_slug is null then
    v_slug := coalesce(nullif(left(btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g'), '_'), 48), ''), 'table');
  end if;

  -- THE LOCK IS THE WHOLE RACE GUARANTEE. Held until this transaction ends; the second caller
  -- reads the first one's committed table below instead of making its own.
  perform pg_advisory_xact_lock(
    hashtextextended('custom.table_ensure|' || p_organization_id::text || '|' || v_slug, 0));

  select r.id, (r.data ->> 'parent_id')::uuid into v_table, v_home
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.table_kernel_id()
     and r.data_class = 'table'
     and r.deleted_at is null
     and r.data ->> 'slug' = v_slug
   order by r.created_at, r.id
   limit 1;

  if v_table is not null then
    -- A table she may not know is refused in the read door's own words, never re-made beside it.
    perform custom.assert_may_know_table(p_organization_id, v_table, 'custom.table_ensure');
  else
    v_home := custom.record_write(p_organization_id, custom.person_kernel_id(),
                                  jsonb_build_object('name', v_name || ' Home'));
    v_table := custom.table_declare(
      p_organization_id,
      (p_spec - 'fields')
        || jsonb_build_object(
             'slug', v_slug,
             'parent_id', v_home,
             'fields', coalesce((select jsonb_agg(jsonb_build_object('name', f ->> 'key') order by n)
                                   from jsonb_array_elements(v_fields) with ordinality e(f, n)
                                  where nullif(f ->> 'key', '') is not null), '[]'::jsonb)));
    v_created := true;
  end if;

  -- THE COLUMNS, through the column door. On a new table every one is defined (the sketches
  -- table_declare made are filled in); on an existing table only a key it does not have yet is
  -- added — a column already defined is never touched, and how it differs from the spec is SAID.
  for v_field in select f from jsonb_array_elements(v_fields) f loop
    v_key := v_field ->> 'key';
    v_stored := null;
    if not v_created then
      select r.data into v_stored
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.field_kernel_id()
         and r.data_class = 'field'
         and r.deleted_at is null
         and r.data ->> 'entity_definition_id' = v_table::text
         and r.data ->> 'key' = v_key
         and not coalesce((r.data ->> 'declared_with_table')::boolean, false)
       order by r.created_at, r.id
       limit 1;
    end if;

    if v_stored is null then
      perform custom.field_declare(p_organization_id, v_table, v_field);
      continue;
    end if;

    -- THE DECLARED SIDE, as the store would have stored it. A spec it cannot read is itself a
    -- difference, named with the store's own sentence — never a refusal of the whole call.
    begin
      v_doc := custom._field_document_for(p_organization_id, v_table, v_field);
    exception when others then
      v_drift := v_drift || jsonb_build_array(jsonb_build_object(
        'field', v_key, 'aspect', 'spec', 'stored', null, 'declared', sqlerrm));
      continue;
    end;

    v_drift := v_drift || coalesce((
      select jsonb_agg(jsonb_build_object('field', v_key, 'aspect', a.aspect, 'stored', a.stored, 'declared', a.declared)
                       order by a.n)
        from (values
          (1, 'type',     to_jsonb(coalesce(v_stored ->> 'parity_type', v_stored ->> 'type')),
                          to_jsonb(coalesce(v_doc ->> 'parity_type', v_doc ->> 'type'))),
          (2, 'format',   to_jsonb(nullif(v_stored ->> 'format', '')),
                          to_jsonb(nullif(v_doc ->> 'format', ''))),
          (3, 'label',    to_jsonb(btrim(v_stored ->> 'label')),
                          to_jsonb(btrim(v_doc ->> 'label'))),
          (4, 'multi',    to_jsonb(coalesce((v_stored ->> 'multi')::boolean, false)),
                          to_jsonb(coalesce((v_doc ->> 'multi')::boolean, false))),
          (5, 'required', to_jsonb(coalesce((v_stored ->> 'required')::boolean, false)),
                          to_jsonb(coalesce((v_doc ->> 'required')::boolean, false))),
          (6, 'unique',   to_jsonb(exists (select 1 from jsonb_array_elements(coalesce(v_stored -> 'rules', '[]'::jsonb)) x
                                            where x ->> 'kind' = 'unique')),
                          to_jsonb(exists (select 1 from jsonb_array_elements(coalesce(v_doc -> 'rules', '[]'::jsonb)) x
                                            where x ->> 'kind' = 'unique')))
        ) a(n, aspect, stored, declared)
       where a.stored is distinct from a.declared), '[]'::jsonb);
  end loop;

  return jsonb_build_object('table_id', v_table, 'home_id', v_home, 'created', v_created, 'drift', v_drift);
end;
$function$;

comment on function custom.table_ensure(uuid, jsonb) is
  'Lane PLATFORM-APP-DATA: find this organization''s Table by its slug or make it (Home via record_write, Table via table_declare, columns via field_declare) in one transaction under pg_advisory_xact_lock(hash(organization, slug)); idempotent, adds missing columns, never retypes or drops one, and answers drift: every stored column whose type, format, label, multi, required or unique differs from the spec.';
