# Secrets — Unified Credential Vault

> **Status:** active · **Tier:** 1 · **Owners:** platform · **Updated:** 2026-08-22

> Cross-repo implementation authority: `/Users/armanisadeghi/code/common-docs/projects/unified-credential-vault/PLAN.md` — read it before expanding this feature in ANY repository.
>
> **Follow-on, in progress:** `/Users/armanisadeghi/code/common-docs/projects/credential-sharing-browser-login/PLAN.md` (ratified 2026-07-26) — destination-login items, one-to-one sharing/transfer/assignment, and agent-safe browser login. Read it before touching scopes, sharing, transfer, or item metadata.
>
> **Cloud Browser follow-on:** `/Users/armanisadeghi/code/common-docs/projects/persistent-cloud-browser/PLAN.md` — read it before adding server-side profile login, unattended credential use, MFA delegation, session-health automation, or Cloud Browser controls.
>
> **Picking this up cold?** `/Users/armanisadeghi/code/common-docs/projects/credential-sharing-browser-login/HANDOFF.md` — vision, gap analysis, cross-repo architecture, next steps, and landmines. Start there.

ONE definition-driven vault for both principals — personal and organization — covering env values, API keys, logins, tokens, service accounts, and multi-field credential bundles. A **credential item** (`users.credential_items`) owns one or more encrypted **fields** (`users.user_secrets`); non-secret **definitions and provider presets** come from Remote Catalogs (`public.catalog_entries`, kind `credential_definition`, app `matrx`, 120+ active).

Items may also own multiple encrypted **protected files**
(`users.credential_attachments`) such as signing keys, certificates, and
recovery exports. Attachment metadata is shown as explicit labeled values
(label, filename, purpose, type/size, protection); bytes never enter list JSON,
Redux, storage, URLs, or logs.

## The one workspace

`components/VaultWorkspace.tsx` is the ONLY vault UI. It receives a `VaultPrincipal` (`{type:'user'}` or `{type:'organization', organizationId}`); which actions render is decided by each item's `capabilities` (`can_use` / `can_edit` / `can_reveal` / `can_manage`) — never by principal-specific component forks. Surfaces:

- Personal: [`app/(core)/vault/page.tsx`](<../../app/(core)/vault/page.tsx>). The legacy `/settings/secrets` URL redirects here; it does not render a second settings-shaped Vault.
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

**Sandbox injection REQUIRES an env alias.** A container environment is a NAME→value map; a field with no `key` has nowhere to land, so the resolver drops it. The server refuses `inject_into_sandbox=true` with no alias (422, `SandboxInjectionWithoutEnvKeyError`) and a DB CHECK makes the state unrepresentable. The UI may keep the switch interactive, but turning it on without a runtime key must show a focused reminder and move focus to the runtime-key input; it must never build the invalid request. Until 2026-07-26 the toggle was live on keyless fields and flipping it "succeeded" while the value silently never reached any sandbox — the exact class this rule kills. Note that catalog definitions `env_value` and `visible_config` ship `inject_into_sandbox: true` with no default alias, so prompting for the key is the NORMAL path there, not an edge case.

Field metadata (inject flag, env alias set/clear, description, `is_active`, handling, `editable`) is edited via `PATCH /api/vault/items/{id}/fields/{fid}` — there is NO direct client write path to `users.user_secrets` (all client write grants were revoked in Phase 1). **Sealing is a one-way door:** the UI confirms with a cannot-be-undone warning, a sealed field shows a lock and no unseal control, and the server 403s any change away from `sealed`. Sharing carries per-recipient grants (`grantees: [{user_id, can_use, can_manage}]`).

## Trust boundary — two data paths, one per operation

1. **Masked metadata → DIRECT Supabase.** Items + fields + catalog definitions are read via supabase-js with the **explicit column lists** `CREDENTIAL_ITEM_COLUMNS` / `VAULT_FIELD_COLUMNS` (`types.ts`). `users.user_secrets.value_encrypted` is unreadable by client roles — **never `select *` on these tables.** Scope is declared per THE VIEW LAW — see Scopes below; RLS provides owner reads, org-member masked reads, personal-grantee reads, and self-reads on `user_secret_grants`.
2. **Everything value-bearing or mutating → aidream `/api/vault/*`** (`vault-service.ts`): create/update/delete items and fields, import-env, reveal, resolve, rotate, share, transfer, fork, audit. The legacy `/api/user-secrets` + `/api/organization-secrets` routes are server-side aliases only — this FE must never call them.

