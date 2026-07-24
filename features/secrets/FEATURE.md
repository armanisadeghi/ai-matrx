# Secrets — Unified Credential Vault

> **Status:** active · **Tier:** 1 · **Owners:** platform · **Updated:** 2026-07-23

> Cross-repo implementation authority: `/Users/armanisadeghi/code/common-docs/projects/unified-credential-vault/PLAN.md` — read it before expanding this feature in ANY repository.

ONE definition-driven vault for both principals — personal and organization — covering env values, API keys, logins, tokens, service accounts, and multi-field credential bundles. A **credential item** (`users.credential_items`) owns one or more encrypted **fields** (`users.user_secrets`); non-secret **definitions and provider presets** come from Remote Catalogs (`public.catalog_entries`, kind `credential_definition`, app `matrx`, 120+ active).

## The one workspace

`components/VaultWorkspace.tsx` is the ONLY vault UI. It receives a `VaultPrincipal` (`{type:'user'}` or `{type:'organization', organizationId}`); which actions render is decided by each item's `capabilities` (`can_use` / `can_edit` / `can_reveal` / `can_manage`) — never by principal-specific component forks. Surfaces:

- Personal: [`app/(transitional)/settings/secrets/page.tsx`](../../app/(transitional)/settings/secrets/page.tsx)
- Organization: `OrgManage.tsx` (`features/organizations/components/`) renders `<VaultWorkspace principal={{type:'organization',…}} canManage={…}>` in its Vault section.

The pre-unification duplicate stacks (`service.ts`, `hooks.ts`, `organization-service.ts`, `organization-hooks.ts`, `OrganizationVaultSection.tsx`) are **deleted** — do not recreate a per-principal fork.

## Item/field model and handling doctrine

Every field carries exactly three controls (independent; catalog definitions provide defaults):

| Control | Values | Meaning |
|---|---|---|
| `handling` | `visible` | Shown to any authorized viewer (still encrypted at rest); FE shows it via `POST /api/vault/resolve` under `can_use`. |
| | `revealable` | Masked; explicit audited reveal via `POST /api/vault/items/{id}/reveal` under `can_reveal`. |
| | `sealed` | NO human path, ever — only trusted execution resolves it. The API refuses structurally. |
| `editable` | bool | Whether a human may change the value (integration-managed tokens are `false`). |
| `inject_into_sandbox` | bool | Whether the field enters authorized sandbox environments (needs an env alias in `key`). |

`user_secrets.key` is the **optional env alias** (`VALID_KEY_RE`); `field_key` is the stable lowercase-snake identity within the item. Legacy single-value rows are one-field `env_value` items.

## Trust boundary — two data paths, one per operation

1. **Masked metadata → DIRECT Supabase.** Items + fields + catalog definitions are read via supabase-js with the **explicit column lists** `CREDENTIAL_ITEM_COLUMNS` / `VAULT_FIELD_COLUMNS` (`types.ts`). `users.user_secrets.value_encrypted` is unreadable by client roles — **never `select *` on these tables.** Scope is declared per THE VIEW LAW (`eq(user_id)` personal, `eq(organization_id)` org); RLS provides owner reads, org-member masked reads, and self-reads on `user_secret_grants`.
2. **Everything value-bearing or mutating → aidream `/api/vault/*`** (`vault-service.ts`): create/update/delete items and fields, import-env, reveal, resolve, rotate, share, transfer, fork, audit. The legacy `/api/user-secrets` + `/api/organization-secrets` routes are server-side aliases only — this FE must never call them.

Capabilities on the direct list are projected client-side (`deriveCapabilities` in `vault-service.ts`, mirroring aidream `item_capabilities`); the server re-checks every mutation and its responses carry authoritative capabilities.

## Files and entry points

