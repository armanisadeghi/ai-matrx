-- chair-step: custom.record_aggregate and custom.agg_sql each gain two trailing arguments, p_search text DEFAULT NULL and p_time_zone text DEFAULT NULL — a signature change, so each is dropped and made again in this one transaction with its exact body plus the search: record_aggregate (client door, SECURITY DEFINER) gets its platform.client_callable_door row moved to the new signature, its argument_rules given a row for each new argument, its comment and its EXECUTE grant to authenticated back exactly as they stood; agg_sql (SECURITY INVOKER, postgres only) gets its comment back and PUBLIC revoked as before. ONE new internal function, custom.record_search_sql(uuid, uuid, text, text, text) (SECURITY INVOKER, STABLE, no client grant, no door row) carries custom.read_records_page's search predicate word for word; its p_time_zone is checked (an unknown zone is refused by name, 22023) and is read by the typed date matches chairgrid_c adds. Every existing caller of either function (positional, nine arguments) resolves to the new signature through the defaults. No table, index, policy or data row is touched.
-- lane: CHAIR-GRID (asked by v6 lane 12 PLATFORM-APP-DATA for lane data-tables-grid-overhaul, "summaries door"; ready SQL by the grid lane, grids review 3 item 5f)
-- based-on: custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) 5e8b41d823bb1e7991419f371b3ec1e2a4a8c60f9b8bd25e451a2f983c842c1b
-- based-on: custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) ee7ba48e12b4fdd3698d1bcd9bcd32d51a0cdb1b889e87cdeee29305a9aebdd1
--
-- THE SUMMARIES FOLLOW THE GRID'S SEARCH. The merged grid's footer (sum, average, filled, unique …) and
-- its group counts are custom.record_aggregate's answer; the rows on screen are custom.read_records_page's.
-- The page door took p_search and the aggregate did not, so the moment a person typed in the grid's
-- search the footer kept summing the WHOLE table under a filtered grid — a number that was not about
-- the rows in front of her.
--
-- THE ONE PRIMITIVE: custom.record_search_sql(p_organization_id, p_table_id, p_search, p_alias, p_time_zone)
-- answers the page door's search as one SQL fragment for the rows alias named: the term ILIKE any column
-- this reader may see (a string by its text, anything else by its JSON text), or a choice column holding
-- an option whose label matches; 'true' when the term is blank. Built so the aggregate and the page judge
-- the SAME predicate; chairgrid_c moves the page door onto it and teaches both the typed matches (dates
-- as a person writes them, phones by digits, money as shown). p_time_zone is the reader's zone for those
-- date matches (a datetime is a day only in some zone); null means the organization's calendar
-- (custom.agg_calendar). It is accepted and checked here so the two doors' signatures move ONCE.
--
-- WHY A DROP AND NOT AN OVERLOAD: a second overload that differs only by defaulted trailing arguments is
-- ambiguous to Postgres and to PostgREST for every call that leaves them out ("function is not unique"),
-- so the old signature cannot stay beside the new one. The drop and the create are one transaction:
-- no caller ever sees a moment without the door, and the grant is given back before it commits.
-- Inverse: migrations/inverse/chairgrid_b_the_summaries_follow_the_grids_search_down.sql

-- ── THE PRIMITIVE ────────────────────────────────────────────────────────────────────────────────
create function custom.record_search_sql(p_organization_id uuid, p_table_id uuid, p_search text, p_alias text default 'r', p_time_zone text default null)
 returns text
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
-- THE PAGE'S SEARCH, AS ONE FRAGMENT (CHAIR-GRID, 2026-10-03). custom.read_records_page's own predicate: the
-- term ILIKE any column this reader may see (a string by its text, anything else by its JSON text), or a
-- choice column holding an option whose label matches. 'true' when no term. Built for the aggregate so a
-- summary counts exactly the rows a search shows; chairgrid_c moves the page door onto this one and adds
-- the typed matches that read p_time_zone.
declare
  v_me      uuid := coalesce(custom.query_principal(), auth.uid());
  v_term    text := nullif(btrim(coalesce(p_search, '')), '');
  v_level   public.permission_level;
  v_mask    jsonb;
  v_visible text[];
  v_choices jsonb;
  v_pattern text;
  v_search  text;
  v_hits    text[];
  v_key     text;
