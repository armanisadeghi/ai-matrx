drop policy if exists organization_secrets_deny_direct_access
  on private_vault.organization_secrets;
create policy organization_secrets_deny_direct_access
  on private_vault.organization_secrets
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists organization_secret_grants_deny_direct_access
  on private_vault.organization_secret_grants;
create policy organization_secret_grants_deny_direct_access
  on private_vault.organization_secret_grants
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists organization_secret_audit_deny_direct_access
  on private_vault.organization_secret_audit;
create policy organization_secret_audit_deny_direct_access
  on private_vault.organization_secret_audit
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);
