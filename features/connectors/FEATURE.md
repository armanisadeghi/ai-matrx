# FEATURE.md — `connectors`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-17`

---

## Purpose

**The connector primitive** — the generic card, consent dialog, per-capability
health rows and settings panel that every provider is offered through, with
Google as the first provider config (`common-docs/projects/google-native/PLAN.md`
§2, §5.2, §5.3). Plus the user-facing catalogue of external systems a person can attach to their account, plus **`ConnectorStrip`** — the one-line reminder that sits _under the agent input_ and offers the connections a conversation could use. Normal chat shows exactly three fairly rotated, proven-connectable integrations and a `More` door. `More` opens the complete live-only catalogue in a canonical `WindowPanel`; unproven, local-only, and coming-soon Settings placeholders are deliberately excluded.

---

## Entry points

**Components**

- `features/connectors/ConnectorStrip.tsx` — `<ConnectorStrip />`. Client, presentational, props-driven.
- `features/connectors/ConnectorMark.tsx` — the ONE provider-artwork renderer. First-party connectors use local SVG marks; dynamic MCP connectors walk a provider-specific artwork chain (website favicon → known brand glyph → catalogue art → cached 128px favicon), with the catalogue brand color as the final failure fallback.
- `features/connectors/google-status.ts` — the ONE Google scope→product mapping, DERIVED from `provider-config.ts` since 2026-09-17 (`GOOGLE_PRODUCT_SCOPES`, plus the legacy `GOOGLE_CONNECTOR_SCOPES` projection for the registry ids). A scope mapping anywhere else is a fork.

**The connector primitive** (generic; the provider is a config, never a component)