begin
  -- THE READER'S ZONE is checked before anything is read, even while nothing here formats a date yet
  -- (chairgrid_c does): an unknown zone is a refusal by name, never a silent fallback.
  if p_time_zone is not null then
    begin
      perform now() at time zone p_time_zone;
    exception when others then
      raise exception 'The time zone "%" is not one the store knows, so dates cannot be matched in it.', p_time_zone
        using errcode = '22023',
              hint = 'Pass an IANA name such as America/Los_Angeles, or leave it out to use the organization''s calendar. Nothing was read.';
    end;
  end if;
  if v_term is null then return 'true'; end if;
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);
  v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible from jsonb_array_elements(v_mask -> 'visible') x;
  v_choices := coalesce(custom.choice_field_map(p_organization_id, p_table_id), '{}'::jsonb);
  v_pattern := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_search := format(
    $s$exists (select 1 from jsonb_each(%1$I.data) e
                where e.key = any (%2$L::text[])
                  and (case jsonb_typeof(e.value) when 'string' then e.value #>> '{}'
                            else e.value::text end) ilike %3$L)$s$,
    p_alias, v_visible, v_pattern);
  for v_key in select k from jsonb_object_keys(v_choices) k where k = any (v_visible) loop
    select coalesce(array_agg(o.key), '{}'::text[]) into v_hits
      from jsonb_each(coalesce(v_choices -> v_key -> 'options', '{}'::jsonb)) o
     where coalesce(o.value ->> 'label', '') ilike v_pattern;
    if cardinality(v_hits) > 0 then
      v_search := v_search || format(' or (%I.data -> %L) ?| %L::text[]', p_alias, v_key, v_hits);
    end if;
  end loop;
  return '(' || v_search || ')';
end
$function$;
revoke all on function custom.record_search_sql(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
comment on function custom.record_search_sql(uuid, uuid, text, text, text) is
  'CHAIR-GRID (grids review 3 item 5f): custom.read_records_page''s search as ONE SQL fragment for the rows alias p_alias — the term ILIKE any column this reader may see, or a choice column holding an option whose label matches; true when blank. p_time_zone (checked; null = the organization''s calendar) is the reader''s zone for the typed date matches chairgrid_c adds. The aggregate and the page door share it so a summary counts exactly the rows a search shows. SECURITY INVOKER, called only inside the store''s own doors.';

-- ── custom.agg_sql: p_search, judged in the same WHERE as visibility, the filter and the window ──
drop function custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb);
CREATE OR REPLACE FUNCTION custom.agg_sql(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text, p_window jsonb DEFAULT NULL::jsonb, p_search text DEFAULT NULL::text, p_time_zone text DEFAULT NULL::text)
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
  v_cal        jsonb;
  v_tz         text;
  v_ws         text;
  v_window_sql text := 'true';
  v_read_keys  text[] := '{}';
  v_as         text;
  v_expr       text;
  v_dir        text;
  v_order      text;
  v_i          integer;
  v_lat_key    text[] := '{}';
  v_lat_expr   text[] := '{}';
  v_mom        text;
  v_blank_last text;
