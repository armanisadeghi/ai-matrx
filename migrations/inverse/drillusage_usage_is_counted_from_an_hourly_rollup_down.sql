-- chair-step: the inverse of migrations/campaign/drillusage_usage_is_counted_from_an_hourly_rollup.sql (lane DRILL-USAGE-PAGE) — drops platform.ai_usage_names and platform.ai_usage_recount (+ their door rows), the rollup function, the registry row ai_usage_hourly and the derived table runtime._ai_usage_hourly (a summary rebuilt from the ledger; no source data lives only there), and puts back lane DRILL-STANDARD-DOOR's platform._drill_resolve and platform._drill_plan exactly as they were.
-- lane: DRILL-USAGE-PAGE
-- lock: platform
-- based-on: platform._drill_resolve(uuid, text) 4a22c2cd28a6644c6f223fb0eed74a0a30768ef0a74573ce5cb05490f2ddfb87
-- based-on: platform._drill_plan(uuid, jsonb, jsonb, text) e3f4e3e4a971621ebc69057b383eea54ff2a2e675ad9a4d67accdaf4d428d0e6


delete from platform.client_callable_door where (schema_name, function_name) in (('platform', 'ai_usage_names'), ('platform', 'ai_usage_recount'), ('runtime', 'ai_usage_hourly_refresh'));
drop function if exists platform.ai_usage_names(uuid, jsonb);
drop function if exists platform.ai_usage_recount(uuid, timestamptz, timestamptz);
drop function if exists runtime.ai_usage_hourly_refresh(timestamptz, timestamptz);
delete from platform.entity_types where token = 'ai_usage_hourly';
drop table if exists runtime._ai_usage_hourly;

