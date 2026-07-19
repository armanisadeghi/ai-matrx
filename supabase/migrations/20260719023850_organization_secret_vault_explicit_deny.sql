-- These tables are intentionally service-only. Explicit restrictive policies
-- make the deny posture inspectable (and keep the database advisor from
-- treating the deliberate no-client-access design as an accidental omission).

create policy organization_secrets_deny_direct_access
on private_vault.organization_secrets
as restrictive for all to public
using (false) with check (false);

create policy organization_secret_grants_deny_direct_access
on private_vault.organization_secret_grants
as restrictive for all to public
using (false) with check (false);

create policy organization_secret_audit_deny_direct_access
on private_vault.organization_secret_audit
as restrictive for all to public
using (false) with check (false);