Every Vault and Authenticator aidream transport requires the explicitly
selected request organization from `appContext.organization_id` and sends it
through `lib/api/organization-context.ts` as `X-Organization-Id`.
`personal_organization_id` is never substituted. The
transport itself refuses to call `fetch` when that request context is absent,
including for personal Vault rows; organization context accompanies the
request but does not replace the `user_id = auth.uid()` ownership boundary.
The server's `/vault` and `/authenticator` routers independently require the
same header and exact middleware-context agreement before any handler runs.

Attachments keep the same split: `CREDENTIAL_ATTACHMENT_COLUMNS` reads only
safe metadata directly from Supabase; `features/files/vault/vaultAttachmentTransport.ts`
is the one browser byte path to aidream multipart upload/replace and no-store
download. It is deliberately separate from ordinary cloud-file storage because
the bytes stay inside the credential encryption boundary.

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

The personal surface shows My credentials / Shared with me / Organization.
Organization is one bounded destination with an explicit membership dropdown;
it never expands into an unbounded chip row and never follows the active org.
The organization-management embed remains fixed to its host organization.

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

## Shared UI contract (2026-07-28)

Personal and organization credentials render through the same
`VaultWorkspace`; their vocabulary and interaction model may not diverge.

- Detailed metadata is labeled. Canonical labels live in `VAULT_LABELS`;
  screens import them instead of inventing nearby synonyms. Familiar list and
  detail identity headers use title + supporting metadata without repeating
  database-form labels such as "Credential name" and "Credential type."
- **Detail is complete; lists are concise.** Detail metadata wraps and is shown
  in full. List rows use exactly two lines—name plus one deduplicated supporting
  value—and truncate each line instead of growing vertically.
- A protected value has exactly two human-visible states: **Hidden**, or the
  complete transiently revealed value. `value_hint` is transport metadata and
  must never be rendered as a partial mask. The shared `SecretValue` keeps
  reveal/copy as small trailing icon actions, displays a visible auto-hide
  countdown after reveal, and clears plaintext after about 30 seconds.
- `visible` means visible: Standard fields resolve as their row mounts and
  display normally for the mounted view, with copy but no meaningless eye
  toggle. Only `revealable` fields begin Hidden and auto-clear after an
  explicit reveal. Custom username/email/account fields default to Standard;
  passwords and unknown fields default to Restricted.
- Every field edit uses the shared three-way **Protection** control: Standard,
  Restricted, or Automation only. The UI says plainly that every value is
  encrypted at rest; the control changes human reveal permission, not whether
  encryption exists. Stored Automation-only values render as a locked status
  because sealing is a permanent one-way action.
- A credential has one **Edit credential** mode. Name, description, field
  replacement, runtime-key metadata, access, status, notes, URLs, and other
  details are edited inside it; independent rename/rotate/edit-note controls
  are forbidden. The code-first Authenticator list has one deliberate compact
  exception: its row menu may rename the same credential directly so a person
  does not have to leave an active six-digit-code task just to fix its label.
- **Edit is dense, not card-within-card.** Name and description edit inline
  without a redundant “Credential details” container. A field's display and
  editor occupy the same row: reveal/copy/edit/delete are trailing icon actions,
  and Edit replaces the value in place until Save or Cancel. Runtime key and
  description are compact inline metadata, with the runtime key identified as
  “used for identification in workflows.” The sandbox switch says only
  “Available in sandboxes”; a missing runtime key is interaction feedback, not
  permanent wrapping prose. Custom fields live under the explicit heading
  “Additional fields.” Full-width action rows that merely repeat “Save field
  changes” or “Delete field” are forbidden.
- Website metadata renders only for `website_login`, an item with existing
  login URLs, or a legacy credential whose URL can be promoted. A generic API
  or environment credential must not be presented as a website login.
