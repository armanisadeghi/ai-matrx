-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W4-AGG, file 1 — AGT-N-8: `record_aggregate`, THE EIGHTH VERB.
--
-- *"`record_aggregate` groups, counts, sums and buckets INSIDE the read door's own query, never
-- by post-filtering rows the caller may not see."* Its measurement is the argument: a per-cell
-- permission check costs 8.281 ms per 50-row page — 9.4x the batched resolver — so an aggregate
-- computed outside the plan is both slower AND wrong. Slower is the small half. Wrong is that a
-- count computed over rows and then filtered has already told the caller how many rows exist
-- that they may not see; a count computed inside the plan never knew about them.
--
-- WHY THE NAME IS `custom.record_aggregate` AND NOT `custom.agg_*`. This lane's reserved prefix
-- is `agg_`, and every internal it ships sits under it. The VERB itself is named by the contract
-- (AGT-N-8) and by the server package, which already calls it as the eighth verb beside
-- `record_read`, `record_write`, `record_query`, `record_delete`, `table_ensure`, `record_import`
-- and `record_export`. It is a NEW object — nothing of that name exists — so it replaces nobody,
-- and giving it a private spelling would leave the one name the contract uses unoccupied.
--
-- THE SHAPE, and every part of it is a list so that one call answers a whole dashboard panel:
--   p_group_by   ["status", "owner"]         — Field keys. Zero of them is a grand total.
--   p_measures   [{"op":"count"},
--                 {"op":"sum","key":"amount"},
--                 {"op":"avg","key":"hours"}] — count, sum, avg, min, max. Zero of them is a
--                                               count, because a group with no measure is a
--                                               question nobody asks.
--   p_bucket     {"key":"created_at",
--                 "by":"month"}               — day | week | month | quarter | year. A bucket is
--                                               a GROUP whose expression is a date_trunc, which
--                                               is why it composes with p_group_by rather than
--                                               replacing it.
--   p_filter     {"status":"open"}            — equality on Field keys, applied in the same
--                                               WHERE as Visibility.
--
-- ONE STATEMENT, BUILT ONCE. The shape is assembled with `format` and `quote_literal` — never
-- string concatenation of caller text — and every Field key is checked against
-- `custom.agg_legal_keys` before it reaches the statement, so a key is a key and can never be
-- a fragment of SQL.
--
-- THE INVERSE: `migrations/inverse/w4_agg_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

create function custom.agg_operations()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$ select array['count', 'sum', 'avg', 'min', 'max']::text[] $fn$;

create function custom.agg_buckets()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$ select array['day', 'week', 'month', 'quarter', 'year']::text[] $fn$;

comment on function custom.agg_operations() is
  'W4-AGG / AGT-N-8: the closed set of measures, as the only copy. Rule 15 — no literals in a gate.';
comment on function custom.agg_buckets() is
  'W4-AGG / AGT-N-8: the closed set of date buckets, as the only copy.';

-- ── a key is a key, never a fragment of SQL ───────────────────────────────────
create function custom.agg_assert_key(p_key text)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
begin
  if p_key is null or btrim(p_key) = '' then
    raise exception 'custom.record_aggregate: a group or measure names no field'
      using errcode = '22004';
  end if;
  -- A Field key is an identifier in this store's own vocabulary. Anything else is refused
  -- BEFORE it reaches `format`, so the refusal is by shape rather than by escaping — escaping
  -- is what you do when you have already decided to let it through.
  if p_key !~ '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$' then
    raise exception 'custom.record_aggregate: "%" is not a field key', p_key
      using errcode = '22023',
            hint = 'A field key is a letter or underscore followed by letters, digits or underscores, up to 63 characters. It is read out of the record document by name and is never SQL.';
  end if;
  return p_key;
end;
$fn$;

comment on function custom.agg_assert_key(text) is
  'W4-AGG: refuses anything that is not a Field key BEFORE it reaches the assembled statement. The guarantee is shape, not escaping.';

-- ── the value of one Field, read the one way every W4 surface reads it ────────
create function custom.agg_value_sql(p_key text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- The Value ENVELOPE when there is one (`{"value": …}`), the plain key when there is not —
  -- the same reading `custom.query_rollup_sum` does, written once here and called from both.
  select format(
    'case when jsonb_typeof(r.data -> %1$L) = ''object'' and (r.data -> %1$L) ? ''value''
          then r.data -> %1$L ->> ''value'' else r.data ->> %1$L end',
    custom.agg_assert_key(p_key));
$fn$;

comment on function custom.agg_value_sql(text) is
  'W4-AGG: the ONE expression that reads a Field''s value out of a record document, envelope or plain. Written once so the aggregate and the rollup can never read a value two different ways.';

-- ══════════════════════════════════════════════════════════════════════════════
-- THE EIGHTH VERB.
-- ══════════════════════════════════════════════════════════════════════════════
-- THE STATEMENT IS A VALUE. `custom.agg_sql` builds it and hands it back as text; the verb
-- executes it and `custom.agg_explain` EXPLAINs it. That split is not tidiness — it is the only
-- way the exit clause can be asserted at all: `EXPLAIN` over a plpgsql function reports one
-- `Function Scan` and says NOTHING about the plan inside it, so a suite that explained the verb
-- would be reading the wrapper and calling it proof.
create function custom.agg_sql(p_organization_id uuid,
                               p_table_id uuid,
                               p_group_by jsonb default '[]'::jsonb,
                               p_measures jsonb default '[]'::jsonb,
                               p_bucket jsonb default null,
                               p_filter jsonb default '{}'::jsonb,
                               p_limit integer default 200,
                               p_required text default 'viewer')
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
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
  if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
    for v_key in select k from jsonb_object_keys(p_filter) k loop
      v_where := array_append(v_where,
        format('%s = %L', custom.agg_value_sql(v_key), p_filter ->> v_key));
    end loop;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- ONE STATEMENT. The JOIN to `custom.query_visible_ids` is inside it, BELOW the
  -- aggregate node, which is exactly what AGT-N-8's "inside the read door's own query"
  -- means and exactly what V4 reads off `EXPLAIN`: the aggregate is computed over the
  -- rows this principal may see, and the rows they may not see are never fetched at all.
  -- ══════════════════════════════════════════════════════════════════════════
  v_sql := format($q$
    select %s as groups,
           jsonb_build_object(%s) as measures,
           count(*)::bigint as row_count
      from custom.query_visible_ids(%L::uuid, %L::uuid, %L) v
      join custom.record r on r.organization_id = %L::uuid and r.id = v
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
    p_organization_id, p_table_id, p_required, p_organization_id,
    case when cardinality(v_where) = 0 then '' else 'where ' || array_to_string(v_where, ' and ') end,
    case when cardinality(v_group_sel) = 0 then ''
         else 'group by ' || (select string_agg(i::text, ', ')
                                from generate_subscripts(v_group_sel, 1) i) end,
    greatest(coalesce(p_limit, 200), 1));

  return v_sql;
end;
$fn$;

comment on function custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) is
  'W4-AGG / AGT-N-8: the one statement the eighth verb runs, as text. The verb executes it and custom.agg_explain explains it, so the plan a suite reads is the plan the verb runs — not a Function Scan standing in front of it.';

create function custom.record_aggregate(p_organization_id uuid,
                                        p_table_id uuid,
                                        p_group_by jsonb default '[]'::jsonb,
                                        p_measures jsonb default '[]'::jsonb,
                                        p_bucket jsonb default null,
                                        p_filter jsonb default '{}'::jsonb,
                                        p_limit integer default 200,
                                        p_required text default 'viewer')
returns table(groups jsonb, measures jsonb, row_count bigint)
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
begin
  return query execute custom.agg_sql(p_organization_id, p_table_id, p_group_by, p_measures,
                                      p_bucket, p_filter, p_limit, p_required);
end;
$fn$;

comment on function custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) is
  'W4-AGG / AGT-N-8, THE EIGHTH VERB: group, count, sum, avg, min, max and bucket over one Table, computed INSIDE one query whose Visibility join sits below the aggregate node. A row the principal may not see is never fetched, so it can neither be counted nor be inferred from a total.';

-- ── the plan, readable by a test rather than by a person ──────────────────────
create function custom.agg_explain(p_organization_id uuid, p_table_id uuid,
                                   p_group_by jsonb default '[]'::jsonb,
                                   p_measures jsonb default '[]'::jsonb,
                                   p_bucket jsonb default null,
                                   p_filter jsonb default '{}'::jsonb,
                                   p_required text default 'viewer')
returns jsonb
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_plan jsonb;
begin
  execute 'explain (analyze, format json, timing off, summary off) ' ||
          custom.agg_sql(p_organization_id, p_table_id, p_group_by, p_measures,
                         p_bucket, p_filter, 200, p_required)
    into v_plan;
  return v_plan;
end;
$fn$;

comment on function custom.agg_explain(uuid, uuid, jsonb, jsonb, jsonb, jsonb, text) is
  'W4-AGG: the plan of one aggregate, as jsonb, so the exit clause "the Visibility predicate sits below the aggregate node" is asserted by a suite rather than read by a person.';
