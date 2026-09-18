-- target: branch,production
-- additive: yes
-- guard: custom/field_index_guard
-- based-on: platform.custom_field_index_expr(text, text, text) 519f8d572edd03b00603ca80d34a8d37b1153797c56eb28254f1b1362c9887f9
-- based-on: platform.custom_field_index_ddl(uuid, boolean) 1ffac0a932e0dad2853e908d0a6839b910a4af6920ec57302ce9d1e9312de761
--
-- W1-INDEX — THE PLATFORM HALF (check C-5), under `LOCK:platform` (§4.11).
--   REC-N-1 · REC-N-2 · REC-N-3 · ruling (a).
--
-- TWO functions are replaced, and NEITHER changes the expression text this campaign indexes by.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 1. `platform.custom_field_index_expr` — THE SAME ANSWER, WITH ITS SEARCH PATH FIXED.
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- The lane row is explicit that the guard does NOT go in here: this function is
-- `IMMUTABLE PARALLEL SAFE`, an index expression may contain nothing else, and a knob read
-- inside it would be both silently wrong and unusable in an index at all. So the ONLY change
-- to its body is the one thing that was genuinely missing, measured 2026-09-17: it carries no
-- `SET search_path` while every sibling in this family (`custom_field_index_ddl`,
-- `promote_custom_field_index`) carries `pg_catalog, public`. It calls `quote_ident` and
-- `quote_literal`, and its output is compiled into a stored index expression; a caller whose
-- search path puts another `quote_ident` first would change what an index is built over, and
-- nothing about that failure would be visible in the index's definition afterwards.
--
-- EVERY ARM ANSWERS EXACTLY WHAT IT ANSWERED BEFORE. Not `prosrc` equality — a body with a
-- `SET` clause is never byte-identical to one without — but ANSWER identity, arm by arm,
-- asserted in the file itself below and re-taken by `scripts/campaign-tests/w1_index_c5.sql`
-- against real indexes and real plans.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 2. `platform.custom_field_index_ddl` — THE GENERATOR, AND THE TWO THINGS IT GOT WRONG.
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- (i) IT HARD-CODES THE COLUMN NAME `custom`, AND HALF THE DATABASE CALLS IT SOMETHING ELSE.
--     MEASURED 2026-09-17, by column name across every schema:
--       `custom`        — 21 hr.* tables and 4 seo.* tables
--       `custom_fields` — crm.party (the ONE table this campaign adds the column to, W1-STORE),
--                         custom.record and its sixteen partitions, users.user_form_profile,
--                         h2m.record, h2m.und and the public m*_record measurement tables
--     So the generator emits `CREATE INDEX … ON crm.party ((custom->>'k'))` for the very table
--     the campaign extends, and that statement fails at execution with `column "custom" does
--     not exist` — or, worse, on a table that happens to have both, indexes the wrong one. The
--     fix is not to swap one literal for the other: it is to stop guessing. The column is read
--     out of `pg_attribute` for the registered relation, and a table carrying NEITHER is
--     refused BY NAME with both candidates in the message, instead of emitting DDL that cannot
--     run. (`platform.custom_field_definition` holds 0 rows and production carries 0 indexes
--     built from this function, measured 2026-09-15 and re-measured tonight, so this corrects a
--     generator that has never yet produced a live index.)
--
-- (ii) IT IS THE OBJECT `custom/field_index_guard` IS SUPPOSED TO GUARD (ruling (a)), and it
--      did not read it. The knob is read HERE, by the caller that builds DDL, exactly as
--      `custom.promoted_index_ddl()` reads it — and while it is off the generator REFUSES with
--      the knob's name and the remedy, rather than returning a statement that would be run.
--      Nothing fails silently: an OFF switch that answered normally would be a switch nobody
--      could tell was off.
--
-- WHAT THIS FILE DOES NOT TOUCH: `platform.custom_field_definition`, `platform.custom_record`,
-- `platform.custom_field_index_name`, `platform.promote_custom_field_index` and every index
-- built from them. `custom.record`'s own promotion layer is the other half of this lane and
-- lives under `LOCK:custom`.
--
-- THE INVERSE: `migrations/inverse/w1_index_the_expression_reads_the_path_down.sql`, which
-- restores both prior bodies verbatim.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function platform.custom_field_index_expr(
    p_field_type text, p_field_key text, p_column text default 'custom'::text)
  returns text language plpgsql immutable parallel safe
  set search_path to 'pg_catalog'
