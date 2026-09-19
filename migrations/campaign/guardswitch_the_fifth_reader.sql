-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- based-on: platform.custom_field_index_ddl(uuid, boolean) 6a4ec3f13577bd12917271101fd80623bf6ce937d2aa7b83b89ed1d9b980a43a
--
-- GUARD-SWITCH 1c — THE FIFTH READER B1 DID NOT SEE.
--
-- DOOR-FIX's B1 retired `custom/field_index_guard` and moved promotion onto the organization's
-- own `custom/system_enabled`. It moved FOUR bodies, all in schema `custom`. A catalogue
-- census run by this lane's green suite found a FIFTH, in schema `platform`:
-- `platform.custom_field_index_ddl` still resolved the retired knob and still refused every
-- organization with a remedy pointing at a knob nobody can turn on. That is the difference
-- between fixing an instance and closing a class, and the census is now an assertion in
-- `scripts/campaign-tests/guardswitch_green.sql` (1c) so the next reader that quietly keeps
-- the old read fails a suite rather than surviving a grep.
--
-- ADDITIVE: one `create or replace` that declares its `-- based-on:`. With the store off for
-- an organization the refusal is byte-for-byte the same refusal, in better words.
--
-- INVERSE: migrations/inverse/guardswitch_the_fifth_reader_down.sql

set lock_timeout = '3s';
set statement_timeout = '60s';


CREATE OR REPLACE FUNCTION platform.custom_field_index_ddl(p_definition_id uuid, p_concurrently boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  -- GUARD-SWITCH (2026-09-19): THE FIFTH READER OF custom/field_index_guard. DOOR-FIX's B1
  -- moved four bodies onto the organization's own system switch and MEASURED THE FOUR IT
  -- KNEW — `custom.promote_field`, `custom.promoted_index_ddl`, `custom._promoted_field_cap_guard`
  -- and `custom.work_slots_declare` — and this one, in schema `platform` rather than `custom`,
  -- was left reading the retired knob. So the instance was fixed and the CLASS was not: this
  -- generator still refused every organization, for ever, with a remedy naming a knob that has
  -- no rung to turn it on. It now asks `custom.store_is_open`, exactly like its four siblings.
  v_on := custom.store_is_open(d.organization_id);
  IF NOT v_on THEN
    RAISE EXCEPTION 'promoting a custom field to an index is switched off here'
      USING ERRCODE = '0A000',
            HINT = 'This organization''s record store is switched off — custom/system_enabled resolves false for it — so no index DDL was generated and nothing was changed. Turn the store on for this organization on the switch screen (/administration/database/unified-data-ramp) and ask again; there is no separate switch for promotion (GUARD-SWITCH, 2026-09-19).';
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