CREATE OR REPLACE FUNCTION platform._drill_resolve(p_organization_id uuid, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_grains constant jsonb := '["year","quarter","month","week","day"]';
  v_decl   jsonb;
  v_prob   text[];
  v_et     record;
  v_fact   text;
  v_dims   jsonb := '[]';
  v_meas   jsonb := '[]';
  v_paths  jsonb := '[]';
  v_cols   jsonb := '{}';
  v_joins  jsonb := '[]';
  v_alias  jsonb;
  v_lanes  jsonb;
  v_lcols  jsonb := '{}';
  v_pk     text[];
  a        record;
  v_col    jsonb;
  v_fk     jsonb;
  v_label  text;
  v_nd     numeric;
  v_max    integer;
  v_vals   jsonb;
  v_first_choice text;
  v_first_time   text;
  v_first_sum    text;
  v_detail jsonb := '[]';
  j        jsonb;
  d        jsonb;
  v_from   text;
  v_a      text;
  v_c      text;
  v_def    jsonb;
  v_mode   text := 'invoker';
  v_hide   jsonb;
  v_rls    boolean;
  v_nostats text[] := '{}';
begin
  if p_token is null or p_token !~ '^[a-z][a-z0-9_.]{0,62}$' then
    raise exception 'There is no table or definition called "%".', coalesce(p_token, '')
      using errcode = '22023', hint = 'Name a standard table by its registry token ("agent", "ai_model") or a declared definition by its key.';
  end if;

  v_decl := platform.drill_declared(p_token);
  if v_decl is not null then
    v_prob := platform.drill_definition_problems(v_decl);
    if cardinality(v_prob) > 0 then
      raise exception 'The declared definition "%" is not sound, so nothing was counted: %', p_token, array_to_string(v_prob, ' ')
        using errcode = '42P17', hint = 'Fix its *.drill.ts file and run the drill sync; the census check:drill-definitions-declare-lanes names the same problems.';
    end if;
    v_fact := v_decl ->> 'fact';
    v_mode := coalesce(v_decl ->> 'mode', 'invoker');
  else
    v_fact := p_token;
  end if;

  select e.token, e.schema_name, e.table_name, e.type, e.data_class::text as data_class, e.label,
         e.title_column, e.is_active, e.client_excluded_columns, e.governed_columns
    into v_et from platform.entity_types e where e.token = v_fact;
  if v_et.token is null or not v_et.is_active then
    raise exception 'There is no table or definition called "%".', p_token
      using errcode = '42704', hint = 'Name a standard table by its registry token or a declared definition by its key.';
  end if;
  if v_decl is null and (v_et.type in ('restricted', 'deprecated', 'system') or v_et.data_class = 'confidential') then
    raise exception 'The % table "%" is not offered for drilling by inference.', coalesce(nullif(v_et.data_class, 'organization'), v_et.type), p_token
      using errcode = '42501',
            hint = 'Restricted, deprecated and confidential tables are never offered; a System table only through a declared definition that names what it shows (a *.drill.ts file).';
  end if;
  -- A table this seat holds no SELECT on is not described (the answer would only be a refusal).
  if not has_table_privilege(custom.caller_role(), format('%I.%I', v_et.schema_name, v_et.table_name), 'select') then
    raise exception 'You cannot read the % table, so it cannot be counted or grouped for you.', coalesce(v_et.label, p_token)
      using errcode = '42501', hint = 'It is read only by the platform itself.';
  end if;
  select c.relrowsecurity into v_rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = v_et.schema_name and c.relname = v_et.table_name;

  select coalesce(array_agg(att.attname::text order by array_position(k.conkey, att.attnum)), '{}')
    into v_pk
    from pg_constraint k
    join pg_attribute att on att.attrelid = k.conrelid and att.attnum = any (k.conkey)
   where k.conrelid = format('%I.%I', v_et.schema_name, v_et.table_name)::regclass and k.contype = 'p';

  v_alias := jsonb_build_object('', jsonb_build_object('schema', v_et.schema_name, 'table', v_et.table_name, 'alias', 't'));
  v_max := coalesce((platform.knob_resolve('drill', 'text_dimension_max_distinct', p_organization_id, auth.uid()) #>> '{}')::integer, 200);

  if v_decl is null or v_decl ->> 'key' = v_fact then
    -- ── INFERENCE (d.3): the catalogue and the registry say what each column is. ──────────
    for a in
      select att.attname::text as col, att.attnum
        from pg_attribute att
       where att.attrelid = format('%I.%I', v_et.schema_name, v_et.table_name)::regclass
         and att.attnum > 0 and not att.attisdropped
       order by att.attnum
    loop
      v_col := platform._drill_column(v_et.schema_name, v_et.table_name, a.col);
      continue when (v_col ->> 'excluded')::boolean or (v_col ->> 'array')::boolean
                    or v_col ->> 'cat' = 'other' or a.col = 'deleted_at';
      -- column privileges: a column this seat may not select is not offered
      continue when not has_column_privilege(custom.caller_role(), format('%I.%I', v_et.schema_name, v_et.table_name), a.col, 'select');
      continue when a.col = any (v_pk) and cardinality(v_pk) = 1 and v_col ->> 'cat' = 'uuid';
      v_label := case a.col when 'created_at' then 'Added' when 'updated_at' then 'Last changed'
                            when 'created_by' then 'Added by' when 'updated_by' then 'Last changed by'
                            when 'organization_id' then 'Organization'
                            else initcap(regexp_replace(regexp_replace(a.col, '_id$', ''), '_', ' ', 'g')) end;
      v_cols := v_cols || jsonb_build_object(a.col, v_col || jsonb_build_object('alias', 't'));

      if v_col ->> 'cat' = 'uuid' then
        v_fk := platform._drill_fk(v_et.schema_name, v_et.table_name, a.col, null);
        if v_fk is not null then
          v_cols := jsonb_set(v_cols, array[a.col, 'fk'], v_fk);
        end if;
        if a.col = 'organization_id' then
          v_lcols := v_lcols || jsonb_build_object('organization', a.col);
        end if;
        if a.col in ('created_by', 'user_id', 'owner_id') and not v_lcols ? 'mine'
           and (v_fk is null or v_fk ->> 'schema' in ('iam', 'auth')) then
          v_lcols := v_lcols || jsonb_build_object('mine', a.col);
        end if;
        if v_fk is not null or a.col in ('created_by', 'updated_by', 'user_id', 'owner_id') then
          v_dims := v_dims || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
            'key', a.col, 'label', v_label, 'from', a.col, 'kind', 'relation',
            'relation', jsonb_strip_nulls(jsonb_build_object(
              'token', coalesce(v_fk ->> 'token', case when a.col in ('created_by','updated_by','user_id','owner_id') then 'user' end),
              'person', case when (v_fk ->> 'schema') in ('iam', 'auth') or v_fk is null then true end)))));
          v_detail := v_detail || to_jsonb(a.col);
        end if;
      elsif v_col ->> 'cat' = 'bool' then
        v_dims := v_dims || jsonb_build_array(jsonb_build_object(
          'key', a.col, 'label', v_label, 'from', a.col, 'kind', 'boolean', 'cardinality', 'low'));
      elsif v_col ->> 'cat' = 'enum' then
        select jsonb_agg(jsonb_build_object('value', en.enumlabel, 'label', en.enumlabel) order by en.enumsortorder)
          into v_vals from pg_enum en
         where en.enumtypid = (select att.atttypid from pg_attribute att
                                where att.attrelid = format('%I.%I', v_et.schema_name, v_et.table_name)::regclass and att.attname = a.col);
        v_dims := v_dims || jsonb_build_array(jsonb_build_object(
          'key', a.col, 'label', v_label, 'from', a.col, 'kind', 'choice', 'cardinality', 'low', 'choices', coalesce(v_vals, '[]')));
        v_first_choice := coalesce(v_first_choice, a.col);
        v_detail := v_detail || to_jsonb(a.col);
      elsif v_col ->> 'cat' = 'text' then
        -- a CHECK (col = ANY (ARRAY[...])) list is a choice
        select jsonb_agg(jsonb_build_object('value', m[1], 'label', m[1]))
          into v_vals
          from pg_constraint k
          cross join lateral regexp_matches(pg_get_constraintdef(k.oid), '''((?:[^'']|'''')*)''::(?:text|character varying)', 'g') m
         where k.conrelid = format('%I.%I', v_et.schema_name, v_et.table_name)::regclass
           and k.contype = 'c' and k.conkey = array[a.attnum]
           and pg_get_constraintdef(k.oid) ~* ('^CHECK \(\(\(?' || a.col || '\)? = ANY \(ARRAY\[');
        if v_vals is not null then
          v_dims := v_dims || jsonb_build_array(jsonb_build_object(
            'key', a.col, 'label', v_label, 'from', a.col, 'kind', 'choice', 'cardinality', 'low', 'choices', v_vals));
          v_first_choice := coalesce(v_first_choice, a.col);
          v_detail := v_detail || to_jsonb(a.col);
        else
          -- free text is a dimension only while the planner's own statistics say it is a category
          select case when s.n_distinct >= 0 then s.n_distinct
                      else -s.n_distinct * greatest(c.reltuples, 0) end
            into v_nd
            from pg_stats s
            join pg_namespace n on n.nspname = s.schemaname
            join pg_class c on c.relnamespace = n.oid and c.relname = s.tablename
           where s.schemaname = v_et.schema_name and s.tablename = v_et.table_name and s.attname = a.col;
          if v_nd is null then
            v_nostats := v_nostats || a.col;
          end if;
          if v_nd is not null and v_nd >= 1 and v_nd <= v_max
             and not exists (select 1 from pg_stats s2 where s2.schemaname = v_et.schema_name
                               and s2.tablename = v_et.table_name and s2.attname = a.col and s2.n_distinct <= -0.5) then
            v_dims := v_dims || jsonb_build_array(jsonb_build_object(
              'key', a.col, 'label', v_label, 'from', a.col, 'kind', 'text',
              'cardinality', case when v_nd <= 24 then 'low' else 'medium' end));
            v_detail := v_detail || to_jsonb(a.col);
          elsif a.col = v_et.title_column then
            v_detail := v_detail || to_jsonb(a.col);
          end if;
        end if;
      elsif v_col ->> 'cat' = 'time' then
        v_dims := v_dims || jsonb_build_array(jsonb_build_object(
          'key', a.col, 'label', v_label, 'from', a.col, 'kind', 'time', 'grains', c_grains));
        v_paths := v_paths || jsonb_build_array(jsonb_build_object(
          'key', a.col, 'label', v_label || ' by period',
          'levels', (select jsonb_agg(a.col || ':' || (g #>> '{}')) from jsonb_array_elements(c_grains) g)));
        v_first_time := case when a.col = 'created_at' then a.col else coalesce(v_first_time, a.col) end;
        v_detail := v_detail || to_jsonb(a.col);
      elsif v_col ->> 'cat' = 'number' and a.col !~ '(_id|_ids)$' and not (a.col = any (v_pk)) then
        v_meas := v_meas
          || jsonb_build_array(jsonb_build_object('key', 'sum_' || a.col, 'label', 'Total ' || lower(v_label), 'op', 'sum', 'of', a.col, 'additive', true))
          || jsonb_build_array(jsonb_build_object('key', 'avg_' || a.col, 'label', 'Average ' || lower(v_label), 'op', 'avg', 'of', a.col, 'additive', false))
          || jsonb_build_array(jsonb_build_object('key', 'min_' || a.col, 'label', 'Lowest ' || lower(v_label), 'op', 'min', 'of', a.col, 'additive', false))
          || jsonb_build_array(jsonb_build_object('key', 'max_' || a.col, 'label', 'Highest ' || lower(v_label), 'op', 'max', 'of', a.col, 'additive', false));
        if a.col !~ '(^version$|order|position|sort|rank|index|priority|_count$|attempts|rating)' then
          v_first_sum := coalesce(v_first_sum, 'sum_' || a.col);
        end if;
        v_detail := v_detail || to_jsonb(a.col);
      end if;
    end loop;
    v_meas := jsonb_build_array(jsonb_build_object(
      'key', 'count', 'label', 'Number of ' || regexp_replace(lower(coalesce(nullif(v_et.label, ''), v_et.table_name)), '([^s])$', '\1s'),
      'op', 'count', 'unit', 'count', 'additive', true)) || v_meas;
    v_lanes := jsonb_build_array('organization')
               || case when v_lcols ? 'mine' then '["mine"]'::jsonb else '[]'::jsonb end
               || '["platform"]'::jsonb;
    if v_et.title_column is not null and not v_detail ? v_et.title_column
       and v_cols ? v_et.title_column then
      v_detail := to_jsonb(v_et.title_column) || v_detail;
    end if;
    v_def := jsonb_build_object(
      'key', v_fact,
      'label', coalesce(nullif(v_et.label, ''), initcap(replace(v_et.table_name, '_', ' '))),
      'grain', 'one row per ' || lower(coalesce(nullif(v_et.label, ''), v_et.table_name)),
      'lanes', v_lanes,
      'dimensions', v_dims,
      'measures', v_meas,
      'paths', v_paths,
      'detail', jsonb_build_object('columns', (select coalesce(jsonb_agg(x), '[]') from (select x from jsonb_array_elements(v_detail) x limit 12) s)),
      'default', jsonb_strip_nulls(jsonb_build_object(
        'by', case when v_first_choice is not null then jsonb_build_array(v_first_choice)
                   when v_first_time is not null then jsonb_build_array(v_first_time || ':month')
                   else '[]'::jsonb end,
        'show', case when v_first_sum is not null then jsonb_build_array('count', v_first_sum) else '["count"]'::jsonb end,
        'sort', jsonb_build_object('key', 'count', 'direction', 'desc'),
        'path', v_first_time)),
      'inferred', (select coalesce(jsonb_agg(x -> 'key'), '[]') from jsonb_array_elements(v_dims || v_meas) x));
  end if;

  if v_decl is not null then
    -- ── DECLARED: an override of the inferred table, or a fact over several ─────────────
    if v_decl ->> 'key' <> v_fact then
      v_def := jsonb_build_object('key', v_decl ->> 'key', 'dimensions', '[]'::jsonb, 'measures', '[]'::jsonb,
                                  'paths', '[]'::jsonb, 'inferred', '[]'::jsonb);
      v_cols := '{}';
      v_lcols := coalesce(v_decl -> 'lane_columns', '{}');
    else
      v_lcols := v_lcols || coalesce(v_decl -> 'lane_columns', '{}');
    end if;
    for j in select x from jsonb_array_elements(coalesce(v_decl -> 'joins', '[]'::jsonb)) x loop
      v_from := j ->> 'from';
      v_a := case when position('.' in v_from) > 0 then split_part(v_from, '.', 1) else '' end;
      v_c := case when position('.' in v_from) > 0 then split_part(v_from, '.', 2) else v_from end;
      v_fk := platform._drill_fk(v_alias -> v_a ->> 'schema', v_alias -> v_a ->> 'table', v_c, j ->> 'token');
      v_joins := v_joins || jsonb_build_array(jsonb_build_object(
        'alias', 'j' || jsonb_array_length(v_joins), 'schema', v_fk ->> 'schema', 'table', v_fk ->> 'table',
        'on_alias', v_alias -> v_a ->> 'alias', 'on_column', v_c, 'to', v_fk ->> 'to'));
      v_alias := v_alias || jsonb_build_object(j ->> 'as', jsonb_build_object(
        'schema', v_fk ->> 'schema', 'table', v_fk ->> 'table', 'alias', 'j' || (jsonb_array_length(v_joins) - 1)));
    end loop;
    -- every column a declared dimension or measure reads, with its alias and type
    for v_from in
      select x ->> 'from' from jsonb_array_elements(coalesce(v_decl -> 'dimensions', '[]')) x
      union select x ->> 'of' from jsonb_array_elements(coalesce(v_decl -> 'measures', '[]')) x where x ? 'of'
      union select x ->> 'at_grain' from jsonb_array_elements(coalesce(v_decl -> 'measures', '[]')) x where x ? 'at_grain'
      union select x #>> '{}' from jsonb_array_elements(coalesce(v_decl -> 'detail' -> 'columns', '[]')) x
      union select x #>> '{}' from jsonb_each(coalesce(v_decl -> 'lane_columns', '{}')) e(k, x)
      union select e.x ->> 'column' from jsonb_each(coalesce(v_decl -> 'lane_rules', '{}')) e(k, x) where e.x ? 'column'
    loop
      continue when v_from is null or v_cols ? v_from;
      v_a := case when position('.' in v_from) > 0 then split_part(v_from, '.', 1) else '' end;
      v_c := case when position('.' in v_from) > 0 then split_part(v_from, '.', 2) else v_from end;
      continue when not v_alias ? v_a;
      v_col := platform._drill_column(v_alias -> v_a ->> 'schema', v_alias -> v_a ->> 'table', v_c);
      continue when v_col is null;
      if v_mode = 'invoker' and not has_column_privilege(custom.caller_role(),
           format('%I.%I', v_alias -> v_a ->> 'schema', v_alias -> v_a ->> 'table'), v_c, 'select') then
        raise exception 'This definition reads a column you cannot read (%), so it cannot be asked by you.', v_from
          using errcode = '42501';
      end if;
      v_fk := platform._drill_fk(v_alias -> v_a ->> 'schema', v_alias -> v_a ->> 'table', v_c, null);
      if v_fk is null and v_a <> '' and exists (
           select 1 from jsonb_array_elements(v_joins) jj
            where jj ->> 'alias' = v_alias -> v_a ->> 'alias' and jj ->> 'to' = v_c) then
        -- the join target's own key: the relation is that row itself
        select jsonb_build_object('schema', e.schema_name, 'table', e.table_name, 'to', v_c,
                                  'token', e.token, 'title', e.title_column)
          into v_fk from platform.entity_types e
         where e.schema_name = v_alias -> v_a ->> 'schema' and e.table_name = v_alias -> v_a ->> 'table';
      end if;
      v_cols := v_cols || jsonb_build_object(v_from, v_col || jsonb_build_object('alias', v_alias -> v_a ->> 'alias')
                                             || case when v_fk is not null then jsonb_build_object('fk', v_fk) else '{}'::jsonb end);
    end loop;
    v_hide := coalesce(v_decl -> 'hide', '[]');
    v_def := v_def || jsonb_strip_nulls(jsonb_build_object(
      'label', v_decl ->> 'label', 'grain', v_decl ->> 'grain', 'lanes', v_decl -> 'lanes',
      'detail', v_decl -> 'detail', 'default', v_decl -> 'default'));
    v_def := jsonb_set(v_def, '{dimensions}',
      (select coalesce(jsonb_agg(x order by o), '[]') from (
         select x, o from jsonb_array_elements(v_def -> 'dimensions') with ordinality e(x, o)
          where not exists (select 1 from jsonb_array_elements(coalesce(v_decl -> 'dimensions', '[]')) y where y ->> 'key' = x ->> 'key')
            and not v_hide ? (x ->> 'key')
         union all
         select x, 1000 + o from jsonb_array_elements(coalesce(v_decl -> 'dimensions', '[]')) with ordinality e(x, o)) s));
    v_def := jsonb_set(v_def, '{measures}',
      (select coalesce(jsonb_agg(x order by o), '[]') from (
         select x, o from jsonb_array_elements(v_def -> 'measures') with ordinality e(x, o)
          where not exists (select 1 from jsonb_array_elements(coalesce(v_decl -> 'measures', '[]')) y where y ->> 'key' = x ->> 'key')
            and not v_hide ? (x ->> 'key')
         union all
         select x, 1000 + o from jsonb_array_elements(coalesce(v_decl -> 'measures', '[]')) with ordinality e(x, o)) s));
    if v_decl ? 'paths' then
      v_def := jsonb_set(v_def, '{paths}', v_decl -> 'paths');
    end if;
  end if;

  return v_def || jsonb_build_object(
    'source', jsonb_build_object('kind', 'entity', 'token', coalesce(v_decl ->> 'key', v_fact)),
    'mode', v_mode,
    '_c', jsonb_build_object(
      'fact', jsonb_build_object('schema', v_et.schema_name, 'table', v_et.table_name, 'token', v_et.token,
                                 'pk', to_jsonb(v_pk), 'title', v_et.title_column, 'rls', v_rls,
                                 'deleted', (platform._drill_column(v_et.schema_name, v_et.table_name, 'deleted_at') is not null)),
      'joins', v_joins,
      'cols', v_cols,
      'lane_cols', v_lcols,
      'lane_rules', coalesce(v_decl -> 'lane_rules', '{}')))
    || case when cardinality(v_nostats) > 0 then jsonb_build_object('says', jsonb_build_array(format(
         '%s text column%s (%s) %s no statistics yet, so %s not offered as a dimension; the next routine analysis of the table decides.',
         cardinality(v_nostats), case when cardinality(v_nostats) = 1 then '' else 's' end, array_to_string(v_nostats, ', '),
         case when cardinality(v_nostats) = 1 then 'has' else 'have' end,
         case when cardinality(v_nostats) = 1 then 'it is' else 'they are' end))) else '{}'::jsonb end;
end
$function$
;

CREATE OR REPLACE FUNCTION platform._drill_plan(p_organization_id uuid, p_source jsonb, p_question jsonb, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_steps constant jsonb := '{"day":"1 day","week":"7 days","month":"1 month","quarter":"3 months","year":"1 year"}';
  q       jsonb := coalesce(p_question, '{}'::jsonb);
  v_def   jsonb;
  v_plan  jsonb;
  v_kind  text := p_source ->> 'kind';
  v_d2    boolean := to_regprocedure('custom.table_dimensions(uuid,uuid)') is not null;
  v_gb    jsonb := '[]';
  v_bk    jsonb;
  v_meas  jsonb := '[]';
  v_filt  jsonb := '{}';
  v_cmp   jsonb;
  e       jsonb;
  k       text;
  v_x     text;
  v_tz    text;
begin
  if p_kind not in ('describe', 'ask', 'rows') then
    raise exception '"%" is not something the drill doors do.', p_kind using errcode = '22023';
  end if;
  perform custom.assert_client_may_reach(p_organization_id, 'platform.drill_' || p_kind);
  if p_source is null or jsonb_typeof(p_source) <> 'object' or v_kind not in ('table', 'entity') then
    raise exception 'A source is {"kind": "table", "id": <a custom Table>} or {"kind": "entity", "token": <a standard table or a declared definition>}.'
      using errcode = '22023';
  end if;

  if v_kind = 'entity' then
    v_def := platform._drill_resolve(p_organization_id, p_source ->> 'token');
    if p_kind = 'describe' then
      return jsonb_build_object('def', v_def - '_c');
    end if;
    if v_def ->> 'mode' = 'definer' and p_kind = 'ask' then
      -- the answer is computed by platform._drill_run_declared, which re-resolves by key
      return jsonb_build_object('def', v_def - '_c', 'mode', 'definer');
    end if;
    return platform._drill_compile(p_organization_id, v_def, q, p_kind)
           || jsonb_build_object('def', v_def - '_c', 'mode', v_def ->> 'mode');
  end if;

  -- ── A CUSTOM TABLE: the question, as custom.record_aggregate's arguments ─────────────────
  if (p_source ->> 'id') !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'A custom Table is named by its id.' using errcode = '22023';
  end if;
  if p_kind = 'describe' then
    return jsonb_build_object('d2', v_d2);
  end if;
  for k in select jsonb_object_keys(q) loop
    if not (k = any (array['by','show','where','window','compare','sort','limit','offset','lane','across','columns','path'])) then
      raise exception '"%" is not part of a question.', k using errcode = '22023';
    end if;
  end loop;
  if coalesce(q ->> 'lane', 'organization') <> 'organization' then
    raise exception 'A custom Table is counted in its organization''s lane; the other lanes come with lane DRILL-CUSTOM-PARITY.' using errcode = '0A000';
  end if;
  if q ? 'across' and jsonb_typeof(q -> 'across') <> 'null' then
    raise exception 'A custom Table does not pivot yet; that comes with lane DRILL-CUSTOM-PARITY.' using errcode = '0A000',
      hint = 'Group by both dimensions instead.';
  end if;
  v_tz := custom.agg_calendar(p_organization_id) ->> 'time_zone';

  -- where (+ a clicked period) + window -> the store's own flat filter
  for k, e in select key, value from jsonb_each(coalesce(q -> 'where', '{}'::jsonb)) loop
    if jsonb_typeof(e) = 'array' then
      raise exception 'A custom Table''s filter takes one value per column; a list comes with lane DRILL-CUSTOM-PARITY.' using errcode = '0A000';
    end if;
    if position(':' in k) > 0 then
      v_x := split_part(k, ':', 2);
      if not (c_steps ? v_x) or jsonb_typeof(e) <> 'string' then
        raise exception '"%" is a period filter: a date column, a grain, and the period''s label.', k using errcode = '22023';
      end if;
      e := jsonb_build_object('from', (e #>> '{}')::timestamptz,
                              'to', (((e #>> '{}')::timestamptz at time zone v_tz) + (c_steps ->> v_x)::interval) at time zone v_tz);
      k := split_part(k, ':', 1);
    end if;
    v_filt := v_filt || jsonb_build_object(k, e);
  end loop;
  if jsonb_typeof(q -> 'window') = 'object' and (q -> 'window') ? 'key' then
    e := q -> 'window';
    if e ? 'preset' then
      v_x := e ->> 'preset';
      if v_x !~ '^[0-9]{1,4}(h|d)$' then
        raise exception '"%" is not a window: 24h, 7d, 30d, 90d or 365d.', v_x using errcode = '22023';
      end if;
      e := jsonb_build_object('from', now() - (left(v_x, -1) || case right(v_x, 1) when 'h' then ' hours' else ' days' end)::interval, 'to', now());
    end if;
    v_filt := v_filt || jsonb_build_object(q -> 'window' ->> 'key', jsonb_strip_nulls(jsonb_build_object('from', e -> 'from', 'to', e -> 'to')));
  end if;

  -- by -> groups + at most one period
  for e in select x from jsonb_array_elements(coalesce(q -> 'by', '[]'::jsonb)) x loop
    k := e #>> '{}';
    if position(':' in k) > 0 then
      if v_bk is not null then
        raise exception 'A custom Table is cut by one period at a time.' using errcode = '0A000';
      end if;
      v_bk := jsonb_build_object('key', split_part(k, ':', 1), 'by', split_part(k, ':', 2));
    else
      v_gb := v_gb || to_jsonb(k);
    end if;
  end loop;

  -- show -> the store's measures ({op, key}); a named Measure passes once D2 reads names
  for e in select x from jsonb_array_elements(coalesce(q -> 'show', '["count"]'::jsonb)) x loop
    if jsonb_typeof(e) = 'object' then
      v_meas := v_meas || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'op', case e ->> 'op' when 'count_distinct' then 'unique' else e ->> 'op' end,
        'key', coalesce(e ->> 'of', e ->> 'key'))));
    elsif e #>> '{}' = 'count' then
      v_meas := v_meas || '[{"op":"count"}]'::jsonb;
    elsif (e #>> '{}') ~ '^(sum|avg|min|max|median|filled|empty|unique)_[a-zA-Z_][a-zA-Z0-9_]*$' then
      v_meas := v_meas || jsonb_build_array(jsonb_build_object(
        'op', split_part(e #>> '{}', '_', 1), 'key', substr(e #>> '{}', length(split_part(e #>> '{}', '_', 1)) + 2)));
    elsif v_d2 then
      v_meas := v_meas || jsonb_build_array(e);
    else
      raise exception 'There is no measure "%" on this table yet.', e #>> '{}' using errcode = '22023',
        hint = 'Name it as op_field (sum_amount), or count.';
    end if;
  end loop;

  if q ? 'compare' and jsonb_typeof(q -> 'compare') <> 'null' then
    v_cmp := case when jsonb_typeof(q -> 'compare') = 'string' then jsonb_build_object('against', q ->> 'compare') else q -> 'compare' end;
    if v_cmp ->> 'against' in ('prev', 'previous') then v_cmp := v_cmp || '{"against":"previous_period"}'; end if;
    if v_cmp ->> 'against' = 'yoy' then v_cmp := v_cmp || '{"against":"same_period_last_year"}'; end if;
    if not v_cmp ? 'key' and q -> 'window' ? 'key' then
      v_cmp := v_cmp || jsonb_build_object('key', q -> 'window' ->> 'key');
    end if;
  end if;

  if q ? 'sort' and not (q -> 'sort' ->> 'key' = 'count'
                         or (q -> 'sort' ->> 'key') = any (select x #>> '{}' from jsonb_array_elements(coalesce(q -> 'by', '[]')) x)) then
    raise exception 'A custom Table ranks its groups by their count until lane DRILL-CUSTOM-PARITY; sort by count or by a grouped column.'
      using errcode = '0A000';
  end if;

  return jsonb_build_object('delegate', jsonb_strip_nulls(jsonb_build_object(
    'group_by', v_gb, 'measures', v_meas, 'bucket', v_bk, 'filter', v_filt,
    'limit', coalesce((q ->> 'limit')::integer, 200), 'compare', v_cmp)),
    'sort', q -> 'sort', 'by', coalesce(q -> 'by', '[]'), 'lane', 'organization',
    'columns', q -> 'columns', 'offset', coalesce((q ->> 'offset')::integer, 0));
end
$function$
;
