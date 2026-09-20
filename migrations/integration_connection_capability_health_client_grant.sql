-- Connector health rows read the safe, person-facing capability call record
-- directly under the caller's JWT. The table deliberately retains
-- column-level grants: vault reference identifiers remain unavailable to the
-- browser, while this JSON document contains only the declared call facts
-- (timestamp, action, classified code, person-facing sentence, HTTP status).

grant select (capability_health)
  on users.integration_connections to authenticated;

do $verify$
begin
  if has_table_privilege(
    'authenticated', 'users.integration_connections'::regclass, 'select'
  ) then
    raise exception 'integration_connections must retain column-level SELECT grants';
  end if;

  if not has_column_privilege(
    'authenticated', 'users.integration_connections'::regclass,
    'capability_health', 'select'
  ) then
    raise exception 'client-safe capability health is not readable';
  end if;

  if has_column_privilege(
      'authenticated', 'users.integration_connections'::regclass,
      'credential_item_id', 'select'
    ) or has_column_privilege(
      'authenticated', 'users.integration_connections'::regclass,
      'vault_secret_key', 'select'
    ) then
    raise exception 'private credential reference columns became client-readable';
  end if;
end
$verify$;
