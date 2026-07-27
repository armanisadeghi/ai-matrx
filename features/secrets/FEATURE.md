# Secrets — Unified Credential Vault

> **Status:** active · **Tier:** 1 · **Owners:** platform · **Updated:** 2026-07-26

> Cross-repo implementation authority: `/Users/armanisadeghi/code/common-docs/projects/unified-credential-vault/PLAN.md` — read it before expanding this feature in ANY repository.
>
> **Follow-on, in progress:** `/Users/armanisadeghi/code/common-docs/projects/credential-sharing-browser-login/PLAN.md` (ratified 2026-07-26) — destination-login items, one-to-one sharing/transfer/assignment, and agent-safe browser login. Read it before touching scopes, sharing, transfer, or item metadata.

ONE definition-driven vault for both principals — personal and organization — covering env values, API keys, logins, tokens, service accounts, and multi-field credential bundles. A **credential item** (`users.credential_items`) owns one or more encrypted **fields** (`users.user_secrets`); non-secret **definitions and provider presets** come from Remote Catalogs (`public.catalog_entries`, kind `credential_definition`, app `matrx`, 120+ active).

## The one workspace

`components/VaultWorkspace.tsx` is the ONLY vault UI. It receives a `VaultPrincipal` (`{type:'user'}` or `{type:'organization', organizationId}`); which actions render is decided by each item's `capabilities` (`can_use` / `can_edit` / `can_reveal` / `can_manage`) — never by principal-specific component forks. Surfaces:

- Personal: [`app/(transitional)/settings/secrets/page.tsx`](<../../app/(transitional)/settings/secrets/page.tsx>)
- Organization: `OrgManage.tsx` (`features/organizations/components/`) renders `<VaultWorkspace principal={{type:'organization',…}} canManage={…}>` in its Vault section.

The pre-unification duplicate stacks (`service.ts`, `hooks.ts`, `organization-service.ts`, `organization-hooks.ts`, `OrganizationVaultSection.tsx`) are **deleted** — do not recreate a per-principal fork.

## Item/field model and handling doctrine

Every field carries exactly three controls (independent; catalog definitions provide defaults):

| Control               | Values       | Meaning                                                                                                              |
| --------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `handling`            | `visible`    | Shown to any authorized viewer (still encrypted at rest); FE shows it via `POST /api/vault/resolve` under `can_use`. |
|                       | `revealable` | Masked; explicit audited reveal via `POST /api/vault/items/{id}/reveal` under `can_reveal`.                          |
|                       | `sealed`     | NO human path, ever — only trusted execution resolves it. The API refuses structurally.                              |
| `editable`            | bool         | Whether a human may change the value (integration-managed tokens are `false`).                                       |
| `inject_into_sandbox` | bool         | Whether the field enters authorized sandbox environments. **REQUIRES an env alias in `key`** — see below.            |

`user_secrets.key` is the **optional env alias** (`VALID_KEY_RE`); `field_key` is the stable lowercase-snake identity within the item. Legacy single-value rows are one-field `env_value` items.

**Sandbox injection REQUIRES an env alias — never offer the toggle without one.** A container environment is a NAME→value map; a field with no `key` has nowhere to land, so the resolver drops it. The server refuses `inject_into_sandbox=true` with no alias (422, `SandboxInjectionWithoutEnvKeyError`) and a DB CHECK makes the state unrepresentable. This UI must never build that request: every sandbox switch is **disabled until an env key exists**, and the create dialogs list it as a validation problem. Until 2026-07-26 the toggle was live on keyless fields and flipping it "succeeded" while the value silently never reached any sandbox — the exact class this rule kills. Note that catalog definitions `env_value` and `visible_config` ship `inject_into_sandbox: true` with no default alias, so prompting for the key is the NORMAL path there, not an edge case.

Field metadata (inject flag, env alias set/clear, description, `is_active`, handling, `editable`) is edited via `PATCH /api/vault/items/{id}/fields/{fid}` — there is NO direct client write path to `users.user_secrets` (all client write grants were revoked in Phase 1). **Sealing is a one-way door:** the UI confirms with a cannot-be-undone warning, a sealed field shows a lock and no unseal control, and the server 403s any change away from `sealed`. Sharing carries per-recipient grants (`grantees: [{user_id, can_use, can_manage}]`).

