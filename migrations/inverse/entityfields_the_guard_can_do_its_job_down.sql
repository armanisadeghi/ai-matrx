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