- `/vault` uses the familiar password-manager master/detail shape: a left
  navigation pane for scope and type, a compact middle credential list, and a
  persistent right detail pane. Mobile opens the same detail component in a
  responsive Credenza. Embedded window/org hosts keep the compact presentation
  of the same workspace because they do not own a full viewport. The former
  settings host redirects to `/vault` instead of embedding the compact card grid.
- `/vault/[itemId]` is the canonical credential route. Selection navigates
  between path segments and closing returns to `/vault`; credential identity
  never rides a query parameter.
- A list row carries compact identity only: icon, title, and one deduplicated
  supporting line. It never adds a third URL/type line or renders credential
  fields. Full metadata and encrypted fields stay in the detail pane.
- Every scope loads `credential_items` by `created_at DESC` with `id DESC` as
  the stable tie-breaker, so a newly created credential appears first after
  the mutation refresh.
- New credential starts with four plain-purpose choices: Website login, API
  key, Environment value, Secure file, and Custom credential. The full catalog remains
  searchable behind **Browse all**.
- Website-login creation is progressive: name is the item identity; website,
  username, password, authenticator setup, recovery codes, secure notes, and
  protected files are independent optional parts. Save whatever is known now
  and complete the same item later. `/vault/authenticator` opens this exact
  canonical form directly at Website login; it has no second creation form.
- Recovery codes are a Restricted encrypted field, never plaintext notes. The
  detail view reveals them transiently, copies one code at a time, and removes
  a code through **Mark used**. Secure notes are also Restricted fields.
- Protected files live in the same single Edit credential mode. Users can add
  multiple files, edit label/purpose/download filename/protection, replace
  bytes, download, and delete. Sealing is confirmed as a permanent one-way
  action; sealed files have no human download affordance.
- Website-login password fields offer browser-local cryptographic generation
  plus explicit Show/Hide. Generated values remain only in the transient create
  form, exactly like a typed value, and are never logged or persisted outside
  the normal create request.
- Every saved login destination is a labeled **Open website** door when it is
  an absolute HTTP(S) URL. Unsafe schemes and malformed addresses remain plain
  text with an Invalid URL warning; they never become clickable.
- Destination entry accepts a bare host such as `npmjs.com`. On blur, the UI
  writes the normalized HTTPS URL back into the field, removes query/fragment
  navigation state, and asks aidream for an advisory public-site check. A
  confirmed site gets a compact success state; invalid or unreachable sites
  get useful feedback, but temporary reachability failure never blocks saving
  a partial credential.
- A scope switch immediately presents an empty loading view keyed to the new
  scope. Late responses from Mine, Shared with me, or another organization are
  discarded and can never appear under the newly selected scope label.
- Every Credenza form is a bounded 92dvh mobile Drawer with one flex scroll
  body, safe-area padding, 16px inputs/comboboxes/textareas, and 44px buttons;
  variable content can never push its save action outside a non-scrolling view.

## Files and entry points

