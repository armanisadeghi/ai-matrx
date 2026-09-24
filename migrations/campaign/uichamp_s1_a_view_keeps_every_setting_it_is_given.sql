-- target: branch,production
-- additive: yes
--   It ADDS two functions — custom.view_keys() (THE registry of every key a saved view may carry)
--   and custom.view_keys_check(uuid, uuid, jsonb, jsonb) (the shape guard that reads it) — and one
--   platform.client_callable_door row is the NEXT file's (the grant). It REPLACES one body,
--   `custom.view_declare(uuid, uuid, jsonb)`, declared below with the body it was written
--   against: lane S0's (oneview_a_saved_view_keeps_what_it_was_not_sent.sql, 6da4b50e…), so this
--   file applies only AFTER S0's — the based-on gate refuses it on G7's body. Every S0 rule is
--   kept word for word (merge, null clears, grid merges one level, server-owned keys, one hidden
--   list, a view of another Table refused 23503); what is new is that every key sent is JUDGED
--   by the registry before anything is written, and the view's filter is judged by the S2'
--   compiler. Nothing is dropped or revoked; no table, trigger, policy or grant is touched; no
--   stored view is rewritten. The inverse is
--   `migrations/inverse/uichamp_s1_a_view_keeps_every_setting_it_is_given_down.sql`.
-- guard: custom/system_enabled
-- lock: custom
-- lane: S1-PRIME-VIEW-KEYS
-- based-on: custom.view_declare(uuid, uuid, jsonb) 6da4b50ef46ab429857bd9a226dcc20135994e4391f9d84724c7e352196308e7
--
-- LANE S1' VIEW-KEYS (UI-CHAMPIONS-PLAN rev 2, rows 1, 7, 9, 24, 29, 57; ui-bench BOARDS + LISTS).
-- EVERY PER-VIEW SETTING IS A DECLARED KEY OF THE ONE SAVED VIEW, AND THE STORE JUDGES IT.
--
-- THE USE CASE. Harbor Point Plumbing & Drain runs its day from one board. Marisol Vega
-- dispatches (test@test.com); the owner is admin@admin.com. Her board: columns by Status,
-- swimlanes by Technician, the Done column collapsed to a strip, the Price summed under every
-- column heading, cards sorted by Priority and then by Window, filtered to (Emergency OR
-- Warranty) AND NOT Cancelled. The owner opens the same view and sees the same board. Every
-- name and price in the suite is synthesized.
--
-- THE DEFECT. `definition` took any key from anybody. A board filter that was not a question the
-- store can ask, a sort on a column archived last week, a "Group by" four levels deep, a colour
-- field nobody can see, a key spelled `swimlane` instead of `swimlane_field` — all were stored
-- and then silently ignored or half-drawn by the screens. Linear and Airtable refuse a view
-- setting they cannot honour at the moment it is made; so does this door now.
--
-- THE RULE NOW.
--   1. custom.view_keys() is THE list: every key a view may carry, its path, its shape, which
--      layouts read it, and whether a caller may set it. The guard reads it, the records-ui
--      accessor (`viewKeys.ts`) is tested against it, and nothing else decides what a view holds.
--   2. custom.view_keys_check(org, table, keys sent, the view as stored) judges each key sent:
--      an undeclared key is refused by name with the declared list; a Field named by id or by key
--      must be a LIVE Field of this Table (archived or another Table's is refused), and is stored
--      by its KEY; a Field kind that cannot serve the key (a text column as the column sum, a
--      number as the calendar's date, a free-text colour) is refused with the reason. A Field the
--      SAME setting already names is not re-judged, so archiving a column never makes a view
--      unsavable.
--   3. The view's question — `where`, S2-PRIME's Rule expression (the board filter), and the flat
--      `filters` map the digests read — is judged by custom.record_filter_sql(org, table, …), the
--      S2' compiler every read door uses, so a question the board could not ask is refused when
--      it is saved, never when the board opens. A Rule under `filters` is refused with where it
--      belongs (the notifier reads `filters` flat).
--   4. After the merge, the keys that must agree are asked together: a swimlane is not the
--      board's own column field, and grouping is at most three levels.
--
-- FIELDS BY KEY, AND WHY (S0 finding 2). A Field's key is immutable (custom.field_update refuses a
-- key change: "A field's key is how every saved value finds it"), every reader draws rows by key,
-- and S0 already stores hidden columns by key. So a view names a Field by KEY; the door accepts an
-- id (the mover's and an agent's shape) and writes the key. A Rule expression inside `filters`
-- keeps its Field ids (REC-17 — S2' compiles them). G1's `grid.widths` stays by id, its own
-- guard's choice, untouched here.
--
-- LOCKS. create function / create or replace function / comment on only. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ── 1. THE REGISTRY ─────────────────────────────────────────────────────────────────────────────
-- One row per key. `path` is where it lives in `platform.saved_view.definition`; `shape` is what
-- the guard checks; `layouts` is who reads it (a layout that does not use a key ignores it);
-- `writer` is `caller` (anyone who may save the view), `input` (accepted and rewritten elsewhere),
-- or `server` (never taken from a caller on update).
create function custom.view_keys()
returns table (path text, shape text, layouts text[], writer text, sentence text)
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select * from (values
    ('layout',                  'kind',          array['grid','kanban','calendar','gallery','sheet'], 'caller', 'Which of the ways to look at the table this view is: grid, kanban, calendar or gallery.'),
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
    ('presentation.summaries',  'summaries',     array['grid','sheet'],                               'caller', 'The summary shown under each column, by Field key (count, sum, avg, min, max, median, filled, empty, unique).'),
    ('grid',                    'grid',          array['grid','sheet'],                               'caller', 'G1/G7 grid choices (mode, row_height, freeze_first_column, wrap, widths by Field id), judged by custom.grid_layout_check.'),
    ('hidden_fields',           'input',         array['grid','gallery','sheet'],                     'input',  'Hidden columns by Field id (the mover''s shape); written as presentation.hiddenFields by key.'),
    ('table_id',                'server',        array['grid','kanban','calendar','gallery','sheet'], 'server', 'The view''s Table, fixed at birth.'),
    ('order',                   'server',        array['grid','sheet'],                               'server', 'G13''s hand-set order, written only by custom.view_record_order_set.'),
    ('moved_from',              'server',        array['grid','kanban','calendar','gallery','sheet'], 'server', 'Where the view was moved in from; set once, at birth, by the mover.')
  ) as k(path, shape, layouts, writer, sentence);
$fn$;

comment on function custom.view_keys() is
  'S1-PRIME VIEW-KEYS: THE registry of every key a saved view (platform.saved_view, surface custom/records) may carry — path, shape, the layouts that read it, and who may write it. custom.view_keys_check judges every key custom.view_declare is sent against it; the records-ui accessor (viewKeys.ts) is tested against it. IMMUTABLE, no argument, reads no table.';

-- ── 2. THE GUARD ────────────────────────────────────────────────────────────────────────────────
-- p_set is the definition keys a caller sent (nulls already taken out as "clear"); p_old is the
-- view as stored ('{}' at birth). Returns p_set with every Field named by its key. Raises 22023
-- with the reason, and nothing is written.
create function custom.view_keys_check(p_organization_id uuid, p_table_id uuid, p_set jsonb, p_old jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_out    jsonb := '{}'::jsonb;
  e        record;
  p        record;
  v_reg    record;
  v_val    jsonb;
  v_list   jsonb;
  v_item   jsonb;
  v_seen   text[];
  v_key    text;
  v_n      integer;
  v_paths  text;
begin
  if p_set is null or jsonb_typeof(p_set) <> 'object' then
    return '{}'::jsonb;
  end if;
  for e in select key, value from jsonb_each(p_set) loop
    select * into v_reg from custom.view_keys() k where k.path = e.key;
    if v_reg.path is null then
      select string_agg(k.path, ', ' order by k.path) into v_paths
        from custom.view_keys() k where k.writer = 'caller' and position('.' in k.path) = 0;
      raise exception 'A saved view has no setting called "%", so no screen would ever honour it.', e.key
        using errcode = '22023',
              hint = format('The settings a view keeps are %s (custom.view_keys()). Nothing was written.', v_paths);
    end if;
    if v_reg.writer = 'server' then
      -- The door strips these before the guard; reaching here means a new caller forgot to.
      continue;
    end if;
    -- The setting as the view holds it now: a Field that same setting already names is not
    -- re-judged, so archiving a column never makes the view unsavable.
    v_val := custom._view_key_value(p_organization_id, p_table_id, e.key, v_reg.shape, e.value,
                                    case when jsonb_typeof(p_old) = 'object' then p_old -> e.key end);
    v_out := v_out || jsonb_build_object(e.key, v_val);
  end loop;
  return v_out;
end;
$fn$;

comment on function custom.view_keys_check(uuid, uuid, jsonb, jsonb) is
  'S1-PRIME VIEW-KEYS: the shape guard of custom.view_declare. Judges every definition key sent against custom.view_keys(): an undeclared key is refused by name; a Field named by id or key must be a live Field of this Table and is returned by KEY; a Field of the wrong kind is refused with the reason; a Field the SAME setting of the stored view already names is not re-judged. Returns the keys as they will be stored.';

-- ── 3. ONE KEY, BY ITS SHAPE ────────────────────────────────────────────────────────────────────
create function custom._view_key_value(p_organization_id uuid, p_table_id uuid, p_path text, p_shape text,
                                       p_value jsonb, p_old jsonb default null)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
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
    if jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') not in ('grid', 'kanban', 'calendar', 'gallery') then
      raise exception 'A view is a grid, a kanban, a calendar or a gallery, and "%" is none of them.', p_value #>> '{}'
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
$fn$;

comment on function custom._view_key_value(uuid, uuid, text, text, jsonb, jsonb) is
  'S1-PRIME VIEW-KEYS: one saved-view key judged by its registry shape (custom.view_keys()). Internal to custom.view_keys_check.';

-- ── 4. A FIELD, NAMED BY ID OR KEY, FOR ONE KEY ─────────────────────────────────────────────────
-- Returns the Field's KEY. A live Field of THIS Table only; an archived one, another Table's, or a
-- word that is no Field is refused. `p_known` (the words the stored view already holds) skips the
-- liveness and kind checks for a Field the view already names.
create function custom._view_field_key(p_organization_id uuid, p_table_id uuid, p_path text, p_shape text,
                                       p_ref jsonb, p_known text[])
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_ref   text;
  v_doc   jsonb;
  v_dead  boolean;
  v_type  text;
  v_par   text;
  v_kind  text;
  v_label text;
begin
  if p_ref is null or jsonb_typeof(p_ref) <> 'string' or btrim(p_ref #>> '{}') = '' then
    raise exception '% names a Field, and nothing was named.', p_path
      using errcode = '22023', hint = 'Name the Field by its key or its id. Nothing was written.';
  end if;
  v_ref := p_ref #>> '{}';

  select f.data, f.deleted_at is not null into v_doc, v_dead
    from custom.record f
   where f.organization_id = p_organization_id and f.data_class = 'field'
     and f.data ->> 'entity_definition_id' = p_table_id::text
     and (f.id::text = v_ref or f.data ->> 'key' = v_ref)
   order by (f.deleted_at is null) desc, f.updated_at desc
   limit 1;

  if v_doc is not null and v_ref = any (p_known) then
    return v_doc ->> 'key';
  end if;
  if v_doc is null and v_ref = any (p_known) then
    -- A word the view already held that is no Field of this Table now (a column since removed
    -- for good). Kept as it was; the screens skip a Field they cannot find.
    return v_ref;
  end if;
  if v_doc is null then
    raise exception '% names "%", which is not a field of this table.', p_path, v_ref
      using errcode = '22023', hint = 'A view names the fields of its own table, by key or id. Nothing was written.';
  end if;
  v_label := coalesce(nullif(v_doc ->> 'label', ''), v_doc ->> 'key');
  if v_dead and p_path <> 'presentation.hiddenFields' then
    -- (Hiding a column that is archived anyway harms nobody, so that one list takes it.)
    raise exception '% names %, which has been archived.', p_path, v_label
      using errcode = '22023', hint = 'An archived field is not shown to anyone, so a view cannot be built on it. Restore it first, or pick another. Nothing was written.';
  end if;

  v_type := v_doc ->> 'type';
  v_par  := coalesce(v_doc ->> 'parity_type', '');
  v_kind := coalesce(v_doc -> 'config' ->> 'kind', '');
  if p_shape = 'field:number'
     and not (v_type = 'formula'
              or (v_type = 'range' and v_kind not in ('date', 'datetime', 'time')
                  and v_par not in ('date', 'datetime', 'time'))) then
    raise exception 'The board sums a number, a money or a percentage field under each column, and % holds none of those.', v_label
      using errcode = '22023', hint = 'Pick a number field to total. Nothing was written.';
  elsif p_shape = 'field:date'
     and not (v_type = 'range' and (v_kind in ('date', 'datetime') or v_par in ('date', 'datetime'))) then
    raise exception 'A calendar places a record by a date, and % does not hold one.', v_label
      using errcode = '22023', hint = 'Pick a date field. Nothing was written.';
  elsif p_shape = 'field:color' and v_type not in ('list', 'boolean') then
    raise exception 'Colour by gives one colour to each value of a choice, and % is not a choice.', v_label
      using errcode = '22023', hint = 'Pick a choice or a yes/no field to colour by. Nothing was written.';
  elsif p_shape = 'field:lane' and v_type not in ('list', 'relation', 'boolean', 'text') then
    raise exception 'A swimlane is one row for each value of a choice, a person, a link or a word, and % holds a %.', v_label, v_type
      using errcode = '22023', hint = 'Pick a choice, a person or a link field. Nothing was written.';
  end if;
  return v_doc ->> 'key';
end;
$fn$;

comment on function custom._view_field_key(uuid, uuid, text, text, jsonb, text[]) is
  'S1-PRIME VIEW-KEYS: a Field named by a saved-view key (by id or key), returned by its immutable KEY; a live Field of the view''s own Table only, of the kind the key needs. Internal to custom.view_keys_check.';

-- ── 5. THE DOOR: S0's BODY, WITH THE GUARD IN FRONT OF THE MERGE ───────────────────────────────
CREATE OR REPLACE FUNCTION custom.view_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id      uuid := nullif(p_spec ->> 'view_id', '')::uuid;
  v_name    text := nullif(btrim(p_spec ->> 'name'), '');
  v_filters jsonb := case when jsonb_typeof(p_spec -> 'filters') = 'object'
                          then p_spec -> 'filters' else '{}'::jsonb end;
  -- What the caller sent as the definition. Never the table and never the filters (both have
  -- their own place above), and never the hand-set order (custom.view_record_order_set's).
  v_in      jsonb := coalesce(case when jsonb_typeof(p_spec -> 'definition') = 'object'
                                   then (p_spec -> 'definition') - 'table_id'::text - 'filters'::text
                                        - 'order'::text
                              end, '{}'::jsonb);
  v_row     record;
  v_def     jsonb;
  v_cleared text[];
  v_set     jsonb;
  v_keys    jsonb;
  v_levels  integer;
  v_old     jsonb := '{}'::jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.view_declare');
  perform custom.assert_store_door(p_organization_id, 'custom.view_declare');
  -- VIEWER, not editor. Writing down a question about a Table is not changing it.
  perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.view_declare');

  if p_table_id is null then
    raise exception 'A saved view is a view OF something — name the table.'
      using errcode = '22004';
  end if;

  -- ── GRID-PRIMITIVES G7: `layout` IS THE VIEW'S KIND; THE GRID'S CHOICES ARE `grid`. A settings
  -- OBJECT sent as `layout` (G1's shape) is moved under `grid` rather than refused.
  if jsonb_typeof(v_in -> 'layout') = 'object' then
    v_in := (v_in - 'layout'::text)
            || jsonb_build_object('grid', coalesce(case when jsonb_typeof(v_in -> 'grid') = 'object'
                                                        then v_in -> 'grid' end, '{}'::jsonb)
                                          || (v_in -> 'layout'));
  end if;

  -- A key sent as JSON null means "clear it"; every other key sent replaces that one key.
  select coalesce(array_agg(e.key) filter (where jsonb_typeof(e.value) = 'null'), '{}'::text[]),
         coalesce(jsonb_object_agg(e.key, e.value) filter (where jsonb_typeof(e.value) <> 'null'), '{}'::jsonb)
    into v_cleared, v_set
    from jsonb_each(v_in) e;

  -- ── S1-PRIME VIEW-KEYS: A KEY CLEARED MUST BE A KEY. Clearing a setting no view has is the same
  -- misspelling as setting one.
  if exists (select 1 from unnest(v_cleared) c(k)
              where not exists (select 1 from custom.view_keys() r where r.path = c.k)) then
    raise exception 'A saved view has no setting called "%", so there is nothing to clear.',
                    (select c.k from unnest(v_cleared) c(k)
                      where not exists (select 1 from custom.view_keys() r where r.path = c.k) limit 1)
      using errcode = '22023', hint = 'The settings a view keeps are listed by custom.view_keys(). Nothing was written.';
  end if;

  -- ONE HIDDEN-COLUMN LIST. A caller that names hidden columns by Field ID (`hidden_fields`, the
  -- mover's shape) has them written where the grid and the gallery read them —
  -- `presentation.hiddenFields`, by Field KEY; the ids stay only as provenance under
  -- `moved_from.hidden_fields` when the view was moved in. Two lists of one thing drift.
  if jsonb_typeof(v_set -> 'hidden_fields') = 'array' then
    select coalesce(jsonb_agg(distinct f.data ->> 'key'), '[]'::jsonb) into v_keys
      from jsonb_array_elements_text(v_set -> 'hidden_fields') x(fid)
      join custom.record f
        on f.organization_id = p_organization_id and f.id::text = x.fid
       and f.data_class = 'field' and f.data ->> 'key' is not null
       and f.data ->> 'entity_definition_id' = p_table_id::text;
    if jsonb_typeof(v_set -> 'moved_from') = 'object' then
      v_set := jsonb_set(v_set, '{moved_from,hidden_fields}', v_set -> 'hidden_fields', true);
    end if;
    v_set := jsonb_set(v_set - 'hidden_fields'::text, '{presentation}',
                       coalesce(case when jsonb_typeof(v_set -> 'presentation') = 'object'
                                     then v_set -> 'presentation' end, '{}'::jsonb)
                       || jsonb_build_object('hiddenFields', v_keys), true);
  end if;

  if v_id is not null then
    select sv.* into v_row
      from platform.saved_view sv
     where sv.id = v_id and sv.organization_id = p_organization_id and sv.deleted_at is null
       and sv.surface_key = 'custom/records'
       and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = p_table_id
       for update;
    if v_row.id is null then
      raise exception 'There is no saved view % here.', v_id
        using errcode = '23503',
              hint = 'It may have been removed, it may be a view of another table, or it may belong to another organization — organizations are hard walls (REC-29).';
    end if;
    v_old := coalesce(v_row.definition, '{}'::jsonb);
  end if;

  -- ── S1-PRIME VIEW-KEYS: EVERY KEY SENT IS JUDGED BY THE REGISTRY, AND THE FILTER BY THE ONE
  -- COMPILER, BEFORE ANYTHING IS WRITTEN. `moved_from` is the server's and is not judged here.
  v_set := (custom.view_keys_check(p_organization_id, p_table_id, v_set - 'moved_from'::text,
                                   v_old))
           || coalesce(case when v_set ? 'moved_from' then jsonb_build_object('moved_from', v_set -> 'moved_from') end, '{}'::jsonb);
  -- `filters` is the FLAT map the digests and the notifier read (custom.agg_view_admits); a Rule
  -- expression there would be refused by name the first time a subscription asks it, so it is
  -- refused here, with where it belongs.
  if p_spec ? 'filters' and v_filters <> '{}'::jsonb then
    if custom.filter_is_rule(v_filters) then
      raise exception 'A view''s filters are the flat Field-to-value map, and this is a Rule expression.'
        using errcode = '22023', hint = 'Send a nested question as definition.where (S2-PRIME); the digests and the notifier read filters. Nothing was written.';
    end if;
    perform custom.record_filter_sql(p_organization_id, p_table_id, v_filters);
  end if;

  if v_id is not null then
    -- MERGE. What the caller did not send stays exactly as it was.
    v_def := coalesce(v_row.definition, '{}'::jsonb);
    v_set := v_set - 'moved_from'::text;
    v_cleared := array_remove(v_cleared, 'moved_from');
    if jsonb_typeof(v_set -> 'grid') = 'object' and jsonb_typeof(v_def -> 'grid') = 'object' then
      v_set := jsonb_set(v_set, '{grid}', (v_def -> 'grid') || (v_set -> 'grid'));
    end if;
    v_def := (v_def - v_cleared) || v_set;
    if p_spec ? 'filters' then
      v_def := jsonb_set(v_def, '{filters}', v_filters, true);
    end if;
    -- The table is the view's for life.
    v_def := jsonb_set(v_def, '{table_id}', to_jsonb(p_table_id), true);
    if not (v_def ? 'filters') then
      v_def := jsonb_set(v_def, '{filters}', '{}'::jsonb, true);
    end if;
    if v_def ? 'grid' then
      v_def := jsonb_set(v_def, '{grid}', custom.grid_layout_check(v_def -> 'grid', 'view'));
    end if;
  else
    -- THE ONE SHAPE THE NOTIFIER READS. `custom.agg_view_admits` and
    -- `custom.agg_view_admits_state` both take `{"table_id": …, "filters": {…}}`, so a
    -- view saved here needs no translation before a subscription can be written over it.
    -- THE CASTS ARE NOT DECORATION (42725 without them: `jsonb - text` vs `jsonb - text[]`).
    v_def := jsonb_build_object('table_id', p_table_id, 'filters', v_filters) || v_set;
    if v_def ? 'grid' then
      v_def := jsonb_set(v_def, '{grid}', custom.grid_layout_check(v_def -> 'grid', 'view'));
    end if;
  end if;

  -- ── S1-PRIME VIEW-KEYS: THE KEYS THAT MUST AGREE, ASKED OF THE VIEW AS IT WILL BE STORED.
  if nullif(v_def ->> 'swimlane_field', '') is not null
     and v_def ->> 'swimlane_field' = v_def ->> 'group_field' then
    raise exception 'The swimlanes and the columns are both %, so every lane would hold one column.', v_def ->> 'swimlane_field'
      using errcode = '22023', hint = 'A swimlane cuts the board by a second field. Nothing was written.';
  end if;
  v_levels := case when jsonb_typeof(v_def -> 'presentation' -> 'grouping') = 'object'
                   then 1 + coalesce(case when jsonb_typeof(v_def -> 'presentation' -> 'grouping' -> 'then') = 'array'
                                          then jsonb_array_length(v_def -> 'presentation' -> 'grouping' -> 'then') end, 0)
                   else 0 end;
  if v_levels > 3 then
    raise exception 'A view groups at most three levels deep, and this one would group %.', v_levels
      using errcode = '22023', hint = 'Nothing was written.';
  end if;

  if v_id is not null then
    update platform.saved_view
       set name = coalesce(v_name, name), definition = v_def, updated_at = now(), version = version + 1
     where id = v_id and organization_id = p_organization_id;
    return v_id;
  end if;

  insert into platform.saved_view
    (name, surface_key, subject_id, definition, organization_id, created_by, visibility)
  values (coalesce(v_name, 'Saved view'), 'custom/records', p_table_id, v_def, p_organization_id,
          custom.query_principal(), 'internal'::platform.visibility)
  returning id into v_id;
  return v_id;
end;
$function$;

comment on function custom.view_declare(uuid, uuid, jsonb) is
  'S1-PRIME VIEW-KEYS (on S0 ONE-SAVED-VIEW): THE one door that writes a record-store saved view (platform.saved_view, surface custom/records). VIEWER on the Table. Every definition key sent is judged by custom.view_keys_check against the registry custom.view_keys() (undeclared keys, archived or foreign Fields and wrong Field kinds are refused; Fields are stored by key), the question (where, filters) by custom.record_filter_sql(org, table, …); a Rule under filters is refused. With spec.view_id it MERGES: name only when sent, filters only when the key is sent, each spec.definition key replaces that key, a key sent as null is removed, grid merges one level, and table_id / order / moved_from are never taken from a caller. A swimlane is never the board''s column field; grouping is at most three levels. An update must name a view of this Table (23503 otherwise).';