- `features/connectors/provider-config.ts` — `ConnectorProviderConfig` + `GOOGLE_CONNECTOR_PROVIDER`. Nine Google product rows, two groups, one FINAL user-facing sentence each, each row's grant bundle, its server capability keys, and its attachable resource types. **Rollout state is not here** — it comes from the server catalog at request time (PLAN §2: it flips with no rebuild).
- `features/connectors/health.ts` — pure derivation of the per-capability health row: `productHealth`, `accountHealth`, `requiredScopesFor`, `productIsEligible`, `revokeConsequence`, plus `rolloutSentence` (the rollout state in plain words — no capability key ever reaches a person) and `preferredAccountId` (which account a consent surface opens on: the one the surface names, else the usable account holding the most live products). Also the generic `ConnectorAccount` / `ConnectorCapabilityRollout` / `ConnectorProductActivity` shapes every provider adapter reports in; a row's `actionLabel` **and its `actionScope`** are the single place "Connect" vs "Reconnect" and "this product" vs "this whole account" are decided (`grantNeedsRenewal` / `accountRenewalProductKeys` read them, so no surface re-derives a renewal), and `CONNECTOR_REFUSAL_CODES` / `refusalDisposition` are the single place a provider's refusal code becomes an expectation (reconnect · heals itself · ours to repair · retry · someone else must share it).
- `features/connectors/consent-plan.ts` — pure: `buildConsentPlan` (what to ask for; `renewals`, the products whose GRANT is renewed although no scope is missing — derived from the account's health, never passed in; and `blocked`, every switched-on product that cannot be asked for, with its own reason), `emptyPlanAnswer` (**the ONE sentence a press with nothing to send gets**, on every surface — it names the blocked rows first, so "already connected" can never print over a row reading Not working) and `consentOutcomes` (per-row truth read back from the account after the exchange).
- `features/connectors/google-capability-health.ts` — part of the Google adapter: reads `users.integration_connections.capability_health` (the server's per-capability call record) through a `__kind` runtime guard and folds the capability keys into the provider-agnostic per-PRODUCT `activity` map `health.ts` takes. No component ever sees a capability key or a Google shape.
- `features/connectors/google-adapter.ts` — the ONE file in the primitive allowed to name Google: `useGoogleConnectorState` (inventory + capability catalog → generic shapes), `useGoogleConsentRunner` (one GIS window, one `/exchange`), `ADMISSION_LANGUAGE` (a catalog code → a rollout sentence) and `GOOGLE_FAILURE_LANGUAGE` + `consentFailureAnswer` (**the ONE translation of a failed press**: our sentence per code the hub can raise, else one honest generic sentence, with the server's raw words carried separately for the disclosure and never inlined).
- `features/connectors/ConnectorPromptCard.tsx` — the dismissible offer card, plus `shouldShowConnectorPrompt` (pure). `ConnectorPromptHost.tsx` is its wired form.
- `features/connectors/ProductPermissions.tsx` — **the ONE permission disclosure**, mounted by both the consent dialog and the health rows: the provider's own scope strings with plain words beside them, the rollout sentence, and this product's last success / last refusal. A real `<button>` with `aria-expanded`, because the tooltip it replaced could not be opened by a finger. Never write a second one.
- `features/connectors/ConnectorConsentDialog.tsx` — `ConnectorConsentBody` (collapsible groups, the rows, toggles, the account select with "Use a different Google account", the org switch, the result view) and the `connectorConsentDialog` overlay around it. `newAccountChoiceDescription` / `newAccountFootnote` are the switcher's promises about what the hub will do with a login that is already connected.
- `features/connectors/ConnectedAccountHealth.tsx` — the per-account, per-product health rows with Connect/Reconnect, Disconnect, and — when the account's CREDENTIAL is dead — ONE account-level Reconnect that renews every product it holds. `ConnectorBusyAction` (`accountId` + `productKey`) is the only way to say which press is running; the card checks the id against its own account.
- `features/connectors/ConsentFailureNotice.tsx` — the ONE failure presentation for both consent surfaces: the sentence, and the server's raw words behind a real disclosure button (never a hover, never inline).
- `features/connectors/ConnectorsSettingsPanel.tsx` — Settings → Connectors: the health cards plus the same consent body, and the only file in the panel path that names Google.
- `features/connectors/ChatConnectorStrip.tsx` — draws exactly three providers from the persisted fair-rotation bag, resolves their live state, and opens the full integrations window from `More`. Mounted under the real chat composer by `AgentConversationColumn`.
- `features/connectors/LiveIntegrationsList.tsx` — searchable, live-only provider list shared by the floating window. Every named provider has a real Connect, Configure, or Manage door.
- `features/connectors/useLiveConnectors.ts` — the ONE container for connection state and actions across the strip and full list. Google uses the Google connect window; MCP entries use the canonical route selector and OAuth/no-auth/GitHub/configure path.
- `features/connectors/live-connectors.ts` — merges seeded Google/Gmail/Notion definitions with the usable MCP catalogue and enforces the live boundary.
- `features/connectors/rotation.ts` — pure randomized-bag selection and persisted-state parser.
- `features/marketing/google/hooks.ts` and `service.ts` — the shared Google inventory query is **auth-gated twice**: Redux prevents pre-hydration scheduling, and the service requires a live Supabase bearer token immediately before PostgREST. Redux identity can briefly outlive a signed-out client; querying `users.integration_connections` while anonymous is a producer bug because the table is intentionally granted only to `authenticated`. The browser selects generated `credential_present` / `credential_stable` facts; `credential_item_id` and `vault_secret_key` remain private server-side references.

- `features/connectors/attachable-resources.ts` — the ONE decision separating a **plain** connection (a pure MCP server: nothing to choose) from an **attachable** one (GitHub, Google: the useful act is choosing WHICH repositories or files). Pure; driven only by the availability payload's `attachable` list, with NO provider list in the client.
- `features/connectors/attachments.service.ts` — `/api/connections/resources` + `/api/conversations/{id}/attachments` (list / attach / detach). Errors are raised, never swallowed into an empty list.
- `features/connectors/redux/attachments.slice.ts` — `conversationAttachments`: landed `rows`, held `pending` picks, read status, write error.
- `features/connectors/useConversationAttachments.ts` — the ONE container every attachment surface reads through, including the `/chat/new` handoff and the capability gate.
- `features/connectors/ResourceAttachPicker.tsx` — the chooser. One picker for every provider; inventory providers filter locally, live providers search on a debounce and SAY they are searching.
- `features/connectors/AttachResourceDialog.tsx` — overlay container binding the picker to the conversation.
- `features/connectors/AttachedResourcesSection.tsx` — the attached list with per-item remove and an "Add more" door; mounted in the Tools picker.
- `features/connectors/useAttachResourcePicker.ts` — the ONE door to the chooser (`attachResourcePicker` overlay).

**Config**

- `features/connectors/registry.ts` — `CONNECTORS`, `connectorsFor(surface)`, `getConnector(id)`.
- `features/connectors/types.ts` — `ConnectorDefinition`, `ConnectorSurface`, `ConnectorStatus`, `ConnectorStatusSource`.
- `features/connectors/marks.tsx` — local brand marks + `lucideMark(Icon)` fallback.

**Routes**

- `features/overlays/openers/connectorConsentDialog.tsx` — the ONE door to "Choose what to connect" (`useOpenConnectorConsentDialog`).
- `features/connectors/import/` — **the two Google import panels** (Google-native PLAN §4.5, §4.7). `GoogleContactsImportPanel.tsx` (search → the field map → save through the governed party resolver) and `GoogleTasksImportPanel.tsx` (task lists, checkboxes, already-imported badges, the server's honest count line). `service.ts` is the client half of `/google-import/*`; `types.ts` holds its `*Pending` stand-in contracts and the remedy that removes them; `contract.ts` is the ONE adapter that narrows what steers copy (the field-action set, the match state) with a runtime check, so a state a newer server sends can never render blank; `field-labels.ts` turns a column key into words and writes the provenance sentence, shared by both panels. Openers: `features/overlays/openers/googleImportWindows.tsx` (`useOpenGoogleContactsImport`, `useOpenGoogleTasksImport`); window entries `features/window-panels/windows/google-import/*`.
- `features/window-panels/windows/connectors/LiveIntegrationsWindow.tsx` — canonical floating all-live-integrations window; fullscreen on mobile.
- `app/(dev)/demos/connector-strip/page.dev.tsx` — every strip state side by side (nothing / some / all connected, compact, surface filters, raised intents).

**Redux slice(s)** — `conversationAttachments` (`redux/attachments.slice.ts`). The connector catalogue itself still holds no state; what a person CHOSE out of a connection does, keyed by conversation.

**API endpoints** — `/google-import/contacts/fields`, `/google-import/contacts/search`, `/google-import/contacts/import`, `/google-import/tasks/list`, `/google-import/tasks/import` (aidream `services/google_import`). Nothing else here owns an endpoint.

---

## Data model

No tables of its own. Google connectors use `features/marketing/google/service.ts → listGoogleConnectionInventory()` (Supabase-direct), the same source `features/google-workspace/connection.ts` uses. That read now also selects **`capability_health`** — the jsonb column the hub's recording seam writes one object per capability key into (`{last_success:{at,action}, last_refusal:{at,action,code,sentence,http_status}}`, under the `__kind` marker `google_connection_capability_health`). `types/database.types.ts` predates the column, so the query is typed with `.returns<ConnectionRow[]>()` over the hand-declared `CapabilityHealthPending` stand-in (`features/marketing/google/types.ts`) and TWO compile-time guards in `service.ts`: one asserts every other selected column still exists on the generated row, the other FAILS the type-check the moment `pnpm db-types` adds the column — which is the remedy and the end of the stand-in. MCP-backed connectors use `useMcpCatalog()` over `public.get_mcp_catalog_for_user()`: its sanitized `connection_ready` bit is true only for an existing connection, an explicitly certified provider, a proven prior connection path, GitHub's canonical flow, or a real no-auth remote server. Credentials remain in the Unified Credential Vault and never enter this feature. The fair rotation stores only provider ids and bag progress in browser `localStorage` under `matrx.connector-strip.rotation.v1`.

**Key types** (`types.ts`)

- `ConnectorDefinition` — `id`, `name`, `blurb`, local `logo?` or `iconUrl?` + `fallbackIconUrls?` + `brandColor?`, `surfaces`, `manageHref?`, `comingSoonId?`.
- `ConnectorSurface` — `"strip" | "directory"`. **Explicit, never inferred.**
- `ConnectorStatus` — `"connected" | "not_connected" | "unavailable"`.
- `ConnectorStatusSource` — `connectedIds?` (a set) or `resolveStatus?` (a resolver; wins).

---

## Key flows

### (a) Mounting the strip under an agent input

```tsx
<ConnectorStrip
  connectors={threeRotatedLiveConnectors}
  resolveStatus={resolveLiveStatus}
  onConnect={(id) => openConnectPanel(id)}
  onShowMore={() => openLiveIntegrationsWindow()}
/>
```

Trigger: the composer renders. `ChatConnectorStrip` merges the three seeded providers with the usable live MCP catalogue, draws three ids from a shuffled bag without replacement, and renders one 16px-tall visual row plus `More`. On coarse pointers, invisible pseudo-elements preserve a 40px hit area without consuming layout height. Exit: a provider chip raises its canonical connection/management action; `More` opens the full window.

### (b) A connector the user already has

Status `connected` → a `Check` appears and — when the definition has `manageHref` — the chip becomes a real `<Link>` to the management surface (THE DOOR LAW). Provider artwork remains full-color in every live state; connection state never degrades a brand mark to a generic monochrome symbol. No `manageHref` → the chip is inert, never a fake button.

### (c) Fair rotation across visits

Each visit consumes the next three ids from a shuffled bag. No provider repeats until every eligible provider has had one placement. At a bag boundary, the previous visit's ids are deferred, preventing consecutive overlap whenever the catalogue is large enough. A changed eligible catalogue invalidates the old bag safely.

### (d) The live-only `More` window

The WindowPanel always includes Google, Gmail, and Notion, then adds MCP catalogue entries whose server status is `active`, `beta`, or `community`, whose sanitized `connection_ready` gate is true, and which can be used from the web app now. Disconnected providers also need a real remote endpoint and a direct OAuth, GitHub, or no-auth route. An already-connected remote provider remains visible so its management door is never lost. Unproven, local-only (`stdio`), and `coming_soon` entries never appear.

### (d2) Two kinds of connection, and choosing what rides this chat

Arman, 2026-09-15: *"You are not differentiating between things that are just
purely a connection to an MCP and those that allow us to select something."*

The server's availability payload carries `attachable: [{resource_type, source,
label}]` per server — `github` → `github_repository` from our synced inventory;
`google` → `google_drive_file` / `google_sheet` live; a pure MCP server → `[]`.
A non-empty list makes the connection **attachable**, and its chip gains a
chooser door named in the provider's own words (`Choose repositories…`) plus a
count of what is already attached. An empty list keeps the chip **plain**,
because a door onto nothing is a dead control.

The chooser writes `platform.associations` edges through aidream. Picks made on
`/chat/new` — before the conversation row exists — are held against that same
minted id and flushed the instant the attachments GET proves the row is there;
until then they render as their own pending chips rather than passing for
attached. The full list, the remove controls and "Add more" live in the Tools
picker (the composer rail is one 16px line); the chat header carries a summary
where every item opens at the provider.

### (e) A connector we do not support yet

`comingSoonId` set → status is `unavailable` regardless of the connected-set, the chip is dashed + `soon`, and clicking calls `announceComingSoon(id)` against `lib/coming-soon/registry.ts`. **Never a bare "coming soon" string.** Notion no longer uses this path: it is an active MCP-backed connector.

### (g) Bringing a Google contact or task IN

Both panels are the WINDOW presentation (Arman, 2026-09-17: "The default is the
window"), registered in `windowRegistryMetadata` with
`mobilePresentation: "drawer"` so a phone gets the bottom sheet, and opened in
place from the People list and the Tasks header — never a route, which would
lose the list behind it.

**Contacts.** Search the person's Google contacts (already-imported ones wear a
badge WITH the import date and offer "Update from Google") → pick one or several
→ the server's dry run returns the FIELD MAP: every Google value, the Person
field it lands in, and what the write will actually do. **The sentence on each
row is the SERVER's** (`ContactFieldPlan.explanation`) — the same rule the count
line runs on — and the client adds only the action the person can take. Every row
is droppable and its value editable before saving. The save goes through the
existing dedupe resolver, so a match enriches instead of duplicating.

- **A local edit wins by DEFAULT, not by force.** A `kept_manual` field starts
  unticked, so doing nothing keeps the value somebody edited here; ticking it
  takes Google's instead. It used to be rendered `disabled` with the checkbox
  forced off, so a person who WANTED Google's value could not have it
  (VERIFY-B1-B2 B2). An `unrecorded` value — one nothing ever stamped — is
  offered ticked and is never called a local edit.
- 🚨 **AND THE TICK IS SENT AS AN INSTRUCTION, not as an included row.** The
  server's `_explicit_choice` is `include && (override_manual || value is not
  None)`, so a tick with nothing retyped — which is what this panel sends for a
  row nobody edited — was received and silently discarded while the row said "will
  replace yours" (aidream lane B-10, VERIFY-B1-B2-R2 N1). `contactFieldChoice` in
  `import/contract.ts` is the ONE builder of a wire choice and sets
  `override_manual: true` from the same decision the row was RENDERED with, so the
  payload cannot disagree with the words the person read. An untouched or unticked
  row carries no override.
- 🚨 **A PROMISE THE SAVE COULD NOT KEEP IS NEVER SILENT.** A field locked on the
  Person between the review and the save comes back in the outcome's
  `refused_fields` (aidream lane B-10, VERIFY-B1-B2-R2 BREAK K), and the saved
  card names each one by its LABEL with the remedy — the server's own warning
  sentence when the reply carried one, a derived line saying the same three things
  when it did not (`contactRefusalSentence`). Before this the card said only
  "Enriched" over a value the review had offered to write. Guard:
  `import/override-and-refusal.test.tsx`.
- **Per-field provenance** ("This Person's job title is from Google Contacts,
  imported 12 Sep 2026") renders from `source_ref` / `imported_at`, and when the
  server recorded nothing it says exactly that. It NEVER invents a date: the
  server's provenance columns are live but its generated models do not carry them
  yet (aidream `services/google_import/FEATURE.md` § THE REGENERATION DEPENDENCY),
  so today every field honestly reads "where this value came from was never
  recorded".
- **An ambiguous contact is a refusal, not a guess.** When one address matches two
  People the server writes nothing, in the preview AND the apply; the panel names
  each candidate WITH a door and the remedy (merge the duplicate, or take the
  shared address off the wrong one). There is deliberately no pick control — the
  governed create/enrich path is the server's resolver, and pinning a chosen
  Person here would be a second write path.
- **It never says "New Person" for a contact the apply would merge.** The preview
  names the Person it will update and how it was recognised (`matched_by`).

**Tasks.** Task lists as chips, tasks with checkboxes, already-imported badges
carrying the import date, and the count line the SERVER composes ("12 tasks in My
Tasks, 4 already here, import the other 8") — two places computing that is two
answers to it. "Select the changed ones" picks exactly the tasks Google moved
since the import. A re-import rewrites title, notes, due date and status only
where Google changed them AND nobody changed them here; a field with no snapshot
to compare against is reported as "no record of what the import last wrote", never
as "edited here". Field names are rendered through the shared label map — a person
never reads `due_date` (VERIFY-B1-B2 D9). An imported task says "Linked to Google
Tasks": the row's `source_url` is the Google Tasks API resource and a durable
identity, not a page, so nothing offers to open it.

Both are mirror-in only: nothing on either panel can change anything in the
person's Google account.

### (f) Adding a provider

One entry in `registry.ts`: id (generic to the provider, permanent), name (today's truth), blurb (one user-facing line), a local mark, and `surfaces`. For an official OAuth MCP provider, the id must match the canonical `tool.mcp_server.slug`; after a real connection proof, `ChatConnectorStrip` resolves connection state and OAuth generically. Before proof, keep `connection_ready` false and the provider out of chat. Nothing in `ConnectorStrip.tsx` changes.

---

## Invariants & gotchas

- **`ConnectorStrip` owns no connect logic.** It raises intents. `useLiveConnectors` is the sole container that turns those intents into canonical connection flows.
- **Normal chat shows exactly three plus `More`.** Connection state never collapses or hides those discovery/management doors.
- **Rotation is fair, not merely random.** Selection is without replacement across a complete bag; do not replace it with independent random draws that can favor one provider indefinitely.
- **The full window fails closed.** Catalog presence, an official endpoint, OAuth discovery, and an `active` label do not prove usability. Admit a disconnected MCP provider only when `connection_ready` is true; never admit unproven, local-only, or coming-soon entries.
- **`surfaces` is the seeded first-party gate.** Dynamic live MCP providers join through `buildLiveConnectorDefinitions`; niche first-party definitions such as Google Search Console remain directory-only.
- **The `id` is generic; the `name` carries today's truth.** `google-workspace` covers any file the user picks or we create — Docs and Sheets are today's support, not the ceiling. Never bake a feature list into an id or a file name.
- **Provider artwork is canonical.** Dynamic MCP entries walk the real provider-artwork chain; first-party entries render their local SVG. Keep artwork full-color and use the check/chip treatment for connection state—never replace a provider with a generic monochrome icon or initial while provider identity is available.
- **One line, 16px, always.** It sits under a chat input; it may never wrap or compete. Overflow scrolls horizontally (`overflow-x-auto scrollbar-hide`) — this is why nothing breaks at 375px.
- **Touch targets:** the visual chips stay 16px tall; a `before:` pseudo-element expands the hit area to 40px on mobile only (`sm:before:hidden`) without adding a pixel of layout height.
- **Artwork failure stays branded.** Only after every provider-artwork candidate fails may `ConnectorMark` fall back to the catalogue brand color and provider initial, without shifting layout. No emoji or generic provider icon.
- **A connection is account-wide; an attachment is not.** "GitHub is connected" and "this chat works on `aidream` and `ai-matrx`" are different facts. Attachments are keyed by conversation and never by slug.
- **No provider list decides attachability.** `attachable` comes from the server, labels included, so a new attachable provider is a server change and no frontend change. The one provider-specific branch in the picker is GitHub's access door in the empty state, because GitHub is the only provider whose empty result has a fix the user can perform.
- **Three states are never collapsed:** a read that FAILED is not "nothing attached"; a held pick is not "attached"; a pick that could not be carried over stays on screen with the server's own sentence.
- **The read is gated on the capability existing.** No connection declaring `attachable` → nothing is fetched and nothing renders. This is what makes the frontend half safe to ship before the server half: an ungated read would put an amber warning in the header of every conversation on the platform about a feature nobody has. Guard: `__tests__/nothing-is-read-when-nothing-is-attachable.test.tsx`.
- 🚨 **"CONNECTED" IS NEVER A BOOLEAN THAT LIES.** A product row may say Connected only when three things are true at once: the account can authorize a call, every scope that product needs is granted, and the SERVER says the capability is live for this caller. Each one is a separate state with its own sentence and its own single remedy. The failure this exists to beat is the one every surveyed connector product ships (PLAN §1, last row) and has a recorded instance here: on 2026-07-25 a Search Console sync failed while the row said `status = 'connected'` and the credential reference was gone. Guard: `__tests__/connected-is-never-a-boolean-that-lies.test.ts`.
- 🚨 **ROLLOUT STATE IS THE SERVER'S, NEVER A CLIENT CONSTANT.** A row still behind our gate shows its sentence, no toggle, and "Turns on automatically when ready for your account", from `/api/google-integrations/capabilities` (`rollout_phase` + `eligible` + `admission_error`). `admission_error` is a CODE and is never shown — `google-adapter.ts` maps it to a sentence. A super admin sees `phase: "pending"` with `eligible: true` and CAN switch the row on; that combination is the internal-test lane and must keep working.
- 🚨 **THE REQUEST ASKS FOR EXACTLY WHAT WAS SWITCHED ON, PLUS WHAT THE ACCOUNT ALREADY HOLDS.** Asking for more is how a production Google authorization was rejected outright (`lib/googleScopes.ts`, the `GOOGLE_OUTREACH_INBOX_SCOPES` header); asking for less is what the hub refuses as "this authorization would remove existing Google access" — and if it ever stopped refusing, a grant would be dropped and every picked file stranded. Guard: `__tests__/consent-asks-for-exactly-what-was-switched-on.test.ts`.
- **The prompt card is a normal block ABOVE `ConnectorStrip`, never inside it.** The strip is one 16px line under a composer and its geometry is load-bearing; a card inside it would double the composer footprint on every surface that mounts it. The card is mounted by `NewChatGreeting` (the `/chat/new` screen) and by the settings panel — NOT by `SmartAgentInput`, because an account-wide offer under every composer on the platform is the exact defect `ChatConnectionsStrip` was built to end (2026-09-15).
- 🚨 **THE PER-PRODUCT CALL FACTS ARE THE SERVER'S RECORD, AND ABSENT MEANS ABSENT.** The hub records, per capability, the last call Google answered and the last call it refused, with a classified code and a person-facing sentence (`aidream/services/google_integrations/call_health.py` → `capability_health`). A product row shows the most recent fact across the capabilities behind it and NEVER the account's `last_verified_at` / `last_error`, which stay on the account line labelled account-level. A product with nothing recorded says "no calls recorded yet" — never a blank and never a green line. On 2026-09-17 every one of the eleven live Google connections was still at the column's bare default, so that is what the screen says today. Guard: `__tests__/the-health-row-shows-the-real-last-call.test.ts`.
- 🚨 **A STANDING REFUSAL OUTRANKS A GREEN BADGE, AND EVERY REFUSAL CLASS GETS THE ACTION IT DESERVES.** When a product's newest recorded fact is a refusal (no later success answered it), the row stops saying Connected: `scope_missing`, `grant_expired_or_revoked` and `provider_denied` become **Not working** with the server's sentence and the ONE Reconnect — which, when no scope is missing, asks for exactly the scopes the account already holds so the GRANT is renewed (derived by `grantNeedsRenewal`; without it the press answers "there is nothing left to approve", a dead control). `platform_configuration` is **Not working** with NO button, because reconnecting cannot help and the fault is ours. `quota_exhausted` and `provider_unavailable` keep the row's state and add the self-healing sentence — offering a button there would waste the person's time. The code itself is a technical detail shown inside the permission disclosure beside the provider's own scope strings, never on the row (D6). Guards: `__tests__/the-health-row-shows-the-real-last-call.test.ts`, `__tests__/refusal-codes-are-the-servers-codes.test.ts` (the client's code list is re-read from the server file and must match).
- 🚨 **A DEAD CREDENTIAL IS A RENEWAL OF EVERY PRODUCT THE ACCOUNT HOLDS, AND THE REPAIR IS OFFERED ONCE, ON THE ACCOUNT.** `usable: false` (revoked, no credential on file, `needs_attention`) with the grant intact is the 2026-07-25 shape and was live on nine rows: the products are all broken and one fresh approval fixes all of them. So `actionScope` is `account`, `accountRenewalProductKeys` is what one press carries, the dialog starts those rows switched ON, and the card shows a single Reconnect beside the sentence asking for it — never the same press repeated per row, and never (as until 2026-09-17) nine rows asking for a Reconnect that existed nowhere on the screen. Guard: `__tests__/a-dead-credential-is-one-reconnect.test.tsx`.
- 🚨 **A PRESS THAT CAN ASK FOR NOTHING SAYS WHY — AND NEVER "ALREADY CONNECTED" OVER A BROKEN ROW.** A product refused for a reason a reconnect cannot clear (`platform_configuration`) or still behind the rollout gate is `blocked` with its own reason, and `emptyPlanAnswer` names it; only when nothing is blocked may the plan-empty sentence speak. Guard: `__tests__/a-refusal-we-must-repair-answers-honestly.test.tsx`.
- 🚨 **A SERVER CODE NEVER REACHES THE SCREEN, KNOWN OR UNKNOWN.** Every press failure goes through `consentFailureAnswer`: a mapped sentence for a code the hub raises, one honest generic sentence otherwise, and text that looks machine-written (a snake_case token, a scope URL, a shouted error class) is never inlined even when the code IS mapped. The raw words live behind `ConsentFailureNotice`'s disclosure. The map is censused against `capabilities.py`, `read_only_product_admission.py` and `service.py`'s `error_code=` by `__tests__/admission-codes-are-the-servers-codes.test.ts`, and the census reads a code out of the conditional expression it may be written in. Guard: `__tests__/no-server-code-reaches-the-screen.test.tsx`.
- 🚨 **THE SERVER'S OWN WORDS NEVER BECOME A PERSON'S SENTENCE.** `users.integration_connections.last_error` is written for an OPERATOR — a vault item name, a connection UUID, a Python exception class — and the browser reads that row. It is CLASSIFIED, never rendered: `marketing/google/health.ts` reads the typed code aidream stamps in `metadata.credential_failure` when it is there, else classifies the text, and `googleAccountFaultLanguage` is the one place a fault becomes words (an unrecognised fault says "something on our side needs repair" and nothing else). The generic account shape has no field a raw provider string can travel in — `lastRefusalSentence` is the translated sentence, and the card states it once rather than beside a status sentence that already said it. Until 2026-09-17 the vault item name, the connection UUID and `KeyError` rendered eleven times on one card (VERIFY-U-P2-R3 N9). Guard: `__tests__/the-account-fault-is-a-sentence-not-a-stack.test.tsx`.
- 🚨 **A FAILED EXCHANGE GRANTS NOTHING.** Per-row outcomes cannot be read off the account's scopes, because a RENEWAL asks for scopes the account already holds: `consentOutcomes` takes the exchange result and a failed exchange renders no product as granted. A nine-product renewal whose exchange failed used to print the green "Ready to use" list, with a first action per product, directly beside the red failure notice (VERIFY-U-P2-R3 N10). Guard: `__tests__/a-failed-exchange-grants-nothing.test.tsx`.
- 🚨 **A STANDING REFUSAL ON ANY CAPABILITY OWNS ITS PRODUCT ROW.** One row may cover several provider capabilities (`drive_files`/`docs`/`sheets`; `youtube`/`youtube_analytics`), so "does the refusal still stand?" is decided PER CAPABILITY in the adapter and stated on the activity (`refusalStands`); `health.ts` honours it instead of comparing the product's newest refusal with the product's newest success. Most-recent-wins let a `drive_files` success five minutes after a `docs` refusal render "Connected" with no Reconnect control while its own disclosure said "Reconnect it and approve Docs" — and the three capabilities need the same one scope, so no scope arithmetic can catch it (VERIFY-U-P2-R3 N11). Guard: `__tests__/a-sibling-success-never-hides-a-refusal.test.ts`.
- 🚨 **A TIMESTAMP THAT DOES NOT PARSE IS NOT A TIMESTAMP.** A success is read strictly and dropped when it cannot be dated (the row then says "no calls recorded yet"); a refusal that cannot be dated is KEPT and STANDS, because nothing proves a call answered after it. `NaN` comparisons are silently false, so a success written as `"whenever"` used to make every refusal, however new, stop standing — the row claimed to work one line above admitting nothing ever had (VERIFY-U-P2-R3 N14). Guard: `__tests__/an-unreadable-timestamp-is-not-a-success.test.ts`.
- 🚨 **IN-FLIGHT PRESSES ARE A SET, AND A SENTENCE NEVER CLAIMS WHAT IT CANNOT KNOW.** The settings panel holds one entry per running press, keyed by account and product, and each press clears only its own — one slot meant a second account's press (refused at once by the runner's own guard) cleared the first account's marker while its provider window was still open (N17). And `GOOGLE_GENERIC_FAILURE_SENTENCE`, which every unmapped failure gets, no longer says "nothing was changed": the hub's post-authorization raise lands there AFTER the token exchange, the vault write and the scope update, so it names what is known and sends the person to the account's health rows (N16). Guards: `__tests__/two-accounts-can-be-busy-at-once.test.tsx`, `__tests__/the-generic-failure-claims-only-what-is-known.test.ts`.
- **A second Google login is only a second account when it is new here.** The hub resolves the row it writes by `provider_subject` + owner and upserts, so signing in with an identity this owner already has connected REFRESHES that account. Never promise a second account unconditionally. Guard: `__tests__/a-second-login-is-described-truthfully.test.ts`.
- **Which organizations an account serves is NOT a setting.** A personal connection has `organization_id` NULL and is reachable by its owner wherever they work; an organization-owned one is reachable by that organization's members, and the two resolve identically for the same provider login. The whole mechanism is the dialog's "Connect for <org>" switch (chair ruling, 2026-09-17) — never a served-organizations editor, which would be a second, weaker copy of the access rule.
- **`resolveStatus` overrides `connectedIds`** — pass one, not both, unless you mean it.

---

## Related features

- Depends on: `features/marketing/google` (the inventory query, the capability catalog, the exchange, `diagnoseGoogleConnection`), `features/google-workspace` (`GOOGLE_WORKSPACE_SETTINGS_HREF`), `features/agents` MCP catalog/OAuth primitives, `features/window-panels`, `features/overlays`, `lib/coming-soon`, `components/ui/tooltip`.
- Depended on by: `ChatConnectorStrip` → `AgentConversationColumn` (the real chat composer); Settings also consumes the seeded first-party directory definitions.
- Cross-links: `features/google-workspace/FEATURE.md`, `lib/coming-soon/FEATURE.md`, `features/agent-connections/FEATURE.md` (the agent-facing "what can this agent reach" hub — a different question from "what has this human attached").

---

## Doctrine compliance

**Primitives reused**

- Components: `components/ui/tooltip` (Tooltip/TooltipProvider/TooltipContent), `next/link`, Lucide icons.
- Services/constants: `GOOGLE_WORKSPACE_SETTINGS_HREF` (`features/google-workspace/connection.ts`), `announceComingSoon` (`lib/coming-soon/announce.ts`), `cn` (`lib/utils`).
- Patterns: the `colored`/`currentColor` mark contract from `components/icons/brand-glyphs.tsx`.

**Primitives introduced**

- `ConnectorDefinition` + `CONNECTORS` (`features/connectors/`) — Why new: there was no catalogue of _user-attachable external systems_. Considered extending: `features/agent-connections` (agent reach: skills, MCP, render blocks — a different axis) and `components/icons/maker-brand.ts` (`MakerBrandId` is keyed to `ai.model_public.maker`, i.e. AI model makers; Notion/Gmail are not model makers). Rejected because both would blur two distinct registries.
- `ConnectorStrip` (`features/connectors/ConnectorStrip.tsx`) — Why new: no existing component renders a sub-composer, status-bearing offer row. Considered extending: shortcut chip rows in the composer. Rejected because those raise prompt intents, not account-connection intents, and carry no connected/unavailable state.
- `LiveIntegrationsList` + `LiveIntegrationsWindow` — Why new: the canonical Settings surface truthfully includes setup placeholders and local-only integrations, while chat needs the smaller set usable from the web app now. The list reuses the same catalogue and connect actions as the strip instead of creating a second provider registry.

---

## Change log

- `2026-09-17` — F-27, fixing Cursor Bugbot round 13 on PR 228 (commit
  `8855439f`, comment id 4041550778): F-23's `share_required` disposition
  reused F-19's "ours to repair" copy in two consumers that had been written
  before `share_required` existed. `buildConsentPlan` (`consent-plan.ts`)
  appended "This one is ours to repair — approving it again would not help,
  and we are on it." to EVERY blocked refused-without-renewal row, whatever
  its disposition, so a `resource_permission_denied` refusal (a DIFFERENT
  Google identity must share the item — nothing here is ours) got that claim.
  `ProductRow` (`ConnectorConsentDialog.tsx`) had the sibling defect: it
  appended "Approving Google again renews it — nothing new is asked for." to
  every selected `refused` row, which is false for anything a fresh approval
  cannot clear. Class fix: `blockedRefusalReason` (new, `consent-plan.ts`)
  switches on `row.lastRefusal?.disposition` — `ours` keeps the existing
  sentence, `share_required` states the server's own sentence with nothing
  added, and `reconnect`/`self_healing`/`retry`/`null` are named explicitly so
  a disposition this switch has never seen fails TYPE-CHECK via the exhaustive
  `default`, never a silent default. `ProductRow`'s "renews it" line is now
  gated on `health.remedy` being non-null — true only when the disposition is
  `reconnect` (`health.ts`'s own rule for when it fills that field). Census:
  only `health.ts` and `consent-plan.ts` read `REFUSAL_DISPOSITION` /
  `refusalDisposition`; no card component branches on a disposition string
  directly, so `ConnectedAccountHealth.tsx` and the settings row needed no
  change. Guard, red-then-green:
  `__tests__/a-share-required-refusal-is-not-ours-to-repair.test.tsx` — the
  plan, the dialog's rendered row and CTA press, and a contract test over
  every `CONNECTOR_REFUSAL_CODES` entry asserting the copy WE add never claims
  another disposition's actor.

- `2026-09-17` — F-25, adopting aidream lane B-10's Contacts-import contract
  (`/projects/google-native/VERIFY-B1-B2-R2.md` N1 + BREAK K). (1) A ticked
  `kept_manual` row now reaches the server as an explicit `override_manual: true`
  — built once in `import/contract.ts` (`contactFieldChoice`) from the same
  decision that rendered the row, because the panel's `value: null` shape was
  exactly the one the server's explicitness test ignored, so the tick was sent,
  dropped, and the row's "will replace yours" was a promise nothing kept. (2) The
  saved card states every `refused_fields` entry by field LABEL with the remedy,
  preferring the server's own warning sentence for that Person
  (`contactRefusalSentence`); a lock added between the review and the save used to
  read as a plain "Enriched". Stand-in types grew `override_manual` and
  `refused_fields` with the reason. Guard:
  `import/override-and-refusal.test.tsx` (7 cases, red before and green after —
  the RED payload was captured as `{key: "job_title", include: true, value:
  null}`). **Still owed, and not this container's to do:** `pnpm sync-types` could
  not run here (see the lane's hand-back), so these paths still ride the
  `*Pending` stand-ins.

- `2026-09-17` — F-23, closing aidream lane B-9's cross-repo half (this
  client's census was RED the moment aidream `ea0161993` landed): added
  `resource_permission_denied` to `CONNECTOR_REFUSAL_CODES` with its own
  disposition, `share_required` (never `reconnect` — the scopes are already
  granted — and never `retry`, since Google will refuse the same item every
  time until a different Google identity shares it); the `refused`/"Not
  working" state census in `productHealth` now names it explicitly so it
  cannot fall through to "Connected". Adopted `capability_health.<key>
  .last_grant` (a consent grant is not a call, aidream N12): a new
  `lastGrantAt` is folded per product in `google-capability-health.ts` and
  `ProductPermissionsDisclosure` says "connected, no calls yet (granted …)"
  rather than the borrowed "last successful use" line. Adopted
  `metadata.discovery_outage` (aidream N15): `googleAccount` already left the
  credential unflagged for it (the row stays `connected`), and the missing
  piece — the server's own outage sentence — is now read in
  `marketing/google/health.ts::googleDiscoveryOutageSentence` and shown once
  on the account card with no Reconnect, while each affected capability's
  transient `provider_unavailable`/`call_failed` refusal already renders,
  unchanged, through the existing per-product `activityNote` path. Confirmed
  `metadata.credential_failure.code` remains what the account-fault pipeline
  prefers over text classification, for every one of B-9's seven declared
  codes, with a new cross-repo census next to
  `refusal-codes-are-the-servers-codes.test.ts` and
  `admission-codes-are-the-servers-codes.test.ts`. Guards, each reproduced RED
  first: `__tests__/a-resource-permission-denial-is-not-a-reconnect.test.ts`,
  `__tests__/a-grant-is-not-a-successful-call.test.tsx`,
  `__tests__/a-discovery-outage-gets-no-reconnect.test.tsx`, plus
  `marketing/google/__tests__/a-discovery-outage-is-not-a-dead-credential.test.ts`
  and `marketing/google/__tests__/credential-failure-codes-are-the-servers-codes.test.ts`.

- `2026-09-17` — F-20: **two machine values and one impossible number, out of the
  import reviews** (`common-docs/projects/google-native/VERIFY-B1-B2-R2.md` D9 and
  break K; each reproduced RED first in
  `features/connectors/import/human-sentences.test.ts`). The Contacts review said
  `Will update Ada (matched by external_id:google_contacts)` — a column name and a
  provider slug at a non-technical expert; it now says *recognised by its Google
  Contacts id* through `importMatchKeyWords`, the client twin of the server's own
  `_match_key_words`. The Tasks review printed `Due 2026-10-01` from
  `task.due_at.slice(0, 10)`, in the same file whose helper exists so a date is
  never an ISO string; it goes through `importDateText`. And the count line is now
  worded by `importTaskCountLine` from the payload's own `total` /
  `already_imported` instead of the server's prose, because that prose could say
  "import the other **-2**" and a screen that cannot check the arithmetic it
  prints cannot be accountable for it — the remainder is clamped and the noun
  agrees.

- `2026-09-17` — **Six client honesty defects from the third hostile round**
  (lane F-19, from `common-docs/projects/google-native/VERIFY-U-P2-R3.md`), each
  reproduced RED on head before the fix:
  - **N9** — `marketing/google/health.ts` returned `last_error` verbatim as a
    `needs_attention` connection's reason, `googleAccount` copied it into
    `statusReason`, every product row repeated it and the card printed the raw
    column again: the vault item name, the connection UUID and `KeyError` on
    screen eleven times. Now one typed fault vocabulary
    (`GOOGLE_ACCOUNT_FAULT_CODES` + `googleAccountFaultLanguage`), fed by the
    server's `metadata.credential_failure.code` when present and by
    classification of the text otherwise, with an honest generic sentence for
    anything unrecognised — and `ConnectorAccount.lastError` is GONE, replaced by
    `lastRefusalSentence`, so no adapter can carry raw text again. The raw column
    survives only in `googleConnectionDiagnostics`, the admin label/value list.
    Red: *"never returns the server's text as the reason of a flagged
    connection"*, *"prints no vault item, no connection id and no exception class
    anywhere"*.
  - **N10** — `consentOutcomes` derived outcomes from scope presence alone, so a
    renewal whose exchange FAILED reported 9 of 9 granted: the green "Ready to
    use" list beside the red failure notice. It now takes the exchange result and
    a failed exchange grants nothing (`not_completed`). Red: *"grants nothing for
    a nine-product renewal"*, *"shows no green Ready-to-use list beside the
    failure"*.
  - **N11** — the capability→product fold was most-recent-wins, so a `docs`
    refusal followed by a `drive_files` success rendered "Connected" with no
    control. Standing is now decided per capability and carried on
    `refusalStands`. Red: *"stays broken when a sibling capability succeeded five
    minutes later"*, *"does the same for YouTube's two capability keys"*.
  - **N14** — `parseSuccess` accepted any non-empty `at`, and a `NaN` comparison
    made every refusal stop standing. One strict timestamp parser guards both
    halves, asymmetrically: an undated success is dropped, an undated refusal
    stands. Red: *"does not stop a standing refusal"*.
  - **N16** — the generic failure sentence asserted "nothing was changed", which
    is false on the hub's post-authorization raise. It now states only what is
    known. Red: *"does not claim that nothing was changed"*.
  - **N17** — one `busy` slot, so a second account's press un-spun the first
    account's in-flight control. In-flight presses are a set. Red: *"keeps the
    first account's control spinning when the second is refused"*.
  Also repaired, found while working (unrelated to the six):
  `marketing/google/service.auth.test.ts` failed on head with "…returns is not a
  function" — its query mock stopped at `abortSignal` while the read ends
  `.returns<ConnectionRow[]>()`, so the projection guard proved nothing.
- `2026-09-17` — **The import panels tell the truth about where a value came
  from** (lane F-13, from `common-docs/projects/google-native/VERIFY-B1-B2.md`
  B2/B3/B4/D9, plus the contract lane B-7 shipped the same day). One shared
  `field-labels.ts` turns every field key into words with a verb that agrees, so
  the Tasks panel no longer prints "due_date, description was edited here", and
  writes the provenance sentence ("from Google Contacts, imported 12 Sep 2026")
  with an honest absence when the server recorded none — it never invents a date.
  Both already-imported badges name the import date. A `kept_manual` field is
  enabled and merely unticked, so local wins by DEFAULT and Google's value is one
  click away. New `contract.ts` narrows the server's field actions and match
  states at the seam: `unrecorded` and `choice_required` render real copy, a state
  a newer server sends renders the server's own sentence plus "this screen does
  not know that outcome yet" instead of a blank, and `field-labels.test.ts`
  compares the action list against aidream's own `FieldAction` literal. An
  ambiguous contact now refuses with both People named as doors and the remedy;
  the preview names the Person it will merge into instead of saying "New Person".

- `2026-09-17` — **A dead credential is a renewal of everything the account
  holds, and the press always answers with the truth** (lane F-12, from
  `common-docs/projects/google-native/VERIFY-U-P2-R2.md` — the second
  zero-authorship attack on this primitive). Five frontend findings, each fixed
  in the ONE derivation and pinned red-then-green:
  - **N2 (the worst).** An account whose credential is dead (`usable: false` —
    revoked, no credential on file, `needs_attention`; nine such rows were live)
    with every scope still granted produced `actionLabel: null` on all nine rows,
    because the verb was derived from `missingScopes` and the recorded refusal
    alone and never from `account.usable`. So nine rows printed "Needs
    reconnecting — Reconnect <account>." beside ZERO action buttons, and the
    dialog answered "Everything you switched on is already connected." The
    ruling (chair): a dead credential is a renewal of EVERY granted product on
    that account — one Reconnect on the account, the plan carries all of them as
    renewals, the press opens the provider window. `productHealth` now derives
    the verb AND its `actionScope` (`product` | `account`) in one place, so
    `grantNeedsRenewal` answers true for every held product, `buildConsentPlan`
    plans them as renewals with no added scope, `accountRenewalProductKeys`
    (new) is what the account-level press carries, and `initialSelection` starts
    those rows switched on. `ConnectedAccountHealth` renders ONE Reconnect for
    the account — never the same press nine times — stating what one approval
    covers; the switcher no longer calls a held-but-unusable account empty.
  - **N1.** A `platform_configuration` refusal (ours to repair) left the row
    switched on, the plan empty, and the press answering "Everything you
    switched on is already connected" directly under a row reading "Not
    working" — the boolean that lies, in the one place the owner named.
    `buildConsentPlan` now BLOCKS such a product with the server's sentence plus
    "This one is ours to repair", and `emptyPlanAnswer` (moved into
    `consent-plan.ts`, used by the dialog inline, its toast and the settings
    row) names every blocked row first; the plan-empty sentence may speak only
    when nothing is blocked. No fake button anywhere.
  - **N6.** `ConnectorsSettingsPanel` held one `busyProductKey` and gave it to
    every account, so a press on one account spun the same product's control on
    the others. The prop is now `busy: ConnectorBusyAction` (`accountId` +
    `productKey`, `null` = the account-level press) and the card compares the id
    to its own account, so a caller cannot express "busy everywhere".
  - **N4.** `google_products_rollout_conflict` had no client sentence (the
    census regex only matched a code written as the first token of the raise, and
    this one lives inside a conditional), and both surfaces rendered exchange
    failures with `extractErrorMessage(cause)` verbatim — so capability keys and
    codes reached the screen. Added the code, plus `GOOGLE_FAILURE_LANGUAGE`
    (a sentence per code the hub can refuse a press with, censused against
    `capabilities.py`, `read_only_product_admission.py` AND `service.py`'s
    `error_code=`), `consentFailureAnswer` (the ONE translation: mapped sentence,
    else one honest generic sentence — and machine-looking text is never inlined
    even when the code is unknown) and `ConsentFailureNotice` (the sentence, with
    the raw text behind a real button, never a hover).
  - **N5 (copy).** "Use a different Google account … it becomes a second
    connected account" was false when the person picks the identity already
    connected: the hub resolves by `provider_subject` + owner and upserts, so
    that account is REFRESHED. `newAccountChoiceDescription` /
    `newAccountFootnote` say what actually happens.
  Guards (each run red on the pre-fix bytes, then green):
  `__tests__/a-dead-credential-is-one-reconnect.test.tsx`,
  `a-refusal-we-must-repair-answers-honestly.test.tsx`,
  `one-account-spins-alone.test.tsx`,
  `no-server-code-reaches-the-screen.test.tsx`,
  `a-second-login-is-described-truthfully.test.ts`, and the tightened server
  census in `admission-codes-are-the-servers-codes.test.ts`. **Not fixed here,
  and still open:** N3 (Analytics records no successful call at all, and Search
  Console and Contacts record only refusals, so a refusal for those three stands
  forever) and N7 (a successful renewal does not clear the recorded refusal, so
  a row can read "Not working" and "Connected." at once) are server-side seams —
  aidream's recording lane owns them; no frontend change can make those rows
  tell the truth.
- `2026-09-17` — **A standing refusal now renews the grant on EVERY consent
  surface, because the renew set is DERIVED, not passed in** (lane F-10; Cursor
  Bugbot on PR 228, `f514f3b7`). `initialSelection` starts a `refused` product
  switched ON — correctly, the account has it — but the dialog called
  `buildConsentPlan` without the renew set, so a refusal with every scope
  already held fell into `alreadyGranted`: the plan was empty, the press
  answered "Everything you switched on is already connected — there is nothing
  to approve", and the provider window never opened. Settings → Reconnect passed
  the renew set and worked, so the same broken account got two different answers
  depending on which door the person came through. The class fix: the optional
  `renewProductKeys` parameter is GONE, and `buildConsentPlan` reads
  `grantNeedsRenewal` (new, in `health.ts`) off the account's own recorded health
  for every selected product — a `refused` row whose disposition is `reconnect`
  and whose scopes are all present. A caller can no longer omit it, and
  `platform_configuration` (ours to repair) is deliberately never a renewal.
  `ConsentRequest` now carries `renewals`, so copy branches on data instead of
  scope arithmetic: the refused row prints the server's own sentence plus
  "Approving Google again renews it — nothing new is asked for", and the line
  under the button says a renewal renews (`consentRequestSentence`), never
  "nothing you already granted is asked for again". Guards, red-then-green
  against a fixture built from the live `capability_health` column through the
  real parser (marker and all):
  `__tests__/a-standing-refusal-renews-the-grant.test.tsx` (plan, the
  ours-to-repair case, and a static guard that no consent surface hand-derives a
  renew set) + `__tests__/the-refused-row-opens-the-provider-window.test.tsx`
  (real DOM, real click: `runner.run` is called and no "already connected"
  toast).

- `2026-09-17` — **D2 is closed: the health rows now show the REAL last success
  and last refusal, per product** (lane F-7 of the google-native build). The
  server side landed first (aidream `b4119fabf`, `5a7e1a3e3`, migration
  `0777_google_per_capability_call_health.sql`): every Google provider call runs
  inside one recording seam that writes, per capability key, the last call
  Google answered and the last call it refused — with a classified code, a
  sentence written for the person, and the HTTP status — into
  `users.integration_connections.capability_health`. This half reads it:
  - `CONNECTION_SELECT` takes the column; because `types/database.types.ts` was
    regenerated before the migration and cannot be regenerated here, the query is
    typed with `.returns<ConnectionRow[]>()` over the hand-declared
    `CapabilityHealthPending` stand-in, under two compile-time guards — one that
    keeps the other columns generation-checked, one that FAILS the type-check the
    day `pnpm db-types` runs, so the stand-in cannot outlive its reason. No cast,
    no hand edit to a generated file.
  - `google-capability-health.ts` narrows the jsonb through its `__kind` marker
    (carried through, never stripped), drops a fact it cannot vouch for rather
    than rendering half of one, and folds capability keys into the product rows
    the person sees — most recent success and most recent refusal across the
    capabilities behind each product.
  - A standing refusal now outranks the badge: the row says **Not working** with
    the server's own sentence and offers the ONE Reconnect for the three codes
    only the person can clear — including when no scope is missing, where the
    request renews the grant (`renewProductKeys`) instead of dead-ending on
    "there is nothing left to approve". `platform_configuration` says it is ours
    to repair and offers nothing; `quota_exhausted` and `provider_unavailable`
    say they clear by themselves and offer nothing.
  - The disclosure's old sentence — "we do not keep a per-product record of
    Google calls on this account" — was TRUE when it was written and is now
    false; it reads "no calls recorded yet", which is what all eleven live
    connections still show (read live 2026-09-17: every row is at the column's
    bare `__kind` default, because the recording server had not yet deployed).
  - New guards: `__tests__/the-health-row-shows-the-real-last-call.test.ts`
    (fixtures are the live default row and the exact object the seam writes) and
    `__tests__/refusal-codes-are-the-servers-codes.test.ts` (the client's code
    list is read back from `call_health.py` and must match).

- `2026-09-17` — **The zero-authorship verification REOPENED this, and seven of
  its eight defects are closed here** (`common-docs/projects/google-native/
  VERIFY-U-P2.md`). The one that stays open is per-product *last successful
  call* and *last refusal*: the hub still records one `last_verified_at` and one
  `last_error` per connection and no per-capability call log, so a product row
  now MODELS both fields (`ConnectorProductActivity` → `accountHealth({…,
  activity})`), renders them as "not recorded yet — we do not keep a per-product
  record of Google calls on this account" and "none recorded yet for this
  product", and will show real values the day an adapter fills them, with no
  component change. What changed, defect by defect:
  - **The scope wording was unreachable on every phone.** In the consent dialog
    Google's own scope strings lived inside a Radix `Tooltip` whose trigger was a
    `<button>` with no click handler — tooltips open on hover and focus, so a tap
    opened nothing beside any of the nine rows. There is now ONE disclosure,
    `ProductPermissions.tsx`, mounted by both the dialog and the health rows: a
    real `<button>` with `aria-expanded`/`aria-controls` that works on click, tap,
    Enter and Space. The health rows' own expander was the pattern; it moved into
    the shared file rather than being copied.
  - **"Reconnect" was offered on products that were never connected** (seven of
    the nine rows on `info@aimatrx.com`). `health.ts` now derives `actionLabel`
    in one place: nothing to ask for → no action; a grant exists and is
    incomplete → **Reconnect**; nothing ever granted → **Connect**. The settings
    panel's confirmation toast follows the same verb.
  - **One connected account meant no "change" and no way to add a second Google
    login** (PLAN §2 asks for both). The account line is now a real select
    carrying each account's email plus what it actually holds ("Docs, Sheets &
    Drive files, Gmail"), with "Use a different Google account" as its last item;
    choosing it plans with no account, so `targetAccountId` is null and the hub
    creates a second connection instead of adding to the first.
  - **The dialog opened on whichever account the inventory returned first** — on
    the admin seat that was `arman26@gmail.com`, so it said Docs was not
    connected while Docs was connected next door. `preferredAccountId()` opens on
    the account the calling surface names, else the usable account holding the
    most live products.
  - **The two groups were not collapsible.** Workspace and Marketing are now
    `Collapsible` disclosures, open by default, keyboard-operable.
  - **Raw capability keys reached the person** (`drive_files · generally
    available`, `youtube_analytics · still being certified`). `rolloutSentence()`
    replaces them with a sentence naming the product; keys never render.
  - **Connect with nothing switched on was a disabled button.** It is pressable
    now and the press answers, inline (`role="status"`) and in a toast:
    "Nothing is switched on yet, so there is nothing to connect…". Apple's and
    Slack's consent sheets keep the primary action live and answer the press, and
    a disabled control is the one thing a phone cannot interrogate — no hover, no
    title, no tooltip. It stays disabled only while Google's window is open or
    its script is still loading.
  - **The client's `ADMISSION_LANGUAGE` was keyed to codes the server does not
    emit** — three `*_internal_test_required` spellings, while the hub's real
    read-only codes are `google_oauth_internal_test_required` and
    `google_read_only_sweep_paused` (the second means "paused for everyone", not
    "not you yet", and had no sentence at all). The map is now exactly
    `GOOGLE_ADMISSION_CODES`, and its test re-reads `capabilities.py` +
    `read_only_product_admission.py` from the sibling aidream checkout and fails
    when the two disagree — announcing itself as UNMEASURED when that checkout is
    absent.
  Guards, the first three proven failing-then-passing against the old behaviour:
  `the-consent-dialog-answers-a-touch.test.tsx` (real DOM, real clicks),
  `the-row-says-what-this-account-really-has.test.ts` (built on the admin's four
  real connection rows as the verifier read them live),
  `admission-codes-are-the-servers-codes.test.ts`, plus the second-account cases
  added to `consent-asks-for-exactly-what-was-switched-on.test.ts`.
  **Not verified on a screen:** this sandbox's egress policy blocks Supabase and
  the backend, so no session exists here; everything above is proven by component
  tests through a real DOM, not by a browser walk.

- `2026-09-17` — **THE CONNECTOR PRIMITIVE, with Google as the first provider
  config.** Google's ten approved products existed end to end — the OAuth hub,
  the vault, the Picker, incremental per-product consent, a typed capability
  catalog — and a person met none of it: Settings showed three status-only cards
  and chat showed a rotating "you could connect these" line. This is the first
  moment and the machinery under it, built generic because ~80 connectors follow
  (`common-docs/projects/google-native/PLAN.md` §2, §5.2, §5.3): a provider
  declares its products, sentences, grant bundles, capability keys and attachable
  types in `provider-config.ts`, and the card, the "Choose what to connect"
  dialog, the per-capability health rows and the settings panel render whatever
  provider they are handed. `google-adapter.ts` is the only file in the primitive
  that names Google. Beats the champion (the ChatGPT/Codex card and dialog) on
  the thing it gets wrong — "connected" while returning nothing: a row says
  Connected only when the credential works, every scope is granted and the server
  says the capability is live, and every other combination has its own sentence
  and its own Reconnect that asks for only the missing scope. `google-status.ts`
  is now derived from the provider config, so the scope→product map exists once.
  Retired `DirectoryConnectorCards.tsx`; its surface-scope contribution moved to
  the panel under the same key. Settings reads "Connectors" in both navs (the id
  and the route are untouched). Knobs seeded in
  `migrations/connectors_knobs.sql`. Guards, each proven failing-then-passing:
  `consent-asks-for-exactly-what-was-switched-on.test.ts`,
  `connected-is-never-a-boolean-that-lies.test.ts`. **Pending server half:** the
  one-button consent posts `connection_purpose: "google_products"` with
  `capability_keys` to `/api/google-integrations/exchange`, which the deployed hub
  does not accept yet (aidream lane U-P8). Until it does, pressing the button
  reaches Google's consent screen and the exchange answers 422; the dialog says so
  in its own words ("needs the newest AI Matrx server, which is still rolling
  out. Nothing was changed") instead of showing a validation dump, and reads the
  account back so a partial grant can never be invisible.
- `2026-09-15` — **A connection you can choose things out of is not a
  connection you can only connect to.** Every chip in the composer rail and the
  Tools picker wore the same name-plus-state treatment, which is the whole
  truth for a pure MCP server and half the truth for GitHub or Google, where
  the useful act is choosing WHICH repositories or files ride this chat
  (Arman: *"You are not differentiating between things that are just purely a
  connection to an MCP and those that allow us to select something"*). The
  split is driven only by the server's `attachable` payload, so no slug is
  special-cased: `attachable-resources.ts` decides the chip kind and writes the
  chooser's label in the provider's own words, `ResourceAttachPicker` is the
  one chooser for every provider (inventory filters locally, live search
  debounces and announces itself), and `redux/attachments.slice.ts` keeps what
  was chosen per conversation as `platform.associations` edges — including
  picks made on `/chat/new` before the row existed, which are held against the
  same minted id and flushed when the read proves it is there. The reaper
  (`destroyInstanceIfAbandoned`) now counts choosing what a chat works on as
  work, closing the same class that took per-run tool additions until
  2026-09-14. Guards, each proven failing-then-passing:
  `attachable-connections-are-distinct.test.tsx`,
  `attachments-survive-the-new-chat-handoff.test.ts`,
  `nothing-is-read-when-nothing-is-attachable.test.tsx`. **Pending:** the
  aidream half of the contract (`/api/connections/resources`,
  `/api/conversations/{id}/attachments`, and `attachable` on the availability
  payload) was not on `origin/main` when this shipped, so nothing here has been
  exercised against a live server yet; the capability gate keeps the surfaces
  silent until it is.
- `2026-09-13` — **Three honest MCP states, one derivation.** Every connection
  indicator in the chat hierarchy decided from `tool.mcp_user_conn.status`
  alone, so eight of admin@admin.com's servers whose access token expired days
  earlier — and GitHub, whose bearer comes from the first-party GitHub App
  connection rather than any MCP grant — all rendered as Connected (Arman:
  "the ui lies as well since I see a checkmark for git but don't actually have
  the mcp connected according to the agent"). `connection-state.ts` now
  derives exactly three states (`connected` / `needs_reauth` /
  `not_connected`) with a plain-English reason, preferring aidream's
  `GET /api/mcp-connections/availability` (only the server can see whether a
  stored refresh token makes an expired token renewable) and falling back to
  the catalog row — pessimistically, never with a false checkmark. Consumed by
  the chat Tools tab (`RunToolPicker`), the agent tools manager, and this
  feature's strip/list; `useConnectMcpServer` gives every one of them the same
  one-click reconnect door. `run-attachments.ts` reads the per-run truth from
  the run's `mcp_attachments` info event and `mcp_server_unavailable`
  warnings, so an attached server that failed THIS run wears its own error
  text in red instead of a checkmark. Guards (each proven failing-then-passing):
  `connection-state.test.ts`, `run-attachments.test.ts`.
- `2026-09-14` — The column wall that makes those vault references unreadable is now GUARDED, not just documented: `pnpm check:client-reads-granted` reads the LIVE grants, finds every relation this repo's client code reads where `authenticated` holds no table-level SELECT (five today, `users.integration_connections` among them), and fails any call site that says `select("*")`, names a withheld column, or has a select list it cannot resolve. Its self-test replays the pre-3918449ce7 Google select list against the real file and proves the guard fails on it (DD-238).
- `2026-09-12` — Replaced the Google inventory's forbidden vault-reference
  projection with database-generated boolean health facts, and stopped the
  shared query policy from replaying deterministic PostgreSQL `42501` denials.
- `2026-09-12` — Strengthened the shared Google inventory boundary to require
  a bearer token, not merely a session object, before constructing the
  authenticated-only PostgREST read.
- `2026-09-01` — Added a live-session guard at the shared Google inventory service boundary, preventing logout/session-expiry races from issuing anonymous reads against authenticated-only integration tables.
- `2026-09-17` — Added the two Google import panels (`import/`): "Import from Google Contacts" on People (search, the per-field map with its actions, the mapping editable before saving, the save through the governed party resolver, an already-imported badge with "Update from Google" and a diff that never overwrites a locally edited value) and "Import from Google Tasks" on Tasks (lists, checkboxes, already-imported badges, the server's count line, "select the changed ones", and a re-import that only takes what Google changed). Both are the window presentation with `mobilePresentation: "drawer"`. Server half: aidream `services/google_import` + `/google-import/*`; its contracts ride `*Pending` stand-ins until `pnpm sync-types` can run.
- `2026-08-31` — The Settings directory's Google connector cards now retain 44pt action targets on phones and render contextual loading plus an explicit retryable failure state instead of disappearing while account status is unavailable.
- `2026-08-30` — Made chat connector visibility fail closed on the catalog's sanitized `connection_ready` proof and stopped generic OAuth from inventing a CIMD client id unless provider metadata explicitly supports it; Figma now remains hidden while its MCP client admission is pending.
- `2026-08-30` — Completed dynamic-provider artwork fallback: each entry now tries its website favicon, known brand glyph, catalogue art, and cached 128px favicon before any branded initial, eliminating anonymous letter tiles whenever provider identity is available.
- `2026-08-30` — Restored the canonical full-color provider artwork in the rotating chat strip and Integrations window; dynamic MCP entries now retain catalogue `iconUrl`/brand color instead of collapsing to one generic monochrome plug.
- `2026-08-29` — Chat now shows three fairly rotated live integrations plus `More`. The shuffled bag prevents provider favoritism and consecutive repeats when possible; `More` opens a searchable WindowPanel containing every web-usable live integration while excluding local-only and coming-soon Settings entries.
- `2026-08-29` — Aligned the normal-chat connector row to the composer's inner content line and shortened the Workspace chip label to `Google`; the capability detail remains in its description and tooltip.
- `2026-08-29` — Halved the connector reminder's vertical footprint across every Smart Agent Input: the visual row is now 16px with a 2px composer gap, while coarse-pointer hit areas remain 40px via non-layout pseudo-elements.
- `2026-08-28` — Auth-gated the shared Google inventory query so `/chat/new` cannot read the authenticated-only connection table during pre-hydration anonymous state.
- `2026-08-22` — First-party Google connector cards now share one live scope-health reader across Chat and Settings; the directory exposes Workspace, Gmail, and Search Console with each connector's canonical management door.
- `2026-08-19` — Codex: retired the legacy Slack demo callback that returned a bot token in the browser URL. Slack connections must use canonical MCP OAuth so tokens are sealed in Unified Credential Vault.
- `2026-08-19` — Codex: removed Notion's stale Coming Soon promise and connected the real chat strip to the existing per-user MCP catalog and OAuth flow. MCP-backed connector ids now resolve generically by canonical server slug, so future official MCP providers reuse the same path.
- `2026-08-18` — Claude: created the feature — config type, seeded registry (Google Workspace, Gmail, Notion (coming-soon), Google Search Console (directory-only)), the strip, local brand marks, and the `/demos/connector-strip` demo. Verified in light and dark at 1280px and 375px.