## Trust boundary — two data paths, one per operation

1. **Masked metadata → DIRECT Supabase.** Items + fields + catalog definitions are read via supabase-js with the **explicit column lists** `CREDENTIAL_ITEM_COLUMNS` / `VAULT_FIELD_COLUMNS` (`types.ts`). `users.user_secrets.value_encrypted` is unreadable by client roles — **never `select *` on these tables.** Scope is declared per THE VIEW LAW — see Scopes below; RLS provides owner reads, org-member masked reads, personal-grantee reads, and self-reads on `user_secret_grants`.
2. **Everything value-bearing or mutating → aidream `/api/vault/*`** (`vault-service.ts`): create/update/delete items and fields, import-env, reveal, resolve, rotate, share, transfer, fork, audit. The legacy `/api/user-secrets` + `/api/organization-secrets` routes are server-side aliases only — this FE must never call them.

Capabilities on the direct list are projected client-side (`deriveCapabilities` in `vault-service.ts`, mirroring aidream `item_capabilities`); the server re-checks every mutation and its responses carry authoritative capabilities.

## Scopes — every list is a deliberate query (2026-07-26)

`VaultScope` (`types.ts`) is what a list reads, and each kind declares its own
filter. **None of them is a bare RLS-filtered read** — that is the defect THE
VIEW LAW exists to prevent, and RLS widening must never silently flood a
personal vault:

| Scope          | Query                                                                                      | Notes                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `mine`         | `eq(user_id, me)`                                                                          | Keeps the explicit owner filter.                                                                        |
| `shared`       | my own `user_secret_grants` rows (`can_use`) → `in(id, thoseItemIds)` + `neq(user_id, me)` | Items OTHER people shared with me. Create/import are hidden here — the items are owned by someone else. |
| `organization` | `eq(organization_id, org)`                                                                 | Unchanged.                                                                                              |

The personal surface shows a Mine / Shared with me switcher; the organization
surface is always its own scope.

## Sharing, ownership, and assignment (2026-07-26)

**Grants are per-recipient operations, never a batch overwrite.** The share
panel LOADS current recipients (`useVaultGrants` → `GET /items/{id}/grants`)
before rendering, then adds / changes / revokes ONE grant at a time
(`addGrant` / `updateGrant` / `removeGrant`). The old panel initialized empty
and saved a replacement set, so opening Share and pressing Save silently
revoked every recipient it had never seen — **do not reintroduce a save-the-
whole-list control.** `setAccessMode` (the legacy `PUT …/share`) survives for
the ORG `all_members` ↔ `restricted` flip only.

- Recipients are named by **exact email**; the SERVER resolves it
  (`searchUserByEmail` is not used for vault sharing). No directory search, no
  autocomplete, no partial match, and the account must already exist.
- **Give ownership** (`giveOwnership`) hands a personal item to another user:
  the sender loses all access, grants are cleared, and the UI says so plainly
  — including that a transfer cannot un-see a password the sender already
  read. It is separate from **Move scope** (`transfer`), which moves between
  the actor's own personal/organization scopes.
- **Create for someone** (`assign`) creates an item already owned by the
  recipient. In generate-privately mode the server generates the password and
  never returns it — the response carries identity and confirmation only, so
  never try to display a value from it.
- A `can_use` recipient sees `visible` fields (the username) but cannot reveal
  the password; `can_manage` adds reveal + edit. Only the owner may share,
  transfer, or delete. **Ratified 2026-07-26** — the share UI states it.

## Destination login and browser fill (2026-07-26)

Items carry PLAINTEXT destination metadata — `login_urls`, `uri_match_mode`
(`host` / `exact` / `never`), `notes`, `non_secret_fields`,
`browser_fill_enabled`. These are deliberately unencrypted (the browser
matcher must read them) and protected by the same RLS as the rest of the row.
Catalog fields declare which side they land on via `storage_class`
(`metadata` | `encrypted`, default `encrypted`); `website_login` is the
worked example.

- The **Not encrypted** section is visually separate and says "Do not put
  passwords, tokens, recovery codes, or other secrets here." Keep it loud.
