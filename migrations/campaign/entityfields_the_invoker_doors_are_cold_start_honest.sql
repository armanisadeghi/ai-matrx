-- based-on: custom.entity_record_read(uuid, text, uuid) 686ce6a2abd06e2cb119fde68fcaa86e16fe4d5d9d68bb3f4c323804fd87c1e5
-- based-on: custom.entity_value_write(uuid, text, uuid, jsonb) 2fe3dad0aa04c222e3b71f1fc3b7cb949436c6b845afa23b0e9cd0ae9519ef83
-- based-on: custom.entity_records_find(uuid, text, text, jsonb, integer, integer) 660d4de1ddc17e8e6d07a274ad3d44d2c377d746f9fbc5492de3049ea3fd0354
--
-- chair-step: it GRANTS and REVOKES EXECUTE, both refused by the production allow-list by
-- name. The REVOKE takes back a grant this same lane issued forty minutes earlier and that
-- was worth nothing (see below); the GRANT opens one new SECURITY DEFINER wrapper. Nothing
-- else in this file changes any live path: it creates one function and moves one door row.
--
-- ENTITY-FIELDS 4 — THE GUARD WAS RIGHT AND THE GREEN SUITE WAS FOOLED BY ITS OWN SESSION.
--
-- `pnpm check:store-doors-decide` census 11 named the three SECURITY INVOKER value doors and
-- said the grant on them was worth nothing because they reach the ladder, which a person may
-- not execute. This lane's green suite passed every one of those doors from the seat, so the
-- census looked like a false positive. It was not. MEASURED, both ways, on the main database:
--
--   a FRESH session, role authenticated:
--     select custom.entity_record_read(org,'party',id)  → 42501 permission denied for
--                                                          function caller_role
--   the SAME session, after ONE call to the SECURITY DEFINER custom.entity_field_declare:
--     select custom.entity_record_read(org,'party',id)  → the row, happily
--
-- THE CAUSE is PL/pgSQL's plan cache. `custom.assert_client_may_reach` reads
-- `custom.caller_role()`, which `authenticated` holds no EXECUTE on. When a SECURITY DEFINER
-- door calls `assert_client_may_reach` FIRST, that expression is planned as the store's owner
-- and cached for the session; every later call in the same session reuses the plan and never
-- re-checks EXECUTE. So the suite warmed its own cache in PART 1 and PART 3 onwards ran on a
-- privilege it did not have. A real person arrives on a cold PostgREST connection and gets
-- the 42501.
--
-- THE FIX IS THE ESTABLISHED PATTERN, NOT A GRANT. `custom.assert_entity_door` is a SECURITY
-- DEFINER wrapper around the one ladder predicate - which is exactly what
-- `custom.caller_role()` exists for: it judges the identity the caller ACTUALLY held and not
-- `current_user`, which a definer door has already rewritten. The three INVOKER value doors
-- call the wrapper, so nothing in their bodies needs a privilege the person lacks, and the
-- rows they read and write are still decided by the standard table's OWN row-level security,
-- which is the entire reason they are INVOKER.
--
-- AND THE USELESS GRANT GOES BACK. `custom.assert_client_may_reach` was granted to
-- `authenticated` by this lane's third file. It could never work: its own first line dies.
-- The grant is revoked and its door row removed, so nothing claims a door that is not one.
--
-- INVERSE: migrations/inverse/entityfields_the_invoker_doors_are_cold_start_honest_down.sql

set lock_timeout = '3s';
set statement_timeout = '120s';

CREATE OR REPLACE FUNCTION custom.assert_entity_door(p_organization_id uuid, p_door text)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
begin
  -- ONE PREDICATE, ONE WORDING. This adds no rule: it is `custom.assert_client_may_reach`,
  -- reachable from a SECURITY INVOKER body. `custom.caller_role()` inside it reads the
  -- identity the caller actually held, so running as the definer does not make the wall
  -- weaker - that is the whole reason the store asks `caller_role()` rather than
  -- `current_user`.
  perform custom.assert_client_may_reach(p_organization_id, p_door);
end
$function$;

