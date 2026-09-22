# FEATURE.md — `connectors`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-18`

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

- `features/connectors/provider-config.ts` — `ConnectorProviderConfig` + `GOOGLE_CONNECTOR_PROVIDER`. Nine Google product rows, two groups, one FINAL user-facing sentence each, each row's grant bundle, its server capability keys, its attachable resource types, and its **first useful action** — `ConnectorFirstAction`, one of three declared shapes (`route` to a page, `overlay` to a catalogued window, or `none` WITH the written reason there is nothing to open yet). Never a bare `null`: `__tests__/every-connected-product-offers-its-first-action.test.ts` censuses the whole config and the `none` list only shrinks. **Rollout state is not here** — it comes from the server catalog at request time (PLAN §2: it flips with no rebuild).
- `features/connectors/health.ts` — pure derivation of the per-capability health row: `productHealth`, `accountHealth`, `requiredScopesFor`, `productIsEligible`, `revokeConsequence`, plus `rolloutSentence` (the rollout state in plain words — no capability key ever reaches a person) and `preferredAccountId` (which account a surface works through: the one the surface names, else — when the surface serves ONE product and says which with `forProductKey` — a usable account that actually HOLDS that product, else the usable account holding the most live products). Also the generic `ConnectorAccount` / `ConnectorCapabilityRollout` / `ConnectorProductActivity` shapes every provider adapter reports in; a row's `actionLabel` **and its `actionScope`** are the single place "Connect" vs "Reconnect" and "this product" vs "this whole account" are decided (`grantNeedsRenewal` / `accountRenewalProductKeys` read them, so no surface re-derives a renewal), and `CONNECTOR_REFUSAL_CODES` / `refusalDisposition` are the single place a provider's refusal code becomes an expectation (reconnect · heals itself · ours to repair · retry · someone else must share it).
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
- `features/connectors/attachments.service.ts` — `/api/connections/resources` + `/api/conversations/{id}/attachments` (list / attach / detach). Every route template is `satisfies keyof paths` against the generated contract — the ONE place the path is allowed to be spelled; a route the server does not publish fails `pnpm type-check` instead of 404ing silently (2026-09-17). Errors are raised, never swallowed into an empty list; the failure sentence is the server's `detail.message` + `remedy`, or the status plus the route.
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
- `features/connectors/import/` — **the two Google import panels** (Google-native PLAN §4.5, §4.7). `GoogleContactsImportPanel.tsx` (search → the field map → save through the governed party resolver) and `GoogleTasksImportPanel.tsx` (task lists, checkboxes, already-imported badges, the server's honest count line). `service.ts` is the client half of `/google-import/*`; `types.ts` holds its `*Pending` stand-in contracts and the remedy that removes them; `contract.ts` is the ONE adapter that narrows what steers copy (the field-action set, the match state) with a runtime check, so a state a newer server sends can never render blank; `field-labels.ts` turns a column key into words and writes the provenance sentence, shared by both panels; `read-failure.ts` + `GoogleImportReadFailureNotice.tsx` are the ONE fourth-state posture both panels render when the read did not happen. Openers: `features/overlays/openers/googleImportWindows.tsx` (`useOpenGoogleContactsImport`, `useOpenGoogleTasksImport`); window entries `features/window-panels/windows/google-import/*`.
- `features/window-panels/windows/connectors/LiveIntegrationsWindow.tsx` — canonical floating all-live-integrations window; fullscreen on mobile.
- `app/(dev)/demos/connector-strip/page.dev.tsx` — every strip state side by side (nothing / some / all connected, compact, surface filters, raised intents).

**Redux slice(s)** — `conversationAttachments` (`redux/attachments.slice.ts`). The connector catalogue itself still holds no state; what a person CHOSE out of a connection does, keyed by conversation.

**API endpoints** — `/google-import/contacts/fields`, `/google-import/contacts/search`, `/google-import/contacts/import`, `/google-import/tasks/list`, `/google-import/tasks/import` (aidream `services/google_import`). Nothing else here owns an endpoint.

---

## Data model

No tables of its own. Google connectors use `features/marketing/google/service.ts → listGoogleConnectionInventory()` (Supabase-direct), the same source `features/google-workspace/connection.ts` uses. That read now also selects **`capability_health`** — the jsonb column the hub's recording seam writes one object per capability key into (`{last_success:{at,action}, last_refusal:{at,action,code,sentence,http_status}}`, under the `__kind` marker `google_connection_capability_health`, and, once lane B-17 lands, the provider-neutral `connection_capability_health` — the reader accepts both and carries whichever it finds). It is client-readable by a **column-level** `authenticated` grant: those five declared, person-facing call facts are needed for the health row; `credential_item_id` and `vault_secret_key` remain ungranted. `types/database.types.ts` already includes `capability_health`; `service.ts` derives its narrowed `ConnectionRow` with `Pick` from that generated row and uses `.returns<ConnectionRow[]>()` for this selected projection. There is no `CapabilityHealthPending` stand-in. MCP-backed connectors use `useMcpCatalog()` over `public.get_mcp_catalog_for_user()`: its sanitized `connection_ready` bit is true only for an existing connection, an explicitly certified provider, a proven prior connection path, GitHub's canonical flow, or a real no-auth remote server. Credentials remain in the Unified Credential Vault and never enter this feature. The fair rotation stores only provider ids and bag progress in browser `localStorage` under `matrx.connector-strip.rotation.v1`.

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

The chooser writes `platform.associations` edges through aidream — including on
`/chat/new`, before a single message exists. aidream creates the conversation
row on the first write against the browser-minted id, so a pick there is a real
`POST` whose answer is the chip you see; the id never changes on the way to the
real conversation, so nothing has to be "carried over". The only picks still
held as pending chips are the ones INHERITED from another chat by an agent
switch, and they are written the instant this conversation's read succeeds. The full list, the remove controls and "Add more" live in the Tools
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

- **THE READINESS WAIT IS BOUNDED, AND ITS END IS HONEST.** No wait on a third-party Google script is open-ended. The Identity Services wait (`providers/google-provider/GoogleApiProvider.tsx`), the `next/dynamic` chunk wait (`LazyGoogleAPIProvider.tsx`) and the Picker's `api.js` wait (`lib/googlePicker.ts`, via `loadGooglePickerScript`) all end at `GOOGLE_IDENTITY_READY_TIMEOUT_MS` (20 s, a CAPS constant in `providers/google-provider/googleIdentityReadiness.ts` — a technical readiness bound on a third-party script, never an organization knob). `script.onerror` and the timeout land in the SAME failed state, whose sentence lives ONCE (`GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE`) and is rendered by the ONE component `GoogleIdentityUnavailableNotice` with Retry and "Open Google's status". Retry RE-INSERTS the script (a dead tag never fires `load` again) and restarts the bound; an arrival after the bound cannot resurrect the abandoned attempt. A FAILED attempt removes the dead tag it owns on the way out, and a new attempt replaces any leftover tag rather than waiting on one that will never fire again — a bound with a useless retry behind it is still a dead end. Concurrent callers share the ONE in-flight attempt. Never re-introduce a `setTimeout(check, …)` that re-schedules itself with no deadline.

- **ONE Google authorization window per PERSON, and the gate is not ours.** Every window request — popup or same-tab redirect — goes through `useGoogleAuthorizationWindow()` (`providers/google-provider/`), which holds a MODULE-level gate. Never a `useRef`, never a component `busy` flag, never a raw `google.requestAuthorizationCode` / `startAuthorizationCodeRedirect`: a per-component lock is one window per COMPONENT, which is what two mounted surfaces made into two consent popups for one intent (V-23 NEW-3). A caller that awaits before the window opens takes the gate first with `beginAuthorization()`. Guard: `pnpm check:google-auth-gate`.
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
- 🚨 **A FAILED READ IS NOT AN EMPTY READ — the Google import panels' fourth state.** A read has FOUR states (`read-failure.ts`): pending / failed / empty / rows. Under `failed` NOTHING derived from rows may render — not "This Google account has no contacts we can read.", not "This list has no tasks.", not "Still looking for the contact this link named…", and not Select/Import controls over a list nobody read. The superseded rows are dropped with the refusal, because a list left on screen under a failure answers a question nobody asked. The refusal is TYPED (never a string folded into the review/apply `error`), and 409 `several_google_accounts` is the one a person can resolve here: the accounts the SERVER named become pressable choices that re-read with `google_account` set, and Refresh is absent while that choice is open rather than silently re-running the same refusal. The machine instruction "Re-run with `google_account` set to the one you mean" never reaches a person. The candidate set is read from the server's own sentence and never assembled here from the connections table — a second reading of "which accounts can read this product" can disagree with the one the server just refused on. Guard: `import/a-failed-read-is-not-an-empty-read.test.tsx`.
- 🚨 **A SELECTION IS ONLY ACTIONABLE OVER ROWS A READ RETURNED, AND THE FOOTER IS ABSENT UNDER A FAILED ONE** (F-115). Both import panels derive their footer from `googleImportSelectionControls` (`import/read-failure.ts`) — one rule, never two per-panel ideas of it: in the `failed` state the controls over a selection are absent rather than dead, and the actionable ids are only those a read of the CURRENT account has returned. A selection that outlives its rows is how *"1 selected · Review the field map"* came to fire an import preview over zero rows.
- 🚨 **THE PROOF READ IS OWED, AND OWING IS STATE — NEVER A LATCHING REF** (F-115). The contacts panel's unfiltered (empty-query) read is the ONE read that can prove a deep-linked contact's absence. It is re-owed by every precondition change (mount, organization, chosen Google account, Refresh/Try again, the query cleared back to `""`), and *"Still looking for the contact this link named…"* renders only while such a read is genuinely owed or in flight and possible. A `typedRef` that latched on the first keystroke left that line printing beside a settled read forever.
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
- 🚨 **BLOCKED IS A THIRD TERMINAL ANSWER, AND IT IS NEVER "CONNECTED".** The status vocabulary is shared, read once (`connection-status.ts`) and censused against aidream's own declaration (`services/connection_health.py`): `connected` / `needs_attention` / `unavailable` / `disconnected` / `revoked`, and a word this build has never heard of is `unrecognized` — never `connected`, which is what `connectionSummary` used to collapse anything unfamiliar into. `unavailable` is Google (or OUR OWN OAuth client configuration) blocking every call with nothing the person can press: the derived health says so on the strength of the fault the row already carries (`GOOGLE_UNAVAILABLE_FAULT_CODES` — a fault whose remedy is null IS this state), every product row is `unavailable` / **Blocked** with the declared sentence and no control, the card says "None of these N products can be used right now" instead of "N of N products in use", the consent dialog offers no toggle, and `buildConsentPlan` blocks the row rather than calling it already granted. Until 2026-09-18 a row Google had rejected our app configuration for said the word "Connected" TEN times and "9 of 9 products in use" directly above its own sentence saying no Google account could be used (VERIFY-U-P2-R5 V17-1; chair ruling R22). The prompt card's OFFER is withheld while every account is blocked (`shouldShowConnectorPrompt`'s `blocked`), because a "Connect" press would open a provider window that cannot land — a person with no account at all still gets the offer, since the fault is per account. Guards: `__tests__/a-blocked-configuration-is-never-connected.test.tsx`, `__tests__/connection-statuses-are-the-servers-statuses.test.ts` (proven failing on a fourth status planted in a scratch copy of the server file).
- 🚨 **THE DIALOG A PERSON REACHES FROM A BROKEN ROW SAYS WHAT IS BROKEN, AND ITS TWO SENTENCES AGREE.** `accountSummary` is rendered ABOVE the rows, not only inside the closed account `Select` a person with one account never opens, and `ProductRow` badges `account_unusable` ("Needs reconnecting") and `unavailable` ("Blocked") with the account's own sentence — so nine rows the account HOLDS can no longer read exactly like rows nobody ever connected. The line above the rows may not say "Nothing it already has is asked for again" while the footer says it will approve nine products again: for a dead credential it says the press renews what the account already has (VERIFY-U-P2-R5 V17-3). Guard: `__tests__/the-consent-dialog-says-the-credential-is-dead.test.tsx`.
- 🚨 **THE INVENTORY IS A LIST TREATED AS COMPLETE, SO IT PAGES.** Both reads in `listGoogleConnectionInventory` go through `readAllRows` with `{ count: "exact" }` and a stable total order: the connection ids become the resource filter, the resources are counted per account, and that count is what `revokeConsequence` tells a person a Disconnect will strand. PostgREST caps at 1000 rows without erroring, so above the cap the number a destructive press is weighed against was silently short (VERIFY-U-P2-R5 V17-7; 313 undeleted rows today). Guard: `marketing/google/service.auth.test.ts` (1200 rows, red at 1000).
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

- `2026-09-22` — **`connectors / shared_account.member_default_level` was a registered knob NO code read, so every member of an organization was offered Disconnect on the organization's shared account.** `migrations/connectors_knobs.sql` declared the row "consumed by the sharing layer"; there was no sharing layer, org-owned connections are reachable through RLS by every member, and `ConnectorsSettingsPanel` handed each of them Reconnect and Disconnect — the clinic's shared `info@` mailbox could be disconnected by anyone in the clinic, while an admin who set the knob to "Viewer" saw "saved" and nothing changed (`pnpm check:settings-orphans`, LANE SETTINGS-3). The read is now [`shared-account-level.ts`](shared-account-level.ts), through `useEffectiveKnob` and the register's own `{ feature, key }` pair, resolved **per card for the account's OWN organization** (a personal Google account and an employer's shared one sit on the same screen; the knob is organization-rung). `admin` and above may reconnect or disconnect; `viewer`/`commenter`/`editor` may only USE the account, which is the knob's own vocabulary. The organization's owners and admins keep full control — the knob governs MEMBERS, and `overridable_by` is `{organization}` only so a member cannot raise their own level. **No code fallback:** a knob that has not answered, or answers with a level this build does not know, hides the credential controls and prints the reason instead of guessing "editor" (law 4). Guard: [`__tests__/a-member-cannot-disconnect-the-organizations-account.test.tsx`](__tests__/a-member-cannot-disconnect-the-organizations-account.test.tsx) — red on the pre-fix bytes (Disconnect rendered for a member at the seeded default), green after. Evidence: `features/connectors` 58 suites / 425 passed 1 skipped, `tsc --noEmit` clean, `check:settings-orphans` exit 0 with the address gone from `fresh`.

- `2026-09-20` — **V-30 NEW-1 / NEW-6: the route-answer guard still licensed the href it exists to refuse when the caller hardcoded BOTH sides, and it reported an unenumerable leaf as a clean `true`.** (1) V-29's fix required `literal === value`, which is an agreement between two things ONE author wrote: `routeAnswerFor("/marketing/sites/tracking", { params: { siteId: "tracking" } })` answered **true**, the same door-to-nowhere through the same guard a second time, one spelling further on. A declared VALUE is now evidence only when it could have come from a record — it is not a word this app spells itself (a static route segment anywhere in `manifest.generated.json`, or a member of that segment's own closed page vocabulary), and, where the segment is an ID (`[siteId]`, `[brandId]`, `[id]`), it is uuid-shaped or at minimum carries a digit; a bare lowercase word in an id segment is a page name nobody looked up, and is refused by sentence naming which. The lawful caller is untouched because it hardcodes neither side: `routeAnswerFor(hrefFor(site), { params: { siteId: site.id } })` passes a value a READ produced. (2) `/user-settings/config/<anything>` answered `answers: true, problem: null` — indistinguishable from a leaf that was checked — because the runtime `config.*` taxonomy family is the one id set `vocabulary.ts` cannot enumerate; that bound lived in a COMMENT, and a comment is not a verdict, in the same round that taught the read sweep that silence must not read as clean. `RouteAnswer` is now a tri-state: `verdict: "answers" | "refuses" | "unmeasured"`, with `unmeasured` carrying the reason (*"runtime config sections are not enumerable statically"*) so a census can COUNT what nobody judged. The `config` ROOT and every enumerated tab stay measured answers, and a settings href naming nothing is still a refusal. Red-then-green against the HEAD modules (`0a66db43`): the NEW-1 plant `Expected: false / Received: true`, the NEW-6 leaf `Expected: "unmeasured" / Received: undefined`; green after, with a real uuid asserted as a measured answer. Evidence: `npx jest lib/route-manifest features/connectors features/window-panels` → 105 suites / 748 passed 1 skipped, `pnpm check:parse` OK (17,167 files), `pnpm check:doc-claims --strict` green (15 claims), scoped `tsc` clean in every changed file (7 pre-existing errors, all in unrelated transitively-pulled modules).

- `2026-09-20` — **V-29 NEW-6 / NEW-7 / NEW-9: the route-answer guard trusted the caller's own declaration, judged only the FIRST settings segment, and called an external address a 404.** (1) `params` was a list of NAMES and a name simply switched the check off for that segment, so `routeAnswerFor("/marketing/sites/tracking", { params: ["siteId"] })` answered **true** — the very href this guard exists to refuse, waved through by the row declaring it. `params` is now a NAME → VALUE map and the pattern's filled segment must carry that exact value; a name declared with no value is UNVERIFIED and fails by sentence (*"declares the parameter `siteId` but supplies no value for it, so nothing checked that 'tracking' is a real site…"*), so a declaration can never license a literal. (2) The settings vocabulary asked only whether segment one named a real section, so `/user-settings/integrations/not-a-real-tab` answered **true**; the settings URL is ONE whole registry tab id (`urlToTabId`), so `lib/route-manifest/vocabulary.ts` now carries the registry's FULL id set (sub-tabs included) and judges every consumed segment — and the drift guard IMPORTS `settingsRegistry` instead of regexing `^\s+id: "…"` over one file, which a single-quoted or computed id walked straight past (proven: a planted `id: 'v29probe'` is invisible to the old regex and fails the new export diff). The runtime-built `config.*` taxonomy sections are declared as the one family this file cannot enumerate. (3) An absolute href came back *"served by no route in the manifest — it is a 404"*, sending the reader to hunt a route that was never missing; `routeAnswerFor` now returns `external: true` with *"an absolute address, not a path this app routes — an external address is never a route door; use an explicit external action."* Red-then-green against the pre-fix modules (all three returned the wrong verdict at `d1e2bcbd`), and all three are pinned INSIDE the connectors census too, so loosening the matcher turns this suite red. Evidence: `npx jest lib/route-manifest features/connectors` → 58 suites / 435 passed 1 skipped, `pnpm check:parse` OK (17,155 files), `pnpm check:doc-claims --strict` green, scoped `tsc` clean in every changed file.

- `2026-09-20` — **V-28 NEW-4: the new "a route action lands on a route that ANSWERS" guard passed `/marketing/sites/tracking` — the exact href the entry above names as the defect it was written for.** The matcher resolved it to `/marketing/sites/[siteId]` with `siteId = "tracking"`, so `routeStatusFor` returned `live`: Next.js really would serve that page, and the page would then look up the site whose id is the literal word "tracking", find nothing and refuse. A `live` status and a door to nowhere at the same time — the guard could only ever ask "does SOMETHING serve this", never "does it answer". Fixed as a class in `lib/route-manifest/match.ts`: the matcher now walks Next.js's segment rules itself and reports WHICH dynamic segments swallowed WHICH literal, and the new `routeAnswerFor(href, { params })` refuses a href whose caller supplied no parameter values but whose pattern has a dynamic segment — `` `/marketing/sites/tracking` is served by `/marketing/sites/[siteId]` — it would open the site named 'tracking'. `` A caller that DOES carry an id names the param it filled and passes; Next.js specificity (static beats dynamic beats catch-all) is untouched, and `unbuilt` / `placeholder` still fail as before. **A working door the first cut of the rule falsely refused, found by running it:** `workspace_files` → `/user-settings/integrations` is served by the settings catch-all `/user-settings/[[...path]]`, whose segments are SECTION NAMES, not ids — so a route may declare its segment a closed vocabulary in `lib/route-manifest/vocabulary.ts`, proven against `features/settings/registry.ts` by a test that fails the moment a section is added or retired; `/user-settings/tracking` is still refused by name. Red-then-green in `lib/route-manifest/__tests__/a-declared-href-lands-on-what-it-names.test.ts` (the `/marketing/sites/tracking` plant red, `/marketing/brands` green, `/marketing/sites/<id>` with `params: ["siteId"]` green, `/hr/me/schedule` placeholder red, `/tag-manager/tracking` unbuilt red) and the plant is repeated INSIDE the connectors census so loosening the matcher turns this suite red. Evidence: `npx jest features/connectors lib/route-manifest utils/permissions` → 62 suites / 701 passed, `pnpm check:parse` OK, scoped `tsc` clean.

- `2026-09-20` — **V-27 NEW-1: the census suite was RED at head for two days, because U-M2 gave Tag Manager a door and left it on the "offers nothing" list.** `d0c6e56f` changed `tag_manager`'s `firstAction` from `kind: "none"` to a route and never touched `OFFERS_NOTHING_YET`, so `every-connected-product-offers-its-first-action.test.ts` failed (`Expected -"tag_manager"`); `4a082038` (F-119) then edited that very file to pin Contacts and shipped it red, and two "green census" reports were written over it. Struck `tag_manager` AND `youtube` from the list — U-M3 built `BrandChannelPanel`, which binds the client's owned channel IN PLACE, and that panel's absence WAS `youtube`'s written reason. Both rows are ROUTES, and the reason is written into the config: their doors need an id this surface does not hold (`SiteTrackingPanel` needs a `siteId`, `BrandChannelPanel` a `brandId`), so an overlay action with `needs` would resolve as missing and render no control at all — the row offering nothing again. Both go to `/marketing/brands`, the client roster: there is no flat site list any more (`/marketing/sites` permanently redirects there), a website belongs to a client, and the labels now say PICK rather than promising one site's tracking and delivering a roster. **New in the census, so "a real in-app path" stops meaning "starts with a slash":** a route action must land on a route that ANSWERS, resolved through the derived route manifest (`lib/route-manifest/match.ts`, new — the one matcher from a concrete href to the pattern that serves it, static beating dynamic beating catch-all as Next.js ranks them) — a registered coming-soon `placeholder` fails too, because a 200 that is still a dead end is exactly what a first useful action must never be. Proven RED with `href: "/tag-manager/tracking"` (`status: "unbuilt"`), GREEN on `/marketing/brands`; whole `features/connectors` suite 57 suites / 414 passed.

- `2026-09-19` — **U-M2 closed Tag Manager's `firstAction` dead end.** The row said `kind: "none"` with "no surface of its own exists" — true when F-51 wrote it, false now: `SiteTrackingPanel` is on every site's Integrations settings and in the `siteTrackingWindow` panel. It still cannot name WHICH site (that would be a guess), so it routes to `/marketing/brands`, one click from any of them. Nothing else changed here: the `tag_manager` product, its capability key, its scope bundle and its health row were already right, and U-M2's panel consumes `productHealth` / `rolloutSentence` rather than growing a second rollout read. One correction the panel had to make in its own copy, recorded because the same trap is open to any consumer: `rolloutSentence` describes the ROLLOUT, so printing it beside "not connected" yields "Tag Manager is not switched on … Tag Manager is generally available on your account" — two sentences that contradict each other. A product can be fully rolled out and still ungranted on this account; the row's own `reason` / `remedy` are the honest words then, and the rollout sentence is said only when a rollout entry is actually ineligible.

- `2026-09-19` — **F-51 first-action sweep (R27): Contacts' first action opened the NATIVE CSV/vCard wizard instead of the Google Contacts import panel.** `provider-config.ts`'s Contacts row was `{ kind: "route", href: "/crm/import" }` — `/crm/import` is the native import wizard (`app/(core)/crm/import/page.tsx`, "Bring your people and companies into the CRM from CSV, TSV, Excel, or vCard exports"), never a Google-native door. The real door, already built and catalogued exactly like Tasks' own import button, is the `googleContactsImportWindow` overlay (`GoogleContactsImportWindow` → `GoogleContactsImportPanel`, opened by `useOpenGoogleContactsImport`). Fixed to the same `kind: "overlay"` shape Tasks uses, with `needs: ["organizationId"]` (`GoogleContactsImportPanel` refuses to load without it, same as Tasks'). Census of every other Google product's `firstAction` against its real door found no other mismatch: `workspace_files` → `/user-settings/integrations` (a real settings tab, `features/settings/registry.ts`), `calendar` → `googleAgendaWindow` (correct, no `needs`), `tasks` → `googleTasksImportWindow` (correct), `search_console`/`analytics` → `/marketing/connections/google` (real route, `app/(core)/marketing/connections/google/page.tsx`), and `gmail`/`tag_manager`/`youtube` remain `kind: "none"` with their existing written reasons (no surface exists yet). Guard: [`__tests__/every-connected-product-offers-its-first-action.test.ts`](__tests__/every-connected-product-offers-its-first-action.test.ts) now also asserts `overlays` contains `"contacts"` (alongside the existing `"calendar"` pin) — RED on the pre-fix bytes (`Received array: ["calendar", "tasks"]`), GREEN on the fix; the existing "carries every context key the overlay reads" case now also covers Contacts' `needs` via the same `WINDOW_REQUIRED_CONTEXT_KEYS` census.

- `2026-09-19` — **F-115 (V-26 NEW-1 + NEW-2): a selection outlived the rows it was made from, and the proof read latched off after one keystroke.** (1) On a FAILED contacts read `setSearch(null)` dropped the rows but the selection survived, so the footer still read *"1 selected"* with **Review the field map** ENABLED over zero rows — pressing it fired `importGoogleContacts(dryRun)` for contacts the account had just refused to hand over, under whatever account the failed read was refusing (the verifier's DOM: *"Refresh · Google could not be reached just now. · Try again · 1 selected · Review the field map"*). The Tasks sibling already said the rule out loud by hiding its footer with no list in hand; the rule now lives ONCE, in the shared piece both panels fail through — `googleImportSelectionControls` in [`import/read-failure.ts`](import/read-failure.ts): in the `failed` state the footer is ABSENT rather than dead, and the ids it can act on are only those a read of the CURRENT account has returned (`seenIds` for contacts, the active list's task ids for Tasks), so an id no read ever proved can never reach an import call. Both panels now derive their footer from it. (2) `typedRef` was set on the first keystroke and never cleared, and the read effect branched on it — so every later re-run (choosing a Google account after a 409, an organization change, a retry) fired the TYPED read only. The account reset clears `unfilteredSearch` and nothing refilled it, so after the exact F-113 recovery path (409 → type → press an account) the panel read *"1 shown of 1 read from one@x.com … Still looking for the contact this link named…"* forever beside a settled read. "The proof read is owed" is now STATE (`owed | running | settled`), re-owed by every precondition change — mount, organization, chosen account, Refresh/Try again (one `retryRead`), and the query cleared back to `""` — with a sequence guard so a superseded proof read cannot report someone else's settlement; the typed effect now runs only for a non-empty query. The still-looking line renders only while a proof read is genuinely owed or in flight AND possible (an organization in hand, no read failure). Guard: one RED-then-green case in each existing suite, both reproducing the verifier's DOM — [`import/a-failed-read-is-not-an-empty-read.test.tsx`](import/a-failed-read-is-not-an-empty-read.test.tsx) (tick a contact, then a failing Refresh: no footer, no import call; plus the Tasks census of the same rule) and [`import/phantom-selection.test.tsx`](import/phantom-selection.test.tsx) (409 → type → press an account: the unfiltered proof read runs again under that account, the link's contact is promoted, and the still-looking line is gone).

- `2026-09-19` — **F-113's picker stopped reading its contract out of the server's prose.** The 409 `several_google_accounts` carried `details: {remedy}` and nothing else, so the accounts the server considered existed only inside its sentence and [`import/read-failure.ts`](import/read-failure.ts) scanned that sentence for email shapes to build the choice a person presses — our wording was a contract nobody declared, and a rewording would have silently emptied the picker. aidream now carries them structurally (`AmbiguousGoogleAccount.candidate_accounts` at its one raise site, `google_integrations/tool_shared.py` → `resolve_google_account`; serialised by the ONE router, `api/routers/google_import.py`, for Contacts, Tasks and any Google read added later), holding exactly the `google_account` values that call would accept. `googleCandidateAccountsIn` narrows `details.candidate_accounts` from `unknown` here at the boundary — the 409 body is a plain dict on the server, so nothing about it reaches `types/python-generated/api-types.ts` (the F-25 pattern; `pnpm sync-types` was neither needed nor runnable in that container). Tests: three cases in [`import/a-failed-read-is-not-an-empty-read.test.tsx`](import/a-failed-read-is-not-an-empty-read.test.tsx), the first RED on the prior bytes — a payload whose `candidate_accounts` and sentence name DIFFERENT addresses must render the structured pair. 🚨 **OWED (no-legacy):** the sentence scan (`googleAccountsNamedIn` and the fallback branch that calls it, both marked in the file) is kept ONLY for a server older than 2026-09-19 and is deleted once aidream's change is deployed — nothing else may grow to depend on it.

- `2026-09-19` — **F-113 (V-25 NEW-1 + NEW-2): the Google import panels read a FAILED read as a settled empty one, and handed a person a machine instruction as their remedy.** With the server refusing the contacts read (live 409 `several_google_accounts`), the panel printed at once the server's failure, *"Still looking for the contact this link named…"* and *"This Google account has no contacts we can read."* — three sentences that cannot all be true: nothing was looking, no contact was ever read, and "this Google account" was said while the server had just named TWO. The remedy on screen was *"Re-run with `google_account` set to the one you mean."*, with no picker anywhere and a Refresh that re-ran the identical failing request — the law-4 shape F-110 fixed for organizations one surface over. The class fix is F-110's, applied to the read: [`import/read-failure.ts`](import/read-failure.ts) names the four states (pending / failed / empty / rows) and types the refusal (`several_accounts` with the accounts the server named, or `failed` with the server's sentence), and [`import/GoogleImportReadFailureNotice.tsx`](import/GoogleImportReadFailureNotice.tsx) is the ONE posture both panels render: the accounts become pressable choices that re-read with `googleAccount` set (which then rides the import call too, so preview and save can never resolve to two accounts), any other failure gets the server's sentence and a **Try again** that really re-runs the read, and a refusal naming no usable account sends the person to their Google connections rather than showing an empty picker. Under a failure both panels drop the superseded rows, render neither empty-read sentence nor the still-looking line, and disable Refresh with "Choose which Google account to read from first."; the Tasks footer no longer renders "Select the 0 not here yet" / "Import 0" over a list nobody read. The candidate accounts are read from the SERVER's sentence by shape (`googleAccountsNamedIn`), never assembled here from the connections table, and a wording change degrades to the honest "we could not tell which ones" sentence instead of a wrong picker. Sibling census: the only consumers of `import/service.ts` are these two panels, and `AmbiguousGoogleAccount` reaches a client from exactly one aidream router (`api/routers/google_import.py`) — both panels are fixed by the same shared piece. Guard: [`import/a-failed-read-is-not-an-empty-read.test.tsx`](import/a-failed-read-is-not-an-empty-read.test.tsx) — 3 panel cases RED on the prior bytes (each reproducing the verifier's live DOM: all three contradicting sentences, and the Tasks panel's "This list has no tasks.") plus 3 unit cases over the failure reader, all green on the fix.
- `2026-09-19` — **F-103 finished: `signIn` and `requestScopes` are on the one-window gate too, and the guard now runs on every PR.** F-103 routed nineteen call sites through the gate and made `requestAuthorizationCode` / `startAuthorizationCodeRedirect` take it themselves — but the provider's other two window-openers were left behind the very guard F-103 proved was not one: `if (authInProgress)`, a `useState` read from a rendered closure. `signIn` is what the presentation export and the two Google demo surfaces press, and `requestScopes` is the incremental-consent window; both call GIS's `requestAccessToken()`, which opens a Google consent window exactly as the code primitives do. Two presses in one tick both read the stale `false` and both opened one. Both now take the SAME module-level gate (`acquireOrJoinGoogleAuthorizationGate`, joining a caller's handle), release it in the callback, the error callback and on a synchronous throw, and — because their contracts are `string | null` / `boolean`, called straight from a button's `onClick` where a throw would be an unhandled rejection — surface the refusal on the provider's own `error`, the channel every caller already shows, instead of the `console.log("Auth in progress, skipping...")` nobody reads. Never a second lock: one gate, one door. Tests: four cases appended to [`providers/google-provider/the-provider-primitives-take-the-gate.test.tsx`](../../providers/google-provider/the-provider-primitives-take-the-gate.test.tsx) — two same-tick `signIn` presses reach GIS once, the refusal is the named sentence on `error`, a `signIn` press and an authorization-code press are ONE window between them, and `requestScopes` holds the same gate and releases it when the window is dismissed. RED on the prior bytes (4 failed: the second press got its own token client, so the cross-primitive case saw a non-null token and the same-tick cases hung on a window nobody answered), green on the fix; the whole provider directory is 24 passing. **And the guard is now wired**: `pnpm check:google-auth-gate` (+ `:self-test`) shipped with F-103 and was invoked by NOTHING — the orphaning the five HR guards and `check:signout-scope` each lived in. It is now a step in `.github/workflows/ci.yml` (offline, no credentials) and a gate in both arrays of `scripts/run-release-gates.sh`, CLAUDE.md's gate count and enumeration moved with it, and `scripts/check-doc-claims.ts` now requires both run lines — proven by sabotaging the CI step to `echo SABOTAGE` (`check:doc-claims --strict` red, naming it) and by planting a raw `google.requestAuthorizationCode(...)` call on `GoogleWorkspaceConnectBody` (the guard red, naming file and line); both plants removed.

- `2026-09-19` — **F-114 (Bugbot review 5247166174 on F-112's class fix): a keystroke cancelled the proof read, and a promotion repeated itself.** (1) The mount branch of the contacts panel's read effect returned `() => unfilteredAbortRef.current?.abort()` as its cleanup, and that effect re-runs on every `query` change — so the FIRST keystroke aborted the unfiltered read fired on mount. `unfilteredSearch` then stayed null for the life of the panel: a deep-linked contact was never promoted and "Still looking for the contact this link named…" never resolved into either answer. The branch now cleans up only the debounce timer it owns; the unfiltered read is superseded by another unfiltered read (inside `load`), and unmount is owned by its own effect. (2) `requestedExternalId` survived its own promotion, so every later read — Refresh, the debounced search, the reload after a save — re-promoted it against a selection the person had since un-ticked: "0 selected" became "1 selected" with nobody touching the box. Promotion now clears the request in the same step, which also keeps the banners honest (they all read `requestedExternalId`, and an answered request has nothing left to say). Guard: two cases added to [`import/phantom-selection.test.tsx`](import/phantom-selection.test.tsx), both RED on the prior bytes — the first asserts the unfiltered read's signal is NOT aborted after a keystroke (its mock rejects on abort the way `fetch` does, which is why the existing suite never saw this), the second un-ticks the deep-linked contact and presses Refresh.

- `2026-09-18` — **The attachments route converged on the bare `/api/conversations/{id}/attachments`.** Both halves moved on 2026-09-17: aidream (`dbb15c6e92`) took the attachment endpoints out of the `/ai` mount onto their own bare-root router (`aidream/api/routers/conversation_attachments.py`, the only door), and the regenerated contract publishes only that path, so main's service already calls it (`af2f1ad488`). The guard test and this doc still asserted the `/ai` spelling from the entry below and went red on main; they now pin the bare route and refuse the `/ai` one. The mechanism is unchanged: the spelling lives once in `attachments.service.ts` under `satisfies keyof paths`, so the next server move is a type error here, not a 404 in the inspector.
- `2026-09-17` — **Every attachments read was a 404 — the client called a route the server does not mount.** `attachments.service.ts` hand-typed `/api/conversations/{id}/attachments`; aidream mounts the conversation routes under `/ai` and its compatibility middleware strips `/api`, so the request matched nothing and `conversationAttachments/load` rejected with "HTTP 404" on `/chat/30bfaeb4…` (Error Inspector, 2026-09-17). The route templates are now `satisfies keyof paths` against the generated contract (a route the server does not publish fails `pnpm type-check`), and the failure sentence is read once from the body — `detail.message` + `remedy` when aidream sends its structured error, the plain `detail` string otherwise, and the status plus the route when there is no detail (the old `.json()`-then-`.text()` read an already-consumed body, which is why the inspector saw a bare "HTTP 404"). Guard: `__tests__/attachments-client-speaks-the-contract.test.ts`. The `2026-09-15` "Pending" note below is superseded for the routes: they exist on `origin/main` (`aidream/api/routers/conversations.py`).
- `2026-09-18` — **F-111 (V-24, NEW-4): "Loading Google API…" forever when Google cannot be reached.** `?panels=google_connect`, newly addressable by link (F-105), sat at *"Loading Google API…"* past 120 s with no Connect control, no error and no remedy — Law 4 broken by an unbounded readiness poll. Two unbounded waits, one class: `checkGoogleLoaded()` in [`GoogleApiProvider.tsx`](../../providers/google-provider/GoogleApiProvider.tsx) re-scheduled itself every 100 ms with no timeout and no attempt bound, and `script.onerror` fires only when the REQUEST errors — so a script that is served but never defines `window.google.accounts` (a content blocker, a corporate filter, a proxy that strips the body, an outage) spun for the life of the tab; and `next/dynamic`'s `loading` fallback in [`LazyGoogleAPIProvider.tsx`](../../providers/google-provider/LazyGoogleAPIProvider.tsx), which is where that exact string lives, had no end either. Both are now bounded by `GOOGLE_IDENTITY_READY_TIMEOUT_MS` = 20 s ([`googleIdentityReadiness.ts`](../../providers/google-provider/googleIdentityReadiness.ts)) — a CAPS constant, not a knob, because it is a technical limit on how long a browser can plausibly still be fetching `accounts.google.com/gsi/client` (cold DNS + TLS + ~100 KB on a bad mobile connection, with room), not a behavioural opinion an organization holds. Past the bound the provider enters an honest failed state: `isInitializing` false, `isGoogleLoaded` false, `error` = the one sentence *"Google's sign-in script did not load. A content blocker, a network filter, or an outage can cause this."*, rendered by the ONE component [`GoogleIdentityUnavailableNotice.tsx`](../../providers/google-provider/GoogleIdentityUnavailableNotice.tsx) with **Retry** and **Open Google's status**. Retry re-inserts the script (a tag that already failed never fires `load` again) and restarts the bound; the effect's generation token means a late arrival cannot resurrect the abandoned attempt. The notice is mounted ONCE, inside `LazyGoogleAPIProvider`, so every Google surface inherits it — the connect window, the consent dialog, the Workspace overview and review, the Picker hosts, both marketing integrations workspaces, the CRM connectors and mailbox dialog, the Ads workspace — as a banner, not a replacement, because those surfaces keep working off our own server while Google is unreachable (their Google controls stay disabled on `!isGoogleLoaded`). Sibling census for the class (self-rescheduling readiness polls on a vendor script): one other real instance, `loadGooglePickerScript()` in [`lib/googlePicker.ts`](../../lib/googlePicker.ts), which could hang two ways — a served-but-stripped `api.js` never defines `window.gapi` and never errors, and reusing an `existing` tag that had ALREADY loaded waited on a `load` event that was never coming — now bounded by the same constant and rejecting with the same sentence; `features/content-ir/registry/component-registry.ts:415` (one bounded retry tick, not a poll), `features/podcasts/studio/runs/useStudioRun.ts` (server-run polling with its own lifecycle, not a script readiness wait) and the one-shot layout timers in `components/ui/tabs-navigation.tsx`, `components/ui/cards/apple-cards-carousel.tsx`, `components/layout/new-layout/ResponsiveLayout.tsx`, `lib/layout/useClippedContentGuard.ts` and `components/admin/query-history/query-history-overlay.tsx` are not in the class and were left alone. Guard: [`providers/google-provider/the-readiness-wait-is-bounded.test.tsx`](../../providers/google-provider/the-readiness-wait-is-bounded.test.tsx) mounts the REAL provider under fake timers with a script stub that never defines `window.google`, advances past the bound and asserts the failed state, that Retry inserts a NEW tag and restarts the bound, and that a late `load` does not resurrect it — 3/3 RED on the pre-fix bytes (`error` still `null`, still initializing past the bound), 3/3 GREEN on the fix.

  - `2026-09-18` — **F-111 follow-up (Bugbot review 5247021300): a bounded retry that was still a second 20-second wait.** The first pass bounded the Picker's `api.js` wait but left the dead tag in the document, and the next pick reused it — a tag that already errored, or loaded without defining `window.gapi`, never fires `load` again, so every retry sat out the whole bound and failed identically. The bound made the hang finite; it did not make the remedy work. The provider already re-inserted its GIS script for exactly this reason, and [`lib/googlePicker.ts`](../../lib/googlePicker.ts) now follows the same rule: a failed attempt **removes the tag it owns on the way out**, and a new attempt that finds a leftover tag while `window.gapi` is undefined **replaces** it with a fresh insert rather than waiting on a corpse. The one tag worth waiting on is one a live attempt owns, so the in-flight attempt (promise + its tag) is tracked at MODULE scope: two picks pressed close together share ONE attempt and ONE tag instead of racing two inserts against one bound. `loadScript` is now exported as `loadGooglePickerScript` because a pick is far too deep a path to reach it through from a test. Bound and sentence unchanged. Guard: [`lib/the-picker-script-retry-is-not-a-second-bound.test.ts`](../../lib/the-picker-script-retry-is-not-a-second-bound.test.ts) — fake timers, jsdom never fetches a tag: a timed-out first attempt leaves NO tag and the second inserts a new one that lands the moment it defines `gapi` (not at the bound again); an `error`ed tag is removed and the next attempt re-inserts and is bounded too; two concurrent picks share one attempt and one tag. RED 3/3 on `19b0d2cb` with only the export added so the red is the DEFECT and not a missing symbol (the dead tag survives the failure — `Received length: 1`; and the two picks get two different promises), GREEN 3/3 on the fix.

- `2026-09-18` — **F-103 (V-23, NEW-3): ONE Google authorization window per PERSON — the lock was per component and covered 2 of 19 call sites.** F-89 gave `useGoogleConsentRunner` a lock that covered the organization wait, but the lock was a `useRef`, so it lived per MOUNTED COMPONENT: Settings → Connectors and the consent dialog are both mounted in a normal session, each held its own ref, and each opened its own Google consent window for one person's one intent. The other seventeen sites — including `GoogleWorkspaceConnectBody.connect()`, the main Google connect surface — called `google.requestAuthorizationCode(...)` / `google.startAuthorizationCodeRedirect(...)` straight off the provider context, behind nothing but a local `busy` React state set inside an async handler; the provider's own `authInProgress` was a `useState` read from a rendered closure, so two presses in one tick both read the stale `false`. Fixed as a class at the platform boundary: [`providers/google-provider/googleAuthorizationGate.ts`](../../providers/google-provider/googleAuthorizationGate.ts) is a module-level gate (one tab = one person = one gate), reached through the ONE door [`useGoogleAuthorizationWindow()`](../../providers/google-provider/useGoogleAuthorizationWindow.ts) — `openAuthorizationWindow` (popup), `openAuthorizationRedirect` (same-tab), and `beginAuthorization()` for a caller that must hold the gate across its own awaits. Both raw primitives take the gate THEMSELVES and join a caller's handle, so no call site can bypass it by forgetting. A second press is refused with its own sentence ("A Google authorization window is already open."), never dropped and never a second window; the redirect path takes the same gate and deliberately never releases it, because the page is leaving. `useGoogleConsentRunner` keeps its shape as the React-facing convenience and now takes the shared gate before its organization wait instead of a private ref. All 19 sites route through the door. Guard: `pnpm check:google-auth-gate` (+ `:self-test`) fails on any shipped file outside `providers/google-provider/` naming a raw primitive — red on the pre-fix bytes with all 19, green on the fix. Tests: [`__tests__/one-google-window-per-person-not-per-component.test.tsx`](__tests__/one-google-window-per-person-not-per-component.test.tsx) (two SEPARATE mounted runners pressing in one tick ask Google exactly once, the second refused by sentence while the first is still inside its organization wait) and [`providers/google-provider/the-provider-primitives-take-the-gate.test.tsx`](../../providers/google-provider/the-provider-primitives-take-the-gate.test.tsx) (the real provider against a stubbed GIS: two same-tick popup presses reach GIS once, a popup and a redirect are ONE window between them, a dismissed window releases the gate). Both red on the pre-fix bytes.

- `2026-09-18` — **F-89 (V-22, NEW-1): every connector surface tells the
  resolving beat from the refusal.** Five files here derived a terminal
  organization refusal from a nullable id. The two IMPORT panels
  (`import/GoogleTasksImportPanel.tsx`, `import/GoogleContactsImportPanel.tsx`)
  had a second defect on top: the organization arrives as a PROP the opener read
  at open time, so a window opened while boot was still resolving carried `null`
  forever and went on saying "Choose the organization these tasks belong to
  first" after boot had settled. Both now prefer the prop, fall back to the
  person's own SELECTED organization (the same value the opener would have
  passed — never a personal-workspace substitution), and render
  `OrganizationContextNotice` so the waiting beat is a checking state and the
  refusal is terminal-only; neither fires a Google call in either non-ready
  state. `ConnectorConsentDialog`'s `FirstAction` — the ONE door out of a
  consent that just succeeded — used to VANISH whenever the ambient organization
  was missing, i.e. for the whole of every cold load: it is now disabled with
  the checking sentence while resolving and disabled with the refusal once
  settled, absence being honest only for the terminal state. `useLiveConnectors`
  and `useConnectMcpServer` (the GitHub connect press) and `google-adapter`'s
  consent runner refused a person who HAS an organization on a boot race; all
  three now WAIT through `awaitEffectiveOrganizationId` and show its own
  sentence, remedy included, when it settles with nothing. New
  `import/__tests__/an-import-panel-waits-for-the-organization.test.tsx` (3,
  3 RED on HEAD). Guard: `pnpm check:org-three-states`.

- `2026-09-18` — **F-112 third pass, THE CLASS FIX (Bugbot on `8e612aa2`,
  review 5247049760, comments 4046121991 and 4046121996): a selection holds
  only ids a read has returned; an address names a REQUEST, never a
  selection.** Three Bugbot rounds on this fix were three INSTANCES of one
  root defect, not three unrelated bugs: `GoogleContactsImportPanel` seeded
  `selected` directly from the window address's `initialExternalId` before
  any read had proven the contact exists, and every earlier patch (reconcile
  against the latest page, then a `seenIds` union) still left that
  provisional id able to leak through whichever hole the read could not yet
  close. This round found two more: (1) `load()` shared ONE abort controller,
  so a keystroke before the mount's unfiltered read resolved ABORTED the one
  read that can prove absence — a typed load never wrote `unfilteredSearch`,
  so the address id sat in `selected` with Review ENABLED and neither
  banner: the ORIGINAL V-24 phantom, reachable a new way, by typing early;
  (2) the organization-change effect reset `seenIds` and `unfilteredSearch`
  but not `selected` itself, so the PREVIOUS account's ids stayed selected
  and Review could fire them at the new account.
  Fixed at the class, not the instance: `contactSelectionReducer`, one
  `useReducer` holding `selected`, `seenIds`, `unfilteredSearch` and a new
  `requestedExternalId` together. The address id is now held ONLY as
  `requestedExternalId` — a request — until the FIRST read that returns it
  promotes it into `selected`, exactly once; `selected` can therefore never
  contain an id no read has proven. An organization change dispatches ONE
  `reset` action that clears all four fields together, so a future hole
  cannot again reset only some of them. `load()` now takes TWO independent
  `AbortController`s — one for the unfiltered (empty-query) read, one for a
  typed query — so typing narrows the visible list without ever cancelling
  the read that proves the address's contact does or does not exist; a
  monotonic `callSeqRef` still lets only the most-recently-STARTED call paint
  the visible list, while every settled read (even a superseded one) still
  contributes its ids to `seenIds`. A new banner, `requestedStillLooking`
  ("Still looking for the contact this link named…"), covers the honest gap
  while the unfiltered read has not settled at all — never silent while
  `selected` truthfully reads zero.
  `phantom-selection.test.tsx` gained two cases, both RED on `8e612aa2` and
  green after: a keystroke landing before the mount read resolves (resolving
  the typed read first, without the contact, shows 0 selected/Review
  disabled/"still looking"; the unfiltered read then settling shows the "not
  in this account" sentence) and an organization change with two contacts
  already ticked (0 selected, Review disabled, nothing survives). The
  existing truncated-read case was corrected to the new, correct invariant:
  it had asserted "1 selected" for an UNPROVEN id, which was itself the
  provisional-selection shape this fix removes — it now asserts 0 selected
  and Review disabled until the contact is actually found.

- `2026-09-18` — **F-112 follow-up (Bugbot on `75fd614c`, review 5246968154
  comment 4046052473): a selection may hold any id the panel has SEEN this
  session, never only the current page.** F-112's first fix (below)
  reconciled `selected` against the LATEST `search` page, which treats one
  page as the whole account: (a) a typed query whose narrower page omitted
  the address's contact silently dropped it from `selected`, (b) a
  TRUNCATED first page (the search caps at `limit`, default 50 — the
  service exposes no next-page token or lookup-by-id, `./service.ts`) did
  the same for a real contact sitting past the page, (c) the "not in this
  account" banner then fired off that same truncated/narrowed read — exactly
  the conflation the original changelog entry says it must never do — and
  (d) once dropped, finding the contact later never restored the selection.
  Fixed at the class: `seenIds`, a UNION of every `external_id` any read has
  returned this session (reset only when the organization/account changes),
  set in the SAME tick as the read that produced it (never from a separate
  effect keyed on `search` — that lands one commit later than the read and
  the reconcile effect would fire first against a still-empty `seenIds`,
  dropping a selection the very read just confirmed). `selected` is
  reconciled against `seenIds`, and only DROPPED once the unfiltered
  (empty-query), NOT-truncated read has settled without it — the one read
  that can prove absence; a typed query's page or a truncated unfiltered page
  proves nothing and removes nothing. A truncated unfiltered read that has
  not (yet) turned the contact up gets the honest, weaker
  `requestedContactBounded` sentence ("We could not find this contact in the
  first N read — search for it by name below."), never the "not in this
  account" one, and it clears itself the moment a later read (e.g. searching
  by name) proves the contact is there — nothing was ever removed, so there
  is nothing to "restore". `import/phantom-selection.test.tsx` gained two
  cases, both RED on `75fd614c` and green after: a typed-query narrowing that
  used to read "0 selected" / show the wrong banner now stays "1 selected"
  with no banner; a truncated unfiltered read that used to show "not in this
  account's readable contacts" now shows the bounded sentence, keeps the
  selection, and clears the sentence once a later search proves the contact
  exists.

- `2026-09-18` — **F-112 (V-24): a selection can only contain ids the current
  read returned.** Opening `?panels=google_contacts_import:<bogus
  externalId>:o-<org>` rendered "This Google account has no contacts we can
  read. 1 selected  Review the field map" — `GoogleContactsImportPanel`'s
  `selected` state started from the window address's `initialExternalId`
  BEFORE any read had happened and was never reconciled against what the read
  actually returned, so a stale link, a removed contact, or an id outside the
  read's page left a phantom selection over an empty (or merely
  non-matching) list forever — a real "Review the field map" a person could
  click into for a contact the account does not have. Fixed at the class: a
  `useEffect` keyed on `search` now filters `selected` down to exactly the
  `external_id`s the last read returned, on every read, and a dedicated
  sentence — "The contact this link named is not in this account's readable
  contacts." — fires only when the address named an id absent from the read,
  never conflated with "this account has no contacts" or "no match for the
  typed search". `GoogleTasksImportPanel`'s address carries a `projectId`
  (the import TARGET), never a pre-selected task id, so it does not carry
  this defect shape. New `import/phantom-selection.test.tsx` (2): the bogus-id
  case reproduces V-24's exact sentence and is RED against HEAD ("1 selected"
  present, the review button enabled) and green after; a second case pins
  that an id the read DOES return stays selected with no false warning.

- `2026-09-18` — **F-89 follow-up (Bugbot MEDIUM on `d9dbbc61`): the consent
  runner's one-window lock now covers the organization wait.** Adding the wait to
  `useGoogleConsentRunner().run` put a multi-second await — on a cold load, the
  exact gap the wait exists to survive — BETWEEN the `if (running.current)` guard
  and the line that takes the lock, so a second press inside it walked straight
  through and Google opened a SECOND authorization window: two consent popups and
  two exchanges for one intent. `running.current = true` is now the line after
  the guard, the wait and its refusal live INSIDE the `try`, and the single
  `finally` releases the lock on the refusal path too, so a press that never
  opened a window cannot leave the runner stuck. Census of the class in
  `features/connectors` + `features/google-workspace`: three other `useRef(false)`
  values exist (`ChatConnectorStrip.hasDrawnRef`,
  `GoogleContactsImportPanel.typedRef`, `GoogleDocumentPanel.openRefreshTried`)
  and none is a single-flight lock — they are one-shot markers — and
  `openRecord.tsx`'s `if (busy) return; setBusy(true)` takes its lock
  synchronously, so this was a class of one. New
  `__tests__/one-google-window-even-while-the-organization-resolves.test.tsx` (2):
  a second press during a pending wait, RED on `d9dbbc61` with
  `Received: "opened a SECOND window"`, and a refused wait that releases the lock
  so the next press runs.

- `2026-09-18` — **F-80 (V-21, N4 MED): the Record-backed candidate's two doors
  are touch-sized and distinguishable without hover.** `ResourceAttachPicker`'s
  "open the record" (`ArrowUpRight`) and "join the meeting" (`ExternalLink`)
  controls carried bare `h-3 w-3` icons with no touch sizing, told apart only
  by `aria-label`/`title` on hover — on a phone the two doors of a meeting were
  adjacent ~12px look-alike targets. Both now carry `max-sm:min-h-11
  max-sm:min-w-11` (the exact touch-sizing class the calendar's own
  `AgendaPanel` uses for its "Join the meeting" / "Open in Google Calendar"
  pair — the closest sibling, same entity), a visible text label on `sm:`
  widths (`Open` / `Join`), and a visual distinction that never depends on
  hover: the join door reads `text-primary` (an outbound link) while the
  record door stays `text-muted-foreground` (an in-place open). Both doors
  kept (F-71's rule); F-73's non-modal behavior untouched. Guard:
  `a-record-backed-candidate-renders-honestly.test.tsx` § "V-21: the two doors
  are touch-sized and distinguishable without hover".
- `2026-09-18` — F-75: main deleted `selectEffectiveOrganizationId` (the
  personal-workspace fallback the org-context law forbids). `ConnectorConsentDialog`'s
  `firstActionOrganizationId` now reads the plain `selectOrganizationId` (the same
  value already used for `activeOrganizationId`/`mayConnectForOrganization`);
  with no organization selected, `resolveFirstActionData` already marks the
  `organizationId` key missing and the row's first-action control (e.g. the
  Tasks "Import your tasks" link) renders as absent, never a dead press
  (Law 4). No behavior change when an organization is selected.
- `2026-09-18` — **F-71: the attach picker renders a Record-backed candidate
  (calendar events) honestly.** aidream lane F-62 made `calendar_event`
  attachable through its OWN Record (`communication.calendar_event`, never a
  live Google read) — `/connections/resources` now returns candidates
  carrying `record_table` and an EMPTY `permission_level` (the server's access
  chokepoint already passed before the row could ever be listed). Before this
  lane `AttachableCandidate` (`attachments.service.ts`) carried none of
  `resource_id` / `permission_level` / `record_table`, so a Record-backed
  candidate had no way to open as its own Record and no explanation for why
  it cannot be "chosen" like a Google Doc. Fixed: (1) `AttachableCandidate`
  now carries all three fields, typed exactly as the server's `ConnectionResource`
  payload; (2) `ResourceAttachPicker.tsx` renders an "open in place" control
  (`ArrowUpRight`, `useOpenItemPresentation`) for any candidate carrying
  `record_table`, SEPARATE from the row's own external door (a calendar
  event's `link` is the meeting's join URL, never the Record's own screen —
  the two are different doors and both render when both exist); the row's
  existing `detail` line (server-composed) already says the kind, the time
  and "no longer syncing (detached)" — no client change needed there, and
  nothing here renders the empty `permission_level` as "no access" (nothing
  in this file reads that field at all — it exists only so the type matches
  the wire); (3) `AttachableResource` (`attachable-resources.ts`) gains an
  optional `add_more` string, and the picker renders every visible
  Record-backed kind's `add_more` sentence as plain text below the list — a
  meeting cannot be hand-picked through any Picker, so this is never a
  clickable "Choose…" control, only the server's own remedy sentence
  (`recordKindAddMoreSentences`, derived from which candidates on screen carry
  `record_table`, never a hand list of resource types). Attaching a
  Record-backed candidate already rode the SAME checkbox-and-commit door as a
  picked file (`toggle` → `commit` → `onAttach`, keyed on `resource_ref`) —
  no change needed there. New DOM test
  `__tests__/a-record-backed-candidate-renders-honestly.test.tsx`, a real
  component in a real DOM, red on the three added behaviors (proven against a
  disposable `git worktree` at the pre-change commit: the open-in-place
  control, the join-link's distinct label, and the `add_more` sentence all
  failed; the detail-line and attach-door assertions already passed, since
  those rode existing server-composed fields) and green after. No screen was
  seen — there is no browser in this container.

- `2026-09-18` — **F-73: two Bugbot-confirmed defects in F-71's attach picker,
  fixed.** (1) *Record open stays behind the modal.* The Record-backed row's
  "Open" control called `openItem(...)` while the picker's `<Dialog>` stayed a
  MODAL (Radix's default) — focus was trapped inside the picker, so the record's
  window opened but the person could not reach or focus it. Fixed by reusing the
  existing platform contract for a dialog that can launch a WindowPanel:
  `modal={false}` on the `<Dialog>` (the same convention `CmsPageAiActionDialog.tsx`,
  `NewConversationDialog.tsx` and others already carry) plus
  `onInteractOutside={(e) => e.preventDefault()}` on `DialogContent` so an
  outside click from the newly-focusable record doesn't dismiss the picker.
  Non-modal means the fix never closes the picker to open a record, so the
  person's in-progress selection is never lost — no `onClose()` call was added.
  (2) *Empty list hides the add-more remedy.* `recordKindAddMoreSentences`
  derived "is this kind Record-backed" from a VISIBLE candidate's
  `record_table`, so the remedy sentence vanished the moment the list was
  empty or a search hid every calendar event — exactly when it was needed
  most. The server already declares `record_table` on the KIND row itself
  (aidream F-62's `AttachableKind.record_table`); the generated
  `AttachableKindInfo` does not carry it yet, so `record_table?: string | null`
  was added by hand to the client `AttachableResource` interface
  (`attachable-resources.ts`, commented as client-only until the OpenAPI
  contract catches up) and `recordKindAddMoreSentences` now reads it straight
  off the KINDS the picker was given, independent of which candidates are on
  screen. De-duplication and "never a Picker button for a Record" both hold
  unchanged. New test `__tests__/opening-a-record-does-not-trap-the-picker.test.tsx`
  (mocks `@/components/ui/dialog` to capture the real prop the component
  passes — a deterministic read of the contract, not a guess at Radix's
  internal focus-trap DOM) plus two new cases in
  `__tests__/a-record-backed-candidate-renders-honestly.test.tsx` (empty
  candidate list; every candidate filtered out by search). All three proven
  red against the pre-fix file (copied aside, HEAD restored, re-run, copied
  back) and green after. No screen was seen — there is no browser in this
  container.

- `2026-09-18` — **F-55: an overlay first action carries what its window needs, or the dialog will not render it.** Cursor Bugbot, Medium, thread 4043109495 on PR 228, commit `9e31d18a`: F-51's `ConnectorFirstAction` overlay variant carried only `overlayId`, so the Tasks row's button dispatched `openOverlay({ overlayId: "googleTasksImportWindow" })` with no `data` — the window it opens reads `organizationId` off that data (`GoogleTasksImportPanel.tsx`) and refuses to load without it, so the new "Import your tasks" button opened a window that could list and import nothing. Fixed at the class: the overlay variant now carries an optional `needs: readonly ConnectorFirstActionContextKey[]` (today just `"organizationId"`), the dialog resolves each key from its own scope via `resolveFirstActionData` (the SAME `selectEffectiveOrganizationId` value `TasksHeaderControls`' typed opener already passes) and refuses to render the button at all when a needed value is unavailable, never opening a window that can do nothing (Law 4). Census extended in `__tests__/every-connected-product-offers-its-first-action.test.ts` (`WINDOW_REQUIRED_CONTEXT_KEYS`, hand-verified against each window body's own prop contract) — the added case fails on the pre-fix config (Tasks missing `organizationId` in `needs`) and passes after. New dialog test `__tests__/the-tasks-button-opens-with-the-organization.test.tsx` clicks the real Tasks button through a real DOM and asserts the dispatched `openOverlay` action carries `{ organizationId }`. Calendar's agenda action needs nothing — confirmed against `GoogleAgendaWindow`, which takes no organization/project prop. No screen was seen — there is no browser in this container.

- `2026-09-18` — **F-51: Calendar's first action exists, and the account preference is per PRODUCT.** (1) The consent dialog's promise — every connected row offers its first useful action — was unmet on five of the nine Google rows, Calendar among them although its first action (opening the agenda) had already been built and catalogued in the same project: `firstAction` could only hold an href, and a window has no route. It is now `ConnectorFirstAction`, three declared shapes, and the dialog renders an overlay action as a press that opens the window IN PLACE and steps the dialog aside. Calendar opens the agenda (`googleAgendaWindow`) and Tasks opens the import window that was already built and had no way in; Gmail, Tag Manager and YouTube declare `none` WITH the reason, which is visible debt escalated to the chair, not permission. Census: `__tests__/every-connected-product-offers-its-first-action.test.ts` walks every provider config — four cases, all four failing against the pre-fix config (11 undeclared rows) — and checks that an overlay action names a real catalogued WINDOW, that a route action is a real in-app path, and that the `none` list is exactly the named rows, each with a real sentence. (2) `preferredAccountId` ranked accounts by the NUMBER of live products, and a surface serving ONE product got the biggest collection instead of the account that holds what it serves: with Calendar on one Google account and five other products on another, the agenda read Calendar's health on the account without Calendar, told the person their calendar was not connected, and the doomed-call gate then correctly refused to refresh — a dead end with nothing on screen to explain it. Callers that serve one product now pass `forProductKey` (the agenda, and the detail health strip for a row that names no connection); the ranking is unchanged for everyone else and still decides ties. Red-then-green through the REAL derivation with the bigger account listed FIRST: `features/google-workspace/calendar/__tests__/the-refresh-runs-through-the-account-that-holds-calendar.test.tsx` (3 cases, all three failing before). No screen was seen — there is no browser in this container.

- `2026-09-18` — **F-43: `GoogleContactsImportPanel.tsx` names every Person
  through `EntityRef`, never a hand-built `Link`.** THE DOOR LAW (F-40's
  census): the four `/crm/${personId}` links in the review step and the done
  step (the saved outcome's name, "Open the Person", and both candidate
  lists) were plain `next/link` anchors with no peek — `EntityRef
  token="party"` now renders all four, `openInNewTab` on each since this
  panel lives inside a window and navigating in place would cost the person
  their import session. Covered by
  `features/crm/__tests__/person-doors-census.test.ts`.

- `2026-09-17` — **The capability census grew a RENDER leg (V13-3, second half).**
  The first census proved a declared capability had a product row and its resource
  types were attachable; it could not see that `google_presentation` was
  attachable and unrenderable at once. `capability-keys-are-the-servers-keys.test.ts`
  now also reads the server's `eligible_resource_types` and its
  `ResourceType` union and fails, by name, on a type the client cannot list, name
  or open — measured against `features/google-workspace/resource-types.ts` (the one
  file-type record) and `features/marketing/google/types.ts` (the one
  connection-resource-type list). Both new legs announce UNMEASURED when the
  sibling aidream checkout is absent, like the rest of the file.

- `2026-09-17` — **VERIFY-U-P2-R4 answered: V13-1, V13-2, V13-3, V13-4, V13-5 and
  the client half of V13-6.** The verifier's verdict was REOPEN, and every one of
  those is now fixed at the class with a census or a branch enumeration behind it
  (V13-7 is U-P3's health strip and V13-8/V13-9 are aidream's; none of them is
  touched here).
  - **V13-1 — the account's own sentences.** `diagnoseGoogleConnection` wrote
    operator prose on three branches the `last_error` column is not involved in,
    so round 3's fix and round 3's test went straight past them: a credential
    that is simply GONE rendered "has no vault credential on file (no credential
    item and no legacy vault key), so the server cannot mint a Google access
    token" on the account line and on all nine product rows — "vault" 20×,
    "mint" 20×, "legacy vault key" 10×, "credential item" 10× on one card. All
    three branches (revoked, credential missing, older storage path) now speak
    from `GOOGLE_ACCOUNT_FAULT_CODES`, which gains `access_revoked` and
    `credential_storage_outdated`, and the healthy sentence is "… is connected
    and working." `googleConnectionDiagnostics` keeps the operator words: its
    reader IS an operator, on the super-admin workspace.
    Guard: `__tests__/every-account-sentence-is-declared-vocabulary.test.tsx`,
    which enumerates the BRANCHES of the diagnosis (never the values of one
    column), renders the card for each, and censuses every prose literal under
    `features/connectors/**` for operator words. Red on all three branches at
    `01566c21`, green after.
  - **V13-2 — the knob that could never resolve.** `platform.knob_resolve` takes
    `(feature, key)` and the client sent one dotted string split at the last dot.
    Live, 635 of 812 rows carry a dot inside `feature` and 58 inside `key`, so no
    split rule recovers the pair: this card's read became
    `('connectors.prompt','resurface_days')`, the database answered `P0001 … is
    not seeded` on every mount, and the raise died in an empty catch. The address
    is now the register's own pair (`lib/scoped-config/effectiveKnobs.ts::
    knobAddress` is the one place a ref becomes it), the catch names the address
    and the remedy, and a new census
    (`lib/scoped-config/__tests__/every-knob-read-addresses-a-real-row.test.ts`)
    resolves EVERY client knob read through the same function and matches it
    against the rows both repos' migrations declare. The shared settings-guard
    matcher was also blind to a trailing comma before the closing paren, which is
    why the live `check:settings-unregistered` had never graded this call at all.
  - **V13-3 — `slides` had no home.** The catalog declares thirteen capability
    keys (the report said fourteen; the count is one off, the finding is exact)
    and the provider config covered twelve. `slides` ships as `available`, live
    connection `4a4f4ad5` had recorded a `slides.read` success at 20:48:03Z and
    one `google_presentation` resource is registered — and it appeared in no
    consent row, health row, scope disclosure or revoke consequence. Per PLAN §8
    and §9 it is not a product of its own: it rides the one `drive.file` grant, so
    it is a fourth capability of the "Docs, Sheets & Drive files" row and
    `google_presentation` is one of that row's attachable resource types. The
    dialog copy is unchanged. Guard:
    `__tests__/capability-keys-are-the-servers-keys.test.ts` — the third
    server-set census, built like the refusal-code and admission-code ones, which
    also derives the row from the verbatim live column.
  - **V13-4 — an unrecognised refusal code.** `parseRefusal` dropped the whole
    refusal when the code was one this build has not shipped, so a server release
    that classifies ahead of the client produced a green "Connected" over a
    refused call and discarded the server's sentence; and `refusalDisposition`
    returned `undefined` where `health.ts` tested `=== null`, so the branch for
    "we cannot classify this" was unreachable. The sentence and timestamp are
    kept, the disposition is `null`, and that null owns the row: `refused`, the
    server's words verbatim, a generic remedy that promises nothing about a
    reconnect, and no press.
  - **V13-5 — marketing copy on every row.** A revoked account said "Nothing can
    read Search Console or Analytics with it", ten times per card, including on
    Gmail, Calendar, Contacts, Tasks and YouTube. What stops per product is the
    provider config's `stopsOnRevoke`, which `revokeConsequence` already reads;
    the account sentence names no product, and the census fails on any product
    name in a prose literal outside `provider-config.ts` and the Google adapter.
  - **V13-6 — the shared column's kind.** The reader now accepts BOTH
    `google_connection_capability_health` and the provider-neutral
    `connection_capability_health` lane B-17 is moving the server to, and carries
    the marker AS FOUND (accept-and-ignore, never strip). Consumer action for
    B-17: none — land the rename and restamp the rows.
  - Boy-scout in the same pass: `attachable-resources.ts`'s
    `AttachableAvailability` extended the generated `McpAvailability` while
    narrowing `attachable`, which has been failing `tsc` with TS2430 (plus two
    TS2322s in `features/agents/hooks/useMcpTools.ts`) since the property landed
    in the generated contract. It is now that row with the one field narrowed.

- `2026-09-17` — **the client `FieldAction` mirror adopts `conflict`**,
  mirroring aidream commit `dfba3f5d0` (`aidream/services/google_import/
  contacts.py`, lane B-15's `reimport_policy = ask`): when a manual value and
  Google's disagree and the organization's setting says a person decides,
  `_plan_field` now emits `action = "conflict"` and NOTHING is written until
  the row is ticked. `field-labels.test.ts` § "mirrors the server's own
  FieldAction literal" was RED at HEAD (the server's literal carried
  `conflict`, this repo's `CONTACT_FIELD_ACTIONS` did not). Fix:
  `ContactFieldActionPending` (`types.ts`) and `CONTACT_FIELD_ACTIONS`
  (`contract.ts`) gained the member; `decideContactField` gives it the SAME
  branch as `kept_manual` (starts unticked, choosable, local wins by
  default — ticking takes Google's value, matching the server's own
  "tick … to take Google's value, or leave it to keep what is here"
  sentence) rather than falling through to the generic default, which would
  have offered it ticked and silently picked Google's side for the person;
  `GoogleContactsImportPanel.tsx`'s exhaustive `ACTION_COPY`/`ACTION_TONE`
  `Record`s (keyed on the full union, so a missing member fails
  `type-check`, never a silent `default`) gained a real label ("disagree —
  you decide") — before this fix that Record could not even type-check once
  the union grew the member. The review row still shows the server's own
  `explanation` sentence verbatim (never a client-composed second one), plus
  the existing "Tick the box to take Google's value instead." action line.
  Guard: the mirror test itself (red-then-green against aidream's live
  literal), plus new `field-labels.test.ts` cases for
  `decideContactField({action:"conflict"})`'s shape and a static render
  probe asserting the panel source names `conflict` with a real label
  (before the fix the Record had no key for it, so the badge printed
  `undefined`).

- `2026-09-17` — F-30, two of the four VERIFY-B1-B2-R4 findings against the
  Google import panels (`common-docs/projects/google-native/VERIFY-B1-B2-R4.md`
  D9/V9, V8). **D9's residual, closed:** `GoogleContactsImportPanel.tsx`'s
  ambiguity list (the screen where a person chooses between two customer
  records for one Google contact) printed the raw `matched_by` key verbatim —
  `(external_id:google_contacts)` — at lines 559 and 699, even though the same
  file's "Will update" badge a few lines up already ran it through
  `importMatchKeyWords` (`field-labels.ts`). Both call sites now use the same
  helper; no second map. A new contract test
  (`field-labels.test.ts` § "every matched_by value the server can emit has a
  label") asserts the helper never echoes a raw key back for any value
  `aidream/services/crm/party_resolver.py::_find_match` can emit (`email` |
  `phone` | `domain` | `name` | `created` | `external_id:<slug>`), diffing
  against the server's own literals when the sibling checkout is present
  (UNMEASURED otherwise, never a quiet pass). **V8, closed:**
  `GoogleTasksImportPanel` posts a `project_id` no screen named — the only
  opener on this build (`TasksHeaderControls`, Plane A: import FROM the
  general Tasks list, not from a selected project) always passes null, which
  is honest but was never SAID. The panel now names the project it will write
  onto every task (`<EntityRef token="project"/>`, the same door Gmail
  compose uses) when the opener gave one, and says explicitly "Importing
  without a project — these tasks will not be assigned to one" when it did
  not — never silent either way. Red-then-green:
  `import/tasks-project-naming.test.tsx`.
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
  was chosen per conversation as `platform.associations` edges — written
  straight to the minted id on `/chat/new`, with only agent-switch inheritance
  ever held as pending. The reaper
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
- `2026-09-18` — **F-80 re-armed at phone width (V-22, NEW-4): fixed the class, not the two doors.** F-80 gave the attach picker's two secondary Record doors ("Open" / "Join") a `max-sm:min-h-11 max-sm:min-w-11` touch floor but left their labels `hidden sm:inline`, so below 640px both doors read as two icon-only glyphs told apart only by hover/tint — while the row's PRIMARY select control (the actual point of the picker) carried no touch floor at all and was the smallest thing on screen. Fixed the whole candidate row: the primary select button, the search field, and the footer's Cancel/Attach controls now all carry `max-sm:min-h-11`; both secondary doors keep a permanently visible text label ("Open" / "Join", stacking under the icon below `sm` instead of hiding), so they stay distinguishable without hover at every width per F-80's own standard. Guard: `candidate-row-controls-meet-the-phone-touch-floor.test.tsx`, red on HEAD (primary button/search/footer had no floor; both labels carried `hidden`), green after.
- `2026-09-18` — **F-44: blocked is a word, the dialog says what is broken, and the inventory pages.** (1) V17-1 — the connection status vocabulary gained `unavailable` (chair ruling R22) in one shared client module censused against aidream's `connection_health.py`; the derived health reads it, and reads it from a remedy-less recorded fault too, so a Google account whose OAuth client configuration Google rejected renders as **Blocked** on the card, on every product row, in the consent dialog and in the plan — no Reconnect, no "Connected", no "N of N products in use". An unrecognised status word is `unrecognized`, never `connected`, and renders with no live control. (2) V17-3 — the dead-credential account's own sentence now renders above the rows and on every row it breaks, and the line above the rows no longer contradicts the footer. (3) V17-7 — both inventory reads page through `readAllRows`. (4) V17-8 — `parseGoogleCapabilityHealth` carries the marker it actually saw (or `null`), instead of reporting the legacy Google spelling for a value it did not recognise. (5) The capability census follows `ResourceType` into lane B-24's new `resource_types.py`. Every item red-then-green against the verifier's own inputs; no screen was seen (no browser in this container).
- `2026-09-14` — The column wall that makes those vault references unreadable is now GUARDED, not just documented: `pnpm check:client-reads-granted` reads the LIVE grants, finds every relation this repo's client code reads where `authenticated` holds no table-level SELECT (five today, `users.integration_connections` among them), and fails any call site that says `select("*")`, names a withheld column, or has a select list it cannot resolve. Its self-test replays the pre-3918449ce7 Google select list against the real file and proves the guard fails on it (DD-238).
- `2026-09-12` — Replaced the Google inventory's forbidden vault-reference
  projection with database-generated boolean health facts, and stopped the
  shared query policy from replaying deterministic PostgreSQL `42501` denials.
- `2026-09-18` — Retired the `messageCount > 0` hold: attaching now works from
  `/chat/new` onward, because aidream creates the conversation row on the first
  write against the browser-minted id. The chooser reads and writes the real
  server rows before the first message, so the chip is never an optimistic
  claim about an attachment the server has not taken. Guards proven
  failing-then-passing in `attachments-survive-the-new-chat-handoff.test.ts`
  and `nothing-is-read-when-nothing-is-attachable.test.tsx`.
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