| File                                                                           | Role                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`types.ts`](./types.ts)                                                       | Generated wire shapes (aidream OpenAPI) + normalized `VaultItem`/`VaultField`, principal descriptor, masked column lists, definition types (Zod-inferred from the Remote Catalogs `credentialDefinitionSchema` — never redeclared), `effectiveFields` (preset fields FULLY replace base fields). |
| [`credential-identity.ts`](./credential-identity.ts)                           | Pure, metadata-only identity builder shared by Vault list/detail surfaces: icon/accent, human credential kind, host, and a deduplicated subtitle/meta line.                                                                                                                                      |
| [`vault-service.ts`](./vault-service.ts)                                       | THE service: `/api/vault/*` client + direct-Supabase masked reads + catalog definition loader.                                                                                                                                                                                                   |
| [`vault-hooks.ts`](./vault-hooks.ts)                                           | THE hook set: `useVault` (list + all mutations + toasts/busy), `useVaultDefinitions`, `useVaultAudit`, `useTransientSecret`.                                                                                                                                                                     |
| [`components/VaultWorkspace.tsx`](./components/VaultWorkspace.tsx)             | Full three-pane route workspace plus compact embedded presentation, both sharing the same list/search/family filters, detail, create, and import flows (Credenza = Dialog/Drawer responsive).                                                                                                    |
| [`components/VaultContextMenu.tsx`](./components/VaultContextMenu.tsx)         | THE right-click menu for the vault (v3 `NonEditableContextMenu`), mounted once by `VaultWorkspace` so `/vault` and the floating Vault window share it. Builds the menu payload by hand from non-secret metadata and passes it as `getApplicationScope`, which bypasses the shell's DOM-text fallback; `selection` is forced empty. See invariant 8.                        |
| [`components/VaultHandlingControl.tsx`](./components/VaultHandlingControl.tsx) | Shared Standard / Restricted / Automation-only protection selector and current-state presentation for fields and protected files.                                                                                                                                                                |
| [`components/SecretValue.tsx`](./components/SecretValue.tsx)                   | Canonical masked value row with audited reveal, direct copy, compact icon actions, and transient plaintext countdown/auto-clear.                                                                                                                                                                 |
| [`components/VaultCreateDialog.tsx`](./components/VaultCreateDialog.tsx)       | The one create form for Vault and Authenticator: basic-purpose picker/full catalog, progressive website login parts, TOTP, recovery codes, secure notes, protected files, local password generation, and Custom builder.                                                                         |
| [`components/VaultItemDetail.tsx`](./components/VaultItemDetail.tsx)           | Labeled fields with hidden/full reveal and one credential edit mode, including authenticator, protected files, and first-class recovery-code copy/Mark-used behavior, plus share, transfer, fork, soft delete, and audit trail.                                                                  |
| [`components/VaultEnvImportDialog.tsx`](./components/VaultEnvImportDialog.tsx) | Bulk `.env` paste/upload → `POST /api/vault/items/import-env`.                                                                                                                                                                                                                                   |
| [`authenticator-service.ts`](./authenticator-service.ts)                       | `/api/authenticator/*` client — metadata plus the signed-in owner's short-lived current-code request; never a seed.                                                                                                                                                                              |
| [`authenticator-otpauth.ts`](./authenticator-otpauth.ts)                       | Pure client parse of a setup key / `otpauth://` URI, kept in lockstep with aidream's `otpauth.py`, for the instant enrollment preview.                                                                                                                                                           |
| [`hooks/use-authenticator.ts`](./hooks/use-authenticator.ts)                   | Authenticator metadata/manage hook: list, rename, enable/disable, and remove. Login creation/enrollment stays in the canonical Vault form.                                                                                                                                                       |
| [`components/authenticator/`](./components/authenticator/)                     | The `/vault/authenticator` code-first workspace; Add opens `VaultCreateDialog` directly at Website login, and saved rows expose rotating codes plus Vault/rename/enable/remove actions.                                                                                                          |
| [`utils.ts`](./utils.ts)                                                       | `parseEnvAssignment` (single dotenv-line paste-to-fill) + `generateVaultPassword` (Web Crypto, unambiguous alphabet, all basic character groups).                                                                                                                                                |

## Authenticator enrollment (2026-08-22)

`/vault/authenticator` is the GA manage surface for the Matrx Authenticator
(cross-repo spec: `common-docs/systems/clients/matrx-authenticator/FEATURE.md`). It is
**enroll + use + manage** — the signed-in owner sees the current rotating code;
the sealed setup seed has no reveal path at any privilege.

- **One add process.** Authenticator's Add action opens the same
  `VaultCreateDialog` used by Vault, directly at Website login. Name, URL,
  username, password, 2FA method/setup key, recovery codes, secure notes, and
  protected files are parts of one item instead of separate records or forms.
- **Save progress at any point.** Website fields override catalog-required
  presentation: any meaningful known value can be saved. Selecting
  Authenticator app without having its setup key does not block save; the key
  can be added later from the saved item's Two-factor section.
- **Every TOTP intake route stays available.** The canonical form reuses
  `<QrCodeInput>` for pasted/dropped/chosen QR images and live camera scan,
  plus a manual setup-key field. QR images decode locally and are never
  uploaded.
- **Enrollment is additive.** A valid setup key is enrolled after the login is
  created. If enrollment fails, the login and every other protected part stay
  saved, and the error points back to that item's Two-factor section.
- **Existing logins are completed in place.** Open the item from Authenticator
  or Vault and use its Two-factor section; never create a sibling
  authenticator-only credential.
