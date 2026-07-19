-- OAuth connections are available only to durable authenticated accounts.
-- Supabase anonymous-auth sessions also use the authenticated database role,
-- so reject them explicitly in addition to the owner/org checks.

drop policy if exists integration_connections_read_owner_or_org
  on users.integration_connections;

create policy integration_connections_read_owner_or_org
  on users.integration_connections
  for select
  to authenticated
  using (
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and deleted_at is null
    and (
      owner_user_id = (select auth.uid())
      or (
        organization_id is not null
        and iam.has_org_access(organization_id)
      )
    )
  );

drop policy if exists integration_connection_resources_read_owner_or_org
  on users.integration_connection_resources;

create policy integration_connection_resources_read_owner_or_org
  on users.integration_connection_resources
  for select
  to authenticated
  using (
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and deleted_at is null
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
