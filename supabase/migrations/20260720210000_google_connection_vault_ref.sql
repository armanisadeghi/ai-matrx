-- Google integration credentials move to the canonical secrets vault.
--
-- The bespoke AES-256-GCM pathway (Next.js control plane + matrx-scraper
-- shared-key decryption) is annihilated. The refresh token now lives ONLY in
-- the canonical vault (personal → users.user_secrets; organization →
-- private_vault.organization_secrets), written and resolved exclusively by
-- aidream (/api/google-integrations/*). The connection row keeps non-secret
-- metadata plus vault_secret_key — the vault item's key.
--
-- Existing rows that could not be migrated were marked
-- status='needs_attention' with a reconnect instruction (loud, never silent).

alter table users.integration_connections
  add column if not exists vault_secret_key text;

alter table users.integration_connections
  drop column if exists credential_ciphertext,
  drop column if exists credential_iv,
  drop column if exists credential_tag;

comment on table users.integration_connections is
  'Reusable user/org external connection authority. Safe metadata only; the OAuth refresh token lives in the canonical secrets vault (vault_secret_key).';
comment on column users.integration_connections.vault_secret_key is
  'Key of the vault item holding this connection''s refresh token (users.user_secrets for personal connections, private_vault.organization_secrets for organization connections). Written only by aidream.';
