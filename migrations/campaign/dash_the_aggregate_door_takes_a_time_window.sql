-- target: branch,production
-- additive: yes
--   It REPLACES exactly one function, `custom.agg_sql`, keeping its signature, its
--   volatility, its search_path and every existing branch. What it adds is one NEW shape a
--   filter value may take — an object `{"from": …, "to": …}` — beside the scalar equality
--   that is there today. A scalar filter builds byte-identical SQL to the body it replaces.
--   No table, column, trigger, policy or grant is touched; no row is read or written.
-- guard: custom/system_enabled
-- based-on: custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) 1dc9fa0b3d5b567eb67937202a636398a0b0fd64052870f9e2dded7d14432c85
--
-- LANE DASHBOARDS — PRODUCTS row 3, *"Show me jobs by stage THIS MONTH and what's stuck."*
--
-- THE DEFECT THIS CLOSES, AND IT IS A CLASS RATHER THAN AN INSTANCE
-- -----------------------------------------------------------------
-- AGT-N-8's door takes `p_group_by`, `p_measures`, `p_bucket` and `p_filter`, and
-- `p_filter` is EQUALITY ONLY: `custom.agg_value_sql(key) = <literal>`. So the eighth verb
-- can answer "jobs by stage" and it cannot answer "jobs by stage THIS MONTH" — the three
-- words in the middle of the product's own sentence. Every caller that wanted a period had
-- exactly two ways out and both are wrong:
--
--   · bucket by month and read every month ever, which scans the whole Table to throw most
--     of it away, and gets slower for the rest of the organization's life; or
--   · fetch the rows and filter them in the browser, which is the one thing DOOR-10 forbids
--     — a total computed over rows and then filtered has already told the caller how many
--     rows exist that they may not see.
--
-- So the window belongs in the SAME WHERE as Visibility, below the aggregate node, and it
-- belongs in the ONE body that builds that WHERE rather than in a second builder under this
-- lane's own prefix. A second statement builder for "the same question with a date on it"
-- is a second implementation of DOOR-10, and the next defect found in one of them would be
-- fixed in one of them.
--
-- WHAT THE NEW SHAPE IS, EXACTLY
-- ------------------------------
--   p_filter = {"stage": "open",                          ← unchanged: equality
--               "created_at": {"from": "2026-09-01",      ← NEW: a half-open moment range
--                              "to":   "2026-10-01"}}
--
-- `from` is INCLUSIVE, `to` is EXCLUSIVE. That is the only pair of endpoints for which
-- consecutive months tile without overlapping and without a gap, which is what "this month"
-- and "last month" have to do to be comparable — a closed `to` double-counts midnight.
-- Either end may be absent: `{"from": …}` alone is "since", `{"to": …}` alone is "before".
--
-- `created_at` and `updated_at` are REAL COLUMNS and are read as columns — the same
-- special case `p_bucket` already makes, and for the same reason: `custom.agg_value_sql`
-- reads the record's DOCUMENT, and `r.data ->> 'created_at'` is not the row's creation
-- moment and never was. Any other key is a Field, read out of the document through
-- `custom.agg_value_sql` (so a Value envelope is unwrapped exactly as it is everywhere
-- else) and cast to timestamptz; a value that is not a moment makes that ROW absent from
-- the window rather than taking the whole answer down.
--
-- WHY AN OBJECT CANNOT COLLIDE WITH ANYTHING THAT WORKS TODAY. A filter value has always
-- been read with `p_filter ->> key`, which renders an object as its JSON TEXT and compares
-- a field to the literal `{"from": "…"}`. No record has ever held that, so every object
-- filter sent to this door to date answered zero rows in silence. Turning silence into a
-- window takes nothing away from anybody; a filter that is not an object is built exactly
-- as it was.
--
-- NOTHING IS TRUSTED. `from` and `to` are validated as timestamps HERE, at build time, and
-- refused BY NAME with the text that was sent — never pasted into the statement and left
-- for `execute` to fail on, which is how a caller's string becomes a fragment of SQL. An
-- unknown key inside the object is refused by name too, so a typo (`"start"`) is a sentence
-- rather than a window that quietly never applied.
--
-- THE INVERSE: `migrations/inverse/dash_the_aggregate_door_takes_a_time_window_down.sql`
-- restores the body byte-for-byte.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.dashboard_moment_sql — how a key is read AS A MOMENT, in one place.
--
-- It is under this lane's prefix because this lane owns it, and `custom.agg_sql` calls it
-- for the same reason it calls `custom.agg_value_sql`: the rule about what a moment is must
-- have exactly one copy, or the window and the bucket will one day disagree about
-- `created_at` and no test will notice.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.dashboard_moment_sql(p_key text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select case
    -- The two real columns. `custom.agg_value_sql` would read the document, which does not
    -- hold either of them, so a window on `created_at` would silently match nothing.
    when custom.agg_assert_key(p_key) in ('created_at', 'updated_at')
      then format('r.%I', p_key)
    else format('(nullif(%s, '''')::timestamptz)', custom.agg_value_sql(p_key))
  end;
$fn$;

comment on function custom.dashboard_moment_sql(text) is
  'DASHBOARDS / AGT-N-8: the ONE reading of a Field or column AS A MOMENT, shared by the '
  'window in custom.agg_sql and by anything else that has to put a date in a WHERE. '
  'created_at and updated_at are columns; everything else is a Field in the document.';

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.dashboard_window_sql — one predicate for one `{"from":…, "to":…}`.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.dashboard_window_sql(p_key text, p_window jsonb)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_when  text;
  v_parts text[] := '{}';
  v_k     text;
  v_raw   text;
  v_at    timestamptz;
begin
  if p_window is null or jsonb_typeof(p_window) is distinct from 'object' then
    raise exception 'custom.record_aggregate: the window on "%" is not written down', p_key
      using errcode = '22004',
            hint = 'A window is {"from": "2026-09-01", "to": "2026-10-01"} — from is included, to is not.';
  end if;

  -- A KEY THAT IS NOT from OR to IS A TYPO, AND A TYPO IS TOLD. The alternative is a
  -- window that quietly never applied, and a total that is quietly over all of time.
  for v_k in select k from jsonb_object_keys(p_window) k loop
    if v_k not in ('from', 'to') then
      raise exception 'custom.record_aggregate: "%" is not part of a window on "%"', v_k, p_key
        using errcode = '22023',
              hint = 'A window has exactly two parts and either may be left out: {"from": …, "to": …}. from is included, to is not.';
    end if;
  end loop;

  v_when := custom.dashboard_moment_sql(p_key);

  foreach v_k in array array['from', 'to'] loop
    v_raw := nullif(btrim(coalesce(p_window ->> v_k, '')), '');
    continue when v_raw is null;
    -- VALIDATED HERE, NOT BY `execute`. The caller's text becomes a timestamptz in this
    -- transaction and the STATEMENT carries the timestamptz, never the caller's bytes.
    begin
      v_at := v_raw::timestamptz;
    exception when others then
      raise exception 'custom.record_aggregate: "%" is not a moment, so the window on "%" cannot be read',
        v_raw, p_key
        using errcode = '22007',
              hint = 'Write a date or a timestamp: "2026-09-01", "2026-09-01T00:00:00Z". A month is {"from": "2026-09-01", "to": "2026-10-01"}.';
    end;
    v_parts := array_append(v_parts,
      format('%s %s %L::timestamptz', v_when, case when v_k = 'from' then '>=' else '<' end, v_at));
  end loop;

  if cardinality(v_parts) = 0 then
    raise exception 'custom.record_aggregate: the window on "%" says neither from nor to', p_key
      using errcode = '22004',
            hint = 'A window with no ends is not a window. Leave the key out entirely to ask about all of time.';
  end if;

  return '(' || array_to_string(v_parts, ' and ') || ')';
end;
$fn$;

comment on function custom.dashboard_window_sql(text, jsonb) is
  'DASHBOARDS / AGT-N-8: one half-open moment range as a predicate, for custom.agg_sql''s '
  'WHERE — the same WHERE as Visibility, below the aggregate node (DOOR-10).';

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.agg_sql — the ONE statement builder, now able to say "this month".
--
-- Everything below is W4-AGG's body unchanged except the filter loop, which learns that an
-- object value is a window. The header comment is W4-AGG's own, kept whole.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.agg_sql(
  p_organization_id uuid,
  p_table_id uuid,
  p_group_by jsonb default '[]'::jsonb,
  p_measures jsonb default '[]'::jsonb,
  p_bucket jsonb default null::jsonb,
  p_filter jsonb default '{}'::jsonb,
  p_limit integer default 200,
  p_required text default 'viewer'::text)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_group_sel  text[] := '{}';
  v_group_lbl  text[] := '{}';
  v_meas_sel   text[] := '{}';
  v_where      text[] := '{}';
  v_key        text;
  v_op         text;
  v_by         text;
  m            jsonb;
  v_sql        text;
  v_i          integer := 0;
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

  -- ── the filter, in the same WHERE as Visibility ─────────────────────────────
  --
  -- A SCALAR IS AN EQUALITY, exactly as it always was. AN OBJECT IS A WINDOW — the one new
  -- shape this file adds, so that the eighth verb can answer "this month" without either
  -- reading every month ever or letting a browser do the filtering (DOOR-10).
  if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
    for v_key in select k from jsonb_object_keys(p_filter) k loop
      if jsonb_typeof(p_filter -> v_key) = 'object' then
        v_where := array_append(v_where, custom.dashboard_window_sql(v_key, p_filter -> v_key));
      else
        v_where := array_append(v_where,
          format('%s = %L', custom.agg_value_sql(v_key), p_filter ->> v_key));
      end if;
    end loop;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- ONE STATEMENT, and Visibility is a PREDICATE in its own WHERE rather than a list of
  -- ids joined back — which is what AGT-N-8's "inside the read door's own query" and
  -- DOOR-10's "never post-filtered" actually ask for, and what lets the planner prune the
  -- partition and drive the index instead of probing the primary key once per visible id.
  -- The aggregate is still computed over exactly the rows this principal may see, and the
  -- rows they may not see are still never fetched at all (READ-PERF).
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
     %s
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
    case when cardinality(v_where) = 0 then '' else 'and ' || array_to_string(v_where, ' and ') end,
    case when cardinality(v_group_sel) = 0 then ''
         else 'group by ' || (select string_agg(i::text, ', ')
                                from generate_subscripts(v_group_sel, 1) i) end,
    greatest(coalesce(p_limit, 200), 1));

  return v_sql;
end;
$function$;

comment on function custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) is
  'W4-AGG / AGT-N-8: the ONE statement the eighth verb runs. A filter value that is a scalar '
  'is an equality; one that is an object is a half-open moment window (DASHBOARDS, '
  '2026-09-20) — both in the same WHERE as Visibility, below the aggregate node.';
