-- chair-step: the INVERSE of storetails3_a_view_setting_is_refused_by_name_never_an_internal_error.sql. Puts
--   `custom._view_key_value` back to the exact body that file was written against (no arm for
--   `filter` or `server`; an unknown shape raised XX000).
-- lock: custom
-- lane: STORE-TAILS-3
-- based-on: custom._view_key_value(uuid, uuid, text, text, jsonb, jsonb) 43ce790fa050459da7105b81aa1fe0abf0cee1e82b16546416e411c6a29a3cbe

set local lock_timeout = '2s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION custom._view_key_value(p_organization_id uuid, p_table_id uuid, p_path text, p_shape text, p_value jsonb, p_old jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_out   jsonb;
  v_item  jsonb;
  v_sub   record;
  v_reg   record;
  v_seen  text[] := '{}';
  v_key   text;
  v_dir   text;
  v_n     integer;
  v_lv    integer;
  -- THE WORDS THIS SAME SETTING ALREADY HELD. A Field the setting already names is not asked
  -- again (a column archived since cannot make an unrelated save fail); a Field another setting
  -- names is asked in full — the Price being the column sum says nothing about it as a date.
  p_known text[] := coalesce((select array_agg(distinct x #>> '{}')
                                from jsonb_path_query(coalesce(p_old, 'null'::jsonb), 'strict $.**') x
                               where jsonb_typeof(x) = 'string'), '{}'::text[]);
begin
  if p_shape = 'kind' then
    if jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') not in ('grid', 'kanban', 'calendar', 'gallery', 'sheet') then
      raise exception 'A view is a grid, a kanban, a calendar or a gallery, or the Sheet (sheet), and "%" is none of them.', p_value #>> '{}'
        using errcode = '22023', hint = 'Nothing was written.';
    end if;
    return p_value;

  elsif p_shape in ('field', 'field:lane', 'field:number', 'field:date', 'field:color') then
    return to_jsonb(custom._view_field_key(p_organization_id, p_table_id, p_path, p_shape, p_value, p_known));

  elsif p_shape = 'fields' then
    if jsonb_typeof(p_value) <> 'array' then
      raise exception '% is a list of Fields.', p_path using errcode = '22023', hint = 'Nothing was written.';
    end if;
    if p_path = 'presentation.frozen' and jsonb_array_length(p_value) > 10 then
      raise exception 'A view pins at most ten columns, and % were asked.', jsonb_array_length(p_value)
        using errcode = '22023', hint = 'More pinned columns than that leave nothing to scroll. Nothing was written.';
    end if;
    v_out := '[]'::jsonb;
    for v_item in select x from jsonb_array_elements(p_value) x loop
      v_key := custom._view_field_key(p_organization_id, p_table_id, p_path, 'field', v_item, p_known);
      if not (v_key = any (v_seen)) then
        v_seen := v_seen || v_key;
        v_out := v_out || to_jsonb(v_key);
      end if;
    end loop;
    return v_out;

  elsif p_shape = 'values' then
    if jsonb_typeof(p_value) <> 'array' then
      raise exception 'The collapsed columns are a list of the columns'' values.' using errcode = '22023', hint = 'Nothing was written.';
    end if;
    if jsonb_array_length(p_value) > 200 then
      raise exception 'A board keeps at most 200 columns shut, and % were asked.', jsonb_array_length(p_value)
        using errcode = '22023', hint = 'Nothing was written.';
    end if;
    v_out := '[]'::jsonb;
    for v_item in select x from jsonb_array_elements(p_value) x loop
      if jsonb_typeof(v_item) not in ('string', 'number', 'boolean') then
        raise exception 'A collapsed column is named by its value, and a % is not one.', jsonb_typeof(v_item)
          using errcode = '22023', hint = 'Nothing was written.';
      end if;
      if not ((v_item #>> '{}') = any (v_seen)) then
        v_seen := v_seen || (v_item #>> '{}');
        v_out := v_out || to_jsonb(v_item #>> '{}');
      end if;
    end loop;
    return v_out;

  elsif p_shape = 'sorts' then
    if jsonb_typeof(p_value) <> 'array' then
      raise exception 'A view''s sort is a list of {field, direction}.' using errcode = '22023', hint = 'Nothing was written.';
    end if;
    if jsonb_array_length(p_value) > 5 then
      raise exception 'A view sorts by at most five columns, and % were asked.', jsonb_array_length(p_value)
        using errcode = '22023', hint = 'Past the fifth, a sort changes nothing a person can see. Nothing was written.';
    end if;
    v_out := '[]'::jsonb;
    for v_item in select x from jsonb_array_elements(p_value) x loop
      if jsonb_typeof(v_item) <> 'object' or not (v_item ? 'field') then
        raise exception 'Each sort names a field and a direction.' using errcode = '22023', hint = 'Nothing was written.';
      end if;
      v_dir := coalesce(nullif(v_item ->> 'direction', ''), 'asc');
      if v_dir not in ('asc', 'desc') then
        raise exception 'A sort runs asc or desc, and "%" is neither.', v_dir using errcode = '22023', hint = 'Nothing was written.';
      end if;
      v_key := custom._view_field_key(p_organization_id, p_table_id, 'sorts', 'field', v_item -> 'field', p_known);
      if v_key = any (v_seen) then
        raise exception 'The sort names % twice; each column sorts once.', v_key
          using errcode = '22023', hint = 'Nothing was written.';
      end if;
      v_seen := v_seen || v_key;
      v_out := v_out || jsonb_build_array(jsonb_build_object('field', v_key, 'direction', v_dir));
    end loop;
    return v_out;

  elsif p_shape = 'uuid' then
    if jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception '% names a record by its id, and "%" is not one.', p_path, p_value #>> '{}'
        using errcode = '22023', hint = 'Nothing was written.';
    end if;
    return p_value;

  elsif p_shape = 'boolean' then
    if jsonb_typeof(p_value) = 'boolean' then return p_value; end if;
    if jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') in ('true', 'false') then
      return to_jsonb((p_value #>> '{}')::boolean);
    end if;
    raise exception '% is on or off (true or false), and "%" is neither.', p_path, p_value #>> '{}'
      using errcode = '22023', hint = 'Nothing was written.';

  elsif p_shape = 'row_height' then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 24 and 96 then
      raise exception 'A row is 24 to 96 pixels tall, and "%" is not that.', p_value #>> '{}'
        using errcode = '22023', hint = 'Nothing was written.';
    end if;
    return to_jsonb(round((p_value #>> '{}')::numeric)::integer);

  elsif p_shape = 'gallery_size' then
    if jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') not in ('small', 'medium', 'large') then
      raise exception 'A gallery card is small, medium or large, and "%" is none of them.', p_value #>> '{}'
        using errcode = '22023', hint = 'Nothing was written.';
    end if;
    return p_value;

  elsif p_shape = 'fit' then
    if jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') not in ('auto', 'fit', 'scroll') then
      raise exception 'The grid shares its width auto, fit or scroll, and "%" is none of them.', p_value #>> '{}'
        using errcode = '22023', hint = 'Nothing was written.';
    end if;
    return p_value;

  elsif p_shape = 'object' then
    if jsonb_typeof(p_value) <> 'object' then
      raise exception '% is a set of choices by Field key.', p_path using errcode = '22023', hint = 'Nothing was written.';
    end if;
    return p_value;

  elsif p_shape = 'widths' then
    if jsonb_typeof(p_value) <> 'object' then
      raise exception 'Column widths are a number of pixels for each column.' using errcode = '22023', hint = 'Nothing was written.';
    end if;
    v_out := '{}'::jsonb;
    for v_sub in select key, value from jsonb_each(p_value) loop
      if jsonb_typeof(v_sub.value) <> 'number' or (v_sub.value #>> '{}')::numeric not between 40 and 2000 then
        raise exception 'A column is 40 to 2000 pixels wide, and "%" was asked for %.', v_sub.value #>> '{}', v_sub.key
          using errcode = '22023', hint = 'Nothing was written.';
      end if;
      v_out := v_out || jsonb_build_object(v_sub.key, round((v_sub.value #>> '{}')::numeric)::integer);
    end loop;
    return v_out;

  elsif p_shape = 'summaries' then
    if jsonb_typeof(p_value) <> 'object' then
      raise exception 'Column summaries are one measure for each column.' using errcode = '22023', hint = 'Nothing was written.';
    end if;
    v_out := '{}'::jsonb;
    for v_sub in select key, value from jsonb_each(p_value) loop
      if jsonb_typeof(v_sub.value) <> 'string'
         or (v_sub.value #>> '{}') not in ('none', 'count', 'sum', 'avg', 'min', 'max', 'median', 'filled', 'empty', 'unique') then
        raise exception 'A column summary is count, sum, avg, min, max, median, filled, empty or unique, and "%" is none of them.', v_sub.value #>> '{}'
          using errcode = '22023', hint = 'Nothing was written.';
      end if;
      v_key := custom._view_field_key(p_organization_id, p_table_id, p_path, 'field', to_jsonb(v_sub.key), p_known);
      v_out := v_out || jsonb_build_object(v_key, v_sub.value);
    end loop;
    return v_out;

  elsif p_shape = 'style' then
    if jsonb_typeof(p_value) <> 'object' then
      raise exception 'A view''s colours are a set of choices.' using errcode = '22023', hint = 'Nothing was written.';
    end if;
    v_out := p_value;
    if jsonb_typeof(p_value -> 'colorBy') = 'object' then
      v_out := jsonb_set(v_out, '{colorBy,field}', to_jsonb(custom._view_field_key(
                 p_organization_id, p_table_id, 'presentation.style.colorBy', 'field:color',
                 p_value -> 'colorBy' -> 'field', p_known)));
    elsif p_value ? 'colorBy' and jsonb_typeof(p_value -> 'colorBy') <> 'null' then
      raise exception 'Colour by names a field and what it paints.' using errcode = '22023', hint = 'Nothing was written.';
    end if;
    if p_value ? 'rules' and jsonb_typeof(p_value -> 'rules') not in ('array', 'null') then
      raise exception 'Colour rules are a list.' using errcode = '22023', hint = 'Nothing was written.';
    end if;
    return v_out;

  elsif p_shape = 'grouping' then
    if jsonb_typeof(p_value) <> 'object' then
      raise exception 'A grouping names the field its sections come from.' using errcode = '22023', hint = 'Nothing was written.';
    end if;
    v_out := p_value;
    v_key := custom._view_field_key(p_organization_id, p_table_id, 'presentation.grouping', 'field', p_value -> 'field', p_known);
    v_out := jsonb_set(v_out, '{field}', to_jsonb(v_key));
    v_seen := array[v_key];
    if p_value ? 'then' and jsonb_typeof(p_value -> 'then') <> 'null' then
      if jsonb_typeof(p_value -> 'then') <> 'array' then
        raise exception 'Sub-groups are a list of {field}.' using errcode = '22023', hint = 'Nothing was written.';
      end if;
      v_lv := 1 + jsonb_array_length(p_value -> 'then');
      if v_lv > 3 then
        raise exception 'A view groups at most three levels deep, and % were asked.', v_lv
          using errcode = '22023', hint = 'Past the third level every section holds one or two records. Nothing was written.';
      end if;
      v_item := '[]'::jsonb;
      for v_sub in select t.x from jsonb_array_elements(p_value -> 'then') as t(x) loop
        if jsonb_typeof(v_sub.x) <> 'object' then
          raise exception 'A sub-group is {field, order}.' using errcode = '22023', hint = 'Nothing was written.';
        end if;
        v_key := custom._view_field_key(p_organization_id, p_table_id, 'presentation.grouping.then', 'field', v_sub.x -> 'field', p_known);
        if v_key = any (v_seen) then
          raise exception 'The grouping uses % at two levels; each level is its own field.', v_key
            using errcode = '22023', hint = 'Nothing was written.';
        end if;
        v_seen := v_seen || v_key;
        v_item := v_item || jsonb_build_array(jsonb_set(v_sub.x, '{field}', to_jsonb(v_key)));
      end loop;
      v_out := jsonb_set(v_out, '{then}', v_item);
    end if;
    if p_value ? 'collapsed' and jsonb_typeof(p_value -> 'collapsed') <> 'null' then
      if jsonb_typeof(p_value -> 'collapsed') <> 'array'
         or exists (select 1 from jsonb_array_elements(p_value -> 'collapsed') x where jsonb_typeof(x) <> 'string') then
        raise exception 'The sections kept shut are a list of section keys.' using errcode = '22023', hint = 'Nothing was written.';
      end if;
      if jsonb_array_length(p_value -> 'collapsed') > 1000 then
        raise exception 'A view keeps at most 1000 sections shut.' using errcode = '22023', hint = 'Nothing was written.';
      end if;
    end if;
    if p_value ? 'aggregates' and jsonb_typeof(p_value -> 'aggregates') not in ('object', 'null') then
      raise exception 'Section subtotals are one per Field key.' using errcode = '22023', hint = 'Nothing was written.';
    end if;
    return v_out;

  elsif p_shape = 'presentation' then
    if jsonb_typeof(p_value) <> 'object' then
      raise exception 'How a view looks is a set of choices, and what was sent is a %.', jsonb_typeof(p_value)
        using errcode = '22023', hint = 'Nothing was written.';
    end if;
    v_out := '{}'::jsonb;
    for v_sub in select key, value from jsonb_each(p_value) loop
      if jsonb_typeof(v_sub.value) = 'null' then
        continue;
      end if;
      select * into v_reg from custom.view_keys() k where k.path = 'presentation.' || v_sub.key;
      if v_reg.path is null then
        raise exception 'How a view looks has no choice called "%", so no screen would ever honour it.', v_sub.key
          using errcode = '22023',
                hint = format('The choices are %s (custom.view_keys()). Nothing was written.',
                              (select string_agg(substr(k.path, 14), ', ' order by k.path)
                                 from custom.view_keys() k where k.path like 'presentation.%'));
      end if;
      v_out := v_out || jsonb_build_object(v_sub.key,
                 custom._view_key_value(p_organization_id, p_table_id, v_reg.path, v_reg.shape, v_sub.value,
                                        case when jsonb_typeof(p_old) = 'object' then p_old -> v_sub.key end));
    end loop;
    return v_out;

  elsif p_shape = 'grid' then
    return custom.grid_layout_check(p_value, 'view');

  elsif p_shape = 'rule' then
    -- S2-PRIME's shape: a Rule expression, compiled by the one fragment every read door asks, so a
    -- question the board could not ask is refused when it is saved, never when the board opens.
    if not custom.filter_is_rule(p_value) then
      raise exception 'A view''s question (where) is a Rule expression {op, args}, and what was sent is not one.'
        using errcode = '22023', hint = 'The flat Field-to-value map is `filters`. Nothing was written.';
    end if;
    perform custom.record_filter_sql(p_organization_id, p_table_id, p_value);
    return p_value;

  elsif p_shape = 'input' then
    -- A list of ids has already been rewritten by the door (hidden_fields → presentation.hiddenFields);
    -- reaching here means it was not a list.
    raise exception '% is a list of Field ids.', p_path using errcode = '22023', hint = 'Nothing was written.';
  end if;

  raise exception 'The view key % has shape %, which the guard does not know.', p_path, p_shape
    using errcode = 'XX000', hint = 'custom.view_keys() and custom._view_key_value disagree; fix the registry.';
end;
$function$;