- Definitions that predate this keep their URL in an ENCRYPTED field
  (`wordpress_admin.site_url`, `control_panel_login.panel_url`,
  `registrar_login.portal_url` — `PROMOTABLE_URL_FIELD_KEYS`). Those items
  **cannot browser-match at all** until the user promotes the URL. The detail
  view offers a one-click "Use as login URL" that resolves the encrypted value
  and copies it into `login_urls`, stating that the address becomes visible
  unencrypted metadata. **Never promote automatically.**
- Browser fill is off by default and cannot be enabled without a login URL.
  Matching is enforced SERVER-side on every call (`/api/vault/browser-login/*`)
  — the client never decides what may be filled.

## Files and entry points

| File                                                                           | Role                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`types.ts`](./types.ts)                                                       | Generated wire shapes (aidream OpenAPI) + normalized `VaultItem`/`VaultField`, principal descriptor, masked column lists, definition types (Zod-inferred from the Remote Catalogs `credentialDefinitionSchema` — never redeclared), `effectiveFields` (preset fields FULLY replace base fields). |
| [`credential-identity.ts`](./credential-identity.ts)                           | Pure, metadata-only identity builder shared by Vault list/detail surfaces: icon/accent, human credential kind, host, and a deduplicated subtitle/meta line.                                                                                                                                      |
| [`vault-service.ts`](./vault-service.ts)                                       | THE service: `/api/vault/*` client + direct-Supabase masked reads + catalog definition loader.                                                                                                                                                                                                   |
| [`vault-hooks.ts`](./vault-hooks.ts)                                           | THE hook set: `useVault` (list + all mutations + toasts/busy), `useVaultDefinitions`, `useVaultAudit`, `useTransientSecret`.                                                                                                                                                                     |
| [`components/VaultWorkspace.tsx`](./components/VaultWorkspace.tsx)             | List/search/family-filter, item cards, detail + create + import dialogs (Credenza = Dialog/Drawer responsive).                                                                                                                                                                                   |
| [`components/VaultCreateDialog.tsx`](./components/VaultCreateDialog.tsx)       | Catalog picker (family groups, search, presets) + definition-driven form + Custom builder (with `KEY=value` paste-to-fill).                                                                                                                                                                      |
| [`components/VaultItemDetail.tsx`](./components/VaultItemDetail.tsx)           | Fields (reveal/copy/edit/inject/delete, add field), rename, rotate, share (org access-mode + member grants; personal email grants via `lookup_user_by_email`), transfer, fork, soft delete, audit trail.                                                                                         |
| [`components/VaultEnvImportDialog.tsx`](./components/VaultEnvImportDialog.tsx) | Bulk `.env` paste/upload → `POST /api/vault/items/import-env`.                                                                                                                                                                                                                                   |
| [`utils.ts`](./utils.ts)                                                       | `parseEnvAssignment` — single dotenv-line parser (paste-to-fill).                                                                                                                                                                                                                                |

## Invariants

1. Plaintext never appears in list responses, Redux, browser storage, query caches, URLs, analytics, or logs. The ONLY plaintext shape is a reveal/resolve response held in `useTransientSecret` component state with a ~30s auto-clear.
2. Never select `value_encrypted`; never `select *` on `credential_items` / `user_secrets` — explicit column lists only.
3. `sealed` fields get no show/copy affordance at any capability level.
4. One workspace, one service, one hook set. A second per-principal implementation is a defect.
5. Definitions come only from the catalog; `credentialDefinitionSchema` is imported from `features/admin/applications/catalogs/schemas.ts`, never redeclared. Adding a provider is catalog data, not React code.
6. Access never depends on the active organization — the viewed principal is an explicit prop.
7. Every mutation surfaces its error via toast; catalog rows failing schema validation are skipped LOUDLY (`console.error`).

## MCP connections (Phase 4 cutover, 2026-07-23)

MCP is a vault consumer, not a token store. `tool.mcp_user_conn` is a
NON-SECRET connection record (`credential_item_id` + `auth_method` +
status/scopes/expiry metadata); the tokens/keys live in a sealed vault item
owned by the connecting user (`definition_key='oauth_token_set'` or
`'mcp_auth'`, `source='mcp'`, fields `sealed` + `editable=false`).

