-- chair-step: the inverse of lane12_c_an_ensured_table_says_what_differs_from_its_spec.sql. It restores the body of custom.table_ensure(uuid, jsonb) as read from the clone on 2026-10-02 before that file (sha256 20e5a19d6d58a48b8344771306979089bd103a349ff80266589f637b799307ae): the answer loses `drift` and a spec that differs from a stored column is again ignored without a word. Same signature, grants and security; nothing else is touched.
-- lane: PLATFORM-APP-DATA (v6 lane 12)
-- lock: custom
-- based-on: custom.table_ensure(uuid, jsonb) be376c8ab01e14fd61a21ffb5ede4cfe3fc27b205911b7dcdc343b2d4ff757dd

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION custom.table_ensure(p_organization_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_name    text := nullif(btrim(p_spec ->> 'name'), '');
  v_slug    text := nullif(btrim(p_spec ->> 'slug'), '');
  v_fields  jsonb := case when jsonb_typeof(p_spec -> 'fields') = 'array' then p_spec -> 'fields' else '[]'::jsonb end;
  v_field   jsonb;
  v_table   uuid;
  v_home    uuid;
  v_created boolean := false;
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
  -- added — a column already defined is never touched.
  for v_field in select f from jsonb_array_elements(v_fields) f loop
    if v_created or not exists (
         select 1 from custom.record r
          where r.organization_id = p_organization_id
            and r.table_id = custom.field_kernel_id()
            and r.data_class = 'field'
            and r.deleted_at is null
            and r.data ->> 'entity_definition_id' = v_table::text
            and r.data ->> 'key' = v_field ->> 'key'
            and not coalesce((r.data ->> 'declared_with_table')::boolean, false)) then
      perform custom.field_declare(p_organization_id, v_table, v_field);
    end if;
  end loop;

  return jsonb_build_object('table_id', v_table, 'home_id', v_home, 'created', v_created);
end;
$function$;

comment on function custom.table_ensure(uuid, jsonb) is
  'Lane PLATFORM-APP-DATA: find this organization''s Table by its slug or make it (Home via record_write, Table via table_declare, columns via field_declare) in one transaction under pg_advisory_xact_lock(hash(organization, slug)); idempotent, adds missing columns, never retypes or drops one.';