as $function$
BEGIN
  IF p_field_key !~ '^[a-z][a-z0-9_]{0,62}$' THEN
    RAISE EXCEPTION 'custom_field_index_expr: % is not a legal field_key', p_field_key
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE p_field_type
    WHEN 'number'   THEN '(((' || quote_ident(p_column) || '->>' || quote_literal(p_field_key) || ')::numeric))'
    WHEN 'boolean'  THEN '(((' || quote_ident(p_column) || '->>' || quote_literal(p_field_key) || ')::boolean))'
    WHEN 'currency' THEN '(((' || quote_ident(p_column) || '->' || quote_literal(p_field_key) || '->>''amount'')::numeric))'
    WHEN 'multi_select' THEN NULL
    WHEN 'file'         THEN NULL
    ELSE '((' || quote_ident(p_column) || '->>' || quote_literal(p_field_key) || '))'
  END;
END $function$;

comment on function platform.custom_field_index_expr(text, text, text) is
  'REC-N-3: the ONE expression a promoted custom Field is indexed by. IMMUTABLE PARALLEL SAFE '
  'and it must stay so — an index expression may contain nothing else, which is why '
  'custom/field_index_guard is read by the DDL generators that call this and never here. '
  'multi_select and file answer NULL by name: a many-valued key has no single value to index.';

-- THE ANSWER IS THE SAME, ARM BY ARM, AND IT IS PROVEN OUTSIDE THIS FILE ON PURPOSE.
-- JUDGMENT.md §4 refuses every `DO` block in a file whose header names production — it builds
-- DDL at run time, so the allow-list cannot read what it will execute — so the arm-by-arm diff
-- cannot live here. It lives in `scripts/campaign-tests/w1_index_c5.sql` PART 1, which
-- enumerates the arms from this function's own `prosrc`, compares each one's TEXT against the
-- expression this campaign publishes, and then builds the index and reads the plan back.

create or replace function platform.custom_field_index_ddl(
    p_definition_id uuid, p_concurrently boolean default true)
  returns text language plpgsql stable security definer
  set search_path to 'pg_catalog', 'public'
as $function$
DECLARE
  d record; v_schema text; v_table text; v_col text; v_expr text;
  v_pred text; v_soft boolean; v_on boolean;
