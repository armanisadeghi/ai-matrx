drop policy if exists organization_secrets_deny_direct_access
  on private_vault.organization_secrets;
create policy organization_secrets_service_role_only
  on private_vault.organization_secrets
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists organization_secret_grants_deny_direct_access
  on private_vault.organization_secret_grants;
create policy organization_secret_grants_service_role_only
  on private_vault.organization_secret_grants
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists organization_secret_audit_deny_direct_access
  on private_vault.organization_secret_audit;
create policy organization_secret_audit_service_role_only
  on private_vault.organization_secret_audit
  for all
  to service_role
  using (true)
  with check (true);
