-- target: branch
-- based-on: platform.custom_field_index_expr(text, text, text) 48e1d868a74091a0819a25d525c20b7fcde7e1f305bac26f333acdcf435c52d9
-- based-on: platform.custom_field_index_ddl(uuid, boolean) 6a4ec3f13577bd12917271101fd80623bf6ce937d2aa7b83b89ed1d9b980a43a
--
-- THOSE TWO HASHES ARE THE UP FILE'S OWN BODIES, not the ones restored below: a replace
-- declares the body it is REPLACING, and what this file replaces is what
-- `w1_index_the_expression_reads_the_path.sql` left behind. They were read off the rehearsal
-- branch after that file applied (`pnpm db:based-on` with no target reads PRODUCTION, which is
-- still on the prior bodies — measured 2026-09-17, and it is why the two hash pairs differ).
-- The consequence is deliberate: this inverse refuses to run unless the up file's bytes are
-- what is actually live, which is exactly rule 27's down-then-up and nothing else.
--
-- THE INVERSE of `migrations/campaign/w1_index_the_expression_reads_the_path.sql` (§4.13,
-- rule 27). It restores BOTH prior bodies VERBATIM — the exact text
-- `pg_get_functiondef` returned for each before this lane touched it, read off the branch at
-- 2026-09-17 23:4x UTC and pasted here unedited, so the restore is a copy rather than a
-- reconstruction. Their `-- based-on:` hashes, taken from the same bodies, are:
--   platform.custom_field_index_expr(text, text, text) 519f8d572edd03b00603ca80d34a8d37b1153797c56eb28254f1b1362c9887f9
--   platform.custom_field_index_ddl(uuid, boolean)     1ffac0a932e0dad2853e908d0a6839b910a4af6920ec57302ce9d1e9312de761
--
-- IT IS `-- target: branch` ON PURPOSE, like every other inverse here: at `--target production`
-- a `CREATE OR REPLACE` of a live body needs its own `-- based-on:` header and its own decision.
--
-- WHAT COMES BACK WITH IT, named rather than left as a surprise: the expression function loses
-- its `SET search_path` again, and the DDL generator goes back to hard-coding the column name
-- `custom` (wrong for `crm.party`, `custom.record` and `users.user_form_profile`, which all
-- call it `custom_fields`) and to generating index DDL while `custom/field_index_guard` is off.

set lock_timeout = '2s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION platform.custom_field_index_expr(p_field_type text, p_field_key text, p_column text DEFAULT 'custom'::text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
AS $function$
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

CREATE OR REPLACE FUNCTION platform.custom_field_index_ddl(p_definition_id uuid, p_concurrently boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  d record; v_schema text; v_table text; v_col text; v_expr text;
  v_pred text; v_soft boolean;
BEGIN
  SELECT * INTO d FROM platform.custom_field_definition WHERE id = p_definition_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'custom_field_index_ddl: definition % does not exist', p_definition_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF d.target_kind = 'entity_table' THEN
    SELECT et.schema_name, et.table_name, et.has_soft_delete INTO v_schema, v_table, v_soft
      FROM platform.entity_types et WHERE et.token = d.target_token;
    IF v_schema IS NULL THEN
      RAISE EXCEPTION 'custom_field_index_ddl: token % is not registered', d.target_token
        USING ERRCODE = 'check_violation';
    END IF;
    v_col  := 'custom';
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