| File | Role |
|---|---|
| [`types.ts`](./types.ts) | Generated wire shapes (aidream OpenAPI) + normalized `VaultItem`/`VaultField`, principal descriptor, masked column lists, definition types (Zod-inferred from the Remote Catalogs `credentialDefinitionSchema` — never redeclared), `effectiveFields` (preset fields FULLY replace base fields). |
| [`vault-service.ts`](./vault-service.ts) | THE service: `/api/vault/*` client + direct-Supabase masked reads + catalog definition loader. |
| [`vault-hooks.ts`](./vault-hooks.ts) | THE hook set: `useVault` (list + all mutations + toasts/busy), `useVaultDefinitions`, `useVaultAudit`, `useTransientSecret`. |
| [`components/VaultWorkspace.tsx`](./components/VaultWorkspace.tsx) | List/search/family-filter, item cards, detail + create + import dialogs (Credenza = Dialog/Drawer responsive). |
| [`components/VaultCreateDialog.tsx`](./components/VaultCreateDialog.tsx) | Catalog picker (family groups, search, presets) + definition-driven form + Custom builder (with `KEY=value` paste-to-fill). |
| [`components/VaultItemDetail.tsx`](./components/VaultItemDetail.tsx) | Fields (reveal/copy/edit/inject/delete, add field), rename, rotate, share (org access-mode + member grants; personal email grants via `lookup_user_by_email`), transfer, fork, soft delete, audit trail. |
| [`components/VaultEnvImportDialog.tsx`](./components/VaultEnvImportDialog.tsx) | Bulk `.env` paste/upload → `POST /api/vault/items/import-env`. |
| [`utils.ts`](./utils.ts) | `parseEnvAssignment` — single dotenv-line parser (paste-to-fill). |

## Invariants

1. Plaintext never appears in list responses, Redux, browser storage, query caches, URLs, analytics, or logs. The ONLY plaintext shape is a reveal/resolve response held in `useTransientSecret` component state with a ~30s auto-clear.
2. Never select `value_encrypted`; never `select *` on `credential_items` / `user_secrets` — explicit column lists only.
3. `sealed` fields get no show/copy affordance at any capability level.
4. One workspace, one service, one hook set. A second per-principal implementation is a defect.
5. Definitions come only from the catalog; `credentialDefinitionSchema` is imported from `features/admin/applications/catalogs/schemas.ts`, never redeclared. Adding a provider is catalog data, not React code.
6. Access never depends on the active organization — the viewed principal is an explicit prop.
7. Every mutation surfaces its error via toast; catalog rows failing schema validation are skipped LOUDLY (`console.error`).

## Known gaps (2026-07-23)

- The `/api/vault` surface has no field-metadata PATCH; the per-field sandbox toggle is a direct RLS-scoped `user_secrets.inject_into_sandbox` update — works for personal owners, refused (loud toast) for org fields until aidream adds the endpoint.
- The share API carries `access_mode` + `user_ids` (grants `can_use`); per-recipient `can_manage` granting has no wire field yet.
- aidream `/api/vault/*` is implemented in the local repo but not yet deployed to prod — until deploy, value ops surface clear error toasts while the masked list keeps rendering from Supabase.

## Change Log

- **2026-07-23** — Phase 3 unification: ONE definition-driven `VaultWorkspace` for both principals (catalog picker + presets + custom builder, reveal/copy with transient auto-clear, env import, share/transfer/fork/rotate/audit, capability-driven actions); data split direct-Supabase masked reads vs `/api/vault/*` value ops; deleted the duplicated personal/org services, hooks, and `OrganizationVaultSection`; regenerated `api-types.ts` from local aidream OpenAPI.
- **2026-07-23** — Linked the cross-repository Unified Credential Vault plan.
- **2026-07-21** — Paste-to-fill for single dotenv assignments (reusable parser).
- **2026-07-20** — Marketing Google integration connections store OAuth refresh tokens in the vault (`users.integration_connections.vault_secret_key`).
- **2026-07-19** — Organization vault v1 (superseded by the unified item model; `private_vault` storage annihilated by aidream migrations 0217/0218).
- **2026-05-28** — Initial personal vault.
