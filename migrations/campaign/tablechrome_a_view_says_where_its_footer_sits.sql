-- target: branch,production
-- additive: yes
--   REPLACES two bodies — `custom.view_keys()` (S1-PRIME's registry, byte for byte, plus ONE row,
--   `presentation.footer`) and `custom._view_key_value(uuid, uuid, text, text, jsonb, jsonb)` (byte
--   for byte, plus ONE shape branch, `footer`: the string sticky or inline). No table, trigger,
--   policy, index, grant or stored row changes. Inverse:
--   migrations/inverse/tablechrome_a_view_says_where_its_footer_sits_down.sql.
-- guard: custom/system_enabled
-- lock: custom
-- lane: TABLE-PAGE-CHROME
-- based-on: custom.view_keys() f016927fc6e2e655b68fe77a42bb9b2b617b11d3d86e4e6ac99aea93067ba574
-- based-on: custom._view_key_value(uuid, uuid, text, text, jsonb, jsonb) 43ce790fa050459da7105b81aa1fe0abf0cee1e82b16546416e411c6a29a3cbe
--
-- LANE TABLE-PAGE-CHROME. A VIEW SAYS WHERE ITS FOOTER SITS.
--
-- THE USE CASE (owner, 2026-09-25, on his Coding Accounts table): the older grid anchored its
-- footer — the row count and the pages — to the bottom of the screen; the new one leaves it after
-- the last row, so on a long table it is off the screen. He asked for an explicit setting. It is a
-- VIEW setting (Airtable: a view's layout choices are the view's), saved with the view by "Save to
-- view", kept as a person's own look until then (view_look_set judges the same registry), default
-- sticky when absent (the older grid's behaviour). Read by the Grid and the Sheet.
--
-- LOCKS. create or replace function x2. Not window-class.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.view_keys()
 RETURNS TABLE(path text, shape text, layouts text[], writer text, sentence text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select * from (values
    ('layout',                  'kind',          array['grid','kanban','calendar','gallery','sheet'], 'caller', 'Which of the ways to look at the table this view is: grid, kanban, calendar, gallery, or sheet (the Sheet the host draws; a table whose default view is layout sheet opens as the Sheet).'),
    ('filters',                 'filter',        array['grid','kanban','calendar','gallery','sheet'], 'caller', 'The flat question the digests and the notifier read: a map of Field key to value, null or a window. Sent as spec.filters. Never a Rule expression — that is `where`.'),
    ('where',                   'rule',          array['grid','kanban','calendar','gallery','sheet'], 'caller', 'The view''s own question as the condition builder writes it (S2-PRIME): a Rule expression {op, args}, ALL / ANY / NOT nested to any depth, Fields by id; the board filter. custom.record_filter_sql compiles it for the grid, the board and the numbers.'),
    ('group_field',             'field',         array['kanban'],                                     'caller', 'The Field whose values are the board''s columns.'),
    ('swimlane_field',          'field:lane',    array['kanban'],                                     'caller', 'The Field whose values cut the board into swimlanes across the columns (a choice, a person, a relation, a yes/no or a word).'),
    ('collapsed_columns',       'values',        array['kanban'],                                     'caller', 'The board columns this view keeps shut to a strip, by the column''s stored value.'),
    ('measure',                 'field:number',  array['kanban'],                                     'caller', 'The number, money or percentage Field summed under every board column heading.'),
    ('date_field',              'field:date',    array['calendar'],                                   'caller', 'The date Field that places a record on the calendar.'),
    ('image_field',             'field',         array['gallery'],                                    'caller', 'The Field drawn large as the gallery card''s cover.'),
    ('sorts',                   'sorts',         array['grid','kanban','calendar','gallery','sheet'], 'caller', 'The sort stack: an ordered list of {field, direction} (asc or desc), at most five, each Field once.'),
    ('rule_id',                 'uuid',          array['grid','kanban','calendar','gallery','sheet'], 'caller', 'The membership Rule whose members the view shows.'),
    ('is_default',              'boolean',       array['grid','kanban','calendar','gallery','sheet'], 'caller', 'Whether this is the table''s default view.'),
    ('presentation',            'presentation',  array['grid','kanban','calendar','gallery','sheet'], 'caller', 'How the view looks. Each of its keys is declared below.'),
    ('presentation.style',      'style',         array['grid','kanban','calendar','gallery','sheet'], 'caller', 'The view''s colours over the table''s own (G1 table_decorations): colorBy {field, target} names a choice or yes/no Field — the calendar''s and the cards'' colour field — plus rules and hand highlights.'),
    ('presentation.formats',    'object',        array['grid','sheet'],                               'caller', 'Per-column display formats, by Field key.'),
    ('presentation.frozen',     'fields',        array['grid','sheet'],                               'caller', 'The pinned Fields that stay put while the grid scrolls sideways, in order, at most ten.'),
    ('presentation.grouping',   'grouping',      array['grid','gallery','sheet'],                     'caller', 'Sections by a Field ({field, order, aggregates, collapsed}) and up to two sub-groups (then: [{field, order}]); at most three levels; collapsed holds the sections kept shut at every level.'),
    ('presentation.widths',     'widths',        array['grid','sheet'],                               'caller', 'The width a person dragged a column to, in pixels, by Field key.'),
    ('presentation.rowHeight',  'row_height',    array['grid','sheet'],                               'caller', 'The body row height this view remembers, 24 to 96 pixels.'),
    ('presentation.hiddenFields','fields',       array['grid','gallery','sheet'],                     'caller', 'The Fields hidden from this view, by key.'),
    ('presentation.gallerySize','gallery_size',  array['gallery'],                                    'caller', 'The gallery''s card size: small, medium or large.'),
    ('presentation.wrap',       'boolean',       array['grid','sheet'],                               'caller', 'Whether long values wrap onto more lines.'),
    ('presentation.fit',        'fit',           array['grid','sheet'],                               'caller', 'How the grid shares its width: auto, fit or scroll.'),
    ('presentation.freezeFirst','boolean',       array['grid','sheet'],                               'caller', 'Whether the first column stays put.'),
    ('presentation.footer',     'footer',        array['grid','sheet'],                               'caller', 'Where the grid''s footer (the counts and the pages) sits: sticky, pinned to the bottom of the screen, or inline, right after the last row.'),
    ('presentation.summaries',  'summaries',     array['grid','sheet'],                               'caller', 'The summary shown under each column, by Field key (count, sum, avg, min, max, median, filled, empty, unique).'),
    ('grid',                    'grid',          array['grid','sheet'],                               'caller', 'G1/G7 grid choices (mode, row_height, freeze_first_column, wrap, widths by Field id), judged by custom.grid_layout_check.'),
    ('hidden_fields',           'input',         array['grid','gallery','sheet'],                     'input',  'Hidden columns by Field id (the mover''s shape); written as presentation.hiddenFields by key.'),
    ('table_id',                'server',        array['grid','kanban','calendar','gallery','sheet'], 'server', 'The view''s Table, fixed at birth.'),
    ('order',                   'server',        array['grid','sheet'],                               'server', 'G13''s hand-set order, written only by custom.view_record_order_set.'),
    ('moved_from',              'server',        array['grid','kanban','calendar','gallery','sheet'], 'server', 'Where the view was moved in from; set once, at birth, by the mover.')
  ) as k(path, shape, layouts, writer, sentence);
$function$;

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

  elsif p_shape = 'footer' then
    if jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') not in ('sticky', 'inline') then
      raise exception 'The grid''s footer sits sticky (pinned to the bottom) or inline (after the last row), and "%" is neither.', p_value #>> '{}'
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

  elsif p_shape = 'filter' then
    -- STORE-TAILS-3: `filters`, the FLAT Field-to-value map the digests and the notifier read. The
    -- registry has always said so; this guard had no arm for it, so a `filters` that reached it
    -- was answered with an internal error (XX000) instead of being judged. Judged now exactly as
    -- custom.view_declare judges it: an object, never a Rule expression, compiled by the one filter
    -- compiler every read door asks.
    if jsonb_typeof(p_value) is distinct from 'object' then
      raise exception 'A view''s filters are a map of each column to the value it must have, and what was sent is %.',
        coalesce(jsonb_typeof(p_value), 'nothing')
        using errcode = '22023', hint = 'Send {"<field key>": <value>, …}; a nested question goes in where. Nothing was written.';
    end if;
    if custom.filter_is_rule(p_value) then
      raise exception 'A view''s filters are the flat Field-to-value map, and this is a Rule expression.'
        using errcode = '22023', hint = 'Send a nested question as where (S2-PRIME); the digests and the notifier read filters. Nothing was written.';
    end if;
    perform custom.record_filter_sql(p_organization_id, p_table_id, p_value);
    return p_value;

  elsif p_shape = 'server' then
    -- STORE-TAILS-3: a setting the store writes itself (which table the view is of, its hand-set
    -- order, where it was moved in from). A caller who sends one is told so by name.
    raise exception 'The view setting "%" is kept by the store itself, so it cannot be set here.', p_path
      using errcode = '22023', hint = 'Leave it out; the store writes it. Nothing was written.';
  end if;

  -- STORE-TAILS-3: A CALLER'S INPUT NEVER MEETS AN INTERNAL ERROR. A setting the registry names
  -- in a shape this guard has no arm for is refused BY NAME, as a refusal of the request (22023,
  -- mapped by every client), and the hint says where the disagreement lives.
  raise exception 'The view setting "%" cannot be saved yet: nothing here knows how to check a setting of that kind (%).', p_path, p_shape
    using errcode = '22023',
          hint = 'custom.view_keys() names this setting and custom._view_key_value has no check for its shape; the store must add one. Nothing was written.';
end;
$function$;