begin
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.record_aggregate: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  for v_key in select (e #>> '{}') from jsonb_array_elements(coalesce(p_group_by, '[]'::jsonb)) e loop
    -- VISION-REACH W2: a group is read the way the record read reads it — a FORMULA column has
    -- no stored value, so it is worked out by the read path (custom.agg_field_value_sql).
    v_val := custom.agg_field_value_sql(p_organization_id, p_table_id, v_key);
    if v_val <> custom.agg_value_sql(v_key) then
      v_i := array_position(v_lat_key, v_key);
      if v_i is null then
        v_lat_key  := array_append(v_lat_key, v_key);
        v_lat_expr := array_append(v_lat_expr, v_val);
        v_i := cardinality(v_lat_key);
      end if;
      v_val := format('w.v%s', v_i);
    end if;
    v_group_sel := array_append(v_group_sel, v_val);
    v_group_lbl := array_append(v_group_lbl, quote_literal(custom.agg_assert_key(v_key)));
    v_read_keys := array_append(v_read_keys, v_key);
  end loop;

  -- S3: THE ORGANIZATION'S CALENDAR, read once and only when a date is being cut.
  if (p_bucket is not null and jsonb_typeof(p_bucket) = 'object')
     or (p_window is not null and jsonb_typeof(p_window) = 'object') then
    v_cal := custom.agg_calendar(p_organization_id);
    v_tz  := v_cal ->> 'time_zone';
    v_ws  := v_cal ->> 'week_start';
  end if;

  if p_bucket is not null and jsonb_typeof(p_bucket) = 'object' then
    v_key := custom.agg_assert_key(p_bucket ->> 'key');
    v_read_keys := array_append(v_read_keys, v_key);
    v_by  := lower(coalesce(p_bucket ->> 'by', 'month'));
    if not (v_by = any (custom.agg_buckets())) then
      raise exception 'custom.record_aggregate: "%" is not a bucket', v_by
        using errcode = '22023',
              hint = format('Legal buckets: %s.', array_to_string(custom.agg_buckets(), ', '));
    end if;
    -- VISION-REACH W3: A DATE PERIOD OF A WORKED-OUT COLUMN reads the column as the record read
    -- reads it (custom.agg_field_value_sql, one lateral value a row), so "visits by follow-up
    -- week" buckets the formula's dates instead of one empty period.
    v_mom := custom.agg_moment_sql(v_key, v_tz);
    v_val := custom.agg_field_value_sql(p_organization_id, p_table_id, v_key);
    if v_val <> custom.agg_value_sql(v_key) then
      v_i := array_position(v_lat_key, v_key);
      if v_i is null then
        v_lat_key  := array_append(v_lat_key, v_key);
        v_lat_expr := array_append(v_lat_expr, v_val);
        v_i := cardinality(v_lat_key);
      end if;
      v_mom := replace(v_mom, custom.agg_value_sql(v_key), format('w.v%s', v_i));
    end if;
    v_group_sel := array_append(v_group_sel,
      format('custom.agg_local_label(custom.agg_period_start((%s) at time zone %L, %L, %L), %L)',
             v_mom, v_tz, v_by, v_ws, v_tz));
    v_group_lbl := array_append(v_group_lbl, quote_literal(v_key || '_' || v_by));
  end if;

  -- S3: ONE HALF-OPEN WINDOW on one date, read in the SAME calendar as the bucket, so the
  -- window's first bucket and its first day are the same day. `from` and `to` arrive as
  -- moments custom.agg_compare_windows already judged; they are re-cast here, never spliced.
  if p_window is not null and jsonb_typeof(p_window) = 'object' then
    v_key := custom.agg_assert_key(p_window ->> 'key');
    v_read_keys := array_append(v_read_keys, v_key);
    -- VISION-REACH W3: a window on a worked-out date column reads it as the bucket does.
    v_mom := custom.agg_moment_sql(v_key, v_tz);
    v_val := custom.agg_field_value_sql(p_organization_id, p_table_id, v_key);
    if v_val <> custom.agg_value_sql(v_key) then
      v_i := array_position(v_lat_key, v_key);
      if v_i is null then
        v_lat_key  := array_append(v_lat_key, v_key);
        v_lat_expr := array_append(v_lat_expr, v_val);
        v_i := cardinality(v_lat_key);
      end if;
      v_mom := replace(v_mom, custom.agg_value_sql(v_key), format('w.v%s', v_i));
    end if;
    v_window_sql := format('(%1$s >= %2$L::timestamptz and %1$s < %3$L::timestamptz)',
                           v_mom,
                           (p_window ->> 'from')::timestamptz, (p_window ->> 'to')::timestamptz);
  end if;

  for m in select e from jsonb_array_elements(coalesce(p_measures, '[]'::jsonb)) e loop
    v_op := lower(coalesce(m ->> 'op', 'count'));
    -- DRILL-CUSTOM-PARITY: a measure may carry the NAME its answer is keyed by (`as`), so a
    -- measure asked by its contract name (custom.drill_resolve) comes back under that name.
    -- Judged by the same shape rule as a Field key; absent, the label is `<op>_<key>` as before.
    v_as := case when m ? 'as' and nullif(m ->> 'as', '') is not null
                 then custom.agg_assert_key(m ->> 'as') end;
    if not (v_op = any (custom.agg_operations())) then
      raise exception 'custom.record_aggregate: "%" is not a measure', v_op
        using errcode = '22023',
              hint = format('Legal measures: %s.', array_to_string(custom.agg_operations(), ', '));
    end if;
    if v_op = 'count' then
      v_expr := 'count(*)::numeric';
      v_meas_sel := array_append(v_meas_sel, quote_literal(coalesce(v_as, 'count')) || ', ' || v_expr);
    else
      v_key := custom.agg_assert_key(m ->> 'key');
      v_read_keys := array_append(v_read_keys, v_key);
      -- VISION-REACH W2 (the $640 / $1,440 defect, 2026-10-01): A FORMULA IS MEASURED AS IT IS
      -- READ. A formula, lookup or roll-up column has no stored value in `r.data` — it is worked
      -- out when the record is read — so reading `r.data` here summed nothing and answered NULL
      -- under a success. The value now comes from the SAME read path the record read uses
      -- (custom.record_value_one -> custom.derived_value -> custom.formula_eval), so every formula
      -- function, today's and any added later, is measured exactly as it is shown. A plain stored
      -- column is read straight out of the row as before.
      v_val := custom.agg_field_value_sql(p_organization_id, p_table_id, v_key);
      -- WORKED OUT ONCE A ROW. Every measure and group over the same worked-out column reads ONE
      -- lateral value (`w.v<n>`), so sum + average + maximum of a formula evaluate it once per row,
      -- not three times.
      if v_val <> custom.agg_value_sql(v_key) then
        v_i := array_position(v_lat_key, v_key);
        if v_i is null then
          v_lat_key  := array_append(v_lat_key, v_key);
          v_lat_expr := array_append(v_lat_expr, v_val);
          v_i := cardinality(v_lat_key);
        end if;
        v_val := format('w.v%s', v_i);
      end if;
      -- ── GRID-PRIMITIVES G1: THE SUMMARY BAR'S OTHER FOUR. ────────────────────────────
      -- BLANK is what the older grid's summary bar means by it (column-summaries.ts
      -- isBlank): no value, JSON null, or the empty string. An empty list is a value.
      if v_op = 'median' then
        v_expr := format('(percentile_cont(0.5) within group (order by nullif(%s, '''')::numeric))::numeric', v_val);
      elsif v_op = 'filled' then
        v_expr := format('(count(*) filter (where nullif(%s, '''') is not null))::numeric', v_val);
      elsif v_op = 'empty' then
        v_expr := format('(count(*) filter (where nullif(%s, '''') is null))::numeric', v_val);
      elsif v_op = 'unique' then
        v_expr := format('(count(distinct nullif(%s, '''')))::numeric', v_val);
      else
        v_expr := format('%s(nullif(%s, '''')::numeric)::numeric', v_op, v_val);
      end if;
      v_meas_sel := array_append(v_meas_sel,
        quote_literal(coalesce(v_as, v_op || '_' || v_key)) || ', ' || v_expr);
    end if;
    -- VISION-REACH W2: TOP-N BY THE MEASURED VALUE. A measure may carry `order` ("desc" or
    -- "asc"); the first one that does orders the groups by its own value ("the five patients
    -- with the highest copay"). Absent, groups come back largest-first by row count, as always.
    if v_order is null and m ? 'order' then
      v_dir := lower(coalesce(m ->> 'order', ''));
      if v_dir not in ('desc', 'asc') then
        raise exception 'A measure is ordered "desc" or "asc", and this one says "%".', m ->> 'order'
          using errcode = '22023',
                hint = 'Leave `order` out to keep the groups largest-first by how many records each has. Nothing was read.';
      end if;
      v_order := format('%s %s nulls last', v_expr, v_dir);
    end if;
  end loop;
  -- S2-PRIME AGG-FIELD-READ: EVERY COLUMN THIS QUESTION READS — a measure's, a group's, the
  -- bucket's and the window's date — is one this reader may read, or the question is refused by
  -- that column's own name. Before this, a sum of a confidential column answered a member who may
  -- not read it. One check, here, so every door built on this SQL inherits it.
  perform custom.agg_fields_readable_assert(p_organization_id, p_table_id, v_read_keys, p_required);

  if cardinality(v_meas_sel) = 0 then
    v_meas_sel := array[quote_literal('count') || ', count(*)::numeric'];
  end if;

  -- LANE 11 NEED 10a (CHAIR-DOORS-2, 2026-10-02): A BLANK GROUP SORTS LAST. Groups came back
  -- largest-first, so when blank was the most common value it took the first slot, and inside a
  -- small limit it pushed a real value off the end. Every group expression (a Field's value or a
  -- date period's label, both text) now sorts blank (no value or the empty string) after every
  -- real value BEFORE any other order, so a blank never takes a slot a real value could fill.
  if cardinality(v_group_sel) > 0 then
    select string_agg(format('(nullif(%s, %L) is null)', v_group_sel[i], ''), ', ' order by i)
      into v_blank_last
      from generate_subscripts(v_group_sel, 1) i;
  end if;

  v_sql := format($q$
    select %s as groups,
           jsonb_build_object(%s) as measures,
           count(*)::bigint as row_count
      from custom.record r %s
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %s
       and %s
       and %s
       and %s
     %s
     order by %s
     limit %s
  $q$,
    case when cardinality(v_group_sel) = 0 then '''{}''::jsonb'
         else 'jsonb_build_object(' ||
              (select string_agg(v_group_lbl[i] || ', ' || v_group_sel[i], ', ')
                 from generate_subscripts(v_group_sel, 1) i) || ')' end,
    array_to_string(v_meas_sel, ', '),
    -- `offset 0` keeps the planner from folding the lateral back into each expression, which would
    -- work the column out once per mention again.
    case when cardinality(v_lat_expr) = 0 then ''
         else 'cross join lateral (select ' ||
              (select string_agg(v_lat_expr[i] || ' as v' || i, ', ') from generate_subscripts(v_lat_expr, 1) i) ||
              ' offset 0) w' end,
    p_organization_id, p_table_id,
    custom.listed_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                 p_required::public.permission_level, 'r'),
    -- S2-PRIME FILTER-GROUPS: the one fragment, in either shape (flat map or Rule expression).
    custom.record_filter_sql(p_organization_id, p_table_id, p_filter),
    v_window_sql,
    -- CHAIR-GRID (grids review 3, lane H item 5f): THE GRID'S SEARCH — the page door's own predicate
    -- (custom.record_search_sql), so a summary counts exactly the rows the search shows. 'true' when blank.
    custom.record_search_sql(p_organization_id, p_table_id, p_search, 'r', p_time_zone),
    -- DRILL-CUSTOM-PARITY: GROUP BY THE EXPRESSIONS, never by position. The select list has ONE
    -- `groups` column, so `group by 1, 2` named `groups` and then `measures` — an aggregate — and
    -- every question with two groups, or a group and a date period, died with "aggregate
    -- functions are not allowed in GROUP BY" (measured on the main database 2026-09-29).
    case when cardinality(v_group_sel) = 0 then ''
         else 'group by ' || array_to_string(v_group_sel, ', ') end,
    coalesce(v_blank_last || ', ', '') || coalesce(v_order || ', count(*) desc', 'count(*) desc'),
    custom.page_size(p_organization_id, 'custom.record_aggregate', p_limit, 200));

  return v_sql;