- **Every entry is a door.** The account name and its row menu open THAT
  credential via `/vault/[itemId]` (the deep link `VaultPage` now owns); the
  menu also offers Rename login and a new-tab door without cluttering the
  code-first list. Renaming updates the credential item's `display_name`, so the
  Authenticator and Vault never diverge.

## Invariants

1. Plaintext never appears in list responses, Redux, browser storage, query caches, URLs, analytics, or logs. The ONLY plaintext shape is a reveal/resolve response held in `useTransientSecret` component state with a ~30s auto-clear.
2. Never select `value_encrypted`; never `select *` on `credential_items` / `user_secrets` — explicit column lists only.
3. `sealed` fields get no show/copy affordance at any capability level.
4. One workspace, one service, one hook set. A second per-principal implementation is a defect.
5. Definitions come only from the catalog; `credentialDefinitionSchema` is imported from `features/admin/applications/catalogs/schemas.ts`, never redeclared. Adding a provider is catalog data, not React code.
6. Access never depends on the active organization — the viewed principal is an explicit prop.
7. Every mutation surfaces its error via toast; catalog rows failing schema validation are skipped LOUDLY (`console.error`).
8. **The context menu never carries a secret.** A revealed `SecretValue` puts plaintext in the DOM, so the vault menu must never let the v3 shell self-resolve `content` from the subtree and must never carry the user's `selection` — it passes an explicit `getApplicationScope` built from names, type, provider, host, status, tags and FIELD KEYS only. Never a field value, never `notes`, never a non-secret custom field's value (a user can and does paste a secret into a free-text box). No `entity` is passed either, so Attach To / Share stay hidden: a credential is not agent context.

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

## Change Log

- **2026-08-24** — Moved Vault and Authenticator JSON calls onto the shared
  organization-context kernel, moved the protected-file byte adapter onto the
  same UUID admission, rejected conflicting caller headers instead of overriding
  selected context, and pinned missing/malformed JSON plus multipart zero-I/O
  behavior in the non-skippable frontend release gate.

- **2026-08-24** — Vault gained its canonical v3 right-click menu
  (`components/VaultContextMenu.tsx`), mounted by `VaultWorkspace` so `/vault`,
  the org embed and the floating Vault window all get it from ONE wiring — and
  the window therefore stops being answered by the page underneath it. Rows
  carry a `data-vault-item-id` anchor; the menu resolves the clicked credential
  from that attribute, never from DOM text. Invariant 8 records the security
  contract. Live-verified on `/vault`: right-clicking a credential produced
  `Name / Type / Status / Access / Tags / Fields` and nothing else, and a text
  selection over the detail pane did not become the menu's payload.

- **2026-08-23** — Restored the ratified Organization destination on the main
  Vault and its floating window. The user chooses an organization explicitly
  from current memberships; the selected role governs management actions, the
  persisted scope contains only the org id, and the organization-management
  embed remains fixed to its host principal.

- **2026-08-22** — Collapsed credential field display and editing into one
  compact surface: value actions now sit on the value row, Edit replaces the
  value in place, runtime key and description are inline metadata, sandbox
  eligibility no longer adds permanent helper prose, and custom values are
  explicitly grouped as Additional fields.

- **2026-08-22** — Replaced `?item=<id>` with canonical `/vault/[itemId]`
  credential routes across Vault and Authenticator, then began the focused edit
  density pass: removed the redundant credential-details card and replaced
  full-width credential/field save-delete rows with labeled icon actions.

- **2026-08-22** — Sorted every Vault scope newest-created first and replaced
  expanding list cards with one shared two-line identity treatment: icon,
  truncated name, and one truncated supporting line; fields and verbose
  metadata remain complete in detail.

- **2026-08-22** — Completed the Vault route identity follow-up with a
  Vault-specific document title and semantic H1 in the shared route header.

- **2026-08-22** — Made destination entry forgiving and self-validating in
  both create and edit flows: bare hosts normalize to HTTPS on blur, iPhone-safe
  16px inputs avoid zoom, and an advisory server-side public-site probe returns
  a compact confirmed/warning state without making remote availability a save
  requirement.

