-- target: branch,production
-- additive: yes
-- ADDITIVE + SIX BODIES REPLACED: Notion's formula 2.0 list functions work in the store. A formula can walk a list
--   (a relation column's linked records, a many-choice column, a roll-up, a split text): MAP, FILTER, FIND, SOME, EVERY,
--   LENGTH, AT, FIRST, LAST, SORT (with a CURRENT1()/CURRENT2() comparison), UNIQUE, REVERSE, SLICE, JOIN, SPLIT, INCLUDES,
--   with CURRENT() / INDEX() naming the item and RECPROP(record, "Column") reading a column of a linked record, so
--   prop("Tasks").filter(current.prop("Done")).length() is the store's LENGTH(FILTER({Tasks}, RECPROP(CURRENT(), "Done"))).
--   SUM / MIN / MAX / AVERAGE (and new MEDIAN) take a list as all its values; REGEXREPLACE carries Notion's replace /
--   replaceAll (a pattern); DATEADD gains hours and minutes, DATEDIFF gains seconds, months and years. The ONE translator
--   (custom.formula_translate_notion) now also carries let / lets, mean / median, current / index and the list functions.
--   Adds: custom._fx_itemkey, _fx_item_text, _fx_list, _fx_recprop, _fx_listop (internal, no grant).
--   Replaces: custom.formula_node_kinds (rows added), formula_eval (list dispatch, list-aware SUM family, REGEXREPLACE,
--   date units), formula_compile_sql (a formula with a list function is not planned: NULL keeps the per-row path),
--   _nfx_call, _nfx_primary, _nfx_colkind (translator). Every text that did not use a new word answers as before.
--   Locks: pg_proc rows. Nothing stored is rewritten.
--   Inverse: migrations/inverse/formula2_a_notion_list_functions_let_and_more_date_units_down.sql
-- guard: custom/system_enabled
-- lock: custom
-- lane: FORMULA-2
-- based-on: custom.formula_eval(uuid, jsonb, jsonb, jsonb) 82e5d12a653ff5cbf96a34b58a1d2ae43d15eac36051ead2c3fd68b34ffe763b
-- based-on: custom.formula_node_kinds() 167dae64dd5fb2ad275f1851e6da2f98419c89b8659eb26e16433f8cf997da8f
-- based-on: custom.formula_compile_sql(uuid, jsonb, text) b04dc35215bd627b656c30b01e17eae5f8ab0d0c35fc203d8ba3d0b5f73ad5ec
-- based-on: custom._nfx_call(text, jsonb, jsonb) 5550bf642ee9885ee45093c36f12911adbf874edb95f1122a27767debc93ce3f
-- based-on: custom._nfx_primary(jsonb, integer, jsonb) c5c1c49b15ece094c61aeaee08053426ff44ea7c22c8514782bad62271b7a50b
-- based-on: custom._nfx_colkind(text) 17b10d772806fae96ada9c3c118792d481c21441ae959f011278f36b51a21e95

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- LIST HELPERS (internal; no grant). A list is a jsonb array. A record a relation column points at is the item
-- {"__rec": "<record id>", "title": "<the words a person reads>"}; every other item is its own value.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function custom._fx_itemkey(p_x jsonb)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select case when jsonb_typeof(p_x) = 'object' and p_x ? '__rec' then coalesce(p_x -> 'title', 'null'::jsonb) else p_x end
$fn$;

comment on function custom._fx_itemkey(jsonb) is 'FORMULA-2: what a list item is compared and sorted by (a linked record by its title; anything else as it is). Internal.';

create function custom._fx_item_text(p_x jsonb)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select case when jsonb_typeof(p_x) = 'object' and p_x ? '__rec' then coalesce(p_x ->> 'title', '') else custom._fx_text(p_x) end
$fn$;

comment on function custom._fx_item_text(jsonb) is 'FORMULA-2: a list item as the words a person reads (a linked record is its title). Internal.';

-- A formula part read as a list. A relation column is its linked records (title + id); a many-choice column its labels; any
-- other column its stored items; anything else is worked out and read as a list (one value is a list of one).
create function custom._fx_list(p_organization_id uuid, p_node jsonb, p_values jsonb, p_context jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_a    jsonb;
  v_type text;
  v_fid  uuid;
  k_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if jsonb_typeof(p_node) = 'object' and p_node ? 'field' and not (p_node ? 'op') then
    v_fid := (p_node ->> 'field')::uuid;
    v_a := custom.rule_eval(p_organization_id, p_node, p_values, coalesce(p_context, '{}'::jsonb));
    select f.data ->> 'type' into v_type
      from custom.record f
     where f.organization_id = p_organization_id and f.id = v_fid and f.table_id = custom.field_kernel_id();
    if v_a is null or jsonb_typeof(v_a) = 'null' then
      return '[]'::jsonb;
    end if;
    if jsonb_typeof(v_a) <> 'array' then
      v_a := jsonb_build_array(v_a);
    end if;
    if v_type = 'relation' then
      return coalesce((
        select jsonb_agg(jsonb_build_object(
                 '__rec', case when coalesce(case when jsonb_typeof(u.x) = 'object' then u.x ->> 'id' else u.x #>> '{}' end, '') ~ k_uuid
                               then case when jsonb_typeof(u.x) = 'object' then u.x ->> 'id' else u.x #>> '{}' end end,
                 'title', coalesce(custom.field_words(p_organization_id, v_fid, u.x),
                                   case when jsonb_typeof(u.x) = 'object' then u.x ->> 'id' else u.x #>> '{}' end))
                         order by u.i)
          from jsonb_array_elements(v_a) with ordinality u(x, i)
         where not custom._fx_blank(u.x)), '[]'::jsonb);
    elsif v_type = 'list' then
      return coalesce((
        select jsonb_agg(case when custom._fx_blank(u.x) then 'null'::jsonb
                              else to_jsonb(custom.field_words(p_organization_id, v_fid, u.x)) end order by u.i)
          from jsonb_array_elements(v_a) with ordinality u(x, i)), '[]'::jsonb);
    end if;
    return v_a;
  end if;
  v_a := custom.formula_eval(p_organization_id, p_node, p_values, coalesce(p_context, '{}'::jsonb));
  if v_a is null or jsonb_typeof(v_a) = 'null' then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(v_a) = 'string' and btrim(v_a #>> '{}') like '[%' then
    begin
      v_a := (v_a #>> '{}')::jsonb;
    exception when others then
      null;   -- text that only starts like a list is one value
    end;
  end if;
  if jsonb_typeof(v_a) <> 'array' then
    v_a := jsonb_build_array(v_a);
  end if;
  return v_a;
end
$fn$;

comment on function custom._fx_list(uuid, jsonb, jsonb, jsonb) is 'FORMULA-2: a formula part read as a list of items (a relation column is its linked records). Internal; part of the list functions.';

-- RECPROP(record, column): one column of a linked record, read the way a lookup reads it (far_value: a roll-up or formula
-- on that record is worked out, a circle is refused by sentence). The column is named by its label or its key.
create function custom._fx_recprop(p_organization_id uuid, p_rec jsonb, p_name text)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_id    text;
  v_table uuid;
  v_tf    text;
  v_rtype text;
  v_f     custom.record;
  v_val   jsonb;
  v_type  text;
  k_uuid  constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  v_id := case jsonb_typeof(p_rec) when 'object' then p_rec ->> '__rec' when 'string' then p_rec #>> '{}' else null end;
  if v_id is null or v_id !~ k_uuid then
    return 'null'::jsonb;   -- not a linked record: nothing to read, as a lookup of nothing is blank
  end if;
  select r.table_id, r.data into v_table, v_val
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_id::uuid
     and r.data_class = 'record' and r.deleted_at is null;
  if v_table is null then
    return 'null'::jsonb;
  end if;
  v_tf := custom.table_type_field(p_organization_id, v_table);
  if v_tf is not null then
    v_rtype := v_val ->> v_tf;
  end if;
  select a.* into v_f
    from custom.applicable_fields(p_organization_id, v_table, v_rtype) a
   where lower(a.data ->> 'key') = lower(btrim(p_name)) or lower(a.data ->> 'label') = lower(btrim(p_name))
   order by (lower(a.data ->> 'key') = lower(btrim(p_name))) desc
   limit 1;
  if v_f.id is null then
    raise exception 'RECPROP found no column called "%" on that record''s table.', p_name using errcode = '22023';
  end if;
  v_val := custom.far_value(p_organization_id, v_id::uuid, v_f.data ->> 'key',
                            jsonb_build_object('key', 'recprop', 'label', 'RECPROP'));
  if v_val is null or jsonb_typeof(v_val) = 'null' then
    return 'null'::jsonb;
  end if;
  v_type := v_f.data ->> 'type';
  if v_type = 'relation' then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
               '__rec', case when coalesce(case when jsonb_typeof(u.x) = 'object' then u.x ->> 'id' else u.x #>> '{}' end, '') ~ k_uuid
                             then case when jsonb_typeof(u.x) = 'object' then u.x ->> 'id' else u.x #>> '{}' end end,
               'title', coalesce(custom.field_words(p_organization_id, v_f.id, u.x),
                                 case when jsonb_typeof(u.x) = 'object' then u.x ->> 'id' else u.x #>> '{}' end))
                       order by u.i)
        from jsonb_array_elements(case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end)
             with ordinality u(x, i)
       where not custom._fx_blank(u.x)), '[]'::jsonb);
  elsif v_type = 'list' then
    return to_jsonb(custom.field_words(p_organization_id, v_f.id, v_val));
  end if;
  return v_val;
end
$fn$;

comment on function custom._fx_recprop(uuid, jsonb, text) is 'FORMULA-2: one column of a linked record, as a lookup reads it (current.prop("Done")). Internal.';

-- The list functions and the item words (CURRENT, INDEX, CURRENT1, CURRENT2). Only what is asked of an item is worked out:
-- the body of MAP / FILTER / FIND / SOME / EVERY / SORT runs once per item with that item as CURRENT().
create function custom._fx_listop(p_organization_id uuid, p_op text, p_args jsonb, p_values jsonb, p_context jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_n     integer := jsonb_array_length(p_args);
  v_items jsonb;
  v_it    jsonb;
  v_ctx   jsonb;
  v_r     jsonb;
  v_a     jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_i     integer;
  v_k     integer;
  v_x     numeric;
  v_y     numeric;
  v_s     text;
  v_t     text;
  v_type  text;
  v_arr   jsonb[];
  v_cmp   integer;
  c_max   constant integer := 2000;
begin
  -- ── the words of one item ─────────────────────────────────────────────────────────────────
  if p_op in ('fx.current', 'fx.index', 'fx.current1', 'fx.current2') then
    v_s := case p_op when 'fx.current' then 'fx_current' when 'fx.index' then 'fx_index'
                     when 'fx.current1' then 'fx_current1' else 'fx_current2' end;
    if p_context is null or not (p_context ? v_s) then
      raise exception '`%` only means something inside MAP, FILTER, FIND, SOME, EVERY or SORT, which hand it one item of a list at a time.',
                      upper(substr(p_op, 4)) using errcode = '22023';
    end if;
    return coalesce(p_context -> v_s, 'null'::jsonb);
  elsif p_op = 'fx.recprop' then
    return custom._fx_recprop(p_organization_id,
             coalesce(custom.formula_eval(p_organization_id, p_args -> 0, p_values, p_context), 'null'::jsonb),
             custom._fx_text(custom.formula_eval(p_organization_id, p_args -> 1, p_values, p_context)));
  elsif p_op = 'fx.length' then
    -- A list column counts its items; a text counts its characters; a list counts its items.
    v_a := p_args -> 0;
    if jsonb_typeof(v_a) = 'object' and v_a ? 'field' and not (v_a ? 'op') then
      select f.data ->> 'type' into v_type
        from custom.record f
       where f.organization_id = p_organization_id and f.id = (v_a ->> 'field')::uuid and f.table_id = custom.field_kernel_id();
      if v_type in ('list', 'relation') then
        return to_jsonb(jsonb_array_length(custom._fx_list(p_organization_id, v_a, p_values, p_context)));
      end if;
      v_r := custom.rule_eval(p_organization_id, v_a, p_values, coalesce(p_context, '{}'::jsonb));
      if jsonb_typeof(v_r) = 'array' then
        return to_jsonb(jsonb_array_length(v_r));
      end if;
    end if;
    v_r := coalesce(custom.formula_eval(p_organization_id, v_a, p_values, p_context), 'null'::jsonb);
    if jsonb_typeof(v_r) = 'array' then
      return to_jsonb(jsonb_array_length(v_r));
    end if;
    return to_jsonb(char_length(custom._fx_text(v_r)));
  elsif p_op = 'fx.split' then
    v_s := custom._fx_text(custom.formula_eval(p_organization_id, p_args -> 0, p_values, p_context));
    v_t := custom._fx_text(custom.formula_eval(p_organization_id, p_args -> 1, p_values, p_context));
    if v_s = '' then
      return '[]'::jsonb;
    end if;
    return coalesce((select jsonb_agg(to_jsonb(u.x) order by u.i)
                       from unnest(case when v_t = '' then regexp_split_to_array(v_s, '') else string_to_array(v_s, v_t) end)
                            with ordinality u(x, i)), '[]'::jsonb);
  end if;

  -- ── everything below takes a list first ───────────────────────────────────────────────────
  v_items := custom._fx_list(p_organization_id, p_args -> 0, p_values, p_context);
  if jsonb_array_length(v_items) > c_max then
    raise exception 'A formula works through at most % items of a list, and this list has %.', c_max, jsonb_array_length(v_items)
      using errcode = '22023';
  end if;

  if p_op = 'fx.first' then
    return coalesce(v_items -> 0, 'null'::jsonb);
  elsif p_op = 'fx.last' then
    return coalesce(v_items -> -1, 'null'::jsonb);
  elsif p_op = 'fx.at' then
    v_x := trunc(custom._fx_num(custom.formula_eval(p_organization_id, p_args -> 1, p_values, p_context), '`AT`'));
    return coalesce(v_items -> v_x::integer, 'null'::jsonb);
  elsif p_op = 'fx.join' then
    v_s := case when v_n > 1 then custom._fx_text(custom.formula_eval(p_organization_id, p_args -> 1, p_values, p_context)) else ', ' end;
    return to_jsonb(coalesce((select string_agg(custom._fx_item_text(u.x), v_s order by u.i)
                                from jsonb_array_elements(v_items) with ordinality u(x, i)), ''));
  elsif p_op = 'fx.reverse' then
    return coalesce((select jsonb_agg(u.x order by u.i desc) from jsonb_array_elements(v_items) with ordinality u(x, i)), '[]'::jsonb);
  elsif p_op = 'fx.slice' then
    v_x := trunc(custom._fx_num(custom.formula_eval(p_organization_id, p_args -> 1, p_values, p_context), '`SLICE`'));
    v_y := case when v_n > 2 then trunc(custom._fx_num(custom.formula_eval(p_organization_id, p_args -> 2, p_values, p_context), '`SLICE`'))
                else jsonb_array_length(v_items) end;
    v_k := jsonb_array_length(v_items);
    if v_x < 0 then v_x := greatest(v_k + v_x, 0); end if;
    if v_y < 0 then v_y := greatest(v_k + v_y, 0); end if;
    return coalesce((select jsonb_agg(u.x order by u.i) from jsonb_array_elements(v_items) with ordinality u(x, i)
                      where u.i - 1 >= v_x and u.i - 1 < v_y), '[]'::jsonb);
  elsif p_op = 'fx.unique' then
    return coalesce((select jsonb_agg(d.x order by d.i)
                       from (select distinct on (k) u.x, u.i
                               from (select u0.x, u0.i,
                                            case when jsonb_typeof(u0.x) = 'object' and u0.x ? '__rec' then u0.x ->> '__rec' else u0.x::text end as k
                                       from jsonb_array_elements(v_items) with ordinality u0(x, i)) u
                              order by k, u.i) d), '[]'::jsonb);
  elsif p_op = 'fx.includes' then
    v_a := custom._fx_itemkey(coalesce(custom.formula_eval(p_organization_id, p_args -> 1, p_values, p_context), 'null'::jsonb));
    for v_it in select e from jsonb_array_elements(v_items) e loop
      if custom._fx_cmp(custom._fx_itemkey(v_it), v_a) = 0 then
        return 'true'::jsonb;
      end if;
    end loop;
    return 'false'::jsonb;
  elsif p_op = 'fx.sort' then
    select array_agg(u.x order by u.i) into v_arr from jsonb_array_elements(v_items) with ordinality u(x, i);
    if v_arr is null then
      return '[]'::jsonb;
    end if;
    -- an insertion sort: lists here are short (the ceiling above), and a comparator is a formula, not a SQL operator.
    for v_i in 2 .. cardinality(v_arr) loop
      v_a := v_arr[v_i];
      v_k := v_i - 1;
      while v_k >= 1 loop
        if v_n > 1 then
          v_ctx := coalesce(p_context, '{}'::jsonb) || jsonb_build_object('fx_current1', v_arr[v_k], 'fx_current2', v_a);
          v_cmp := sign(custom._fx_num(coalesce(custom.formula_eval(p_organization_id, p_args -> 1, p_values, v_ctx), 'null'::jsonb), '`SORT`'))::integer;
        else
          v_cmp := custom._fx_cmp(custom._fx_itemkey(v_arr[v_k]), custom._fx_itemkey(v_a));
        end if;
        exit when v_cmp <= 0;
        v_arr[v_k + 1] := v_arr[v_k];
        v_k := v_k - 1;
      end loop;
      v_arr[v_k + 1] := v_a;
    end loop;
    return to_jsonb(v_arr);
  end if;

  -- ── the body runs once per item ─────────────────────────────────────────────────────────────
  v_i := 0;
  for v_it in select e from jsonb_array_elements(v_items) with ordinality u(e, i) order by u.i loop
    v_ctx := coalesce(p_context, '{}'::jsonb) || jsonb_build_object('fx_current', v_it, 'fx_index', v_i);
    v_r := coalesce(custom.formula_eval(p_organization_id, p_args -> 1, p_values, v_ctx), 'null'::jsonb);
    if p_op = 'fx.map' then
      v_out := v_out || jsonb_build_array(v_r);
    elsif p_op = 'fx.filter' then
      if custom._fx_truthy(v_r) then v_out := v_out || jsonb_build_array(v_it); end if;
    elsif p_op = 'fx.findfirst' then
      if custom._fx_truthy(v_r) then return v_it; end if;
    elsif p_op = 'fx.some' then
      if custom._fx_truthy(v_r) then return 'true'::jsonb; end if;
    elsif p_op = 'fx.every' then
      if not custom._fx_truthy(v_r) then return 'false'::jsonb; end if;
    end if;
    v_i := v_i + 1;
  end loop;
  return case p_op when 'fx.map' then v_out when 'fx.filter' then v_out
                   when 'fx.some' then 'false'::jsonb when 'fx.every' then 'true'::jsonb
                   else 'null'::jsonb end;
end
$fn$;

comment on function custom._fx_listop(uuid, text, jsonb, jsonb, jsonb) is 'FORMULA-2: the list functions of the formula language (MAP, FILTER, FIND, SOME, EVERY, LENGTH, AT, FIRST, LAST, SORT, UNIQUE, REVERSE, SLICE, JOIN, SPLIT, INCLUDES, RECPROP, CURRENT, INDEX). Internal; custom.formula_eval hands them here.';

-- ───── replaced bodies ─────

CREATE OR REPLACE FUNCTION custom.formula_node_kinds()
 RETURNS TABLE(node text, min_args integer, max_args integer, result text, signature text, says text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- The older grid's FUNCTION_SPECS (features/data-tables/formulas.ts), and its operators,
  -- as the store's `fx.*` nodes. max_args null = any number.
  select * from (values
    ('fx.sum',         1, null::integer, 'number',  'SUM(number, …)',                  'Adds every value, ignoring empty ones.'),
    ('fx.min',         1, null, 'number',  'MIN(number, …)',                  'The smallest value, ignoring empty ones.'),
    ('fx.max',         1, null, 'number',  'MAX(number, …)',                  'The largest value, ignoring empty ones.'),
    ('fx.average',     1, null, 'number',  'AVERAGE(number, …)',              'The average of the values that are filled in. Empty values are not counted.'),
    ('fx.round',       1, 2,    'number',  'ROUND(number, places?)',          'Rounds to the given number of decimal places (0 when omitted). Halves round away from zero.'),
    ('fx.abs',         1, 1,    'number',  'ABS(number)',                     'The value without its minus sign.'),
    ('fx.len',         1, 1,    'number',  'LEN(text)',                       'How many characters the text has.'),
    ('fx.upper',       1, 1,    'text',    'UPPER(text)',                     'The text in capitals.'),
    ('fx.lower',       1, 1,    'text',    'LOWER(text)',                     'The text in lower case.'),
    ('fx.trim',        1, 1,    'text',    'TRIM(text)',                      'The text without leading or trailing spaces.'),
    ('fx.concatenate', 1, null, 'text',    'CONCATENATE(text, …)',            'Joins every value into one piece of text. The & operator is the same join.'),
    ('fx.left',        2, 2,    'text',    'LEFT(text, count)',               'The first few characters of the text.'),
    ('fx.right',       2, 2,    'text',    'RIGHT(text, count)',              'The last few characters of the text.'),
    ('fx.contains',    2, 2,    'boolean', 'CONTAINS(text, part)',            'Yes when the text contains that part. Upper and lower case are treated the same.'),
    ('fx.if',          2, 3,    'unknown', 'IF(condition, then, otherwise?)', 'The second value when the condition holds, otherwise the third (empty when omitted).'),
    ('fx.and',         1, null, 'boolean', 'AND(condition, …)',               'Yes when every condition holds.'),
    ('fx.or',          1, null, 'boolean', 'OR(condition, …)',                'Yes when at least one condition holds.'),
    ('fx.not',         1, 1,    'boolean', 'NOT(condition)',                  'Turns yes into no and no into yes.'),
    ('fx.blank',       0, 0,    'unknown', 'BLANK()',                         'An empty value, for comparing against or returning.'),
    ('fx.isblank',     1, 1,    'boolean', 'ISBLANK(value)',                  'Yes when the value is empty.'),
    ('fx.today',       0, 0,    'date',    'TODAY()',                         'Today''s date.'),
    ('fx.now',         0, 0,    'date',    'NOW()',                           'The current date and time.'),
    ('fx.datediff',    3, 3,    'number',  'DATEDIFF(from, to, ''days'' | ''hours'' | ''minutes'' | ''seconds'' | ''months'' | ''years'')', 'How far the second date is after the first. Negative when it is earlier.'),
    ('fx.year',        1, 1,    'number',  'YEAR(date)',                      'The four-digit year of the date.'),
    ('fx.month',       1, 1,    'number',  'MONTH(date)',                     'The month of the date, 1 to 12.'),
    ('fx.day',         1, 1,    'number',  'DAY(date)',                       'The day of the month, 1 to 31.'),
    ('fx.dateadd',     3, 3,    'date',    'DATEADD(date, count, ''days'' | ''hours'' | ''minutes'' | ''months'' | ''years'')', 'The date moved forward by that many units. Use a negative count to go back.'),
    -- VIEWS-AND-FIELDS F4: seven of Airtable's functions, in Airtable's argument order
    ('fx.switch',      2, null, 'unknown', 'SWITCH(value, match, result, …, otherwise?)', 'The result beside the first match for the value, else the last value.'),
    ('fx.find',        2, 3,    'number',  'FIND(part, text, start?)',        'Where the part first appears, counting from 1, or 0; a start skips that many characters.'),
    ('fx.substitute',  3, 4,    'text',    'SUBSTITUTE(text, old, new, which?)', 'The text with every old part replaced, or only the numbered one.'),
    ('fx.regex_match', 2, 2,    'boolean', 'REGEX_MATCH(text, pattern)',      'Yes when the text matches the pattern.'),
    ('fx.datetime_format', 1, 2, 'text',   'DATETIME_FORMAT(date, format?)', 'The date written in the format given, such as ''MMM D, YYYY'', in UTC.'),
    ('fx.workday',     2, 3,    'date',    'WORKDAY(start, days, holidays?)', 'The date that many working days on, skipping weekends and the holidays listed.'),
    ('fx.arrayjoin',   1, 2,    'text',    'ARRAYJOIN(values, separator?)',   'Every value of a list as one piece of text, ", " between them unless told.'),
    ('fx.arraycompact', 1, 1,   'unknown', 'ARRAYCOMPACT(values)',            'The list without its empty values.'),
    -- FORMULA-2: lists, and the words of one item of a list
    ('fx.current',     0, 0,    'unknown', 'CURRENT()',                    'The list item a MAP, FILTER, FIND, SOME, EVERY or SORT is working on.'),
    ('fx.index',       0, 0,    'number',  'INDEX()',                      'The place of that item in its list, counting from 0.'),
    ('fx.current1',    0, 0,    'unknown', 'CURRENT1()',                   'The first of the two items a SORT comparator is comparing.'),
    ('fx.current2',    0, 0,    'unknown', 'CURRENT2()',                   'The second of the two items a SORT comparator is comparing.'),
    ('fx.recprop',     2, 2,    'unknown', 'RECPROP(record, column)',      'One column of a linked record, by its label: RECPROP(CURRENT(), "Done").'),
    ('fx.map',         2, 2,    'unknown', 'MAP(list, each)',              'A list of what the second value works out to for every item of the list.'),
    ('fx.filter',      2, 2,    'unknown', 'FILTER(list, keep)',           'The items of the list for which the second value holds.'),
    ('fx.findfirst',   2, 2,    'unknown', 'FINDFIRST(list, test)',        'The first item of the list for which the test holds, else empty.'),
    ('fx.some',        2, 2,    'boolean', 'SOME(list, test)',             'Yes when the test holds for at least one item.'),
    ('fx.every',       2, 2,    'boolean', 'EVERY(list, test)',            'Yes when the test holds for every item (an empty list holds).'),
    ('fx.length',      1, 1,    'number',  'LENGTH(list or text)',         'How many items a list has, or how many characters a text has.'),
    ('fx.at',          2, 2,    'unknown', 'AT(list, place)',              'The item at that place, counting from 0 (a negative place counts from the end).'),
    ('fx.first',       1, 1,    'unknown', 'FIRST(list)',                  'The first item of the list.'),
    ('fx.last',        1, 1,    'unknown', 'LAST(list)',                   'The last item of the list.'),
    ('fx.sort',        1, 2,    'unknown', 'SORT(list, compare?)',         'The list in order. A comparison written with CURRENT1() and CURRENT2() sets the order.'),
    ('fx.unique',      1, 1,    'unknown', 'UNIQUE(list)',                 'The list with each item once.'),
    ('fx.reverse',     1, 1,    'unknown', 'REVERSE(list)',                'The list backwards.'),
    ('fx.slice',       2, 3,    'unknown', 'SLICE(list, from, to?)',       'The items from one place up to, not including, another (counting from 0).'),
    ('fx.join',        1, 2,    'text',    'JOIN(list, separator?)',       'Every item of the list as one piece of text, ", " between them unless told.'),
    ('fx.split',       2, 2,    'unknown', 'SPLIT(text, separator)',       'The text cut into a list at every separator.'),
    ('fx.includes',    2, 2,    'boolean', 'INCLUDES(list, value)',        'Yes when the list has that value as one of its items.'),
    ('fx.median',      1, null, 'number',  'MEDIAN(number, …)',            'The middle value, ignoring empty ones. A list counts as all its values.'),
    ('fx.regexreplace', 3, 4,   'text',    'REGEXREPLACE(text, pattern, new, all?)', 'The text with the first match of the pattern replaced, or every match when all is yes.'),
    -- the operators
    ('fx.add',         2, 2,    'number',  'a + b',  'A sum. An empty value counts as 0.'),
    ('fx.sub',         2, 2,    'number',  'a - b',  'A difference. An empty value counts as 0.'),
    ('fx.mul',         2, 2,    'number',  'a * b',  'A product. An empty value counts as 0.'),
    ('fx.div',         2, 2,    'number',  'a / b',  'A quotient. Dividing by zero is refused by name.'),
    ('fx.mod',         2, 2,    'number',  'a % b',  'What is left over after dividing. Dividing by zero is refused by name.'),
    ('fx.neg',         1, 1,    'number',  '-a',     'The value with its sign turned over.'),
    ('fx.eq',          2, 2,    'boolean', 'a = b',  'The same. Numbers compare as numbers, anything else as text; an empty value matches 0 and "".'),
    ('fx.ne',          2, 2,    'boolean', 'a != b', 'Not the same (also written <>).'),
    ('fx.lt',          2, 2,    'boolean', 'a < b',  'Less than.'),
    ('fx.lte',         2, 2,    'boolean', 'a <= b', 'At most.'),
    ('fx.gt',          2, 2,    'boolean', 'a > b',  'Greater than.'),
    ('fx.gte',         2, 2,    'boolean', 'a >= b', 'At least.'),
    -- the store's own column kinds (G5): a formula Field with a system expression
    ('fx.autonumber',  0, 0,    'number',  'AUTONUMBER()',    'The record''s number in this table: assigned once, when the record is first written, never reused.'),
    ('fx.created_time',0, 0,    'date',    'CREATED_TIME()',  'When the record was created.'),
    ('fx.modified_time',0, 0,   'date',    'MODIFIED_TIME()', 'When the record was last changed.')
  ) as t(node, min_args, max_args, result, signature, says)
$function$;

CREATE OR REPLACE FUNCTION custom.formula_eval(p_organization_id uuid, p_expr jsonb, p_values jsonb, p_context jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_op    text;
  v_args  jsonb;
  v_n     integer;
  v_spec  record;
  v_vals  jsonb[] := '{}';
  v_one   jsonb;
  v_a     jsonb;
  v_b     jsonb;
  v_x     numeric;
  v_y     numeric;
  v_nums  numeric[] := '{}';
  v_s     text;
  v_t     text;
  v_d1    record;
  v_d2    record;
  v_u     text;
  v_type  text;
  v_ts    timestamp;
  v_i     integer;
  v_k     integer;
  v_p     integer;
  v_el    jsonb;
begin
  if p_expr is null or jsonb_typeof(p_expr) <> 'object' then
    return custom.rule_eval(p_organization_id, p_expr, p_values, coalesce(p_context, '{}'::jsonb));
  end if;

  -- ── A COLUMN. What the older grid's `displayValueOf` seam did: a choice or a relation is
  -- the WORDS a person reads (so `{Status} = "No-show"` compares the label), everything else
  -- is its stored value; a list or an object reads as its JSON (normalizeCell).
  if p_expr ? 'field' and not (p_expr ? 'op') then
    v_a := custom.rule_eval(p_organization_id, p_expr, p_values, coalesce(p_context, '{}'::jsonb));
    if v_a is null or jsonb_typeof(v_a) = 'null' then
      return 'null'::jsonb;
    end if;
    select f.data ->> 'type' into v_type
      from custom.record f
     where f.organization_id = p_organization_id and f.id = (p_expr ->> 'field')::uuid
       and f.table_id = custom.field_kernel_id();
    if v_type in ('list', 'relation') then
      return to_jsonb(custom.field_words(p_organization_id, (p_expr ->> 'field')::uuid, v_a));
    end if;
    if jsonb_typeof(v_a) in ('array', 'object') then
      return to_jsonb(v_a::text);
    end if;
    return v_a;
  end if;

  v_op := p_expr ->> 'op';
  if v_op is null or left(v_op, 3) <> 'fx.' then
    -- Every node that is not the formula language's own is a Rule node, answered by the
    -- Rules' evaluator, unchanged — so every formula written before today answers the same.
    return custom.rule_eval(p_organization_id, p_expr, p_values, coalesce(p_context, '{}'::jsonb));
  end if;

  select * into v_spec from custom.formula_node_kinds() k where k.node = v_op;
  if v_spec.node is null then
    raise exception 'This formula asks for %, and the formula language has no such function.', v_op
      using errcode = '22023', hint = 'select node, signature from custom.formula_node_kinds() is the whole list.';
  end if;
  v_args := coalesce(p_expr -> 'args', '[]'::jsonb);
  if jsonb_typeof(v_args) <> 'array' then
    raise exception '`%` was given something that is not a list of values.', v_spec.signature using errcode = '22023';
  end if;
  v_n := jsonb_array_length(v_args);
  if v_n < v_spec.min_args or (v_spec.max_args is not null and v_n > v_spec.max_args) then
    raise exception '`%` was given % value%. Use %.', upper(substr(v_op, 4)), v_n,
                    case when v_n = 1 then '' else 's' end, v_spec.signature
      using errcode = '22023';
  end if;

  -- ── short-circuit: IF, AND, OR ──────────────────────────────────────────────────────────
  if v_op = 'fx.if' then
    if custom._fx_truthy(custom.formula_eval(p_organization_id, v_args -> 0, p_values, p_context)) then
      return custom.formula_eval(p_organization_id, v_args -> 1, p_values, p_context);
    end if;
    if v_n > 2 then
      return custom.formula_eval(p_organization_id, v_args -> 2, p_values, p_context);
    end if;
    return 'null'::jsonb;
  elsif v_op = 'fx.and' then
    for v_one in select e from jsonb_array_elements(v_args) e loop
      if not custom._fx_truthy(custom.formula_eval(p_organization_id, v_one, p_values, p_context)) then
        return 'false'::jsonb;
      end if;
    end loop;
    return 'true'::jsonb;
  elsif v_op = 'fx.or' then
    for v_one in select e from jsonb_array_elements(v_args) e loop
      if custom._fx_truthy(custom.formula_eval(p_organization_id, v_one, p_values, p_context)) then
        return 'true'::jsonb;
      end if;
    end loop;
    return 'false'::jsonb;
  elsif v_op = 'fx.switch' then
    -- SWITCH(value, match, result, …, otherwise?) — Airtable's order. Only the value, the
    -- matches up to the first that holds, and that one result are worked out; a match compares
    -- exactly as `=` does (numbers as numbers, an empty value matches BLANK()).
    v_a := coalesce(custom.formula_eval(p_organization_id, v_args -> 0, p_values, p_context), 'null'::jsonb);
    v_i := 1;
    while v_i + 1 < v_n loop
      if custom._fx_cmp(v_a, coalesce(custom.formula_eval(p_organization_id, v_args -> v_i, p_values, p_context),
                                      'null'::jsonb)) = 0 then
        return custom.formula_eval(p_organization_id, v_args -> (v_i + 1), p_values, p_context);
      end if;
      v_i := v_i + 2;
    end loop;
    if v_i < v_n then
      return custom.formula_eval(p_organization_id, v_args -> v_i, p_values, p_context);
    end if;
    return 'null'::jsonb;
  elsif v_op = 'fx.arrayjoin' then
    -- ARRAYJOIN(values, separator?) reads a COLUMN's stored list, not its words joined already:
    -- a many-choice column is each choice's own label, a link each record's own title. An empty
    -- item stays, as an empty piece between two separators — Airtable leaves removing them to
    -- ARRAYCOMPACT.
    v_s := case when v_n > 1
                then custom._fx_text(custom.formula_eval(p_organization_id, v_args -> 1, p_values, p_context))
                else ', ' end;
    v_a := custom._fx_items(p_organization_id, v_args -> 0, p_values, p_context);
    return to_jsonb(coalesce((select string_agg(custom._fx_text(u.x), v_s order by u.i)
                                from jsonb_array_elements(v_a) with ordinality u(x, i)), ''));
  elsif v_op = 'fx.arraycompact' then
    -- ARRAYCOMPACT(values): the list without empty items (null and ""). false, 0 and text of
    -- spaces stay, as in Airtable.
    v_a := custom._fx_items(p_organization_id, v_args -> 0, p_values, p_context);
    return coalesce((select jsonb_agg(u.x order by u.i)
                       from jsonb_array_elements(v_a) with ordinality u(x, i)
                      where not custom._fx_blank(u.x)), '[]'::jsonb);
  end if;

  -- ── FORMULA-2: the list functions and the item words ─────────────────────────────────────
  if v_op in ('fx.current', 'fx.index', 'fx.current1', 'fx.current2', 'fx.recprop', 'fx.map', 'fx.filter', 'fx.findfirst',
              'fx.some', 'fx.every', 'fx.length', 'fx.at', 'fx.first', 'fx.last', 'fx.sort', 'fx.unique', 'fx.reverse',
              'fx.slice', 'fx.join', 'fx.split', 'fx.includes') then
    return custom._fx_listop(p_organization_id, v_op, v_args, p_values, coalesce(p_context, '{}'::jsonb));
  end if;

  -- ── the store's own kinds ───────────────────────────────────────────────────────────────
  if v_op = 'fx.autonumber' then
    return to_jsonb(custom._fx_autonumber(p_organization_id,
             nullif(p_context ->> 'fx_table_id', '')::uuid,
             nullif(p_context ->> 'fx_field_key', ''),
             nullif(p_context ->> 'fx_self_id', '')::uuid));
  elsif v_op in ('fx.created_time', 'fx.modified_time') then
    select case when v_op = 'fx.created_time' then r.created_at else r.updated_at end into v_ts
      from custom.record r
     where r.organization_id = p_organization_id
       and r.id = nullif(p_context ->> 'fx_self_id', '')::uuid;
    if v_ts is null then
      return 'null'::jsonb;   -- a reader that has no record yet leaves it blank, never invents one
    end if;
    return to_jsonb(to_char((v_ts::timestamptz) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  elsif v_op = 'fx.blank' then
    return 'null'::jsonb;
  elsif v_op = 'fx.today' then
    return to_jsonb(to_char(now() at time zone custom.day_zone(p_organization_id), 'YYYY-MM-DD'));
  elsif v_op = 'fx.now' then
    return to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;

  -- ── everything else evaluates every argument first ─────────────────────────────────────
  for v_one in select e from jsonb_array_elements(v_args) e loop
    v_vals := v_vals || coalesce(custom.formula_eval(p_organization_id, v_one, p_values, p_context), 'null'::jsonb);
  end loop;
  v_a := case when v_n >= 1 then v_vals[1] end;
  v_b := case when v_n >= 2 then v_vals[2] end;

  case v_op
    when 'fx.sum', 'fx.min', 'fx.max', 'fx.average', 'fx.median' then
      -- a list given as a value counts as all its values (SUM over a roll-up, MAP(...) and the like).
      foreach v_one in array v_vals loop
        if jsonb_typeof(v_one) = 'array' then
          for v_el in select e from jsonb_array_elements(v_one) e loop
            if not custom._fx_blank(v_el) then
              v_nums := v_nums || custom._fx_num(v_el, format('`%s`', upper(substr(v_op, 4))));
            end if;
          end loop;
        elsif not custom._fx_blank(v_one) then
          v_nums := v_nums || custom._fx_num(v_one, format('`%s`', upper(substr(v_op, 4))));
        end if;
      end loop;
      if v_op = 'fx.sum' then
        return to_jsonb(coalesce((select sum(x) from unnest(v_nums) x), 0));
      end if;
      if cardinality(v_nums) = 0 then return 'null'::jsonb; end if;
      if v_op = 'fx.median' then
        return to_jsonb(trim_scale((select avg(q.x) from (select x, row_number() over (order by x) rn, count(*) over () c
                                                            from unnest(v_nums) x) q
                                     where q.rn in ((q.c + 1) / 2, (q.c + 2) / 2))));
      end if;
      if v_op = 'fx.min' then return to_jsonb((select min(x) from unnest(v_nums) x)); end if;
      if v_op = 'fx.max' then return to_jsonb((select max(x) from unnest(v_nums) x)); end if;
      return to_jsonb(trim_scale((select sum(x) from unnest(v_nums) x) / cardinality(v_nums)));
    when 'fx.round' then
      v_x := custom._fx_num(v_a, '`ROUND`');
      v_y := case when v_n > 1 then trunc(custom._fx_num(v_b, '`ROUND`')) else 0 end;
      -- numeric round() rounds halves away from zero, which is the older grid's rule.
      return to_jsonb(round(v_x, v_y::integer));
    when 'fx.abs' then
      return to_jsonb(abs(custom._fx_num(v_a, '`ABS`')));
    when 'fx.len' then
      return to_jsonb(char_length(custom._fx_text(v_a)));
    when 'fx.upper' then
      return to_jsonb(upper(custom._fx_text(v_a)));
    when 'fx.lower' then
      return to_jsonb(lower(custom._fx_text(v_a)));
    when 'fx.trim' then
      return to_jsonb(regexp_replace(custom._fx_text(v_a), '^\s+|\s+$', '', 'g'));
    when 'fx.concatenate' then
      return to_jsonb((select string_agg(custom._fx_text(x), '' order by i)
                         from unnest(v_vals) with ordinality u(x, i)));
    when 'fx.left' then
      v_x := trunc(custom._fx_num(v_b, '`LEFT`'));
      return to_jsonb(left(custom._fx_text(v_a), greatest(0, v_x)::integer));
    when 'fx.right' then
      v_x := trunc(custom._fx_num(v_b, '`RIGHT`'));
      if v_x <= 0 then return '""'::jsonb; end if;
      return to_jsonb(right(custom._fx_text(v_a), v_x::integer));
    when 'fx.contains' then
      return to_jsonb(strpos(lower(custom._fx_text(v_a)), lower(custom._fx_text(v_b))) > 0);
    when 'fx.not' then
      return to_jsonb(not custom._fx_truthy(v_a));
    when 'fx.isblank' then
      return to_jsonb(custom._fx_blank(v_a));
    when 'fx.datediff' then
      select * into v_d1 from custom._fx_date(v_a, '`DATEDIFF`');
      select * into v_d2 from custom._fx_date(v_b, '`DATEDIFF`');
      v_u := custom._fx_unit(v_vals[3], array['days', 'hours', 'minutes', 'seconds', 'months', 'years'], 'DATEDIFF');
      if v_u in ('months', 'years') then
        -- whole calendar months (or years) from the first date to the second, toward zero.
        v_x := extract(year from age(v_d2.ts, v_d1.ts)) * 12 + extract(month from age(v_d2.ts, v_d1.ts));
        return to_jsonb(trunc(case v_u when 'years' then v_x / 12 else v_x end));
      end if;
      return to_jsonb(trunc(extract(epoch from (v_d2.ts - v_d1.ts))
                            / case v_u when 'days' then 86400 when 'hours' then 3600 when 'minutes' then 60 else 1 end));
    when 'fx.year' then
      select * into v_d1 from custom._fx_date(v_a, '`YEAR`');
      return to_jsonb(extract(year from v_d1.ts)::integer);
    when 'fx.month' then
      select * into v_d1 from custom._fx_date(v_a, '`MONTH`');
      return to_jsonb(extract(month from v_d1.ts)::integer);
    when 'fx.day' then
      select * into v_d1 from custom._fx_date(v_a, '`DAY`');
      return to_jsonb(extract(day from v_d1.ts)::integer);
    when 'fx.dateadd' then
      select * into v_d1 from custom._fx_date(v_a, '`DATEADD`');
      v_x := trunc(custom._fx_num(v_b, '`DATEADD`'));
      v_u := custom._fx_unit(v_vals[3], array['days', 'months', 'years', 'hours', 'minutes'], 'DATEADD');
      -- An interval of months clamps to the end of a shorter month, as the older grid does.
      v_ts := case v_u when 'days' then v_d1.ts + make_interval(days => v_x::integer)
                       when 'months' then v_d1.ts + make_interval(months => v_x::integer)
                       when 'hours' then v_d1.ts + make_interval(hours => v_x::integer)
                       when 'minutes' then v_d1.ts + make_interval(mins => v_x::integer)
                       else v_d1.ts + make_interval(years => v_x::integer) end;
      -- a date with no time of day stays one when moved by days, months or years; hours and minutes need a time.
      return to_jsonb(custom._fx_iso(v_ts, v_d1.date_only and v_u in ('days', 'months', 'years')));
    when 'fx.find' then
      -- FIND(part, text, start?): Airtable's startFromPosition, which defaults to 0, is
      -- JavaScript's indexOf start — the number of characters skipped before the search. The
      -- answer counts from 1, and 0 means the part is not there. Upper and lower case differ.
      v_s := custom._fx_text(v_a);
      v_t := custom._fx_text(v_b);
      v_x := case when v_n > 2 then greatest(trunc(custom._fx_num(v_vals[3], '`FIND`')), 0) else 0 end;
      v_x := least(v_x, char_length(v_t));
      if v_s = '' then
        return to_jsonb(v_x + 1);
      end if;
      v_k := strpos(substr(v_t, v_x::integer + 1), v_s);
      return to_jsonb(case when v_k = 0 then 0 else v_k + v_x::integer end);
    when 'fx.substitute' then
      -- SUBSTITUTE(text, old, new, which?): every `old` replaced, or only the which-th one.
      v_s := custom._fx_text(v_a);
      v_t := custom._fx_text(v_b);
      v_u := custom._fx_text(v_vals[3]);
      if v_t = '' then
        return to_jsonb(v_s);
      end if;
      if v_n < 4 then
        return to_jsonb(replace(v_s, v_t, v_u));
      end if;
      v_x := trunc(custom._fx_num(v_vals[4], '`SUBSTITUTE`'));
      if v_x < 1 then
        raise exception '`SUBSTITUTE` counts which one to replace from 1, but was given %.', custom._fx_num_text(v_x)
          using errcode = '22023';
      end if;
      v_i := 0;   -- characters already passed
      v_k := 0;   -- occurrences seen
      loop
        v_p := strpos(substr(v_s, v_i + 1), v_t);
        exit when v_p = 0;
        v_i := v_i + v_p;
        v_k := v_k + 1;
        if v_k = v_x then
          return to_jsonb(left(v_s, v_i - 1) || v_u || substr(v_s, v_i + char_length(v_t)));
        end if;
        v_i := v_i + char_length(v_t) - 1;
      end loop;
      return to_jsonb(v_s);
    when 'fx.regex_match' then
      -- REGEX_MATCH(text, pattern), read as RE2 reads it (custom._fx_regex). Postgres's `~`
      -- answers yes/no without tracking captures, so the classic runaway shapes ((a+)+,
      -- (\w+\s?)+) run in milliseconds and are accepted, as RE2 accepts them. A pattern the
      -- database cannot read, or one too complex to compile (both 2201B), or one that runs past
      -- the statement's time is said in a plain sentence; a timeout keeps its own sqlstate
      -- (57014) so custom.derived_value still re-raises it as a cancelled read, never an empty
      -- cell. This is the only handler in the evaluator.
      v_t := custom._fx_regex(custom._fx_text(v_b), 'REGEX_MATCH');
      begin
        return to_jsonb(custom._fx_text(v_a) ~ v_t);
      exception
        when invalid_regular_expression then
          if sqlerrm like '%too complex%' then
            raise exception '`REGEX_MATCH` cannot work out a pattern this complex: "%".', custom._fx_text(v_b)
              using errcode = '22023';
          end if;
          raise exception '`REGEX_MATCH` cannot read the pattern "%".', custom._fx_text(v_b)
            using errcode = '22023';
        when query_canceled then
          raise exception '`REGEX_MATCH` took too long on this text. Try a simpler pattern.'
            using errcode = '57014';
      end;
    when 'fx.regexreplace' then
      -- REGEXREPLACE(text, pattern, new, all?): the pattern is read as RE2 reads it (custom._fx_regex); $1 in the new
      -- text is the first group, as in a Notion formula.
      v_t := custom._fx_regex(custom._fx_text(v_b), 'REGEXREPLACE');
      begin
        return to_jsonb(regexp_replace(custom._fx_text(v_a), v_t,
                          regexp_replace(custom._fx_text(v_vals[3]), '\$([0-9])', '\\\1', 'g'),
                          case when v_n > 3 and custom._fx_truthy(v_vals[4]) then 'g' else '' end));
      exception
        when invalid_regular_expression then
          raise exception '`REGEXREPLACE` cannot read the pattern "%".', custom._fx_text(v_b) using errcode = '22023';
      end;
    when 'fx.datetime_format' then
      select * into v_d1 from custom._fx_date(v_a, '`DATETIME_FORMAT`');
      if v_n < 2 or btrim(custom._fx_text(v_b)) = '' then
        return to_jsonb(custom._fx_iso(v_d1.ts, v_d1.date_only));
      end if;
      return to_jsonb(custom._fx_datetime_format(v_d1.ts, custom._fx_text(v_b)));
    when 'fx.workday' then
      select * into v_d1 from custom._fx_date(v_a, '`WORKDAY`');
      v_x := trunc(custom._fx_num(v_b, '`WORKDAY`'));
      if abs(v_x) > 36500 then
        raise exception '`WORKDAY` moves at most 36500 working days, but was given %.', custom._fx_num_text(v_x)
          using errcode = '22023';
      end if;
      return to_jsonb(custom._fx_iso(
        custom._fx_workday(v_d1.ts, v_x::integer, case when v_n > 2 then v_vals[3] end), v_d1.date_only));
    when 'fx.add' then
      return to_jsonb(custom._fx_num(v_a, '`+`') + custom._fx_num(v_b, '`+`'));
    when 'fx.sub' then
      return to_jsonb(custom._fx_num(v_a, '`-`') - custom._fx_num(v_b, '`-`'));
    when 'fx.mul' then
      return to_jsonb(custom._fx_num(v_a, '`*`') * custom._fx_num(v_b, '`*`'));
    when 'fx.div', 'fx.mod' then
      v_y := custom._fx_num(v_b, case when v_op = 'fx.div' then '`/`' else '`%`' end);
      if v_y = 0 then
        raise exception 'This formula divides by zero.' using errcode = '22012';
      end if;
      v_x := custom._fx_num(v_a, case when v_op = 'fx.div' then '`/`' else '`%`' end);
      -- trim_scale: 142.5 / 3 is 47.5, not 47.5000000000000000 (a number reads as the older grid prints it).
      return to_jsonb(trim_scale(case when v_op = 'fx.div' then v_x / v_y else mod(v_x, v_y) end));
    when 'fx.neg' then
      return to_jsonb(- custom._fx_num(v_a, '`-`'));
    when 'fx.eq'  then return to_jsonb(custom._fx_cmp(v_a, v_b) = 0);
    when 'fx.ne'  then return to_jsonb(custom._fx_cmp(v_a, v_b) <> 0);
    when 'fx.lt'  then return to_jsonb(custom._fx_cmp(v_a, v_b) < 0);
    when 'fx.lte' then return to_jsonb(custom._fx_cmp(v_a, v_b) <= 0);
    when 'fx.gt'  then return to_jsonb(custom._fx_cmp(v_a, v_b) > 0);
    when 'fx.gte' then return to_jsonb(custom._fx_cmp(v_a, v_b) >= 0);
    else
      raise exception 'The formula language lists % and this evaluator does not work it out.', v_op
        using errcode = '22023', hint = 'That is a defect in custom.formula_eval, not in the formula.';
  end case;
end
$function$;

CREATE OR REPLACE FUNCTION custom.formula_compile_sql(p_organization_id uuid, p_expr jsonb, p_values_sql text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_keys text[];
  v_op   text;
  v_args jsonb;
  v_n    integer;
  v_spec record;
  v_key  text;
  v_type text;
  v_when text;
  v_leaf text;
  v_one  text;
  v_sql  text[] := '{}';
  v_i    integer;
  v_self text;
begin
  -- A FORMULA, PLANNED ONCE PER QUERY (VISION-REACH W3 arithmetic, W5 everything common, 2026-10-02).
  -- custom.formula_eval works a formula out one record at a time and on every record looks each
  -- referenced Field up again, re-reads the node catalogue and walks custom.rule_eval: ~4–8 ms a
  -- record, so a filter on "Copay tier" (an IF) took 42 s over 5,000 visits. This returns ONE SQL
  -- expression (jsonb — exactly custom.formula_eval's answer; SQL NULL where formula_eval would
  -- raise, which custom.derived_value reads as an empty column) over the row's values
  -- (`p_values_sql`, a jsonb expression), with every look-up done here, once.
  --
  -- PLANNED (custom._fxc_apply, whose branches are formula_eval's own): columns, constants,
  -- arithmetic (+ − × ÷ % ROUND ABS, unary minus, SUM MIN MAX AVERAGE), comparisons
  -- (= != < <= > >=), IF AND OR NOT ISBLANK BLANK, text (CONCATENATE and &, UPPER LOWER TRIM LEN
  -- LEFT RIGHT CONTAINS) and dates (DATEADD DATEDIFF YEAR MONTH DAY TODAY NOW).
  -- HANDED BACK, PART BY PART (custom._fxc_eval): every other formula function and a list or
  -- relation column — custom.formula_eval works out just that part, from the row's values, so a
  -- function lane VIEWS-AND-FIELDS adds is answered by the one evaluator and the rest of the
  -- formula is still planned.
  -- NOT PLANNED AT ALL (NULL here; the caller keeps custom.derived_value for the whole formula):
  -- a formula with any part that reads more of the record than its values — a Rule node (a
  -- parent's column, a count of siblings, who is acting) or AUTONUMBER / CREATED_TIME /
  -- MODIFIED_TIME — because those need the record's context, built per row.
  if p_expr is null or jsonb_typeof(p_expr) <> 'object' then
    return null;
  end if;
  if not custom._fxc_context_free(p_expr) then
    return null;
  end if;
  -- FORMULA-2: a formula with a list function in it (or CURRENT / RECPROP) reads the record's links and runs a body per item,
  -- so it is not planned: NULL keeps custom.derived_value, which works out the columns it reads and builds the context.
  if p_expr::text ~ '"fx\.(current|index|current1|current2|recprop|map|filter|findfirst|some|every|length|at|first|last|sort|unique|reverse|slice|join|split|includes)"' then
    return null;
  end if;
  v_self := format('custom._fxc_eval(%L::uuid, %L::jsonb, %s)', p_organization_id, p_expr::text, p_values_sql);
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_expr) k;

  -- A constant: exactly {"const": …} — custom.rule_eval answers the constant itself.
  if v_keys = array['const'] then
    return format('%L::jsonb', (p_expr -> 'const')::text);
  end if;

  -- A column: exactly {"field": "<id>"} — formula_eval's field branch. A list or an object reads
  -- as its JSON text; no value reads as JSON null. A list or relation column reads as its words.
  if v_keys = array['field'] then
    if jsonb_typeof(p_expr -> 'field') <> 'string'
       or (p_expr ->> 'field') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return v_self;
    end if;
    v_key := custom.rule_field_key(p_organization_id, (p_expr ->> 'field')::uuid);
    if v_key is null then
      return v_self;
    end if;
    select f.data ->> 'type', coalesce(f.data ->> 'compute_on', '') into v_type, v_when
      from custom.record f
     where f.organization_id = p_organization_id and f.id = (p_expr ->> 'field')::uuid
       and f.table_id = custom.field_kernel_id();
    if v_type in ('list', 'relation') then
      return v_self;
    end if;
    -- CHAIR-MATH (a), carried here (2026-10-03): A COLUMN WORKED OUT ON READ IS NOT IN THE ROW'S
    -- VALUES. A roll-up, a lookup or a read-time formula (all Fields of type `formula`,
    -- compute_on = 'read') has no stored value, so reading `p_values_sql -> key` would read an
    -- absence (0, ''). Such a formula is NOT planned: NULL hands the WHOLE formula to the per-row
    -- path, where custom.formula_value works the referenced column out first. A formula stamped at
    -- write time is in the `_derived` block the caller's `p_values_sql` already includes, and plans.
    if v_type = 'formula' and v_when = 'read' then
      return null;
    end if;
    v_leaf := format('(%s -> %L)', p_values_sql, v_key);
    return format('(case when jsonb_typeof(%1$s) in (''array'', ''object'') then to_jsonb((%1$s)::text) '
                  'else coalesce(%1$s, ''null''::jsonb) end)', v_leaf);
  end if;

  -- A Rule node ({"op": "sub"}, {"op": "concat"} — what most formulas written before the formula
  -- language still are): formula_eval hands every node that is not its own to custom.rule_eval,
  -- so it is planned with rule_eval's own meaning (custom._fxc_rule_sql), not the formula's.
  if left(coalesce(p_expr ->> 'op', ''), 3) <> 'fx.' then
    return custom._fxc_rule_sql(p_organization_id, p_expr, p_values_sql);
  end if;

  v_op := p_expr ->> 'op';
  if not (v_keys = array['args', 'op'] or v_keys = array['op'])
     or v_op not in (
       'fx.add', 'fx.sub', 'fx.mul', 'fx.div', 'fx.mod', 'fx.neg', 'fx.round', 'fx.abs',
       'fx.sum', 'fx.min', 'fx.max', 'fx.average',
       'fx.eq', 'fx.ne', 'fx.lt', 'fx.lte', 'fx.gt', 'fx.gte',
       'fx.if', 'fx.and', 'fx.or', 'fx.not', 'fx.isblank', 'fx.blank',
       'fx.concatenate', 'fx.upper', 'fx.lower', 'fx.trim', 'fx.len', 'fx.left', 'fx.right', 'fx.contains',
       'fx.datediff', 'fx.dateadd', 'fx.year', 'fx.month', 'fx.day', 'fx.today', 'fx.now') then
    return v_self;
  end if;
  v_args := coalesce(p_expr -> 'args', '[]'::jsonb);
  if jsonb_typeof(v_args) <> 'array' then
    return v_self;
  end if;
  v_n := jsonb_array_length(v_args);
  select * into v_spec from custom.formula_node_kinds() k where k.node = v_op;
  if v_spec.node is null or v_n < v_spec.min_args or (v_spec.max_args is not null and v_n > v_spec.max_args) then
    return v_self;   -- formula_eval refuses it by name, as it always has
  end if;

  -- Nodes with no arguments: formula_eval's own answers.
  if v_op = 'fx.blank' then
    return '''null''::jsonb';
  elsif v_op = 'fx.today' then
    return format('to_jsonb(to_char(now() at time zone %L, ''YYYY-MM-DD''))', custom.day_zone(p_organization_id));
  elsif v_op = 'fx.now' then
    return 'to_jsonb(to_char(now() at time zone ''UTC'', ''YYYY-MM-DD"T"HH24:MI:SS.MS"Z"''))';
  end if;

  for v_i in 0 .. v_n - 1 loop
    v_one := custom.formula_compile_sql(p_organization_id, v_args -> v_i, p_values_sql);
    if v_one is null then
      return null;
    end if;
    v_sql := v_sql || v_one;
  end loop;
  return format('custom._fxc_apply(%L, array[%s]::jsonb[])', v_op, array_to_string(v_sql, ', '));
end;
$function$;

CREATE OR REPLACE FUNCTION custom._nfx_colkind(p_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case
    when p_type in ('text', 'long_text', 'rich_text', 'email', 'url', 'phone', 'choice', 'status') then 'text'
    when p_type in ('number', 'integer', 'decimal', 'currency', 'percent', 'rating', 'duration', 'autonumber') then 'number'
    when p_type in ('relation', 'list') then 'list'
    when p_type = 'checkbox' then 'boolean'
    when p_type in ('date', 'datetime', 'created_time', 'modified_time') then 'date'
    else 'any' end
$function$;

CREATE OR REPLACE FUNCTION custom._nfx_call(p_name text, p_args jsonb, p_types jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  low text := lower(p_name);
  c integer := jsonb_array_length(p_args);
  a jsonb[] := array(select e from jsonb_array_elements(p_args) e);
  notes jsonb := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(p_args) e, jsonb_array_elements(coalesce(e -> 'n', '[]'::jsonb)) x);
  s text;
  k text := 'any';
  v_lit text;
  v_unit text;
  v_key text;
  v_spec text[];
  v_factor integer;
  v_n text;
  v_all text;
  i integer;
begin
  select string_agg(e ->> 's', ', ' order by ord) into v_all from jsonb_array_elements(p_args) with ordinality t(e, ord);

  if low = 'prop' then
    if c = 2 then
      -- current.prop("Done"): one column of a linked record
      if a[2] ->> 'lit' is null then raise exception 'prop() names its column with something other than plain text' using errcode = '22023'; end if;
      return jsonb_build_object('s', 'RECPROP(' || v_all || ')', 'k', 'any', 'n', notes);
    end if;
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    v_lit := a[1] ->> 'lit';
    if v_lit is null then raise exception 'prop() names its column with something other than plain text' using errcode = '22023'; end if;
    if position('}' in v_lit) > 0 or position('{' in v_lit) > 0 then
      raise exception 'the column name "%" holds a brace, which a formula cannot name', v_lit using errcode = '22023';
    end if;
    return jsonb_build_object('s', '{' || v_lit || '}', 'k', custom._nfx_colkind(p_types ->> v_lit), 'n', notes);
  end if;

  if low = 'if' then
    if c not between 2 and 3 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'IF(' || v_all || ')'; k := 'any';
  elsif low = 'ifs' then
    if c < 3 or c % 2 = 0 then
      raise exception 'ifs() needs pairs of condition and value, then a last value' using errcode = '22023';
    end if;
    s := a[c] ->> 's';
    i := c - 2;
    while i >= 1 loop
      s := 'IF(' || (a[i] ->> 's') || ', ' || (a[i + 1] ->> 's') || ', ' || s || ')';
      i := i - 2;
    end loop;
    k := 'any';
  elsif low in ('and', 'or') then
    if c < 2 then raise exception '%() needs two or more conditions', p_name using errcode = '22023'; end if;
    s := upper(low) || '(' || v_all || ')'; k := 'boolean';
  elsif low = 'not' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'NOT(' || v_all || ')'; k := 'boolean';
  elsif low = 'concat' then
    if c = 0 then raise exception 'concat() has nothing to join' using errcode = '22023'; end if;
    s := 'CONCATENATE(' || v_all || ')'; k := 'text';
  elsif low in ('format', 'tostring') then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'CONCATENATE(' || v_all || ')'; k := 'text';
  elsif low = 'contains' then
    if c <> 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    notes := notes || to_jsonb('contains(): the table''s CONTAINS ignores upper/lower case; Notion''s does not.'::text);
    s := 'CONTAINS(' || v_all || ')'; k := 'boolean';
  elsif low in ('replace', 'replaceall') then
    if c <> 3 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    v_lit := a[2] ->> 'lit';
    if v_lit is null or v_lit ~ '[\\^$.|?*+()\[\]{}]' then
      -- Notion reads the second value as a pattern (regular expression); so does REGEXREPLACE.
      s := 'REGEXREPLACE(' || v_all || case when low = 'replaceall' then ', TRUE' else '' end || ')'; k := 'text';
    else
      s := 'SUBSTITUTE(' || v_all || case when low = 'replace' then ', 1' else '' end || ')'; k := 'text';
    end if;
  elsif low = 'test' then
    if c <> 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'REGEX_MATCH(' || v_all || ')'; k := 'boolean';
  elsif low = 'length' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := case when a[1] ->> 'k' = 'text' then 'LEN(' else 'LENGTH(' end || v_all || ')'; k := 'number';
  elsif low in ('lower', 'upper', 'trim') then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := upper(low) || '(' || v_all || ')'; k := 'text';
  elsif low = 'empty' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'ISBLANK(' || v_all || ')'; k := 'boolean';
  elsif low in ('now', 'today') then
    if c <> 0 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := upper(low) || '()'; k := 'date';
  elsif low in ('dateadd', 'datesubtract') then
    if c <> 3 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    v_unit := a[3] ->> 'lit';
    if v_unit is null then raise exception 'its date unit is not a plain word like "days"' using errcode = '22023'; end if;
    v_key := rtrim(lower(v_unit), 's');
    v_spec := case v_key when 'day' then array['days', '1'] when 'week' then array['days', '7']
                         when 'month' then array['months', '1'] when 'year' then array['years', '1']
                         when 'quarter' then array['months', '3'] when 'hour' then array['hours', '1'] when 'minute' then array['minutes', '1'] end;
    if v_spec is null then
      raise exception 'its date unit "%" is not one the table''s date functions have', v_unit using errcode = '22023';
    end if;
    v_factor := v_spec[2]::integer;
    v_n := a[2] ->> 's';
    if v_factor <> 1 then v_n := '(' || v_n || ' * ' || v_factor || ')'; end if;
    if low = 'datesubtract' then v_n := '(-' || v_n || ')'; end if;
    s := 'DATEADD(' || (a[1] ->> 's') || ', ' || v_n || ', "' || v_spec[1] || '")'; k := 'date';
  elsif low = 'datebetween' then
    if c <> 3 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    v_unit := a[3] ->> 'lit';
    if v_unit is null then raise exception 'its date unit is not a plain word like "days"' using errcode = '22023'; end if;
    v_key := rtrim(lower(v_unit), 's');
    v_spec := case v_key when 'day' then array['days', '1'] when 'week' then array['days', '7']
                         when 'hour' then array['hours', '1'] when 'minute' then array['minutes', '1'] when 'second' then array['seconds', '1']
                         when 'month' then array['months', '1'] when 'year' then array['years', '1'] when 'quarter' then array['months', '3'] end;
    if v_spec is null then
      raise exception 'its date unit "%" is not one the table''s date functions have', v_unit using errcode = '22023';
    end if;
    v_factor := v_spec[2]::integer;
    s := 'DATEDIFF(' || (a[2] ->> 's') || ', ' || (a[1] ->> 's') || ', "' || v_spec[1] || '")';
    if v_factor <> 1 then s := '(' || s || ' / ' || v_factor || ')'; end if;
    k := 'number';
  elsif low = 'formatdate' then
    if c <> 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'DATETIME_FORMAT(' || v_all || ')'; k := 'text';
  elsif low in ('year', 'month') then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := upper(low) || '(' || v_all || ')'; k := 'number';
  elsif low = 'date' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'DAY(' || v_all || ')'; k := 'number';
  elsif low = 'round' then
    if c not between 1 and 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'ROUND(' || v_all || ')'; k := 'number';
  elsif low = 'abs' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'ABS(' || v_all || ')'; k := 'number';
  elsif low in ('map', 'filter', 'some', 'every') then
    if c <> 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := upper(low) || '(' || v_all || ')'; k := case when low in ('map', 'filter') then 'list' else 'boolean' end;
  elsif low = 'find' then
    if c <> 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'FINDFIRST(' || v_all || ')'; k := 'any';
  elsif low in ('first', 'last') then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := upper(low) || '(' || v_all || ')'; k := 'any';
  elsif low = 'at' then
    if c <> 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'AT(' || v_all || ')'; k := 'any';
  elsif low in ('unique', 'reverse') then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := upper(low) || '(' || v_all || ')'; k := 'list';
  elsif low = 'sort' then
    if c not between 1 and 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'SORT(' || v_all || ')'; k := 'list';
  elsif low = 'slice' then
    if c not between 2 and 3 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'SLICE(' || v_all || ')'; k := 'list';
  elsif low = 'join' then
    if c not between 1 and 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'JOIN(' || v_all || ')'; k := 'text';
  elsif low = 'split' then
    if c <> 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'SPLIT(' || v_all || ')'; k := 'list';
  elsif low = 'includes' then
    if c <> 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'INCLUDES(' || v_all || ')'; k := 'boolean';
  elsif low in ('mean', 'average') then
    if c = 0 then raise exception '%() has no values', p_name using errcode = '22023'; end if;
    s := 'AVERAGE(' || v_all || ')'; k := 'number';
  elsif low = 'median' then
    if c = 0 then raise exception '%() has no values', p_name using errcode = '22023'; end if;
    s := 'MEDIAN(' || v_all || ')'; k := 'number';
  elsif low in ('min', 'max', 'sum') then
    if c = 0 then raise exception '%() has no values', p_name using errcode = '22023'; end if;
    s := upper(low) || '(' || v_all || ')'; k := 'number';
  elsif low = 'tonumber' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    notes := notes || to_jsonb('toNumber(): worked out as the value times 1.'::text);
    s := '(' || v_all || ' * 1)'; k := 'number';
  else
    raise exception 'it uses %(), which the table''s formulas do not have', p_name using errcode = '22023';
  end if;
  return jsonb_build_object('s', s, 'k', k, 'n', notes);
end
$function$;

CREATE OR REPLACE FUNCTION custom._nfx_primary(p_t jsonb, p_i integer, p_types jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tok jsonb := p_t -> p_i;
  v_k text := v_tok ->> 'k';
  v_v text := v_tok ->> 'v';
  v_i integer := p_i + 1;
  v_r jsonb;
  v_c jsonb;
  v_env jsonb;
  v_j integer;
  v_name text;
begin
  if v_k = 'num' then
    return jsonb_build_object('s', v_v, 'k', 'number', 'i', v_i);
  elsif v_k = 'str' then
    return jsonb_build_object('s', '"' || replace(replace(v_v, '\', '\\'), '"', '\"') || '"', 'k', 'text', 'lit', v_v, 'i', v_i);
  elsif v_k = 'op' and v_v = '(' then
    v_r := custom._nfx_expr(p_t, v_i, 0, p_types);
    if p_t -> ((v_r ->> 'i')::integer) <> '{"k": "op", "v": ")"}'::jsonb then
      raise exception 'expected ")" in the formula' using errcode = '22023';
    end if;
    return jsonb_build_object('s', v_r ->> 's', 'k', v_r ->> 'k', 'n', coalesce(v_r -> 'n', '[]'::jsonb), 'i', (v_r ->> 'i')::integer + 1);
  elsif v_k = 'id' then
    if v_v in ('true', 'false') then
      return jsonb_build_object('s', upper(v_v), 'k', 'boolean', 'i', v_i);
    end if;
    if p_t -> v_i = '{"k": "op", "v": "("}'::jsonb then
      if lower(v_v) in ('let', 'lets') then
        -- let(x, value, body) / lets(a, 1, b, 2, body): each name stands for its value in what follows.
        v_env := p_types;
        v_j := v_i + 1;
        loop
          if (p_t -> v_j) ->> 'k' <> 'id' then
            raise exception '%() names each value with a plain word', v_v using errcode = '22023';
          end if;
          v_name := (p_t -> v_j) ->> 'v';
          if p_t -> (v_j + 1) <> '{"k": "op", "v": ","}'::jsonb then
            raise exception '%() needs a comma after the name "%"', v_v, v_name using errcode = '22023';
          end if;
          v_r := custom._nfx_expr(p_t, v_j + 2, 0, v_env);
          v_j := (v_r ->> 'i')::integer;
          if p_t -> v_j <> '{"k": "op", "v": ","}'::jsonb then
            raise exception '%() needs a comma after the value of "%"', v_v, v_name using errcode = '22023';
          end if;
          v_j := v_j + 1;
          v_env := v_env || jsonb_build_object('$let:' || v_name, v_r - 'i');
          exit when lower(v_v) = 'let'
                 or not ((p_t -> v_j) ->> 'k' = 'id' and p_t -> (v_j + 1) = '{"k": "op", "v": ","}'::jsonb);
        end loop;
        v_r := custom._nfx_expr(p_t, v_j, 0, v_env);
        if p_t -> ((v_r ->> 'i')::integer) <> '{"k": "op", "v": ")"}'::jsonb then
          raise exception '%() is missing its closing ")"', v_v using errcode = '22023';
        end if;
        return (v_r - 'i') || jsonb_build_object('i', (v_r ->> 'i')::integer + 1);
      end if;
      v_r := custom._nfx_arglist(p_t, v_i, p_types);
      v_c := custom._nfx_call(v_v, v_r -> 'args', p_types);
      return v_c || jsonb_build_object('i', (v_r ->> 'i')::integer);
    end if;
    if v_v in ('current', 'index', 'current1', 'current2') then
      return jsonb_build_object('s', upper(v_v) || '()', 'k', case when v_v = 'index' then 'number' else 'any' end, 'i', v_i);
    end if;
    if p_types ? ('$let:' || v_v) then
      return (p_types -> ('$let:' || v_v)) || jsonb_build_object('i', v_i);
    end if;
    if v_v = 'acc' then
      raise exception 'it folds a list into one value (reduce / acc), which the table''s formulas do not have' using errcode = '22023';
    end if;
    raise exception '"%" is a name Notion formulas only allow in a function call or as true/false', v_v using errcode = '22023';
  end if;
  raise exception 'unexpected "%" where a value should start', v_v using errcode = '22023';
end
$function$;
