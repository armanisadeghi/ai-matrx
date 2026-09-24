-- target: branch,production
-- additive: yes
--   It ADDS five functions — custom.filter_is_rule, custom.rule_sql_op, custom.rule_filter_node_sql,
--   custom.record_filter_sql(uuid, uuid, jsonb), custom.rule_members_visible — and a four-argument
--   overload of custom.pipeline_board, with three platform.client_callable_door rows. It REPLACES
--   five bodies, each declared below with the body it was written against: the list door, the
--   aggregate and its SQL builder call the new one fragment; the three-argument board is the new
--   board with no filter; the flat compiler refuses a Rule expression by name instead of silently
--   matching nothing. Nothing is dropped or revoked; no table, trigger, policy or grant is
--   touched. Two chair-step files follow it: the grant, and the Rule shape guard at every depth
--   (a trigger function's body, so it is a chair step rather than a guarded replacement).
--   The inverse is `migrations/inverse/filtergroups_a_views_nested_question_is_one_where_clause_down.sql`.
-- guard: custom/system_enabled
-- lock: custom,platform
-- based-on: custom.record_filter_sql(jsonb) c0ff44aa32a1367b0ea9f30815f002605ff77b08daea2109463dacfb6bfaace2
-- based-on: custom.read_records_matching(uuid, uuid, jsonb, boolean, integer, integer) 6c56bdb297bb52d675f1f7541e032c1ef660476b847c92feeb6bc27e66b3b512
-- based-on: custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) 5be78bb8bcd509e3409e9bbab2f8a84c09493f97af5b48d93b398b460c4d81d4
-- based-on: custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) 2fc059996700007178ba555217f1ffc18d39e67a0324efab1463c6792245c964
-- based-on: custom.pipeline_board(uuid, uuid, text) 6ddbb01931edaaf43300618b5698baaec4e2b1ea1d2a09ac20484db81260e229
--
-- LANE S2-PRIME FILTER-GROUPS (Unified Data System program; UI-CHAMPIONS-PLAN-ATTACK holes 2, 3, 5).
-- A VIEW'S QUESTION NESTS, AND EVERY READ DOOR ASKS IT IN THE SAME ONE WHERE CLAUSE.
--
-- THE USE CASE. Rosa Delgado dispatches for Topa Topa Plumbing & Rooter, eleven technicians
-- across the Ojai Valley. Her morning view is
--   (status is Open OR status is Scheduled) AND (city is Ojai OR technician is Maria)
--   AND NOT priority is Low
-- and she reads it three ways: as the grid, as the board by status, and as the count and dollar
-- total on her dashboard. All three must be the same jobs.
--
-- WHAT WAS MISSING. The Rule shape {op, args} already nests to any depth (records rule.ts) and
-- custom.rule_eval already answers it for ONE record. Nothing compiled it into SQL, so the read
-- doors spoke only the flat AND-only map, the board took no filter at all, and the only door that
-- answered a Rule over a table — custom.rule_members — looped the evaluator over every row with no
-- visibility check and no EXECUTE for a signed-in person, so ViewSwitcher's membership views could
-- not load in a browser.
--
-- WHAT THIS DOES.
--   1. custom.record_filter_sql(org, table, filter) is THE fragment: a flat map goes to the old
--      compiler unchanged; a Rule expression is compiled by custom.rule_filter_node_sql, node for
--      node what custom.rule_eval answers (three-valued AND / OR / NOT in the evaluator's own order;
--      eq, ne, lt, lte, gt, gte, matches, present, length, add, sub, mul, div; const and field by id).
--      Fields resolve to THIS table's live fields; a field hidden from the reader is undecided to
--      them; a choice compares on the stored key. Nodes a list cannot ask are refused by name.
--   2. read_records_matching (grid), agg_sql → record_aggregate / dashboard_run (counts, totals,
--      charts) and the new pipeline_board(org, table, measure, filter) (board headings) all call it.
--      pipeline_board(org, table, measure) stays callable and is the new board with no filter.
--   3. custom.rule_members_visible(org, rule, limit, offset): the read door asked the Rule's test —
--      walled, laddered, masked, paged. custom.rule_members is declared server-only.
--   4. (chair-step file filtergroups_the_rule_guard_checks_every_depth.sql) custom._rule_shape_guard
--      checks field ids and node names at EVERY depth (it stopped at twelve JSON steps — six groups).
--
-- LOCKS. create function / create or replace function / insert / comment on only. Not
-- window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ── 1. IS THIS FILTER A RULE EXPRESSION? ─────────────────────────────────────────────────────
-- The read doors take ONE filter argument and it has two shapes. The flat map — a field key to a
-- scalar, `null` or a window — is what `definition.filters`, the dashboards and the notifier have
-- always carried. A Rule expression is `{op, args}` (REC-15), the shape `custom.rule_eval`, the
-- condition builder and every membership Rule already speak, and it nests to any depth. An object
-- whose `op` is a word and which carries `args`, or whose `op` is one of the Rule nodes, is the
-- second; everything else is the first. A flat map would have to name a column literally `op`
-- whose value is a Rule node's name to be read the other way.
create function custom.filter_is_rule(p_filter jsonb)
returns boolean
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select coalesce(
    p_filter is not null
    and jsonb_typeof(p_filter) = 'object'
    and jsonb_typeof(p_filter -> 'op') = 'string'
    and (jsonb_typeof(p_filter -> 'args') = 'array'
         or left(p_filter ->> 'op', 3) = 'fx.'
         or exists (select 1 from custom.rule_node_kinds() n where n.node = p_filter ->> 'op')),
    false);
$fn$;

