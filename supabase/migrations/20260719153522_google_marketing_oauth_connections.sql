-- Durable Google OAuth authority for Marketing.
--
-- Safe metadata is read directly from Supabase under RLS. OAuth credentials
-- are AES-GCM ciphertext written only by the trusted Next.js OAuth control
-- plane; browser roles have no privileges on those columns.

create table users.integration_connections (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('user', 'organization')),
  owner_user_id uuid references auth.users(id) on delete cascade,
  organization_id uuid references iam.organizations(id) on delete cascade,
  provider text not null check (provider in ('google')),
  provider_subject text not null,
  account_email text,
  account_name text,
  scopes text[] not null default '{}',
  status text not null default 'connected'
    check (status in ('connected', 'needs_attention', 'revoked')),
  last_verified_at timestamptz,
  last_error text,
  credential_ciphertext text not null,
  credential_iv text not null,
  credential_tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint integration_connections_owner_shape check (
    (owner_type = 'user' and owner_user_id is not null and organization_id is null)
    or
    (owner_type = 'organization' and owner_user_id is null and organization_id is not null)
  )
);

create unique index integration_connections_unique_live_account
  on users.integration_connections (
    owner_type,
    coalesce(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    provider,
    provider_subject
  ) where deleted_at is null;

create index integration_connections_owner_user
  on users.integration_connections (owner_user_id, updated_at desc)
  where deleted_at is null and owner_user_id is not null;

create index integration_connections_organization
  on users.integration_connections (organization_id, updated_at desc)
  where deleted_at is null and organization_id is not null;

create table users.integration_connection_resources (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null
    references users.integration_connections(id) on delete cascade,
  resource_type text not null
    check (resource_type in ('search_console_property', 'analytics_property')),
  resource_ref text not null,
  display_name text not null,
  permission_level text,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index integration_connection_resources_unique_live
  on users.integration_connection_resources (connection_id, resource_type, resource_ref)
  where deleted_at is null;

create index integration_connection_resources_connection
  on users.integration_connection_resources (connection_id, resource_type, display_name)
  where deleted_at is null;

alter table users.integration_connections enable row level security;
alter table users.integration_connection_resources enable row level security;

create policy integration_connections_read_owner_or_org
  on users.integration_connections
  for select
  to authenticated
  using (
    deleted_at is null
    and (
      owner_user_id = (select auth.uid())
      or (
        organization_id is not null
        and iam.has_org_access(organization_id)
      )
    )
  );

create policy integration_connection_resources_read_owner_or_org
  on users.integration_connection_resources
  for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
      from users.integration_connections connection
      where connection.id = integration_connection_resources.connection_id
        and connection.deleted_at is null
        and (
          connection.owner_user_id = (select auth.uid())
          or (
            connection.organization_id is not null
            and iam.has_org_access(connection.organization_id)
          )
        )
    )
  );

revoke all on users.integration_connections from anon, authenticated;
revoke all on users.integration_connection_resources from anon, authenticated;

grant select (
  id, owner_type, owner_user_id, organization_id, provider,
  provider_subject, account_email, account_name, scopes, status,
  last_verified_at, last_error, created_at, updated_at, deleted_at, metadata
) on users.integration_connections to authenticated;

grant select (
  id, connection_id, resource_type, resource_ref, display_name,
  permission_level, discovered_at, created_at, updated_at, deleted_at, metadata
) on users.integration_connection_resources to authenticated;

comment on table users.integration_connections is
  'Reusable user/org external connection authority. OAuth credentials are encrypted and never selectable by browser roles.';
comment on table users.integration_connection_resources is
  'Safe provider resource inventory discovered for a reusable integration connection.';
comment on column users.integration_connections.credential_ciphertext is
  'AES-256-GCM ciphertext created by the trusted OAuth control plane; never exposed to authenticated/anon roles.';
