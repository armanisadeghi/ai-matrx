create index if not exists organization_secrets_created_by
  on private_vault.organization_secrets (created_by);
create index if not exists organization_secrets_updated_by
  on private_vault.organization_secrets (updated_by);
create index if not exists organization_secrets_vault_secret
  on private_vault.organization_secrets (vault_secret_id)
  where vault_secret_id is not null;
create index if not exists organization_secret_grants_granted_by
  on private_vault.organization_secret_grants (granted_by);
create index if not exists organization_secret_audit_actor
  on private_vault.organization_secret_audit (actor_id, created_at desc);
