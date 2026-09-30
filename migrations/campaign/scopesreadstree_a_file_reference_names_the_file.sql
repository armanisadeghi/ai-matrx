-- target: branch,production
-- additive: yes
-- guard: custom/scope_readers_read_the_store
-- lane: SCOPES-READS-TREE
-- lock: custom
--
-- SCOPES-READS-TREE — A FILE REFERENCE NAMES THE FILE, NOT ITS FILE RECORD. A File column in the store holds
-- ids of File RECORDS (the kernel File Table 11111111-…-0006); each record's data.file_id is the file. The old
-- fence named the file (files.files id), so custom.scope_value_columns now hands data.file_id and the record's
-- name as the label. Found by the coordinator on Castellano & Reyes' AME / QME value (record be939cea…, file
-- e6acafbd…). Behind the same switch (off); the helper is custom-schema, SECURITY INVOKER, no grant.
-- based-on: custom.scope_value_columns(uuid, jsonb, text, jsonb) 63ec5726abefe9d3dfee967a73730bcb5bccacfa1985716db8ab0386f66d65b4

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION custom.scope_value_columns(p_org uuid, p_field jsonb, p_value_type text, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cols jsonb := jsonb_build_object('value_text', null, 'value_number', null, 'value_boolean', null,
                                     'value_json', null, 'value_date', null, 'value_timestamp', null,
                                     'value_time', null, 'value_document_url', null);
  v_multi boolean := coalesce((p_field ->> 'multi')::boolean, false);
  v_items jsonb;
  v_type  text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return v_cols;
  end if;
  if p_field ->> 'type' = 'relation' then
    if p_field ->> 'relation_target' = '11111111-0000-4000-8000-000000000006' then
      v_type := 'file';
      -- A File column holds File RECORDS (the kernel File Table); the old fence named the file itself,
      -- which is the record's data.file_id, and its label is the record's name.
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'file_id', coalesce(fr.data ->> 'file_id', e.value #>> '{}'),
               'label', fr.data ->> 'name')) order by e.ord)
        into v_items
        from jsonb_array_elements(case when jsonb_typeof(p_value) = 'array' then p_value else jsonb_build_array(p_value) end)
             with ordinality e(value, ord)
        left join custom.record fr on fr.id = (e.value #>> '{}')::uuid
                                  and fr.table_id = '11111111-0000-4000-8000-000000000006'::uuid;
    elsif jsonb_array_length(coalesce(p_field -> 'config' -> 'allowed_types', '[]'::jsonb)) > 0 then
      select min(e.value ->> 'token'),
             jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', e.value ->> 'id',
               'label', (select si.title from platform.search_item si
                          where si.entity_token = e.value ->> 'token' and si.entity_id = (e.value ->> 'id')::uuid
                            and si.organization_id = p_org limit 1))) order by e.ord)
        into v_type, v_items
        from jsonb_array_elements(case when jsonb_typeof(p_value) = 'array' then p_value else jsonb_build_array(p_value) end)
             with ordinality e(value, ord)
       where jsonb_typeof(e.value) = 'object';
    else
      v_type := 'scope';
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', e.value #>> '{}',
               'label', (select t.data ->> 'name' from custom.record t
                          where t.organization_id = p_org and t.id = (e.value #>> '{}')::uuid and t.deleted_at is null))) order by e.ord)
        into v_items
        from jsonb_array_elements(case when jsonb_typeof(p_value) = 'array' then p_value else jsonb_build_array(p_value) end)
             with ordinality e(value, ord);
    end if;
    if v_items is null then
      return v_cols;
    end if;
    return v_cols || jsonb_build_object('value_text',
      E'```matrx\n' || jsonb_pretty(jsonb_build_object('matrx_version', 1, 'kind', 'reference', 'type', v_type, 'items', v_items)) || E'\n```');
  end if;
  if p_field ->> 'type' = 'boolean' then
    return v_cols || jsonb_build_object('value_boolean', p_value);
  end if;
  if p_field ->> 'type' = 'range' then
    -- A date or a moment keeps the words it was written in: a calendar date is a date, a moment
    -- with its time is a timestamp, anything else was kept as text by the old writer.
    if p_value_type in ('date', 'datetime') then
      if jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$' and p_value_type = 'date' then
        return v_cols || jsonb_build_object('value_date', p_value);
      elsif jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}[T ]\d' then
        return v_cols || jsonb_build_object('value_timestamp', to_jsonb((p_value #>> '{}')::timestamptz));
      end if;
      return v_cols || jsonb_build_object('value_text', p_value);
    end if;
    if jsonb_typeof(p_value) = 'number' or (p_value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$' then
      return v_cols || jsonb_build_object('value_number', to_jsonb((p_value #>> '{}')::numeric));
    end if;
    return v_cols || jsonb_build_object('value_text', p_value);
  end if;
  -- TEXT: a list the old side held as one text value comes back as that text.
  if v_multi and jsonb_typeof(p_value) = 'array' then
    if jsonb_array_length(p_value) = 1 and jsonb_typeof(p_value -> 0) = 'string' then
      return v_cols || jsonb_build_object('value_text', p_value -> 0);
    end if;
    return v_cols || jsonb_build_object('value_json', p_value);
  end if;
  if p_value_type = 'object' then
    return v_cols || jsonb_build_object('value_json', custom.scope_setting_back(p_value, 'text'));
  end if;
  if jsonb_typeof(p_value) = 'string' then
    return v_cols || jsonb_build_object('value_text', p_value);
  end if;
  return v_cols || jsonb_build_object('value_json', p_value);
end;
$function$;
