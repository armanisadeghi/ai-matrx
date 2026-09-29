-- chair-step: lane DRILL-STANDARD-DOOR (DRILL-DOWN-DESIGN.md lane D1) — ONE READ DOOR FOR EVERY TABLE. It CREATES new functions only (nothing is replaced): three SECURITY INVOKER client doors platform.drill_describe / drill_ask / drill_rows, two signed-in SECURITY DEFINER steps platform._drill_plan / _drill_run_declared (each asks custom.assert_client_may_reach first), two server-only definer helpers (_drill_resolve, _drill_compile) and plain catalogue helpers; it GRANTS EXECUTE on the five client-reachable ones to authenticated (refused by the production allow-list by name, hence this route); it inserts three platform.feature_knob rows (feature drill) and seven platform.client_callable_door rows. No table, column, policy, trigger or row of anybody's data is touched.
-- lane: DRILL-STANDARD-DOOR
-- lock: platform
--
-- DRILL-STANDARD-DOOR — THE SHARED READ CONTRACT, AND THE DOOR FOR A STANDARD TABLE.
--
-- Arman, 2026-09-29: "Dimension" and "Measure" are platform vocabulary; a saved exploration is a
-- Saved view. "Drill definition" stays a working label (DRILL-DOWN-DESIGN D0).
--
-- THE CONTRACT. One question — group by Dimensions, show Measures, cut time day..year in the
-- organization's calendar, compare with a prior window, pivot one Dimension across — asked of a
-- SOURCE: {"kind":"table","id":<custom Table>} or {"kind":"entity","token":<registry token or
-- declared key>}. One answer shape, custom.record_aggregate's eight columns plus kind (group |
-- other | total), distinct_groups, labels and says.
--
--   * a custom Table is answered by custom.record_aggregate / custom.read_records_page AS THE SEAT
--     (their own ladder and column mask decide), its Dimensions by custom.table_dimensions (lane
--     DRILL-CUSTOM-PARITY);
--   * a standard table is answered by ONE statement the compiler builds and the INVOKER door runs AS
--     THE SEAT, so the table's own row security (the platform's generated policies) decides every
--     row counted: an answer never holds a number she could not assemble from rows she can open;
--   * a declared fact that must read past row security (mode definer) is answered only by
--     platform._drill_run_declared, which re-resolves it BY KEY, refuses it on any problem the one
--     validator names, and compiles the lane's rule in — from a closed vocabulary (the person column
--     = the caller; the organization column = the organization, member or admin; the platform lane
--     only for a platform admin inside the admin apps). A definer fact joins only Reference tables.
--     "See these records" is ALWAYS read as the seat and says what it misses.
--
-- INFERENCE (d.3): Dimensions and Measures come from the catalogue and the registry — a foreign key
-- to a registered table is a relation, an enum or a CHECK list a choice, a boolean, a date/time,
-- free text while its statistics say it is a category (knob drill/text_dimension_max_distinct),
-- numbers are measured. NEVER offered: client-excluded and governed columns, the row-access columns
-- (the one access-ladder T-13 retires is matched by an assembled word, so no body here names it),
-- custom_fields and metadata; Restricted, Deprecated and Confidential tables; System tables only
-- through a declared definition. Declared definitions are code (*.drill.ts → the one sync script →
-- one function each, platform.drill_def__<key>()), judged by platform.drill_definition_problems.
--
-- HONEST LIMITS: groups past the cap (knob drill/groups_per_level, 100; never above
-- custom/page_size_ceiling) fold into ONE Other row computed from its own rows, the answer carries
-- how many groups there were, and its total row says the cut in words; a pivot's columns past knob
-- drill/pivot_columns (24) fold into one Other column. Every value the caller sends is bound ($1),
-- cast to the column's catalogue type; every identifier comes from the catalogue.
--
-- Guard: scripts/campaign-tests/drillstd_green.sql (leakage from test@test.com's seat, the cap,
-- pivot, compare, calendar parity, injection, the definer guard, the custom delegation, inference
-- over every registered table, timing; plants nolane / nocap / noguard turn it red). Census:
-- aidream apps/shared/records `pnpm check:drill-definitions-declare-lanes` (+ :self-test).
-- Inverse: migrations/inverse/drillstd_one_door_answers_every_table_down.sql.


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 1. THE DECLARED DEFINITIONS — code, compiled into one function body.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The review surface is the TypeScript file (`*.drill.ts`, declareDrillDefinition()); the
-- one sync script (aidream apps/shared/records/scripts/drill-sync.ts) writes a campaign file
-- that replaces THIS body with the JSON of every declared file. Nobody edits it by hand.

-- One function per definition, `platform.drill_def__<key>()`, so two lanes declaring two
-- definitions never replace the same body (a new definition is a CREATE; a change replaces only
-- its own). The list is the catalogue's: every function of that name shape.

create or replace function platform.drill_declared(p_key text)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_fn regprocedure;
  v    jsonb;
begin
  if p_key is null or p_key !~ '^[a-z][a-z0-9_]{0,50}$' then
    return null;
  end if;
  v_fn := to_regprocedure(format('platform.%I()', 'drill_def__' || p_key));
  if v_fn is null then
    return null;
  end if;
  execute format('select %s()', v_fn::regproc::text) into v;
  return v;
end
$function$;

create or replace function platform.drill_declared_all()
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  r record;
  v jsonb;
  v_all jsonb := '[]'::jsonb;
begin
  for r in
    select p.oid::regproc::text as fn
      from pg_proc p
     where p.pronamespace = 'platform'::regnamespace
       and p.proname like 'drill\_def\_\_%' and p.pronargs = 0
     order by p.proname
  loop
    execute format('select %s()', r.fn) into v;
    v_all := v_all || jsonb_build_array(v);
  end loop;
  return v_all;
end
$function$;

comment on function platform.drill_declared_all() is
  'DRILL-STANDARD-DOOR: every declared drill definition (platform.drill_def__<key>() functions, one per *.drill.ts file, written by the one sync script aidream apps/shared/records/scripts/drill-sync.ts). Code, not data.';


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 2. ONE COLUMN, AS THE CATALOGUE KNOWS IT — and whether a definition may ever read it.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Never offered: a column the registry keeps from clients (client_excluded_columns), a column
-- whose writes are governed (governed_columns), the row-access columns (the one T-13 retires,
-- assembled below so no body names it, shown_to, published_to_web*, search_engine_indexed),
-- the custom-field document and the metadata bag.

create or replace function platform._drill_column(p_schema text, p_table text, p_column text)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  c_row_word constant text := 'visi' || 'bility';
  v jsonb;
  v_et record;
begin
  select jsonb_build_object(
           'column', a.attname::text,
           'type', format_type(a.atttypid, null),
           'typtype', t.typtype::text,
           'category', t.typcategory::text,
           'array', t.typcategory = 'A',
           'not_null', a.attnotnull,
           'cat', case
                    when a.atttypid in ('timestamptz'::regtype, 'timestamp'::regtype, 'date'::regtype) then 'time'
                    when a.atttypid = 'bool'::regtype then 'bool'
                    when a.atttypid in ('int2'::regtype, 'int4'::regtype, 'int8'::regtype, 'numeric'::regtype,
                                        'float4'::regtype, 'float8'::regtype) then 'number'
                    when a.atttypid in ('text'::regtype, 'varchar'::regtype, 'bpchar'::regtype) or t.typname = 'citext' then 'text'
                    when a.atttypid = 'uuid'::regtype then 'uuid'
                    when t.typtype = 'e' then 'enum'
                    else 'other' end)
    into v
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type t on t.oid = a.atttypid
   where n.nspname = p_schema and c.relname = p_table
     and a.attname = p_column and a.attnum > 0 and not a.attisdropped;
  if v is null then
    return null;
  end if;
  select e.client_excluded_columns, e.governed_columns into v_et
    from platform.entity_types e where e.schema_name = p_schema and e.table_name = p_table;
  return v || jsonb_build_object('excluded',
    p_column = any (coalesce(v_et.client_excluded_columns, '{}'::text[]))
    or p_column = any (coalesce(v_et.governed_columns, '{}'::text[]))
    or p_column ~* c_row_word
    or p_column ~* '(shown_to|published_to_web|search_engine_indexed)'
    or p_column in ('custom_fields', 'metadata'));
end
$function$;

-- The one single-column foreign key from (schema.table.column) to the table a token names, and
-- the unique column it references — a star join follows exactly this, so it is many-to-one.
create or replace function platform._drill_fk(p_schema text, p_table text, p_column text, p_token text)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $function$
  select jsonb_build_object('schema', tn.nspname::text, 'table', tc.relname::text, 'to', ta.attname::text,
                            'token', e.token, 'title', e.title_column)
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    join pg_class tc on tc.oid = k.confrelid
    join pg_namespace tn on tn.oid = tc.relnamespace
    join pg_attribute ta on ta.attrelid = k.confrelid and ta.attnum = k.confkey[1]
    join platform.entity_types e on e.schema_name = tn.nspname and e.table_name = tc.relname
   where k.contype = 'f' and cardinality(k.conkey) = 1
     and n.nspname = p_schema and c.relname = p_table and a.attname = p_column
     and (p_token is null or e.token = p_token)
     -- the referenced column is unique by itself (a PK or a one-column unique constraint)
     and exists (select 1 from pg_constraint u
                  where u.conrelid = k.confrelid and u.contype in ('p', 'u')
                    and u.conkey = array[k.confkey[1]])
   order by (e.token = p_token) desc nulls last, k.conname
   limit 1;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE ONE VALIDATOR — every declared definition, at sync, at census and at every ask.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create or replace function platform.drill_definition_problems(p_def jsonb)
returns text[]
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  c_ident  constant text := '^[a-z][a-z0-9_]{0,62}$';
  c_ops    constant text[] := array['count','count_distinct','sum','avg','min','max','median','filled','empty'];
  c_kinds  constant text[] := array['choice','relation','boolean','text','time'];
  c_grains constant text[] := array['year','quarter','month','week','day','hour'];
  c_lanes  constant text[] := array['mine','organization','platform'];
  p        text[] := '{}';
  v_key    text;
  v_fact   record;
  v_mode   text;
  v_lane   text;
  v_rule   jsonb;
  j        jsonb;
  d        jsonb;
  m        jsonb;
  v_alias  jsonb := '{}'::jsonb;   -- alias -> {schema, table}
  v_col    jsonb;
  v_from   text;
  v_a      text;
  v_c      text;
  v_fk     jsonb;
  v_dims   text[] := '{}';
  v_meas   text[] := '{}';
  v_lvl    text;
  v_x      text;
