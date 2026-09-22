-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) 6f2128cc1d4f21f4282847756a4746162921fd77cf784194bd057b9bfbda7ed4
--
-- DRILL — A NUMBER ON A DASHBOARD YOU CANNOT WALK INTO.
--
-- What TAILS-6 wrote down, in its own words, when it bound the dashboard's drill-through:
-- "a drill-through still cannot narrow to the rows behind a number, and never will until the
-- store grows a filtered read door — `custom.read_records(p_filter jsonb)` or an aggregate
-- that can answer ids." A bar said 27 and the click opened the WHOLE table, with a sentence
-- underneath apologising for it. This file is that door.
--
-- THE SHAPE IS NOT A NEW SHAPE, AND THAT IS THE ENTIRE POINT.
-- `platform.saved_view.definition -> 'filters'` has been an object of field key -> value
-- across five live surface keys since DOOR-18; `custom.view_declare` writes exactly that;
-- `custom.agg_view_admits` reads exactly that; and `custom.record_aggregate(p_filter jsonb)`
-- — the door that COMPUTED the number — takes exactly that, with two shapes layered on the
-- scalar that the saved view never needed: `null` means UNSET (LIMITS-FIX, the third state of
-- a tick box) and an OBJECT means a time window (`{"from": …, "to": …}`).
--   A scalar is an equality. `null` is unset. An object is a window.
-- Inventing a second predicate language here would mean a chart could compute a number the
-- read door could not reproduce, which is the only way a drill-through can lie.
--
-- SO THE EVALUATOR IS EXTRACTED, NOT COPIED. `custom.agg_sql` grew that three-armed `for`
-- loop inside itself. It moves, verbatim, into `custom.record_filter_sql`, and `agg_sql` now
-- CALLS it. There is exactly one body in this database that turns that jsonb into SQL, so the
-- rows the drill lands on and the number the chart drew cannot drift apart by construction —
-- not today, and not when somebody adds a fourth shape.
--
-- WHY A NEW NAME AND NOT A SIXTH ARGUMENT — the ruling REALTIME-2 already paid for.
-- `custom.read_records(uuid, uuid, boolean, integer, integer)` is live and called from
-- everywhere. A defaulted `p_filter jsonb` beside it makes every existing five-argument call
-- ambiguous ("function custom.read_records(...) is not unique"), and the only way to add the
-- argument in place is to DROP a live door. Never overload a live door; a new name cannot
-- collide. `custom.read_records_by_ids` was named for the same reason two days ago, and this
-- is its sibling: the page door, addressed by a QUESTION instead of by an id set.
--
-- WHAT IS NOT DUPLICATED. Every access decision is the same call `custom.read_records` makes:
--   · `custom.assert_may_know_table`   — may this seat know this Table exists at all
--   · `custom.effective_level`         — her level ON THE TABLE, asked once for the whole page
--   · `iam.visible_field_ids`          — which columns she may see, asked once
--   · `custom.visible_predicate_sql`   — THE ONE LADDER (it calls `custom.visible_set` once and
--                                        writes out, verbatim, the same four arms
--                                        `custom.read_records` branches on), as a PREDICATE
--                                        inside this door's own WHERE. DOOR-10: filtered in the
--                                        query, never post-filtered; the rows she may not see
--                                        are never fetched, and the LIMIT still stops the scan.
--   · `custom.mask_document` / `custom.choice_render` — the hidden-field notices and the
--                                        stored words, the same two calls in the same order
--   · `custom.page_size`               — the one page contract, refusing above the ceiling by
--                                        name rather than quietly serving fewer rows
-- The filter is NORMALISED through `custom.choice_field_map` + `custom.choice_filter_normalize`
-- exactly as `custom.record_aggregate` normalises its own, because a chart hands back the
-- RENDERED word of a choice column and the store holds the key. Without that line the drill
-- from every dropdown column on every dashboard would land on zero rows.
--
-- ONE DELIBERATE DIFFERENCE FROM `custom.read_records`, SAID OUT LOUD: this door excludes
-- quarantined rows (`metadata ->> 'quarantine'`), because `custom.agg_sql` excludes them and a
-- drill that shows a row the number did not count is the same lie in the other direction.
-- Measured on the main database while writing this: zero rows anywhere are quarantined, so it
-- changes no answer today and cannot change one silently tomorrow.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE ONE EVALUATOR. Lifted out of `custom.agg_sql` unchanged.
-- ─────────────────────────────────────────────────────────────────────────────
create function custom.record_filter_sql(p_filter jsonb)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog'
as $function$
declare
  v_where text[] := '{}';
  v_key   text;
begin
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

