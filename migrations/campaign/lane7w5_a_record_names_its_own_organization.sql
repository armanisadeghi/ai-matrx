-- chair-step: this file CREATES one NEW function, custom.entity_record_home(text, uuid), SECURITY
-- INVOKER, declares it in platform.client_callable_door and GRANTS EXECUTE on it to authenticated.
-- No table DDL, no ALTER, no strong lock on any table; it replaces no existing body and revokes
-- nothing. Its inverse drops the function and its door row.
-- lock: custom
--
-- LANE 7 · STANDARD-TABLES · W5 — A RECORD NAMES ITS OWN ORGANIZATION.
--
-- Design: common-docs/projects/data-doctrine-adoption/v6/DESIGN-STANDARD-TABLES-W45.md § Wave 5,
-- point 3 (C2). The custom-fields section on every record view needs the organization whose
-- fields extend the record. That is the ROW's organization — never the active organization
-- (law: the active organization is never a filter) and never custom.where_id_opens (which knows
-- store objects only). A page used to hand it in as a prop; most surfaces (the generic Detail
-- window, peeks, bespoke windows) hold only (token, id). This door answers it for them, AS THE
-- PERSON: SECURITY INVOKER, so the table's own row rules decide whether she may read the row.
--
-- It never raises. It answers one of:
--   {"organization_id": "<uuid>", "token": "...", "label": "..."}
--   {"refused": "<one plain sentence>", "reason": "<code>", "token": "...", "label": "..."}
-- reason codes:
--   no_table         the token is unknown, retired, or its type takes no custom fields
--   no_organization  the table has no organization_id column (M2: 48 of the 648 Entity/Detail
--                    tables). Their records belong to a person, and the store's field doors
--                    filter on a literal organization_id, so they take no custom fields until
--                    those doors learn an owner column. The section says so in one line.
--   personal_row     the table has the column but this row's organization is empty
--   not_found        no such row, or one the person may not read (the same answer, on purpose)
--   not_readable     the table refuses her the organization_id column itself
--   read_failed      any other fault while reading the row (never raised to the caller)

set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION custom.entity_record_home(p_token text, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  t      record;
  v_org  uuid;
  v_seen boolean;
begin
  begin
    select * into t from custom.entity_table(p_token);
  exception when others then
    return jsonb_build_object('refused', sqlerrm, 'reason', 'no_table', 'token', p_token);
  end;

  if not t.has_organization then
    return jsonb_build_object(
      'refused', format('%s records belong to a person, not an organization, so they take no custom fields yet.', t.label),
      'reason', 'no_organization', 'token', t.token, 'label', t.label);
  end if;

  -- AS THE PERSON: the table's own row rules decide. A row she cannot read is not there.
  -- The read itself may refuse (a table whose organization_id column is not granted to her, or any
  -- runtime fault): that is answered as a refusal, never raised.
  begin
    execute format('select true, x.organization_id from %I.%I x where x.id = $1', t.schema_name, t.table_name)
       into v_seen, v_org using p_record_id;
  exception
    when insufficient_privilege then
      return jsonb_build_object(
        'refused', format('You can''t read this %s''s organization here.', lower(t.label)),
        'reason', 'not_readable', 'token', t.token, 'label', t.label);
    when others then
      return jsonb_build_object(
        'refused', format('This %s could not be read just now.', lower(t.label)),
        'reason', 'read_failed', 'token', t.token, 'label', t.label);
  end;

  if v_seen is null then
    return jsonb_build_object(
      'refused', format('There is no %s you can open with that id.', lower(t.label)),
      'reason', 'not_found', 'token', t.token, 'label', t.label);
  end if;

  if v_org is null then
    return jsonb_build_object(
      'refused', format('This %s belongs to no organization, so it takes no custom fields.', lower(t.label)),
      'reason', 'personal_row', 'token', t.token, 'label', t.label);
  end if;

  return jsonb_build_object('organization_id', v_org, 'token', t.token, 'label', t.label);
end
$function$;

COMMENT ON FUNCTION custom.entity_record_home(text, uuid) IS
  'Lane 7 W5: the organization of one standard row, read AS THE PERSON (invoker, the table''s own row rules). Never raises: {organization_id} or {refused, reason}. Never the active organization.';

INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, signed_in_callers, identity_argtypes)
SELECT 'custom', 'entity_record_home', 'p_token text, p_record_id uuid',
       'migrations/campaign/lane7w5_a_record_names_its_own_organization.sql (lane 7 STANDARD-TABLES W5)',
       'SECURITY INVOKER: the organization_id of one row of a registry Entity/Detail table, read as the caller through the table''s own row rules. Answers a refusal sentence instead of raising. p_token is a registry token; the table name comes from custom.entity_table, never from the caller.',
       true, array['text'::regtype, 'uuid'::regtype]::oid[]
WHERE NOT EXISTS (SELECT 1 FROM platform.client_callable_door
                   WHERE schema_name = 'custom' AND function_name = 'entity_record_home');

GRANT EXECUTE ON FUNCTION custom.entity_record_home(text, uuid) TO authenticated;