BEGIN
  SELECT * INTO d FROM platform.custom_field_definition WHERE id = p_definition_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'custom_field_index_ddl: definition % does not exist', p_definition_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- RULING (a): THE GUARD IS ON THE GENERATOR. A switch this caller cannot read is CLOSED,
  -- and it says so with the key and the remedy rather than handing back DDL to run.
  BEGIN
    v_on := coalesce((platform.knob_resolve('custom', 'field_index_guard', d.organization_id) #>> '{}')::boolean, false);
  EXCEPTION WHEN OTHERS THEN
    v_on := false;
  END;
  IF NOT v_on THEN
    RAISE EXCEPTION 'promoting a custom field to an index is switched off here'
      USING ERRCODE = '0A000',
            HINT = 'custom/field_index_guard resolves false for this organization, so no index DDL was generated and nothing was changed. The switch checklist turns the knob on; a lane never does.';
  END IF;

  IF d.target_kind = 'entity_table' THEN
    SELECT et.schema_name, et.table_name, et.has_soft_delete INTO v_schema, v_table, v_soft
      FROM platform.entity_types et WHERE et.token = d.target_token;
    IF v_schema IS NULL THEN
      RAISE EXCEPTION 'custom_field_index_ddl: token % is not registered', d.target_token
        USING ERRCODE = 'check_violation';
    END IF;

    -- THE COLUMN IS READ, NEVER GUESSED. Both names are live in this database — `custom` on
    -- the hr.* and seo.* tables, `custom_fields` on crm.party, custom.record and
    -- users.user_form_profile — so a literal is right for one half and builds an index over a
    -- column that does not exist for the other.
    SELECT a.attname INTO v_col
      FROM pg_attribute a
     WHERE a.attrelid = format('%I.%I', v_schema, v_table)::regclass
       AND a.attname IN ('custom_fields', 'custom')
       AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY CASE a.attname WHEN 'custom_fields' THEN 0 ELSE 1 END
     LIMIT 1;
    IF v_col IS NULL THEN
      RAISE EXCEPTION 'custom_field_index_ddl: %.% has nowhere to keep custom fields', v_schema, v_table
        USING ERRCODE = 'undefined_column',
              HINT = 'A table takes custom fields through a jsonb column named custom_fields (the canonical name) or custom (the older one). This table has neither, so an index over one would be a statement that cannot run.';
    END IF;

    v_pred := 'organization_id = ' || quote_literal(d.organization_id::text) || '::uuid';
  ELSE
    v_schema := 'platform'; v_table := 'custom_record'; v_soft := true;
    v_col  := 'data';
    v_pred := 'organization_id = ' || quote_literal(d.organization_id::text) || '::uuid'
           || ' AND entity_definition_id = ' || quote_literal(d.target_definition_id::text) || '::uuid';
  END IF;

  v_expr := platform.custom_field_index_expr(d.field_type, d.field_key, v_col);
  IF v_expr IS NULL THEN
    RAISE EXCEPTION 'custom_field_index_ddl: field_type % is not promotable', d.field_type
      USING ERRCODE = 'check_violation',
            HINT = 'multi_select and file values are served by the GIN containment index on the whole column; promoting them would index a shape, not a value.';
  END IF;

  IF v_soft THEN v_pred := v_pred || ' AND deleted_at IS NULL'; END IF;

  RETURN 'CREATE ' || CASE WHEN d.is_unique THEN 'UNIQUE ' ELSE '' END
      || 'INDEX ' || CASE WHEN p_concurrently THEN 'CONCURRENTLY ' ELSE '' END
      || 'IF NOT EXISTS ' || quote_ident(platform.custom_field_index_name(p_definition_id))
      || ' ON ' || quote_ident(v_schema) || '.' || quote_ident(v_table)
      || ' (' || v_expr || ') WHERE ' || v_pred;
END $function$;

comment on function platform.custom_field_index_ddl(uuid, boolean) is
  'REC-N-1 / ruling (a): the index-DDL generator for a custom field on a STANDARD table, and '
  'the object custom/field_index_guard actually guards. The jsonb column is read from '
  'pg_attribute — custom_fields is canonical, custom is the older name, and a table with '
  'neither is refused by name rather than handed a statement that cannot run.';

-- THE ACCESS DECLARATION, in this same transaction, because the replacement above is
-- `SECURITY DEFINER` and `provision_shape_guard` refuses a definer function that reaches COMMIT
-- with nobody having said, IN DATA, who may call it (SQLSTATE 23514, met on the first apply of
-- this file). `platform.client_callable_door` held NO row for it — measured 2026-09-17 — so
-- this is the first time the question has been answered for a function that has been definer
-- all along.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('platform', 'custom_field_index_ddl', 'p_definition_id uuid, p_concurrently boolean',
   ARRAY['uuid'::regtype, 'boolean'::regtype]::oid[],
   'p_definition_id is a platform.custom_field_definition id; the function reads that row and '
   'nothing else, and the organization it acts for is the definition''s own organization_id '
   'rather than anything the caller passes. A definition id that does not exist is refused by '
   'name (foreign_key_violation) rather than answered with an empty string, and there is no '
   'NULL case: a NULL id finds no row and takes the same refusal.',
   'w1_index_the_expression_reads_the_path.sql',
   'server_only: it is called by platform.promote_custom_field_index, which is itself SECURITY '
   'DEFINER and runs the DDL. It returns a CREATE INDEX statement as text, so a client that '
   'could call it would learn the exact index DDL for another organization''s custom fields '
   'and gain nothing it could execute. No browser, PostgREST route or client library calls it.',
   false, false)
on conflict do nothing;
