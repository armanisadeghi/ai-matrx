-- chair-step: this file ALTERs platform.entity_types (six ADD COLUMNs with constant defaults
-- and two CHECK constraints: a BRIEF ACCESS EXCLUSIVE lock on that table, metadata only, no
-- rewrite) and GRANTS EXECUTE to authenticated on three NEW functions
-- (custom.entity_row_write, platform.api_tables, platform.api_facts), each declared in
-- platform.client_callable_door. It replaces three live bodies (platform._drill_resolve,
-- platform._drill_compile, platform.drill_rows), seeds two knobs and sets party's API facts.
-- It revokes nothing that existed. Its inverse puts the three bodies back byte for byte.
-- lock: platform
-- based-on: platform._drill_resolve(uuid, text) 5a9327b2ba6e7011f76429fbe0b7fefb8e9de301ed894e23b20d9eb39385ff02
-- based-on: platform._drill_compile(uuid, jsonb, jsonb, text) 4dae04a05458dc3ec08a714ae1c3f8462b132467f93669d1438313edcae8173e
-- based-on: platform.drill_rows(uuid, jsonb, jsonb) ff18fab5ce3c5f83e2821854d3d12799a9019da5994be7989201c75bc0673dae
--
-- LANE 7 · STANDARD-TABLES · W3a — THE TABLE API REACHES CRM PEOPLE, AS THE PERSON.
--
-- Arman, 2026-09-29: "provide a single primitive for access to our normal tables and these
-- tables. This api/mcp system needs to be behind that same core so we never have to build it
-- twice." REST v1 and the MCP `tables` tool already call one service; this gives that service a
-- standard-table door (design: common-docs/projects/data-doctrine-adoption/v6/
-- DESIGN-STANDARD-TABLES-W3.md, revision 3, wave 3a):
--   door 1  platform._drill_resolve   every readable column gets a stable api name (its column
--                                     name, or cf:<field id> for a custom field of one of the
--                                     seat's organizations) and the registry's API facts
--   door 2  platform._drill_compile   one predicate compiler for the API's question: scope
--           platform.drill_rows       (all|mine|team|orgs|shared|public, and `any` for a read by
--                                     id), organization, whole-term search, the registry's
--                                     default list rule, archived, where on any readable column
--                                     with eq/ne/gt/gte/lt/lte/from/to/in/empty, a keyset cursor
--                                     and a count capped by table_api/exact_count_max. NO access
--                                     predicate of its own: the table's row rules decide.
--   door 4  custom.entity_row_write   one UPDATE as the person (custom values merged atomically,
--                                     registry-listed real columns only, archive/restore, the
--                                     row's own organization, no actor argument)
--   door 7  platform.entity_types     api_reach, api_reach_reason, api_writable_columns,
--                                     create_via, search_columns, default_list_where; the census
--                                     platform.api_reach_census(); party set read_write
--   door 8  platform.client_callable_door rows for the three new doors
-- A drill question that names no scope compiles exactly as before (the org/mine/platform lanes).
--
-- T-13: the retiring row column is never read; the public lane reads published_to_web.

set local lock_timeout = '3s';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- DOOR 7. THE REGISTRY SAYS HOW FAR THE TABLE API REACHES EACH STANDARD TABLE.
-- Six facts beside data_class / data_class_reason, in the same style. Each ADD COLUMN takes a
-- brief ACCESS EXCLUSIVE lock on platform.entity_types (metadata only: a constant default needs
-- no rewrite). Every default says "not reached": nothing is exposed by this ALTER alone.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- (Only when a column is missing: ADD COLUMN IF NOT EXISTS still queues for the lock.)
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_attribute
       WHERE attrelid = 'platform.entity_types'::regclass AND NOT attisdropped
         AND attname IN ('api_reach', 'api_reach_reason', 'api_writable_columns', 'create_via',
                         'search_columns', 'default_list_where')) < 6 THEN
    ALTER TABLE platform.entity_types
      ADD COLUMN IF NOT EXISTS api_reach text NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS api_reach_reason text,
      ADD COLUMN IF NOT EXISTS api_writable_columns text[] NOT NULL DEFAULT '{}'::text[],
      ADD COLUMN IF NOT EXISTS create_via text NOT NULL DEFAULT 'refuse',
      ADD COLUMN IF NOT EXISTS search_columns text[],
      ADD COLUMN IF NOT EXISTS default_list_where jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entity_types_api_reach_word') THEN
    ALTER TABLE platform.entity_types
      ADD CONSTRAINT entity_types_api_reach_word CHECK (api_reach IN ('read_write', 'read', 'none')) NOT VALID;
    ALTER TABLE platform.entity_types VALIDATE CONSTRAINT entity_types_api_reach_word;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entity_types_default_list_where_object') THEN
    ALTER TABLE platform.entity_types
      ADD CONSTRAINT entity_types_default_list_where_object CHECK (jsonb_typeof(default_list_where) = 'object') NOT VALID;
    ALTER TABLE platform.entity_types VALIDATE CONSTRAINT entity_types_default_list_where_object;
  END IF;
END $$;

COMMENT ON COLUMN platform.entity_types.api_reach IS
  'How far REST v1 and the AI Matrx MCP reach this table: read_write | read | none. Set per token after its owner reviews its triggers and services (lane 7 wave 3).';
COMMENT ON COLUMN platform.entity_types.api_writable_columns IS
  'The real columns the Table API may change on this table. Default none; governed columns and the base contract never.';
COMMENT ON COLUMN platform.entity_types.create_via IS
  'How a new row is made through the Table API: insert, refuse, or a named server door.';
COMMENT ON COLUMN platform.entity_types.search_columns IS
  'The columns the Table API''s search reads (the whole term, ORed). Null means the title column.';
COMMENT ON COLUMN platform.entity_types.default_list_where IS
  'The one copy of "hidden by default": column -> value (null = is null), applied on top of the row rules to every list, dropped by all_rows, never applied to a read by id.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE CENSUS: which tokens may be reached at all (read-only; seeding the eligible tokens is 3b).
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.api_reach_census()
 RETURNS TABLE(token text, eligible boolean, why text, api_reach text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select e.token,
         r.why is null,
         r.why,
         e.api_reach
    from platform.entity_types e
    cross join lateral (
      select case
        when not e.is_active then 'retired'
        when not e.custom_fields_enabled then 'takes no custom fields'
        when e.token in ('custom_field_definition', 'custom_entity_definition', 'flexible_data', 'udt_document') then 'retiring; lane 7 wave 4'
        when e.type <> 'entity' then e.type || ' tables are never exposed'
        when e.data_class::text not in ('organization', 'public') then e.data_class::text || ' tables are never exposed'
        when not exists (select 1 from pg_attribute a where a.attrelid = to_regclass(format('%I.%I', e.schema_name, e.table_name))
                           and a.attname = 'organization_id' and a.attnum > 0 and not a.attisdropped) then 'no organization column'
        when not has_table_privilege('authenticated', format('%I.%I', e.schema_name, e.table_name), 'select') then 'not readable by people'
        when not (e.is_listed or e.user_artifact_kind is not null) then 'not a listed table'
      end as why) r
   order by e.token;
$function$;
REVOKE ALL ON FUNCTION platform.api_reach_census() FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 3a: CRM PEOPLE. Read and write (custom values, archive and restore only — zero real columns,
-- ruling N2); a new person is made through CRM's add, which checks for duplicates; the four
-- columns the CRM list searches; merged-away and discovered people hidden by default.
-- ─────────────────────────────────────────────────────────────────────────────────────────
UPDATE platform.entity_types
   SET api_reach = 'read_write',
       api_reach_reason = 'lane 7 wave 3a: CRM people; custom values, archive and restore',
       api_writable_columns = '{}'::text[],
       create_via = 'refuse',
       search_columns = array['display_name', 'legal_name', 'primary_domain', 'job_title'],
       default_list_where = '{"canonical_id": null, "record_class": "contact"}'::jsonb
 WHERE token = 'party';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- KNOBS: the Table API's count ceiling and its statement bound (both organization-settable).
-- ─────────────────────────────────────────────────────────────────────────────────────────
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, taxonomy_node_id)
values
  ('table_api', 'exact_count_max', '10000'::jsonb, '10000'::jsonb, 'integer', 'rows', 100, 1000000,
   'Rows a table list counts exactly',
   'A list through the table API counts its matching rows exactly up to this many; past it the answer says "at least" this many, so a broad question never waits on a full count.',
   'agent', 'Agent-set limit (blind approval), lane 7 STANDARD-TABLES W3a 2026-10-02: Salesforce and Airtable stop exact counts on large sets; 10,000 keeps a count under a second on the tables measured (files.folders, 36k rows).',
   '2027-01-02', array['organization'], 'any', 'next_load', 'c5d29fbf-fd62-40dd-afd0-9cd96d4cca93'),
  ('table_api', 'statement_timeout_ms', '8000'::jsonb, '8000'::jsonb, 'integer', 'ms', 500, 60000,
   'Longest one table API question may run',
   'A table API or MCP table question that runs longer than this is stopped and answered with a sentence asking for a narrower filter. Set before the question runs, for that call only.',
   'agent', 'Agent-set limit (blind approval), lane 7 STANDARD-TABLES W3a 2026-10-02: proven on the clone that only a bound set before the call stops a slow query (design A6); 8 seconds stays inside a REST client''s usual 10-second timeout.',
   '2027-01-02', array['organization'], 'any', 'next_load', 'c5d29fbf-fd62-40dd-afd0-9cd96d4cca93')
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE STANDARD TABLES THE API REACHES, for the table list: the registry's own facts, and only
-- tables the calling seat may SELECT (custom.caller_role(), as the drill doors ask). DEFINER
-- because the registry's own row rule does not show every token to a member; it returns
-- registry facts, never table data.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.api_tables()
 RETURNS TABLE(token text, label text, description text, api_reach text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select e.token,
         -- the name a person reads, as custom.entity_table words it: the registry label, unless
         -- that label is only the type word ("Entity" on party)
         case when coalesce(nullif(e.label, ''), e.type) = e.type or lower(e.label) = lower(e.type)
              then initcap(replace(e.table_name, '_', ' ')) else e.label end,
         null::text,
         e.api_reach
    from platform.entity_types e
   where e.api_reach <> 'none'
     and e.is_active
     and has_table_privilege(custom.caller_role(), format('%I.%I', e.schema_name, e.table_name), 'select')
   order by e.token;
$function$;

INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, signed_in_callers, identity_argtypes)
SELECT 'platform', 'api_tables', '',
       'migrations/campaign/lane7w3a_the_table_api_reaches_crm_people.sql (lane 7 STANDARD-TABLES W3a)',
       'SECURITY DEFINER over platform.entity_types (whose own row rule hides tokens from members): the registry facts of the standard tables the Table API reaches and this caller may SELECT. Takes no argument and returns no table data.',
       true, array[]::oid[]
WHERE NOT EXISTS (SELECT 1 FROM platform.client_callable_door WHERE schema_name = 'platform' AND function_name = 'api_tables');

GRANT EXECUTE ON FUNCTION platform.api_tables() TO authenticated;

-- The registry's API facts for one token, for door 4 (INVOKER, so it cannot read the registry
-- row a member's row rule hides). DEFINER; registry facts only.
CREATE OR REPLACE FUNCTION platform.api_facts(p_token text)
 RETURNS TABLE(api_reach text, api_writable_columns text[], create_via text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select e.api_reach, e.api_writable_columns, e.create_via from platform.entity_types e where e.token = p_token;
$function$;

INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, signed_in_callers, identity_argtypes)
SELECT 'platform', 'api_facts', 'p_token text',
       'migrations/campaign/lane7w3a_the_table_api_reaches_crm_people.sql (lane 7 STANDARD-TABLES W3a)',
       'SECURITY DEFINER over platform.entity_types: the three Table API facts of one registry token (reach, API-writable columns, how a row is created). Registry facts only, no table data; p_token is a registry token.',
       true, array['text'::regtype]::oid[]
WHERE NOT EXISTS (SELECT 1 FROM platform.client_callable_door WHERE schema_name = 'platform' AND function_name = 'api_facts');

GRANT EXECUTE ON FUNCTION platform.api_facts(text) TO authenticated;

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
  v_rec    record;
  v_rcols  jsonb;
  v_rpk    text[];
  v_rx     jsonb;
  v_records jsonb;
  v_wm     regclass;
  -- LANE7-W3A (door 1): the API's view of an inferred table
  v_labels jsonb := '{}';
  v_reg    record;
  v_apicols jsonb := '[]';
  v_f      record;
  v_ft     text;
  v_cast   text;
  v_pub    text;
  v_has    jsonb;
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
  -- A table this seat holds no SELECT on is not described (the answer would only be a refusal) —
  -- unless it is the fact of a DECLARED definer definition: that one is read by the definer step
  -- with every lane's rule compiled in (the validator refused it otherwise), so a server-only
  -- table such as a rollup may be its fact (lane DRILL-USAGE-PAGE). Its records are still read
  -- as the seat, and platform._drill_plan refuses them in words when the seat cannot read them.
  if v_mode <> 'definer'
     and not has_table_privilege(custom.caller_role(), format('%I.%I', v_et.schema_name, v_et.table_name), 'select') then
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

  if v_decl is null or (v_decl ->> 'key' = v_fact and v_mode <> 'definer') then
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
      v_labels := v_labels || jsonb_build_object(a.col, v_label);
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
    -- a fact over several tables, or a definer definition over a System fact no client reads (its
    -- own token): nothing is inferred; the declaration says every Dimension and Measure
    if v_decl ->> 'key' <> v_fact or v_mode = 'definer' then
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
      'detail', v_decl -> 'detail', 'default', v_decl -> 'default',
      -- the definition's built-in Saved views and findings (read-only; "Save a copy" makes a person's own)
      'views', v_decl -> 'views', 'findings', v_decl -> 'findings',
      -- what a record of this definition shows (the relation itself stays the door's)
      'records', case when v_decl ? 'records' then jsonb_strip_nulls(jsonb_build_object(
                   'fact', v_decl -> 'records' ->> 'fact', 'columns', v_decl -> 'records' -> 'columns',
                   'labels', v_decl -> 'records' -> 'labels')) end));

    -- THE RECORDS RELATION (decision 14): every column the definition reads, re-read from it, so the
    -- SAME compiler, the same filter and the same lane rule serve the number and its records.
    if v_decl ? 'records' then
      select e.schema_name, e.table_name, e.token into v_rec
        from platform.entity_types e where e.token = v_decl -> 'records' ->> 'fact' and e.is_active;
      if v_rec.token is null then
        raise exception 'The records of "%" are declared in "%", which is not in the registry.', v_decl ->> 'key', v_decl -> 'records' ->> 'fact'
          using errcode = '42P17';
      end if;
      v_rcols := '{}';
      for v_from, v_col in select key, value from jsonb_each(v_cols) loop
        if v_col ->> 'alias' = 't' then
          v_rx := platform._drill_column(v_rec.schema_name, v_rec.table_name, v_col ->> 'column');
          if v_rx is null then
            raise exception 'The records relation of "%" has no column "%" (the validator names this too).', v_decl ->> 'key', v_col ->> 'column'
              using errcode = '42P17';
          end if;
          v_rcols := v_rcols || jsonb_build_object(v_from, v_rx || jsonb_build_object('alias', 't'));
        else
          v_rcols := v_rcols || jsonb_build_object(v_from, v_col);
        end if;
      end loop;
      for v_from in select x #>> '{}' from jsonb_array_elements(v_decl -> 'records' -> 'columns') x union select 'created_at' loop
        continue when v_rcols ? v_from;
        v_rx := platform._drill_column(v_rec.schema_name, v_rec.table_name, v_from);
        continue when v_rx is null or (v_rx ->> 'excluded')::boolean;
        v_rcols := v_rcols || jsonb_build_object(v_from, v_rx || jsonb_build_object('alias', 't'));
      end loop;
      select coalesce(array_agg(att.attname::text order by array_position(k.conkey, att.attnum)), '{}')
        into v_rpk
        from pg_constraint k
        join pg_attribute att on att.attrelid = k.conrelid and att.attnum = any (k.conkey)
       where k.conrelid = format('%I.%I', v_rec.schema_name, v_rec.table_name)::regclass and k.contype = 'p';
      v_records := jsonb_build_object(
        'fact', jsonb_build_object('schema', v_rec.schema_name, 'table', v_rec.table_name, 'token', v_rec.token,
                                   'pk', to_jsonb(v_rpk),
                                   'deleted', (platform._drill_column(v_rec.schema_name, v_rec.table_name, 'deleted_at') is not null)),
        'cols', v_rcols,
        'columns', v_decl -> 'records' -> 'columns');
    end if;
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

  -- ── LANE7-W3A (door 1): THE TABLE API'S COLUMNS, from the same inference ──────────────
  -- Every column this seat may read gets a stable api name: a real column is its column name,
  -- a custom field is cf:<its field id> (one field in one organization, never shared by two).
  -- The label is the column's own and never changes with scope. Custom fields are those of the
  -- seat's own organizations; each reads its value only on rows of its own organization, so two
  -- organizations' "Tier" fields are two columns and a row carries a value in at most one.
  if v_decl is null then
    select e.api_reach, e.api_reach_reason, coalesce(e.api_writable_columns, '{}'::text[]) as writable,
           e.create_via, coalesce(e.search_columns, case when e.title_column is not null then array[e.title_column] end, '{}'::text[]) as search_columns,
           coalesce(e.default_list_where, '{}'::jsonb) as default_list_where, e.custom_fields_enabled
      into v_reg from platform.entity_types e where e.token = v_fact;
    select jsonb_build_object(
             'organization_id', bool_or(att.attname = 'organization_id'),
             'created_by', bool_or(att.attname = 'created_by'),
             'published_to_web', bool_or(att.attname = 'published_to_web'),
             'deleted_at', bool_or(att.attname = 'deleted_at'),
             'version', bool_or(att.attname = 'version'),
             'custom_fields', bool_or(att.attname = 'custom_fields'))
      into v_has
      from pg_attribute att
     where att.attrelid = format('%I.%I', v_et.schema_name, v_et.table_name)::regclass
       and att.attnum > 0 and not att.attisdropped;
    for a in
      select att.attname::text as col
        from pg_attribute att
       where att.attrelid = format('%I.%I', v_et.schema_name, v_et.table_name)::regclass
         and att.attnum > 0 and not att.attisdropped
       order by att.attnum
    loop
      continue when not v_cols ? a.col;
      v_col := v_cols -> a.col;
      v_pub := case when v_col ? 'fk' then 'relation'
                    when v_col ->> 'cat' = 'bool' then 'checkbox'
                    when v_col ->> 'cat' = 'number' then 'number'
                    when v_col ->> 'cat' = 'enum' then 'choice'
                    when v_col ->> 'cat' = 'time' then case when v_col ->> 'type' = 'date' then 'date' else 'datetime' end
                    else 'text' end;
      v_apicols := v_apicols || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'api_name', a.col, 'name', coalesce(v_labels ->> a.col, a.col), 'type', v_pub,
        'writable', (a.col = any (v_reg.writable))
                    and has_column_privilege(custom.caller_role(), format('%I.%I', v_et.schema_name, v_et.table_name), a.col, 'update'),
        'indexed', exists (select 1 from pg_index i
                            where i.indrelid = format('%I.%I', v_et.schema_name, v_et.table_name)::regclass
                              and i.indkey[0] = (select att.attnum from pg_attribute att
                                                  where att.attrelid = i.indrelid and att.attname = a.col)),
        'choices', (select jsonb_agg(x ->> 'value') from jsonb_array_elements(
                      (select y -> 'choices' from jsonb_array_elements(v_dims) y where y ->> 'key' = a.col)) x))));
    end loop;
    if coalesce(v_reg.custom_fields_enabled, false) and coalesce((v_has ->> 'custom_fields')::boolean, false)
       and coalesce((v_has ->> 'organization_id')::boolean, false) then
      for v_f in
        select f.id, f.organization_id, f.data
          from custom.record f
         where f.table_id = custom.field_kernel_id()
           and f.deleted_at is null
           and f.data ->> 'table_token' = v_fact
           and f.organization_id in (select iam.my_orgs())
         order by coalesce((f.data ->> 'sort')::numeric, 100), f.data ->> 'label', f.id
      loop
        v_ft := coalesce(v_f.data ->> 'type', 'text');
        v_cast := case when coalesce((v_f.data ->> 'multi')::boolean, false) then 'jsonb'
                       when v_ft = 'number' then 'numeric'
                       when v_ft = 'boolean' then 'boolean'
                       else 'text' end;
        v_pub := case when v_cast = 'jsonb' then 'choices' when v_ft = 'list' then 'choice'
                      when v_ft = 'boolean' then 'checkbox' when v_ft = 'number' then 'number'
                      when v_ft = 'text' and coalesce(v_f.data ->> 'format', v_f.data -> 'config' ->> 'kind') in ('date', 'datetime', 'time', 'email', 'url', 'phone')
                        then v_f.data ->> 'format'
                      else v_ft end;
        v_cols := v_cols || jsonb_build_object('cf:' || v_f.id, jsonb_build_object(
          'alias', 't', 'column', null, 'custom', true, 'organization_id', v_f.organization_id,
          'key', v_f.data ->> 'key', 'type', v_cast,
          'cat', case v_cast when 'numeric' then 'number' when 'boolean' then 'bool' when 'text' then 'text' else 'other' end,
          'expr', format('(case when t.organization_id = %L::uuid then (t.custom_fields %s %L)%s end)',
                         v_f.organization_id, case when v_cast = 'jsonb' then '->' else '->>' end, v_f.data ->> 'key',
                         case when v_cast in ('jsonb', 'text') then '' else '::' || v_cast end)));
        v_apicols := v_apicols || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'api_name', 'cf:' || v_f.id, 'name', coalesce(v_f.data ->> 'label', v_f.data ->> 'key'), 'type', v_pub,
          'organization_id', v_f.organization_id, 'custom', true, 'key', v_f.data ->> 'key',
          'writable', v_reg.api_reach = 'read_write', 'indexed', false,
          'required', case when (v_f.data ->> 'required')::boolean then true end,
          'unit', v_f.data ->> 'unit')));
      end loop;
    end if;
    v_def := v_def || jsonb_build_object('api', jsonb_strip_nulls(jsonb_build_object(
      'reach', coalesce(v_reg.api_reach, 'none'), 'reach_reason', v_reg.api_reach_reason,
      'writable_columns', to_jsonb(v_reg.writable), 'create_via', coalesce(v_reg.create_via, 'refuse'),
      'search_columns', to_jsonb(v_reg.search_columns),
      'has', v_has, 'columns', v_apicols))
      -- (kept whole: a fact whose value is null means "is null" and must not be stripped)
      || jsonb_build_object('default_list_where', v_reg.default_list_where));
  end if;

  -- how far a definer fact has counted: <schema>.<table>_watermark (covered_to), when it keeps one
  if v_mode = 'definer' then
    v_wm := to_regclass(format('%I.%I', v_et.schema_name, v_et.table_name || '_watermark'));
  end if;

  return v_def || jsonb_build_object(
    'source', jsonb_build_object('kind', 'entity', 'token', coalesce(v_decl ->> 'key', v_fact)),
    'mode', v_mode,
    'stale_after_knob', v_decl -> 'stale_after_knob',
    '_c', jsonb_build_object(
      'fact', jsonb_build_object('schema', v_et.schema_name, 'table', v_et.table_name, 'token', v_et.token,
                                 'pk', to_jsonb(v_pk), 'title', v_et.title_column, 'rls', v_rls,
                                 'deleted', (platform._drill_column(v_et.schema_name, v_et.table_name, 'deleted_at') is not null)),
      'joins', v_joins,
      'cols', v_cols,
      'lane_cols', v_lcols,
      'lane_rules', coalesce(v_decl -> 'lane_rules', '{}'))
      || case when v_records is not null then jsonb_build_object('records', v_records) else '{}'::jsonb end
      || case when v_wm is not null then jsonb_build_object('watermark', v_wm::text) else '{}'::jsonb end)
    || case when cardinality(v_nostats) > 0 then jsonb_build_object('says', jsonb_build_array(format(
         '%s text column%s (%s) %s no statistics yet, so %s not offered as a dimension; the next routine analysis of the table decides.',
         cardinality(v_nostats), case when cardinality(v_nostats) = 1 then '' else 's' end, array_to_string(v_nostats, ', '),
         case when cardinality(v_nostats) = 1 then 'has' else 'have' end,
         case when cardinality(v_nostats) = 1 then 'it is' else 'they are' end))) else '{}'::jsonb end;
