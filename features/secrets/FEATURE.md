# Secrets

> **Status:** active · **Tier:** 1 · **Owners:** platform · **Updated:** 2026-07-19

User and organization vaults for env vars, API keys, OAuth material, service-account JSON, and other reusable secret strings. Values are write-only in browser APIs: members see masked metadata and can use permitted values in server-side executions and sandboxes, but cannot reveal plaintext.

## Stores and trust boundaries

| Scope | Metadata/value storage | Who can manage | Default use access |
|---|---|---|---|
| User | `users.user_secrets`; Fernet-encrypted `value_encrypted`; own-user RLS | The owner | The owner |
| Organization | `private_vault.organization_secrets`; value in Supabase Vault, metadata/lineage in the private schema | Org owner/admin | Every active org member |

The browser has no privileges on `private_vault` and never calls its functions directly. Authenticated FastAPI routes call service-role-only, security-definer functions. Organization listings return only masked hints, versions, permissions, lineage state, and audit metadata.

Organization access modes are:

- `all_members` — the default. Active members can use the value through a server-side resolver; admins can manage it.
- `restricted` — only explicitly granted active members can use it. Org admins retain emergency use/manage access.

## Organization copy and sync model

A member can contribute one active item from their user vault. Contribution creates a new encrypted organization value; it is not a live reference. The org row records the source user-secret id and source `value_version` only for drift detection.

- Editing the personal value increments its version and makes the org copy `out_of_sync`.
- Sync is explicit and replaces the org copy with the source's current value.
- Direct admin rotation intentionally severs lineage and returns the item to `not_linked`.
- Deleting or deactivating the source reports `source_deleted`; it does not delete the org copy.

## Resolution order

`aidream.services.organization_secrets.resolve_effective_secrets()` resolves usable organization values first, then overlays active personal values by key. An explicit request `AppContext.api_keys` value overlays both. Sandbox resolution also honors each row's `inject_into_sandbox` flag.

This resolver hydrates normal AI execution contexts and sandbox environments. Organization sandbox values travel only through the orchestrator's service-token call with the active `organization_id`; the user-JWT sandbox endpoint stays personal-only and cannot be used as a reveal API. Google Search Console has a dedicated adapter with precedence: site/user integration credential → effective vault → process environment. Vault keys can use the existing GSC env conventions (`FIREBASE_SERVICE_ACCOUNT` or `GOOGLE_SERVICE_ACCOUNT` JSON, or the GSC/Google OAuth client keys plus `GSC_REFRESH_TOKEN`).

## Files and entry points

| File | Role |
|---|---|
| [`types.ts`](./types.ts) | User types plus organization aliases from generated aidream OpenAPI contracts. |
| [`service.ts`](./service.ts), [`hooks.ts`](./hooks.ts) | Personal-vault browser service/hooks. |
| [`organization-service.ts`](./organization-service.ts), [`organization-hooks.ts`](./organization-hooks.ts) | Organization API client and state mutations. |
| [`components/OrganizationVaultSection.tsx`](./components/OrganizationVaultSection.tsx) | Org Manage UI: add, contribute, rotate, sync, restrict, sandbox toggle, and delete. |
| [`../../app/(transitional)/settings/secrets/page.tsx`](../../app/(transitional)/settings/secrets/page.tsx) | Personal vault settings. |
| [`../organizations/components/OrgManage.tsx`](../organizations/components/OrgManage.tsx) | Organization vault host. |

Public REST entry points:

- `/api/user-secrets/*` — personal CRUD, bulk `.env`, and sandbox resolution.
- `/api/organization-secrets/{organization_id}/*` — safe metadata listing plus admin/member mutations. There is deliberately no plaintext/reveal endpoint.

Database migrations:

- `20260719022445_organization_secret_vault.sql`
- `20260719023850_organization_secret_vault_explicit_deny.sql`
- `20260719023929_organization_secret_vault_fk_indexes.sql`
- `20260719025249_organization_secret_vault_policy_roles.sql`
- `20260719025339_organization_secret_vault_service_role_policies.sql`
- `20260719025959_organization_secret_delete_grant_cleanup.sql`

## Invariants

1. Plaintext never appears in list responses, logs, audit rows, grant rows, or client state.
2. Browser roles have no `private_vault` schema/table/function privileges or RLS policies; the only table policies target `service_role`.
3. Organization values are resolved only after current membership and access-mode checks.
4. `all_members` is the creation default so rollout does not silently break team workflows.
5. A personal value with the same key overrides the organization value for that user; an explicit request value overrides both.
6. Contributions are independent copies. Only an explicit sync changes the org copy from its source.
7. New consumers call the effective server-side resolver; they do not add reveal APIs or query Vault directly.

## Change Log

- **2026-07-20** — New consumer: Marketing Google integration connections. aidream's `/api/google-integrations/*` stores each connection's Google OAuth refresh token in the canonical vault (personal → user vault, organization → org vault) under `GOOGLE_OAUTH_REFRESH_TOKEN_<connection-id-hex>`, referenced by `users.integration_connections.vault_secret_key`; the scraper resolves it via a service-token internal endpoint. This replaced (annihilated) the bespoke AES-256-GCM Google-credential pathway.
- **2026-07-19** — Added the organization vault, all-member/restricted use permissions, private Supabase Vault storage, member contributions with version-based drift/manual sync, Org Manage UI, AI/sandbox resolution, generated API/DB contracts, audit metadata, GSC vault fallback, and grant cleanup on soft delete.
- **2026-05-28** — Initial personal vault implementation: user DB table, Fernet service, REST endpoints, sandbox injection, agent tool, and settings UI.