- **2026-08-22** — Unified Authenticator Add with the canonical Website login
  form; website parts now save progressively instead of requiring URL,
  username, password, and TOTP together. Added optional Restricted recovery
  codes with per-code Copy/Mark-used behavior, Restricted secure notes, and
  multi-file protected attachments during login creation. Hardened the shared
  Credenza mobile primitive to 92dvh, one scroll body, safe-area padding, 16px
  controls, and 44px buttons so variable content cannot trigger iOS zoom or
  hide Save below an unscrollable sheet.

- **2026-08-21** — The website-login create flow is now the ONE recipe (Arman's
  ruling: username + password + 2FA captured together; SoR
  `/Users/armanisadeghi/code/common-docs/projects/credential-sharing-browser-login/DECISIONS.md`):
  `VaultCreateDialog` adds a two-factor section (off / authenticator app —
  seed enrolls on the SAME item right after create / SMS / push-other — the
  non-app choice is written as the `mfa_method` non-secret field so agents
  KNOW to hand control back at verification). `VaultItemDetail` gains an
  Authenticator section on website logins (status, on/off, remove, inline
  setup-key enrollment, recorded non-app method). Enrollment targets are
  website logins ONLY (`use-authenticator`), and the enroll dialog's
  suggestion matches the issuer against login-URL HOSTS only — display-name
  substring matching enrolled a Google seed on an unrelated oauth_client
  (root cause of the 2026-08-21 mis-attachment). `uri_match_mode` gains
  `domain` (sister-site matching, aidream eTLD+1 matcher).
- **2026-08-21** — Made Authenticator enrollment create one usable website-login
  bundle instead of a hollow authenticator-only item: labeled name, website,
  username, and password are saved first, then the sealed TOTP seed is added to
  that same item. Existing Vault items remain selectable, and the code-first row
  menu can now rename the underlying credential directly.
- **2026-08-20** — Replaced the oversized authenticator cards with a compact,
  code-first account list modeled on Google and Microsoft Authenticator: one
  provider/account identity, a tap-to-copy grouped code, live countdown ring,
  dependable favicon-to-globe fallback, and a single management menu. Search
  appears only when the list is large enough to need it; the full Vault and
  new-tab doors remain available without permanent explanatory chrome.

- **2026-08-20** — Made the authenticator usable end to end: enrollment now
  immediately returns to a large current-code screen for provider confirmation,
  and every saved authenticator leads with its site/account name and rotating
  code instead of protocol metadata. The setup seed remains sealed.

- **2026-08-20** — Rebuilt authenticator enrollment against what the best password managers actually ship: one intake control for paste / drop / file / camera scan, local QR decoding (`lib/qr/decode.ts` + the reusable `<QrCodeInput>`), an instant parsed preview, inline "A new login" creation, every vault item eligible (not just `website_login` — the empty-picker dead end), page copy cut to one sentence, and consent moved to its own confirm step. Credential deep links now use `/vault/[itemId]`.

- **2026-08-18** — Closed two Vault navigation hazards: scope results are now
  request-ordered and keyed to the active scope so stale credentials cannot
  flash after a switch, and valid login destinations are explicit safe
  Open-website actions while malformed or non-HTTP(S) values are refused.

- **2026-08-17** — Reworked the canonical full Vault around established
  password-manager patterns: full-bleed three-pane workspace, compact identity
  rows, flat grouped field rows, icon-only reveal/copy, visible auto-hide
  countdown, and one shared plain-language protection selector used across
  field and protected-file editing. All encryption and service paths remain
  unchanged.

- **2026-08-11** — Added first-class Vault file attachments and the Secure file
  create purpose. Initial creation uploads atomically from the user's point of
  view (a failed upload removes the empty item), while existing items support
  labeled multi-file management through the canonical file byte transport.

- **2026-07-28** — Removed the obsolete pre-deployment warning after the Vault API and organization-aware browser-login matching shipped through aidream.
- **2026-07-28** — Added the full-route three-pane password-manager workspace,
  responsive detail dialog, basic-purpose-first creation flow, plain-language
  purpose copy, browser-local password generation, and advanced runtime-field
  disclosure while preserving the shared compact organization/settings/window
  presentation.
- **2026-07-28** — Rebuilt the shared personal/organization vault presentation: canonical labels, full wrapping with no truncation/collapsing, hidden-or-complete value display with partial hints removed, one credential edit mode replacing scattered edit/rename/rotate controls, and website metadata limited to actual website credentials.
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
