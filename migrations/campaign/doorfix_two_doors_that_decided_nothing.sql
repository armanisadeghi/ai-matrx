-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- based-on: custom.migrate_retype(uuid, uuid, text, text) d99d91912eaff72cd72c30b7806cda9c231c2c5aa90d48382e8da9fa64c58205
-- based-on: custom.delete_cascade_closure(uuid, uuid) 5cb4c0f158018ce6ede78f567273b1860794c3e33b8de3159728814bf3df0c02
--
-- DOOR-FIX 5 — TWO DOORS THAT TOOK AN ORGANIZATION AND DECIDED NOTHING.
--
-- `pnpm check:store-doors-decide` went red on two functions this lane touched:
--   · custom.migrate_retype  — lane REACH granted `authenticated` EXECUTE on the ten verbs
--     while DOOR-FIX 3 was replacing this one, so it became a client door with no access
--     question in it. It now asks the same two lines as the other nine.
--   · custom.delete_cascade_closure — new in DOOR-FIX 1, not SECURITY DEFINER, so PUBLIC
--     holds EXECUTE by default and it reads records of an organization it never asked about.
--
-- Both now ask through the ONE ladder. Nothing else changes.
--
-- INVERSE: migrations/inverse/doorfix_two_doors_that_decided_nothing_down.sql

set lock_timeout = '3s';
set statement_timeout = '2min';

CREATE OR REPLACE FUNCTION custom.migrate_retype(p_organization_id uuid, p_id uuid, p_to text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row     custom.record%rowtype;
  v_log     uuid;
  v_keep    jsonb;
  v_misfit  jsonb := '{}'::jsonb;
  v_ok      text[];
  v_key     text;
  v_to_tbl  uuid;
  v_was     text;
  v_conv    integer;
  v_ret     integer;
begin
  -- THE CALLER AND THE ROW, on the one ladder, exactly as the other verbs ask it — this verb
  -- is executable by `authenticated` and a door that decides nothing is not a door. Then the
  -- switch: custom.assert_store_door resolves custom/system_enabled.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_retype');
  perform custom.assert_client_may_change(p_organization_id, p_id, 'custom.migrate_retype', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_retype');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to retype.', p_id using errcode = '02000';
  end if;

  -- ── ARM TWO FIRST, because it is the smaller one: a FIELD changes what it behaves as
  --    (FLD-4 / T12). The values already written are CONVERTED where they convert and kept in
  --    `_retired` with their reason where they do not — by the trigger on the Field row, so
  --    this verb and an ordinary write behave identically.
  if v_row.data_class = 'field' then
    v_was := v_row.data ->> 'type';
    if v_was = p_to then
      return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                                'changed', false, 'at', now());
    end if;
    v_log := history.migration_record(p_organization_id, 'retype', 'field', p_id,
               jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                  'patch', jsonb_build_object('type', v_was)),
               coalesce(p_note, format('%s behaves as %s instead of %s; values that fit are converted and values that do not are kept in _retired with the reason, neither coerced nor deleted (FLD-4)', coalesce(v_row.data ->> 'label', v_row.data ->> 'key'), p_to, v_was)));
    perform custom.record_update(p_organization_id, p_id, jsonb_build_object('type', p_to));
    select count(*) filter (where true) into v_ret
      from custom.record x, lateral jsonb_array_elements(coalesce(x.data -> '_retired', '[]'::jsonb)) e
     where x.organization_id = p_organization_id
       and x.table_id = nullif(v_row.data ->> 'entity_definition_id', '')::uuid
       and x.deleted_at is null
       and e ->> 'key' = (v_row.data ->> 'key');
    select count(*) into v_conv
      from custom.record x
     where x.organization_id = p_organization_id
       and x.table_id = nullif(v_row.data ->> 'entity_definition_id', '')::uuid
       and x.deleted_at is null
       and x.data ? (v_row.data ->> 'key');
    return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                              'changed', true, 'migration_id', v_log,
                              'records_still_holding_a_value', v_conv,
                              'values_in_retired_for_this_field', v_ret,
                              'values', 'converted where they convert; kept in _retired with the reason where they do not (FLD-4 / T12)',
                              'at', now());
  end if;

  -- ── ARM ONE: a RECORD moves to another Table (REC-N-18 / T9). The id does not change, so
  --    every relation to it still resolves — that is the whole point of the verb.
  select t.id into v_to_tbl from custom.record t
   where t.organization_id = p_organization_id and t.data_class = 'table'
     and t.deleted_at is null
     and (t.id::text = p_to or t.data ->> 'slug' = p_to or t.data ->> 'name' = p_to)
   limit 1;
  if v_to_tbl is null then
    raise exception 'There is no table "%" in this organization to retype it to.', p_to
      using errcode = '02000', hint = 'REC-N-18: name the table by id, slug or name.';
  end if;

  select coalesce(array_agg(f.data ->> 'key'), '{}')
    into v_ok
    from custom.applicable_fields(p_organization_id, v_to_tbl, null) f;

  v_keep := v_row.data;
  for v_key in select jsonb_object_keys(v_row.data) loop
    if left(v_key, 1) = '_' or v_key in ('parent_id') then
      continue;
    end if;
    if not (v_key = any (v_ok)) then
      v_misfit := v_misfit || jsonb_build_object(v_key, v_row.data -> v_key);
      v_keep := v_keep - v_key;
      -- THE ENVELOPE GOES WITH THE VALUE. A record saying where a value it no longer holds
      -- came from is orphan provenance, and W1-VAL refuses it by name — correctly.
      v_keep := case when v_keep ? '_values'
                     then jsonb_set(v_keep, array['_values'], (v_keep -> '_values') - v_key)
                     else v_keep end;
    end if;
  end loop;

  v_log := history.migration_record(p_organization_id, 'retype', 'record', p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', v_row.data, 'table_id', v_row.table_id::text),
             coalesce(p_note, format('retyped to %s; %s value(s) did not fit and are in History with this reason, neither coerced nor deleted',
                                     coalesce((select t.data ->> 'name' from custom.record t
                                                where t.organization_id = p_organization_id and t.id = v_to_tbl), p_to),
                                     (select count(*) from jsonb_object_keys(v_misfit)))));

  update custom.record r
     set table_id = v_to_tbl, data = v_keep
   where r.organization_id = p_organization_id and r.id = p_id;

  return jsonb_build_object('verb', 'retype', 'record_id', p_id, 'kept_the_id', true,
                            'from_table', v_row.table_id, 'to_table', v_to_tbl,
                            'migration_id', v_log,
                            'misfits', v_misfit,
                            'misfits_are', 'in History with the reason, on migration ' || v_log::text,
                            'at', now());
