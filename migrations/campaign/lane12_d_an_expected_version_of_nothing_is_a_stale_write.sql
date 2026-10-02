-- chair-step: this REPLACES the body of custom.record_upsert(uuid, uuid, text[], jsonb, integer) (born in lane12_a_record_is_written_or_updated_by_its_key.sql) — same signature, same SECURITY DEFINER, same search_path, same grants (CREATE OR REPLACE keeps them). One thing changes: a call that says p_expected_version when no live record holds its key is refused PT409 (the stale-write refusal record_update gives) instead of writing a new record. No table, column, trigger, policy or grant is touched; nothing is written. Inverse: migrations/inverse/lane12_d_an_expected_version_of_nothing_is_a_stale_write_down.sql restores the body as read from the clone on 2026-10-02.
-- lane: PLATFORM-APP-DATA (v6 lane 12)
-- lock: custom
-- based-on: custom.record_upsert(uuid, uuid, text[], jsonb, integer) 2679ab70273a050ec2444689fdf18fec38173ea2007bbdb581803dcea4df0cfa
--
-- THE USE CASE. The front desk opened Rosa Delgado's callback at version 3; meanwhile a colleague
-- archived it. Saving her edit through recordUpsert({ ..., expectedVersion: 3 }) used to find no
-- live record by the phone number and WRITE A NEW ONE — an edit silently became a second record.
-- A caller that says "I expect version N" and finds nothing gets stale_write; without a version
-- the call is still write-or-update.
--
-- RED before this file (clone, 2026-10-02, as admin@admin.com and test@test.com):
--   aidream apps/shared/records/src/__tests__/a-record-is-written-or-updated-by-its-key-in-one-call.test.ts
--   "an update against a version, of a key no record holds, is refused as stale and writes nothing"

CREATE OR REPLACE FUNCTION custom.record_upsert(p_organization_id uuid, p_table_id uuid, p_key text[], p_data jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_rules jsonb;
  v_keys  text[];
  v_key   text;
  v_label text;
  v_text  text;
  v_id    uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_upsert');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_upsert');
  if p_table_id is null then
    raise exception 'Say which table to write into.'
      using errcode = '22004', hint = 'Nothing was written.';
  end if;
  -- THE TABLE'S OWN WALL FIRST, as custom.record_write asks it: a Table she may not add records to
  -- is refused here, before its rules or its records are read — the same 42501 an invented id gets.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.record_upsert',
                                          'editor'::public.permission_level, 'table');
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'The values to write must be an object of column key to value.'
      using errcode = '22023', hint = 'Nothing was written.';
  end if;
  select coalesce(array_agg(distinct btrim(k) order by btrim(k)), '{}'::text[]) into v_keys
    from unnest(coalesce(p_key, '{}'::text[])) k
   where nullif(btrim(k), '') is not null;
  if cardinality(v_keys) = 0 then
    raise exception 'Say which column finds the record.'
      using errcode = '22023',
            hint = 'Name the unique column (for example the phone number) that says which record this is. Nothing was written.';
  end if;

  v_rules := custom.table_unique_rule_fields(p_organization_id, p_table_id);

  foreach v_key in array v_keys loop
    select coalesce(nullif(f ->> 'label', ''), v_key) into v_label
      from jsonb_array_elements(v_rules) f
     where f ->> 'key' = v_key
     limit 1;
    if v_label is null then
      select coalesce(nullif(r.data ->> 'label', ''), v_key) into v_label
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.field_kernel_id()
         and r.data_class = 'field'
         and r.deleted_at is null
         and r.data ->> 'entity_definition_id' = p_table_id::text
         and r.data ->> 'key' = v_key
       limit 1;
      raise exception '"%" can''t find a record: it isn''t a unique column.', coalesce(v_label, v_key)
        using errcode = '23514',
              hint = format('Turn on Unique for %s in its column settings, then write again. Nothing was written.', coalesce(v_label, v_key));
    end if;

    v_text := lower(btrim(p_data ->> v_key));
    if v_text is null or v_text = '' then
      raise exception '"%" needs a value: it says which record this is.', v_label
        using errcode = '22023', hint = 'Nothing was written.';
    end if;

    -- THE SAME LOCK custom._unique_rule_holds TAKES for this value: re-entrant in this
    -- transaction, and the one a racing write of the same value waits on.
    perform pg_advisory_xact_lock(
      hashtextextended(p_organization_id::text || '|' || p_table_id::text || '|' || v_key || '|' || v_text, 0));
    v_label := null;
  end loop;

  select x.id into v_id
    from custom.record x
   where x.organization_id = p_organization_id
     and x.table_id = p_table_id
     and x.deleted_at is null
     and not exists (select 1 from unnest(v_keys) k
                      where lower(btrim(x.data ->> k)) is distinct from lower(btrim(p_data ->> k)))
   order by x.created_at, x.id
   limit 1;

  if v_id is not null then
    perform custom.record_update(p_organization_id, v_id, p_data, p_expected_version);
    return v_id;
  end if;

  -- "I EXPECT VERSION N" AND THERE IS NOTHING: the record she read is gone (archived), or never
  -- held this key. Writing a new one would quietly turn an edit into a second record, so it is the
  -- same refusal record_update gives a write that lost — PT409, its DETAIL shape, current_version 0
  -- meaning "no live record" — and nothing is written.
  if p_expected_version is not null then
    raise exception 'The record you were changing is not here any more. You wrote against version %, and no live record holds "%".',
                    p_expected_version,
                    (select string_agg(btrim(p_data ->> k), ', ' order by k) from unnest(v_keys) k)
      using errcode = 'PT409',
            detail = jsonb_build_object('expected_version', p_expected_version,
                                        'current_version',  0,
                                        'contested_fields', '{}'::jsonb)::text,
            hint = 'Nothing was written. Read the table again: if it was archived, restore it; to add it as a new record, write again without a version.';
  end if;
  return custom.record_write(p_organization_id, p_table_id, p_data);
end;
$function$;

comment on function custom.record_upsert(uuid, uuid, text[], jsonb, integer) is
  'Lane PLATFORM-APP-DATA: write the record a unique key names, or update it through custom.record_update when it is already there; serialized on the same advisory lock custom._unique_rule_holds takes; refuses a key column without a unique rule by name; with p_expected_version and no live record of that key, refuses PT409 (stale write) and writes nothing.';