comment on function custom.record_filter_sql(jsonb) is
  'THE ONE evaluator for the store''s filter shape — the object of field key -> value that platform.saved_view carries as `filters`, that custom.view_declare writes, that custom.agg_view_admits reads and that custom.record_aggregate takes as p_filter. A scalar is an equality, `null` is unset, an object is a time window. Extracted verbatim out of custom.agg_sql so that the number a chart draws and the rows a drill-through lands on are produced by the same bytes and cannot drift. Keys are refused by SHAPE through custom.agg_assert_key before they reach format(); a caller''s value never becomes SQL.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE AGGREGATE NOW ASKS IT. Same file, same transaction: there is never a
--    moment when two evaluators exist.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.agg_sql(p_organization_id uuid, p_table_id uuid, p_group_by jsonb default '[]'::jsonb, p_measures jsonb default '[]'::jsonb, p_bucket jsonb default null::jsonb, p_filter jsonb default '{}'::jsonb, p_limit integer default 200, p_required text default 'viewer'::text)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_group_sel  text[] := '{}';
  v_group_lbl  text[] := '{}';
  v_meas_sel   text[] := '{}';
  v_key        text;
  v_op         text;
  v_by         text;
  m            jsonb;
  v_sql        text;
begin
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.record_aggregate: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  -- ── the groups ──────────────────────────────────────────────────────────────
  for v_key in select (e #>> '{}') from jsonb_array_elements(coalesce(p_group_by, '[]'::jsonb)) e loop
    -- `array_append`, never `||`: `anyarray || anycompatible` and `anyarray || anyarray` are
    -- both candidates for `text[] || text`, and PostgreSQL resolves it to the SECOND, casting
    -- the string to text[] and raising `malformed array literal` on the first expression that
    -- contains a comma. Named here because the failure is at run time and reads like a bug in
    -- the caller's data.
    v_group_sel := array_append(v_group_sel, custom.agg_value_sql(v_key));
    v_group_lbl := array_append(v_group_lbl, quote_literal(custom.agg_assert_key(v_key)));
  end loop;

  -- ── the bucket, which is a group whose expression is a date_trunc ───────────
  if p_bucket is not null and jsonb_typeof(p_bucket) = 'object' then
    v_key := custom.agg_assert_key(p_bucket ->> 'key');
    v_by  := lower(coalesce(p_bucket ->> 'by', 'month'));
    if not (v_by = any (custom.agg_buckets())) then
      raise exception 'custom.record_aggregate: "%" is not a bucket', v_by
        using errcode = '22023',
              hint = format('Legal buckets: %s.', array_to_string(custom.agg_buckets(), ', '));
    end if;
    -- `created_at` is a real column; anything else is a Field read out of the document. Both
    -- are cast to timestamptz, and a value that is not a date makes the ROW absent from the
    -- bucket rather than making the whole answer fail.
    if v_key = 'created_at' then
      v_group_sel := array_append(v_group_sel, format('date_trunc(%L, r.created_at)::text', v_by));
    else
      v_group_sel := array_append(v_group_sel,
        format('date_trunc(%L, (nullif(%s, '''')::timestamptz))::text', v_by, custom.agg_value_sql(v_key)));
    end if;
    v_group_lbl := array_append(v_group_lbl, quote_literal(v_key || '_' || v_by));
  end if;

  -- ── the measures ────────────────────────────────────────────────────────────
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
      v_meas_sel := array_append(v_meas_sel,
        quote_literal(v_op || '_' || v_key) || ', ' ||
        format('%s(nullif(%s, '''')::numeric)::numeric', v_op, custom.agg_value_sql(v_key)));
    end if;
  end loop;
  if cardinality(v_meas_sel) = 0 then
    v_meas_sel := array[quote_literal('count') || ', count(*)::numeric'];
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- ONE STATEMENT, and Visibility is a PREDICATE in its own WHERE rather than a list of
  -- ids joined back — which is what AGT-N-8's "inside the read door's own query" and
  -- DOOR-10's "never post-filtered" actually ask for, and what lets the planner prune the
  -- partition and drive the index instead of probing the primary key once per visible id.
  -- The aggregate is still computed over exactly the rows this principal may see, and the
  -- rows they may not see are still never fetched at all (READ-PERF).
  --
  -- DRILL 2026-09-22: the filter fragment is no longer built here. It is built by
  -- `custom.record_filter_sql`, which `custom.read_records_matching` also calls, so the
  -- rows behind this number and the rows the drill-through opens come out of ONE body.
  -- ══════════════════════════════════════════════════════════════════════════
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
    custom.record_filter_sql(p_filter),
    case when cardinality(v_group_sel) = 0 then ''
         else 'group by ' || (select string_agg(i::text, ', ')
                                from generate_subscripts(v_group_sel, 1) i) end,
    custom.page_size(p_organization_id, 'custom.record_aggregate', p_limit, 200));

  return v_sql;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. THE DOOR.