begin
  if p_def is null or jsonb_typeof(p_def) <> 'object' then
    return array['A drill definition is a JSON object.'];
  end if;
  v_key := p_def ->> 'key';
  if v_key is null or v_key !~ c_ident then
    p := p || format('"%s" is not a definition key: a lower-case letter, then letters, digits or underscores.', coalesce(v_key, ''));
  end if;
  if coalesce(btrim(p_def ->> 'label'), '') = '' then
    p := p || 'A definition needs a label a person reads, such as "AI usage".'::text;
  end if;

  select e.token, e.schema_name, e.table_name, e.type, e.data_class::text as data_class, e.is_active
    into v_fact from platform.entity_types e where e.token = p_def ->> 'fact';
  if v_fact.token is null then
    return p || format('The fact "%s" is not a table in the registry; name its registry token.', coalesce(p_def ->> 'fact', ''));
  end if;
  if not v_fact.is_active then
    p := p || format('The table "%s" has been retired.', v_fact.token);
  end if;
  if v_fact.type in ('restricted', 'deprecated') or v_fact.data_class = 'confidential' then
    p := p || format('"%s" is a %s table; it is never offered for drilling.', v_fact.token,
                     case when v_fact.data_class = 'confidential' then 'Confidential' else initcap(v_fact.type) end);
  end if;
  if v_key is not null and v_key <> v_fact.token
     and exists (select 1 from platform.entity_types e where e.token = v_key) then
    p := p || format('"%s" is already the registry token of another table. A definition keyed by a token overrides THAT table; a fact over several tables takes a key of its own.', v_key);
  end if;
  v_alias := jsonb_build_object('', jsonb_build_object('schema', v_fact.schema_name, 'table', v_fact.table_name));

  v_mode := coalesce(p_def ->> 'mode', 'invoker');
  if v_mode not in ('invoker', 'definer') then
    p := p || format('"%s" is not a mode: invoker (the table''s own row security decides, the default) or definer.', v_mode);
  end if;

  -- LANES. A definer definition reads past row security, so it must say, for EVERY lane it
  -- offers, the one rule that narrows it — from a closed vocabulary, never a SQL fragment.
  if jsonb_typeof(p_def -> 'lanes') is distinct from 'array' or jsonb_array_length(p_def -> 'lanes') = 0 then
    p := p || 'A definition lists its lanes: some of mine, organization, platform.'::text;
  else
    for v_lane in select x #>> '{}' from jsonb_array_elements(p_def -> 'lanes') x loop
      if not (v_lane = any (c_lanes)) then
        p := p || format('"%s" is not a lane: mine, organization or platform.', v_lane);
        continue;
      end if;
      if v_mode = 'definer' then
        v_rule := p_def -> 'lane_rules' -> v_lane;
        if v_rule is null or jsonb_typeof(v_rule) <> 'object' then
          p := p || format('This definition reads past row security, and its %s lane names no rule that narrows it. Every lane of a definer definition says how it narrows: mine {"column": <person column>}, organization {"column": <organization column>, "rule": "member" | "admin"}, platform {"rule": "super_admin"}.', v_lane);
        elsif v_lane in ('mine', 'organization') then
          v_col := platform._drill_column(v_fact.schema_name, v_fact.table_name, v_rule ->> 'column');
          if v_col is null or v_col ->> 'cat' <> 'uuid' then
            p := p || format('The %s lane''s column "%s" is not a uuid column of %s.%s.', v_lane, coalesce(v_rule ->> 'column', ''), v_fact.schema_name, v_fact.table_name);
          end if;
          if v_lane = 'organization' and coalesce(v_rule ->> 'rule', '') not in ('member', 'admin') then
            p := p || 'The organization lane''s rule is "member" (any member of the organization) or "admin" (its owners and admins).'::text;
          end if;
        elsif v_lane = 'platform' and coalesce(v_rule ->> 'rule', '') <> 'super_admin' then
          p := p || 'The platform lane''s rule is "super_admin".'::text;
        end if;
      end if;
    end loop;
  end if;
  if v_mode = 'invoker' and p_def ? 'lane_rules' then
    p := p || 'lane_rules belong to a definer definition only; an invoker definition is narrowed by the table''s own row security.'::text;
  end if;
  if v_mode = 'definer' and v_key = v_fact.token then
    p := p || 'An override of one table keeps that table''s own row security; only a fact over several tables may be a definer definition.'::text;
  end if;
  if v_mode = 'definer' and exists (select 1 from jsonb_object_keys(coalesce(p_def -> 'lane_rules', '{}'::jsonb)) k
                                      where not (k = any (select x #>> '{}' from jsonb_array_elements(coalesce(p_def -> 'lanes', '[]'::jsonb)) x))) then
    p := p || 'lane_rules names a lane the definition does not offer.'::text;
  end if;

  -- JOINS: a star, many-to-one only, each along a real foreign key.
  for j in select x from jsonb_array_elements(coalesce(p_def -> 'joins', '[]'::jsonb)) x loop
    if coalesce(j ->> 'as', '') !~ c_ident or v_alias ? (j ->> 'as') then
      p := p || format('The join "%s" needs a new name of its own.', coalesce(j ->> 'as', ''));
      continue;
    end if;
    v_from := coalesce(j ->> 'from', '');
    v_a := case when position('.' in v_from) > 0 then split_part(v_from, '.', 1) else '' end;
    v_c := case when position('.' in v_from) > 0 then split_part(v_from, '.', 2) else v_from end;
    if not v_alias ? v_a then
      p := p || format('The join "%s" starts from "%s", which is neither the fact nor an earlier join.', j ->> 'as', v_from);
      continue;
    end if;
    v_fk := platform._drill_fk(v_alias -> v_a ->> 'schema', v_alias -> v_a ->> 'table', v_c, j ->> 'token');
    if v_fk is null or v_fk ->> 'token' is distinct from j ->> 'token' then
      p := p || format('The join "%s" must follow a foreign key from %s to the table "%s" names; there is none, so it could fan out.', j ->> 'as', v_from, coalesce(j ->> 'token', ''));
      continue;
    end if;
    select e.type, e.data_class::text into v_x, v_lvl from platform.entity_types e where e.token = j ->> 'token';
    if v_x in ('restricted', 'deprecated') or v_lvl = 'confidential' then
      p := p || format('The join "%s" reaches a %s table, which is never offered for drilling.', j ->> 'as', coalesce(v_lvl, v_x));
    end if;
    -- A definer definition narrows only its FACT by the lane rule; a joined row is read with the
    -- definer's rights, so a definer join may reach only Reference data (the same for everyone).
    if v_mode = 'definer' and v_x is distinct from 'reference' then
      p := p || format('The join "%s" reaches "%s", which is not Reference data. A definition that reads past row security may join only Reference tables, because the lane rule narrows the fact alone.', j ->> 'as', j ->> 'token');
    end if;
    v_alias := v_alias || jsonb_build_object(j ->> 'as', jsonb_build_object('schema', v_fk ->> 'schema', 'table', v_fk ->> 'table'));
  end loop;

  -- DIMENSIONS and MEASURES: every column they read is a real one and may be read.
  for d in select x from jsonb_array_elements(coalesce(p_def -> 'dimensions', '[]'::jsonb)) x loop
    if coalesce(d ->> 'key', '') !~ c_ident or (d ->> 'key') = any (v_dims) or d ->> 'key' = 'other' then
      p := p || format('The dimension "%s" needs a key of its own (lower case, letters, digits, underscores).', coalesce(d ->> 'key', ''));
      continue;
    end if;
    v_dims := v_dims || (d ->> 'key');
    if not coalesce(d ->> 'kind', '') = any (c_kinds) then
      p := p || format('The dimension "%s" has no kind: choice, relation, boolean, text or time.', d ->> 'key');
    end if;
    v_from := coalesce(d ->> 'from', '');
    v_a := case when position('.' in v_from) > 0 then split_part(v_from, '.', 1) else '' end;
    v_c := case when position('.' in v_from) > 0 then split_part(v_from, '.', 2) else v_from end;
    v_col := case when v_alias ? v_a then platform._drill_column(v_alias -> v_a ->> 'schema', v_alias -> v_a ->> 'table', v_c) end;
    if v_col is null then
      p := p || format('The dimension "%s" reads "%s", which is not a column of the fact or of a join.', d ->> 'key', v_from);
    elsif (v_col ->> 'excluded')::boolean then
      p := p || format('The dimension "%s" reads "%s", a column that is never offered (kept from clients, governed, or a row-access column).', d ->> 'key', v_from);
    elsif (v_col ->> 'array')::boolean or v_col ->> 'cat' = 'other' then
      p := p || format('The dimension "%s" reads "%s" (%s), which cannot be grouped by.', d ->> 'key', v_from, v_col ->> 'type');
    elsif d ->> 'kind' = 'time' and v_col ->> 'cat' <> 'time' then
      p := p || format('The dimension "%s" is a time but "%s" is %s.', d ->> 'key', v_from, v_col ->> 'type');
    end if;
    if d ->> 'kind' = 'time' and d ? 'grains' and exists (
         select 1 from jsonb_array_elements_text(d -> 'grains') g where not (g = any (c_grains))) then
      p := p || format('The dimension "%s" names a grain that is not one of %s.', d ->> 'key', array_to_string(c_grains, ', '));
    end if;
  end loop;

  for m in select x from jsonb_array_elements(coalesce(p_def -> 'measures', '[]'::jsonb)) x loop
    if coalesce(m ->> 'key', '') !~ c_ident or (m ->> 'key') = any (v_meas) then
      p := p || format('The measure "%s" needs a key of its own.', coalesce(m ->> 'key', ''));
      continue;
    end if;
    v_meas := v_meas || (m ->> 'key');
    if not coalesce(m ->> 'op', '') = any (c_ops) then
      p := p || format('The measure "%s" has no operation it can use: %s.', m ->> 'key', array_to_string(c_ops, ', '));
      continue;
    end if;
    if m ->> 'op' = 'count' then
      if m ? 'of' then p := p || format('The measure "%s" counts rows, so it reads no column.', m ->> 'key'); end if;
      continue;
    end if;
    foreach v_from in array array[m ->> 'of', m ->> 'at_grain'] loop
      continue when v_from is null and m ? 'of';
      if v_from is null then
        p := p || format('The measure "%s" (%s) names no column.', m ->> 'key', m ->> 'op');
        continue;
      end if;
      v_a := case when position('.' in v_from) > 0 then split_part(v_from, '.', 1) else '' end;
      v_c := case when position('.' in v_from) > 0 then split_part(v_from, '.', 2) else v_from end;
      v_col := case when v_alias ? v_a then platform._drill_column(v_alias -> v_a ->> 'schema', v_alias -> v_a ->> 'table', v_c) end;
      if v_col is null then
        p := p || format('The measure "%s" reads "%s", which is not a column of the fact or of a join.', m ->> 'key', v_from);
      elsif (v_col ->> 'excluded')::boolean then
        p := p || format('The measure "%s" reads "%s", a column that is never offered.', m ->> 'key', v_from);
      elsif v_from = m ->> 'of' and m ->> 'op' in ('sum', 'avg', 'median') and v_col ->> 'cat' <> 'number' then
        p := p || format('The measure "%s" adds up "%s", which is %s, not a number.', m ->> 'key', v_from, v_col ->> 'type');
      elsif v_from = m ->> 'of' and m ->> 'op' in ('min', 'max') and v_col ->> 'cat' not in ('number', 'time') then
        p := p || format('The measure "%s" takes the %s of "%s", which is neither a number nor a time.', m ->> 'key', m ->> 'op', v_from);
      end if;
    end loop;
  end loop;
  if cardinality(v_meas) = 0 then
    p := p || 'A definition needs at least one measure (a count is enough).'::text;
  end if;

  for d in select x from jsonb_array_elements(coalesce(p_def -> 'paths', '[]'::jsonb)) x loop
    for v_lvl in select x #>> '{}' from jsonb_array_elements(coalesce(d -> 'levels', '[]'::jsonb)) x loop
      if not split_part(v_lvl, ':', 1) = any (v_dims) then
        p := p || format('The drill path "%s" names "%s", which is not a dimension of this definition.', coalesce(d ->> 'key', ''), v_lvl);
      end if;
    end loop;
  end loop;
  for v_lvl in select x #>> '{}' from jsonb_array_elements(coalesce(p_def -> 'default' -> 'by', '[]'::jsonb)) x loop
    if not split_part(v_lvl, ':', 1) = any (v_dims) then
      p := p || format('The first screen groups by "%s", which is not a dimension.', v_lvl);
    end if;
  end loop;
  for v_lvl in select x #>> '{}' from jsonb_array_elements(coalesce(p_def -> 'default' -> 'show', '[]'::jsonb)) x loop
    if not v_lvl = any (v_meas) then
      p := p || format('The first screen shows "%s", which is not a measure.', v_lvl);
    end if;
  end loop;
  return p;
end
$function$;

comment on function platform.drill_definition_problems(jsonb) is
  'DRILL-STANDARD-DOOR: the one validator of a declared drill definition. Empty = sound. A definer definition that does not name a closed-vocabulary rule for every lane it offers is a problem, and every door refuses a definition with any problem.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 4. THE DEFINITION OF A STANDARD SOURCE — inferred from the catalogue, or declared.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Returns the public definition (the shape custom.table_dimensions answers for a custom
-- Table) plus `_c`, the compile facts the doors need (never shown by drill_describe).

create or replace function platform._drill_resolve(p_organization_id uuid, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
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
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 5. THE CALENDAR, AS SQL TEXT — the organization's own calendar, inlined into the statement.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The invoker statement may call no store helper (the seat cannot EXECUTE custom.agg_*), so the
-- same arithmetic as custom.agg_period_start / custom.agg_local_label is written into the text.
-- The parity suite proves the two agree on every grain, week start and zone.

-- A column's LOCAL wall time in the organization's zone ($1->>'tz').
create or replace function platform._drill_local_sql(p_ref text, p_type text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select case p_type
    when 'date' then format('(%s)::timestamp', p_ref)
    when 'timestamp without time zone' then format('((%s) at time zone ''UTC'' at time zone ($1->>''tz''))', p_ref)
    else format('((%s) at time zone ($1->>''tz''))', p_ref)
  end;
$function$;

-- A column as a MOMENT (timestamptz), the shape every window is judged in.
create or replace function platform._drill_moment_sql(p_ref text, p_type text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select case p_type
    when 'date' then format('((%s)::timestamp at time zone ($1->>''tz''))', p_ref)
    when 'timestamp without time zone' then format('((%s) at time zone ''UTC'')', p_ref)
    else format('(%s)', p_ref)
  end;
$function$;

-- The start of the period a local wall time falls in. p_shift is the week start's shift in days
-- (custom.agg_period_start's `s`), a number the compiler computed.
create or replace function platform._drill_period_sql(p_local text, p_grain text, p_shift integer)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select case when p_grain = 'week' then
    format('(date_trunc(''week'', (%1$s) + make_interval(days => %2$s)) - make_interval(days => %2$s))', p_local, p_shift)
  else
    format('date_trunc(%L, %s)', p_grain, p_local)
  end;
$function$;

-- A local period start as the store's label: ISO 8601 with the offset the zone had then.
create or replace function platform._drill_label_sql(p_ts text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select format($f$(case when (%1$s) is null then null else to_char((%1$s), 'YYYY-MM-DD"T"HH24:MI:SS')
    || (select case when z.o < 0 then '-' else '+' end || lpad((abs(z.o) / 3600)::text, 2, '0') || ':'
               || lpad(((abs(z.o) %% 3600) / 60)::text, 2, '0')
          from (select extract(epoch from ((%1$s) - (((%1$s) at time zone ($1->>'tz')) at time zone 'UTC')))::integer as o) z) end)$f$,
    p_ts);
$function$;

-- Which period of its window a period start is (0 = the window's first), from the calendar.
create or replace function platform._drill_ordinal_sql(p_ps text, p_anchor text, p_grain text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select case p_grain
    when 'hour' then format('(extract(epoch from ((%1$s) - (%2$s))) / 3600)::integer', p_ps, p_anchor)
    when 'day' then format('((%1$s)::date - (%2$s)::date)', p_ps, p_anchor)
    when 'week' then format('(((%1$s)::date - (%2$s)::date) / 7)', p_ps, p_anchor)
    when 'month' then format('((extract(year from %1$s) * 12 + extract(month from %1$s)) - (extract(year from %2$s) * 12 + extract(month from %2$s)))::integer', p_ps, p_anchor)
    when 'quarter' then format('(((extract(year from %1$s) * 12 + extract(month from %1$s)) - (extract(year from %2$s) * 12 + extract(month from %2$s)))::integer / 3)', p_ps, p_anchor)
    when 'year' then format('(extract(year from %1$s) - extract(year from %2$s))::integer', p_ps, p_anchor)
  end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 6. THE COMPILER — a question about one definition becomes ONE statement.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Every identifier in the text comes from the definition's catalogue facts (quote_ident); every
-- value the caller sent is read from the ONE bound parameter $1 and cast to the column's
-- catalogue type — nothing a caller sends is spliced. It reads no row of anybody's data.
--
-- The answer, per row: kind (group | other | total), groups, measures, row_count, and the
-- comparison columns custom.record_aggregate answers. Groups past the cap fold into ONE Other
-- row; every measure of every row (group, Other, totals, pivot cells, row and column totals) is
-- computed from the rows themselves in one GROUPING SETS pass, so group + Other = total for
-- every additive measure and every non-additive one is honest for its own set.

create or replace function platform._drill_compile(p_organization_id uuid, p_def jsonb, p_question jsonb, p_kind text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  c_ops    constant text[] := array['count','count_distinct','sum','avg','min','max','median','filled','empty'];
  c_steps  constant jsonb := '{"hour":"1 hour","day":"1 day","week":"7 days","month":"1 month","quarter":"3 months","year":"1 year"}';
  q        jsonb := coalesce(p_question, '{}'::jsonb);
  v_c      jsonb := p_def -> '_c';
  v_cols   jsonb;
  k        text;
  v_lane   text;
  v_mode   text := coalesce(p_def ->> 'mode', 'invoker');
  v_me     uuid := auth.uid();
  v_cal    jsonb;
  v_tz     text;
  v_ws     text;
  v_shift  integer;
  v_params jsonb := '{}'::jsonb;
  v_from   text;
  v_preds  text[] := '{}';
  v_w      jsonb := '[]'::jsonb;         -- bound where values, by position
  v_by     jsonb := '[]'::jsonb;         -- [{key, dim, grain, col}]
  v_ax     jsonb;                        -- the across entry
  v_show   jsonb := '[]'::jsonb;         -- [{key, op, col, grain_col, cat}]
  v_sort   jsonb;
  v_cap    integer;
  v_acap   integer;
  v_cmp    jsonb;
  v_win    jsonb;
  v_time_default boolean := false;
  e        jsonb;
  d        jsonb;
  m        jsonb;
  v_col    jsonb;
  v_ref    text;
  v_x      text;
  v_i      integer;
  v_n      integer;
  v_sel    text[];
  v_gk     text[];
  v_sets   text;
  v_meas   text[];
  v_zero   jsonb := '{}'::jsonb;
  v_delta  text[] := '{}';
  v_grp    text;
  v_order  text;
  v_sql    text;
  v_rel    jsonb := '[]'::jsonb;
  v_rank_dir text;
  v_rank_expr text;
  v_has_by boolean;
  v_has_ax boolean;
  v_rows_cols text[];
  v_pk     jsonb;
begin
  -- the columns this definition may read: key -> {alias, column, type, cat, fk?}
  v_cols := coalesce(v_c -> 'cols', '{}'::jsonb);

  for k in select jsonb_object_keys(q) loop
    if not (k = any (array['by','across','show','where','window','compare','sort','limit','offset','lane','path','columns'])) then
      raise exception '"%" is not part of a question.', k
        using errcode = '22023', hint = 'A question has: by, across, show, where, window, compare, sort, limit, lane (and for records: offset, columns).';
    end if;
  end loop;
  if (q ? 'by') and jsonb_typeof(q -> 'by') <> 'array' then
    raise exception 'by is a list of dimension keys, outermost first.' using errcode = '22023';
  end if;
  if (q ? 'show') and jsonb_typeof(q -> 'show') <> 'array' then
    raise exception 'show is a list of measure keys.' using errcode = '22023';
  end if;
  if (q ? 'where') and jsonb_typeof(q -> 'where') <> 'object' then
    raise exception 'where is an object of dimension key -> value.' using errcode = '22023',
      hint = 'A value is an equality, null is "not set", a list is any of them, and {"from": …, "to": …} is a half-open range.';
  end if;

  -- ── THE LANE ────────────────────────────────────────────────────────────────────────────
  v_lane := coalesce(nullif(q ->> 'lane', ''), case when p_def -> 'lanes' ? 'organization' then 'organization'
                                                    else p_def -> 'lanes' ->> 0 end);
  if not (p_def -> 'lanes' ? v_lane) then
    raise exception '"%" cannot be asked in the % lane.', p_def ->> 'label', v_lane
      using errcode = '22023', hint = format('It offers: %s.', (select string_agg(x #>> '{}', ', ') from jsonb_array_elements(p_def -> 'lanes') x));
  end if;
  if v_lane = 'platform' and not public.is_platform_admin() then
    raise exception 'Everything on the platform is counted only inside the admin apps, by a platform admin.'
      using errcode = '42501', hint = 'Ask in your organization''s lane, or your own.';
  end if;
  if v_lane = 'mine' and public.is_platform_admin() then
    raise exception 'Inside the admin apps an admin never counts as herself.'
      using errcode = '22023', hint = 'Ask in the platform lane, or in one organization''s.';
  end if;
  if v_lane = 'mine' and v_me is null then
    raise exception 'Your own lane needs a signed-in person.' using errcode = '42501';
  end if;
  v_params := v_params || jsonb_build_object('org', p_organization_id, 'me', v_me);

  if v_mode = 'definer' then
    e := p_def -> '_c' -> 'lane_rules' -> v_lane;
    if e is null then
      raise exception 'The % lane of "%" names no rule, so it is not answered.', v_lane, p_def ->> 'key' using errcode = '42P17';
    end if;
    if v_lane = 'organization' and e ->> 'rule' = 'admin'
       and not (p_organization_id in (select iam.my_admin_orgs())) then
      raise exception 'Only an owner or admin of this organization sees its % counted here.', lower(p_def ->> 'label')
        using errcode = '42501';
    end if;
    if v_lane in ('mine', 'organization') then
      v_col := v_cols -> (e ->> 'column');
      v_preds := v_preds || format('%I.%I = ($1->>%L)::uuid', v_col ->> 'alias', v_col ->> 'column',
                                   case when v_lane = 'mine' then 'me' else 'org' end);
    end if;
  else
    if v_lane = 'organization' and v_c -> 'lane_cols' ? 'organization' then
      v_col := v_cols -> (v_c -> 'lane_cols' ->> 'organization');
      v_preds := v_preds || format('%I.%I = ($1->>''org'')::uuid', v_col ->> 'alias', v_col ->> 'column');
    elsif v_lane = 'mine' then
      if not (v_c -> 'lane_cols' ? 'mine') then
        raise exception '"%" has no column that says whose a row is, so it has no lane of your own.', p_def ->> 'label' using errcode = '22023';
      end if;
      v_col := v_cols -> (v_c -> 'lane_cols' ->> 'mine');
      v_preds := v_preds || format('%I.%I = ($1->>''me'')::uuid', v_col ->> 'alias', v_col ->> 'column');
    end if;
  end if;
  if (v_c -> 'fact' ->> 'deleted')::boolean then
    v_preds := v_preds || 't.deleted_at is null'::text;
  end if;

  -- ── THE CALENDAR (only when a time is cut) ───────────────────────────────────────────────
  v_cal := custom.agg_calendar(p_organization_id);
  v_tz := v_cal ->> 'time_zone';
  v_ws := v_cal ->> 'week_start';
  v_shift := (8 - coalesce(array_position(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'], v_ws), 1)) % 7;
  v_params := v_params || jsonb_build_object('tz', v_tz);

  -- ── FROM: the fact and its star ──────────────────────────────────────────────────────────
  v_from := format('%I.%I t', v_c -> 'fact' ->> 'schema', v_c -> 'fact' ->> 'table');
  for e in select x from jsonb_array_elements(coalesce(v_c -> 'joins', '[]'::jsonb)) x loop
    v_from := v_from || format(' left join %I.%I %I on %I.%I = %I.%I',
                               e ->> 'schema', e ->> 'table', e ->> 'alias',
                               e ->> 'alias', e ->> 'to', e ->> 'on_alias', e ->> 'on_column');
  end loop;

  -- ── WHERE: every value bound, cast to the column's own type ──────────────────────────────
  for k, e in select key, value from jsonb_each(coalesce(q -> 'where', '{}'::jsonb)) loop
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = split_part(k, ':', 1));
    if d is null then
      raise exception 'There is no dimension "%" to filter by.', k using errcode = '22023',
        hint = format('Dimensions: %s.', (select string_agg(x ->> 'key', ', ') from jsonb_array_elements(p_def -> 'dimensions') x));
    end if;
    v_col := v_cols -> (d ->> 'from');
    v_ref := format('%I.%I', v_col ->> 'alias', v_col ->> 'column');
    if position(':' in k) > 0 then
      -- a bucket a person clicked: that one period, from its label to the next
      v_x := split_part(k, ':', 2);
      if d ->> 'kind' <> 'time' or not (c_steps ? v_x) or jsonb_typeof(e) <> 'string' then
        raise exception '"%" is a period filter: a time dimension, a grain, and the period''s label.', k using errcode = '22023';
      end if;
      begin
        e := jsonb_build_object('from', (e #>> '{}')::timestamptz,
                                'to', (((e #>> '{}')::timestamptz at time zone v_tz) + (c_steps ->> v_x)::interval) at time zone v_tz);
      exception when others then
        raise exception '"%" is not a period label (such as 2026-09-01T00:00:00-07:00).', e #>> '{}' using errcode = '22023';
      end;
    end if;
    v_i := jsonb_array_length(v_w);
    if jsonb_typeof(e) = 'null' then
      v_preds := v_preds || format('%s is null', v_ref);
    elsif jsonb_typeof(e) = 'array' then
      if jsonb_array_length(e) > 1000 then
        raise exception 'A filter lists at most 1000 values; this one lists %.', jsonb_array_length(e) using errcode = '22023';
      end if;
      perform platform._drill_assert_values(e, v_col ->> 'type', d ->> 'label');
      v_w := v_w || jsonb_build_array(e);
      v_preds := v_preds || format('(%1$s = any ((select array_agg(x) from jsonb_array_elements_text($1->''w''->%2$s) x)::%3$s[]) or (%1$s is null and ($1->''w''->%2$s) @> ''[null]''))',
                                   v_ref, v_i, v_col ->> 'type');
    elsif jsonb_typeof(e) = 'object' then
      if exists (select 1 from jsonb_object_keys(e) x where x not in ('from', 'to')) or not (e ? 'from' or e ? 'to') then
        raise exception 'A range is {"from": …, "to": …}: from is included, to is not.' using errcode = '22023';
      end if;
      if v_col ->> 'cat' = 'time' then
        begin
          e := jsonb_strip_nulls(jsonb_build_object('from', (e ->> 'from')::timestamptz, 'to', (e ->> 'to')::timestamptz));
        exception when others then
          raise exception 'The range on % is not two moments.', d ->> 'label' using errcode = '22023';
        end;
        v_x := platform._drill_moment_sql(v_ref, v_col ->> 'type');
        v_w := v_w || jsonb_build_array(e);
        if e ? 'from' then v_preds := v_preds || format('%s >= ($1->''w''->%s->>''from'')::timestamptz', v_x, v_i); end if;
        if e ? 'to' then v_preds := v_preds || format('%s < ($1->''w''->%s->>''to'')::timestamptz', v_x, v_i); end if;
      else
        perform platform._drill_assert_values(jsonb_build_array(e -> 'from', e -> 'to'), v_col ->> 'type', d ->> 'label');
        v_w := v_w || jsonb_build_array(e);
        if e ? 'from' then v_preds := v_preds || format('%s >= ($1->''w''->%s->>''from'')::%s', v_ref, v_i, v_col ->> 'type'); end if;
        if e ? 'to' then v_preds := v_preds || format('%s < ($1->''w''->%s->>''to'')::%s', v_ref, v_i, v_col ->> 'type'); end if;
      end if;
    else
      perform platform._drill_assert_values(jsonb_build_array(e), v_col ->> 'type', d ->> 'label');
      v_w := v_w || jsonb_build_array(e);
      v_preds := v_preds || format('%s = ($1->''w''->>%s)::%s', v_ref, v_i, v_col ->> 'type');
    end if;
  end loop;

  -- ── THE WINDOW and THE COMPARISON ────────────────────────────────────────────────────────
  v_win := q -> 'window';
  if v_win is not null and jsonb_typeof(v_win) = 'object' then
    k := coalesce(v_win ->> 'key', p_def -> 'default' -> 'window' ->> 'key',
                  (select x ->> 'key' from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'kind' = 'time' limit 1));
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = k and x ->> 'kind' = 'time');
    if d is null then
      raise exception 'A window runs along a time dimension, and "%" is not one.', coalesce(k, '') using errcode = '22023';
    end if;
    if v_win ? 'preset' then
      v_x := v_win ->> 'preset';
      if v_x !~ '^[0-9]{1,4}(h|d)$' and v_x <> 'all' then
        raise exception '"%" is not a window: 24h, 7d, 30d, 90d, 365d or all.', v_x using errcode = '22023';
      end if;
      v_win := case when v_x = 'all' then jsonb_build_object('key', k)
                    else jsonb_build_object('key', k,
                           'from', now() - (left(v_x, -1) || case right(v_x, 1) when 'h' then ' hours' else ' days' end)::interval,
                           'to', now()) end;
    end if;
    v_win := v_win || jsonb_build_object('key', k);
  else
    v_win := null;
  end if;

  if q ? 'compare' and jsonb_typeof(q -> 'compare') <> 'null' then
    e := case when jsonb_typeof(q -> 'compare') = 'string' then jsonb_build_object('against', q ->> 'compare') else q -> 'compare' end;
    if e ->> 'against' in ('prev', 'previous') then e := e || '{"against":"previous_period"}'; end if;
    if e ->> 'against' in ('yoy') then e := e || '{"against":"same_period_last_year"}'; end if;
    k := coalesce(e ->> 'key', v_win ->> 'key',
                  (select split_part(x #>> '{}', ':', 1) from jsonb_array_elements(coalesce(q -> 'by', '[]')) x
                    where exists (select 1 from jsonb_array_elements(p_def -> 'dimensions') y
                                   where y ->> 'key' = split_part(x #>> '{}', ':', 1) and y ->> 'kind' = 'time') limit 1),
                  (select x ->> 'key' from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'kind' = 'time' limit 1));
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = k and x ->> 'kind' = 'time');
    if d is null then
      raise exception 'A comparison runs along a time dimension, and this definition has none called "%".', coalesce(k, '') using errcode = '22023';
    end if;
    e := e || jsonb_build_object('key', 'created_at');   -- custom.agg_compare_windows judges the key's shape only
    if v_win ? 'from' and not (e ? 'from' or e ? 'to' or e ? 'period') then
      e := e || jsonb_build_object('from', v_win ->> 'from', 'to', coalesce(v_win ->> 'to', now()::text));
    end if;
    v_cmp := custom.agg_compare_windows(p_organization_id, e,
               (select jsonb_build_object('key', 'created_at', 'by', split_part(x #>> '{}', ':', 2))
                  from jsonb_array_elements(coalesce(q -> 'by', '[]')) x where position(':' in x #>> '{}') > 0 limit 1));
    v_cmp := v_cmp || jsonb_build_object('key', k);
    v_col := v_cols -> (d ->> 'from');
    v_x := platform._drill_moment_sql(format('%I.%I', v_col ->> 'alias', v_col ->> 'column'), v_col ->> 'type');
    v_params := v_params || jsonb_build_object(
      'wf', (v_cmp -> 'window' ->> 'from')::timestamptz, 'wt', (v_cmp -> 'window' ->> 'to')::timestamptz,
      'pf', (v_cmp -> 'prior_window' ->> 'from')::timestamptz, 'pt', (v_cmp -> 'prior_window' ->> 'to')::timestamptz,
      'cmp', v_cmp);
    v_preds := v_preds || format('((sd.side = ''w'' and %1$s >= ($1->>''wf'')::timestamptz and %1$s < ($1->>''wt'')::timestamptz) or (sd.side = ''p'' and %1$s >= ($1->>''pf'')::timestamptz and %1$s < ($1->>''pt'')::timestamptz))', v_x);
    v_from := v_from || ' cross join lateral (values (''w''::text), (''p''::text)) sd(side)';
  elsif v_win ? 'from' or v_win ? 'to' then
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = v_win ->> 'key');
    v_col := v_cols -> (d ->> 'from');
    v_x := platform._drill_moment_sql(format('%I.%I', v_col ->> 'alias', v_col ->> 'column'), v_col ->> 'type');
    begin
      v_params := v_params || jsonb_strip_nulls(jsonb_build_object('wf', (v_win ->> 'from')::timestamptz, 'wt', (v_win ->> 'to')::timestamptz));
    exception when others then
      raise exception 'A window is {"from": …, "to": …} as two moments, or a preset.' using errcode = '22023';
    end;
    if v_params ? 'wf' then v_preds := v_preds || format('%s >= ($1->>''wf'')::timestamptz', v_x); end if;
    if v_params ? 'wt' then v_preds := v_preds || format('%s < ($1->>''wt'')::timestamptz', v_x); end if;
  end if;
  v_params := v_params || jsonb_build_object('w', v_w);

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- RECORDS ("see these records"): the same FROM and WHERE, an explicit column list.
  -- ════════════════════════════════════════════════════════════════════════════════════════
  if p_kind = 'rows' then
    if v_cmp is not null then
      raise exception 'The records behind a number are asked without a comparison.' using errcode = '22023';
    end if;
    v_cap := custom.page_size(p_organization_id, 'platform.drill_rows', (q ->> 'limit')::integer, 50);
    if coalesce((q ->> 'offset')::integer, 0) < 0 then
      raise exception 'An offset is 0 or more.' using errcode = '22023';
    end if;
    v_params := v_params || jsonb_build_object('limit', v_cap, 'offset', coalesce((q ->> 'offset')::integer, 0));
    v_rows_cols := '{}';
    for k in select coalesce(x ->> 'from', x #>> '{}') from jsonb_array_elements(
               coalesce(q -> 'columns', p_def -> 'detail' -> 'columns', '[]'::jsonb)) x loop
      -- a detail column is a column key, or a dimension's key
      v_x := coalesce((select y ->> 'from' from jsonb_array_elements(p_def -> 'dimensions') y where y ->> 'key' = k), k);
      v_col := v_cols -> v_x;
      if v_col is null then
        raise exception 'There is no column "%" these records can show.', k using errcode = '22023';
      end if;
      v_rows_cols := v_rows_cols || format('%L, %I.%I', k, v_col ->> 'alias', v_col ->> 'column');
    end loop;
    if jsonb_array_length(v_c -> 'fact' -> 'pk') = 1 then
      v_rows_cols := array[format('''id'', t.%I', v_c -> 'fact' -> 'pk' ->> 0)] || v_rows_cols;
    elsif jsonb_array_length(v_c -> 'fact' -> 'pk') > 1 then
      v_rows_cols := array[format('''id'', jsonb_build_object(%s)',
                     (select string_agg(format('%L, t.%I', x #>> '{}', x #>> '{}'), ', ') from jsonb_array_elements(v_c -> 'fact' -> 'pk') x))] || v_rows_cols;
    end if;
    -- order: the asked column, or the first time, then the key so pages never overlap
    v_order := '';
    if q ? 'sort' then
      k := q -> 'sort' ->> 'key';
      v_x := coalesce((select y ->> 'from' from jsonb_array_elements(p_def -> 'dimensions') y where y ->> 'key' = k), k);
      v_col := v_cols -> v_x;
      if v_col is null then
        raise exception 'These records cannot be sorted by "%".', coalesce(k, '') using errcode = '22023';
      end if;
      v_order := format('%I.%I %s nulls last', v_col ->> 'alias', v_col ->> 'column',
                        case when lower(coalesce(q -> 'sort' ->> 'direction', 'asc')) = 'desc' then 'desc' else 'asc' end);
    else
      select format('%I.%I desc nulls last', v_cols -> (x ->> 'from') ->> 'alias', v_cols -> (x ->> 'from') ->> 'column')
        into v_order from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'kind' = 'time' limit 1;
    end if;
    v_order := concat_ws(', ', nullif(v_order, ''),
                 (select string_agg(format('t.%I', x #>> '{}'), ', ') from jsonb_array_elements(v_c -> 'fact' -> 'pk') x));
    v_sql := format($q$select count(*) over () as total, jsonb_build_object(%s) as r from %s where %s order by %s limit ($1->>'limit')::integer offset ($1->>'offset')::integer$q$,
                    array_to_string(v_rows_cols, ', '), v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true'),
                    coalesce(nullif(v_order, ''), '1'));
    return jsonb_build_object(
      'sql', format('select coalesce(max(x.total), 0)::bigint as total, coalesce(jsonb_agg(x.r order by x.n), ''[]''::jsonb) as rows from (select row_number() over () as n, y.* from (%s) y) x', v_sql),
      'count_sql', format('select count(*)::bigint from %s where %s', v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true')),
      'params', v_params, 'lane', v_lane, 'limit', v_cap, 'offset', v_params -> 'offset');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- THE ANSWER
  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- BY: dimension keys, `time:grain` for a period, outermost first.
  for e in select x from jsonb_array_elements(coalesce(q -> 'by', p_def -> 'default' -> 'by', '[]'::jsonb)) x loop
    k := e #>> '{}';
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = split_part(k, ':', 1));
    if d is null then
      raise exception 'There is no dimension "%" to group by.', k using errcode = '22023',
        hint = format('Dimensions: %s.', (select string_agg(x ->> 'key', ', ') from jsonb_array_elements(p_def -> 'dimensions') x));
    end if;
    if d ->> 'kind' = 'time' then
      v_x := coalesce(nullif(split_part(k, ':', 2), ''), 'month');
      if not (c_steps ? v_x) or not (coalesce(d -> 'grains', '["year","quarter","month","week","day"]') ? v_x) then
        raise exception '% is not cut by "%".', d ->> 'label', v_x using errcode = '22023',
          hint = format('It is cut by %s.', (select string_agg(x #>> '{}', ', ') from jsonb_array_elements(coalesce(d -> 'grains', '["year","quarter","month","week","day"]')) x));
      end if;
      k := (d ->> 'key') || ':' || v_x;
    elsif position(':' in k) > 0 then
      raise exception '% is not a time, so it has no periods.', d ->> 'label' using errcode = '22023';
    else
      v_x := null;
    end if;
    if exists (select 1 from jsonb_array_elements(v_by) y where y ->> 'key' = k) then
      raise exception '"%" is asked twice.', k using errcode = '22023';
    end if;
    v_by := v_by || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('key', k, 'dim', d, 'grain', v_x, 'col', v_cols -> (d ->> 'from'))));
  end loop;
  if jsonb_array_length(v_by) > 4 then
    raise exception 'A question groups by at most four dimensions at once.' using errcode = '22023',
      hint = 'Drill into one group to go deeper.';
  end if;

  -- ACROSS: one dimension becomes the columns of a pivot.
  if q ? 'across' and jsonb_typeof(q -> 'across') = 'string' then
    k := q ->> 'across';
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = split_part(k, ':', 1));
    if d is null then
      raise exception 'There is no dimension "%" to pivot across.', k using errcode = '22023';
    end if;
    if d ->> 'cardinality' = 'high' then
      raise exception '% has too many values to become columns.', d ->> 'label' using errcode = '22023', hint = 'Group by it instead.';
    end if;
    v_x := case when d ->> 'kind' = 'time' then coalesce(nullif(split_part(k, ':', 2), ''), 'month') end;
    if v_x is not null and not (c_steps ? v_x) then
      raise exception '"%" is not a grain.', v_x using errcode = '22023';
    end if;
    k := (d ->> 'key') || coalesce(':' || v_x, '');
    if exists (select 1 from jsonb_array_elements(v_by) y where y ->> 'key' = k or y -> 'dim' ->> 'key' = d ->> 'key') then
      raise exception '"%" cannot be both a group and the columns.', k using errcode = '22023';
    end if;
    v_ax := jsonb_strip_nulls(jsonb_build_object('key', k, 'dim', d, 'grain', v_x, 'col', v_cols -> (d ->> 'from')));
  end if;
  v_has_by := jsonb_array_length(v_by) > 0;
  v_has_ax := v_ax is not null;

  -- SHOW: measure keys, or {op, of} over a column this definition reads.
  for e in select x from jsonb_array_elements(coalesce(q -> 'show', p_def -> 'default' -> 'show', '["count"]'::jsonb)) x loop
    if jsonb_typeof(e) = 'string' then
      m := (select x from jsonb_array_elements(p_def -> 'measures') x where x ->> 'key' = e #>> '{}');
      if m is null then
        raise exception 'There is no measure "%".', e #>> '{}' using errcode = '22023',
          hint = format('Measures: %s.', (select string_agg(x ->> 'key', ', ') from jsonb_array_elements(p_def -> 'measures') x));
      end if;
    elsif jsonb_typeof(e) = 'object' then
      if not coalesce(e ->> 'op', '') = any (c_ops) then
        raise exception '"%" is not a measure operation.', coalesce(e ->> 'op', '') using errcode = '22023',
          hint = format('Operations: %s.', array_to_string(c_ops, ', '));
      end if;
      v_x := coalesce((select y ->> 'from' from jsonb_array_elements(p_def -> 'dimensions') y where y ->> 'key' = e ->> 'of'), e ->> 'of');
      if e ->> 'op' <> 'count' and not (v_cols ? coalesce(v_x, '')) then
        raise exception 'There is no column "%" to measure.', coalesce(e ->> 'of', '') using errcode = '22023';
      end if;
      if e ->> 'op' in ('sum', 'avg', 'median') and v_cols -> v_x ->> 'cat' <> 'number' then
        raise exception '"%" is not a number, so it cannot be added up.', e ->> 'of' using errcode = '22023';
      end if;
      m := jsonb_strip_nulls(jsonb_build_object('key', case when e ->> 'op' = 'count' then 'count' else (e ->> 'op') || '_' || (e ->> 'of') end,
                                                'op', e ->> 'op', 'of', v_x));
    else
      raise exception 'A measure is its key, or {"op": …, "of": …}.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_show) y where y ->> 'key' = m ->> 'key') then
      continue;
    end if;
    v_show := v_show || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'key', m ->> 'key', 'op', m ->> 'op', 'of', m ->> 'of', 'at_grain', m ->> 'at_grain',
      'cat', v_cols -> (m ->> 'of') ->> 'cat')));
  end loop;
  if jsonb_array_length(v_show) = 0 then
    v_show := '[{"key":"count","op":"count"}]';
  end if;

  -- SORT: a shown measure, or a grouped dimension. A time first dimension keeps its latest
  -- periods and reads in calendar order.
  if q ? 'sort' and jsonb_typeof(q -> 'sort') = 'object' then
    k := q -> 'sort' ->> 'key';
    if exists (select 1 from jsonb_array_elements(v_show) y where y ->> 'key' = k) then
      v_rank_dir := case when lower(coalesce(q -> 'sort' ->> 'direction', 'desc')) = 'asc' then 'asc' else 'desc' end;
      v_sort := jsonb_build_object('measure', k);
    else
      v_i := (select o - 1 from jsonb_array_elements(v_by) with ordinality z(y, o)
               where y ->> 'key' = k or y -> 'dim' ->> 'key' = k limit 1);
      if v_i is null then
        raise exception 'The answer cannot be sorted by "%": sort by a measure it shows or a dimension it groups by.', coalesce(k, '')
          using errcode = '22023';
      end if;
      v_rank_dir := case when lower(coalesce(q -> 'sort' ->> 'direction', 'asc')) = 'desc' then 'desc' else 'asc' end;
      v_sort := jsonb_build_object('by', v_i);
    end if;
  elsif v_has_by and v_by -> 0 ->> 'grain' is not null then
    v_sort := jsonb_build_object('by', 0);
    v_rank_dir := 'desc';
    v_time_default := true;
  else
    v_sort := jsonb_build_object('measure', v_show -> 0 ->> 'key');
    v_rank_dir := 'desc';
  end if;

  v_cap := custom.page_size(p_organization_id, 'platform.drill_ask', (q ->> 'limit')::integer,
             coalesce((platform.knob_resolve('drill', 'groups_per_level', p_organization_id, v_me) #>> '{}')::integer, 100));
  v_acap := greatest(1, coalesce((platform.knob_resolve('drill', 'pivot_columns', p_organization_id, v_me) #>> '{}')::integer, 24));
  v_params := v_params || jsonb_build_object('cap', v_cap, 'acap', v_acap);

  -- ── src: one row per fact row that passes, with its group values ────────────────────────
  v_sel := array[case when v_cmp is not null then 'sd.side' else '''w''::text' end || ' as side'];
  v_gk := '{}';
  v_i := 0;
  for e in select x from jsonb_array_elements(v_by) x loop
    v_i := v_i + 1;
    v_ref := format('%I.%I', e -> 'col' ->> 'alias', e -> 'col' ->> 'column');
    if e ? 'grain' then
      v_x := platform._drill_period_sql(platform._drill_local_sql(v_ref, e -> 'col' ->> 'type'), e ->> 'grain', v_shift);
      v_sel := v_sel || format('%s as ps%s', v_x, v_i);
      if v_cmp is not null then
        v_params := v_params || jsonb_build_object('wps_' || (e ->> 'grain'),
          custom.agg_period_start((v_params ->> 'wf')::timestamptz at time zone v_tz, e ->> 'grain', v_ws),
          'pps_' || (e ->> 'grain'),
          custom.agg_period_start((v_params ->> 'pf')::timestamptz at time zone v_tz, e ->> 'grain', v_ws));
        v_sel := v_sel || format('%s as d%s', platform._drill_ordinal_sql(v_x,
                   format('(case sd.side when ''w'' then ($1->>%L) else ($1->>%L) end)::timestamp', 'wps_' || (e ->> 'grain'), 'pps_' || (e ->> 'grain')),
                   e ->> 'grain'), v_i);
      else
        v_sel := v_sel || format('%s as d%s', v_x, v_i);
      end if;
    else
      v_sel := v_sel || format('%s as d%s', v_ref, v_i);
    end if;
    v_gk := v_gk || format('s.d%s', v_i);
  end loop;
  if v_has_ax then
    v_ref := format('%I.%I', v_ax -> 'col' ->> 'alias', v_ax -> 'col' ->> 'column');
    if v_ax ? 'grain' then
      v_x := platform._drill_period_sql(platform._drill_local_sql(v_ref, v_ax -> 'col' ->> 'type'), v_ax ->> 'grain', v_shift);
      v_sel := v_sel || format('%s as aps', v_x);
      if v_cmp is not null then
        v_params := v_params || jsonb_build_object('wps_' || (v_ax ->> 'grain'),
          custom.agg_period_start((v_params ->> 'wf')::timestamptz at time zone v_tz, v_ax ->> 'grain', v_ws),
          'pps_' || (v_ax ->> 'grain'),
          custom.agg_period_start((v_params ->> 'pf')::timestamptz at time zone v_tz, v_ax ->> 'grain', v_ws));
        v_sel := v_sel || format('%s as ax', platform._drill_ordinal_sql(v_x,
                   format('(case sd.side when ''w'' then ($1->>%L) else ($1->>%L) end)::timestamp', 'wps_' || (v_ax ->> 'grain'), 'pps_' || (v_ax ->> 'grain')),
                   v_ax ->> 'grain'));
      else
        v_sel := v_sel || format('%s as ax', v_x);
      end if;
    else
      v_sel := v_sel || format('%s as ax', v_ref);
    end if;
  end if;
  v_i := 0;
  for m in select x from jsonb_array_elements(v_show) x loop
    v_i := v_i + 1;
    if m ->> 'op' <> 'count' then
      v_col := v_cols -> (m ->> 'of');
      v_sel := v_sel || format('%I.%I as m%s', v_col ->> 'alias', v_col ->> 'column', v_i);
    end if;
    if m ? 'at_grain' then
      v_col := v_cols -> (m ->> 'at_grain');
      v_sel := v_sel || format('%I.%I as g%s', v_col ->> 'alias', v_col ->> 'column', v_i);
    end if;
  end loop;

  -- the sort's own aggregate over src (the ranking of groups)
  if v_sort ? 'measure' then
    v_i := (select o from jsonb_array_elements(v_show) with ordinality z(y, o) where y ->> 'key' = v_sort ->> 'measure');
    v_rank_expr := platform._drill_agg_sql(v_show -> (v_i - 1), 's.m' || v_i, null,
                     case when v_cmp is not null then 's.side = ''w''' end);
  end if;

  -- ── the statement ─────────────────────────────────────────────────────────────────────────
  v_sql := format('with src as (select %s from %s where %s)', array_to_string(v_sel, ', '), v_from,
                  coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true'));
  -- s2: the group key as one jsonb value (hashable), the across value likewise
  v_sql := v_sql || format(', s2 as (select s.*, %s as gk0, %s as av0 from src s)',
             case when v_has_by then 'jsonb_build_array(' || array_to_string(v_gk, ', ') || ')' else '''[]''::jsonb' end,
             case when v_has_ax then 'coalesce(to_jsonb(s.ax), ''null''::jsonb)' else 'null::jsonb' end);
  -- the ranking of groups: by the current window's value; a group only the prior window has
  -- ranks after every current one. Ties break on the key, so top-N is the same on every call.
  v_sql := v_sql || format(', bg as (select s.gk0 as gk, %s as sv, count(*) filter (where s.side = ''w'') as c, count(*) as c_all from s2 s group by s.gk0)',
             case when v_sort ? 'measure' then v_rank_expr else 'null::numeric' end);
  v_sql := v_sql || format(', br as (select gk, row_number() over (order by %s, gk) as rn, count(*) filter (where c > 0) over () as n from bg)',
             case when v_sort ? 'measure' then format('sv %s nulls last, c desc, c_all desc', v_rank_dir)
                  else format('(gk->%s) %s nulls last', v_sort ->> 'by', v_rank_dir) end);
  if v_has_ax then
    v_sql := v_sql || ', ag as (select s.av0 as av, count(*) filter (where s.side = ''w'') as c, count(*) as c_all from s2 s group by s.av0)';
    v_sql := v_sql || format(', ar as (select av, row_number() over (order by %s, c desc, c_all desc, av) as arn, count(*) filter (where c > 0) over () as n from ag)',
               case when v_ax ? 'grain' then 'av asc' else 'c desc' end);
  end if;
  -- tg: fold every group past the cap into Other, every across value past its cap into one column
  v_sql := v_sql || format(', tg as (select s.*, br.rn, case when br.rn <= ($1->>''cap'')::integer then br.gk end as gk, (br.rn > ($1->>''cap'')::integer) as is_other%s from s2 s join br on br.gk = s.gk0%s)',
             case when v_has_ax then ', ar.arn, case when ar.arn <= ($1->>''acap'')::integer then ar.av else ''{"other":true}''::jsonb end as av' else '' end,
             case when v_has_ax then ' join ar on ar.av = s.av0' else '' end);
  -- tg2: at_grain flags, one per grouping-set shape, on the FOLDED keys
  v_sel := '{}';
  v_i := 0;
  for m in select x from jsonb_array_elements(v_show) x loop
    v_i := v_i + 1;
    continue when not (m ? 'at_grain');
    v_sel := v_sel || format('(row_number() over (partition by t.side, t.is_other, t.gk%s, t.g%s order by t.m%s nulls last) = 1) as f%s_c',
                             case when v_has_ax then ', t.av' else '' end, v_i, v_i, v_i);
    if v_has_ax then
      v_sel := v_sel || format('(row_number() over (partition by t.side, t.is_other, t.gk, t.g%s order by t.m%s nulls last) = 1) as f%s_g', v_i, v_i, v_i);
      v_sel := v_sel || format('(row_number() over (partition by t.side, t.av, t.g%s order by t.m%s nulls last) = 1) as f%s_a', v_i, v_i, v_i);
    end if;
    v_sel := v_sel || format('(row_number() over (partition by t.side, t.g%s order by t.m%s nulls last) = 1) as f%s_t', v_i, v_i, v_i);
  end loop;
  v_sql := v_sql || format(', tg2 as (select t.*%s from tg t)',
             case when cardinality(v_sel) > 0 then ', ' || array_to_string(v_sel, ', ') else '' end);

  -- the grouping sets, and each measure chosen per set
  v_sets := case
    when v_has_by and v_has_ax then '(side, is_other, gk, av), (side, is_other, gk), (side, av), (side)'
    when v_has_by then '(side, is_other, gk), (side)'
    when v_has_ax then '(side, av), (side)'
    else '(side)' end;
  v_meas := '{}';
  v_i := 0;
  for m in select x from jsonb_array_elements(v_show) x loop
    v_i := v_i + 1;
    if m ? 'at_grain' then
      v_x := format('case %s else %s end',
        case
          when v_has_by and v_has_ax then format('when grouping(gk) = 0 and grouping(av) = 0 then %s when grouping(gk) = 0 then %s when grouping(av) = 0 then %s',
                                                platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_c'),
                                                platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_g'),
                                                platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_a'))
          when v_has_by then format('when grouping(gk) = 0 then %s', platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_c'))
          when v_has_ax then format('when grouping(av) = 0 then %s', platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_c'))
          else 'when false then null' end,
        platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_t'));
    else
      v_x := platform._drill_agg_sql(m, 'm' || v_i, null);
    end if;
    v_meas := v_meas || format('%L, (%s)', m ->> 'key', v_x);
    v_zero := v_zero || jsonb_build_object(m ->> 'key',
                case when m ->> 'op' in ('count', 'count_distinct', 'filled', 'empty') then to_jsonb(0) else 'null'::jsonb end);
    if coalesce(m ->> 'cat', 'number') = 'number' or m ->> 'op' in ('count', 'count_distinct', 'filled', 'empty') then
      v_delta := v_delta || format($d$%1$L, jsonb_build_object('current', (c.measures->>%1$L)::numeric, 'prior', (p.measures->>%1$L)::numeric,
                                 'change', (c.measures->>%1$L)::numeric - (p.measures->>%1$L)::numeric,
                                 'change_pct', case when (p.measures->>%1$L)::numeric is null or (c.measures->>%1$L)::numeric is null or (p.measures->>%1$L)::numeric = 0 then null
                                                    else round(((c.measures->>%1$L)::numeric - (p.measures->>%1$L)::numeric) / abs((p.measures->>%1$L)::numeric) * 100, 1) end)$d$,
                                 m ->> 'key');
    end if;
  end loop;
  v_params := v_params || jsonb_build_object('zero', v_zero);

  -- the time labels of each group (the period start, read as the store's label)
  v_sel := '{}';
  v_i := 0;
  for e in select x from jsonb_array_elements(v_by) x loop
    v_i := v_i + 1;
    if e ? 'grain' then
      v_sel := v_sel || format('min(case when not is_other then ps%s end) as lbl%s', v_i, v_i);
    end if;
  end loop;
  if v_has_ax and v_ax ? 'grain' then
    v_sel := v_sel || 'min(case when av <> ''{"other":true}''::jsonb then aps end) as albl'::text;
  end if;
  v_sql := v_sql || format(', agg as (select side, %s as gg, %s as ga, %s as is_other, %s as gk, %s as av, min(rn) as rn, %s as arn%s, jsonb_build_object(%s) as measures, count(*)::bigint as row_count from tg2 group by grouping sets (%s))',
    case when v_has_by then 'grouping(gk)' else '1' end,
    case when v_has_ax then 'grouping(av)' else '1' end,
    case when v_has_by then 'is_other' else 'false' end,
    case when v_has_by then 'gk' else 'null::jsonb' end,
    case when v_has_ax then 'av' else 'null::jsonb' end,
    case when v_has_ax then 'min(arn)' else 'null::bigint' end,
    case when cardinality(v_sel) > 0 then ', ' || array_to_string(v_sel, ', ') else '' end,
    array_to_string(v_meas, ', '), v_sets);

  -- groups: each asked key -> its value (a period as its label); Other and totals carry none;
  -- a pivot cell and a column total carry the across key.
  v_sel := '{}';
  v_i := 0;
  for e in select x from jsonb_array_elements(v_by) x loop
    v_i := v_i + 1;
    v_sel := v_sel || format('%L, %s', e ->> 'key',
      case when e ? 'grain' then platform._drill_label_sql('X.lbl' || v_i) else format('X.gk->%s', v_i - 1) end);
  end loop;
  v_grp := format('(case when X.gg = 0 and not X.is_other then jsonb_build_object(%s) else ''{}''::jsonb end)%s',
    case when cardinality(v_sel) > 0 then array_to_string(v_sel, ', ') else '' end,
    case when v_has_ax then format(' || (case when X.ga = 0 then jsonb_build_object(%L, %s) else ''{}''::jsonb end)', v_ax ->> 'key',
           case when v_ax ? 'grain' then format('case when X.av = ''{"other":true}''::jsonb then X.av else to_jsonb(%s) end', platform._drill_label_sql('X.albl'))
                else 'X.av' end)
         else '' end);

  v_order := format('case when %1$s.gg = 1 then 2 when %1$s.is_other then 1 else 0 end, %2$s, %1$s.ga desc, %1$s.arn nulls first',
                    'Y', case when v_time_default then 'Y.rn desc' else 'Y.rn' end);

  if v_cmp is null then
    v_sql := v_sql || format($q$ select row_number() over (order by %s) as ord,
        case when Y.gg = 1 then 'total' when Y.is_other then 'other' else 'group' end as kind,
        %s as groups, Y.measures, Y.row_count,
        null::jsonb as prior_groups, null::jsonb as prior_measures, null::bigint as prior_row_count, null::jsonb as delta, null::jsonb as compare,
        (select max(n) from br)::bigint as distinct_groups, %s as distinct_across
      from agg Y$q$,
      v_order, replace(v_grp, 'X.', 'Y.'),
      case when v_has_ax then '(select max(n) from ar)::bigint' else 'null::bigint' end);
  else
    -- the same question over both windows, matched by the group (a period by its position)
    v_sql := v_sql || format($q$, cur as (select * from agg where side = 'w'), pri as (select * from agg where side = 'p'),
      j as (select coalesce(c.gg, p.gg) as gg, coalesce(c.ga, p.ga) as ga, coalesce(c.is_other, p.is_other) as is_other,
                   coalesce(c.rn, p.rn) as rn, coalesce(c.arn, p.arn) as arn,
                   case when c.side is not null then %s end as groups, coalesce(c.measures, $1->'zero') as measures, coalesce(c.row_count, 0) as row_count,
                   case when p.side is not null then %s end as prior_groups, coalesce(p.measures, $1->'zero') as prior_measures, coalesce(p.row_count, 0) as prior_row_count,
                   jsonb_build_object(%s) as delta,
                   ($1->'cmp') || jsonb_build_object('position', %s) as compare
              from cur c full join pri p
                on c.gg = p.gg and c.ga = p.ga and c.is_other is not distinct from p.is_other
               and c.gk is not distinct from p.gk and c.av is not distinct from p.av)
      select row_number() over (order by %s) as ord,
             case when Y.gg = 1 then 'total' when Y.is_other then 'other' else 'group' end as kind,
             Y.groups, Y.measures, Y.row_count, Y.prior_groups, Y.prior_measures, Y.prior_row_count, Y.delta, Y.compare,
             (select max(n) from br)::bigint as distinct_groups, %s as distinct_across
        from j Y$q$,
      replace(v_grp, 'X.', 'c.'), replace(v_grp, 'X.', 'p.'),
      replace(replace(array_to_string(v_delta, ', '), 'c.measures', 'coalesce(c.measures, $1->''zero'')'), 'p.measures', 'coalesce(p.measures, $1->''zero'')'),
      coalesce((select format('coalesce(c.gk, p.gk)->%s', o - 1) from jsonb_array_elements(v_by) with ordinality z(y, o) where y ? 'grain' limit 1), 'null'),
      v_order,
      case when v_has_ax then '(select max(n) from ar)::bigint' else 'null::bigint' end);
  end if;

  -- relation dimensions of this answer: their targets, so labels are read as the seat
  for e in select x from jsonb_array_elements(v_by || coalesce(jsonb_build_array(v_ax), '[]')) x loop
    continue when e is null or e -> 'dim' ->> 'kind' <> 'relation' or not (e -> 'col' ? 'fk');
    continue when e -> 'col' -> 'fk' ->> 'title' is null;
    v_rel := v_rel || jsonb_build_array(jsonb_build_object('key', e ->> 'key',
               'schema', e -> 'col' -> 'fk' ->> 'schema', 'table', e -> 'col' -> 'fk' ->> 'table',
               'to', e -> 'col' -> 'fk' ->> 'to', 'title', e -> 'col' -> 'fk' ->> 'title',
               'uuid', (platform._drill_column(e -> 'col' -> 'fk' ->> 'schema', e -> 'col' -> 'fk' ->> 'table', e -> 'col' -> 'fk' ->> 'to') ->> 'cat') = 'uuid'));
  end loop;

  return jsonb_build_object(
    'sql', v_sql, 'params', v_params, 'lane', v_lane, 'cap', v_cap, 'acap', v_acap, 'zero', v_zero,
    'by', (select coalesce(jsonb_agg(x ->> 'key'), '[]') from jsonb_array_elements(v_by) x),
    'across', v_ax ->> 'key',
    'show', (select coalesce(jsonb_agg(x ->> 'key'), '[]') from jsonb_array_elements(v_show) x),
    'relations', v_rel,
    'sort_label', case when v_sort ? 'measure' then (select coalesce(y ->> 'label', y ->> 'key') from jsonb_array_elements(p_def -> 'measures') y where y ->> 'key' = v_sort ->> 'measure')
                       else v_by -> (v_sort ->> 'by')::integer -> 'dim' ->> 'label' end,
    'time_first', v_time_default,
    'compare', v_cmp);
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 7. SMALL PIECES THE COMPILER USES
-- ─────────────────────────────────────────────────────────────────────────────────────────

-- A value the caller sent is one the column's own type can hold, or the question is refused
-- in words before any statement runs.
create or replace function platform._drill_assert_values(p_values jsonb, p_type text, p_label text)
returns void
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v jsonb;
begin
  for v in select x from jsonb_array_elements(coalesce(p_values, '[]'::jsonb)) x loop
    continue when v is null or jsonb_typeof(v) = 'null';
    if jsonb_typeof(v) in ('object', 'array') then
      raise exception '% is filtered by plain values, not by %.', p_label, jsonb_typeof(v) using errcode = '22023';
    end if;
    begin
      execute format('select %L::%s', v #>> '{}', p_type);
    exception when others then
      raise exception '"%" is not a value % can hold.', v #>> '{}', p_label using errcode = '22023';
    end;
  end loop;
end
$function$;

-- One measure's aggregate over one column of the statement, optionally counted once per grain
-- (p_flag, a boolean column) and narrowed further (p_filter, a condition).
create or replace function platform._drill_agg_sql(p_measure jsonb, p_col text, p_flag text, p_filter text default null)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select case p_measure ->> 'op'
      when 'count' then 'count(*)'
      when 'count_distinct' then format('count(distinct %s)', p_col)
      when 'median' then format('percentile_cont(0.5) within group (order by %s)', p_col)
      when 'filled' then format('count(%s)', p_col)
      when 'empty' then 'count(*)'
      else format('%s(%s)', p_measure ->> 'op', p_col)
    end
    || coalesce(' filter (where ' || nullif(concat_ws(' and ',
         p_flag,
         case when p_measure ->> 'op' = 'empty' then p_col || ' is null' end,
         p_filter), '') || ')', '');
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 8. THE PLAN — the one definer step a door takes before it reads anything as the seat.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- It decides who is knocking (the organization wall), resolves the definition, and turns the
-- question into a statement for the INVOKER door to run as the seat. For a custom Table it turns
-- the question into custom.record_aggregate's own arguments. It reads no row of anybody's data.

create or replace function platform._drill_plan(p_organization_id uuid, p_source jsonb, p_question jsonb, p_kind text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
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
$function$;

comment on function platform._drill_plan(uuid, jsonb, jsonb, text) is
  'DRILL-STANDARD-DOOR: the one definer step of the drill doors. It asks custom.assert_client_may_reach first, resolves the definition, and returns either a statement for the INVOKER door to run as the seat (a standard table: its own row security decides) or custom.record_aggregate''s arguments (a custom Table). It reads no row of anybody''s data.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 9. A DECLARED FACT THAT READS PAST ROW SECURITY — only with every lane's rule compiled in.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create or replace function platform._drill_run_declared(p_organization_id uuid, p_key text, p_question jsonb, p_kind text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_def  jsonb;
  v_plan jsonb;
  v_rows jsonb;
  v_n    bigint;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'platform.drill_ask');
  if p_kind not in ('ask', 'count') then
    raise exception 'A declared fact is answered (ask) or counted (count) here; its records are read as you.' using errcode = '22023';
  end if;
  -- re-resolved by KEY, validated again (platform.drill_definition_problems), never taken from a caller
  v_def := platform._drill_resolve(p_organization_id, p_key);
  if v_def ->> 'mode' is distinct from 'definer' then
    raise exception '"%" is read through the table''s own row security; ask platform.drill_ask.', p_key using errcode = '22023';
  end if;
  if p_kind = 'count' then
    v_plan := platform._drill_compile(p_organization_id, v_def, p_question, 'rows');
    execute v_plan ->> 'count_sql' into v_n using v_plan -> 'params';
    return jsonb_build_object('total', v_n);
  end if;
  v_plan := platform._drill_compile(p_organization_id, v_def, p_question, 'ask');
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by x.ord), ''[]''::jsonb) from (%s) x', v_plan ->> 'sql')
    into v_rows using v_plan -> 'params';
  return (v_plan - 'sql' - 'params') || jsonb_build_object('rows', v_rows, 'def', v_def - '_c', 'mode', 'definer');
end
$function$;

comment on function platform._drill_run_declared(uuid, text, jsonb, text) is
  'DRILL-STANDARD-DOOR: answers a DECLARED definer definition. It re-resolves the definition by key (never from a caller), refuses it on any problem platform.drill_definition_problems names, and compiles the lane''s own rule (closed vocabulary: the person column, the organization column with member/admin, or platform admin) into the statement. Joins of a definer definition reach Reference tables only. Labels are read afterwards by the invoker door, as the seat.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 10. THE THREE DOORS — SECURITY INVOKER: every row counted is a row the seat may open.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create or replace function platform.drill_describe(p_organization_id uuid, p_source jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v jsonb;
begin
  perform custom.assert_entity_door(p_organization_id, 'platform.drill_describe');
  v := platform._drill_plan(p_organization_id, p_source, null, 'describe');
  if p_source ->> 'kind' = 'table' then
    if not coalesce((v ->> 'd2')::boolean, false) then
      raise exception 'A custom Table says its own dimensions and measures once lane DRILL-CUSTOM-PARITY''s door (custom.table_dimensions) is on this database.'
        using errcode = '0A000', hint = 'Until then ask it directly: its columns are its dimensions, and count / sum_<column> its measures.';
    end if;
    execute 'select custom.table_dimensions($1, $2)' into v using p_organization_id, (p_source ->> 'id')::uuid;
    return v || jsonb_build_object('source', jsonb_build_object('kind', 'table', 'id', p_source ->> 'id'));
  end if;
  return v -> 'def';
end
$function$;

create or replace function platform.drill_ask(p_organization_id uuid, p_source jsonb, p_question jsonb default '{}'::jsonb)
returns table(kind text, groups jsonb, measures jsonb, row_count bigint, prior_groups jsonb, prior_measures jsonb,
              prior_row_count bigint, delta jsonb, compare jsonb, distinct_groups bigint, labels jsonb, says text)
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_plan  jsonb;
  v_rows  jsonb := '[]'::jsonb;
  v_lab   jsonb := '{}'::jsonb;
  v_one   jsonb;
  v_says  text[] := '{}';
  v_ids   text[];
  v_d     jsonb;
  v_rel   jsonb;
  r       jsonb;
  v_cap   integer;
  v_n     bigint;
  v_na    bigint;
  v_limit integer;
  v_by    jsonb;
  k       text;
begin
  perform custom.assert_entity_door(p_organization_id, 'platform.drill_ask');
  v_plan := platform._drill_plan(p_organization_id, p_source, p_question, 'ask');

  if v_plan ? 'delegate' then
    -- ── A CUSTOM TABLE: the store's own door, as the seat ────────────────────────────────
    v_d := v_plan -> 'delegate';
    v_limit := (v_d ->> 'limit')::integer;
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_rows
      from custom.record_aggregate(
             p_organization_id => p_organization_id, p_table_id => (p_source ->> 'id')::uuid,
             p_group_by => v_d -> 'group_by', p_measures => coalesce(v_d -> 'measures', '[]'::jsonb),
             p_bucket => v_d -> 'bucket', p_filter => coalesce(v_d -> 'filter', '{}'::jsonb),
             p_limit => v_limit, p_compare => v_d -> 'compare') x;
    -- the period's group key is `<key>_<grain>` in the store and `<key>:<grain>` in the contract
    if v_d ? 'bucket' then
      k := (v_d -> 'bucket' ->> 'key') || '_' || (v_d -> 'bucket' ->> 'by');
      select coalesce(jsonb_agg(x
               || jsonb_build_object('groups', case when (x -> 'groups') ? k then ((x -> 'groups') - k) || jsonb_build_object((v_d -> 'bucket' ->> 'key') || ':' || (v_d -> 'bucket' ->> 'by'), (x -> 'groups') -> k) else x -> 'groups' end)
               || jsonb_build_object('prior_groups', case when (x -> 'prior_groups') ? k then ((x -> 'prior_groups') - k) || jsonb_build_object((v_d -> 'bucket' ->> 'key') || ':' || (v_d -> 'bucket' ->> 'by'), (x -> 'prior_groups') -> k) else x -> 'prior_groups' end)),
             '[]'::jsonb)
        into v_rows from jsonb_array_elements(v_rows) x;
    end if;
    if (select count(*) filter (where (x ->> 'row_count')::bigint > 0) from jsonb_array_elements(v_rows) x) >= v_limit
       or (select count(*) filter (where (x ->> 'prior_row_count')::bigint > 0) from jsonb_array_elements(v_rows) x) >= v_limit then
      v_says := v_says || format('Only the first %s groups (the largest by count) are shown; this table does not add up the rest yet.', v_limit);
    end if;
    return query
      select case when jsonb_array_length(v_d -> 'group_by') = 0 and not (v_d ? 'bucket') then 'total' else 'group' end,
             nullif(x -> 'groups', 'null'), nullif(x -> 'measures', 'null'), (x ->> 'row_count')::bigint,
             nullif(x -> 'prior_groups', 'null'), nullif(x -> 'prior_measures', 'null'),
             (x ->> 'prior_row_count')::bigint, nullif(x -> 'delta', 'null'), nullif(x -> 'compare', 'null'), null::bigint, '{}'::jsonb,
             case when o = 1 and cardinality(v_says) > 0 then array_to_string(v_says, ' ') end
        from jsonb_array_elements(v_rows) with ordinality z(x, o)
       order by case when v_plan -> 'sort' ->> 'key' is null or v_plan -> 'sort' ->> 'key' = 'count'
                     then case when lower(coalesce(v_plan -> 'sort' ->> 'direction', 'desc')) = 'asc' then (x ->> 'row_count')::numeric else -(x ->> 'row_count')::numeric end end,
                case when lower(coalesce(v_plan -> 'sort' ->> 'direction', 'asc')) = 'desc' then null else x -> 'groups' -> (v_plan -> 'sort' ->> 'key') end,
                case when lower(coalesce(v_plan -> 'sort' ->> 'direction', 'asc')) = 'desc' then x -> 'groups' -> (v_plan -> 'sort' ->> 'key') end desc,
                o;
    return;
  end if;

  -- ── A STANDARD SOURCE ──────────────────────────────────────────────────────────────────
  if v_plan ->> 'mode' = 'definer' then
    v_plan := platform._drill_run_declared(p_organization_id, p_source ->> 'token', p_question, 'ask');
    v_rows := v_plan -> 'rows';
  else
    -- AS THE SEAT: the table's own row security decides which rows are counted.
    execute format('select coalesce(jsonb_agg(to_jsonb(x) order by x.ord), ''[]''::jsonb) from (%s) x', v_plan ->> 'sql')
      into v_rows using v_plan -> 'params';
  end if;

  -- labels of relation groups, read as the seat through the target's own row security
  for v_rel in select x from jsonb_array_elements(coalesce(v_plan -> 'relations', '[]'::jsonb)) x loop
    select array_agg(distinct g) into v_ids
      from jsonb_array_elements(v_rows) x
      cross join lateral (values (x -> 'groups' ->> (v_rel ->> 'key')), (x -> 'prior_groups' ->> (v_rel ->> 'key'))) v(g)
     where g is not null;
    continue when v_ids is null;
    begin
      execute format('select coalesce(jsonb_object_agg(x.id, x.t), ''{}''::jsonb) from (select %I::text as id, %I::text as t from %I.%I where %I %s) x',
                     v_rel ->> 'to', v_rel ->> 'title', v_rel ->> 'schema', v_rel ->> 'table', v_rel ->> 'to',
                     case when (v_rel ->> 'uuid')::boolean then '= any ($1::uuid[])' else '::text = any ($1)' end)
        into v_one using v_ids;
      v_lab := v_lab || jsonb_build_object(v_rel ->> 'key', v_one);
    exception when insufficient_privilege then
      v_says := v_says || format('The names behind %s could not be read for you, so they show as ids.', v_rel ->> 'key');
    end;
  end loop;

  -- an answer always carries its total row, even when no row passed the filter
  if not exists (select 1 from jsonb_array_elements(v_rows) x where x ->> 'kind' = 'total' and coalesce(x -> 'groups', '{}'::jsonb) = '{}'::jsonb) then
    v_rows := v_rows || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'kind', 'total', 'groups', '{}'::jsonb, 'measures', v_plan -> 'zero', 'row_count', 0,
      'prior_groups', case when v_plan -> 'compare' is not null and jsonb_typeof(v_plan -> 'compare') = 'object' then '{}'::jsonb end,
      'prior_measures', case when jsonb_typeof(v_plan -> 'compare') = 'object' then v_plan -> 'zero' end,
      'prior_row_count', case when jsonb_typeof(v_plan -> 'compare') = 'object' then 0 end,
      'compare', case when jsonb_typeof(v_plan -> 'compare') = 'object' then v_plan -> 'compare' end,
      'distinct_groups', 0)));
  end if;
  v_cap := (v_plan ->> 'cap')::integer;
  select max((x ->> 'distinct_groups')::bigint), max((x ->> 'distinct_across')::bigint) into v_n, v_na
    from jsonb_array_elements(v_rows) x;
  if v_n > v_cap then
    if coalesce((v_plan ->> 'time_first')::boolean, false) then
      v_says := v_says || format('Showing the latest %s of %s periods; the %s earlier ones are added together in Other. Ask by a coarser period or a shorter window to see them one by one.',
                                 v_cap, v_n, v_n - v_cap);
    else
      v_says := v_says || format('Showing the top %s of %s groups by %s; the other %s are added together in Other. Up to %s groups are shown at once (the setting "Groups shown before Other").',
                                 v_cap, v_n, lower(coalesce(v_plan ->> 'sort_label', 'count')), v_n - v_cap, v_cap);
    end if;
  end if;
  if v_na > (v_plan ->> 'acap')::integer then
    v_says := v_says || format('Showing %s of %s columns; the other %s are added together in one Other column (the setting "Pivot columns before Other").',
                               v_plan ->> 'acap', v_na, v_na - (v_plan ->> 'acap')::integer);
  end if;

  return query
    select x ->> 'kind', nullif(x -> 'groups', 'null'), nullif(x -> 'measures', 'null'), (x ->> 'row_count')::bigint,
           nullif(x -> 'prior_groups', 'null'), nullif(x -> 'prior_measures', 'null'), (x ->> 'prior_row_count')::bigint,
           nullif(x -> 'delta', 'null'), nullif(x -> 'compare', 'null'),
           (x ->> 'distinct_groups')::bigint,
           coalesce((select jsonb_object_agg(l.key, l.value -> (coalesce(nullif(x -> 'groups', 'null'), x -> 'prior_groups') ->> l.key))
                       from jsonb_each(v_lab) l
                      where coalesce(nullif(x -> 'groups', 'null'), x -> 'prior_groups') ? l.key
                        and l.value ? (coalesce(nullif(x -> 'groups', 'null'), x -> 'prior_groups') ->> l.key)), '{}'::jsonb),
           case when x ->> 'kind' = 'total' and coalesce(nullif(x -> 'groups', 'null'), '{}'::jsonb) = '{}'::jsonb and cardinality(v_says) > 0
                then array_to_string(v_says, ' ') end
      from jsonb_array_elements(v_rows) with ordinality z(x, o)
     order by o;
end
$function$;

create or replace function platform.drill_rows(p_organization_id uuid, p_source jsonb, p_question jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_plan  jsonb;
  v_total bigint;
  v_rows  jsonb;
  v_n     bigint;
  v_says  text[] := '{}';
  v_d     jsonb;
  v_page  jsonb;
  v_off   integer;
begin
  perform custom.assert_entity_door(p_organization_id, 'platform.drill_rows');
  v_plan := platform._drill_plan(p_organization_id, p_source, p_question, 'rows');

  if v_plan ? 'delegate' then
    -- the SAME filter custom.record_aggregate counted with (custom.record_filter_sql), as the seat
    v_d := v_plan -> 'delegate';
    v_page := custom.read_records_page(
      p_organization_id => p_organization_id, p_table_id => (p_source ->> 'id')::uuid,
      p_filter => coalesce(v_d -> 'filter', '{}'::jsonb),
      p_sort => case when v_plan -> 'sort' ->> 'key' is not null and v_plan -> 'sort' ->> 'key' <> 'count'
                     then jsonb_build_array(jsonb_build_object('field', v_plan -> 'sort' ->> 'key', 'direction', coalesce(v_plan -> 'sort' ->> 'direction', 'asc')))
                     else '[]'::jsonb end,
      p_limit => coalesce((p_question ->> 'limit')::integer, 50), p_offset => (v_plan ->> 'offset')::integer);
    v_total := (v_page ->> 'total')::bigint;
    v_off := coalesce((v_page ->> 'offset')::integer, 0);
    return v_page || jsonb_build_object('next_offset',
      case when v_off + jsonb_array_length(coalesce(v_page -> 'rows', '[]'::jsonb)) < v_total
           then v_off + jsonb_array_length(coalesce(v_page -> 'rows', '[]'::jsonb)) end);
  end if;

  -- AS THE SEAT, ALWAYS — even for a declared definer fact: "see these records" opens only rows
  -- the seat may open, and says so when the number counted more.
  execute v_plan ->> 'sql' into v_total, v_rows using v_plan -> 'params';
  if jsonb_array_length(v_rows) = 0 and (v_plan ->> 'offset')::integer > 0 then
    execute v_plan ->> 'count_sql' into v_total using v_plan -> 'params';
  end if;
  if v_plan ->> 'mode' = 'definer' then
    v_n := (platform._drill_run_declared(p_organization_id, p_source ->> 'token', p_question - 'limit' - 'offset' - 'sort' - 'columns', 'count') ->> 'total')::bigint;
    if v_n > v_total then
      v_says := v_says || format('%s of the %s counted are records you can open; the rest belong to other people in this organization.', v_total, v_n);
    end if;
  end if;
  v_off := (v_plan ->> 'offset')::integer;
  return jsonb_strip_nulls(jsonb_build_object(
    'total', v_total, 'limit', (v_plan ->> 'limit')::integer, 'offset', v_off, 'rows', v_rows,
    'next_offset', case when v_off + jsonb_array_length(v_rows) < v_total then v_off + jsonb_array_length(v_rows) end,
    'columns', v_plan -> 'def' -> 'detail' -> 'columns',
    'says', case when cardinality(v_says) > 0 then array_to_string(v_says, ' ') end));
end
$function$;

comment on function platform.drill_describe(uuid, jsonb) is
  'DRILL-STANDARD-DOOR: a source''s drill definition — its Dimensions, Measures, drill paths, first screen. A custom Table answers through custom.table_dimensions (lane DRILL-CUSTOM-PARITY); a standard table is inferred from the catalogue and the registry, or declared (*.drill.ts). SECURITY INVOKER.';
comment on function platform.drill_ask(uuid, jsonb, jsonb) is
  'DRILL-STANDARD-DOOR: the one read contract — grouped, bucketed (day..year in the organization''s calendar), compared, pivoted — for a custom Table (custom.record_aggregate, as the seat) or a standard table (SECURITY INVOKER: the table''s own row security decides every row counted). Groups past the cap fold into one Other row and the total row says so.';
comment on function platform.drill_rows(uuid, jsonb, jsonb) is
  'DRILL-STANDARD-DOOR: the records behind a number, through the SAME filter the number was counted with, as the seat (always invoker, an explicit column list).';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 11. THE SETTINGS — organizations and people decide; these are the defaults.
-- ─────────────────────────────────────────────────────────────────────────────────────────

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('drill', 'groups_per_level', '100'::jsonb, '100'::jsonb, 'integer', 'groups', 1, 1000,
   'Groups shown before Other',
   'How many groups a drill-down answer shows at each level before the rest are added together in one Other row (which the answer names, with how many it holds). Never above the page ceiling custom/page_size_ceiling.',
   'agent', 'DRILL-DOWN-DESIGN (g), lane DRILL-STANDARD-DOOR 2026-09-29: the Spend Explorer''s top-N + other shape, now the door''s contract; 100 is dense enough for an admin and small enough for a phone.',
   '{organization,user}'::text[], 'any', 'next_load', false, '{}'::jsonb),
  ('drill', 'pivot_columns', '24'::jsonb, '24'::jsonb, 'integer', 'columns', 2, 200,
   'Pivot columns before Other',
   'How many columns a pivoted drill-down answer draws before the rest are added together in one Other column.',
   'agent', 'DRILL-DOWN-DESIGN (g), lane DRILL-STANDARD-DOOR 2026-09-29: a screen-width taste.',
   '{organization,user}'::text[], 'any', 'next_load', false, '{}'::jsonb),
  ('drill', 'text_dimension_max_distinct', '200'::jsonb, '200'::jsonb, 'integer', 'values', 1, 10000,
   'Free text counted as a dimension up to this many values',
   'A free-text column of a standard table is offered as a dimension to group by only while the planner''s statistics say it holds at most this many different values; above it the column is shown in the records but not offered as a group.',
   'agent', 'DRILL-DOWN-DESIGN (g), lane DRILL-STANDARD-DOOR 2026-09-29: when free text is really a category.',
   '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 12. THE DOORS' REGISTER ROWS AND GRANTS
-- ─────────────────────────────────────────────────────────────────────────────────────────

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, non_client_lane, anonymous_callers)
values
  ('platform', 'drill_describe', 'p_organization_id uuid, p_source jsonb',
   array['uuid'::regtype, 'jsonb'::regtype]::oid[],
   'SECURITY INVOKER. p_organization_id is judged first by custom.assert_entity_door (custom.assert_client_may_reach: a member, or a portal principal, of that organization); p_source names a custom Table (answered by custom.table_dimensions, which asks its own questions) or a registry token / declared key (answered from the catalogue and the registry only). It reads no row of any table.',
   'migrations/campaign/drillstd_one_door_answers_every_table.sql (lane DRILL-STANDARD-DOOR)', true, null, false),
  ('platform', 'drill_ask', 'p_organization_id uuid, p_source jsonb, p_question jsonb',
   array['uuid'::regtype, 'jsonb'::regtype, 'jsonb'::regtype]::oid[],
   'SECURITY INVOKER. p_organization_id is judged first by custom.assert_entity_door. A standard source is counted by a statement running AS THE CALLER, so the table''s own row security decides every row counted (the answer never holds a number the caller could not assemble from rows she can open); a custom Table is answered by custom.record_aggregate, which asks its own ladder; a declared definer fact is answered by platform._drill_run_declared with its lane rule compiled in. Every value of p_question is bound, never spliced.',
   'migrations/campaign/drillstd_one_door_answers_every_table.sql (lane DRILL-STANDARD-DOOR)', true, null, false),
  ('platform', 'drill_rows', 'p_organization_id uuid, p_source jsonb, p_question jsonb',
   array['uuid'::regtype, 'jsonb'::regtype, 'jsonb'::regtype]::oid[],
   'SECURITY INVOKER. The records behind a drill number, through the same filter, read AS THE CALLER with an explicit column list (the registry''s client-excluded columns are never among them). A custom Table goes through custom.read_records_page.',
   'migrations/campaign/drillstd_one_door_answers_every_table.sql (lane DRILL-STANDARD-DOOR)', true, null, false),
  ('platform', '_drill_plan', 'p_organization_id uuid, p_source jsonb, p_question jsonb, p_kind text',
   array['uuid'::regtype, 'jsonb'::regtype, 'jsonb'::regtype, 'text'::regtype]::oid[],
   'Asks custom.assert_client_may_reach(p_organization_id) first. It returns a definition (catalogue and registry facts only) and a statement text for the invoker drill doors to run as the caller, or custom.record_aggregate''s arguments. It reads no row of anybody''s data and executes nothing it builds.',
   'migrations/campaign/drillstd_one_door_answers_every_table.sql (lane DRILL-STANDARD-DOOR)', true, null, false),
  ('platform', '_drill_run_declared', 'p_organization_id uuid, p_key text, p_question jsonb, p_kind text',
   array['uuid'::regtype, 'text'::regtype, 'jsonb'::regtype, 'text'::regtype]::oid[],
   'Asks custom.assert_client_may_reach(p_organization_id) first. It answers only a DECLARED definer definition, re-resolved by p_key and re-validated (platform.drill_definition_problems: every lane''s rule from a closed vocabulary, joins to Reference tables only), with the lane rule compiled into the statement: the person column = the caller, the organization column = p_organization_id (and, for rule admin, the caller an owner/admin of it), or the platform lane only for a platform admin inside the admin apps.',
   'migrations/campaign/drillstd_one_door_answers_every_table.sql (lane DRILL-STANDARD-DOOR)', true, null, false),
  ('platform', '_drill_resolve', 'p_organization_id uuid, p_token text',
   array['uuid'::regtype, 'text'::regtype]::oid[],
   'server_only: called only by platform._drill_plan and platform._drill_run_declared after they asked custom.assert_client_may_reach.',
   'migrations/campaign/drillstd_one_door_answers_every_table.sql (lane DRILL-STANDARD-DOOR)', false,
   'server_only: called only inside the drill doors'' own definer steps (platform._drill_plan, platform._drill_run_declared).', false),
  ('platform', '_drill_compile', 'p_organization_id uuid, p_def jsonb, p_question jsonb, p_kind text',
   array['uuid'::regtype, 'jsonb'::regtype, 'jsonb'::regtype, 'text'::regtype]::oid[],
   'server_only: takes a definition, so it is never reachable by a client; called only by platform._drill_plan and platform._drill_run_declared with a definition platform._drill_resolve built.',
   'migrations/campaign/drillstd_one_door_answers_every_table.sql (lane DRILL-STANDARD-DOOR)', false,
   'server_only: called only inside the drill doors'' own definer steps (platform._drill_plan, platform._drill_run_declared).', false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function platform.drill_describe(uuid, jsonb) to authenticated;
grant execute on function platform.drill_ask(uuid, jsonb, jsonb) to authenticated;
grant execute on function platform.drill_rows(uuid, jsonb, jsonb) to authenticated;
grant execute on function platform._drill_plan(uuid, jsonb, jsonb, text) to authenticated;
grant execute on function platform._drill_run_declared(uuid, text, jsonb, text) to authenticated;
