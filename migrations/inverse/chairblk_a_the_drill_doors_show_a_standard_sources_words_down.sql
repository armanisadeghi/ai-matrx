-- Inverse of migrations/campaign/chairblk_a_the_drill_doors_show_a_standard_sources_words.sql (CHAIR-ENTITY-BLOCKS).
-- The three door bodies exactly as they were before it (captured live 2026-10-05), then the helpers dropped.
-- based-on: platform.drill_describe(uuid, jsonb) 1289ae3352498a7f2b16ea35b673ac29ed5ebf45a71a95e103e2f9b2ee16b56c
-- based-on: platform.drill_rows(uuid, jsonb, jsonb) ae64ff6e4a2782c26ac64e1705b1c883e947a5ce2e63b3ce95b68a33ebdc890f
-- based-on: custom.entity_row_write(uuid, text, uuid, jsonb, jsonb, integer, boolean) 8c54c40b074f2972da8e64171934e510ecedc6674ba9185eea792f5495b4df53

CREATE OR REPLACE FUNCTION platform.drill_describe(p_organization_id uuid, p_source jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v jsonb;
begin
  perform custom.assert_entity_door(p_organization_id, 'platform.drill_describe');
  -- LANE7-W3A: as in platform.drill_rows — the rows she reads elsewhere name their fields
  -- (the Table API names itself with "api": true; a drill page's question is untouched)
  perform set_config('mx.api_fast', case when p_source ->> 'api' = 'true' then '1' else '' end, true);
  perform set_config('mx.api_rows', '', true);
  if p_source ->> 'kind' = 'entity' and p_source ->> 'api' = 'true' then
    perform set_config('mx.api_rows', coalesce(platform.api_sample_rows(p_source ->> 'token'), '{}')::text, true);
  end if;
  v := platform._drill_plan(p_organization_id, p_source, null, 'describe');
  if p_source ->> 'kind' = 'table' then
    if not coalesce((v ->> 'd2')::boolean, false) then
      raise exception 'A custom Table says its own dimensions and measures once lane DRILL-CUSTOM-PARITY''s door (custom.table_dimensions) is on this database.'
        using errcode = '0A000', hint = 'Until then ask it directly: its columns are its dimensions, and count / sum_<column> its measures.';
    end if;
    execute 'select custom.table_dimensions($1, $2)' into v using p_organization_id, (p_source ->> 'id')::uuid;
    return v || jsonb_build_object('source', jsonb_build_object('kind', 'table', 'id', p_source ->> 'id'),
                                   'stale_after_knob', null,
                                   'calendar', platform.drill_calendar(p_organization_id));
  end if;
  -- the calendar the door cuts periods in (VERIFY-DRILL-LIVE F8): screens print times in it and say it once
  return (v -> 'def') || jsonb_build_object('calendar', platform.drill_calendar(p_organization_id));
end
$function$
;

CREATE OR REPLACE FUNCTION platform.drill_rows(p_organization_id uuid, p_source jsonb, p_question jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_plan  jsonb;
  v_total bigint;
  v_rows  jsonb;
  v_n     bigint;
  v_says  text[] := '{}';
  v_d     jsonb;
  v_page  jsonb;
  v_off   integer;
begin
  perform custom.assert_entity_door(p_organization_id, 'platform.drill_rows');
  -- LANE7-W3A: rows she can read in other organizations that keep fields on this table, found
  -- by her own SELECT, so their organizations' fields describe them (platform._drill_resolve)
  -- (the Table API names itself with "api": true; a drill page's question is untouched)
  perform set_config('mx.api_fast', case when p_source ->> 'api' = 'true' then '1' else '' end, true);
  perform set_config('mx.api_rows', '', true);
  if p_source ->> 'kind' = 'entity' and p_source ->> 'api' = 'true' then
    perform set_config('mx.api_rows', coalesce(platform.api_sample_rows(p_source ->> 'token'), '{}')::text, true);
  end if;
  v_plan := platform._drill_plan(p_organization_id, p_source, p_question, 'rows');

  -- THE RECORDS OF A DEFINER DEFINITION (decision 14): its declared records relation, read by the
  -- definer step with the SAME filter compiler and the SAME lane rule the number was counted with,
  -- for a window, cut at the number's as_of.
  if coalesce((v_plan ->> 'records')::boolean, false) then
    return platform._drill_run_declared(p_organization_id, p_source ->> 'token', p_question, 'rows');
  end if;

  if v_plan ? 'delegate' then
    -- the SAME filter custom.record_aggregate counted with (custom.record_filter_sql), as the seat
    v_d := v_plan -> 'delegate';
    v_page := custom.read_records_page(
      p_organization_id => p_organization_id, p_table_id => (p_source ->> 'id')::uuid,
      p_filter => coalesce(v_d -> 'filter', '{}'::jsonb),
      p_sort => case when v_plan -> 'sort' ->> 'key' is not null and v_plan -> 'sort' ->> 'key' <> 'count'
                     then jsonb_build_array(jsonb_build_object('field', v_plan -> 'sort' ->> 'key', 'direction', coalesce(v_plan -> 'sort' ->> 'direction', 'asc')))
                     else '[]'::jsonb end,
      p_limit => coalesce((p_question ->> 'limit')::integer, 50), p_offset => (v_plan ->> 'offset')::integer);
    v_total := (v_page ->> 'total')::bigint;
    v_off := coalesce((v_page ->> 'offset')::integer, 0);
    return v_page || jsonb_build_object('next_offset',
      case when v_off + jsonb_array_length(coalesce(v_page -> 'rows', '[]'::jsonb)) < v_total
           then v_off + jsonb_array_length(coalesce(v_page -> 'rows', '[]'::jsonb)) end, 'as_of', null);
  end if;

  -- AS THE SEAT, ALWAYS — even for a declared definer fact: "see these records" opens only rows
  -- the seat may open, and says so when the number counted more.
  execute v_plan ->> 'sql' into v_total, v_rows using v_plan -> 'params';
  if coalesce((v_plan ->> 'api')::boolean, false) then
    -- LANE7-W3A: the Table API's page. The count is exact up to the knob table_api/exact_count_max
    -- and "at least" past it; the next cursor is the last row's sort value and key.
    return jsonb_strip_nulls(jsonb_build_object(
      'total', least(v_total, (v_plan ->> 'count_max')::bigint),
      'estimated', case when v_total > (v_plan ->> 'count_max')::bigint then true end,
      'limit', (v_plan ->> 'limit')::integer, 'offset', (v_plan ->> 'offset')::integer,
      'rows', v_rows, 'scope', v_plan ->> 'scope',
      'next_cursor', case when jsonb_array_length(v_rows) >= (v_plan ->> 'limit')::integer
                          then jsonb_build_object('v', v_rows -> -1 -> '_k' -> 0, 'id', v_rows -> -1 -> '_k' -> 1) end,
      'columns', v_plan -> 'def' -> 'api' -> 'columns'));
  end if;
  if jsonb_array_length(v_rows) = 0 and (v_plan ->> 'offset')::integer > 0 then
    execute v_plan ->> 'count_sql' into v_total using v_plan -> 'params';
  end if;
  if v_plan ->> 'mode' = 'definer' then
    v_n := (platform._drill_run_declared(p_organization_id, p_source ->> 'token', p_question - 'limit' - 'offset' - 'sort' - 'columns', 'count') ->> 'total')::bigint;
    if v_n > v_total then
      v_says := v_says || format('%s of the %s counted are records you can open; the rest belong to other people in this organization.', v_total, v_n);
    end if;
  end if;
  v_off := (v_plan ->> 'offset')::integer;
  return jsonb_strip_nulls(jsonb_build_object(
    'total', v_total, 'limit', (v_plan ->> 'limit')::integer, 'offset', v_off, 'rows', v_rows,
    'next_offset', case when v_off + jsonb_array_length(v_rows) < v_total then v_off + jsonb_array_length(v_rows) end,
    'columns', v_plan -> 'def' -> 'detail' -> 'columns',
    'says', case when cardinality(v_says) > 0 then array_to_string(v_says, ' ') end))
    || jsonb_build_object('as_of', null);   -- read live from the table: no summary moment
end
$function$
;

CREATE OR REPLACE FUNCTION custom.entity_row_write(p_organization_id uuid, p_token text, p_record_id uuid, p_columns jsonb DEFAULT '{}'::jsonb, p_custom jsonb DEFAULT '{}'::jsonb, p_expected_version integer DEFAULT NULL::integer, p_archive boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  t        record;
  v_reg    record;
  v_row    jsonb;
  v_org    uuid;
  v_sets   text[] := '{}';
  v_args   jsonb := '[]'::jsonb;
  v_key    text;
  v_clear  text[] := '{}';
  v_patch  jsonb := '{}'::jsonb;
  v_n      int;
  v_where  text;
  v_has_ver boolean;
  v_cols   jsonb := coalesce(p_columns, '{}'::jsonb);
  v_custom jsonb := coalesce(p_custom, '{}'::jsonb);
  v_cf     jsonb;
  v_same   boolean := true;
  v_level  public.permission_level;
  v_mask   jsonb;
  v_vis    text[];
  v_decl   text[];
  v_out    jsonb;
begin
  -- the client wall is asked of an organization the call names; a change by id needs none
  if p_organization_id is not null or p_record_id is null then
    perform custom.assert_entity_door(p_organization_id, 'custom.entity_row_write');
  end if;
  select * into t from custom.entity_table(p_token);
  perform custom.assert_entity_is_organization_scoped(t.token, t.label, t.has_organization);
  select f.api_reach, f.api_writable_columns, f.create_via into v_reg from platform.api_facts(p_token) f;

  -- (How far the Table API reaches a table is the API's own question, answered before it calls
  -- this door. This door is the store's: the app's Custom fields section writes through it too.)
  if jsonb_typeof(v_cols) <> 'object' or jsonb_typeof(v_custom) <> 'object' then
    raise exception 'A write names its columns and values as {"name": value}.' using errcode = '22023';
  end if;
  if p_record_id is null then
    if coalesce(v_reg.create_via, 'refuse') <> 'insert' then
      raise exception 'New % records are added in AI Matrx, which checks for duplicates.', t.label
        using errcode = '0A000', hint = 'This API changes records that already exist.';
    end if;
    raise exception 'New % records are not created through this API yet.', t.label using errcode = '0A000';
  end if;

  -- the row, as she may read it: its own organization, never one a caller supplies
  execute format('select to_jsonb(x) from %I.%I x where x.id = $1', t.schema_name, t.table_name)
    into v_row using p_record_id;
  v_cf := case when jsonb_typeof(v_row -> 'custom_fields') = 'object' then v_row -> 'custom_fields' else '{}'::jsonb end;
  v_row := v_row - 'custom_fields';
  if v_row is null then
    raise exception 'There is no % you can open with that id.', t.label using errcode = '02000';
  end if;
  v_org := (v_row ->> 'organization_id')::uuid;
  if p_organization_id is not null and v_org is distinct from p_organization_id then
    raise exception 'This % belongs to another organization, not to the one this call names.', t.label
      using errcode = '42501', hint = 'Leave the organization out, or name the one the record belongs to.';
  end if;

  -- real columns: only the ones the registry lists for the API
  for v_key in select k from jsonb_object_keys(v_cols) k loop
    if not (v_key = any (coalesce(v_reg.api_writable_columns, '{}'::text[]))) then
      raise exception '"%" cannot be changed through the API.', v_key
        using errcode = '42501', hint = 'Change it in AI Matrx. Nothing was written.';
    end if;
    v_sets := v_sets || format('%I = ($2->>%s)::%s', v_key, jsonb_array_length(v_args),
                               (select format_type(a.atttypid, a.atttypmod) from pg_attribute a
                                 where a.attrelid = format('%I.%I', t.schema_name, t.table_name)::regclass and a.attname = v_key));
    v_args := v_args || jsonb_build_array(v_cols -> v_key);
  end loop;

  -- custom values: a key set to null clears it (and its envelope); the author is the session's
  select string_agg(format('"%s"', k), ', ' order by k) into v_key
    from jsonb_object_keys(v_custom) k where left(k, 1) = '_';
  if v_key is not null then
    raise exception '% % kept by the store itself, so it cannot be written. Nothing was written.', v_key,
      case when position(',' in v_key) > 0 then 'are' else 'is' end
      using errcode = '22023', hint = 'Who changed a value comes from your sign-in; send only the fields you are setting.';
  end if;
  for v_key in select k from jsonb_object_keys(v_custom) k loop
    if jsonb_typeof(v_custom -> v_key) = 'null' then
      v_clear := v_clear || v_key;
    else
      v_patch := v_patch || jsonb_build_object(v_key, v_custom -> v_key);
    end if;
  end loop;
  if cardinality(v_clear) > 0 or v_patch <> '{}'::jsonb then
    v_sets := v_sets || ('custom_fields = (case when cardinality($3::text[]) > 0 then jsonb_set(coalesce(case when jsonb_typeof(custom_fields) = ''object'' then custom_fields end, ''{}''::jsonb) - $3::text[], ''{_values}'', coalesce(custom_fields -> ''_values'', ''{}''::jsonb) - $3::text[]) '
                         || 'else coalesce(case when jsonb_typeof(custom_fields) = ''object'' then custom_fields end, ''{}''::jsonb) end) || $4');
  end if;

  if p_archive is not null then
    if not t.has_deleted_at then
      raise exception '% records are never archived.', t.label using errcode = '0A000';
    end if;
    v_sets := v_sets || case when p_archive then 'deleted_at = coalesce(deleted_at, now())' else 'deleted_at = null' end;
  end if;
  if cardinality(v_sets) = 0 then
    raise exception 'Send at least one value to change.' using errcode = '22023';
  end if;

  v_has_ver := v_row ? 'version';
  if p_expected_version is not null and v_has_ver and (v_row ->> 'version')::integer is distinct from p_expected_version then
    raise exception 'Someone changed this % since you read it (it is at version %, and you sent %). Nothing was written.',
      t.label, v_row ->> 'version', p_expected_version
      using errcode = 'PT409', hint = 'Read it again, then send your change with the new version.';
  end if;
  -- A CHANGE THAT CHANGES NOTHING WRITES NOTHING: the version does not move and no history is made.
  select v_same and coalesce(bool_and((v_cf -> k) is not distinct from (v_patch -> k)), true) into v_same from jsonb_object_keys(v_patch) k;
  select v_same and coalesce(bool_and(not (v_cf ? k)), true) into v_same from unnest(v_clear) k;
  select v_same and coalesce(bool_and((v_row -> k) is not distinct from (v_cols -> k)), true) into v_same from jsonb_object_keys(v_cols) k;
  if p_archive is not null and ((v_row ->> 'deleted_at') is not null) is distinct from p_archive then
    v_same := false;
  end if;
  if not v_same then
  v_where := 'x.id = $1';
  if p_expected_version is not null then
    if not v_has_ver then
      raise exception '% records carry no version, so expected_version cannot be checked.', t.label using errcode = '22023';
    end if;
    v_where := v_where || ' and x.version = $5';
  end if;
  -- LANE7-W4B[h1]: AN HR ROW is changed through HR's own edit rule — the write gate that gates
  -- hr_employee_update today asks the signed-in person and arms this statement; with no subject
  -- employee nothing is armed and HR's guard refuses exactly as before.
  if t.schema_name = 'hr' then
    perform hr.custom_fields_write_gate(v_org, p_token, p_record_id);
  end if;
  execute format('update %I.%I x set %s where %s', t.schema_name, t.table_name, array_to_string(v_sets, ', '), v_where)
    using p_record_id, v_args, v_clear, v_patch, p_expected_version;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    if p_expected_version is not null and (v_row ->> 'version')::integer is distinct from p_expected_version then
      raise exception 'Someone changed this % since you read it (it is at version %, and you sent %). Nothing was written.',
        t.label, v_row ->> 'version', p_expected_version
        using errcode = 'PT409', hint = 'Read it again, then send your change with the new version.';
    end if;
    raise exception 'You can see this %, but it is not yours to change.', t.label
      using errcode = '42501', hint = 'It takes edit access, or a share of this record with you. Nothing was written.';
  end if;
  end if;   -- (a change that changes nothing skipped the UPDATE above)

  -- WHAT THIS DOOR ANSWERS: the row and its custom values AS SHE MAY READ THEM — through
  -- custom.entity_read_mask and custom.mask_document, exactly as custom.entity_record_read
  -- answers (a field she may not read is null, with its withheld notice). The mask is asked in
  -- the row's own organization; for a row shared with her from an organization she is not a
  -- member of, that door has no answer for her, so no values are returned (`custom` absent) and
  -- the caller reads the row back through a read door.
  v_out := jsonb_build_object('id', p_record_id, 'organization_id', v_org, 'token', t.token)
           || case when v_same then '{"unchanged": true}'::jsonb else '{}'::jsonb end;
  if v_org is not null and iam.has_org_access(v_org) then
    execute format('select x.custom_fields from %I.%I x where x.id = $1', t.schema_name, t.table_name)
      into v_cf using p_record_id;
    if v_cf is null or jsonb_typeof(v_cf) <> 'object' then v_cf := '{}'::jsonb; end if;
    v_level := custom.entity_seat_level(v_org, p_token, p_record_id);
    v_mask  := custom.entity_read_mask(v_org, p_token, v_level, 'read');
    select coalesce(array_agg(x), '{}'::text[]) into v_vis  from jsonb_array_elements_text(v_mask -> 'visible') x;
    select coalesce(array_agg(x), '{}'::text[]) into v_decl from jsonb_array_elements_text(v_mask -> 'declared') x;
    v_out := v_out || jsonb_build_object('custom',
      custom.mask_document(v_cf - '_values' - '_retired', v_vis, v_mask -> 'notices', false, '{}'::jsonb, v_decl));
  end if;
  return v_out;
end
$function$
;

drop function if exists platform._drill_words_in(text, jsonb, text);
drop function if exists platform._drill_word_ids(jsonb, text);
drop function if exists platform._drill_present_rows(text, jsonb);
drop function if exists platform._drill_present(text, jsonb);
drop function if exists platform._drill_lookup_words(text, text, text[], jsonb, text, text, integer);
drop function if exists platform._drill_shown_real(jsonb);
drop function if exists platform.api_presentation(text);
