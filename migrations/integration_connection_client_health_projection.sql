-- The browser needs to know whether a connection has a usable vault reference,
-- but the reference identifiers themselves are deliberately excluded from the
-- authenticated role. Publish only the two boolean facts the UI needs.

alter table users.integration_connections
  add column if not exists credential_present boolean
    generated always as (
      credential_item_id is not null or vault_secret_key is not null
    ) stored,
  add column if not exists credential_stable boolean
    generated always as (credential_item_id is not null) stored;

comment on column users.integration_connections.credential_present is
  'Client-safe fact: a credential reference exists. Does not expose either vault identifier.';
comment on column users.integration_connections.credential_stable is
  'Client-safe fact: the connection uses the canonical credential_item_id reference.';

grant select (credential_present, credential_stable)
  on users.integration_connections to authenticated;

do $$
begin
  if has_table_privilege(
    'authenticated', 'users.integration_connections'::regclass, 'select'
  ) then
    raise exception 'integration_connections must retain column-level SELECT grants';
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

  if not has_column_privilege(
      'authenticated', 'users.integration_connections'::regclass,
      'credential_present', 'select'
    ) or not has_column_privilege(
      'authenticated', 'users.integration_connections'::regclass,
      'credential_stable', 'select'
    ) then
    raise exception 'client-safe credential health facts are not readable';
  end if;

  if exists (
    select 1
    from users.integration_connections
    where credential_present is distinct from (
        credential_item_id is not null or vault_secret_key is not null
      )
       or credential_stable is distinct from (credential_item_id is not null)
  ) then
    raise exception 'generated credential health facts disagree with their private sources';
  end if;
end
$$;