end;
$function$;

CREATE OR REPLACE FUNCTION custom.delete_cascade_closure(p_organization_id uuid, p_record_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- Its one caller, custom.migrate_delete, is behind custom/system_enabled.
  v_out   uuid[] := '{}';
  v_queue uuid[] := array[p_record_id];
  v_id    uuid;
  v_next  uuid;
  v_guard integer := 0;
begin
  -- THE CALLER, on the one ladder. This function takes an organization id and PUBLIC holds
  -- EXECUTE on it by default, so it asks the same reach question every other door in this
  -- schema asks before it reads a record of that organization's store.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.delete_cascade_closure');
  while array_length(v_queue, 1) > 0 loop
    v_guard := v_guard + 1;
    if v_guard > 10000 then
      raise exception 'this delete reaches more than 10000 records, which is more than one transaction should take with it'
        using errcode = '53400',
              hint = 'REC-12: delete the contained records in batches first, and then the container.';
    end if;
    v_id := v_queue[1];
    v_queue := v_queue[2:];
    for v_next in
      select (x #>> '{}')::uuid
        from jsonb_array_elements(custom.delete_rule(p_organization_id, v_id, false) -> 'cascade_to') x
    loop
      if not (v_next = any (v_out)) and v_next <> p_record_id then
        v_out   := v_out || v_next;
        v_queue := v_queue || v_next;
      end if;
    end loop;
  end loop;
  return v_out;
end;
$function$;
