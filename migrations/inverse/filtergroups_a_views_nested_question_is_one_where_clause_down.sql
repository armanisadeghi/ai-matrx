-- lock: custom,platform
-- lane: S2-PRIME
-- based-on: custom.record_filter_sql(jsonb) 112145453359398a5fbda4dada03b5fc38d1972b0d39afb7024a18dfbd44224b
-- based-on: custom.read_records_matching(uuid, uuid, jsonb, boolean, integer, integer) 5fab07143d4daf1e276485852c06e48242a3af53f85358fc8230b2f793048a93
-- based-on: custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) 904ff6baf243e6d5d8e75f8fe05f57af89562466d26bde6e24f006bd7f525b25
-- based-on: custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) a1bce9b641ed048a72744d72d6ba18122330f47a77a0aad3a3b5cdf2e9aeaaf2
-- based-on: custom.pipeline_board(uuid, uuid, text) fee01c9e6f34cb388347d583213d1522ccca03ecc9a600977471b1a2e1aefef4
-- chair-step: the inverse of filtergroups_a_views_nested_question_is_one_where_clause.sql. It puts
-- back, byte for byte, the five bodies that file replaced (custom.record_filter_sql(jsonb),
-- read_records_matching, record_aggregate, agg_sql and pipeline_board(uuid, uuid, text)), deletes the three platform.client_callable_door rows it declared, and DROPS
-- the functions it added: rule_members_visible, pipeline_board(uuid, uuid, text, jsonb),
-- record_filter_sql(uuid, uuid, jsonb), rule_filter_node_sql, rule_sql_op, filter_is_rule. What it
-- undoes: a view's filter is the flat AND-only map again, a Rule expression handed to the list door
-- silently matches nothing, the board counts the whole table whatever the view asks, a signed-in
-- person has no door onto a Rule's members. (The shape guard's depth is its own chair-step file.)
-- Run the chair-step grant's inverse first
-- (filtergroups_a_signed_in_person_may_read_a_rules_members_down.sql).

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- NOT ON TOP OF LANE S3. S3's uichamp_s3_a_number_knows_last_month_and_its_target.sql DROPS the
-- eight-argument custom.agg_sql / custom.record_aggregate and creates nine-argument ones; putting
-- the eight-argument bodies back beside them would make every call with eight arguments or fewer
-- ambiguous ("function … is not unique") for every dashboard in the database. Run S3's inverse
-- (and filtergroups_the_compared_aggregate_asks_the_one_fragment_down.sql) first.
do $s3$
begin
  if to_regprocedure('custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb)') is not null
     or to_regprocedure('custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb)') is not null then
    raise exception 'lane S3''s nine-argument aggregate is on this database, so the eight-argument bodies cannot be put back beside it'
      using errcode = '55000',
            hint = 'Run uichamp_s3_a_number_knows_last_month_and_its_target_down.sql (and filtergroups_the_compared_aggregate_asks_the_one_fragment_down.sql before it) first. Nothing was changed.';
  end if;
end
$s3$;

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
                                      p_bucket, custom.choice_filter_normalize(v_map, p_filter),
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
    custom.record_filter_sql(p_filter),
    case when cardinality(v_group_sel) = 0 then ''
         else 'group by ' || (select string_agg(i::text, ', ')
                                from generate_subscripts(v_group_sel, 1) i) end,
    custom.page_size(p_organization_id, 'custom.record_aggregate', p_limit, 200));

  return v_sql;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.pipeline_board(p_organization_id uuid, p_table_id uuid, p_measure text DEFAULT NULL::text)
 RETURNS TABLE(stage_key text, stage_label text, stage_position integer, cards bigint, total numeric, wip_limit integer, over_limit boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_read jsonb;
  v_key  text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_board');
  -- VIS-5 / T10 (LADDER-CAP): and the wall after it — a Table she may not know exists is
  -- not described to her. Null Table = list everything, and this returns early on that.
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
       group by 1)
    select s.k, s.lab, s.pos, coalesce(l.n, 0), l.total, lm.n,
           lm.n is not null and coalesce(l.n, 0) > lm.n
      from stages s
      left join live l on l.k = s.k
      left join lim  lm on lm.k = s.k
     order by s.pos;
end;
$function$;

delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by = 'filtergroups_a_views_nested_question_is_one_where_clause.sql'
   and function_name in ('rule_members_visible', 'pipeline_board', 'rule_members');

drop function custom.rule_members_visible(uuid, uuid, integer, integer);
drop function custom.pipeline_board(uuid, uuid, text, jsonb);
drop function custom.record_filter_sql(uuid, uuid, jsonb);
drop function custom.rule_filter_node_sql(uuid, uuid, jsonb, jsonb, text[]);
drop function custom.rule_sql_op(text, jsonb, jsonb);
drop function custom.filter_is_rule(jsonb);