comment on function custom.filter_is_rule(jsonb) is
  'S2-PRIME FILTER-GROUPS: true when a read door''s filter is a Rule expression ({op, args}, any depth) rather than the flat field-key map. custom.record_filter_sql(org, table, filter) compiles the first and hands the second to custom.record_filter_sql(filter), unchanged.';

-- ── 2. ONE ARM OF THE EVALUATOR, PER ROW. ─────────────────────────────────────────────────────
-- The comparison, arithmetic and word arms of `custom.rule_eval`, character for character in what
-- they answer and what they refuse: an empty side answers `null` (undecided), `lt` on two words is
-- refused rather than converted, dividing by nothing is refused by name. The compiled WHERE clause
-- calls this once per node per row, so a view's filter and the Rule evaluator can never disagree
-- about what `gt` does to an empty value.
create function custom.rule_sql_op(p_op text, p_a jsonb, p_b jsonb default null)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
begin
  if p_op = 'present' then
    return to_jsonb(p_a is not null and jsonb_typeof(p_a) <> 'null');
  elsif p_op = 'length' then
    if p_a is null or jsonb_typeof(p_a) = 'null' then return 'null'::jsonb; end if;
    if jsonb_typeof(p_a) <> 'string' then
      raise exception 'this rule measures how long something is, and it was given a %', jsonb_typeof(p_a)
        using errcode = '22023', hint = 'REC-15: length takes words.';
    end if;
    return to_jsonb(length(p_a #>> '{}'));
  end if;

  if p_a is null or jsonb_typeof(p_a) = 'null' or p_b is null or jsonb_typeof(p_b) = 'null' then
    return 'null'::jsonb;
  end if;

  if p_op = 'eq' then
    return to_jsonb(p_a = p_b);
  elsif p_op = 'ne' then
    return to_jsonb(p_a <> p_b);
  elsif p_op = 'matches' then
    if jsonb_typeof(p_a) <> 'string' or jsonb_typeof(p_b) <> 'string' then
      raise exception 'this rule checks how words are written, and it was given a % and a %',
                      jsonb_typeof(p_a), jsonb_typeof(p_b)
        using errcode = '22023', hint = 'REC-15: matches takes words and a pattern.';
    end if;
    return to_jsonb((p_a #>> '{}') ~ (p_b #>> '{}'));
  end if;

  if jsonb_typeof(p_a) <> 'number' or jsonb_typeof(p_b) <> 'number' then
    raise exception 'this rule compares numbers, and it was given a % and a %',
                    jsonb_typeof(p_a), jsonb_typeof(p_b)
      using errcode = '22023',
            hint = format('REC-15: %s works on numbers. Nothing is converted for you, because a converted comparison answers about a different value.', p_op);
  end if;

  if p_op = 'lt'  then return to_jsonb((p_a #>> '{}')::numeric <  (p_b #>> '{}')::numeric);
  elsif p_op = 'lte' then return to_jsonb((p_a #>> '{}')::numeric <= (p_b #>> '{}')::numeric);
  elsif p_op = 'gt'  then return to_jsonb((p_a #>> '{}')::numeric >  (p_b #>> '{}')::numeric);
  elsif p_op = 'gte' then return to_jsonb((p_a #>> '{}')::numeric >= (p_b #>> '{}')::numeric);
  elsif p_op = 'add' then return to_jsonb((p_a #>> '{}')::numeric +  (p_b #>> '{}')::numeric);
  elsif p_op = 'sub' then return to_jsonb((p_a #>> '{}')::numeric -  (p_b #>> '{}')::numeric);
  elsif p_op = 'mul' then return to_jsonb((p_a #>> '{}')::numeric *  (p_b #>> '{}')::numeric);
  elsif p_op = 'div' then
    if (p_b #>> '{}')::numeric = 0 then
      raise exception 'this rule divides by nothing'
        using errcode = '22012', hint = 'REC-15: div. The rule needs a different test, not a different number.';
    end if;
    return to_jsonb((p_a #>> '{}')::numeric / (p_b #>> '{}')::numeric);
  end if;

  raise exception 'this rule asks the system to %, and a filter does not know how', p_op
    using errcode = '22023',
          hint = 'custom.rule_filter_node_sql hands this function only the comparison, arithmetic and word nodes. Reaching here is a defect in that compiler, not in the rule.';
end;
$fn$;

comment on function custom.rule_sql_op(text, jsonb, jsonb) is
  'S2-PRIME FILTER-GROUPS: the comparison / arithmetic / word arms of custom.rule_eval, evaluated once per row by the WHERE clause custom.rule_filter_node_sql writes. Same answers, same refusals, same sentences.';

-- ── 3. THE COMPILER: ONE RULE NODE → ONE SQL EXPRESSION OVER THE ROW `r`. ──────────────────────
-- It answers a jsonb expression that works out, for the row `r` of `custom.record`, exactly what
-- `custom.rule_eval(org, node, custom.record_values_of(r))` answers — true, false, `null` for
-- undecided, a number or words — so the read door can ask it of every row at once instead of
-- looping the evaluator over the table.
--
-- AND / OR / NOT keep the evaluator's order and its three answers. `and` stops at the first
-- false (false) or the first undecided (undecided); `or` is true at the first true and false
-- otherwise; `not` of undecided is undecided. Each argument is worked out ONCE per row: the
-- chains are `case <truth> when …`, never a second copy of the argument.
--
-- A FIELD IS POINTED AT BY ITS ID (REC-17) and must be a live field OF THIS TABLE. A field this
-- reader may not see is `null` to them — undecided — so a filter can never be used to probe a
-- column the read door would mask. A choice compared with `eq`/`ne` against the words a person
-- typed is compared against what is STORED, through the same `custom.choice_key_of` the flat
-- filter uses, so "status is Open" means the same thing in both shapes.
--
-- WHAT A FILTER CANNOT ASK is refused by name, before anything is read: the nodes that need a
-- write in progress (`previous`, `actor_at_least`, `stage_count`, `sibling_count`), a parent or a
-- merge field, a joined sentence (`concat` reads display words through the relation ladder), and
-- the formula language's `fx.*` nodes. Every other node of `custom.rule_node_kinds()` compiles.
create function custom.rule_filter_node_sql(p_organization_id uuid, p_table_id uuid, p_node jsonb,
                                            p_map jsonb, p_visible text[])
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_op    text;
  v_args  jsonb;
  v_key   text;
  v_parts text[] := '{}';
  v_sql   text;
  v_one   jsonb;
  v_a     jsonb;
  v_b     jsonb;
  v_fkey  text;
  v_const jsonb;
  v_i     integer;
begin
  if p_node is null or jsonb_typeof(p_node) <> 'object' then
    raise exception 'this rule''s test is not written in a shape the system can work out'
      using errcode = '22023',
            hint = 'REC-15: a Rule expression is an object — one of the nodes custom.rule_node_kinds() lists.';
  end if;
  if p_node ?| array['field_name', 'field_key', 'field_label'] then
    raise exception 'this rule names a field instead of pointing at it'
      using errcode = '22023',
            hint = 'REC-17: a Rule references Fields by id, never by name — {"field": "<the field''s id>"}. A name changes and the rule would stop resolving; an id does not.';
  end if;

  v_op := p_node ->> 'op';
  if left(coalesce(v_op, ''), 3) = 'fx.'
     or v_op in ('previous', 'actor_at_least', 'stage_count', 'sibling_count', 'concat')
     or p_node ?| array['parent_field', 'merge_field', 'grandparent_field', 'ancestor_field'] then
    raise exception 'a filter cannot ask "%" of every record at once',
                    coalesce(v_op, (select k from jsonb_object_keys(p_node) k
                                     where k in ('parent_field', 'merge_field', 'grandparent_field', 'ancestor_field') limit 1))
      using errcode = '0A000',
            hint = 'A view''s filter compares a record''s own columns: is, is not, more / less than, at least / at most, matches, has been answered, how long, + − × ÷, and ALL / ANY / NOT groups of those, nested as deep as you like. What a write is doing (previous, who is moving it, how full a column is, a sibling like it), a parent''s or a merge field''s answer, a joined sentence and the formula functions are for Rules that judge one record, not for a list. Nothing was read.';
  end if;

  if p_node ? 'const' then
    return format('%L::jsonb', (p_node -> 'const')::text);
  end if;

  if p_node ? 'field' then
    if jsonb_typeof(p_node -> 'field') <> 'string'
       or (p_node ->> 'field') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'this rule points at a field with % instead of with its id', p_node ->> 'field'
        using errcode = '22023',
              hint = 'REC-17: {"field": "<the field''s id>"}. What is written here is not an id at all.';
    end if;
    select f.data ->> 'key' into v_key
      from custom.record f
     where f.organization_id = p_organization_id
       and f.id = (p_node ->> 'field')::uuid
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id;
    if v_key is null then
      raise exception 'this filter points at a field that is not one of this table''s fields'
        using errcode = '23503',
              hint = 'REC-17 / FLD-8: a filter reaches a Field by its id, and the Field has to be a live field OF the table being read. A field that was deleted, or one of another table, answers nothing rather than something wrong.';
    end if;
    perform custom.agg_assert_key(v_key);
    if p_visible is not null and not (v_key = any (p_visible)) then
      -- HIDDEN FROM THIS READER, SO UNKNOWN TO THIS READER. The read door masks this column in
      -- every document it hands them; the filter answers about it the same way.
      return '''null''::jsonb';
    end if;
    return format('(custom.record_values_of(r) -> %L)', v_key);
  end if;

  v_args := coalesce(p_node -> 'args', '[]'::jsonb);
  if v_op is null then
    raise exception 'this rule''s test does not say what it does'
      using errcode = '22023',
            hint = 'REC-15: every expression node is a const, a field, a parent_field, or an op with its args. custom.rule_node_kinds() is the whole list.';
  end if;
  if not (v_op = any (select n.node from custom.rule_node_kinds() n)) then
    raise exception 'this rule asks the system to %, and it does not know how', v_op
      using errcode = '22023',
            hint = 'REC-15: select * from custom.rule_node_kinds() is the closed list of what a Rule can do. A node outside it is refused rather than ignored.';
  end if;
  if jsonb_typeof(v_args) <> 'array' then
    raise exception 'this rule''s % carries its arguments as a %, not as a list', v_op, jsonb_typeof(v_args)
      using errcode = '22023', hint = 'REC-15: {"op": "…", "args": [ … ]}.';
  end if;

  if v_op = 'and' then
    -- Innermost first: `case <truth of arg n> when false … when undecided … else true end`,
    -- wrapped outward, so arg 1 is asked first and each is asked once.
    v_sql := '''true''::jsonb';
    for v_i in reverse (jsonb_array_length(v_args) - 1)..0 loop
      v_sql := format(
        'case coalesce(custom.rule_truth(%s)::text, ''undecided'') when ''false'' then ''false''::jsonb when ''undecided'' then ''null''::jsonb else %s end',
        custom.rule_filter_node_sql(p_organization_id, p_table_id, v_args -> v_i, p_map, p_visible), v_sql);
    end loop;
    return '(' || v_sql || ')';
  elsif v_op = 'or' then
    for v_one in select e from jsonb_array_elements(v_args) e loop
      v_parts := array_append(v_parts, format('when custom.rule_truth(%s) is true then ''true''::jsonb',
                   custom.rule_filter_node_sql(p_organization_id, p_table_id, v_one, p_map, p_visible)));
    end loop;
    if cardinality(v_parts) = 0 then
      return '''false''::jsonb';
    end if;
    return '(case ' || array_to_string(v_parts, ' ') || ' else ''false''::jsonb end)';
  elsif v_op = 'not' then
    return format(
      '(case coalesce(custom.rule_truth(%s)::text, ''undecided'') when ''undecided'' then ''null''::jsonb when ''true'' then ''false''::jsonb else ''true''::jsonb end)',
      custom.rule_filter_node_sql(p_organization_id, p_table_id, v_args -> 0, p_map, p_visible));
  elsif v_op in ('present', 'length') then
    return format('custom.rule_sql_op(%L, %s)', v_op,
                  custom.rule_filter_node_sql(p_organization_id, p_table_id, v_args -> 0, p_map, p_visible));
  end if;

  -- The two-sided nodes. A choice compared with the words a person typed is compared against
  -- the stored key, exactly as the flat filter normalises it (CHOICE-VALUE).
  v_a := v_args -> 0;
  v_b := v_args -> 1;
  if v_op in ('eq', 'ne') and p_map is not null and p_map <> '{}'::jsonb then
    for v_i in 0..1 loop
      v_one   := case when v_i = 0 then v_a else v_b end;
      v_const := case when v_i = 0 then v_b else v_a end;
      continue when v_one is null or jsonb_typeof(v_one) <> 'object' or not (v_one ? 'field') or v_one ? 'op'
                 or v_const is null or jsonb_typeof(v_const) <> 'object' or not (v_const ? 'const')
                 or jsonb_typeof(v_const -> 'const') <> 'string';
      select f.data ->> 'key' into v_fkey
        from custom.record f
       where f.organization_id = p_organization_id
         and f.id = nullif(v_one ->> 'field', '')::uuid
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null;
      if v_fkey is not null and p_map ? v_fkey
         and custom.choice_key_of(p_map -> v_fkey, v_const ->> 'const') is not null then
        v_const := jsonb_build_object('const', custom.choice_key_of(p_map -> v_fkey, v_const ->> 'const'));
        if v_i = 0 then v_b := v_const; else v_a := v_const; end if;
      end if;
    end loop;
  end if;
  return format('custom.rule_sql_op(%L, %s, %s)', v_op,
                custom.rule_filter_node_sql(p_organization_id, p_table_id, v_a, p_map, p_visible),
                custom.rule_filter_node_sql(p_organization_id, p_table_id, v_b, p_map, p_visible));
end;
$fn$;

comment on function custom.rule_filter_node_sql(uuid, uuid, jsonb, jsonb, text[]) is
  'S2-PRIME FILTER-GROUPS: compiles one Rule expression node (any depth) into a SQL expression over the row r of custom.record that answers what custom.rule_eval answers for that row. Field ids resolve to this table''s live fields; a field hidden from the reader is undecided; choices compare on the stored key; nodes a list cannot ask are refused by name (0A000).';

-- ── 4. THE ONE FILTER FRAGMENT, IN BOTH SHAPES. ───────────────────────────────────────────────
-- `custom.read_records_matching` (the grid), `custom.agg_sql` (every count, total and chart
-- through `custom.record_aggregate`) and `custom.pipeline_board` (the board's column headings)
-- all write their WHERE clause with THIS, so the same question over the same table answers the
-- same rows through every door. A flat map goes to `custom.record_filter_sql(jsonb)` unchanged.
-- A Rule expression is compiled here, with the reader's own visible columns.
create function custom.record_filter_sql(p_organization_id uuid, p_table_id uuid, p_filter jsonb)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_who     uuid;
  v_level   public.permission_level;
  v_visible text[];
begin
  if not custom.filter_is_rule(p_filter) then
    return custom.record_filter_sql(p_filter);
  end if;

  -- WHICH COLUMNS THIS READER MAY SEE, asked the way the read door asks it: the reader's level
  -- on the TABLE, then the fields at that level. The server lane (no principal) sees every column.
  v_who := custom.query_principal();
  if v_who is not null then
    v_level := custom.effective_level(v_who, p_organization_id, p_table_id);
    select coalesce(array_agg(f.field_key), '{}'::text[])
      into v_visible
      from iam.visible_field_ids(v_who, p_organization_id, p_table_id, v_level, 'read') f;
  end if;

  return format('(custom.rule_truth(%s) is true)',
                custom.rule_filter_node_sql(p_organization_id, p_table_id, p_filter,
                                            custom.choice_field_map(p_organization_id, p_table_id),
                                            v_visible));
end;
$fn$;

comment on function custom.record_filter_sql(uuid, uuid, jsonb) is
  'S2-PRIME FILTER-GROUPS: THE one WHERE fragment for a read door''s filter, in either shape — a flat field-key map (handed to custom.record_filter_sql(jsonb) unchanged) or a Rule expression {op, args} nested to any depth (compiled by custom.rule_filter_node_sql over the reader''s visible columns). Used by read_records_matching, agg_sql (record_aggregate, dashboard_run) and pipeline_board.';

CREATE OR REPLACE FUNCTION custom.record_filter_sql(p_filter jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_where text[] := '{}';
  v_key   text;
begin
  -- S2-PRIME FILTER-GROUPS: A RULE EXPRESSION IS NOT A FLAT MAP, AND IS NEVER READ AS ONE. Read
  -- here, `{"op": "and", "args": [...]}` would become `op = 'and' and args = '[...]'` — a filter
  -- that silently matches nothing. It is compiled by the three-argument form, which knows the
  -- table its field ids belong to and which columns the reader may see.
  if custom.filter_is_rule(p_filter) then
    raise exception 'this filter is a Rule expression, and it has to be asked of a table'
      using errcode = '22023',
            hint = 'Call custom.record_filter_sql(organization, table, filter): it resolves every field id to that table''s own column and asks it over the reader''s visible columns. Nothing was read.';
  end if;

  -- A SCALAR IS AN EQUALITY. `null` IS UNSET. AN OBJECT IS A WINDOW. This is the shape
  -- `platform.saved_view.definition -> 'filters'` has always carried and the shape
  -- `custom.record_aggregate(p_filter)` has always taken — read here once, for both.
  if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
    for v_key in select k from jsonb_object_keys(p_filter) k loop
      if jsonb_typeof(p_filter -> v_key) = 'object' then
        v_where := array_append(v_where, custom.dashboard_window_sql(v_key, p_filter -> v_key));
      elsif jsonb_typeof(p_filter -> v_key) = 'null' then
        -- LIMITS-FIX 2026-09-21 — THE THIRD STATE. A tick box has three answers: yes, no,
        -- and nobody has said yet. Asking for `null` used to compare the missing value
        -- against the empty string and answer NO ROWS.
        v_where := array_append(v_where, format('(%s) is null', custom.agg_value_sql(v_key)));
      else
        v_where := array_append(v_where,
          format('%s = %L', custom.agg_value_sql(v_key), p_filter ->> v_key));
      end if;
    end loop;
  end if;

  -- `true` rather than an empty string, so every caller writes `and (<this>)` and no caller
  -- has to remember whether the fragment brings its own conjunction.
  if cardinality(v_where) = 0 then
    return 'true';
  end if;
  return '(' || array_to_string(v_where, ' and ') || ')';
end;
$function$;

CREATE OR REPLACE FUNCTION custom.read_records_matching(p_organization_id uuid, p_table_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, document jsonb, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_limit    integer;
  v_sql      text;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  -- THE ORGANIZATION WALL, FIRST, AND IN THIS DOOR'S OWN BODY. `custom.record_aggregate` —
  -- the door that COUNTS the number this one opens — asks exactly this on its first line, and
  -- its twin asking less would mean a number and its rows were judged by two different sets of
  -- questions. It also answers the store's own switch: a caller reaching a closed store is
  -- refused before a Table id is even looked at.
  --
  -- 🚨 AND IT IS WHAT MAKES THE ROW DECISION READABLE FROM THIS BODY (check:store-doors-decide,
  -- 2026-09-22). This door decides every row through `custom.visible_predicate_sql`, which asks
  -- `custom.visible_set` — the one ladder — and writes its four arms into this door's own WHERE.
  -- That is a real decision, but it happens through a helper and inside a generated statement,
  -- so a census reading this body found no ladder call in it and said so. A door whose access
  -- decision cannot be READ off it is one refactor away from a door that does not make one.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records_matching');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_matching');
  v_limit := custom.page_size(p_organization_id, 'custom.read_records_matching', p_limit, 200);

  -- STEP 2, once per request: which fields this caller may see, at which level. The level
  -- used for the field question is the caller's level on the TABLE, so a page of a hundred
  -- records asks the field question once, not a hundred times.
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, p_table_id, v_level, 'read') f;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb),
         coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_notices, v_key_ids, v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id;

  -- Only the fields that are actually hidden get a notice.
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_notices
    from jsonb_each(v_notices) e
   where not (e.key = any (v_visible));

  -- STEP 1, ONCE: Visibility, and the caller's question, in the SAME where clause.
  -- `custom.visible_predicate_sql` asks `custom.visible_set` once and writes out the same
  -- four arms `custom.read_records` branches on, as a predicate the planner can drive an
  -- index with. `custom.record_filter_sql` writes the caller's question the one way this
  -- database writes it. Neither the caller's keys nor the caller's values ever become SQL:
  -- a key is refused by shape (custom.agg_assert_key), a value is a quoted literal, and a
  -- moment in a window is cast to timestamptz in this transaction before the statement is
  -- built.
  v_sql := format($q$
    select r.id, custom.record_values_of(r) as doc
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %s
       and %s
     order by r.created_at desc, r.id
     limit %s offset %s
  $q$,
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r'),
    -- CHOICE-VALUE. A chart hands back the RENDERED word of a dropdown and the store holds
    -- the key, so the filter is normalised to what is STORED before the statement is built —
    -- the same one line `custom.record_aggregate` runs before it counts.
    --
    -- S2-PRIME FILTER-GROUPS: the question comes in either shape. A flat map is normalised as
    -- before; a Rule expression ({op, args}, ALL / ANY / NOT to any depth) is compiled by the
    -- same one fragment the aggregate and the board write, over this reader's visible columns.
    custom.record_filter_sql(p_organization_id, p_table_id,
      case when custom.filter_is_rule(p_filter) then p_filter
           else custom.choice_filter_normalize(custom.choice_field_map(p_organization_id, p_table_id), p_filter) end),
    v_limit, greatest(coalesce(p_offset, 0), 0));

  for v_rec in execute v_sql loop
    id := v_rec.id;
    document := custom.choice_render(p_organization_id, p_table_id,
                  custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
    level := v_level;
    return next;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.record_aggregate(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(groups jsonb, measures jsonb, row_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_map jsonb;
  v_row record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_aggregate');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.record_aggregate');

  -- CHOICE-VALUE. One map per call: the filter is normalised to what is STORED before the
  -- statement is built, and the groups are named on the way out.
  v_map := custom.choice_field_map(p_organization_id, p_table_id);

  for v_row in execute custom.agg_sql(p_organization_id, p_table_id, p_group_by, p_measures,
                                      p_bucket,
                                      -- S2-PRIME: a Rule expression passes through to the one fragment; a flat map is normalised.
                                      case when custom.filter_is_rule(p_filter) then p_filter
                                           else custom.choice_filter_normalize(v_map, p_filter) end,
                                      p_limit, p_required) loop
    groups    := custom.choice_render_groups(v_map, v_row.groups);
    measures  := v_row.measures;
    row_count := v_row.row_count;
    return next;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.agg_sql(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_group_sel  text[] := '{}';
  v_group_lbl  text[] := '{}';
  v_meas_sel   text[] := '{}';
  v_key        text;
  v_op         text;
  v_by         text;
  m            jsonb;
  v_sql        text;
  v_val        text;
begin
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.record_aggregate: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  for v_key in select (e #>> '{}') from jsonb_array_elements(coalesce(p_group_by, '[]'::jsonb)) e loop
    v_group_sel := array_append(v_group_sel, custom.agg_value_sql(v_key));
    v_group_lbl := array_append(v_group_lbl, quote_literal(custom.agg_assert_key(v_key)));
  end loop;

  if p_bucket is not null and jsonb_typeof(p_bucket) = 'object' then
    v_key := custom.agg_assert_key(p_bucket ->> 'key');
    v_by  := lower(coalesce(p_bucket ->> 'by', 'month'));
    if not (v_by = any (custom.agg_buckets())) then
      raise exception 'custom.record_aggregate: "%" is not a bucket', v_by
        using errcode = '22023',
              hint = format('Legal buckets: %s.', array_to_string(custom.agg_buckets(), ', '));
    end if;
    if v_key = 'created_at' then
      v_group_sel := array_append(v_group_sel, format('date_trunc(%L, r.created_at)::text', v_by));
    else
      v_group_sel := array_append(v_group_sel,
        format('date_trunc(%L, (nullif(%s, '''')::timestamptz))::text', v_by, custom.agg_value_sql(v_key)));
    end if;
    v_group_lbl := array_append(v_group_lbl, quote_literal(v_key || '_' || v_by));
  end if;

  for m in select e from jsonb_array_elements(coalesce(p_measures, '[]'::jsonb)) e loop
    v_op := lower(coalesce(m ->> 'op', 'count'));
    if not (v_op = any (custom.agg_operations())) then
      raise exception 'custom.record_aggregate: "%" is not a measure', v_op
        using errcode = '22023',
              hint = format('Legal measures: %s.', array_to_string(custom.agg_operations(), ', '));
    end if;
    if v_op = 'count' then
      v_meas_sel := array_append(v_meas_sel, quote_literal('count') || ', count(*)::numeric');
    else
      v_key := custom.agg_assert_key(m ->> 'key');
      v_val := custom.agg_value_sql(v_key);
      -- ── GRID-PRIMITIVES G1: THE SUMMARY BAR'S OTHER FOUR. ────────────────────────────
      -- BLANK is what the older grid's summary bar means by it (column-summaries.ts
      -- isBlank): no value, JSON null, or the empty string. An empty list is a value.
      if v_op = 'median' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('(percentile_cont(0.5) within group (order by nullif(%s, '''')::numeric))::numeric', v_val));
      elsif v_op = 'filled' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('(count(*) filter (where nullif(%s, '''') is not null))::numeric', v_val));
      elsif v_op = 'empty' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('(count(*) filter (where nullif(%s, '''') is null))::numeric', v_val));
      elsif v_op = 'unique' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('(count(distinct nullif(%s, '''')))::numeric', v_val));
      else
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('%s(nullif(%s, '''')::numeric)::numeric', v_op, v_val));
      end if;
    end if;
  end loop;
  if cardinality(v_meas_sel) = 0 then
    v_meas_sel := array[quote_literal('count') || ', count(*)::numeric'];
  end if;

  v_sql := format($q$
    select %s as groups,
           jsonb_build_object(%s) as measures,
           count(*)::bigint as row_count
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %s
       and %s
     %s
     order by count(*) desc
     limit %s
  $q$,
    case when cardinality(v_group_sel) = 0 then '''{}''::jsonb'
         else 'jsonb_build_object(' ||
              (select string_agg(v_group_lbl[i] || ', ' || v_group_sel[i], ', ')
                 from generate_subscripts(v_group_sel, 1) i) || ')' end,
    array_to_string(v_meas_sel, ', '),
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                 p_required::public.permission_level, 'r'),
    -- S2-PRIME FILTER-GROUPS: the one fragment, in either shape (flat map or Rule expression).
    custom.record_filter_sql(p_organization_id, p_table_id, p_filter),
    case when cardinality(v_group_sel) = 0 then ''
         else 'group by ' || (select string_agg(i::text, ', ')
                                from generate_subscripts(v_group_sel, 1) i) end,
    custom.page_size(p_organization_id, 'custom.record_aggregate', p_limit, 200));

  return v_sql;
end;
$function$;

-- ── 5. THE BOARD ASKS THE SAME QUESTION AS THE CARDS UNDER IT. ────────────────────────────────
-- `custom.pipeline_board(org, table, measure)` counted and totalled EVERY record this person may
-- see, whatever the view above it asked — so a board narrowed to "Open or Scheduled jobs in Ojai"
-- drew Ojai's cards under headings that counted the whole company. This overload takes the view's
-- filter, in either shape, and narrows the counts and totals with the one fragment the grid uses.
-- The three-argument door stays callable, and is this door with no filter.
create function custom.pipeline_board(p_organization_id uuid, p_table_id uuid, p_measure text, p_filter jsonb)
returns table(stage_key text, stage_label text, stage_position integer, cards bigint, total numeric,
              wip_limit integer, over_limit boolean)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_read   jsonb;
  v_key    text;
  v_where  text;
  v_narrow boolean;
  v_ids    uuid[];
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_board');
  -- VIS-5 / T10 (LADDER-CAP): and the wall after it — a Table she may not know exists is
  -- not described to her.
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.pipeline_board');
  v_read := custom.pipeline_read(p_organization_id, p_table_id);
  if not coalesce((v_read ->> 'is_pipeline')::boolean, false) then
    return;
  end if;
  v_key := v_read ->> 'stage_field';
  if p_measure is not null and not exists (
       select 1 from custom.record f
        where f.organization_id = p_organization_id
          and f.table_id = custom.field_kernel_id()
          and f.deleted_at is null
          and (f.data ->> 'entity_definition_id')::uuid = p_table_id
          and f.data ->> 'key' = p_measure) then
    raise exception 'this board was asked to total %, and there is no such column on this table', p_measure
      using errcode = '23503',
            hint = 'The measure is a column key of the same table — a number, a money or a percentage one.';
  end if;

  -- THE VIEW'S QUESTION, written by the one fragment. A flat map is normalised to what is
  -- STORED first (CHOICE-VALUE), exactly as the grid and the aggregate do it.
  v_where := custom.record_filter_sql(p_organization_id, p_table_id,
               case when custom.filter_is_rule(p_filter) then p_filter
                    else custom.choice_filter_normalize(custom.choice_field_map(p_organization_id, p_table_id),
                                                        coalesce(p_filter, '{}'::jsonb)) end);
  v_narrow := v_where is distinct from 'true';
  if v_narrow then
    execute format($q$
      select coalesce(array_agg(r.id), '{}'::uuid[])
        from custom.record r
       where r.organization_id = %L::uuid
         and r.table_id = %L::uuid
         and r.deleted_at is null
         and r.data_class = 'record'
         and %s
    $q$, p_organization_id, p_table_id, v_where) into v_ids;
  end if;

  return query
    with stages as (
      select s ->> 'key' as k, s ->> 'label' as lab, ord::integer as pos
        from jsonb_array_elements(v_read -> 'stages') with ordinality as t(s, ord)),
    lim as (
      -- The limit is written into the Rule's own test, which is the only copy of it. Reading
      -- it back from there is why a board cannot show a limit the store does not enforce.
      select r.data #>> '{pipeline,stage}' as k,
             (jsonb_path_query_first(r.data -> 'expr',
                '$.**{0 to 8} ? (@.op == "lt").args[1].const') #>> '{}')::integer as n
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.rule_kernel_id()
         and r.deleted_at is null
         and (r.data #>> '{pipeline,stage_field_of}')::uuid = p_table_id
         and r.data #>> '{pipeline,kind}' = 'limit'),
    live as (
      select r.data ->> v_key as k,
             count(*) as n,
             sum(case when p_measure is null then null
                      when jsonb_typeof(r.data -> p_measure) = 'number'
                        then (r.data ->> p_measure)::numeric end) as total
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and r.data_class = 'record'
         and r.id in (select custom.query_visible_ids(p_organization_id, p_table_id, 'viewer'))
         and (not v_narrow or r.id = any (v_ids))
       group by 1)
    select s.k, s.lab, s.pos, coalesce(l.n, 0), l.total, lm.n,
           lm.n is not null and coalesce(l.n, 0) > lm.n
      from stages s
      left join live l on l.k = s.k
      left join lim  lm on lm.k = s.k
     order by s.pos;
end;
$fn$;

comment on function custom.pipeline_board(uuid, uuid, text, jsonb) is
  'S2-PRIME FILTER-GROUPS: the board''s columns — count, total, work-in-progress limit — over the records this person may see AND the view''s filter (flat map or Rule expression, through custom.record_filter_sql(org, table, filter)). custom.pipeline_board(org, table, measure) is this with no filter.';

-- ── 6. WHO IS IN A RULE, AS THE READER MAY SEE THEM, A PAGE AT A TIME. ─────────────────────────
-- `custom.rule_members(org, rule)` walks the WHOLE scope table through the evaluator and returns
-- stored rows: it never asks the visibility ladder and it never masks a column, so it is a
-- server-lane door and it stays one (declared below). ViewSwitcher called it for every view with
-- a membership Rule, from the browser, where it holds no EXECUTE — so those views could not load.
--
-- This is the door a signed-in person reaches. It is the list door, `custom.read_records_matching`,
-- asked the Rule's own test as its filter: the same wall, the same "may she know this table", the
-- same visibility ladder in the same WHERE clause, the same masked documents, the same page size
-- and the same page. A member is exactly a row the Rule's test is true for (`rule_truth(...) is
-- true`, the evaluator's own membership word).
create function custom.rule_members_visible(p_organization_id uuid, p_rule_id uuid,
                                            p_limit integer default 200, p_offset integer default 0)
returns table(id uuid, document jsonb, level public.permission_level)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_rule  custom.record;
  v_scope uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.rule_members_visible');

  select * into v_rule
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_rule_id
     and r.table_id = custom.rule_kernel_id() and r.deleted_at is null;
  if v_rule.id is null then
    raise exception 'that rule is not there'
      using errcode = '23503', hint = 'REC-15: a Rule is a Record of the kernel Table `Rule`. A rule of another organization reads as absent — organizations are hard walls (REC-29).';
  end if;
  if not (coalesce(v_rule.data -> 'uses', '[]'::jsonb) ? 'membership') then
    raise exception 'the rule % is not used to say what is in a set', v_rule.data ->> 'name'
      using errcode = '22023',
            hint = 'REC-15: add `membership` to this Rule''s uses. One Rule object, four uses - it is one word in the row, not a second Rule.';
  end if;

  v_scope := nullif(v_rule.data ->> 'scope_table_id', '')::uuid;
  perform custom.assert_may_know_table(p_organization_id, v_scope, 'custom.rule_members_visible');

  -- `and` of one argument is the argument, and it makes ANY node — a bare `{"const": true}`
  -- included — read as a Rule expression rather than as a flat map.
  return query
    select m.id, m.document, m.level
      from custom.read_records_matching(
             p_organization_id, v_scope,
             jsonb_build_object('op', 'and', 'args', jsonb_build_array(v_rule.data -> 'expr')),
             false, p_limit, p_offset) m;
end;
$fn$;

comment on function custom.rule_members_visible(uuid, uuid, integer, integer) is
  'S2-PRIME FILTER-GROUPS: the members of a membership Rule that THIS reader may see, masked and paged exactly as custom.read_records_matching reads them (it is that door, asked the Rule''s test). The client door for a saved view''s membership. custom.rule_members stays server-only.';

CREATE OR REPLACE FUNCTION custom.pipeline_board(p_organization_id uuid, p_table_id uuid, p_measure text DEFAULT NULL::text)
 RETURNS TABLE(stage_key text, stage_label text, stage_position integer, cards bigint, total numeric, wip_limit integer, over_limit boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- S2-PRIME FILTER-GROUPS: the board with no filter. Kept callable, so every caller that asks
  -- for the whole board still gets exactly what it got; the body is one body, the four-argument
  -- door's, so the two can never count differently.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_board');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.pipeline_board');
  return query
    select b.stage_key, b.stage_label, b.stage_position, b.cards, b.total, b.wip_limit, b.over_limit
      from custom.pipeline_board(p_organization_id, p_table_id, p_measure, '{}'::jsonb) b;
end;
$function$;

-- ── 7. THE DOORS, DECLARED. ───────────────────────────────────────────────────────────────────
-- The two new doors a signed-in person reaches are declared here and OPENED by the chair-step
-- file after this one (the ddl guard takes a new definer's client EXECUTE back at birth, and a
-- GRANT is the one shape this file may not carry). `custom.rule_members` is declared SERVER-ONLY,
-- so the census stops counting it as a door nobody decided about and nobody grants it by mistake.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'rule_members_visible', 'p_organization_id uuid, p_rule_id uuid, p_limit integer, p_offset integer',
   array['uuid'::regtype, 'uuid'::regtype, 'integer'::regtype, 'integer'::regtype]::oid[],
   'The members of a membership Rule that THIS reader may see — a saved view''s rows. p_organization_id is checked by custom.assert_client_may_reach before anything is read; the Rule is read only as a live Rule of that organization (another organization''s id reads as absent); its scope Table is asked custom.assert_may_know_table; the rows are custom.read_records_matching''s — the one ladder in the WHERE, masked documents, the page ceiling — asked the Rule''s own test as its filter. It writes nothing.',
   'filtergroups_a_views_nested_question_is_one_where_clause.sql', null, true, false,
   jsonb_build_object('version', 1, 'declared_by', 'filtergroups_a_views_nested_question_is_one_where_clause.sql',
     'declared_at', '2026-09-24 lane S2-PRIME FILTER-GROUPS',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-24 lane S2-PRIME FILTER-GROUPS — written with this body'),
       'p_rule_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
         'check', 'read only as a live Rule record of arg1 (custom.record where organization_id = arg1 and table_id = custom.rule_kernel_id()); its scope Table is then asked custom.assert_may_know_table and every row is decided by custom.read_records_matching''s ladder.',
         'foreign', jsonb_build_object('sqlstate', '23503', 'same_as_invented', true),
         'verified', '2026-09-24 lane S2-PRIME FILTER-GROUPS — written with this body')))),
  ('custom', 'pipeline_board', 'p_organization_id uuid, p_table_id uuid, p_measure text, p_filter jsonb',
   array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'jsonb'::regtype]::oid[],
   'The count and the total per column over every record this person may see AND the view''s filter, in the declared stage order, with each column''s limit. p_organization_id is checked by custom.assert_client_may_reach and p_table_id by custom.assert_may_know_table before anything is read; the rows are custom.query_visible_ids(''viewer''), narrowed by custom.record_filter_sql(org, table, filter). It writes nothing.',
   'filtergroups_a_views_nested_question_is_one_where_clause.sql', null, true, false,
   jsonb_build_object('version', 1, 'declared_by', 'filtergroups_a_views_nested_question_is_one_where_clause.sql',
     'declared_at', '2026-09-24 lane S2-PRIME FILTER-GROUPS',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-24 lane S2-PRIME FILTER-GROUPS — written with this body'),
       'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
         'check', 'this body decides it with custom.assert_may_know_table(arg2) — the Table''s own ladder — and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-24 lane S2-PRIME FILTER-GROUPS — written with this body'),
       'p_filter', jsonb_build_object('type', 'jsonb', 'position', 4,
         'check', 'A FILTER, AND NOT A LEAK. It only narrows the set custom.query_visible_ids already allows (an additional conjunct over ids already inside it). A flat map''s keys are refused by shape by custom.agg_assert_key; a Rule expression''s fields are resolved by id to THIS table''s live fields, a field hidden from the reader is undecided, and every constant is a quoted literal — no caller byte is executed as SQL.',
         'foreign', jsonb_build_object('not_a_leak', true, 'same_as_invented', true),
         'verified', '2026-09-24 lane S2-PRIME FILTER-GROUPS — written with this body')))),
  ('custom', 'rule_members', 'p_organization_id uuid, p_rule_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'The members of a membership Rule, every row of its scope Table the evaluator says yes to, as stored rows. Server lane only.',
   'filtergroups_a_views_nested_question_is_one_where_clause.sql',
   'server_only: custom.rule_members walks the WHOLE scope table through custom.rule_eval and returns stored custom.record rows — it never asks the visibility ladder and never masks a column, so it must never be granted to a browser role. A signed-in person reads a Rule''s members through custom.rule_members_visible, which is the list door asked the Rule''s test.',
   false, false, null);