end;
$function$;
revoke all on function custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb, text, text) from public, anon, authenticated, service_role;
comment on function custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb, text, text) is
  'W4-AGG / AGT-N-8 + S3: the ONE statement the eighth verb runs. A filter value that is a scalar is an equality; one that is an object is a half-open moment window — both in the same WHERE as Visibility, below the aggregate node. A bucket is cut in the organization''s calendar (custom.agg_calendar) and answers a local ISO moment; p_window is one more half-open window on one date, read in that same calendar. CHAIR-GRID: p_search is the grid''s search, the page door''s own predicate (custom.record_search_sql), in that same WHERE; p_time_zone is the reader''s zone for its date matches (null = the organization''s calendar).';

-- ── custom.record_aggregate: p_search and p_time_zone, handed to both statements ──
drop function custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb);
CREATE OR REPLACE FUNCTION custom.record_aggregate(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text, p_compare jsonb DEFAULT NULL::jsonb, p_search text DEFAULT NULL::text, p_time_zone text DEFAULT NULL::text)
 RETURNS TABLE(groups jsonb, measures jsonb, row_count bigint, prior_groups jsonb, prior_measures jsonb, prior_row_count bigint, delta jsonb, compare jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_map    jsonb;
  v_row    record;
  v_filter jsonb;
  v_cmp    jsonb;
  v_bkey   text;
  v_by     text;
  v_ws     text;
  v_tz     text;
  v_cur    jsonb := '[]'::jsonb;
  v_pri    jsonb := '[]'::jsonb;
  v_match  jsonb;
  v_side   text;
  v_from   timestamp;
  v_res    jsonb;
  v_orig   jsonb;
  v_keep   jsonb := '[]'::jsonb;
  v_wh     jsonb := '{}'::jsonb;
  v_wm     jsonb := '{}'::jsonb;
  v_add    jsonb := '{}'::jsonb;
  v_m      jsonb;
  v_name   text;
  v_det    text;
  v_all    jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_aggregate');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.record_aggregate');

  -- DRILL-CUSTOM-PARITY: THE CONTRACT'S NAMES. A group may be a dimension (`status`, or a time
  -- dimension at a grain, `appointment_date:month`) and a measure may be its name
  -- (`sum_duration_minutes`, `count`, or one a table admin added) — the answer of
  -- custom.table_dimensions. They are turned into this door's own arguments HERE, once, for
  -- the reader asking, before anything is built; Field keys and {op, key} measures pass through
  -- untouched, so every older caller answers exactly as before.
  v_res := custom.drill_resolve(p_organization_id, p_table_id, p_group_by, p_measures, p_bucket);
  p_group_by := v_res -> 'group_by';
  p_measures := v_res -> 'measures';
  p_bucket   := v_res -> 'bucket';
  if p_bucket = 'null'::jsonb then p_bucket := null; end if;

  -- AGG-WITHHELD: A MEASURE OVER A COLUMN THIS READER MAY NOT READ IS A STATE, NEVER AN ERROR.
  -- Each measure's column is asked the read door's question on its own; a withheld one leaves the
  -- statement (so no number is ever computed from it) and comes back as the withheld marker under
  -- the name its answer would have had. The rest of the question answers as asked.
  v_orig := coalesce(p_measures, '[]'::jsonb);
  for v_m in select e from jsonb_array_elements(v_orig) e loop
    if jsonb_typeof(v_m) = 'object' and nullif(v_m ->> 'key', '') is not null
       and lower(coalesce(v_m ->> 'op', 'count')) <> 'count' then
      begin
        perform custom.agg_fields_readable_assert(p_organization_id, p_table_id, array[v_m ->> 'key'], p_required);
      exception when insufficient_privilege then
        get stacked diagnostics v_det = pg_exception_detail;
        if v_det is null or v_det not like 'withheld:%' then
          raise;
        end if;
        v_name := coalesce(nullif(v_m ->> 'as', ''), lower(coalesce(v_m ->> 'op', 'count')) || '_' || (v_m ->> 'key'));
        v_wh := v_wh || jsonb_build_object(v_name, null);
        v_wm := v_wm || jsonb_build_object(v_name, custom.agg_withheld_marker(p_organization_id, p_table_id, v_m ->> 'key', p_required));
        continue;
      end;
    end if;
    v_keep := v_keep || jsonb_build_array(v_m);
  end loop;
  p_measures := v_keep;
  v_add := v_wh || case when v_wm = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('_withheld', v_wm) end;

  begin
  -- CHOICE-VALUE. One map per call: the filter is normalised to what is STORED before the
  -- statement is built, and the groups are named on the way out.
  v_map := custom.choice_field_map(p_organization_id, p_table_id);
  -- S2-PRIME FILTER-GROUPS: a Rule expression passes through to the one fragment; a flat map is
  -- normalised to what is stored, as before.
  v_filter := case when custom.filter_is_rule(p_filter) then p_filter
                   else custom.choice_filter_normalize(v_map, p_filter) end;

  if p_compare is null or jsonb_typeof(p_compare) = 'null' then
    for v_row in execute custom.agg_sql(p_organization_id, p_table_id, p_group_by, p_measures,
                                        p_bucket, v_filter, p_limit, p_required, null, p_search, p_time_zone) loop
      groups          := custom.choice_render_groups(v_map, v_row.groups);
      measures        := v_row.measures || v_add;
      row_count       := v_row.row_count;
      prior_groups    := null;
      prior_measures  := null;
      prior_row_count := null;
      delta           := null;
      compare         := null;
      return next;
    end loop;
    return;
  end if;

  -- ── S3: THE SAME QUESTION, TWICE, UNDER THE SAME PRINCIPAL ─────────────────────────────
  v_cmp := custom.agg_compare_windows(p_organization_id, p_compare, p_bucket);
  v_tz  := v_cmp ->> 'time_zone';
  v_ws  := v_cmp ->> 'week_start';
  -- The comparison names the period, so a window on the SAME date in the filter gives way to
  -- it; every other part of the filter narrows both series alike.
  v_filter := v_filter - (v_cmp ->> 'key');
  if p_bucket is not null and jsonb_typeof(p_bucket) = 'object' then
    v_by   := lower(coalesce(p_bucket ->> 'by', 'month'));
    v_bkey := (p_bucket ->> 'key') || '_' || v_by;
  end if;

  foreach v_side in array array['window', 'prior_window'] loop
    v_from := ((v_cmp -> v_side ->> 'from')::timestamptz) at time zone v_tz;
    for v_row in execute custom.agg_sql(p_organization_id, p_table_id, p_group_by, p_measures,
                                        p_bucket, v_filter, p_limit, p_required,
                                        jsonb_build_object('key', v_cmp ->> 'key',
                                                           'from', v_cmp -> v_side ->> 'from',
                                                           'to', v_cmp -> v_side ->> 'to'),
                                        p_search, p_time_zone) loop
      -- A group is matched by its value; a bucket by its POSITION in its own window.
      if v_bkey is null then
        v_match := coalesce(v_row.groups, '{}'::jsonb);
      else
        v_match := (coalesce(v_row.groups, '{}'::jsonb) - v_bkey)
                   || jsonb_build_object('#', case when v_row.groups ->> v_bkey is null then null else
                        custom.agg_bucket_ordinal(v_by, v_from, left(v_row.groups ->> v_bkey, 19)::timestamp, v_ws) end);
      end if;
      if v_side = 'window' then
        v_cur := v_cur || jsonb_build_array(jsonb_build_object(
          'groups', custom.choice_render_groups(v_map, v_row.groups),
          'measures', v_row.measures, 'row_count', v_row.row_count, 'match', v_match));
      else
        v_pri := v_pri || jsonb_build_array(jsonb_build_object(
          'groups', custom.choice_render_groups(v_map, v_row.groups),
          'measures', v_row.measures, 'row_count', v_row.row_count, 'match', v_match));
      end if;
    end loop;
  end loop;

  return query
    select c.e -> 'groups',
           coalesce(c.e -> 'measures', custom.agg_zero(p.e -> 'measures')) || v_add,
           coalesce((c.e ->> 'row_count')::bigint, 0),
           p.e -> 'groups',
           coalesce(p.e -> 'measures', custom.agg_zero(c.e -> 'measures')) || v_add,
           coalesce((p.e ->> 'row_count')::bigint, 0),
           custom.agg_delta(coalesce(c.e -> 'measures', custom.agg_zero(p.e -> 'measures')),
                            coalesce(p.e -> 'measures', custom.agg_zero(c.e -> 'measures'))),
           -- The row's bucket POSITION rides with the windows, so a screen can name a
           -- position the current window has not reached yet ("week 6") without counting rows.
           v_cmp || jsonb_build_object('position', coalesce(c.e -> 'match' -> '#', p.e -> 'match' -> '#'))
      from (select e from jsonb_array_elements(v_cur) e) c
      full join (select e from jsonb_array_elements(v_pri) e) p
        on (c.e -> 'match') = (p.e -> 'match')
     order by coalesce(c.e -> 'match' ->> '#', p.e -> 'match' ->> '#')::integer nulls last,
              coalesce((c.e ->> 'row_count')::bigint, 0) desc,
              coalesce((p.e ->> 'row_count')::bigint, 0) desc;
  return;

  exception when insufficient_privilege then
    -- AGG-WITHHELD: a GROUP, a date bucket, a window or a FILTER reads a column this reader may not
    -- read. Nothing can be counted by it without leaking it, so the question is answered as ONE
    -- row whose every measure is the withheld state — never a number, never an error. A refusal
    -- that is not about a withheld column (no `withheld:` detail) is re-raised untouched.
    get stacked diagnostics v_det = pg_exception_detail;
    if v_det is null or v_det not like 'withheld:%' then
      raise;
    end if;
    v_all := '{}'::jsonb;
    v_wm  := '{}'::jsonb;
    for v_m in select e from jsonb_array_elements(v_orig) e loop
      v_name := case when jsonb_typeof(v_m) = 'string' then v_m #>> '{}'
                     when lower(coalesce(v_m ->> 'op', 'count')) = 'count' then coalesce(nullif(v_m ->> 'as', ''), 'count')
                     else coalesce(nullif(v_m ->> 'as', ''), lower(coalesce(v_m ->> 'op', 'count')) || '_' || (v_m ->> 'key')) end;
      v_all := v_all || jsonb_build_object(v_name, null);
      v_wm  := v_wm  || jsonb_build_object(v_name,
                 custom.agg_withheld_marker(p_organization_id, p_table_id, substr(v_det, 10), p_required));
    end loop;
    if v_all = '{}'::jsonb then
      v_all := jsonb_build_object('count', null);
      v_wm  := jsonb_build_object('count',
                 custom.agg_withheld_marker(p_organization_id, p_table_id, substr(v_det, 10), p_required));
    end if;
    v_all := v_all || jsonb_build_object('_withheld', v_wm);
    groups := '{}'::jsonb; measures := v_all; row_count := null;
    prior_groups := null; prior_measures := null; prior_row_count := null; delta := null; compare := null;
    return next;
    return;
  end;