-- ─────────────────────────────────────────────────────────────────────────────
create function custom.read_records_matching(
  p_organization_id uuid,
  p_table_id        uuid,
  p_filter          jsonb   default '{}'::jsonb,
  p_by_id           boolean default false,
  p_limit           integer default 200,
  p_offset          integer default 0
)
returns table(id uuid, document jsonb, level public.permission_level)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
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
     order by r.created_at desc
     limit %s offset %s
  $q$,
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r'),
    -- CHOICE-VALUE. A chart hands back the RENDERED word of a dropdown and the store holds
    -- the key, so the filter is normalised to what is STORED before the statement is built —
    -- the same one line `custom.record_aggregate` runs before it counts.
    custom.record_filter_sql(custom.choice_filter_normalize(
      custom.choice_field_map(p_organization_id, p_table_id), p_filter)),
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

comment on function custom.read_records_matching(uuid, uuid, jsonb, boolean, integer, integer) is
  'DOOR-1 WITH A QUESTION: a page of one Table''s records narrowed by the store''s own filter shape — the object of field key -> value that platform.saved_view carries as `filters` and custom.record_aggregate takes as p_filter (a scalar is an equality, `null` is unset, an object is a time window). Decided by the SAME ladder, level, field masking, choice rendering and page ceiling as custom.read_records; a new name rather than a sixth argument, because a defaulted argument beside the live five-argument door makes every existing call ambiguous. The filter is evaluated by custom.record_filter_sql — the one body custom.agg_sql also calls — so the rows this door opens are the rows the number on the dashboard counted, by construction. Filtered INSIDE the query (DOOR-10): a row this reader may not see is never fetched.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. THE DOOR DECLARATION, BEFORE THE GRANT. Without the row, this database's own
--    ddl_guard takes the client EXECUTE straight back off a SECURITY DEFINER
--    function and every call answers 42501.
-- ─────────────────────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, reason, declared_by,
   anonymous_callers, signed_in_callers, argument_rules)
values
  ('custom', 'read_records_matching',
   'p_organization_id uuid, p_table_id uuid, p_filter jsonb, p_by_id boolean, p_limit integer, p_offset integer',
   'The same read door as custom.read_records, addressed by a QUESTION instead of by a page alone. It resolves the reader from the session (auth.uid()), asks custom.assert_may_know_table exactly as the page door does, takes its level from custom.effective_level and its rows from custom.visible_predicate_sql — the one ladder, written into this door''s own WHERE — so it can only ever answer with records the caller could already have paged to. p_filter NARROWS that set and can never widen it: it is evaluated by custom.record_filter_sql, whose keys are refused by shape and whose values are quoted literals, and it is applied in the same WHERE as Visibility rather than after it. Field masking, hidden-field notices, choice rendering and the page ceiling are the same calls in the same order.',
   'drill_the_read_door_takes_the_filter.sql',
   false, true,
   jsonb_build_object(
     'version', 1,
     'declared_by', 'drill_the_read_door_takes_the_filter.sql',
     'declared_at', '2026-09-22 lane DRILL, per-door reading of the body',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object(
         'type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_may_know_table(arg1), custom.effective_level(arg2), custom.visible_predicate_sql(arg2) — the organization wall — a non-member is refused before anything is read.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-22 lane DRILL — read from this body: the ladder call, its argument position, and that it precedes every other use of the argument'),
       'p_table_id', jsonb_build_object(
         'type', 'uuid', 'position', 2, 'entity', 'custom_record',
         'check', 'this body decides it with custom.assert_may_know_table(arg2), custom.effective_level(arg3), custom.visible_predicate_sql(arg3) — the record ladder at the level this call names, decided before any row is read.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-22 lane DRILL — read from this body: the ladder call, its argument position, and that it precedes every other use of the argument'),
       'p_filter', jsonb_build_object(
         'type', 'jsonb', 'position', 3,
         'check', 'A FILTER, AND NOT A LEAK. It appears only as an additional conjunct in the SAME where clause as custom.visible_predicate_sql: it NARROWS a set this caller is already entitled to read and has no arm that can widen it. Its keys are refused by shape by custom.agg_assert_key before they reach format(); its values are quoted literals; a window''s moments are cast to timestamptz in this transaction, so no caller byte is ever executed as SQL. A key naming a field this caller may not see narrows the answer and still cannot reveal that field: the document is masked afterwards by custom.mask_document exactly as on the unfiltered door.',
         'foreign', jsonb_build_object('not_a_leak', true, 'same_as_invented', true),
         'verified', '2026-09-22 lane DRILL — read from this body')))
  )
on conflict (schema_name, function_name, identity_argtypes) do update
  set argument_rules = excluded.argument_rules,
      reason         = excluded.reason;
