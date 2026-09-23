-- target: branch,production
-- additive: yes
--   It ADDS the formula language's functions — `custom.formula_node_kinds`, `custom.formula_eval`
--   and its helpers (`custom._fx_*`), `custom.formula_parse` and its parser (`custom._fxp_*`),
--   `custom.display_format_ids`, `custom._display_format_check`, `custom._with_display_format`
--   — and one `platform.client_callable_door` row (`custom.formula_parse`). It REPLACES three
--   bodies, each declared below with the body it was written against:
--   `custom.formula_value` hands a formula to `custom.formula_eval` (which answers every
--   existing Rule-shaped expression through `custom.rule_eval`, unchanged, and the new `fx.*`
--   nodes itself); `custom._field_document_for` and `custom.field_update` accept
--   `formula_text`, `display_format` and three new kinds (`autonumber`, `created_time`,
--   `modified_time`). No table, column, trigger, policy or grant is touched; no row of
--   anybody's data is rewritten. The inverse is
--   `migrations/inverse/gridprim_a_formula_is_typed_and_the_store_works_it_out_down.sql`.
-- guard: custom/system_enabled
-- lock: custom,platform
-- based-on: custom.formula_value(uuid, uuid, jsonb, jsonb) 20f0f22d069c0dc1fa78d7ca6210806fb3a4f275baae2f475d6d5ecba6742e63
-- based-on: custom._field_document_for(uuid, uuid, jsonb) 9005a8ff5925834cb0932aff045b1b642360b04bb6cd29a9fb4b12809934ee4c
-- based-on: custom.field_update(uuid, uuid, jsonb) 24626bbd2605e2f05e91363bb00bb99f37a7795890dd5de1a392317bf7b91bca
--
-- LANE GRID-PRIMITIVES, gaps G3 and G5 (the column kinds) — GRID-REBUILD.md.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE FORMULA A PERSON TYPES IS WORKED OUT BY THE STORE, NEVER BY THE BROWSER
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- The older grid's formula column (features/data-tables/formulas.ts, 1,455 lines) is a typed
-- language — `{Visit fee} - {Deposit}`, `IF({Status} = "No-show", "Call owner", "")`,
-- `DATEDIFF({Booked}, TODAY(), 'days')` — parsed and evaluated IN THE BROWSER, so a formula's
-- answer existed only on the screen that happened to compute it: an agent, an export, a
-- webhook and a summary all saw the empty cell the database stored. The store already
-- evaluates formulas itself (a formula Field's `config.expr`, worked out by
-- `custom.derived_value` on read or on write) — but in the Rule expression shape, whose
-- node list (custom.rule_node_kinds) has no IF, no ROUND, no LEFT, no dates at all, and whose
-- arithmetic answers "undecided" for a blank where the older grid reads 0.
--
-- WHAT THIS FILE DOES.
--   1. `custom.formula_parse(org, table, text)` turns the older grid's text into the store's
--      expression shape, resolving every `{Column}` to that column's Field ID (REC-17) —
--      machine key first, then the label, case-insensitive, exactly as the older grid does.
--      It never throws: a mistake comes back as `{ok:false, error, position}` in the older
--      grid's own sentences, so the formula editor shows the same words it shows today.
--   2. THE SHAPE IS EXTENDED, NO FUNCTION IS DROPPED. Every operator and all 28 functions of
--      the older language become `fx.*` nodes (custom.formula_node_kinds lists them) with the
--      older language's coercion rules — BLANK is 0 in arithmetic, numeric text coerces,
--      aggregates skip blanks, comparison is numeric when both sides read as numbers, dates
--      are ISO strings in UTC, division by zero is refused by name. `custom.formula_eval`
--      evaluates them and hands every other node to `custom.rule_eval`, so every formula
--      written before today answers exactly as it did.
--   3. `formula_text` rides on the Field spec — `custom.field_declare` and
--      `custom.field_update` parse it, store `config.expr` AND keep `config.formula_text`, so
--      a person edits text and the store evaluates the expression. Sending a hand-written
--      `expr` without text drops the text, because the text would no longer describe it.
--   4. G5, THE KINDS THE OLDER GRID HAS AND THE STORE DID NOT: `autonumber` (assigned by the
--      store on write, one per record, never reused, never typed — fx.autonumber),
--      `created_time` and `modified_time` (the record's own stamps, read — fx.created_time,
--      fx.modified_time). They are formula Fields with a system expression, so every reader
--      that already serves worked-out values serves them with nothing new.
--   5. G5, THE DISPLAY FORMAT: all 34 format ids of lib/field-formats/registry.ts are accepted
--      as `display_format: {id, options}` on field_declare / field_update and read back
--      unchanged on the Field; an id the grid cannot draw is refused by name.
--
-- WHY `fx.*` AND NOT NEW RULE NODES. custom.rule_eval is the Rules' evaluator and its body on
-- the rehearsal branch differs from the main database's, so a replace of it could be declared
-- against one of them only. The formula language is a SUPERSET: an `fx.*` node's arguments may
-- be any Rule node, and a Rule-shaped formula keeps going to rule_eval. Rules themselves keep
-- REC-15's closed list.
--
-- LOCKS. create function / create or replace function / insert / comment on only: ACCESS
-- SHARE on catalogue relations, nothing on custom.record. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- THE VOCABULARY
-- ═════════════════════════════════════════════════════════════════════════════════════════

create function custom.formula_node_kinds()
returns table(node text, min_args integer, max_args integer, result text, signature text, says text)
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
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
    ('fx.datediff',    3, 3,    'number',  'DATEDIFF(from, to, ''days'' | ''hours'' | ''minutes'')', 'How far the second date is after the first. Negative when it is earlier.'),
    ('fx.year',        1, 1,    'number',  'YEAR(date)',                      'The four-digit year of the date.'),
    ('fx.month',       1, 1,    'number',  'MONTH(date)',                     'The month of the date, 1 to 12.'),
    ('fx.day',         1, 1,    'number',  'DAY(date)',                       'The day of the month, 1 to 31.'),
    ('fx.dateadd',     3, 3,    'date',    'DATEADD(date, count, ''days'' | ''months'' | ''years'')', 'The date moved forward by that many units. Use a negative count to go back.'),
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
$fn$;

comment on function custom.formula_node_kinds() is
  'GRID-PRIMITIVES G3: the formula language''s nodes beyond the Rule shape — the older grid''s 28 functions and its operators, plus the three system kinds. A formula expression is any mix of these and the Rule nodes of custom.rule_node_kinds().';

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- THE COERCION RULES (formulas.ts header), one function each
-- ═════════════════════════════════════════════════════════════════════════════════════════

create function custom._fx_blank(p_v jsonb)
returns boolean language sql immutable set search_path to 'pg_catalog' as $fn$
  -- BLANK is null or "" — a cleared text cell and a cleared number cell are the same to a formula.
  select p_v is null or jsonb_typeof(p_v) = 'null' or p_v = '""'::jsonb
$fn$;

create function custom._fx_num_text(p_n numeric)
returns text language sql immutable set search_path to 'pg_catalog' as $fn$
  -- The shortest exact decimal, to fifteen significant digits (numberToText): keeps
  -- 0.1 + 0.2 and 10 / 3 out of a cell as a string of noise.
  select case
    when p_n is null then null
    when p_n = 0 then '0'
    when p_n = trunc(p_n) then trunc(p_n)::text
    else trim_scale(round(p_n, greatest(0, 15 - (floor(log(abs(p_n)))::integer + 1))))::text
  end
$fn$;