end
$function$;

CREATE OR REPLACE FUNCTION platform._drill_compile(p_organization_id uuid, p_def jsonb, p_question jsonb, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  v_fact   jsonb;                        -- the relation read: the fact, or the records relation
  v_records boolean := false;           -- the records of a definer definition, read by the definer step
  v_asof   timestamptz;
  v_parts  jsonb;
  v_part   jsonb;
  v_j      integer;
  v_hv     jsonb := '[]'::jsonb;         -- the thresholds' numbers, bound
  v_hsel   text[] := '{}';               -- per-group values the thresholds read (bg)
  v_hok    text[] := '{}';               -- the thresholds, as predicates (bh)
  v_hmed   text[] := '{}';               -- the medians they compare with (bm)
  v_hsays  text[] := '{}';
  v_page   text;
  v_sum    text[];
  v_k      jsonb := '[]'::jsonb;         -- bound constants of the Measures (percentile p, scales, per) — $1->'k'
  v_mp     jsonb;                        -- a Measure's plan (platform._drill_measure_plan)
  v_flt    jsonb;                        -- a Measure's own filter (platform._drill_measure_filter)
  v_leaf   jsonb;
  v_leaves jsonb;
  v_cs     jsonb;
  v_val    text;
  v_rate_ws text;                        -- the window's length (seconds) beside each row, for a run rate
  -- LANE7-W3A (door 2): the Table API's question over a standard table
  v_api    boolean := false;             -- a question that names a scope is the API's list
  v_api_d  jsonb;                        -- the definition's api block (door 1)
  v_has    jsonb;
  v_scope  text;
  v_dlw    jsonb;
  v_dlw_p  text[] := '{}';               -- the default list rule, one predicate per fact
  v_dlw_w  text[] := '{}';               -- and the words a row off the default list is shown with
  v_term   text;
  v_obj    text;
  v_sx     text;                         -- the sort expression the cursor walks
  v_sdesc  boolean := false;
  v_cmax   integer;
  v_chunks text[];
begin
  -- the columns this definition may read: key -> {alias, column, type, cat, fk?}
  v_cols := coalesce(v_c -> 'cols', '{}'::jsonb);
  v_fact := v_c -> 'fact';
  -- THE RECORDS OF A DEFINER DEFINITION (decision 14): the same question, the same lane rule and the
  -- same filter, read from the declared records relation, whose columns carry the fact's names.
  if p_kind = 'rows' and v_mode = 'definer' and v_c ? 'records' then
    v_records := true;
    v_cols := v_c -> 'records' -> 'cols';
    v_fact := v_c -> 'records' -> 'fact';
  end if;

  for k in select jsonb_object_keys(q) loop
    if not (k = any (array['by','across','show','where','window','compare','sort','limit','offset','lane','path','columns','having','scope','organization','search','all_rows','archived','cursor'])) then
      raise exception '"%" is not part of a question.', k
        using errcode = '22023', hint = 'A question has: by, across, show, where, window, compare, sort, limit, lane, having (and for records: offset, columns).';
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

  v_api := q ? 'scope';
  v_api_d := coalesce(p_def -> 'api', '{}'::jsonb);
  v_has := coalesce(v_api_d -> 'has', '{}'::jsonb);
  if not v_api and (q ? 'organization' or q ? 'search' or q ? 'all_rows' or q ? 'archived' or q ? 'cursor') then
    raise exception 'organization, search, all_rows, archived and cursor are asked together with a scope.' using errcode = '22023',
      hint = 'Add "scope": "all" (or mine, team, orgs, shared, public).';
  end if;
  if v_api then
    -- ── THE SCOPE (lane 7, the Table API): the row rules decide what she can read; a scope is
    -- a filter she chose on top of them, never a copy of them. No access predicate of our own.
    if v_mode = 'definer' or not (p_def ? 'api') then
      raise exception '"%" is asked in its lanes, not by scope.', p_def ->> 'label' using errcode = '22023';
    end if;
    if v_me is null then
      raise exception 'Listing by scope needs a signed-in person.' using errcode = '42501';
    end if;
    v_lane := 'scope';
    v_scope := lower(coalesce(nullif(btrim(q ->> 'scope'), ''), 'all'));
    v_params := v_params || jsonb_build_object('org', p_organization_id, 'me', v_me, 'tok', v_fact ->> 'token');
    if v_scope in ('mine', 'team', 'shared') and not coalesce((v_has ->> 'created_by')::boolean, false) then
      raise exception '% has no column that says who added each one, so it has no "%" list.', p_def ->> 'label', v_scope using errcode = '22023';
    end if;
    if v_scope in ('orgs', 'shared', 'team') and not coalesce((v_has ->> 'organization_id')::boolean, false) then
      raise exception '% does not belong to organizations, so it has no "%" list.', p_def ->> 'label', v_scope using errcode = '22023';
    end if;
    if v_scope = 'public' and not coalesce((v_has ->> 'published_to_web')::boolean, false) then
      raise exception '% has no public records, so it has no "public" list.', p_def ->> 'label' using errcode = '22023';
    end if;
    if v_scope = 'all' then
      -- the canonical All: Mine, My team, My Orgs and Shared — never rows reachable only by being public
      if coalesce((v_has ->> 'published_to_web')::boolean, false) then
        v_preds := v_preds || format('(not coalesce(t.published_to_web, false)%s%s or t.%I in (select p.resource_id from iam.permissions p where p.resource_type = ($1->>''tok'') and p.granted_to_user_id = ($1->>''me'')::uuid and p.status <> ''rejected'' and (p.expires_at is null or p.expires_at > now())))',
          case when (v_has ->> 'created_by')::boolean then ' or t.created_by = ($1->>''me'')::uuid' else '' end,
          case when (v_has ->> 'organization_id')::boolean then ' or t.organization_id in (select iam.my_orgs())' else '' end,
          v_fact -> 'pk' ->> 0);
      end if;
    elsif v_scope = 'mine' then
      v_preds := v_preds || 't.created_by = ($1->>''me'')::uuid'::text;
    elsif v_scope = 'team' then
      v_preds := v_preds || 't.created_by in (select r.user_id from iam.my_team_reach() r where r.organization_id = t.organization_id)'::text;
    elsif v_scope = 'orgs' then
      v_preds := v_preds || 't.organization_id in (select iam.my_orgs())'::text;
    elsif v_scope = 'shared' then
      v_preds := v_preds || format('(t.created_by is distinct from ($1->>''me'')::uuid and (t.organization_id is null or t.organization_id not in (select iam.my_orgs()))%s)',
        case when (v_has ->> 'published_to_web')::boolean then ' and not coalesce(t.published_to_web, false)' else '' end);
    elsif v_scope = 'public' then
      v_preds := v_preds || 'coalesce(t.published_to_web, false)'::text;
    elsif v_scope = 'any' then
      null;   -- reading by id: exactly what her row rules let her open, with no list defaults
    else
      raise exception '"%" is not a scope.', q ->> 'scope' using errcode = '22023',
        hint = 'A list is scoped all, mine, team, orgs, shared or public.';
    end if;
    -- one organization, when she names one; every organization she can read otherwise
    if jsonb_typeof(q -> 'organization') = 'string' then
      if not coalesce((v_has ->> 'organization_id')::boolean, false) then
        raise exception '% does not belong to organizations, so it cannot be narrowed to one.', p_def ->> 'label' using errcode = '22023';
      end if;
      begin
        v_params := v_params || jsonb_build_object('orgf', (q ->> 'organization')::uuid);
      exception when others then
        raise exception '"%" is not an organization id.', q ->> 'organization' using errcode = '22023';
      end;
      v_preds := v_preds || 't.organization_id = ($1->>''orgf'')::uuid'::text;
    end if;
  else
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
  end if;   -- (the lanes; a scoped question took the branch above)
  if v_api then
    -- archived rows: off the list unless asked for; refused in words where nothing is archived
    v_x := lower(coalesce(nullif(q ->> 'archived', ''), case when v_scope = 'any' then 'include' else 'exclude' end));
    if v_x not in ('exclude', 'include', 'only') then
      raise exception 'archived is exclude, include or only.' using errcode = '22023';
    end if;
    if v_x = 'only' and not (v_fact ->> 'deleted')::boolean then
      raise exception '% are never archived, so there is no archived list.', p_def ->> 'label' using errcode = '22023';
    end if;
    if (v_fact ->> 'deleted')::boolean then
      if v_x = 'exclude' then v_preds := v_preds || 't.deleted_at is null'::text;
      elsif v_x = 'only' then v_preds := v_preds || 't.deleted_at is not null'::text;
      end if;
    end if;
    -- THE DEFAULT LIST (the registry's one copy of "hidden by default"), dropped by all_rows and
    -- never applied to a read by id. Each fact also says, on a row it hides, why it is off the list.
    v_dlw := coalesce(v_api_d -> 'default_list_where', '{}'::jsonb);
    for k, e in select key, value from jsonb_each(v_dlw) loop
      v_x := case when jsonb_typeof(e) = 'null' then format('t.%I is null', k)
                  else format('t.%I::text = %L', k, e #>> '{}') end;
      v_dlw_p := v_dlw_p || v_x;
      v_dlw_w := v_dlw_w || format('case when not coalesce(%s, false) then %L end', v_x,
                                   k || case when jsonb_typeof(e) = 'null' then ' is set' else ' is not ' || (e #>> '{}') end);
    end loop;
    if not coalesce((q ->> 'all_rows')::boolean, false) and v_scope <> 'any' then
      v_preds := v_preds || v_dlw_p;
    end if;
    -- SEARCH: the whole term, as the app searches it — one ilike, ORed across the registry's
    -- search columns, the term bound and its % and _ escaped. Never split into words.
    v_term := nullif(btrim(coalesce(q ->> 'search', '')), '');
    if v_term is not null then
      if jsonb_array_length(coalesce(v_api_d -> 'search_columns', '[]')) = 0 then
        raise exception '% has no columns to search.', p_def ->> 'label' using errcode = '22023';
      end if;
      v_params := v_params || jsonb_build_object('s', '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%');
      v_preds := v_preds || ('(' || (select string_agg(format('t.%I::text ilike ($1->>''s'')', x #>> '{}'), ' or ')
                                       from jsonb_array_elements(v_api_d -> 'search_columns') x) || ')');
    end if;
    -- a read by id, or a where on any column this seat may read: the key is a column too
    if jsonb_array_length(v_fact -> 'pk') = 1 and not v_cols ? (v_fact -> 'pk' ->> 0) then
      v_cols := v_cols || jsonb_build_object(v_fact -> 'pk' ->> 0,
        jsonb_build_object('alias', 't', 'column', v_fact -> 'pk' ->> 0, 'type', 'uuid', 'cat', 'uuid'));
    end if;
  elsif (v_fact ->> 'deleted')::boolean then
    v_preds := v_preds || 't.deleted_at is null'::text;
  end if;

  -- ── THE CALENDAR (only when a time is cut) ───────────────────────────────────────────────
  v_cal := custom.agg_calendar(p_organization_id);
  v_tz := v_cal ->> 'time_zone';
  v_ws := v_cal ->> 'week_start';
  v_shift := (8 - coalesce(array_position(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'], v_ws), 1)) % 7;
  v_params := v_params || jsonb_build_object('tz', v_tz);

  -- ── FROM: the fact and its star ──────────────────────────────────────────────────────────
  v_from := format('%I.%I t', v_fact ->> 'schema', v_fact ->> 'table');
  for e in select x from jsonb_array_elements(coalesce(v_c -> 'joins', '[]'::jsonb)) x loop
    v_from := v_from || format(' left join %I.%I %I on %I.%I = %I.%I',
                               e ->> 'schema', e ->> 'table', e ->> 'alias',
                               e ->> 'alias', e ->> 'to', e ->> 'on_alias', e ->> 'on_column');
  end loop;

  -- ── WHERE: every value bound, cast to the column's own type ──────────────────────────────
  for k, e in select key, value from jsonb_each(coalesce(q -> 'where', '{}'::jsonb)) loop
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = k);
    if d is null and v_cols ? k then
      -- LANE7-W3A: a where on any column this seat may read, not only on a Dimension
      d := jsonb_build_object('key', k, 'from', k, 'kind', 'column',
             'label', coalesce((select x ->> 'name' from jsonb_array_elements(coalesce(v_api_d -> 'columns', '[]')) x where x ->> 'api_name' = k), k));
    end if;
    if d is null then
      d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = split_part(k, ':', 1));
    end if;
    if d is null then
      raise exception 'There is no dimension "%" to filter by.', k using errcode = '22023',
        hint = format('Dimensions: %s.', (select string_agg(x ->> 'key', ', ') from jsonb_array_elements(p_def -> 'dimensions') x));
    end if;
    v_col := v_cols -> (d ->> 'from');
    v_ref := coalesce(v_col ->> 'expr', format('%I.%I', v_col ->> 'alias', v_col ->> 'column'));
    if position(':' in k) > 0 and d ->> 'kind' <> 'column' then
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
    elsif jsonb_typeof(e) = 'object' and exists (select 1 from jsonb_object_keys(e) x where x not in ('from', 'to')) then
      -- LANE7-W3A: the one wire grammar's comparisons (eq ne gt gte lt lte from to in empty),
      -- every one of which must hold; each value bound and cast to the column's own type
      if exists (select 1 from jsonb_object_keys(e) x where x not in ('eq','ne','gt','gte','lt','lte','from','to','in','empty')) then
        raise exception 'A filter on % says eq, ne, gt, gte, lt, lte, from, to, in or empty.', d ->> 'label' using errcode = '22023';
      end if;
      for v_x, m in select key, value from jsonb_each(e) loop
        v_i := jsonb_array_length(v_w);
        if v_x = 'empty' then
          if jsonb_typeof(m) <> 'boolean' then
            raise exception '"empty" on % is true or false.', d ->> 'label' using errcode = '22023';
          end if;
          v_preds := v_preds || format('%s is %snull', v_ref, case when (m #>> '{}')::boolean then '' else 'not ' end);
        elsif v_x = 'in' then
          if jsonb_typeof(m) <> 'array' or jsonb_array_length(m) = 0 then
            raise exception '"in" on % takes a list of values.', d ->> 'label' using errcode = '22023';
          end if;
          perform platform._drill_assert_values(m, v_col ->> 'type', d ->> 'label');
          v_w := v_w || jsonb_build_array(m);
          v_preds := v_preds || format('%1$s = any ((select array_agg(x) from jsonb_array_elements_text($1->''w''->%2$s) x)::%3$s[])', v_ref, v_i, v_col ->> 'type');
        else
          perform platform._drill_assert_values(jsonb_build_array(m), v_col ->> 'type', d ->> 'label');
          if jsonb_typeof(m) = 'null' then
            raise exception '"%" on % takes a value.', v_x, d ->> 'label' using errcode = '22023';
          end if;
          v_w := v_w || jsonb_build_array(m);
          v_preds := v_preds || format('%s %s ($1->''w''->>%s)::%s', v_ref,
            case v_x when 'eq' then '=' when 'ne' then 'is distinct from' when 'gt' then '>' when 'gte' then '>='
                     when 'lt' then '<' when 'lte' then '<=' when 'from' then '>=' else '<' end, v_i, v_col ->> 'type');
        end if;
      end loop;
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
    if v_api then
      -- ── THE TABLE API'S PAGE (lane 7): every column she may read, keyed by api name; the
      -- registry's default list said on each row it hides; a keyset cursor; a capped count.
      if jsonb_array_length(v_fact -> 'pk') <> 1 then
        raise exception '% has no single key, so its rows are not listed through the API.', p_def ->> 'label' using errcode = '0A000';
      end if;
      v_cap := custom.page_size(p_organization_id, 'platform.drill_rows', (q ->> 'limit')::integer, 50);
      v_cmax := greatest(1, coalesce((platform.knob_resolve('table_api', 'exact_count_max', p_organization_id, v_me) #>> '{}')::integer, 10000));
      v_rows_cols := array[format('''id'', t.%I', v_fact -> 'pk' ->> 0)];
      for k in select x ->> 'api_name' from jsonb_array_elements(coalesce(v_api_d -> 'columns', '[]')) x
                where q -> 'columns' is null or q ->> 'columns' = 'all'
                   or (jsonb_typeof(q -> 'columns') = 'array' and q -> 'columns' ? (x ->> 'api_name')) loop
        v_col := v_cols -> k;
        continue when v_col is null;
        v_rows_cols := v_rows_cols || format('%L, %s', k, coalesce(v_col ->> 'expr', format('%I.%I', v_col ->> 'alias', v_col ->> 'column')));
      end loop;
      v_rows_cols := v_rows_cols || format('''_state'', jsonb_strip_nulls(jsonb_build_object(''archived'', %s, ''hidden_by_default'', %s))',
        case when (v_fact ->> 'deleted')::boolean then 'case when t.deleted_at is not null then true end' else 'null::boolean' end,
        case when cardinality(v_dlw_w) > 0 then format('nullif(to_jsonb(array_remove(array[%s]::text[], null)), ''[]''::jsonb)', array_to_string(v_dlw_w, ', ')) else 'null::jsonb' end);
      -- order: the asked column (or the newest first), then the key, so a cursor never skips a row
      v_sx := null;
      if q ? 'sort' then
        k := q -> 'sort' ->> 'key';
        v_col := v_cols -> k;
        if v_col is null then
          raise exception 'These records cannot be sorted by "%".', coalesce(k, '') using errcode = '22023';
        end if;
        v_sx := coalesce(v_col ->> 'expr', format('%I.%I', v_col ->> 'alias', v_col ->> 'column'));
        v_sdesc := lower(coalesce(q -> 'sort' ->> 'direction', 'asc')) = 'desc';
        v_x := v_col ->> 'type';
      elsif v_cols ? 'created_at' then
        v_sx := 't.created_at';
        v_sdesc := true;
        v_x := v_cols -> 'created_at' ->> 'type';
      end if;
      v_order := concat_ws(', ', case when v_sx is not null then format('%s %s nulls last', v_sx, case when v_sdesc then 'desc' else 'asc' end) end,
                           format('t.%I', v_fact -> 'pk' ->> 0));
      v_rows_cols := v_rows_cols || format('''_k'', jsonb_build_array(%s, t.%I)', coalesce(v_sx, 'null'), v_fact -> 'pk' ->> 0);
      v_page := '';
      if jsonb_typeof(q -> 'cursor') = 'object' then
        v_params := v_params || jsonb_build_object('cur', q -> 'cursor');
        if v_sx is null then
          v_page := format(' and t.%I > ($1->''cur''->>''id'')::uuid', v_fact -> 'pk' ->> 0);
        elsif jsonb_typeof(q -> 'cursor' -> 'v') = 'null' or not (q -> 'cursor' ? 'v') then
          v_page := format(' and (%1$s is null and t.%2$I > ($1->''cur''->>''id'')::uuid)', v_sx, v_fact -> 'pk' ->> 0);
        else
          v_page := format(' and ((%1$s %3$s ($1->''cur''->>''v'')::%4$s) or (%1$s = ($1->''cur''->>''v'')::%4$s and t.%2$I > ($1->''cur''->>''id'')::uuid) or %1$s is null)',
                           v_sx, v_fact -> 'pk' ->> 0, case when v_sdesc then '<' else '>' end, v_x);
        end if;
      elsif q ? 'cursor' and jsonb_typeof(q -> 'cursor') <> 'null' then
        raise exception 'A cursor is the one the previous page returned.' using errcode = '22023';
      end if;
      v_params := v_params || jsonb_build_object('w', v_w, 'limit', v_cap, 'cmax', v_cmax,
                                                 'offset', case when q ? 'cursor' then 0 else greatest(0, coalesce((q ->> 'offset')::integer, 0)) end);
      -- jsonb_build_object takes at most 100 arguments: a wide table is built in pieces
      select array_agg(format('jsonb_build_object(%s)', s.part) order by s.g) into v_chunks
        from (select (n - 1) / 40 as g, string_agg(x, ', ' order by n) as part
                from unnest(v_rows_cols) with ordinality u(x, n) group by (n - 1) / 40) s;
      v_obj := array_to_string(v_chunks, ' || ');
      return jsonb_build_object(
        'sql', format($q$select (select count(*) from (select 1 from %2$s where %3$s limit ($1->>'cmax')::integer + 1) c)::bigint as total, coalesce((select jsonb_agg(y.r order by y.n) from (select %1$s as r, row_number() over (order by %4$s) as n from %2$s where %3$s%5$s order by %4$s limit ($1->>'limit')::integer offset ($1->>'offset')::integer) y), '[]'::jsonb) as rows$q$,
                      v_obj, v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true'), v_order, v_page),
        'count_sql', format('select count(*)::bigint from %s where %s', v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true')),
        'params', v_params, 'lane', v_lane, 'scope', v_scope, 'limit', v_cap, 'offset', v_params -> 'offset',
        'count_max', v_cmax, 'api', true);
    end if;
    if v_records then
      -- a definer fact's records are listed for a window, and never past what its number counted
      if not (v_params ? 'wf') then
        raise exception 'The records behind "%" are listed for a window: give it a start (from), or a preset such as 30d.', p_def ->> 'label'
          using errcode = '22023', hint = 'Every usage number is asked for a window; its records are asked for the same one.';
      end if;
      if v_c ? 'watermark' then
        execute format('select max(covered_to) from %s', v_c ->> 'watermark') into v_asof;
        if v_asof is null then
          raise exception 'The summary behind "%" has not been counted yet, so its records are not listed.', p_def ->> 'label'
            using errcode = '0A000', hint = 'Recount it; the records are listed up to the moment the summary counted through.';
        end if;
        v_col := v_cols -> 'created_at';
        v_params := v_params || jsonb_build_object('asof', v_asof);
        v_preds := v_preds || format('%I.%I < ($1->>''asof'')::timestamptz', v_col ->> 'alias', v_col ->> 'column');
      end if;
      if q ? 'columns' and exists (select 1 from jsonb_array_elements(q -> 'columns') x
                                    where not (v_c -> 'records' -> 'columns') ? coalesce(x ->> 'from', x #>> '{}')) then
        raise exception 'A record of "%" shows only its declared columns: %.', p_def ->> 'label',
          (select string_agg(x #>> '{}', ', ') from jsonb_array_elements(v_c -> 'records' -> 'columns') x)
          using errcode = '22023';
      end if;
    end if;
    v_cap := custom.page_size(p_organization_id, 'platform.drill_rows', (q ->> 'limit')::integer, 50);
    if coalesce((q ->> 'offset')::integer, 0) < 0 then
      raise exception 'An offset is 0 or more.' using errcode = '22023';
    end if;
    v_params := v_params || jsonb_build_object('limit', v_cap, 'offset', coalesce((q ->> 'offset')::integer, 0));
    v_rows_cols := '{}';
    -- (an invoker definition's declared records are its own rows, read as the seat: its record
    -- columns are the default, lane DRILL-GAPS)
    for k in select coalesce(x ->> 'from', x #>> '{}') from jsonb_array_elements(
               coalesce(q -> 'columns', case when v_records then v_c -> 'records' -> 'columns' end,
                        case when not v_records and v_mode = 'invoker' then p_def -> 'records' -> 'columns' end,
                        p_def -> 'detail' -> 'columns', '[]'::jsonb)) x loop
      -- a detail column is a column key, or a dimension's key
      v_x := coalesce((select y ->> 'from' from jsonb_array_elements(p_def -> 'dimensions') y where y ->> 'key' = k), k);
      v_col := v_cols -> v_x;
      if v_col is null then
        raise exception 'There is no column "%" these records can show.', k using errcode = '22023';
      end if;
      v_rows_cols := v_rows_cols || format('%L, %I.%I', k, v_col ->> 'alias', v_col ->> 'column');
    end loop;
    if jsonb_array_length(v_fact -> 'pk') = 1 then
      v_rows_cols := array[format('''id'', t.%I', v_fact -> 'pk' ->> 0)] || v_rows_cols;
    elsif jsonb_array_length(v_fact -> 'pk') > 1 then
      v_rows_cols := array[format('''id'', jsonb_build_object(%s)',
                     (select string_agg(format('%L, t.%I', x #>> '{}', x #>> '{}'), ', ') from jsonb_array_elements(v_fact -> 'pk') x))] || v_rows_cols;
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
      -- (records of a definer fact: newest first in the order the relation's own index reads, so a
      -- page reads only the latest rows)
      select format(case when v_records then '%I.%I desc' else '%I.%I desc nulls last' end,
                    v_cols -> (x ->> 'from') ->> 'alias', v_cols -> (x ->> 'from') ->> 'column')
        into v_order from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'kind' = 'time' limit 1;
    end if;
    v_order := concat_ws(', ', nullif(v_order, ''),
                 (select string_agg(format('t.%I', x #>> '{}'), ', ') from jsonb_array_elements(v_fact -> 'pk') x));
    if v_records and jsonb_array_length(v_fact -> 'pk') = 0 then
      -- a view has no key: its record columns, in their declared order, make the order total
      v_order := concat_ws(', ', nullif(v_order, ''),
                   (select string_agg(format('%I.%I desc', v_cols -> (x #>> '{}') ->> 'alias', v_cols -> (x #>> '{}') ->> 'column'), ', ' order by o)
                      from jsonb_array_elements(v_c -> 'records' -> 'columns') with ordinality z(x, o)));
    end if;
    v_sql := format($q$select count(*) over () as total, jsonb_build_object(%s) as r from %s where %s order by %s limit ($1->>'limit')::integer offset ($1->>'offset')::integer$q$,
                    array_to_string(v_rows_cols, ', '), v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true'),
                    coalesce(nullif(v_order, ''), '1'));
    if v_records then
      -- one page, without counting the whole window for it (the total is count_sql's), and the
      -- window's sums of every Measure that adds up, over the SAME filter (the seat guard's sum)
      v_page := format($q$select coalesce(jsonb_agg(y.r), '[]'::jsonb) from (select jsonb_build_object(%s) as r from %s where %s order by %s limit ($1->>'limit')::integer offset ($1->>'offset')::integer) y$q$,
                       array_to_string(v_rows_cols, ', '), v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true'),
                       coalesce(nullif(v_order, ''), '1'));
      v_sum := '{}';
      for m in select x from jsonb_array_elements(p_def -> 'measures') x loop
        continue when not ((m ->> 'op' in ('count', 'sum') and coalesce((m ->> 'additive')::boolean, true)
                            and (m ->> 'op' = 'count' or v_cols ? (m ->> 'of')))
                           or m ->> 'op' in ('ratio', 'sum_of'));
        -- every leaf (a sum or a count, narrowed by its own where) over the records' own columns, the
        -- ratio's template around them, its constants bound (lane DRILL-GAPS)
        v_mp := platform._drill_measure_plan(p_def, m ->> 'key');
        v_x := v_mp ->> 'tpl';
        for v_j in reverse jsonb_array_length(v_mp -> 'leaves') - 1 .. 0 loop
          v_leaf := v_mp -> 'leaves' -> v_j;
          v_flt := platform._drill_measure_filter(p_def, v_cols, v_leaf -> 'where', jsonb_array_length(v_w));
          if v_flt is not null then v_w := v_w || (v_flt -> 'w'); end if;
          v_val := case when v_leaf ->> 'op' = 'count' then case when v_flt is not null then format('count(case when %s then 1 end)', v_flt ->> 'sql') else 'count(*)' end
                        else format('sum(%s)', case when v_flt is not null
                                                    then format('case when %s then %I.%I end', v_flt ->> 'sql', v_cols -> (v_leaf ->> 'of') ->> 'alias', v_cols -> (v_leaf ->> 'of') ->> 'column')
                                                    else format('%I.%I', v_cols -> (v_leaf ->> 'of') ->> 'alias', v_cols -> (v_leaf ->> 'of') ->> 'column') end) end;
          v_x := replace(v_x, format('@L%s@', v_j), v_val);
        end loop;
        for v_j in reverse jsonb_array_length(v_mp -> 'consts') - 1 .. 0 loop
          v_x := replace(v_x, format('@C%s@', v_j), format('($1->''k''->>%s)::numeric', jsonb_array_length(v_k)));
          v_k := v_k || jsonb_build_array(v_mp -> 'consts' -> v_j);
        end loop;
        v_sum := v_sum || format('%L, %s', m ->> 'key', v_x);
      end loop;
      v_params := v_params || jsonb_build_object('w', v_w, 'k', v_k);
      return jsonb_build_object(
        'page_sql', v_page,
        'sum_sql', format('select jsonb_build_object(%s) from %s where %s',
                          coalesce(nullif(array_to_string(v_sum, ', '), ''), '''count'', count(*)'), v_from,
                          coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true')),
        'count_sql', format('select count(*)::bigint from %s where %s', v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true')),
        'params', v_params, 'lane', v_lane, 'limit', v_cap, 'offset', v_params -> 'offset', 'as_of', v_asof,
        'columns', coalesce(q -> 'columns', v_c -> 'records' -> 'columns'));
    end if;
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
    if m ->> 'op' in ('ratio', 'sum_of') then
      -- (lane DRILL-PARITY-LAST: a sum_of is the same template with one side, and adds up)
      -- a ratio of this definition's own Measures (validated: each part a sum or a count, narrowed
      -- by its own where, or another ratio; lists added up; a scale multiplies) — lane DRILL-GAPS
      v_mp := platform._drill_measure_plan(p_def, m ->> 'key');
      v_leaves := '[]'::jsonb;
      for v_j in 0 .. jsonb_array_length(v_mp -> 'leaves') - 1 loop
        v_leaf := v_mp -> 'leaves' -> v_j;
        v_flt := platform._drill_measure_filter(p_def, v_cols, v_leaf -> 'where', jsonb_array_length(v_w));
        if v_flt is not null then v_w := v_w || (v_flt -> 'w'); end if;
        v_val := case when v_leaf ->> 'op' = 'count' then case when v_flt is not null then format('case when %s then 1 end', v_flt ->> 'sql') end
                      when v_flt is not null then format('case when %s then %I.%I end', v_flt ->> 'sql', v_cols -> (v_leaf ->> 'of') ->> 'alias', v_cols -> (v_leaf ->> 'of') ->> 'column')
                      else format('%I.%I', v_cols -> (v_leaf ->> 'of') ->> 'alias', v_cols -> (v_leaf ->> 'of') ->> 'column') end;
        v_leaves := v_leaves || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'op', case when v_leaf ->> 'op' = 'count' and v_flt is not null then 'filled' else v_leaf ->> 'op' end,
          'expr', v_val)));
      end loop;
      v_cs := '[]'::jsonb;
      for v_j in 0 .. jsonb_array_length(v_mp -> 'consts') - 1 loop
        v_cs := v_cs || to_jsonb(format('($1->''k''->>%s)::numeric', jsonb_array_length(v_k)));
        v_k := v_k || jsonb_build_array(v_mp -> 'consts' -> v_j);
      end loop;
      v_show := v_show || jsonb_build_array(jsonb_build_object(
        'key', m ->> 'key', 'op', 'ratio', 'adds', m ->> 'op' = 'sum_of', 'cat', 'number', 'tpl', v_mp ->> 'tpl', 'leaves', v_leaves, 'consts_sql', v_cs));
      continue;
    end if;
    -- a Measure narrowed by its own where reads its column only on the rows that pass (a count
    -- counts them); percentile's p and a run rate's per × scale are bound constants (lane DRILL-GAPS)
    v_flt := platform._drill_measure_filter(p_def, v_cols, m -> 'where', jsonb_array_length(v_w));
    if v_flt is not null then v_w := v_w || (v_flt -> 'w'); end if;
    if m ->> 'op' = 'rate' and v_rate_ws is null then
      if not (v_params ? 'wf') then
        raise exception '"%" is a run rate, counted over a window with a start: give the question a window (a preset such as 30d, or from).',
          coalesce(m ->> 'label', m ->> 'key') using errcode = '22023';
      end if;
      -- the window's length: the part of it that has happened (a window reaching past now is not
      -- counted as time that passed); a comparison's prior window is its whole length
      v_params := v_params || jsonb_build_object(
        'wsw', extract(epoch from least(coalesce((v_params ->> 'wt')::timestamptz, now()), now()) - (v_params ->> 'wf')::timestamptz),
        'wsp', case when v_params ? 'pf' then extract(epoch from (v_params ->> 'pt')::timestamptz - (v_params ->> 'pf')::timestamptz) end);
      v_rate_ws := case when v_cmp is not null then '(case sd.side when ''w'' then ($1->>''wsw'') else ($1->>''wsp'') end)::numeric'
                        else '($1->>''wsw'')::numeric' end;
    end if;
    v_show := v_show || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'key', m ->> 'key', 'op', case when m ->> 'op' = 'count' and v_flt is not null then 'filled' else m ->> 'op' end,
      'of', m ->> 'of', 'at_grain', m ->> 'at_grain',
      'cat', coalesce(v_cols -> (m ->> 'of') ->> 'cat', case when m ->> 'op' = 'count' then 'number' end),
      'expr', case when m ->> 'op' = 'count' then case when v_flt is not null then format('case when %s then 1 end', v_flt ->> 'sql') end
                   when v_flt is not null then format('case when %s then %I.%I end', v_flt ->> 'sql', v_cols -> (m ->> 'of') ->> 'alias', v_cols -> (m ->> 'of') ->> 'column') end,
      'p_sql', case when m ->> 'op' = 'percentile' then format('($1->''k''->>%s)::float8', jsonb_array_length(v_k)) end,
      'per_sql', case when m ->> 'op' = 'rate' then format('($1->''k''->>%s)::numeric', jsonb_array_length(v_k)) end)));
    if m ->> 'op' = 'percentile' then
      v_k := v_k || jsonb_build_array(m -> 'p');
    elsif m ->> 'op' = 'rate' then
      v_k := v_k || to_jsonb(case m ->> 'per' when 'month' then 2592000 else 86400 end * coalesce((m ->> 'scale')::numeric, 1));
    end if;
  end loop;
  v_params := v_params || jsonb_build_object('w', v_w, 'k', v_k);
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
    if m ->> 'op' = 'ratio' then
      -- each leaf once, as m<i>_<n> (its own where already folded into its expression)
      for v_j in 0 .. jsonb_array_length(m -> 'leaves') - 1 loop
        if m -> 'leaves' -> v_j ? 'expr' then
          v_sel := v_sel || format('%s as m%s_%s', m -> 'leaves' -> v_j ->> 'expr', v_i, v_j);
        end if;
      end loop;
      continue;
    end if;
    if m ? 'expr' then
      v_sel := v_sel || format('%s as m%s', m ->> 'expr', v_i);
    elsif m ->> 'op' <> 'count' then
      v_col := v_cols -> (m ->> 'of');
      v_sel := v_sel || format('%I.%I as m%s', v_col ->> 'alias', v_col ->> 'column', v_i);
    end if;
    if m ->> 'op' = 'rate' then
      v_sel := v_sel || format('%s as m%s_ws', v_rate_ws, v_i);
    end if;
    if m ? 'at_grain' then
      v_col := v_cols -> (m ->> 'at_grain');
      v_sel := v_sel || format('%I.%I as g%s', v_col ->> 'alias', v_col ->> 'column', v_i);
    end if;
  end loop;

  -- the sort's own aggregate over src (the ranking of groups)
  if v_sort ? 'measure' then
    v_i := (select o from jsonb_array_elements(v_show) with ordinality z(y, o) where y ->> 'key' = v_sort ->> 'measure');
    v_rank_expr := case when v_show -> (v_i - 1) ->> 'op' = 'ratio'
                     then platform._drill_ratio_sql(v_show -> (v_i - 1), 's.m' || v_i, case when v_cmp is not null then 's.side = ''w''' end)
                     else platform._drill_agg_sql(v_show -> (v_i - 1), 's.m' || v_i, null,
                            case when v_cmp is not null then 's.side = ''w''' end) end;
  end if;

  -- ── HAVING: thresholds on the groups (decision 25), judged on the current window and applied
  --    BEFORE the cut into Other: a group that misses one is added into Other with the groups past
  --    the cap, so the answer still adds up to its total and says how many groups met the rule.
  if q ? 'having' and jsonb_typeof(q -> 'having') <> 'null' then
    if jsonb_typeof(q -> 'having') <> 'array' then
      raise exception 'having is a list of thresholds.' using errcode = '22023';
    end if;
    if jsonb_array_length(q -> 'having') > 0 and not v_has_by then
      raise exception 'A threshold is on groups, so the question must group by something.' using errcode = '22023';
    end if;
    v_j := 0;
    for e in select x from jsonb_array_elements(q -> 'having') x loop
      v_j := v_j + 1;
      v_i := (select o from jsonb_array_elements(v_show) with ordinality z(y, o) where y ->> 'key' = e ->> 'measure');
      if v_i is null then
        raise exception 'A threshold''s measure "%" must also be shown.', coalesce(e ->> 'measure', '') using errcode = '22023';
      end if;
      m := v_show -> (v_i - 1);
      if m ? 'at_grain' then
        raise exception 'A threshold cannot read "%", which is counted once per %.', m ->> 'key', m ->> 'at_grain' using errcode = '22023';
      end if;
      -- (lane DRILL-PARITY-LAST) a moment (the latest activity) is not a number a line can be drawn on
      if m ->> 'cat' = 'time' then
        raise exception 'A threshold is a number; "%" is a moment.', m ->> 'key' using errcode = '22023';
      end if;
      if coalesce(e ->> 'op', '') not in ('>=', '>', '<=', '<') then
        raise exception 'A threshold''s op is ">=", ">", "<=" or "<".' using errcode = '22023';
      end if;
      if (case when e ? 'value' then 1 else 0 end) + (case when e ? 'share_of_total' then 1 else 0 end) + (case when e ? 'times_median' then 1 else 0 end) <> 1 then
        raise exception 'A threshold has exactly one of value, share_of_total and times_median.' using errcode = '22023';
      end if;
      -- the line: a setting when the threshold names one (organizations decide), else its own number
      begin
        v_x := case when e ? 'knob' then platform.drill_knob(p_organization_id, e ->> 'knob')::text
                    else coalesce(e ->> 'value', e ->> 'share_of_total', e ->> 'times_median') end;
        perform v_x::numeric;
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'A threshold''s line is a number.' using errcode = '22023';
      end;
      v_hv := v_hv || to_jsonb(v_x::numeric);
      v_hsel := v_hsel || format('%s as hv%s',
        case when m ->> 'op' = 'ratio' then platform._drill_ratio_sql(m, 's.m' || v_i, 's.side = ''w''')
             else platform._drill_agg_sql(m, 's.m' || v_i, null, 's.side = ''w''') end, v_j);
      if e ? 'share_of_total' then
        if not coalesce((m ->> 'adds')::boolean, false)
           and (not (m ->> 'op' in ('sum', 'count')) or not coalesce(((select y from jsonb_array_elements(p_def -> 'measures') y where y ->> 'key' = m ->> 'key') ->> 'additive')::boolean, m ->> 'op' in ('sum', 'count'))) then
          raise exception 'A share of the total needs a measure that adds up across groups; "%" does not.', m ->> 'key' using errcode = '22023';
        end if;
        v_hok := v_hok || format('bg.hv%1$s %2$s ($1->''hv''->>%3$s)::numeric / 100 * sum(bg.hv%1$s) over ()', v_j, e ->> 'op', v_j - 1);
        v_hsays := v_hsays || format('%s %s %s%% of the total', lower(coalesce((select y ->> 'label' from jsonb_array_elements(p_def -> 'measures') y where y ->> 'key' = m ->> 'key'), m ->> 'key')),
                                     case e ->> 'op' when '>=' then 'at least' when '>' then 'more than' when '<=' then 'at most' else 'less than' end, trim_scale(v_x::numeric));
      elsif e ? 'times_median' then
        v_hmed := v_hmed || format('percentile_cont(0.5) within group (order by hv%1$s) filter (where hv%1$s is not null%2$s) as md%1$s',
                                   v_j, case when coalesce((e ->> 'median_nonzero')::boolean, false) then format(' and hv%s > 0', v_j) else '' end);
        v_hok := v_hok || format('bg.hv%1$s %2$s ($1->''hv''->>%3$s)::numeric * bm.md%1$s', v_j, e ->> 'op', v_j - 1);
        v_hsays := v_hsays || format('%s %s %s × the median group%s', lower(coalesce((select y ->> 'label' from jsonb_array_elements(p_def -> 'measures') y where y ->> 'key' = m ->> 'key'), m ->> 'key')),
                                     case e ->> 'op' when '>=' then 'at least' when '>' then 'more than' when '<=' then 'at most' else 'less than' end, trim_scale(v_x::numeric),
                                     case when coalesce((e ->> 'median_nonzero')::boolean, false) then ' above zero' else '' end);
      else
        v_hok := v_hok || format('bg.hv%1$s %2$s ($1->''hv''->>%3$s)::numeric', v_j, e ->> 'op', v_j - 1);
        v_hsays := v_hsays || format('%s %s %s', lower(coalesce((select y ->> 'label' from jsonb_array_elements(p_def -> 'measures') y where y ->> 'key' = m ->> 'key'), m ->> 'key')),
                                     case e ->> 'op' when '>=' then 'at least' when '>' then 'more than' when '<=' then 'at most' else 'less than' end, trim_scale(v_x::numeric));
      end if;
    end loop;
    v_params := v_params || jsonb_build_object('hv', v_hv);
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
  v_sql := v_sql || format(', bg as (select s.gk0 as gk, %s as sv, count(*) filter (where s.side = ''w'') as c, count(*) as c_all%s from s2 s group by s.gk0)',
             case when v_sort ? 'measure' then v_rank_expr else 'null::numeric' end,
             case when cardinality(v_hsel) > 0 then ', ' || array_to_string(v_hsel, ', ') else '' end);
  -- bh: which groups meet every threshold (all of them when the question names none)
  if cardinality(v_hmed) > 0 then
    v_sql := v_sql || format(', bm as (select %s from bg)', array_to_string(v_hmed, ', '));
  end if;
  v_sql := v_sql || format(', bh as (select bg.*, %s as ok from bg%s)',
             case when cardinality(v_hok) > 0 then format('(bg.c > 0 and coalesce(%s, false))', array_to_string(v_hok, ' and ')) else 'true' end,
             case when cardinality(v_hmed) > 0 then ' cross join bm' else '' end);
  v_sql := v_sql || format(', br as (select gk, ok, row_number() over (order by (not ok), %s, gk) as rn, count(*) filter (where c > 0 and ok) over () as n, count(*) filter (where c > 0) over () as n_all from bh)',
             case when v_sort ? 'measure' then format('sv %s nulls last, c desc, c_all desc', v_rank_dir)
                  else format('(gk->%s) %s nulls last', v_sort ->> 'by', v_rank_dir) end);
  if v_has_ax then
    v_sql := v_sql || ', ag as (select s.av0 as av, count(*) filter (where s.side = ''w'') as c, count(*) as c_all from s2 s group by s.av0)';
    v_sql := v_sql || format(', ar as (select av, row_number() over (order by %s, c desc, c_all desc, av) as arn, count(*) filter (where c > 0) over () as n from ag)',
               case when v_ax ? 'grain' then 'av asc' else 'c desc' end);
  end if;
  -- tg: fold every group past the cap into Other, every across value past its cap into one column
  v_sql := v_sql || format(', tg as (select s.*, br.rn, case when br.rn <= ($1->>''cap'')::integer and br.ok then br.gk end as gk, (br.rn > ($1->>''cap'')::integer or not br.ok) as is_other%s from s2 s join br on br.gk = s.gk0%s)',
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
    elsif m ->> 'op' = 'ratio' then
      v_x := platform._drill_ratio_sql(m, 'm' || v_i, null);
    else
      v_x := platform._drill_agg_sql(m, 'm' || v_i, null);
    end if;
    v_meas := v_meas || format('%L, (%s)', m ->> 'key', v_x);
    v_zero := v_zero || jsonb_build_object(m ->> 'key',
                case when m ->> 'op' in ('count', 'count_distinct', 'filled', 'empty') or coalesce((m ->> 'adds')::boolean, false) then to_jsonb(0) else 'null'::jsonb end);
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
        (select max(n) from br)::bigint as distinct_groups, %s as distinct_across, (select max(n_all) from br)::bigint as distinct_all
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
             (select max(n) from br)::bigint as distinct_groups, %s as distinct_across, (select max(n_all) from br)::bigint as distinct_all
        from j Y$q$,
      replace(v_grp, 'X.', 'c.'), replace(v_grp, 'X.', 'p.'),
      replace(replace(array_to_string(v_delta, ', '), 'c.measures', 'coalesce(c.measures, $1->''zero'')'), 'p.measures', 'coalesce(p.measures, $1->''zero'')'),
      coalesce((select format('coalesce(c.gk, p.gk)->%s', o - 1) from jsonb_array_elements(v_by) with ordinality z(y, o) where y ? 'grain' limit 1), 'null'),
      v_order,
      case when v_has_ax then '(select max(n) from ar)::bigint' else 'null::bigint' end);
  end if;

  -- relation dimensions of this answer: their targets, so labels are read as the seat
  for e in select x from jsonb_array_elements(v_by || coalesce(jsonb_build_array(v_ax), '[]')) x loop
    continue when e is null or e -> 'dim' ->> 'kind' <> 'relation';
    if not (e -> 'col' ? 'fk') and e -> 'dim' -> 'relation' ->> 'token' is not null then
      -- a column with no foreign key (a view's) names its target by the Dimension's declared
      -- relation token: the registry's table, its one-column key and its title (lane DRILL-GAPS).
      -- The words are still read as the seat, through the target's own row security (drill_ask).
      select jsonb_build_object('schema', et.schema_name, 'table', et.table_name, 'title', et.title_column,
                                'to', (select att.attname::text from pg_constraint pk
                                         join pg_attribute att on att.attrelid = pk.conrelid and att.attnum = pk.conkey[1]
                                        where pk.conrelid = format('%I.%I', et.schema_name, et.table_name)::regclass
                                          and pk.contype = 'p' and cardinality(pk.conkey) = 1))
        into v_part
        from platform.entity_types et
       where et.token = e -> 'dim' -> 'relation' ->> 'token' and et.is_active and et.title_column is not null
         and et.type not in ('restricted', 'deprecated') and et.data_class::text <> 'confidential';
      continue when v_part is null or (v_part ->> 'to') is null;
      e := jsonb_set(e, '{col,fk}', v_part);
    end if;
    continue when not (e -> 'col' ? 'fk');
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
    'compare', v_cmp,
    'having_says', case when cardinality(v_hsays) > 0 then array_to_string(v_hsays, ' and ') end);
end
$function$;

CREATE OR REPLACE FUNCTION platform.drill_rows(p_organization_id uuid, p_source jsonb, p_question jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
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

  -- THE RECORDS OF A DEFINER DEFINITION (decision 14): its declared records relation, read by the
  -- definer step with the SAME filter compiler and the SAME lane rule the number was counted with,
  -- for a window, cut at the number's as_of.
  if coalesce((v_plan ->> 'records')::boolean, false) then
    return platform._drill_run_declared(p_organization_id, p_source ->> 'token', p_question, 'rows');
  end if;

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
           then v_off + jsonb_array_length(coalesce(v_page -> 'rows', '[]'::jsonb)) end, 'as_of', null);
  end if;

  -- AS THE SEAT, ALWAYS — even for a declared definer fact: "see these records" opens only rows
  -- the seat may open, and says so when the number counted more.
  execute v_plan ->> 'sql' into v_total, v_rows using v_plan -> 'params';
  if coalesce((v_plan ->> 'api')::boolean, false) then
    -- LANE7-W3A: the Table API's page. The count is exact up to the knob table_api/exact_count_max
    -- and "at least" past it; the next cursor is the last row's sort value and key.
    return jsonb_strip_nulls(jsonb_build_object(
      'total', least(v_total, (v_plan ->> 'count_max')::bigint),
      'estimated', case when v_total > (v_plan ->> 'count_max')::bigint then true end,
      'limit', (v_plan ->> 'limit')::integer, 'offset', (v_plan ->> 'offset')::integer,
      'rows', v_rows, 'scope', v_plan ->> 'scope',
      'next_cursor', case when jsonb_array_length(v_rows) >= (v_plan ->> 'limit')::integer
                          then jsonb_build_object('v', v_rows -> -1 -> '_k' -> 0, 'id', v_rows -> -1 -> '_k' -> 1) end,
      'columns', v_plan -> 'def' -> 'api' -> 'columns'));
  end if;
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
    'says', case when cardinality(v_says) > 0 then array_to_string(v_says, ' ') end))
    || jsonb_build_object('as_of', null);   -- read live from the table: no summary moment
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- DOOR 4. ONE WRITE DOOR FOR A STANDARD ROW, AS THE PERSON. SECURITY INVOKER: one UPDATE that
-- the table's own update policy, governance guard and custom-field guard all judge.
--   · the row's organization is the row's own; a call that names another is refused;
--   · real columns only where the registry lists them (api_writable_columns; party: none);
--   · custom values merged atomically inside the UPDATE (two writers to two keys keep both);
--   · archive / restore set deleted_at; the table's own rule decides who may;
--   · no actor argument: who wrote it comes from the session (the guard stamps it), and any
--     _actor / _on_behalf_of a caller put in the values is dropped before the UPDATE.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.entity_row_write(
  p_organization_id uuid, p_token text, p_record_id uuid,
  p_columns jsonb DEFAULT '{}'::jsonb, p_custom jsonb DEFAULT '{}'::jsonb,
  p_expected_version integer DEFAULT NULL, p_archive boolean DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  t        record;
  v_reg    record;
  v_row    jsonb;
  v_org    uuid;
  v_sets   text[] := '{}';
  v_args   jsonb := '[]'::jsonb;
  v_key    text;
  v_clear  text[] := '{}';
  v_patch  jsonb := '{}'::jsonb;
  v_n      int;
  v_where  text;
  v_has_ver boolean;
  v_cols   jsonb := coalesce(p_columns, '{}'::jsonb);
  v_custom jsonb := coalesce(p_custom, '{}'::jsonb);
begin
  perform custom.assert_entity_door(p_organization_id, 'custom.entity_row_write');
  select * into t from custom.entity_table(p_token);
  perform custom.assert_entity_is_organization_scoped(t.token, t.label, t.has_organization);
  select f.api_reach, f.api_writable_columns, f.create_via into v_reg from platform.api_facts(p_token) f;

  if coalesce(v_reg.api_reach, 'none') <> 'read_write' then
    raise exception '% records cannot be changed through the API yet.', t.label
      using errcode = '42501', hint = 'Change them in AI Matrx.';
  end if;
  if jsonb_typeof(v_cols) <> 'object' or jsonb_typeof(v_custom) <> 'object' then
    raise exception 'A write names its columns and values as {"name": value}.' using errcode = '22023';
  end if;
  if p_record_id is null then
    if coalesce(v_reg.create_via, 'refuse') <> 'insert' then
      raise exception 'New % records are added in AI Matrx, which checks for duplicates.', t.label
        using errcode = '0A000', hint = 'This API changes records that already exist.';
    end if;
    raise exception 'New % records are not created through this API yet.', t.label using errcode = '0A000';
  end if;

  -- the row, as she may read it: its own organization, never one a caller supplies
  execute format('select to_jsonb(x) - ''custom_fields'' from %I.%I x where x.id = $1', t.schema_name, t.table_name)
    into v_row using p_record_id;
  if v_row is null then
    raise exception 'There is no % you can open with that id.', t.label using errcode = '02000';
  end if;
  v_org := (v_row ->> 'organization_id')::uuid;
  if v_org is distinct from p_organization_id then
    raise exception 'This % belongs to another organization, not to the one this call names.', t.label
      using errcode = '42501', hint = 'Name the organization the record belongs to.';
  end if;

  -- real columns: only the ones the registry lists for the API
  for v_key in select k from jsonb_object_keys(v_cols) k loop
    if not (v_key = any (coalesce(v_reg.api_writable_columns, '{}'::text[]))) then
      raise exception '"%" cannot be changed through the API.', v_key
        using errcode = '42501', hint = 'Change it in AI Matrx. Nothing was written.';
    end if;
    v_sets := v_sets || format('%I = ($2->>%s)::%s', v_key, jsonb_array_length(v_args),
                               (select format_type(a.atttypid, a.atttypmod) from pg_attribute a
                                 where a.attrelid = format('%I.%I', t.schema_name, t.table_name)::regclass and a.attname = v_key));
    v_args := v_args || jsonb_build_array(v_cols -> v_key);
  end loop;

  -- custom values: a key set to null clears it (and its envelope); the author is the session's
  for v_key in select k from jsonb_object_keys(v_custom) k loop
    continue when left(v_key, 1) = '_';
    if jsonb_typeof(v_custom -> v_key) = 'null' then
      v_clear := v_clear || v_key;
    else
      v_patch := v_patch || jsonb_build_object(v_key, v_custom -> v_key);
    end if;
  end loop;
  if cardinality(v_clear) > 0 or v_patch <> '{}'::jsonb then
    v_sets := v_sets || ('custom_fields = (case when cardinality($3::text[]) > 0 then jsonb_set(coalesce(case when jsonb_typeof(custom_fields) = ''object'' then custom_fields end, ''{}''::jsonb) - $3::text[], ''{_values}'', coalesce(custom_fields -> ''_values'', ''{}''::jsonb) - $3::text[]) '
                         || 'else coalesce(case when jsonb_typeof(custom_fields) = ''object'' then custom_fields end, ''{}''::jsonb) end) || $4');
  end if;

  if p_archive is not null then
    if not t.has_deleted_at then
      raise exception '% records are never archived.', t.label using errcode = '0A000';
    end if;
    v_sets := v_sets || case when p_archive then 'deleted_at = coalesce(deleted_at, now())' else 'deleted_at = null' end;
  end if;
  if cardinality(v_sets) = 0 then
    raise exception 'Send at least one value to change.' using errcode = '22023';
  end if;

  v_has_ver := v_row ? 'version';
  v_where := 'x.id = $1';
  if p_expected_version is not null then
    if not v_has_ver then
      raise exception '% records carry no version, so expected_version cannot be checked.', t.label using errcode = '22023';
    end if;
    v_where := v_where || ' and x.version = $5';
  end if;
  execute format('update %I.%I x set %s where %s', t.schema_name, t.table_name, array_to_string(v_sets, ', '), v_where)
    using p_record_id, v_args, v_clear, v_patch, p_expected_version;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    if p_expected_version is not null and (v_row ->> 'version')::integer is distinct from p_expected_version then
      raise exception 'Someone changed this % since you read it (it is at version %, and you sent %). Nothing was written.',
        t.label, v_row ->> 'version', p_expected_version
        using errcode = 'PT409', hint = 'Read it again, then send your change with the new version.';
    end if;
    raise exception 'You can see this %, but it is not yours to change.', t.label
      using errcode = '42501', hint = 'It takes edit access, or a share of this record with you. Nothing was written.';
  end if;
  return jsonb_build_object('id', p_record_id, 'organization_id', v_org, 'token', t.token);
end
$function$;
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, signed_in_callers, identity_argtypes)
SELECT 'custom', 'entity_row_write',
       'p_organization_id uuid, p_token text, p_record_id uuid, p_columns jsonb, p_custom jsonb, p_expected_version integer, p_archive boolean',
       'migrations/campaign/lane7w3a_the_table_api_reaches_crm_people.sql (lane 7 STANDARD-TABLES W3a)',
       'SECURITY INVOKER: one UPDATE as the caller, so the standard table''s own update policy, governance guard and custom-field guard decide; a row the caller may not change writes zero rows and is refused by name. p_organization_id is checked by custom.assert_client_may_reach and must be the row''s own; NULL is refused by name. Real columns only from platform.entity_types.api_writable_columns. No actor argument.',
       true,
       array['uuid'::regtype, 'text'::regtype, 'uuid'::regtype, 'jsonb'::regtype, 'jsonb'::regtype, 'integer'::regtype, 'boolean'::regtype]::oid[]
WHERE NOT EXISTS (SELECT 1 FROM platform.client_callable_door WHERE schema_name = 'custom' AND function_name = 'entity_row_write');

GRANT EXECUTE ON FUNCTION custom.entity_row_write(uuid, text, uuid, jsonb, jsonb, integer, boolean) TO authenticated;