end;
$function$;
comment on function custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb, text, text) is
  'AGT-N-8 + S3: group, bucket (in the organization''s calendar), filter and measure inside the read door, over the rows this person may see. With p_compare the same question is answered over the current window and the prior one (previous period, same period last year, or a fixed baseline), one row per group with both series, the delta and the two windows; without it the answer is what it always was, and the four comparison columns are null. CHAIR-GRID: p_search narrows both series to the rows custom.read_records_page''s search would show (custom.record_search_sql); blank or absent, nothing changes. p_time_zone is the reader''s zone for that search''s date matches (null = the organization''s calendar).';
update platform.client_callable_door
   set identity_args = 'p_organization_id uuid, p_table_id uuid, p_group_by jsonb, p_measures jsonb, p_bucket jsonb, p_filter jsonb, p_limit integer, p_required text, p_compare jsonb, p_search text, p_time_zone text',
       identity_argtypes = array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'jsonb'::regtype::oid, 'jsonb'::regtype::oid, 'jsonb'::regtype::oid, 'jsonb'::regtype::oid, 'integer'::regtype::oid, 'text'::regtype::oid, 'jsonb'::regtype::oid, 'text'::regtype::oid, 'text'::regtype::oid],
       declared_by = 'chairgrid_b_the_summaries_follow_the_grids_search.sql',
       reason = reason || ' CHAIR-GRID: p_search (text, optional) narrows the answer to the rows custom.read_records_page''s search would show, judged inside the same WHERE as visibility; p_time_zone (text, optional, checked) is the reader''s zone for that search''s date matches. Neither grants anything.',
       argument_rules = jsonb_set(jsonb_set(coalesce(argument_rules, '{"version": 1, "arguments": {}}'::jsonb),
         '{arguments,p_search}', '{"type": "text", "check": "validated or interpreted by the function body after access is decided", "foreign": {"not_an_id": true}, "optional": true, "position": 10, "null_rule": {"means": "the function default applies"}}'::jsonb, true),
         '{arguments,p_time_zone}', '{"type": "text", "check": "validated or interpreted by the function body after access is decided", "foreign": {"not_an_id": true}, "optional": true, "position": 11, "null_rule": {"means": "the function default applies"}}'::jsonb, true)
 where schema_name = 'custom' and function_name = 'record_aggregate'
   and identity_args = 'p_organization_id uuid, p_table_id uuid, p_group_by jsonb, p_measures jsonb, p_bucket jsonb, p_filter jsonb, p_limit integer, p_required text, p_compare jsonb';
-- (No REVOKE here: the §6d-4 guard clears PUBLIC's default EXECUTE on a brand-new SECURITY DEFINER function at
-- birth, and the door register refuses a REVOKE on a function whose row opens the signed-in lane.)
grant execute on function custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb, text, text) to authenticated;