create function custom._fx_text(p_v jsonb)
returns text language sql immutable set search_path to 'pg_catalog' as $fn$
  select case
    when p_v is null or jsonb_typeof(p_v) = 'null' then ''
    when jsonb_typeof(p_v) = 'number' then custom._fx_num_text((p_v #>> '{}')::numeric)
    when jsonb_typeof(p_v) = 'boolean' then p_v #>> '{}'
    when jsonb_typeof(p_v) = 'string' then p_v #>> '{}'
    else p_v::text
  end
$fn$;

create function custom._fx_loose(p_v jsonb)
returns numeric language plpgsql immutable set search_path to 'pg_catalog' as $fn$
declare
  v_s text;
begin
  -- A number, or NULL when the value simply is not one. BLANK reads as 0 (looseNumber).
  if custom._fx_blank(p_v) then return 0; end if;
  if jsonb_typeof(p_v) = 'number' then return (p_v #>> '{}')::numeric; end if;
  if jsonb_typeof(p_v) = 'boolean' then return case when (p_v #>> '{}')::boolean then 1 else 0 end; end if;
  if jsonb_typeof(p_v) <> 'string' then return null; end if;
  v_s := regexp_replace(p_v #>> '{}', '[,\s$€£¥%]', '', 'g');
  if v_s = '' then return 0; end if;
  if v_s !~ '^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$' then return null; end if;
  return v_s::numeric;
exception when others then
  return null;
end
$fn$;

create function custom._fx_num(p_v jsonb, p_what text)
returns numeric language plpgsql immutable set search_path to 'pg_catalog' as $fn$
declare
  v_n numeric := custom._fx_loose(p_v);
begin
  if v_n is null then
    raise exception '% needs a number, but got "%".', p_what, custom._fx_text(p_v)
      using errcode = '22023', hint = 'GRID-PRIMITIVES G3: numeric text such as "1,234" or "$5" counts as a number; words do not.';
  end if;
  return v_n;
end
$fn$;

create function custom._fx_truthy(p_v jsonb)
returns boolean language sql immutable set search_path to 'pg_catalog' as $fn$
  select case
    when custom._fx_blank(p_v) then false
    when jsonb_typeof(p_v) = 'boolean' then (p_v #>> '{}')::boolean
    when jsonb_typeof(p_v) = 'number' then (p_v #>> '{}')::numeric <> 0
    else true
  end
$fn$;

create function custom._fx_cmp(p_a jsonb, p_b jsonb)
returns integer language plpgsql immutable set search_path to 'pg_catalog' as $fn$
declare
  v_an boolean; v_bn boolean; v_x numeric; v_y numeric; v_s text; v_t text; v_p boolean; v_q boolean;
begin
  -- compareValues: numeric when both read as numbers; BLANK takes the shape of what it is
  -- compared against (0 beside a number, "" beside text); then booleans; then plain text.
  if custom._fx_blank(p_a) and custom._fx_blank(p_b) then return 0; end if;
  v_an := jsonb_typeof(p_a) = 'number'
          or (jsonb_typeof(p_a) = 'string' and btrim(p_a #>> '{}') <> '' and custom._fx_loose(p_a) is not null);
  v_bn := jsonb_typeof(p_b) = 'number'
          or (jsonb_typeof(p_b) = 'string' and btrim(p_b #>> '{}') <> '' and custom._fx_loose(p_b) is not null);
  if (custom._fx_blank(p_a) and v_bn) or (custom._fx_blank(p_b) and v_an) or (v_an and v_bn) then
    v_x := coalesce(custom._fx_loose(p_a), 0); v_y := coalesce(custom._fx_loose(p_b), 0);
    return case when v_x < v_y then -1 when v_x > v_y then 1 else 0 end;
  end if;
  if jsonb_typeof(p_a) = 'boolean' or jsonb_typeof(p_b) = 'boolean' then
    v_p := custom._fx_truthy(p_a); v_q := custom._fx_truthy(p_b);
    return case when v_p = v_q then 0 when v_p then 1 else -1 end;
  end if;
  v_s := custom._fx_text(p_a); v_t := custom._fx_text(p_b);
  return case when v_s collate "C" < v_t collate "C" then -1 when v_s collate "C" > v_t collate "C" then 1 else 0 end;
end
$fn$;

create function custom._fx_date(p_v jsonb, p_what text, out ts timestamp, out date_only boolean)
language plpgsql immutable set search_path to 'pg_catalog' as $fn$
declare
  v_s text;
begin
  -- Dates are ISO strings, read and written in UTC (formulas.ts).
  if custom._fx_blank(p_v) then
    raise exception '% needs a date, but that value is empty.', p_what using errcode = '22023';
  end if;
  if jsonb_typeof(p_v) = 'string' then
    v_s := btrim(p_v #>> '{}');
    date_only := v_s ~ '^\d{4}-\d{2}-\d{2}$';
    begin
      if date_only then
        ts := v_s::date::timestamp;
      else
        ts := (v_s::timestamptz at time zone 'UTC');
      end if;
      return;
    exception when others then
      null;
    end;
  end if;
  raise exception '% needs a date, but got "%".', p_what, custom._fx_text(p_v) using errcode = '22023';
end
$fn$;

create function custom._fx_iso(p_ts timestamp, p_date_only boolean)
returns text language sql immutable set search_path to 'pg_catalog' as $fn$
  select case when p_date_only then to_char(p_ts, 'YYYY-MM-DD')
              else to_char(p_ts, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
$fn$;

create function custom._fx_unit(p_v jsonb, p_allowed text[], p_fn text)
returns text language plpgsql immutable set search_path to 'pg_catalog' as $fn$
declare
  v_u text := lower(btrim(custom._fx_text(p_v)));
begin
  if not (v_u = any (p_allowed)) then
    raise exception '`%` needs one of % — got "%".', p_fn,
      (select string_agg(format('''%s''', a), ', ') from unnest(p_allowed) a), custom._fx_text(p_v)
      using errcode = '22023';
  end if;
  return v_u;
end
$fn$;

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- G5: the record's own number, assigned by the store
-- ═════════════════════════════════════════════════════════════════════════════════════════

create function custom._fx_autonumber(p_organization_id uuid, p_table_id uuid, p_key text, p_self_id uuid)
returns numeric
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_have numeric;
  v_next numeric;
begin
  if p_table_id is null or p_key is null then
    return null;
  end if;
  -- A record keeps the number it was given: every later write of it answers the same number.
  if p_self_id is not null then
    select nullif(r.data -> '_derived' -> p_key ->> 'value', '')::numeric into v_have
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_self_id;
    if v_have is not null then
      return v_have;
    end if;
  end if;
  -- One writer at a time per column, and the count includes archived records, so a number is
  -- never handed out twice — the older grid's `_udt_autonumber` rule. VOLATILE on purpose: each
  -- statement below sees what a writer that held the lock before us committed.
  perform pg_advisory_xact_lock(hashtextextended('custom_autonumber:' || p_table_id::text || ':' || p_key, 0));
  select coalesce(max(nullif(r.data -> '_derived' -> p_key ->> 'value', '')::numeric), 0) + 1 into v_next
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.data_class = 'record'
     and (r.data -> '_derived' -> p_key ->> 'value') ~ '^[0-9]{1,18}$';
  return v_next;
end
$fn$;

comment on function custom._fx_autonumber(uuid, uuid, text, uuid) is
  'GRID-PRIMITIVES G5: the next number of an autonumber column — the record''s own number when it already has one, else one past the largest ever given in this table (archived records included), under a per-column advisory lock.';

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- custom.formula_eval — the evaluator
-- ═════════════════════════════════════════════════════════════════════════════════════════

create function custom.formula_eval(p_organization_id uuid, p_expr jsonb, p_values jsonb,
                                    p_context jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
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
    return to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD'));
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
    when 'fx.sum', 'fx.min', 'fx.max', 'fx.average' then
      foreach v_one in array v_vals loop
        if not custom._fx_blank(v_one) then
          v_nums := v_nums || custom._fx_num(v_one, format('`%s`', upper(substr(v_op, 4))));
        end if;
      end loop;
      if v_op = 'fx.sum' then
        return to_jsonb(coalesce((select sum(x) from unnest(v_nums) x), 0));
      end if;
      if cardinality(v_nums) = 0 then return 'null'::jsonb; end if;
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
      v_u := custom._fx_unit(v_vals[3], array['days', 'hours', 'minutes'], 'DATEDIFF');
      return to_jsonb(trunc(extract(epoch from (v_d2.ts - v_d1.ts))
                            / case v_u when 'days' then 86400 when 'hours' then 3600 else 60 end));
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
      v_u := custom._fx_unit(v_vals[3], array['days', 'months', 'years'], 'DATEADD');
      -- An interval of months clamps to the end of a shorter month, as the older grid does.
      v_ts := case v_u when 'days' then v_d1.ts + make_interval(days => v_x::integer)
                       when 'months' then v_d1.ts + make_interval(months => v_x::integer)
                       else v_d1.ts + make_interval(years => v_x::integer) end;
      return to_jsonb(custom._fx_iso(v_ts, v_d1.date_only));
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
$fn$;

comment on function custom.formula_eval(uuid, jsonb, jsonb, jsonb) is
  'GRID-PRIMITIVES G3: the formula evaluator. fx.* nodes (custom.formula_node_kinds) follow the older grid''s formula rules exactly — blank is 0 in arithmetic, aggregates skip blanks, comparison numeric when both sides read as numbers, ISO dates in UTC, division by zero refused by name; every other node goes to custom.rule_eval unchanged.';

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- custom.formula_parse — the older grid's text → the store's shape
-- ═════════════════════════════════════════════════════════════════════════════════════════

create function custom._fxp_tokens(p_src text)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_out   jsonb := '[]'::jsonb;
  i       integer := 1;
  j       integer;
  n       integer := char_length(p_src);
  ch      text;
  v_txt   text;
  v_q     text;
  v_closed boolean;
  v_dot   boolean;
  v_two   text;
begin
  -- The tokenizer of formulas.ts, character for character. Positions are 0-based, as there.
  while i <= n loop
    ch := substr(p_src, i, 1);
    if ch ~ '\s' then
      i := i + 1;
      continue;
    end if;
    if ch = '{' then
      j := strpos(substr(p_src, i + 1), '}');
      if j = 0 then
        raise exception 'This column reference is missing its closing brace `}`.' using errcode = '22023', detail = (i - 1)::text;
      end if;
      v_txt := btrim(substr(p_src, i + 1, j - 1));
      if v_txt = '' then
        raise exception 'This column reference has no name inside `{}`.' using errcode = '22023', detail = (i - 1)::text;
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object('t', 'reference', 'x', v_txt, 'p', i - 1));
      i := i + j + 1;
      continue;
    end if;
    if ch in ('"', '''') then
      v_q := ch; j := i + 1; v_txt := ''; v_closed := false;
      while j <= n loop
        if substr(p_src, j, 1) = '\' and j + 1 <= n then
          v_txt := v_txt || substr(p_src, j + 1, 1); j := j + 2; continue;
        end if;
        if substr(p_src, j, 1) = v_q then
          v_closed := true; j := j + 1; exit;
        end if;
        v_txt := v_txt || substr(p_src, j, 1); j := j + 1;
      end loop;
      if not v_closed then
        raise exception 'This text is missing its closing % quote.', case when v_q = '"' then 'double' else 'single' end
          using errcode = '22023', detail = (i - 1)::text;
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object('t', 'string', 'x', v_txt, 'p', i - 1));
      i := j;
      continue;
    end if;
    if ch ~ '[0-9]' or (ch = '.' and substr(p_src, i + 1, 1) ~ '[0-9]') then
      j := i; v_dot := false;
      while j <= n loop
        if substr(p_src, j, 1) ~ '[0-9]' then j := j + 1; continue; end if;
        if substr(p_src, j, 1) = '.' and not v_dot then v_dot := true; j := j + 1; continue; end if;
        exit;
      end loop;
      v_out := v_out || jsonb_build_array(jsonb_build_object('t', 'number', 'x', substr(p_src, i, j - i), 'p', i - 1));
      i := j;
      continue;
    end if;
    if ch ~ '[A-Za-z_]' then
      j := i;
      while j <= n and substr(p_src, j, 1) ~ '[A-Za-z0-9_]' loop j := j + 1; end loop;
      v_out := v_out || jsonb_build_array(jsonb_build_object('t', 'identifier', 'x', substr(p_src, i, j - i), 'p', i - 1));
      i := j;
      continue;
    end if;
    if ch in ('(', ')', ',') then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        't', case ch when '(' then 'paren-open' when ')' then 'paren-close' else 'comma' end, 'x', ch, 'p', i - 1));
      i := i + 1;
      continue;
    end if;
    v_two := substr(p_src, i, 2);
    if v_two in ('!=', '<>', '<=', '>=') then
      v_out := v_out || jsonb_build_array(jsonb_build_object('t', 'operator', 'x', v_two, 'p', i - 1));
      i := i + 2;
      continue;
    end if;
    if ch in ('+', '-', '*', '/', '%', '&', '=', '<', '>') then
      v_out := v_out || jsonb_build_array(jsonb_build_object('t', 'operator', 'x', ch, 'p', i - 1));
      i := i + 1;
      continue;
    end if;
    raise exception '`%` does not mean anything in a formula.', ch using errcode = '22023', detail = (i - 1)::text;
  end loop;
  return v_out || jsonb_build_array(jsonb_build_object('t', 'end', 'x', '', 'p', char_length(p_src)));
end
$fn$;

-- One level of the grammar. Returns {"n": <node>, "i": <next token index>}.
-- Precedence, loosest first: comparison · & · + - · * / % · unary - · primary.
create function custom._fxp_level(p_tokens jsonb, p_i integer, p_level integer)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_ops   text[];
  v_left  jsonb;
  v_right jsonb;
  v_tok   jsonb;
  v_i     integer := p_i;
  v_r     jsonb;
  v_node  text;
  v_name  text;
  v_upper text;
  v_args  jsonb;
  v_spec  record;
  v_close jsonb;
  v_sep   jsonb;
begin
  if p_level <= 3 then
    v_ops := case p_level
               when 0 then array['=', '!=', '<>', '<', '<=', '>', '>=']
               when 1 then array['&']
               when 2 then array['+', '-']
               else        array['*', '/', '%'] end;
    v_r := custom._fxp_level(p_tokens, v_i, p_level + 1);
    v_left := v_r -> 'n'; v_i := (v_r ->> 'i')::integer;
    loop
      v_tok := p_tokens -> v_i;
      exit when v_tok ->> 't' <> 'operator' or not ((v_tok ->> 'x') = any (v_ops));
      v_r := custom._fxp_level(p_tokens, v_i + 1, p_level + 1);
      v_right := v_r -> 'n'; v_i := (v_r ->> 'i')::integer;
      v_node := case v_tok ->> 'x'
                  when '='  then 'fx.eq'  when '!=' then 'fx.ne' when '<>' then 'fx.ne'
                  when '<'  then 'fx.lt'  when '<=' then 'fx.lte' when '>' then 'fx.gt' when '>=' then 'fx.gte'
                  when '&'  then 'fx.concatenate'
                  when '+'  then 'fx.add' when '-' then 'fx.sub'
                  when '*'  then 'fx.mul' when '/' then 'fx.div' else 'fx.mod' end;
      v_left := jsonb_build_object('op', v_node, 'args', jsonb_build_array(v_left, v_right));
    end loop;
    return jsonb_build_object('n', v_left, 'i', v_i);
  end if;

  if p_level = 4 then
    v_tok := p_tokens -> v_i;
    if v_tok ->> 't' = 'operator' and v_tok ->> 'x' = '-' then
      v_r := custom._fxp_level(p_tokens, v_i + 1, 4);
      return jsonb_build_object('n', jsonb_build_object('op', 'fx.neg', 'args', jsonb_build_array(v_r -> 'n')),
                                'i', (v_r ->> 'i')::integer);
    end if;
    if v_tok ->> 't' = 'operator' and v_tok ->> 'x' = '+' then
      return custom._fxp_level(p_tokens, v_i + 1, 4);   -- a leading + is harmless; people type it
    end if;
    return custom._fxp_level(p_tokens, v_i, 5);
  end if;

  -- primary
  v_tok := p_tokens -> v_i;
  v_i := v_i + 1;
  if v_tok ->> 't' = 'number' then
    return jsonb_build_object('n', jsonb_build_object('const', (v_tok ->> 'x')::numeric), 'i', v_i);
  elsif v_tok ->> 't' = 'string' then
    return jsonb_build_object('n', jsonb_build_object('const', v_tok ->> 'x'), 'i', v_i);
  elsif v_tok ->> 't' = 'reference' then
    return jsonb_build_object('n', jsonb_build_object('ref', v_tok ->> 'x', 'at', (v_tok ->> 'p')::integer), 'i', v_i);
  elsif v_tok ->> 't' = 'paren-open' then
    v_r := custom._fxp_level(p_tokens, v_i, 0);
    v_close := p_tokens -> ((v_r ->> 'i')::integer);
    if v_close ->> 't' <> 'paren-close' then
      raise exception 'This opening bracket `(` never closes.' using errcode = '22023', detail = v_tok ->> 'p';
    end if;
    return jsonb_build_object('n', v_r -> 'n', 'i', (v_r ->> 'i')::integer + 1);
  elsif v_tok ->> 't' = 'identifier' then
    v_name := v_tok ->> 'x';
    v_upper := upper(v_name);
    if v_upper in ('TRUE', 'FALSE') then
      return jsonb_build_object('n', jsonb_build_object('const', v_upper = 'TRUE'), 'i', v_i);
    end if;
    select * into v_spec from custom.formula_node_kinds() k
     where k.node = 'fx.' || lower(v_upper)
       and k.node not in ('fx.add', 'fx.sub', 'fx.mul', 'fx.div', 'fx.mod', 'fx.neg',
                          'fx.eq', 'fx.ne', 'fx.lt', 'fx.lte', 'fx.gt', 'fx.gte',
                          'fx.autonumber', 'fx.created_time', 'fx.modified_time');
    if v_spec.node is null then
      raise exception 'There is no function called `%`. A column goes in braces, like {%}.', v_name, v_name
        using errcode = '22023', detail = v_tok ->> 'p';
    end if;
    if (p_tokens -> v_i) ->> 't' <> 'paren-open' then
      raise exception '`%` needs brackets after it, like %.', v_upper, v_spec.signature
        using errcode = '22023', detail = v_tok ->> 'p';
    end if;
    v_i := v_i + 1;
    v_args := '[]'::jsonb;
    if (p_tokens -> v_i) ->> 't' = 'paren-close' then
      v_i := v_i + 1;
    else
      loop
        v_r := custom._fxp_level(p_tokens, v_i, 0);
        v_args := v_args || jsonb_build_array(v_r -> 'n');
        v_i := (v_r ->> 'i')::integer;
        v_sep := p_tokens -> v_i;
        v_i := v_i + 1;
        if v_sep ->> 't' = 'comma' then continue; end if;
        if v_sep ->> 't' = 'paren-close' then exit; end if;
        raise exception '`%` is missing a comma or its closing bracket.', v_upper
          using errcode = '22023', detail = v_sep ->> 'p';
      end loop;
    end if;
    if jsonb_array_length(v_args) < v_spec.min_args
       or (v_spec.max_args is not null and jsonb_array_length(v_args) > v_spec.max_args) then
      raise exception '`%` was given % value%. Use %.', v_upper, jsonb_array_length(v_args),
                      case when jsonb_array_length(v_args) = 1 then '' else 's' end, v_spec.signature
        using errcode = '22023', detail = v_tok ->> 'p';
    end if;
    return jsonb_build_object('n', jsonb_build_object('op', v_spec.node, 'args', v_args), 'i', v_i);
  elsif v_tok ->> 't' = 'end' then
    raise exception 'The formula stops before it is finished.' using errcode = '22023', detail = v_tok ->> 'p';
  end if;
  raise exception '`%` cannot start a value here.', v_tok ->> 'x' using errcode = '22023', detail = v_tok ->> 'p';
end
$fn$;

-- Replace every {"ref": name} leaf with {"field": id}. Returns {"n": node, "refs": [...]},
-- the references in first-use order, as the older parser's `references`.
create function custom._fxp_resolve(p_node jsonb, p_fields jsonb, p_refs jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_name text;
  v_id   text;
  v_args jsonb := '[]'::jsonb;
  v_one  jsonb;
  v_r    jsonb;
  v_refs jsonb := p_refs;
begin
  if jsonb_typeof(p_node) <> 'object' then
    return jsonb_build_object('n', p_node, 'refs', v_refs);
  end if;
  if p_node ? 'ref' then
    v_name := lower(btrim(p_node ->> 'ref'));
    -- Machine key first, then the label, case-insensitive (withComputedColumns).
    select f ->> 'id' into v_id from jsonb_array_elements(p_fields) f where lower(f ->> 'key') = v_name limit 1;
    if v_id is null then
      select f ->> 'id' into v_id from jsonb_array_elements(p_fields) f where lower(f ->> 'label') = v_name limit 1;
    end if;
    if v_id is null then
      raise exception 'There is no column called {%}.', p_node ->> 'ref'
        using errcode = '22023', detail = p_node ->> 'at';
    end if;
    if not exists (select 1 from jsonb_array_elements(v_refs) r where r ->> 'name' = p_node ->> 'ref') then
      v_refs := v_refs || jsonb_build_array(jsonb_build_object('name', p_node ->> 'ref', 'field_id', v_id));
    end if;
    return jsonb_build_object('n', jsonb_build_object('field', v_id), 'refs', v_refs);
  end if;
  if p_node ? 'args' then
    for v_one in select e from jsonb_array_elements(p_node -> 'args') e loop
      v_r := custom._fxp_resolve(v_one, p_fields, v_refs);
      v_refs := v_r -> 'refs';
      v_args := v_args || jsonb_build_array(v_r -> 'n');
    end loop;
    return jsonb_build_object('n', jsonb_set(p_node, '{args}', v_args), 'refs', v_refs);
  end if;
  return jsonb_build_object('n', p_node, 'refs', v_refs);
end
$fn$;

create function custom._fxp_type(p_node jsonb, p_fields jsonb)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_op   text := p_node ->> 'op';
  v_f    jsonb;
  v_a    text;
  v_b    text;
begin
  -- formulaResultType: best effort, and `unknown` is always a legal answer.
  if p_node ? 'const' then
    return case jsonb_typeof(p_node -> 'const') when 'number' then 'number' when 'string' then 'text'
                                                 when 'boolean' then 'boolean' else 'unknown' end;
  end if;
  if p_node ? 'field' then
    select f into v_f from jsonb_array_elements(p_fields) f where f ->> 'id' = p_node ->> 'field' limit 1;
    return case
      when v_f ->> 'type' = 'boolean' then 'boolean'
      when v_f ->> 'type' = 'range' and v_f -> 'config' ->> 'kind' in ('date', 'datetime') then 'date'
      when v_f ->> 'type' = 'range' then 'number'
      when v_f ->> 'type' in ('text', 'list', 'relation') then 'text'
      else 'unknown' end;
  end if;
  if v_op = 'fx.if' then
    v_a := custom._fxp_type(p_node -> 'args' -> 1, p_fields);
    if jsonb_array_length(p_node -> 'args') < 3 then return v_a; end if;
    v_b := custom._fxp_type(p_node -> 'args' -> 2, p_fields);
    return case when v_a = v_b then v_a when v_a = 'unknown' then v_b when v_b = 'unknown' then v_a else 'unknown' end;
  end if;
  if v_op in ('fx.min', 'fx.max') then
    if jsonb_array_length(p_node -> 'args') > 0
       and not exists (select 1 from jsonb_array_elements(p_node -> 'args') a
                        where custom._fxp_type(a, p_fields) <> 'date') then
      return 'date';
    end if;
    return 'number';
  end if;
  return coalesce((select k.result from custom.formula_node_kinds() k where k.node = v_op), 'unknown');
end
$fn$;

create function custom.formula_parse(p_organization_id uuid, p_table_id uuid, p_text text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_fields jsonb;
  v_tokens jsonb;
  v_r      jsonb;
  v_expr   jsonb;
  v_refs   jsonb := '[]'::jsonb;
  v_msg    text;
  v_at     text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.formula_parse');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.formula_parse');

  -- The columns a reference may name: this Table's live Fields, by key and by label.
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'key', f.data ->> 'key', 'label', f.data ->> 'label',
                                               'type', f.data ->> 'type', 'config', f.data -> 'config')
                            order by (f.data ->> 'sort')::numeric nulls last), '[]'::jsonb)
    into v_fields
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.data_class = 'field'
     and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = p_table_id::text;

  -- NOTHING THROWS: a formula a person is still typing is an answer, not an error.
  begin
    if btrim(coalesce(p_text, '')) = '' then
      raise exception 'This formula is empty.' using errcode = '22023', detail = '0';
    end if;
    v_tokens := custom._fxp_tokens(p_text);
    v_r := custom._fxp_level(v_tokens, 0, 0);
    if (v_tokens -> ((v_r ->> 'i')::integer)) ->> 't' <> 'end' then
      raise exception 'Nothing should follow the formula here — remove `%`.',
                      (v_tokens -> ((v_r ->> 'i')::integer)) ->> 'x'
        using errcode = '22023', detail = (v_tokens -> ((v_r ->> 'i')::integer)) ->> 'p';
    end if;
    v_r := custom._fxp_resolve(v_r -> 'n', v_fields, v_refs);
    v_expr := v_r -> 'n';
    v_refs := v_r -> 'refs';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text, v_at = pg_exception_detail;
    return jsonb_build_object('ok', false, 'error', v_msg,
                              'position', coalesce(nullif(v_at, '')::integer, 0), 'text', p_text);
  end;

  return jsonb_build_object('ok', true, 'expr', v_expr, 'references', v_refs,
                            'result_type', custom._fxp_type(v_expr, v_fields), 'text', p_text);
end
$fn$;

comment on function custom.formula_parse(uuid, uuid, text) is
  'GRID-PRIMITIVES G3: the older grid''s formula text → the store''s expression shape, every {Column} resolved to that column''s Field id (machine key first, then label, case-insensitive). Never throws: {ok:true, expr, references, result_type} or {ok:false, error, position} in the older grid''s own sentences. Whoever may know the Table may parse against it.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'formula_parse',
        'p_organization_id uuid, p_table_id uuid, p_text text',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach and p_table_id by custom.assert_may_know_table before any Field is read, so a Table this caller may not know answers exactly as an invented one. It reads only that Table''s own Field keys, labels and types — never a record — and writes nothing. p_text is data: it is tokenized and parsed, never executed.',
        'gridprim_a_formula_is_typed_and_the_store_works_it_out.sql',
        null, true, false,
        jsonb_build_object('version', 1,
          'declared_by', 'gridprim_a_formula_is_typed_and_the_store_works_it_out.sql',
          'declared_at', '2026-09-22 lane GRID-PRIMITIVES',
          'arguments', jsonb_build_object(
            'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
              'check', 'this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'),
            'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
              'check', 'this body decides it with custom.assert_may_know_table(arg2) — the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'))))
on conflict do nothing;

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- G5: THE DISPLAY FORMAT — all 34 ids of lib/field-formats/registry.ts
-- ═════════════════════════════════════════════════════════════════════════════════════════

create function custom.display_format_ids()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select array['text', 'long_text', 'markdown', 'email', 'address', 'url', 'phone', 'color',
               'number', 'decimal', 'currency', 'percent', 'progress', 'duration', 'integer',
               'rating', 'file_size', 'boolean', 'date', 'datetime', 'time', 'autonumber',
               'created_time', 'modified_time', 'relative_time', 'json', 'array', 'attachment',
               'tags', 'choice', 'person', 'relation', 'multi_choice', 'formula']::text[]
$fn$;

comment on function custom.display_format_ids() is
  'GRID-PRIMITIVES G5: every display format the grid can draw (lib/field-formats/registry.ts, 34 ids). A Field''s display_format.id is one of these.';

create function custom._display_format_check(p_format jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
begin
  if p_format is null or jsonb_typeof(p_format) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_format) = 'string' then
    p_format := jsonb_build_object('id', p_format #>> '{}');
  end if;
  if jsonb_typeof(p_format) <> 'object' or not ((p_format ->> 'id') = any (custom.display_format_ids())) then
    raise exception 'A column is shown as one of the grid''s formats, and "%" is not one of them.',
                    coalesce(p_format ->> 'id', p_format::text)
      using errcode = '23514',
            hint = format('display_format is {"id": <format>, "options": {…}} with a format from: %s. Nothing was written.',
                          array_to_string(custom.display_format_ids(), ', '));
  end if;
  if p_format ? 'options' and jsonb_typeof(p_format -> 'options') not in ('object', 'null') then
    raise exception 'A display format''s options are a set of settings, and these are a %.', jsonb_typeof(p_format -> 'options')
      using errcode = '23514';
  end if;
  return jsonb_strip_nulls(jsonb_build_object('id', p_format ->> 'id', 'options', coalesce(p_format -> 'options', '{}'::jsonb)));
end
$fn$;

create function custom._with_display_format(p_document jsonb, p_spec jsonb)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select case
    when p_spec is not null and p_spec ? 'display_format' and custom._display_format_check(p_spec -> 'display_format') is not null
      then p_document || jsonb_build_object('display_format', custom._display_format_check(p_spec -> 'display_format'))
    when p_spec is not null and p_spec ? 'display_format'
      then p_document - 'display_format'
    else p_document end
$fn$;

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- custom.formula_value — hands the formula to custom.formula_eval
-- ═════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION custom.formula_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb, p_values jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_values jsonb := coalesce(p_values, custom.record_values(p_organization_id, p_record_id));
begin
  -- REC-15's evaluator, not a second one: every Rule node, every refusal and REC-17's
  -- "by id, never by name" still come from custom.rule_eval, which custom.formula_eval hands
  -- them to unchanged. GRID-PRIMITIVES G3 adds the formula language's own `fx.*` nodes, and
  -- the three facts only a formula about ITS OWN record can use (its id, its column, its table:
  -- autonumber and the created / modified stamps). They ride under fx_* keys so no Rule node
  -- that reads the context (stage_count, sibling_count read `table_id`) answers differently.
  return custom.formula_eval(p_organization_id, p_field_data -> 'config' -> 'expr',
                             v_values,
                             coalesce(custom.rule_context(p_organization_id, p_record_id), '{}'::jsonb)
                             || jsonb_build_object('fx_self_id', p_record_id,
                                                   'fx_field_key', p_field_data ->> 'key',
                                                   'fx_table_id', p_field_data ->> 'entity_definition_id'));
end;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- custom._field_document_for — formula_text, display_format and the three system kinds.
-- Every other arm is the body declared in `-- based-on:` above, unchanged.
-- ═════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION custom._field_document_for(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d        jsonb;
  v_parity text := nullif(p_spec ->> 'parity_type', '');
  v_key    text := nullif(p_spec ->> 'key', '');
  -- ── LIMITS-FIX 2026-09-21: ONE WORD FOR WHAT A PERSON READS ON THE COLUMN. ──────────
  -- A table spec's inline field says `name` (`custom._table_shape_guard` demands it) and
  -- this door said `label`, so the same concept had two words one call apart and a caller
  -- that used the table's word was told "A field needs a name" while holding one. Real-data
  -- crew D hit this on 2026-09-21 declaring a podcast episode pipeline. Both words are read
  -- here; `label` still wins when a caller sends both, so no existing caller changes.
  v_label  text := coalesce(nullif(p_spec ->> 'label', ''), nullif(p_spec ->> 'name', ''));
  v_multi  boolean := coalesce((p_spec ->> 'multi')::boolean, false);
  v_config jsonb := coalesce(p_spec -> 'config', '{}'::jsonb);
  v_rules  jsonb := coalesce(p_spec -> 'rules', '[]'::jsonb);
  v_plain  text := coalesce(nullif(p_spec ->> 'plain', ''), 'text');
  v_alias  text := lower(btrim(coalesce(p_spec ->> 'type', '')));
  -- FIX-10B-F6: the caller said the word `signature`. It is one of the kinds
  -- `custom.field_kinds()` publishes and it is NOT a parity type — it is plain
  -- text wearing the one format `custom.doc_sign` accepts — so it is resolved
  -- here, beside the other words, and carried into the plain-text arm below.
  v_signature boolean := false;
  -- GRID-PRIMITIVES G5: the three column kinds the store fills in itself.
  v_system text := null;
  -- GRID-PRIMITIVES G3: a formula a person TYPED, parsed by the store.
  v_parsed jsonb := null;
  v_relation uuid := null;   -- SEAT-SUITES: the Table a caller's own relation column points at
  -- LIMITS-FIX 2026-09-21: the same one-word rule for the relation's target. Real-data crew E
  -- reported that no client door could declare a table-to-table relation; the door could, and
  -- has since 2026-09-19 — it only ever answered to `relation_target`, and a caller reaching
  -- for `target_table` got "A column that points at other records is a Person column or a File
  -- column", which describes a different mistake entirely.
  v_target text := coalesce(nullif(p_spec ->> 'relation_target', ''), nullif(p_spec ->> 'target_table', ''));
  v_deps   jsonb := case when jsonb_typeof(p_spec -> 'depends_on') = 'array'
                         then p_spec -> 'depends_on' else '[]'::jsonb end;
begin
  -- ── STORE-T: `type` IS THE WORD EVERY CALLER REACHES FOR, AND IT WAS THROWN AWAY. ──────
  -- Measured on 2026-09-20: `{"type":"number"}` produced a TEXT column and `{"type":"banana"}`
  -- was ACCEPTED, silently, as text. Only `parity_type` and `plain` were ever read, so every
  -- agent, script and other client that said "type" got a text column and was never told.
  -- Now it is read as what it plainly means, and a word that means nothing is refused BY NAME
  -- with the list — nothing is guessed and nothing is silently dropped.
  if v_alias <> '' and v_parity is null and nullif(p_spec ->> 'plain', '') is null then
    if exists (select 1 from custom.parity_field_types() t where t.parity_type = v_alias) then
      v_parity := v_alias;
    elsif v_alias in ('number', 'range', 'integer', 'decimal', 'float') then
      v_plain := 'number';
    elsif v_alias in ('long_text', 'longtext', 'long text', 'paragraph') then
      v_plain := 'long_text';
    elsif v_alias in ('text', 'string') then
      v_plain := 'text';
    elsif v_alias in ('boolean', 'bool', 'checkbox', 'check_box', 'tick', 'tickbox',
                      'yes_no', 'yesno', 'yes/no', 'toggle', 'switch') then
      -- LIMITS-FIX: every word a person, an agent or a spreadsheet reaches for when they
      -- mean a tick box lands on the one type that is one.
      v_parity := 'checkbox';
    elsif v_alias = 'list' then
      v_parity := 'select';
    elsif v_alias in ('signature', 'sign', 'e_signature', 'esignature') then
      -- ── FIX-10B-F6, 2026-09-22: THE E-SIGN HALF OF DOCUMENTS COULD NOT BE REACHED. ──────
      -- `custom.doc_sign` accepts exactly one field — text whose format is `signature` — and
      -- this door would write that format only when a caller sent `format: signature`
      -- alongside a plain text type. No screen sends a format: the add-a-column panel
      -- collects an INTENTION and the store answers the behaviour, the format and the unit.
      -- So the sentence under a rendered document ("Crews needs a signature column - a text
      -- column whose format is signature") named a precondition no screen could meet, and
      -- every sign request, expiring link and sealed hash behind it was unreachable.
      -- VERIFIER-10 F6, measured from the admin seat on Rincon Plumbing's Crews table.
      -- A signature is now a WORD like every other kind, published by
      -- `custom.field_kinds()`, and the panel that offers it sends the word.
      v_plain := 'text';
      v_signature := true;
    elsif v_alias in ('autonumber', 'created_time', 'modified_time', 'auto_number',
                      'created', 'modified', 'last_modified', 'last_modified_time') then
      -- ── GRID-PRIMITIVES G5, 2026-09-22: THE STORE'S OWN STAMPS AS COLUMNS. ──────────────
      -- The older grid has an Autonumber, a Created time and a Last modified time column,
      -- and none of the three is typed: the database assigns the number and the row carries
      -- its own stamps. Here each is a formula Field whose expression is the system node —
      -- fx.autonumber is worked out ONCE, on write, and kept; the two stamps on read — so
      -- every reader that serves a worked-out value serves these with nothing new, and a
      -- hand-typed value is refused exactly as it is for any formula (FLD-9).
      v_parity := 'formula';
      v_system := case when v_alias in ('autonumber', 'auto_number') then 'autonumber'
                       when v_alias in ('created_time', 'created') then 'created_time'
                       else 'modified_time' end;
    elsif v_alias = 'relation' then
      -- ── SEAT-SUITES, 2026-09-19: A COLUMN POINTING AT ANOTHER OF YOUR OWN TABLES COULD
      -- NOT BE MADE AT ALL. ────────────────────────────────────────────────────────────
      -- `member` points at the kernel Person Table and `attachment` at the kernel File
      -- Table, and those were the ONLY two relations this door could build. A person with
      -- an Invoice Table and a Line Table could not give Invoice a Lines column through any
      -- door, although the store holds exactly that shape already: the parity-floor
      -- fixture's own `lines` field is a plain relation at a custom Table, and every guard,
      -- every edge, every rollup and `custom.record_relation_edges` handle it. Only the
      -- door refused, and it refused EVEN WHEN THE CALLER SAID WHICH TABLE.
      -- THE RULE: a caller that NAMES its target gets the relation it asked for; a caller
      -- that names nothing still gets the old sentence, because a relation with no target
      -- is the thing that sentence is actually about.
      if v_target is null then
        raise exception 'A column that points at other records is a Person column or a File column, and "%" does not say which.', v_alias
          using errcode = '23514',
                hint = 'FLD-11: say member for a person or attachment for a file, or name the Table this column points at in relation_target. Nothing was created.';
      end if;
      v_relation := v_target::uuid;
      -- ── RELATION-DECLARE, 2026-09-20: A COLUMN COULD POINT AT SOMETHING THAT IS NOT A
      -- TABLE, AND NOBODY WAS TOLD. ────────────────────────────────────────────────────────
      -- This arm took the caller's uuid and wrote it down unread. A uuid naming NOTHING at
      -- all was accepted; a uuid naming a RECORD instead of a Table was accepted. The column
      -- then points at a thing with no records to pick from and no title field to make a chip
      -- out of, and every reader downstream has to guess what that means. Measured from the
      -- seat `authenticated` on the main database, 2026-09-20. (A Table in ANOTHER
      -- organization was already refused by custom._field_shape_guard; that stands.)
      if not exists (select 1 from custom.record t
                      where t.id = v_relation
                        and t.deleted_at is null
                        and t.table_id = custom.table_kernel_id()
                        and (t.organization_id = p_organization_id or t.data_class = 'kernel')) then
        raise exception 'A column that points at other records has to point at a TABLE, and "%" is not one of this organization''s tables.', v_relation
          using errcode = '23503',
                hint = 'FLD-11 / REL-8: relation_target names the Table whose records this column may point at - open the Table you meant and use its id. Nothing was created.';
      end if;
    else
      raise exception 'There is no kind of column called "%".', p_spec ->> 'type'
        using errcode = '23514',
              hint = format('FLD-11: %s. Nothing was created.', custom._field_kinds_sentence());
    end if;
  end if;
  if v_label is null then
    raise exception 'A field needs a name - it is what a person reads on the column.'
      using errcode = '23514', hint = 'Give the field a name (a table spec''s own word) or a label - they mean the same thing here. Everything else this door can work out.';
  end if;
  if v_key is null then
    -- The panel derives the key from the label; a caller that did not is not
    -- refused for a machine token it never meant to think about.
    v_key := regexp_replace(lower(btrim(v_label)), '[^a-z0-9]+', '_', 'g');
    v_key := regexp_replace(v_key, '^_+|_+$', '', 'g');
    if v_key !~ '^[a-z]' then v_key := 'f_' || v_key; end if;
    v_key := left(v_key, 48);
  end if;
  if v_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'A field''s key is made of lower-case letters, digits and underscores, and this one is "%".', v_key
      using errcode = '23514', hint = 'FLD-13: leave the key out and the store makes one from the name.';
  end if;

  -- THE FLOOR EVERY FIELD STANDS ON. Every key the guards demand is written,
  -- always, so no caller can omit one by accident.
  d := jsonb_build_object(
    'key',                  v_key,
    'label',                v_label,
    'multi',                v_multi,
    'dated',                coalesce((p_spec ->> 'dated')::boolean, false),
    'required',             coalesce((p_spec ->> 'required')::boolean, false),
    'sort',                 coalesce((p_spec ->> 'sort')::numeric, 100),
    'source',               coalesce(nullif(p_spec ->> 'source', ''), 'manual'),
    'source_config',        coalesce(p_spec -> 'source_config', '{}'::jsonb),
    'sensitivity',          coalesce(nullif(p_spec ->> 'sensitivity', ''), 'internal'),
    'context_policy',       coalesce(nullif(p_spec ->> 'context_policy', ''), 'include'),
    'applies_to_types',     coalesce(p_spec -> 'applies_to_types', '[]'::jsonb),
    -- STORE-T / T7: THE CALLER'S OWN DEPENDENCY LIST, KEPT. It used to be hard-coded to the
    -- empty list here, so NO client-made formula ever had dependencies, `custom.field_dependants`
    -- could never name one, and REC-18's refusal — "this field is used by …" — could not fire for
    -- anything a person or an agent built. That is the third half of T7.
    'depends_on',           v_deps,
    'entity_definition_id', p_table_id);

  -- SEAT-SUITES 2026-09-19: two properties `custom.field` has always projected and this door
  -- silently dropped, so a person could read them and never set them. They are carried only
  -- when the caller names them, so no existing field's document changes shape.
  if nullif(p_spec ->> 'review_interval_days', '') is not null then
    d := d || jsonb_build_object('review_interval_days', (p_spec ->> 'review_interval_days')::integer);
  end if;
  if p_spec ? 'default' then
    d := d || jsonb_build_object('default', p_spec -> 'default');
  end if;

  -- THE RELATION A CALLER NAMED ITSELF (see the `relation` arm above). It carries no parity
  -- type — `custom.parity_type` answers nothing for it, exactly as it answers nothing for
  -- plain text and plain numbers — and every relation property is the caller's to declare.
  if v_relation is not null then
    d := d || jsonb_build_object(
      'type',             'relation',
      'relation_target',  v_relation,
      'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
      'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                               then p_spec ->> 'on_target_delete' else 'set_null' end,
      'rules',            v_rules,
      'config',           v_config);
    if nullif(p_spec ->> 'inverse_key', '') is not null then
      d := d || jsonb_build_object('inverse_key', p_spec ->> 'inverse_key');
    end if;
    return custom._with_display_format(custom._with_display(p_organization_id, d, p_spec - 'display_format'), p_spec);
  end if;

  if v_parity is null then
    -- The three behaviours a person picks that are NOT one of the parity types:
    -- plain text, a long text and a plain number. They carry no parity type,
    -- which is exactly what `custom.parity_type` answers for them.
    if v_plain = 'number' then
      d := d || jsonb_build_object('type', 'range', 'config', v_config, 'rules', v_rules);
      if nullif(p_spec ->> 'unit', '') is not null then
        d := d || jsonb_build_object('unit', p_spec ->> 'unit');
      end if;
    elsif v_plain = 'long_text' then
      d := d || jsonb_build_object('type', 'text', 'format', 'long',
                                   'config', v_config || jsonb_build_object('multiline', true),
                                   'rules', v_rules);
    else
      d := d || jsonb_build_object('type', 'text', 'config', v_config, 'rules', v_rules);
      -- ── SEAT-SUITES, 2026-09-19: A SIGNATURE FIELD COULD NOT BE DECLARED BY ANYBODY. ────
      -- `custom.doc_signature_field_ok` accepts exactly one shape — a text field whose
      -- `format` is `signature` — and `custom.doc_sign` refuses every other field by name.
      -- No door wrote that `format`: this branch dropped it, and the parity types
      -- have no signature among them. So `custom.doc_sign`, which IS granted to
      -- `authenticated`, could never be used by a signed-in person at all: the one field it
      -- accepts had no way to exist outside an INSERT straight into `custom.record`, which
      -- needs a table privilege nobody has. Measured from the seat on the main database on
      -- 2026-09-19 while converting `scripts/campaign-tests/w3_doc_c43.sql`.
      -- A plain text field may now SAY it holds a signature, and nothing else changes: a
      -- field that does not ask for it is written exactly as before.
      if v_signature or nullif(p_spec ->> 'format', '') = 'signature' then
        d := d || jsonb_build_object('format', 'signature');
      end if;
    end if;
    return custom._with_display_format(custom._with_display(p_organization_id, d, p_spec - 'display_format'), p_spec);
  end if;

  if not exists (select 1 from custom.parity_field_types() t where t.parity_type = v_parity) then
    raise exception 'There is no field type called "%" in this system.', v_parity
      using errcode = '23514',
            hint = format('FLD-11: %s.', custom._parity_types_sentence());
  end if;

  d := d || jsonb_build_object('parity_type', v_parity);

  case v_parity
    -- ── the two list types ───────────────────────────────────────────────────
    when 'select', 'multi_select' then
      d := d || jsonb_build_object(
        'type',   'list',
        'multi',  v_parity = 'multi_select',
        'rules',  v_rules,
        'config', v_config || jsonb_build_object(
                    'options_table_id', p_spec ->> 'options_table_id'));

    -- ── the two relation types a person names by what they hold ─────────────
    when 'member' then
      d := d || jsonb_build_object(
        'type',             'relation',
        'relation_target',  custom.person_kernel_id(),
        'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
        -- STORE-T / T7 (REL-2): what happens to this record when the thing it points at is
        -- deleted is the CALLER'S to declare — restrict, set_null or cascade. It was hard-coded
        -- to set_null, so no client could ever declare the `restrict` T7 asks for and every
        -- delete of a pointed-at record was accepted. set_null stays the default.
        'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                                 then p_spec ->> 'on_target_delete' else 'set_null' end,
        'rules',            v_rules,
        'config',           v_config);
    when 'attachment' then
      d := d || jsonb_build_object(
        'type',             'relation',
        'relation_target',  custom.file_kernel_id(),
        'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
        -- REC-31: removing the file removes the attachment, never the record — so `cascade` is
        -- the one answer this field may not give, and custom._field_type_parity_guard refuses it
        -- by name. restrict is a caller's to choose.
        'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                                 then p_spec ->> 'on_target_delete' else 'set_null' end,
        'rules',            v_rules,
        'config',           v_config);

    -- ── the three worked-out types ──────────────────────────────────────────
    when 'lookup' then
      d := d || jsonb_build_object(
        'type',       'formula',
        'source',     'formula',
        'compute_on', coalesce(nullif(p_spec ->> 'compute_on', ''), 'read'),
        'rules',      v_rules,
        'config',     v_config || jsonb_strip_nulls(jsonb_build_object(
                        'via',  nullif(p_spec ->> 'via', ''),
                        'pick', nullif(p_spec ->> 'pick', ''))));
    when 'rollup' then
      d := d || jsonb_build_object(
        'type',       'formula',
        'source',     'formula',
        -- FLD-11: a rollup that stamped itself at write time would be stale the
        -- moment a contained record changed, and the store refuses that — so the
        -- only answer this door can give is the right one.
        'compute_on', 'read',
        'rules',      v_rules,
        'config',     v_config || jsonb_strip_nulls(jsonb_build_object(
                        'via', nullif(p_spec ->> 'via', ''),
                        'agg', nullif(p_spec ->> 'agg', ''),
                        'of',  nullif(p_spec ->> 'of', ''))));
    when 'formula' then
      -- ── GRID-PRIMITIVES G3 / G5, 2026-09-22. ────────────────────────────────────────────
      -- A system kind carries its system expression and says which it is; nothing else it
      -- was sent can change what it works out. A formula a person TYPED (`formula_text`, the
      -- older grid's language) is parsed here by custom.formula_parse, against this Table's
      -- own columns; a mistake is refused in the parser's own words with where it is, and
      -- the text is kept beside the expression so the person edits text and never JSON.
      if v_system is not null then
        v_config := (v_config - 'formula_text') || jsonb_build_object('system', v_system);
        d := d || jsonb_build_object(
          'type',       'formula',
          'source',     'formula',
          'compute_on', case when v_system = 'autonumber' then 'write' else 'read' end,
          'rules',      v_rules,
          'config',     v_config || jsonb_build_object('expr', jsonb_build_object('op', 'fx.' || v_system)));
        if coalesce(jsonb_typeof(p_spec -> 'display_format'), 'null') = 'null' then
          p_spec := p_spec || jsonb_build_object('display_format', jsonb_build_object('id', v_system));
        end if;
      else
        if nullif(btrim(coalesce(p_spec ->> 'formula_text', '')), '') is not null then
          v_parsed := custom.formula_parse(p_organization_id, p_table_id, p_spec ->> 'formula_text');
          if not coalesce((v_parsed ->> 'ok')::boolean, false) then
            raise exception 'The formula for "%" cannot be worked out: % (at character %).',
                            v_label, v_parsed ->> 'error', coalesce((v_parsed ->> 'position')::integer, 0) + 1
              using errcode = '23514',
                    hint = 'GRID-PRIMITIVES G3: a formula names columns in braces, like {Visit fee} - {Deposit taken}; select signature, says from custom.formula_node_kinds() lists every function. Nothing was written.';
          end if;
          v_config := v_config || jsonb_build_object('formula_text', p_spec ->> 'formula_text',
                                                     'expr', v_parsed -> 'expr');
        elsif p_spec ? 'expr' then
          -- An expression written by hand no longer matches any text it came with.
          v_config := v_config - 'formula_text';
        end if;
        d := d || jsonb_build_object(
          'type',       'formula',
          'source',     'formula',
          'compute_on', coalesce(nullif(p_spec ->> 'compute_on', ''), 'read'),
          'rules',      v_rules,
          'config',     v_config || jsonb_build_object('expr',
                          coalesce(v_parsed -> 'expr', p_spec -> 'expr', v_config -> 'expr')));
      end if;

    -- ── the three formatted texts. The format says how to SHOW it; the
    --    pattern Rule is what makes it enforceable (FLD-3 / FLD-11), so the
    --    door writes the Rule rather than leaving a label on an empty box.
    when 'url' then
      d := d || jsonb_build_object('type', 'text', 'format', 'url', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', '^https?://[^\s]+$')) end);
    when 'email' then
      d := d || jsonb_build_object('type', 'text', 'format', 'email', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', '^[^@\s]+@[^@\s]+\.[^@\s]+$')) end);
    when 'phone' then
      d := d || jsonb_build_object('type', 'text', 'format', 'phone', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', custom.phone_pattern())) end);

    -- ── the three numbers and dates ─────────────────────────────────────────
    when 'currency' then
      d := d || jsonb_build_object(
        'type', 'range', 'format', 'currency',
        'unit', coalesce(nullif(p_spec ->> 'unit', ''), '$'),
        'config', v_config, 'rules', v_rules);
    when 'percent' then
      d := d || jsonb_build_object(
        'type', 'range', 'format', 'percent', 'unit', '%', 'config', v_config,
        -- FLD-3 / FLD-11: a percent field that takes -40 is a percent in name only.
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r
                                    where r ->> 'kind' in ('min', 'max'))
                      then v_rules
                      else v_rules || jsonb_build_array(
                             jsonb_build_object('kind', 'min', 'value', 0),
                             jsonb_build_object('kind', 'max', 'value', 100)) end);
    -- ── the tick box ────────────────────────────────────────────────────────
    -- No format, no unit, no options Table and no Rule: what it holds IS the
    -- behaviour. A default is carried when the caller named one (above), which is
    -- how a column can start life ticked.
    when 'checkbox' then
      d := d || jsonb_build_object('type', 'boolean', 'config', v_config, 'rules', v_rules);

    when 'datetime' then
      d := d || jsonb_build_object(
        'type', 'range', 'rules', v_rules,
        'config', v_config || jsonb_build_object(
                    'kind', case when coalesce(p_spec ->> 'kind', v_config ->> 'kind') = 'datetime'
                                 then 'datetime' else 'date' end));
      if coalesce(p_spec ->> 'kind', v_config ->> 'kind') = 'datetime' then
        d := d || jsonb_build_object('format', 'datetime');
      end if;
    else
      raise exception 'The field type "%" is known but this store does not yet know what it is made of.', v_parity
        using errcode = '23514',
              hint = 'custom._field_document_for has an arm per parity type; this one is missing. Nothing was written.';
  end case;

  return custom._with_display_format(custom._with_display(p_organization_id, d, p_spec - 'display_format'), p_spec);
end
$function$;

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- custom.field_update — the same two settings, stored or refused by name.
-- ═════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION custom.field_update(p_organization_id uuid, p_field_id uuid, p_patch jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_old       jsonb;
  v_table     uuid;
  v_next      jsonb;
  v_opts      uuid;
  v_word      text;
  v_spec      jsonb;
  v_was       text;
  v_now       text;
  v_behaviour boolean;
  v_compute_was text;
  v_compute_now text;
  v_parity    text;
  v_restamped integer := 0;
  -- IMPORT-2: THE CLOSED LIST OF WHAT THIS DOOR STORES. A key that is not here is refused by
  -- name; a key that is added to an arm below is added here in the same edit, which is the
  -- whole point — the list and the body cannot drift apart without the door going silent.
  c_settings constant text[] := array[
    'key', 'label', 'required', 'dated', 'sort', 'sensitivity', 'context_policy', 'unit',
    'rules', 'options', 'options_table_id', 'display', 'multi', 'promoted', 'unique',
    'depends_on', 'applies_to_types', 'expr', 'compute_on', 'relation_target', 'relation_max',
    'on_target_delete', 'source', 'source_config', 'review_interval_days',
    'parity_type', 'plain', 'type',
    -- GRID-PRIMITIVES G3 / G5: the formula a person types, and how the grid draws the column.
    'formula_text', 'display_format'];
  v_unknown  text[];
  v_parsed   jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.field_update');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_update');

  -- ── IMPORT-2: STORED OR REFUSED BY NAME, NEVER IGNORED. ─────────────────────────────────
  -- `custom.field_update(field, {"expr": …})` answered with the field id and changed nothing,
  -- because `expr` is read only inside the behaviour arm below. A door that accepts a word and
  -- drops it is the silent failure this store does not allow, and the remedy is a list rather
  -- than one more arm: whatever this body does not store, it says so about, by name.
  select array_agg(k order by k) into v_unknown
    from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) k
   where k <> all (c_settings);
  if v_unknown is not null then
    raise exception 'A column has no setting called %.',
        (select string_agg(format('"%s"', u), ', ') from unnest(v_unknown) u)
      using errcode = '23514',
            hint = format('FLD-12: the settings this door changes are %s. Nothing was changed.',
                          (select string_agg(format('%s', s), ', ' order by s) from unnest(c_settings) s));
  end if;

  select r.data, (r.data ->> 'entity_definition_id')::uuid into v_old, v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_field_id
     and r.table_id = custom.field_kernel_id()
     and r.deleted_at is null;
  if v_old is null then
    raise exception 'There is no such field in this organization, so nothing was changed.'
      using errcode = '23514', hint = 'REC-29: organizations are hard walls.';
  end if;
  if v_table is not null then
    perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.field_update',
                                            'admin'::public.permission_level, 'table');
  end if;

  -- ── GRID-PRIMITIVES G3, 2026-09-22: A TYPED FORMULA BECOMES THE EXPRESSION HERE. ─────────
  -- The person edits text; the store parses it against this Table's columns and the rest of
  -- this door stores the expression exactly as if it had been sent, so every refusal below
  -- ("not worked out by the store", FIX-10B-F5's column check) still applies to it.
  if p_patch ? 'formula_text' then
    if v_table is null then
      raise exception 'A typed formula reads the columns of a table, and this field belongs to none.'
        using errcode = '23514';
    end if;
    v_parsed := custom.formula_parse(p_organization_id, v_table, p_patch ->> 'formula_text');
    if not coalesce((v_parsed ->> 'ok')::boolean, false) then
      raise exception 'The formula for "%" cannot be worked out: % (at character %).',
                      coalesce(nullif(v_old ->> 'label', ''), v_old ->> 'key'),
                      v_parsed ->> 'error', coalesce((v_parsed ->> 'position')::integer, 0) + 1
        using errcode = '23514',
              hint = 'GRID-PRIMITIVES G3: a formula names columns in braces, like {Visit fee} - {Deposit taken}; select signature, says from custom.formula_node_kinds() lists every function. Nothing was changed.';
    end if;
    p_patch := p_patch || jsonb_build_object('expr', v_parsed -> 'expr');
  end if;

  if nullif(p_patch ->> 'key', '') is not null and (p_patch ->> 'key') is distinct from (v_old ->> 'key') then
    raise exception 'A field''s key is how every saved value finds it, so it cannot be renamed.'
      using errcode = '23514', hint = 'The name a person reads is the label, and that can be changed freely.';
  end if;

  -- ── IS THIS A CHANGE OF BEHAVIOUR? T12. ───────────────────────────────────────────────
  -- Any of the three words a caller uses for it. The door used to refuse one of them and
  -- ignore the other two; it now carries all three out through the same function that shapes
  -- a field when it is created, so a column changed and a column created are the same shape.
  v_behaviour := coalesce(nullif(p_patch ->> 'parity_type', ''),
                          nullif(p_patch ->> 'plain', ''),
                          nullif(p_patch ->> 'type', '')) is not null;

  if v_behaviour then
    -- The spec is everything this field already is, with the patch written over it. The key
    -- and the table never move; `custom._field_document_for` decides the rest.
    v_spec := jsonb_strip_nulls(jsonb_build_object(
      'key',            v_old ->> 'key',
      'label',          coalesce(p_patch ->> 'label', v_old ->> 'label'),
      'multi',          coalesce(p_patch -> 'multi', v_old -> 'multi'),
      'dated',          coalesce(p_patch -> 'dated', v_old -> 'dated'),
      'required',       coalesce(p_patch -> 'required', v_old -> 'required'),
      'sort',           coalesce(p_patch -> 'sort', v_old -> 'sort'),
      'source',         coalesce(p_patch ->> 'source', v_old ->> 'source'),
      'source_config',  coalesce(p_patch -> 'source_config', v_old -> 'source_config'),
      'sensitivity',    coalesce(p_patch ->> 'sensitivity', v_old ->> 'sensitivity'),
      'context_policy', coalesce(p_patch ->> 'context_policy', v_old ->> 'context_policy'),
      'applies_to_types', coalesce(p_patch -> 'applies_to_types', v_old -> 'applies_to_types'),
      'depends_on',     coalesce(p_patch -> 'depends_on', v_old -> 'depends_on'),
      'unit',           coalesce(p_patch ->> 'unit', v_old ->> 'unit'),
      'expr',           coalesce(p_patch -> 'expr', v_old -> 'config' -> 'expr'),
      -- TAILS-2, 2026-09-21: WHEN a worked-out column works itself out is part of what the
      -- column IS, and this builder's fixed key list did not carry it — so a caller who
      -- retyped a formula and said `compute_on` got `custom._field_document_for`'s default
      -- ('read') and no word about it. It is carried now; a rollup still gets 'read', and
      -- that is said out loud rather than swallowed (see the settings arm below).
      'compute_on',     coalesce(nullif(p_patch ->> 'compute_on', ''), v_old ->> 'compute_on'),
      'on_target_delete', coalesce(p_patch ->> 'on_target_delete', v_old ->> 'on_target_delete'),
      'options_table_id', coalesce(p_patch ->> 'options_table_id', v_old -> 'config' ->> 'options_table_id'),
      'options',        p_patch -> 'options',
      'rules',          coalesce(p_patch -> 'rules', v_old -> 'rules'),
      -- GRID-PRIMITIVES G3 / G5: carried like every other setting, so a retyped column keeps them.
      'formula_text',   case when p_patch ? 'formula_text' then p_patch -> 'formula_text'
                             when p_patch ? 'expr' then null
                             else v_old -> 'config' -> 'formula_text' end,
      'display_format', coalesce(p_patch -> 'display_format', v_old -> 'display_format')));
    -- The patch's own word for the behaviour, whichever of the three it used.
    if nullif(p_patch ->> 'parity_type', '') is not null then
      v_spec := v_spec || jsonb_build_object('parity_type', p_patch ->> 'parity_type');
    elsif nullif(p_patch ->> 'plain', '') is not null then
      v_spec := v_spec || jsonb_build_object('plain', p_patch ->> 'plain');
    else
      v_spec := v_spec || jsonb_build_object('type', p_patch ->> 'type');
    end if;

    v_next := custom._field_document_for(p_organization_id, v_table, v_spec);
    -- The key and the table are this field's identity and _field_document_for takes them from
    -- the spec; written again here so a spec that lost one cannot silently move a field.
    v_next := v_next || jsonb_build_object('key', v_old ->> 'key');
    -- SEAT-SUITES: a column that was indexed stays indexed when it changes what it holds,
    -- unless the patch says otherwise. `custom._field_document_for` builds a fresh document
    -- and knows nothing about either setting, so without this a retype silently un-promoted
    -- the column and the index went on standing for a shape that no longer exists.
    if coalesce(p_patch -> 'promoted', v_old -> 'promoted') is not null then
      v_next := v_next || jsonb_build_object('promoted', coalesce(p_patch -> 'promoted', v_old -> 'promoted'));
    end if;
    if coalesce(p_patch -> 'unique', v_old -> 'unique') is not null then
      v_next := v_next || jsonb_build_object('unique', coalesce(p_patch -> 'unique', v_old -> 'unique'));
    end if;
    if v_table is not null then
      v_next := v_next || jsonb_build_object('entity_definition_id', v_table::text);
    end if;

    v_was := custom.field_behaviour(v_old);
    v_now := custom.field_behaviour(v_next);

    -- THE CHOICES, if the new behaviour is a list and the caller typed some.
    if (v_next ->> 'type') = 'list'
       and nullif(v_next -> 'config' ->> 'options_table_id', '') is null
       and jsonb_typeof(p_patch -> 'options') = 'array'
       and jsonb_array_length(p_patch -> 'options') > 0 then
      v_opts := custom._options_table_for(p_organization_id, v_next ->> 'label', p_patch -> 'options');
      v_next := jsonb_set(v_next, '{config,options_table_id}', to_jsonb(v_opts::text));
    end if;

    -- ── RELATION-DECLARE, 2026-09-20: THE LINKS GO FIRST, THEN THE COLUMN CHANGES. ────
    -- Retyping a relation column to text left its edges LIVE in platform.associations, still
    -- naming a field that no longer behaves as a relation - and platform.relations_to then
    -- raised 23514 for EVERY record of the table it used to point at. One column took down
    -- the whole reverse side of another table. The links go in the same operation as the
    -- change that made them meaningless, softly, so REL-13's history keeps its record of them.
    if (v_old ->> 'type') = 'relation'
       and ((v_next ->> 'type') is distinct from 'relation'
            or (v_next ->> 'relation_target') is distinct from (v_old ->> 'relation_target')) then
      perform custom.relation_edges_withdraw(p_organization_id, array[p_field_id],
        case when (v_next ->> 'type') is distinct from 'relation'
             then format('"%s" no longer points at other records',
                         coalesce(v_next ->> 'label', v_next ->> 'key'))
             else format('"%s" now points at a different table',
                         coalesce(v_next ->> 'label', v_next ->> 'key')) end);
    end if;

    -- AND THE WRITE, which is what fires custom._field_type_converts_values: every value of
    -- this column is converted where it converts and kept in `_retired` with its reason where
    -- it does not, and the history.migration_log row is written by that same trigger. Nothing
    -- here duplicates any of it — this door's whole job was to let it happen.
    update custom.record
       set data = v_next, updated_at = now(), version = version + 1
     where organization_id = p_organization_id
       and id = p_field_id
       and table_id = custom.field_kernel_id();

    if v_was is not distinct from v_now then
      raise notice 'custom: "%" still behaves as %; its other settings were saved.',
        coalesce(v_next ->> 'label', v_next ->> 'key'), coalesce(v_now, 'before');
    end if;
    return p_field_id;
  end if;

  -- ── OTHERWISE: THE SETTINGS, exactly as before. ───────────────────────────────────────
  v_next := v_old;
  if p_patch ? 'label'          then v_next := jsonb_set(v_next, '{label}', to_jsonb(p_patch ->> 'label')); end if;
  if p_patch ? 'required'       then v_next := jsonb_set(v_next, '{required}', to_jsonb(coalesce((p_patch ->> 'required')::boolean, false))); end if;
  if p_patch ? 'dated'          then v_next := jsonb_set(v_next, '{dated}', to_jsonb(coalesce((p_patch ->> 'dated')::boolean, false))); end if;
  if p_patch ? 'sort'           then v_next := jsonb_set(v_next, '{sort}', to_jsonb(coalesce((p_patch ->> 'sort')::numeric, 100))); end if;
  if p_patch ? 'sensitivity'    then v_next := jsonb_set(v_next, '{sensitivity}', to_jsonb(p_patch ->> 'sensitivity')); end if;
  if p_patch ? 'context_policy' then v_next := jsonb_set(v_next, '{context_policy}', to_jsonb(p_patch ->> 'context_policy')); end if;
  if p_patch ? 'unit'           then v_next := jsonb_set(v_next, '{unit}', to_jsonb(p_patch ->> 'unit')); end if;
  if p_patch ? 'applies_to_types' then
    v_next := jsonb_set(v_next, '{applies_to_types}',
                        case when jsonb_typeof(p_patch -> 'applies_to_types') = 'array'
                             then p_patch -> 'applies_to_types' else '[]'::jsonb end);
  end if;
  if p_patch ? 'options_table_id' then
    v_next := jsonb_set(v_next, '{config,options_table_id}', to_jsonb(p_patch ->> 'options_table_id'));
  end if;

  -- ── IMPORT-2: THE FORMULA ITSELF, CHANGEABLE WITHOUT RETYPING THE COLUMN. ────────────────
  -- This was the found instance: `expr` appeared exactly once in this body, inside the
  -- behaviour arm, so changing a formula without ALSO sending a type word reported success and
  -- left yesterday's expression in place. A person who edits the formula of a column that is
  -- already a formula is not retyping anything. The two cases that cannot be applied are
  -- refused by name, the way `compute_on` refuses them, rather than forced quietly; and a
  -- formula naming a column that does not exist is still refused as the document lands, by
  -- FIX-10B-F5's guard on `config.expr`.
  if p_patch ? 'expr' then
    if coalesce(v_old ->> 'type', '') <> 'formula' and coalesce(v_old ->> 'source', '') <> 'formula' then
      raise exception '"%" is not worked out by the store, so it has no formula to change.',
        coalesce(nullif(v_old ->> 'label', ''), v_old ->> 'key')
        using errcode = '23514',
              hint = 'FLD-11: make it a worked-out column first - send type "formula" with the expr to this same door - and then the formula can be edited on its own. Nothing was changed.';
    end if;
    if jsonb_typeof(p_patch -> 'expr') is distinct from 'object' then
      raise exception 'A formula is an expression, and this one is a %.',
        coalesce(jsonb_typeof(p_patch -> 'expr'), 'nothing')
        using errcode = '23514',
              hint = 'FLD-11 / REC-15: expr is a Rule expression - the same shape and the same evaluator a Rule uses, e.g. {"op":"concat","args":[{"field":"<field id>"}]}. Nothing was changed.';
    end if;
    v_next := jsonb_set(v_next, '{config,expr}', p_patch -> 'expr');
  end if;

  -- ── FIX-7B-FIELD, 2026-09-20: THE SHAPE OF THE VALUE, WHICH IS A SETTING LIKE ANY OTHER. ──
  -- MEASURED on this database from the seat `authenticated`, before this migration: declare a
  -- relation column with `multi` false, call `custom.field_update(org, field, {"multi": true})`,
  -- read it back with `custom.read_record` — `multi=false, relation_max=1`. The door returned
  -- the field id, reported success and changed NOTHING. `multi` appeared exactly once in this
  -- body, inside the BEHAVIOUR arm above, which only runs when the patch also carries
  -- `parity_type`, `plain` or `type`. So the ONE control the roll-up panel's own refusal sends
  -- a person to — "Tick 'Can hold more than one' on Photos, or use Borrowed value to read its
  -- one value" — could not be reached by any door, from any client, at all. Same class as
  -- `promoted` / `unique` (SEAT-SUITES, 2026-09-19) and `source` / `review_interval_days`
  -- (ENRICH, 2026-09-20): a door that says yes and does nothing.
  --
  -- A LIST IS REFUSED BY NAME, NOT SILENTLY WRITTEN. For `select` and `multi_select`, "one
  -- answer or several" IS the behaviour — `custom._field_document_for` derives `multi` from the
  -- parity type and never from the caller — so writing `multi` on a list column here would put
  -- the document permanently at odds with its own `parity_type`, which is the silent failure
  -- again wearing the fix's clothes. The behaviour arm above already does this properly, and
  -- the refusal names the word to send it.
  if p_patch ? 'multi' then
    if (v_old ->> 'type') = 'list' then
      raise exception 'Whether "%" takes one answer or several IS what it holds, so it is changed by saying which kind it is.',
        coalesce(v_old ->> 'label', v_old ->> 'key')
        using errcode = '23514',
              hint = 'FLD-2: send parity_type "select" for one answer or "multi_select" for several; multi alone is not a setting on a list.';
    end if;
    v_next := jsonb_set(v_next, '{multi}', to_jsonb(coalesce((p_patch ->> 'multi')::boolean, false)));
  end if;
  -- REC-51: A RELATION'S CARDINALITY LIVES IN TWO KEYS AND BOTH MUST MOVE. `custom.validate_values`
  -- counts the links against `relation_max` and `custom.relation_declaration` calls the column
  -- "one" while that number is 1 — so `multi` true beside `relation_max` 1 is a column that ticks
  -- the box on screen and still refuses the second record. `custom._field_document_for` derives
  -- the same pair the same way when a column is created (1, or 25 when it holds several); a cap a
  -- caller had already widened past 25 is kept rather than narrowed, and an explicit
  -- `relation_max` in the patch always wins.
  if (v_next ->> 'type') = 'relation' and (p_patch ? 'multi' or p_patch ? 'relation_max') then
    v_next := jsonb_set(v_next, '{relation_max}', to_jsonb(greatest(1, coalesce(
      nullif(p_patch ->> 'relation_max', '')::integer,
      case when coalesce((v_next ->> 'multi')::boolean, false)
           then greatest(coalesce((v_old ->> 'relation_max')::integer, 1), 25)
           else 1 end))));
  end if;
  -- ── ENRICH, 2026-09-20: THE THREE SETTINGS THAT MADE AGT-6 UNREACHABLE. ───────────────
  -- `source`, `source_config` and `review_interval_days` are keys the Field document has
  -- always carried and this door has never had an arm for. So `custom.field_update(field,
  -- {"source":"agent","review_interval_days":30})` returned the field id, reported success
  -- and changed NOTHING - and no person and no agent could declare an enrichment on an
  -- existing column through any door at all. That is the measured state behind AGT-6's own
  -- "zero readers and zero writers", and it is the same class as `promoted` / `unique`,
  -- which SEAT-SUITES closed on 2026-09-19.
  --
  -- A column a MODEL owns is not an ordinary setting, so the arm does not simply write the
  -- word: `source = 'agent'` is handed to custom.enrich_normalize, the ONE judge of an
  -- enrichment, exactly as custom.enrich_declare does. There is therefore no way into
  -- "a model fills this in" that skips the judging - not a door, not a script, not a lane.
  if p_patch ? 'review_interval_days' then
    if jsonb_typeof(p_patch -> 'review_interval_days') = 'null' then
      v_next := v_next - 'review_interval_days';
    else
      v_next := jsonb_set(v_next, '{review_interval_days}',
                          to_jsonb((p_patch ->> 'review_interval_days')::integer));
    end if;
  end if;
  if p_patch ? 'source' or p_patch ? 'source_config' then
    v_next := jsonb_set(v_next, '{source}',
                        to_jsonb(coalesce(nullif(p_patch ->> 'source', ''), v_next ->> 'source', 'manual')));
    v_next := jsonb_set(v_next, '{source_config}',
                        coalesce(p_patch -> 'source_config', v_next -> 'source_config', '{}'::jsonb));
    if (v_next ->> 'source') = 'agent' then
      v_next := jsonb_set(v_next, '{source_config}',
                  custom.enrich_normalize(p_organization_id, v_table, v_next ->> 'key',
                    coalesce(v_next -> 'source_config', '{}'::jsonb)
                    || jsonb_strip_nulls(jsonb_build_object('review_interval_days',
                         v_next -> 'review_interval_days'))));
      -- The two copies of freshness cannot disagree: the Field's own key is the one AGT-6
      -- names, and the judged config is what the runner reads, so the judge decides both.
      if (v_next -> 'source_config' -> 'review_interval_days') is not null then
        v_next := jsonb_set(v_next, '{review_interval_days}',
                            v_next -> 'source_config' -> 'review_interval_days');
      else
        v_next := v_next - 'review_interval_days';
      end if;
    end if;
  end if;
  -- SEAT-SUITES: THE TWO SETTINGS THIS DOOR ACCEPTED AND THREW AWAY. `custom.promote_field`
  -- reads `promoted` and `unique` off the Field document to decide whether to build an index
  -- and whether it is a unique one. Neither had an arm here, so `custom.field_update(field,
  -- {"promoted":true,"unique":true})` returned the field id, reported success and changed
  -- nothing — and no person could ever ask for an indexed or a unique column through any
  -- door. Measured from the seat `authenticated` on the main database, 2026-09-19:
  -- promote_field answered `"unique": false` after the door said yes. Same class as T12,
  -- which STORE-T closed for `plain` and `type`; these are the last two.
  if p_patch ? 'promoted'       then v_next := jsonb_set(v_next, '{promoted}', to_jsonb(coalesce((p_patch ->> 'promoted')::boolean, false))); end if;
  if p_patch ? 'unique'         then v_next := jsonb_set(v_next, '{unique}', to_jsonb(coalesce((p_patch ->> 'unique')::boolean, false))); end if;
  if p_patch ? 'rules'          then v_next := jsonb_set(v_next, '{rules}', coalesce(p_patch -> 'rules', '[]'::jsonb)); end if;
  -- ── lane RELATION-DISPLAY, 2026-09-21: WHICH OF THE OTHER RECORD''S COLUMNS THIS ONE
  --    SHOWS. The same judge the create door uses (custom._display_spec_for), so a spec
  --    cannot be looser here than it was there, and an explicit null REMOVES it - the
  --    column goes back to whatever the table it points at is titled by.
  if p_patch ? 'display' then
    if (v_next ->> 'type') is distinct from 'relation' then
      raise exception 'Only a column that points at other records can say which of their columns to show, and "%" does not point at any.',
          coalesce(nullif(v_next ->> 'label', ''), nullif(v_next ->> 'key', ''), 'this column')
        using errcode = '23514',
              hint = 'REL-DISP: retype it to a column that points at another table first, or leave display out. Nothing was changed.';
    end if;
    if jsonb_typeof(p_patch -> 'display') = 'null' then
      v_next := v_next - 'display';
    else
      v_next := jsonb_set(v_next, '{display}',
                  coalesce(custom._display_spec_for(p_organization_id,
                             nullif(v_next ->> 'relation_target', '')::uuid,
                             p_patch -> 'display'), 'null'::jsonb));
      if jsonb_typeof(v_next -> 'display') = 'null' then v_next := v_next - 'display'; end if;
    end if;
  end if;
  -- STORE-T / T7: the dependency list is a SETTING of a worked-out column, and a door that
  -- could not change it could not fix a formula that reads the wrong column either.
  if p_patch ? 'depends_on'     then v_next := jsonb_set(v_next, '{depends_on}',
                                       case when jsonb_typeof(p_patch -> 'depends_on') = 'array'
                                            then p_patch -> 'depends_on' else '[]'::jsonb end); end if;

  -- ── RED-SUITES-2, 2026-09-21: THE LAST TWO KEYS THIS DOOR WAS TOLD AND THREW AWAY. ──────
  -- MEASURED on the main database through `w1_rel_c12` REL-2 / T7, from the seat
  -- `authenticated`: `custom.field_update(org, field, {"on_target_delete":"restrict"})` returns
  -- the field id, reports success, and the column still says `set_null`. `on_target_delete` and
  -- `relation_target` are BOTH declared on the published contract — `FieldPatch` in
  -- `@ai-matrx/records` `src/field.ts`, where `relation_target` is documented as "re-point the
  -- column. The old edges are withdrawn by the door" — and BOTH are honoured only by the
  -- BEHAVIOUR arm above, which runs only when the same patch also carries `type` / `plain` /
  -- `parity_type`. A person changing only "what happens when the thing this points at is
  -- deleted" sends neither, so the settings arm ran and dropped the key.
  --
  -- This is the SAME CLASS this door has already been fixed for four times, each one written
  -- into the body above: `promoted` / `unique` (SEAT-SUITES), `multi` (FIX-7B-FIELD),
  -- `source` / `review_interval_days` (ENRICH), `compute_on` (TAILS-2). These are the last two
  -- keys of `FieldPatch` the settings arm did not carry. As in every one of those, THE ANSWER
  -- IS TO APPLY IT, and the cases that cannot be applied are refused BY NAME.
  if p_patch ? 'on_target_delete' then
    if (v_next ->> 'type') is distinct from 'relation' then
      raise exception '"%" does not point at other records, so there is nothing to decide when something it points at is deleted.',
        coalesce(v_next ->> 'label', v_next ->> 'key')
        using errcode = '22023',
              hint = 'on_target_delete belongs to a relation column. Change the column to point at a table first, or leave this out.';
    end if;
    if coalesce(p_patch ->> 'on_target_delete', '') not in ('restrict', 'set_null', 'cascade') then
      raise exception '"%" is not something that can happen when a linked record is deleted.',
        coalesce(p_patch ->> 'on_target_delete', '<nothing>')
        using errcode = '22023',
              hint = 'The three answers are: restrict (refuse the delete while this link exists), set_null (drop the link and keep this record), cascade (delete this record too).';
    end if;
    v_next := jsonb_set(v_next, '{on_target_delete}', to_jsonb(p_patch ->> 'on_target_delete'));
  end if;

  -- RE-POINTING THE COLUMN, with the edges withdrawn in the SAME operation — the rule the
  -- behaviour arm above states in full: "the links go in the same operation as the change that
  -- made them meaningless, softly, so REL-13's history keeps its record of them." Dropping this
  -- key silently was the worse half of that defect: it left the caller believing the column had
  -- been re-pointed while every edge still named the old table.
  if p_patch ? 'relation_target' then
    if (v_next ->> 'type') is distinct from 'relation' then
      raise exception '"%" does not point at other records, so it cannot be pointed at a different table.',
        coalesce(v_next ->> 'label', v_next ->> 'key')
        using errcode = '22023',
              hint = 'Change the column to a link first, and then choose the table it points at.';
    end if;
    if nullif(p_patch ->> 'relation_target', '') is null then
      raise exception '"%" has to point at some table — it cannot point at nothing.',
        coalesce(v_next ->> 'label', v_next ->> 'key')
        using errcode = '22023',
              hint = 'Name the table this column should point at, or change the column to a kind that holds its own value.';
    end if;
    -- "MAY I POINT AT IT" IS "MAY I SEE IT" — the same question custom.field_declare asks of a
    -- caller who names the target themselves (RELATION-DECLARE, 2026-09-20). Without it this
    -- arm would be a way to reach a table the caller may not see, by patching instead of
    -- declaring.
    perform custom.assert_may_know_table(p_organization_id,
              (p_patch ->> 'relation_target')::uuid, 'custom.field_update');
    if (p_patch ->> 'relation_target') is distinct from (v_next ->> 'relation_target') then
      perform custom.relation_edges_withdraw(p_organization_id, array[p_field_id],
        format('"%s" now points at a different table',
               coalesce(v_next ->> 'label', v_next ->> 'key')));
    end if;
    v_next := jsonb_set(v_next, '{relation_target}', to_jsonb(p_patch ->> 'relation_target'));
  end if;

  -- THE CHOICES, EDITED WHERE THEY WERE TYPED (unchanged).
  if jsonb_typeof(p_patch -> 'options') = 'array' and (v_old ->> 'type') = 'list' then
    v_opts := nullif(v_old -> 'config' ->> 'options_table_id', '')::uuid;
    if v_opts is null then
      v_opts := custom._options_table_for(p_organization_id, v_next ->> 'label', p_patch -> 'options');
      v_next := jsonb_set(v_next, '{config,options_table_id}', to_jsonb(v_opts::text));
    else
      update custom.record o
         set deleted_at = now()
       where o.organization_id = p_organization_id
         and o.table_id = v_opts
         and o.deleted_at is null
         and not exists (select 1 from jsonb_array_elements_text(p_patch -> 'options') w
                          where btrim(w.value) = (o.data ->> 'title'));
      for v_word in select btrim(value) from jsonb_array_elements_text(p_patch -> 'options') loop
        if v_word <> '' and not exists (
             select 1 from custom.record o
              where o.organization_id = p_organization_id and o.table_id = v_opts
                and o.deleted_at is null and o.data ->> 'title' = v_word) then
          insert into custom.record (organization_id, table_id, data)
          values (p_organization_id, v_opts, jsonb_build_object('title', v_word));
        end if;
      end loop;
    end if;
  end if;

  -- ── TAILS-2, 2026-09-21: WHEN IT WORKS ITSELF OUT, WHICH THIS DOOR WAS TOLD AND IGNORED. ──
  -- MEASURED (lane SHARE-OUT, 2026-09-20): the settings arm's key list has never carried
  -- `compute_on`, so `custom.field_update(org, field, {"compute_on":"write"})` returned the
  -- field id, reported success and left the column working itself out on every read forever.
  -- A door that is told something and answers yes without doing it is the silent failure this
  -- campaign exists to end — same class as `promoted`/`unique`, `multi`, `source`.
  --
  -- THE ANSWER IS TO APPLY IT, not to refuse it: `custom._derived_fields` already stamps a
  -- `write` formula into `_derived` on every save and `custom.derived_values_of` already works
  -- a `read` one out on every read. The only cases that CANNOT be applied are refused BY NAME,
  -- with the way to change them, because "it is not a formula" and "a rollup is always read"
  -- are answers a person can act on.
  if p_patch ? 'compute_on' then
    v_parity := custom.parity_type(v_old);
    v_compute_was := nullif(v_old ->> 'compute_on', '');
    v_compute_now := nullif(btrim(coalesce(p_patch ->> 'compute_on', '')), '');
    if v_compute_now is null or v_compute_now not in ('read', 'write') then
      raise exception 'A column either works its answer out when somebody reads it or when somebody saves it, and "%" is neither.',
        coalesce(p_patch ->> 'compute_on', 'nothing')
        using errcode = '23514', hint = 'FLD-9: send compute_on as "read" or as "write".';
    end if;
    if coalesce(v_old ->> 'type', '') <> 'formula' and coalesce(v_old ->> 'source', '') <> 'formula' then
      raise exception '"%" is not worked out by the store, so there is no moment for it to be worked out at.',
        coalesce(v_old ->> 'label', v_old ->> 'key')
        using errcode = '23514',
              hint = 'FLD-9: make it a worked-out column first — send type "formula" (with expr), "lookup" or "rollup" to this same door — and then say compute_on.';
    end if;
    if v_parity = 'rollup' and v_compute_now = 'write' then
      raise exception 'A roll-up adds up other records, so an answer stamped when "%" was last saved would be wrong the moment one of them changed. It is worked out when somebody reads it, always.',
        coalesce(v_old ->> 'label', v_old ->> 'key')
        using errcode = '23514',
              hint = 'FLD-11: to stamp a number at save time, make this column a formula over its own record''s columns (send type "formula" with an expr) — a roll-up cannot be one.';
    end if;
    v_next := jsonb_set(v_next, '{compute_on}', to_jsonb(v_compute_now));
  end if;

  -- ── GRID-PRIMITIVES G3 / G5, 2026-09-22. ────────────────────────────────────────────────
  -- The text beside the expression: kept when the person typed it, dropped when an expression
  -- was sent without it (the old text would no longer describe what is worked out). A system
  -- column's expression is its system node and is not replaced by a patch.
  if coalesce(v_next -> 'config' ->> 'system', '') <> '' and p_patch ? 'expr'
     and (p_patch -> 'expr' ->> 'op') is distinct from ('fx.' || (v_next -> 'config' ->> 'system')) then
    raise exception '"%" is filled in by the store (%), so it has no formula of its own to change.',
      coalesce(nullif(v_old ->> 'label', ''), v_old ->> 'key'), v_next -> 'config' ->> 'system'
      using errcode = '23514',
            hint = 'Make it a formula column first (send type "formula" with formula_text), then its formula can be edited. Nothing was changed.';
  end if;
  if p_patch ? 'formula_text' then
    v_next := jsonb_set(v_next, '{config,formula_text}', to_jsonb(p_patch ->> 'formula_text'));
  elsif p_patch ? 'expr' then
    v_next := jsonb_set(v_next, '{config}', coalesce(v_next -> 'config', '{}'::jsonb) - 'formula_text');
  end if;
  if p_patch ? 'display_format' then
    v_next := custom._with_display_format(v_next, p_patch);
  end if;

  update custom.record
     set data = v_next, updated_at = now(), version = version + 1
   where organization_id = p_organization_id
     and id = p_field_id
     and table_id = custom.field_kernel_id();

  -- ── AND THE ANSWERS THAT ARE ALREADY OUT THERE MOVE WITH IT. ────────────────────────────
  -- `_derived` is written by the save path and by nothing else, so a column switched to
  -- `write` would hold NO stamped answer on any record until each one happened to be saved
  -- again — a column that reads empty on every existing row and full on every new one, with
  -- nothing on the screen saying why. Switching the other way leaves a stale stamp behind
  -- that `custom.computed_provenance` would keep reporting as a fact about this column.
  -- Both are closed here, through the ordinary write path, so every guard and every history
  -- row sees the change exactly as it sees a save.
  if v_table is not null and v_compute_now is not null and v_compute_now is distinct from v_compute_was then
    if v_compute_now = 'write' then
      update custom.record r
         set updated_at = now()
       where r.organization_id = p_organization_id
         and r.table_id = v_table
         and r.deleted_at is null
         and r.data_class = 'record';
      get diagnostics v_restamped = row_count;
    else
      update custom.record r
         set data = jsonb_set(r.data, '{_derived}', (r.data -> '_derived') - (v_old ->> 'key')),
             updated_at = now()
       where r.organization_id = p_organization_id
         and r.table_id = v_table
         and r.deleted_at is null
         and r.data_class = 'record'
         and (r.data -> '_derived') ? (v_old ->> 'key');
      get diagnostics v_restamped = row_count;
    end if;
    raise notice 'custom: "%" is now worked out on %, and % record(s) were brought with it.',
      coalesce(v_next ->> 'label', v_next ->> 'key'), v_compute_now, v_restamped;
  end if;

  return p_field_id;
end;
$function$;