- **The browser never holds an MCP token.** The OAuth callback
  (`app/api/mcp/oauth/callback`) still exchanges the code (it holds the PKCE
  verifier) but POSTs the token response to aidream
  `/api/mcp-connections/{server_id}/oauth-tokens` — it never writes token
  columns. The old browser refresh path (`mcp-client/token-refresh.ts`), the
  browser MCP JSON-RPC client, and the `/api/mcp/servers/[serverId]/*` Next
  routes are DELETED.
- Discovery/invocation/refresh/disconnect run in aidream with vault-resolved
  auth via `features/agents/services/mcp-connections.service.ts`; refresh is
  server-side (atomic battery rotation of the same vault fields).
- Manual methods (bearer / API-key header / stdio env) post through
  `connectServerWithCredentials` → aidream `/credentials` → sealed vault item.
- `upsert_mcp_connection` is metadata-only (config/transport/endpoint
  override) — the pgcrypto functions and token bytea columns were dropped
  (aidream migrations `0237` / `0237b`).
- Disconnect (aidream `DELETE /api/mcp-connections/{server_id}`) clears the
  connection AND soft-deletes the owned vault item.

## Known gaps (2026-07-23)

- aidream `/api/vault/*` is implemented in the local repo but not yet deployed to prod — until deploy, value ops surface clear error toasts while the masked list keeps rendering from Supabase.

## Change Log

- **2026-07-26** — Closed the silent sandbox-injection gap: every sandbox switch (item detail, add-field, both create dialogs) is disabled until the field has an env key, the create dialogs surface it as a validation problem, and no build path can send `inject_into_sandbox=true` with a null alias. Backed by an aidream write refusal + a DB CHECK.
- **2026-07-26** — Sharing, ownership, and destination-login build (ratified plan): Mine / Shared-with-me / Organization scopes, each a deliberate query; per-recipient grant CRUD replacing the destructive save-the-whole-list share panel; give-ownership to another user by exact email; create-for-someone with server-side password generation; plaintext destination metadata with the loud Not-encrypted section, browser-fill toggle, and one-click promotion of an encrypted `site_url`/`panel_url` into `login_urls`. Also pinned `--default-non-nullable false` in aidream's type generator — openapi-typescript v7 had started marking every defaulted property required, churning ~1800 lines and breaking partial-patch call sites.
- **2026-07-23** — Phase 4 MCP/OAuth cutover: MCP tokens moved to sealed vault items; browser token paths deleted; refresh/persist/disconnect run in aidream `/api/mcp-connections/*`. Live finding: the legacy pgcrypto store NEVER held a token (its shared key was never configured) — all 4 connections stamped `expired` for re-auth.
- **2026-07-23** — Alignment with final vault API: field-metadata PATCH (env alias set/clear, description, active, one-way seal with confirm; deleted the interim direct `inject_into_sandbox` write) and per-recipient share grantees with a Can-manage toggle (org members + personal email lookup); types regenerated.
- **2026-07-26** — Repaired the credential identity return contract: `metaLine` is always returned and duplicate name-like subtitles are suppressed, restoring a clean type-check for Vault list/detail consumers.
- **2026-07-23** — Phase 3 unification: ONE definition-driven `VaultWorkspace` for both principals (catalog picker + presets + custom builder, reveal/copy with transient auto-clear, env import, share/transfer/fork/rotate/audit, capability-driven actions); data split direct-Supabase masked reads vs `/api/vault/*` value ops; deleted the duplicated personal/org services, hooks, and `OrganizationVaultSection`; regenerated `api-types.ts` from local aidream OpenAPI.
- **2026-07-23** — Linked the cross-repository Unified Credential Vault plan.
- **2026-07-21** — Paste-to-fill for single dotenv assignments (reusable parser).
- **2026-07-20** — Marketing Google integration connections store OAuth refresh tokens in the vault (`users.integration_connections.vault_secret_key`).
- **2026-07-19** — Organization vault v1 (superseded by the unified item model; `private_vault` storage annihilated by aidream migrations 0217/0218).
- **2026-05-28** — Initial personal vault.