COMMENT ON FUNCTION custom.assert_entity_door(uuid, text) IS
  'The organization wall, reachable from a SECURITY INVOKER door. custom.assert_client_may_reach reads custom.caller_role(), which authenticated may not execute, so an INVOKER body calling it directly dies on a cold connection - and passes in a session a definer door has already warmed. This wrapper is how an INVOKER door asks the one predicate.';

INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers)
VALUES ('custom','assert_entity_door','p_organization_id uuid, p_door text',
        ARRAY['uuid'::regtype,'text'::regtype]::oid[],
        'p_organization_id is the organization the caller says they are working in and is the only thing judged - custom.assert_client_may_reach / iam.has_org_access decides it and NULL is refused there by name with 22004. p_door is a label used in the refusal sentence. It reads no row of any table and returns void or raises.',
        'migrations/campaign/entityfields_the_invoker_doors_are_cold_start_honest.sql', true)
ON CONFLICT (schema_name, function_name, identity_argtypes) DO NOTHING;

GRANT EXECUTE ON FUNCTION custom.assert_entity_door(uuid, text) TO authenticated;

-- The three INVOKER doors, repointed. Their bodies are otherwise byte-identical.
CREATE OR REPLACE FUNCTION custom.entity_record_read(p_organization_id uuid, p_token text, p_record_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'pg_catalog' AS $function$
declare
  t        record;
  v_row    jsonb;
  v_doc    jsonb;
  v_fields jsonb;
begin
  perform custom.assert_entity_door(p_organization_id, 'custom.entity_record_read');
  select * into t from custom.entity_table(p_token);
  perform custom.assert_entity_is_organization_scoped(t.token, t.label, t.has_organization);

  execute format('select to_jsonb(x) from %I.%I x where x.id = $1 and x.organization_id = $2',
                 t.schema_name, t.table_name)
    into v_row using p_record_id, p_organization_id;

  if v_row is null then
    raise exception 'There is no % you can open with that id in this organization.', t.label
      using errcode = '02000',
            hint = 'DOOR-1: this door reads the row as YOU, through the table''s own access rules - so a row somebody has not shared with you is the same answer as a row that is not there. Ask whoever holds it to share it with you.';
  end if;

  v_doc := v_row -> 'custom_fields';
  if v_doc is null or jsonb_typeof(v_doc) <> 'object' then v_doc := '{}'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', f.id, 'key', f.data ->> 'key', 'label', f.data ->> 'label',
           'type', f.data ->> 'type', 'parity_type', f.data ->> 'parity_type',
           'format', f.data ->> 'format', 'unit', f.data ->> 'unit',
           'multi', f.data -> 'multi', 'required', f.data -> 'required', 'sort', f.data -> 'sort',
           'sensitivity', f.data ->> 'sensitivity',
           'options_table_id', f.data -> 'config' ->> 'options_table_id',
           'relation_target', f.data ->> 'relation_target',
           'value', v_doc -> (f.data ->> 'key'),
           'written', v_doc -> '_values' -> (f.data ->> 'key')))), '[]'::jsonb)
    into v_fields
    from custom.entity_fields(p_organization_id, p_token) f;

  return jsonb_build_object(
    'token', t.token, 'label', t.label, 'type', t.type, 'id', p_record_id,
    'organization_id', p_organization_id,
    'title', case when t.title_column is not null then v_row ->> t.title_column end,
    'columns', v_row - 'custom_fields',
    'custom', v_doc - '_values' - '_retired',
    'custom_written', coalesce(v_doc -> '_values', '{}'::jsonb),
    'fields', v_fields,
    'live', (v_row ->> 'deleted_at') is null);
end
$function$;

