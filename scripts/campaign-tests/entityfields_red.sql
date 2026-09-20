-- ENTITY-FIELDS — THE RED TWIN. It runs this lane's OWN inverse bodies inside a transaction
-- that ends in ROLLBACK, and then asserts that each thing the green suite proved is BROKEN
-- again. That is what makes the green suite a measurement rather than a description: with the
-- lane's work undone, every clause fails, in the exact words the defect used to produce.
--
-- RUN IT (main database):
--   "$PSQL" "$MAIN_DSN" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/entityfields_red.sql
--
-- It rolls back. Running the inverse bodies here is also what proves they are valid SQL.

\set ON_ERROR_STOP on
\timing off
begin;

-- ── BLOCK A — undo the door set (migrations/inverse/entityfields_the_doors_a_person_reaches_down.sql)
DROP FUNCTION IF EXISTS custom.entity_records_find(uuid, text, text, jsonb, integer, integer);
DROP FUNCTION IF EXISTS custom.assert_entity_door(uuid, text);
DROP FUNCTION IF EXISTS custom.entity_value_write(uuid, text, uuid, jsonb);
DROP FUNCTION IF EXISTS custom.entity_record_read(uuid, text, uuid);
DROP FUNCTION IF EXISTS custom.entity_field_retire(uuid, uuid);
DROP FUNCTION IF EXISTS custom.entity_field_update(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS custom.entity_field_declare(uuid, text, jsonb);
DROP FUNCTION IF EXISTS custom.entity_fields(uuid, text);
DROP FUNCTION IF EXISTS custom.assert_entity_is_organization_scoped(text, text, boolean);
DROP FUNCTION IF EXISTS custom.entity_table(text);
DELETE FROM platform.client_callable_door
 WHERE declared_by = 'migrations/campaign/entityfields_the_doors_a_person_reaches.sql';

-- ENTITY-FIELDS 1 — INVERSE. Restores custom._entity_custom_fields_guard to the SECURITY
-- INVOKER body that was live on 2026-09-19 (sha256 a59a0973a6f6ad1b6db267b1275d87a305b17b52435c4b84dad8ff2bbf5e8302).
-- Running it re-opens the class this lane closed: every INSERT into a standard Entity table
-- carrying the column fails with 42501 for a person of a store-ON organization.

CREATE OR REPLACE FUNCTION custom._entity_custom_fields_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org uuid;
begin
  -- GUARD-SWITCH (2026-09-19), B1's move. This used to read `custom/entity_custom_fields_guard`,
  -- which was false platform-wide with no rung that could turn it on, so a `custom_fields`
  -- document on a standard Entity table was never validated for anybody. It now follows the
  -- organization's own store switch: an organization whose store is OFF answers byte for byte
  -- as it does today, and an organization whose store is ON has its custom fields checked.
  begin
    v_org := to_jsonb(new) ->> 'organization_id';
  exception when others then
    v_org := null;
  end;
  if v_org is null then
    return new;
  end if;
  if not custom.store_is_open(v_org) then
    return new;
  end if;
  perform custom.validate_custom_fields(tg_argv[0], v_org, to_jsonb(new) -> 'custom_fields');
  return new;
end;
$function$

;

-- ── BLOCK C — undo the retrofit's machinery
DROP TRIGGER IF EXISTS entity_type_gets_custom_fields ON platform.entity_types;
DROP FUNCTION IF EXISTS platform._entity_type_gets_custom_fields();
DROP FUNCTION IF EXISTS platform.custom_fields_retrofit(text);
-- ...and, for the one table the green suite writes on, the column itself, so the 42703 the
-- measurement found is reproduced rather than described.
DROP TRIGGER IF EXISTS custom_fields_validation ON crm.interaction;
ALTER TABLE crm.interaction DROP COLUMN IF EXISTS custom_fields;

do $r$
declare
  v_org   uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_boss  text := current_user;
  v_party uuid;
  v_red   int := 0;
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s"}', v_admin), true);
  insert into crm.party (organization_id, party_kind, display_name, created_by, visibility)
  values (v_org, 'organization', 'ZZZ ENTITY-FIELDS red twin', v_admin, 'internal') returning id into v_party;
  perform set_config('role', 'authenticated', true);

  -- RED 1 — there is no door onto a standard table's fields
  begin
    execute 'select count(*) from custom.entity_fields($1, $2)' using v_org, 'party';
    raise exception 'RED 1 did not go red: the door is still there';
  exception when undefined_function then
    v_red := v_red + 1; raise notice 'RED 1 ✗ no door lists a standard table''s custom fields';
  end;

  -- RED 2 — nothing can declare one
  begin
    execute 'select custom.entity_field_declare($1, $2, $3)'
      using v_org, 'party', '{"label":"Account tier","type":"text"}'::jsonb;
    raise exception 'RED 2 did not go red';
  exception when undefined_function then
    v_red := v_red + 1; raise notice 'RED 2 ✗ nothing can declare a field on a standard table';
  end;

  -- RED 3 — the guard runs as the person again, so the CRM breaks
  begin
    insert into crm.party (organization_id, party_kind, display_name)
    values (v_org, 'person', 'ZZZ red twin contact');
    raise exception 'RED 3 did not go red: the insert was accepted';
  exception when insufficient_privilege then
    v_red := v_red + 1; raise notice 'RED 3 ✗ a person cannot create a contact at all: %', sqlerrm;
  end;

  -- RED 4 — a Detail table has nowhere to put a custom value
  begin
    update crm.interaction set custom_fields = '{"x":1}'::jsonb where organization_id = v_org;
    raise exception 'RED 4 did not go red';
  exception when undefined_column then
    v_red := v_red + 1; raise notice 'RED 4 ✗ a Detail table has no custom_fields column: %', sqlerrm;
  end;

  -- RED 5 — nothing reads a row's columns and its custom values together
  begin
    execute 'select custom.entity_record_read($1, $2, $3)' using v_org, 'party', v_party;
    raise exception 'RED 5 did not go red';
  exception when undefined_function then
    v_red := v_red + 1; raise notice 'RED 5 ✗ nothing returns a standard row with its custom values';
  end;

  perform set_config('role', v_boss, true);
  if v_red <> 5 then raise exception 'ENTITY-FIELDS RED TWIN: only % of 5 blocks went red', v_red; end if;
  raise notice 'ENTITY-FIELDS RED TWIN: 5 of 5 blocks are RED';
end $r$;

rollback;