CREATE OR REPLACE FUNCTION custom.entity_value_write(p_organization_id uuid, p_token text, p_record_id uuid, p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog' AS $function$
declare
  t     record;
  v_doc jsonb;
  v_key text;
  v_n   int;
begin
  perform custom.assert_entity_door(p_organization_id, 'custom.entity_value_write');
  select * into t from custom.entity_table(p_token);
  perform custom.assert_entity_is_organization_scoped(t.token, t.label, t.has_organization);

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'A write names the fields it is setting and what to set them to.'
      using errcode = '22023',
            hint = 'Pass {"key": value}. A key set to null clears that value; a key left out is left alone. Nothing was written.';
  end if;

  execute format('select coalesce(x.custom_fields, %L::jsonb) from %I.%I x where x.id = $1 and x.organization_id = $2',
                 '{}', t.schema_name, t.table_name)
    into v_doc using p_record_id, p_organization_id;
  if v_doc is null then
    raise exception 'There is no % you can open with that id in this organization.', t.label
      using errcode = '02000',
            hint = 'DOOR-1 decides reading and writing with the same question: a row you may not open is a row you may not change.';
  end if;
  if jsonb_typeof(v_doc) <> 'object' then v_doc := '{}'::jsonb; end if;

  for v_key in select k from jsonb_object_keys(p_patch) k loop
    if jsonb_typeof(p_patch -> v_key) = 'null' and left(v_key, 1) <> '_' then
      v_doc := v_doc - v_key;
      if jsonb_typeof(v_doc -> '_values') = 'object' then
        v_doc := jsonb_set(v_doc, '{_values}', (v_doc -> '_values') - v_key);
      end if;
    else
      v_doc := jsonb_set(v_doc, array[v_key], p_patch -> v_key, true);
    end if;
  end loop;

  execute format('update %I.%I x set custom_fields = $1 where x.id = $2 and x.organization_id = $3',
                 t.schema_name, t.table_name)
    using v_doc, p_record_id, p_organization_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'You can see this %, but it is not yours to change.', t.label
      using errcode = '42501',
            hint = 'DOOR-1: this door writes as YOU, through the table''s own access rules. It would take the editor level, or a share of this row with you. Nothing was written.';
  end if;

  return custom.entity_record_read(p_organization_id, p_token, p_record_id);
end
$function$;

CREATE OR REPLACE FUNCTION custom.entity_records_find(p_organization_id uuid, p_token text, p_key text,
                                                      p_value jsonb DEFAULT NULL,
                                                      p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'pg_catalog' AS $function$
declare
  t      record;
  v_rows jsonb;
  v_lim  int := least(greatest(coalesce(p_limit, 50), 1), 500);
begin
  perform custom.assert_entity_door(p_organization_id, 'custom.entity_records_find');
  select * into t from custom.entity_table(p_token);
  perform custom.assert_entity_is_organization_scoped(t.token, t.label, t.has_organization);

  if not exists (select 1 from custom.entity_fields(p_organization_id, p_token) f
                  where f.data ->> 'key' = p_key) then
    raise exception '% has no custom field called "%" in this organization.', t.label, p_key
      using errcode = '23514',
            hint = 'REC-40 / FLD-8: filtering by a field nobody declared would quietly return nothing and look like an empty result. Declare it first, or ask for the fields this table has.';
  end if;

  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object('
    || '''id'', x.id, ''title'', %s, ''value'', x.custom_fields -> $1) order by x.id), ''[]''::jsonb) '
    || 'from (select * from %I.%I y where y.organization_id = $2 '
    ||       'and y.custom_fields ? $1 '
    ||       'and ($3::jsonb is null or y.custom_fields -> $1 = $3) '
    ||       '%s order by y.id limit $4 offset $5) x',
    case when t.title_column is null then 'null::text' else format('x.%I::text', t.title_column) end,
    t.schema_name, t.table_name,
    case when t.has_deleted_at then 'and y.deleted_at is null' else '' end)
    into v_rows using p_key, p_organization_id, p_value, v_lim, greatest(coalesce(p_offset, 0), 0);

  return jsonb_build_object('token', t.token, 'label', t.label, 'key', p_key,
                            'value', p_value, 'rows', v_rows,
                            'count', jsonb_array_length(v_rows));
end
$function$;

-- THE GRANT THAT WAS WORTH NOTHING, TAKEN BACK.
REVOKE EXECUTE ON FUNCTION custom.assert_client_may_reach(uuid, text) FROM authenticated;
DELETE FROM platform.client_callable_door
 WHERE schema_name = 'custom' AND function_name = 'assert_client_may_reach';
