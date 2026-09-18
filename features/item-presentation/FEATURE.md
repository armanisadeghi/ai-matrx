# FEATURE.md — `item-presentation`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-18`

---

## Purpose

Renders the `item_presentation` render block — a ```json fence keyed by `item_presentation` that an agent emits to drop a **clickable card for a platform entity** (agent, note, task, file, picklist, …) into a reply. The card shows instantly from the inline `name`/`about`, auto-enriches recognized types from the DB, and opens the matching window panel on click. Unknown/misspelled types degrade to a neutral, never-erroring card.

---

## Entry points

**Block detection / render (no route — it's a markdown render block)**
- Detected in `components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts` (`JSON_BLOCK_PATTERNS.item_presentation`, root key + string `type` validation).
- Dispatched in `components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx` (`case "item_presentation"`).
- Lazy component registered in `components/mardown-display/chat-markdown/block-registry/BlockComponentRegistry.tsx`.
- DB round-trip on reload: `features/agents/redux/execution-system/utils/assemble-cx-content-blocks.ts` (`case "item_presentation"` → reconstructs a ```json fence).

**Component**
- `ItemPresentationBlock.tsx` — the renderer (instant skeleton → recognized icon/accent → DB enrichment → grow-in details → click-to-open).
- `detail.tsx` — `resolveItemDetailType(type)`: turns a registry entry into the Detail primitive's `DetailRecordType` (`lib/detail`), so every registry-known type shows as a window (`detailWindow`, the default), a docked side panel (`detailDocked`) or a page (`/detail/[type]/[id]`) from this ONE type map. Seeds from the agent name/about, fetches the full row via `detailSource`, renders every populated scalar field. Replaced `ItemDetailWindow` on 2026-09-17.
- `sourceHealth.ts` — the ONE producer of the Detail health strip for a synced record: it translates the connectors' own `productHealth` over the server's recorded `capability_health` into the strip, so a record and the connectors screen can never disagree about the same grant.
- `syncedColumns.ts` — the synced-row vocabulary: the six candidate column lists the producer tries, and `SyncedRoleColumn`, computed from `types/database.types.ts` so a name no synced table carries cannot be written down (F-54).
- `ItemDetailFrame.tsx` — the frame around every item body in all three presentations: the `matrx-user/item-detail` surface runtime + the right-click menu (moved verbatim from the old window).

**Hooks**
- `useEnrichItem()` — soft-fails; fetches the authoritative row for a recognized type, returns `{ status, notFound, detail }`.
- `useOpenItemPresentation()` — dispatches the right window-panel opener by type, passing a `{ name, about }` seed. Bespoke windows for agent/note/file/picklist stay bespoke; **every other recognized type opens the Detail primitive** through `useOpenDetail()` (`lib/detail`), which honours `ui.detail.default_presentation`. Returns `false` only when there's no id or `config.open` is unset.

**Demo**
- `app/(dev)/demos/blocks/item-presentation/page.dev.tsx` — streaming simulation + gallery of states.

---

## Data model

**Platform registration** (migration `migrations/item_presentation_render_block.sql`, applied + ledger-recorded)
- `skl_definitions` `skill_id='item-presentation'` (`skill_type='render_block'`, `is_system`) — the teaching skill body injected into an agent's system prompt when included.
- `skl_render_definitions` / `skl_render_components` `block_id='item_presentation'` — render registry (web active; chrome-extension/desktop/mobile inactive).
- `shortcut_categories` `'Item Cards'` (`placement_type='content-block'`) + 11 `content_blocks` (`item-card-*`) — user-injectable prompt snippets.

**Enrichment reads** (per `registry.tsx`): `agx_agent`, `udt_notes`, `udt_picklists`, file metadata, etc. — read-only, RLS-respecting, soft-fail.

**Key types** (`features/item-presentation/types.ts`)
- `KnownItemType`, `ItemType`, `ItemPresentationPayload`, `EnrichedItem`, `EnrichmentStatus`.

---

## Key flows

1. **Stream → instant card.** `parseItemPresentation` tolerantly extracts `type`/`id`/`name`/`about` from partial JSON → card renders the moment `type` is known.
2. **Recognized → enrich.** `getItemConfig(type)` resolves icon/accent + `enrich`. `useEnrichItem` fires once `id` is present; on success the card grows in extra detail (framer-motion).
3. **Click → open.** If `config.open` is set and there's an `id`, `useOpenItemPresentation` opens the window panel. Gating is **not** on `notFound` — RLS may block our read while the window itself has access.
4. **Unknown type → neutral card.** No icon match → generic card showing `name`/`about`; never errors.

---

## Invariants & gotchas

- **`type` is the only required field.** The splitter validates `item_presentation.type` is a string; everything else is optional and tolerated.
- 🚨 **THE HEALTH STRIP READS THE LIVE COLUMN, AND NO REGISTRATION RENAMES IT
  (F-51).** `sourceHealth.ts` finds a synced row's connected account in
  `synced_via_connection_id` — the name both synced tables really carry
  (`workbench.google_document`, `communication.calendar_event`). It used to look
  for `refreshed_via_account` / `connection_id` / `account_id`, which NO table in
  `types/database.types.ts` has, so it found nothing on every real row, silently
  ranked the accounts instead, and each registration paid a projection to rename
  its own column. A registration still projects what its row genuinely does not
  say (`provider` for a table that IS Google's, `provider_product` for the grant
  that refreshes it) — never a column the table already has under another name.
- 🚨 **EVERY COLUMN NAME THE STRIP TRIES IS DERIVED FROM THE GENERATED TYPES,
  AND THE COMPILER PROVES IT (F-54).** The six candidate lists live in
  `syncedColumns.ts`, each `satisfies readonly SyncedRoleColumn[]` — a union
  COMPUTED from `types/database.types.ts` (every column on every table whose
  `Row` declares `sync_status`) plus the one column a registration projects
  (`provider_product`, declared there with its reason). F-51 fixed one list by
  hand; the F-54 census found the same fiction in all five siblings, so a
  spelling no synced table carries is now a type error that names the spelling.
  `__tests__/every-candidate-column-is-a-live-column.test.ts` owns what a type
  cannot see: that the union is still narrow, and the reverse direction — a
  synced table carrying a role-shaped column no list names fails until someone
  lists it or writes down in `UNREAD_ROLE_COLUMNS` why the strip does not read
  it — empty today. **RULING R28 (chair, 2026-09-18):** a synced record's
  freshness line reads the provider's own modified time wherever the mirror
  table carries one, in the same position for every table. F-54 had parked
  `communication.calendar_event.external_updated_at` (Google's own updated
  time, not our refresh) in `UNREAD_ROLE_COLUMNS` as an open escalation rather
  than choosing; R28 answered it, and lane F-56 moved the name into
  `REFRESHED_COLUMNS` after `synced_at` and `external_modified_at` — the same
  position `workbench.google_document`'s Google timestamp already holds.
- **A synced table with no provider column shows NO strip, by construction.**
  `web.youtube_video` mirrors a Google record (`external_id`, `synced_at`,
  `external_url`) and carries no provider column, and no registration projects
  one, so `syncedProviderOf` answers null for every row of it. Nothing is wrong
  on a screen today (no item type reads that table), but a YouTube registration
  must give the row a provider before the strip can answer for it — the census
  test names the table so nobody finds this the hard way.
- **When the row names no connection, the account that HOLDS the record's product
  answers for it** — `sourceHealthProducerFor` passes `forProductKey` to
  `preferredAccountId`, so a record never claims its product is not connected
  while the account beside the biggest one serves it (F-51).
- **`canOpen` does NOT gate on `notFound`** (`ItemPresentationBlock.tsx`) — deliberate; see flow 3.
- **Reconstruct as a ```json fence** on DB round-trip — the XML-wrapper default would corrupt the block.
- **Every recognized type is now clickable.** Bespoke windows: `agent` (run window — now seeded with the known name so the title shows instantly), `note`, `file`/`image`/`video`/`audio`, `picklist`. All others open the Detail primitive. To upgrade a type to a bespoke window later, add a branch above the generic cases in `useOpenItemPresentation` — nothing else changes.
- **An existing Person (`party`) is a registered type (F-40).** `crm.party` is the
  ONE record for an external person or company, and it had no in-place
  presentation of any kind: no peek, and the only party window CREATES a record.
  The entry here is the whole fix — window / docked / `/detail/party/<id>` from
  this one registration, never a bespoke Person panel. The 360° workspace stays
  `/crm/<id>` and only the entity registry writes that URL down. Its label is the
  honest generic **"Contact"** — the table holds 460 people and 1,432 companies
  (live 2026-09-18) and `DetailRecordType.label` is per TYPE, so "Person" was a
  lie about three rows in four (N6). The SPECIFIC word comes from the ONE resolver
  `features/crm/party-words.ts` — Person / Company / Contact for an unknown kind —
  and its dossier is the curated `features/crm/party-detail.ts`, never the generic
  column dump. **Still owed to the package:** `labelForRow?: (row) => string | null`
  on `DetailRecordType`, so the header's type chip and the stand-in titles can say
  the record's own word while `label` keeps answering the type-level settings
  sentences ("every contact record now opens as a window"). The peek that goes
  with it lives in `features/organizations/peek/kinds/PartyPeek.tsx`.
- **A type CURATES its own dossier through `refineDetail`, and through nothing
  else (2026-09-18, N5/N6).** The default stays the generic formatter (every
  populated scalar of `select *`, in PostgREST's key order) — right for a type
  nobody has curated, wrong for one a non-technical expert reads all day. A type
  that knows better returns a changed `DetailRecordType` from `refineDetail`:
  `fields` becomes a closed, ordered, human-labelled list; `load` may WRAP the
  composed loader to merge facts one table cannot carry (a party's contact
  points, its employer's name) into the row before the title and the fields see
  it — and that wrapper must never throw, it records the failure on the row and
  the field list says so; `title` may name a nameless record by its own kind.
  `refinePartyDetail` (`features/crm/party-detail.ts`) is the worked example. No
  sibling slots: one refinement hook, one fields section, never a second
  renderer.
- **`detailSource` is the only thing the Detail primitive needs.** A type with `detailSource: { table, titleField }` gets a full-record view in all three presentations; a recognized type without one (`session`, `message` — no single canonical table) opens seed-only. See FOUND_DEFECTS D8. The file kinds carry `FILE_DETAIL_SOURCE` (`files.files`) even though their click-through stays the preview window, so a file opened AS A RECORD shows its row.
- **This registry IS the Detail primitive's type map** (chair ruling 2026-09-17) — never a second registry; `detail.tsx` adapts entries, it does not list them.
- **Dynamic-table Supabase queries must use `string` variables, never literals.** `supabase.from("literal")` / `.select("*")` resolve the entire schema union and blow TS instantiation depth. `detail.tsx`'s loader and `registry.fetchRow` both pass `string` variables to stay generic.

---

## Related features

- Depends on: `features/overlays` (window-panel openers), `features/window-panels`, `@/utils/supabase/client`.
- Depended on by: the chat/markdown render pipeline (`components/mardown-display`).
- Cross-links: `components/mardown-display/chat-markdown/block-registry/ADDING_BLOCKS.md`, `.claude/skills/create-render-block-skill/SKILL.md`.

---

## Doctrine compliance

**Primitives reused**
- Components: `components/ui/*`, framer-motion.
- Hooks: `useOpenAgentRunWindow`, `useOpenNoteInfoWindow`, `useOpenFilePreviewWindow`, `useOpenPicklistManagerV2Window` (`features/overlays/openers/*`).
- Infra: the render-block registry/splitter, the `skl_*` + `content_blocks` platform tables, the `_schema_migrations` ledger.

**Primitives introduced**
- `ItemPresentationBlock` + `features/item-presentation/*` — Why new: there was no clickable, self-enriching entity-card render block. Considered extending: existing JSON-fence blocks (chart/math) — rejected: those are single-purpose renderers with no type-registry/enrichment/open dispatch.
- `item_presentation` skill + content blocks — required by the create-render-block-skill workflow for any new block.

---

## Change log

- 2026-09-18 — **F-87: a Marketing SITE is a registered item type, so a site opens in place — and F-86's door was written against a token nothing resolves.** `web_site` (`web.site`, 49 rows read live) is the Marketing module's central identity, and it had been a registered `platform.entity_types` token with a route (`/marketing/sites/<id>`) and the generic registry peek for months — but it was absent from THIS registry, the type map the Detail primitive reads. So three doors were dead at once: `useOpenItemPresentation("web_site", id)` returned `false`; `resolveItemDetailType("web_site")` resolved the neutral fallback (`load === null`), leaving `/detail/web_site/<id>` — a URL anyone can build — saying nothing about a fully stored record; and every catalog-derived reference chip for the `web_site` noun (`features/matrx-envelope/referenceResolvers.ts`) had the same refusal. On top of that, F-86's new door on the Google marketing answer said `RecordDoor type="site"` — **`site` is not a token anything in this platform resolves** — and `RecordDoor` renders nothing when the type has no wired opener, so the door was absent forever and the reader of "412 clicks" was left with a bare uuid. Fixed as ONE registration on the canonical token, never a twin: `features/marketing/site-item-type.ts` (`WEB_SITE_ITEM_TYPE`) entered here as `web_site`, its `open` discriminant routing to the platform's EXISTING site Quick view rather than a new site screen — `features/window-panels/windows/marketing/SiteQuickViewWindow.tsx` wraps `SitePeekWindow` (the floating panel the Sites portfolio and the Content Plan list already open on a row) and adds only the canonical single-site read `getSiteListRow`, which the Content Plan list already uses for exactly this; a failed read says so with a retry, and the loading state is a panel that says it is loading. `detailSource` (`web.site` / `name`) is still declared and still used for `/detail/web_site/<id>`, the same split a file has beside its bespoke preview window. The registration also carries a CURATED field list (`refineDetail`): `web.site` has five jsonb columns, a `previous_slugs` array, `version` and three image URLs, and the generic `fieldsFromRow` would dump all of them — the N5 defect again — so the record shows Address, Domain, What it is, Status, the owning marketing account as a door on `web_brand` (the generic `brand_id` → "brand" derivation names nothing), who can see it in plain words, Search Console's last read, Added, Last changed, and nothing else. Red-then-green: `__tests__/every-registered-type-opens-or-says-why-not.test.ts` gains `web_site` to its census and fails 2 of 28 against HEAD's registry (`recognized` false, `open` undefined); new `__tests__/a-site-opens-in-place.test.tsx` fails 8/8 on HEAD and passes 8/8 after (registration, loader, title from `name`, the curated list with the plumbing named as absent, the record in all three presentations); new `__tests__/the-one-opener-routes-a-site-to-the-quick-view.test.tsx` pins WHICH opener runs (the Quick view, never the generic detail) and is red on HEAD; `features/content-ir/__tests__/kind-google-result-families.test.tsx` now asserts the door ("Open site in AI Matrx") on both marketing fixtures plus a dedicated case, 3 red on HEAD with the received markup showing the chip and no control, 22/22 green after. `features/scopes/registry/entityRegistry.ts` needed NO change — `web_site` already carries its `hrefFor`. Census of the class: every marketing surface that names a site already draws it as `EntityRef token="web_site"` (13 runtime callsites plus 6 `MarketingAddressUnavailable` route guards), so there were no hand-built identity doors to convert; the two remaining literal `/marketing/sites/${id}` hrefs (`search-console/components/insights/ClassInsights.tsx`, `local/LocalListingsWorkspace.tsx`) are page navigation into the site workspace and were left alone. 143 green across `features/item-presentation`; `check:parse`, `check:kind-marker-law`, `check:canonical-pickers` OK; scoped `tsc` clean on every file this lane touched. No screen was seen.

- 2026-09-18 — **F-81: the reverse census recognises the ACCOUNT role by STRUCTURE, not spelling, and the third mirror table's connection is read (hostile verifier V-21, the F-51 class).** `ROLE_COLUMN_SHAPE.ACCOUNT_COLUMNS` asked its question through a list of remembered spellings, so it could only find a column somebody had already thought of: **an ACCOUNT column is now any `<prefix>_id` whose noun is one of the connection-side relations** — `users.integration_connections` (the account) or its one declared child `users.integration_connection_resources` (a picked file or channel that belongs to one) — with any prefix a table chooses. `web.youtube_video` IS a mirror (`external_id`, `external_url`, `synced_at`) and names its connection side `channel_resource_id`, matching nothing, so `UNREAD_ROLE_COLUMNS` came back EMPTY and the guard written to prevent F-51 was green while the strip could not read that table's account at all — latent only because the table holds no rows, guaranteed the day U-M3 ships YouTube. The structural rule went RED on `web.youtube_video — ACCOUNT_COLUMNS (unseen: channel_resource_id)` **and** on a second column nobody had noticed, `workbench.google_document — ACCOUNT_COLUMNS (unseen: resource_id)`; both now sit in `ACCOUNT_COLUMNS` after `synced_via_connection_id`, because a connection id is the account outright and a resource id needs one hop. That hop is `resolveRowAccountId` in `sourceHealth.ts`, taken off the `resources` the inventory read already returns — listing a resource id WITHOUT it would have been F-51 in a new spelling (`preferredAccountId` compares against account ids, matches nothing, silently ranks), proved by reverting the hop: the two new assertions fail, and the resource deliberately belongs to the account holding FEWER products so the ranking can never be what passes them. Residual blind spot, stated in the guard's header: the rule would rather read the FK and cannot — every FK on all three mirror tables points out of the generated schema set (`users.*`, `iam.*`, `auth.*`) and Supabase typegen drops cross-schema relationships, so all three carry `Relationships: []` while the constraints are live; the one hop that IS declared (`integration_connection_resources.connection_id → integration_connections`) is asserted, and a mirror naming its connection side with none of those nouns is still invisible. 43/43 in the guard, 132 green across `features/item-presentation`.

- 2026-09-18 — **F-63: the two Google item types open from a card, and every registration is
  censused for it.** Lane F-58 found that `GOOGLE_DOCUMENT_ITEM_TYPE`
  (`features/google-workspace/documents/itemType.tsx`) and `CALENDAR_EVENT_ITEM_TYPE`
  (`features/google-workspace/calendar/itemType.tsx`) declared every field `ItemTypeConfig`
  offers except `open` — so `useOpenItemPresentation("google_document", id)` and its calendar
  equivalent returned `false`, and an agent-emitted card for either record could not be clicked
  open at all (no error, no disabled look — the action button simply never rendered, law 4).
  Both registrations now declare `open: { kind: "google_document" }` /
  `open: { kind: "calendar_event" }`; `ItemOpenKind` gained both discriminants and
  `useOpenItemPresentation.ts` routes both to `openGenericDetail()` — the Detail primitive each
  registration already owns via `refineDetail`, exactly the path `party` (F-40) and every other
  non-bespoke type take. New census
  `__tests__/every-registered-type-opens-or-says-why-not.test.ts` walks all 24 registered
  `KnownItemType`s and asserts each declares `open` (or is named in an allow-list with the
  reason it stays closed — empty today: every registered type opens). Red-then-green: reverting
  the two registrations to HEAD fails exactly 3 cases, naming `google_document` and
  `calendar_event` by name (`config.open` received `undefined`); restoring the fix turns all 3
  green. `npx jest features/item-presentation features/google-workspace` is green (342 tests)
  except one pre-existing, unrelated failure in
  `a-picked-doc-opens-as-its-record.test.tsx` (a permission-denied-message assertion that fails
  on HEAD before this lane's changes too — not touched here). No screen was seen.

- 2026-09-18 — **F-60: a refusal is followed by its remedy, never by the product's promise (N8).**
  `productHealth` answers with the product's PROMISE as its `reason` in the two states where
  nothing is refusing anything, and the strip printed that reason whatever the state while never
  printing `health.remedy` at all. On a Doc Google had refused, the strip therefore read "Google
  would not give us this file the last time we asked, and did not say why. Open, create and edit
  only the files you pick. We never see the rest of your Drive." — the question answered with
  reassurance, and no remedy anywhere (VERIFY-U-W1-U-W2, N8). `sourceHealth.ts` now owns the
  class: `PRODUCT_PROMISES` is DERIVED from `GOOGLE_PROVIDER.products` (every product's promise,
  not Docs'), `withoutProductPromises` strips them, and `grantDetailSentence({ refused, says,
  remedy, fallback })` composes the strip's one sentence in the only order that helps — what
  happened, what else we know, what to do — dropping promises as soon as anything is refused and
  never leaving an empty strip. Both composers go through it: this producer (which now also
  carries `health.remedy`, previously dropped) and `features/google-workspace/documents/
  itemType.tsx`, which prepends the row's own refusal. The unmapped-product branch also names its
  remedy instead of ending on "we cannot say whether that connection is still working".
  Red-then-green: new `__tests__/a-refusal-is-never-followed-by-a-promise.test.ts` — a
  `calendar_event`-shaped row on a connected account that granted Drive but not Calendar — failed
  2 of 4 against HEAD, the received string being Calendar's promise verbatim ("See your own
  upcoming events. We never change your calendar."), and passes now with the promise gone and a
  connect/reconnect remedy present; the healthy case still shows the promise, which is the
  positive control. The 32 suites over `features/item-presentation` + `features/google-workspace/
  documents` + `lib/detail` are green apart from one pre-existing failure this lane did not touch
  (`every-attachable-type-has-a-product`: a sibling lane's uncommitted aidream edit declares
  `calendar_event` attachable while `features/marketing/google/types.ts` does not list it). No
  screen was seen.

- 2026-09-18 — **F-56: a calendar event's freshness line reads Google's own updated time (ruling R28).** F-54 found `communication.calendar_event.external_updated_at` (Google's own last-modified time for the event) and parked it in `UNREAD_ROLE_COLUMNS` rather than choosing, because reading it would change what an event with no `synced_at` shows. The chair ruled (R28, 2026-09-18): a synced record's freshness line reads the provider's own modified time wherever the mirror table carries one, in the same position for every table — `workbench.google_document` already does this for `external_modified_at`. `syncedColumns.ts`'s `REFRESHED_COLUMNS` is now `synced_at`, `external_modified_at`, `external_updated_at` — `sourceHealth.ts`'s `stringColumn` reads the first present, non-null value in that order, unchanged — and `UNREAD_ROLE_COLUMNS` is empty again (the mechanism stays for the next escalation). Red-then-green: `__tests__/every-candidate-column-is-a-live-column.test.ts`'s "no synced table carries a role column the strip cannot see" case for `communication.calendar_event` × `REFRESHED_COLUMNS` fails on HEAD's lists once `external_updated_at` is no longer exempted (`communication.calendar_event carries \`external_updated_at\` — columns that play the REFRESHED_COLUMNS role...`), and passes once the name joins the list; a new case in `a-synced-record-shows-its-refusal.test.tsx` — a calendar_event-shaped row with `synced_at: null` and `external_updated_at` set — pins `lastRefreshedAt` reading the Google timestamp, red on HEAD (the field was null) and green after. The F-52 calendar suites and `features/google-workspace` suites, unaffected because they pass full rows carrying `synced_at`, are the positive control. No screen was seen for this lane.

- 2026-09-18 — **F-54: the candidate column names are DERIVED from the generated types, and the fiction is gone from all six lists.** F-51 fixed `ACCOUNT_COLUMNS` by hand; the census behind this entry read `types/database.types.ts` for every sibling and found that **eight of the seventeen names matched no column on any table carrying `sync_status`** — `sync_provider`, `capability_key`, `product_key`, `external_message_id`, `last_refreshed_at` (which sat FIRST in its list) and `web_url` exist on no table at all, while `source_provider` (only `seo.keyword_market`) and `provider_id` (seven tables) and `source_url` (thirteen) live only on tables that are not synced. The strip worked purely because each synced table happened to carry one survivor. New `features/item-presentation/syncedColumns.ts` now owns the six lists and computes `SyncedRoleColumn` from `Database` — the union of every column on every `sync_status` table, plus the one declared projection (`provider_product`, which no table has because a product key is registration knowledge; both Google registrations put it on the row) — so each list is `satisfies readonly SyncedRoleColumn[]` and a fiction is a TYPE ERROR that names it. The surviving lists: `provider` / `provider_product` / `external_id` / `synced_via_connection_id` / `synced_at`,`external_modified_at` / `external_url`. **Behaviour is unchanged on every real row shape** — no live row of any synced table carries a retired name, and the 32 suites over `features/item-presentation` and `features/google-workspace` (270 tests) stay green, including the F-51 account test and both Google record suites as the positive control. Red-then-green, both directions: at the type level a planted `web_url` / `last_refreshed_at` / `capability_key` / `sync_provider` / `external_message_id` each fails scoped `tsc` by name; at run time `__tests__/every-candidate-column-is-a-live-column.test.ts` (32 cases) fails on a fiction planted past the compiler with a cast ("SOURCE_URL_COLUMNS carries `web_url`, which is not a column on any table declaring `sync_status`…"), and fails in the REVERSE direction — dropping `synced_at` from the list names all three mirror tables that carry it. The narrowness of the union is itself pinned, because this lane's first attempt typed the projection map `Readonly<Record<string, string>>`, which collapsed `SyncedRoleColumn` to `string` and let a planted fiction through every `satisfies`. Two findings recorded rather than chosen: `communication.calendar_event.external_updated_at` (a freshness the strip does not read — adding it would change what an event with no `synced_at` shows, so it is in `UNREAD_ROLE_COLUMNS` with the reason), and `web.youtube_video`, which mirrors a Google record with no provider column and would therefore show no strip at all if a registration ever pointed at it. Also honest now: `__tests__/a-synced-record-shows-its-refusal.test.tsx`'s fixture said `last_refreshed_at` and `web_url` — the very fiction under test — and now says `synced_at` and `external_url`, with no assertion changed. No screen was seen for this lane; the evidence is the suites, the gates and the generated types.

- 2026-09-18 — **F-50: `sourceHealth.ts::grantStateFor` adopts the primitive's `blocked` grant word.** F-46 added `blocked` to `lib/detail/types.ts`'s grant vocabulary (rendered BLOCKED, and `reconnectFor` in `useDetailHealth.ts` refuses it a Reconnect structurally) for exactly the reading `case "unavailable"` used to fold into `unknown` because the word did not exist yet — a source the provider or our own configuration refuses OUTRIGHT (V17-1), where a Reconnect button would press for nothing. The producer now returns `"blocked"` for that case. Red-then-green over a REAL `capability_health`-shaped fixture, with a positive control: `__tests__/a-synced-record-shows-its-refusal.test.tsx`'s new describe block — a connection with `health: "unavailable"` (the live column value `googleAccount` reads as `account.blocked`) renders `data-detail-health-state="blocked"`, the word "Blocked" and NO Reconnect button; the file's standing `grant_expired_or_revoked` fixture (a real "reconnect will fix it" case) still renders one, proving the assertion is not vacuous. Before the fix: `"unknown"`. Restored: 6/6 green.

- 2026-09-18 — **F-51: the producer reads the live column, and both projections are gone.** `sourceHealth.ts`'s `ACCOUNT_COLUMNS` is now exactly `synced_via_connection_id` — the column `workbench.google_document` and `communication.calendar_event` both really carry — so the rename each registration was paying for is deleted from `features/google-workspace/documents/record.ts` and `features/google-workspace/calendar/record.ts` (the note the U-W2 entry below left for the next agent, answered; its three old names exist on no table at all). The same call now names the record's product (`forProductKey`), because when a row does not name its connection the producer used to answer from whichever account held the MOST products — so a Calendar event could report the freshness of an account that has nothing to do with it. Red-then-green over the REAL producer and the REAL `productHealth` derivation, with two healthy accounts that BOTH hold Calendar so the ranking cannot be what passes it: `features/item-presentation/__tests__/the-strip-reads-the-connection-the-row-names.test.ts` (3 cases; against the pre-fix producer the first fails, reporting the other account's last call). `features/google-workspace/documents/__tests__/a-linked-document-opens-in-place.test.tsx` now pins the absence of the alias instead of its presence.

- 2026-09-18 — **U-W2: `calendar_event` joins THE type map, and the refinement seam holds a second consumer.** `communication.calendar_event` — live since 2026-09-17 with no client registration — now opens as a window, a docked panel or `/detail/calendar_event/<id>` from ONE entry (`features/google-workspace/calendar/itemType.tsx`; this map is only where the platform learns about it). It uses U-W1's `refineDetail` hook exactly as intended and added no sibling slot: a typed read over the real table, a curated field list, and two extra sections (the attendees with their RSVP state, a door and an open-deal count for every attendee who is a Person here; and the four things a read-only Google grant cannot do, stated as sentences with nothing to press). Red-then-green through the REAL type map: with the registry entry removed all four assertions of `features/google-workspace/calendar/__tests__/an-event-opens-in-all-three-presentations.test.tsx` fail; with `fields` falling back to the GENERIC formatter every presentation prints `__kind`, `calendar_event_attendees` and the whole attendee jsonb onto the screen — which is the concrete cost of the generic path on a row that carries a payload, and the suite now pins it; with the read-only section dropped, three fail. Restored: 4/4 green. One note for whoever next touches `sourceHealth.ts`: its account columns are `refreshed_via_account` / `connection_id` / `account_id`, and this table spells it `synced_via_connection_id`, so the registration projects it — the second synced table in two days to need that projection, which suggests the producer should read the live column name rather than each registration paying for it.

- 2026-09-18 — **F-47: a company is no longer called a Person, and a Person's dossier is no longer a column dump (VERIFY-U-P1-R5, N5 + N6).** `crm.party` holds 1,892 rows — 460 `person`, 1,432 `organization`, read live — and every one of them was labelled "Person", twice on screen, above a field reading `organization`. The same `party_kind === "person" ? "Person" : "Company"` ternary was written out eight times across the CRM, so the words now live once in `features/crm/party-words.ts` (Person · Company · **Contact** for an unknown or not-yet-loaded kind, keyed by the closed `PARTY_KINDS` vocabulary so a new live kind is a type error, not a mislabel). This type's label is that honest generic; the record's own word reaches the dossier's Type field, the peek title and the "Untitled Company" stand-in. N5: the real Angie Sadeghi row opened `Version=2 | Name Key=angie sadeghi | … | Party Kind=person | Visibility=internal | Record Class=contact` — her own name tenth — so the party registration now carries a CURATED list (`features/crm/party-detail.ts`): Name, Type, Title, Headline, Legal name, the employer as a door named after the company, Website, Email, Phone (the ONE contact-points read, under the ONE suppression rule), Do not contact, who can see it in plain English (`lib/record-words.ts`), Added, Last updated — and nothing else, ever. It reaches the screen as ONE `refineDetail` (U-W1's hook, landed the same day) — `refinePartyDetail` wraps the composed loader for the extra read, replaces `fields`, and takes over `title` for the per-kind stand-in; no sibling slots were added. Red-then-green over the REAL company row `d3dc196a…` through the REAL type map: with the label and the curated list removed, all 11 assertions of `__tests__/a-company-is-never-called-a-person.test.tsx` fail and every presentation renders "EnvironmentalbusinessoutlookPersonPerson…Version1Name Key…Party Kindorganization…Visibilityinternal"; restored, 11/11 green. **Escalation to `@ai-matrx/detail` (confirmed escalation C):** `DetailRecordType.label` is a `string`, so the header's TYPE CHIP still reads "Contact" for a Person — the package needs `labelForRow?: (row: Row | null) => string | null`, consumed by `useDetailCore` for the chip and the stand-in titles ONLY (the settings pane's "every X opens as…" sentences must keep the type-level `label`). Second, smaller: `DetailField.ref` renders the platform short-uuid cell INSTEAD of the field's `text`, so a door field cannot name what it opens — the employer's name rides the label as a workaround.

- 2026-09-18 — **U-W1: a connected Google file is a registered item type, and a type may now REFINE its detail.** `google_document` joins THE type map (`registry.tsx` + `types.ts`), so `workbench.google_document` — live since 2026-09-17 with no client registration at all — opens as a window, a docked panel or `/detail/google_document/<id>` from ONE entry, and the health strip finally has a synced record to render on (the thing five verification rounds could not judge). The entry itself lives beside its feature (`features/google-workspace/documents/itemType.tsx`); this map is only where the platform learns about it. New optional `ItemTypeConfig.refineDetail(base) => DetailRecordType`, applied in `detail.tsx`: a type that genuinely knows more than a generic composition can say (a synced file's own `sync_status`, a cached body that must not be printed as a field, a composer that writes back to the provider) changes the composed registration in place — ONE registration still, never a second registry, and every presentation inherits it because they all read the same `DetailRecordType`. A type that omits it behaves exactly as before. Red-then-green: with the registry entry removed, 9 of 10 assertions in `features/google-workspace/documents/__tests__/a-linked-document-opens-in-place.test.tsx` fail (neutral fallback, no loader, no body, no composer, no strip) — restored, 10/10 green.

- 2026-09-17 — **`party` — an existing Person — is registered, so the queue keeps
  its reader.** The approvals contact-import card names the matched Person and
  every ambiguous candidate through `EntityRef token="party"`, and the token had
  no in-place door (lane F-36 under Bugbot round 20, PR 228): `hasPeek("party")`
  was false, no window opener names an EXISTING Person, so
  `resolveItemDetailType("party")` resolved the neutral fallback (`load === null`)
  and every presentation showed the honest absent state for a record that is
  fully stored. Added: the `party` registry entry (label "Person", `Contact` icon,
  `crm.party` / `display_name` detailSource, an `enrich` giving the card the job
  title + kind + domain) and the `party` branch in `useOpenItemPresentation`
  (generic detail — never the CREATE window). Red-then-green:
  `__tests__/a-person-opens-in-place.test.tsx` (registration, the loader, the
  title from `display_name`, the record in all three presentations) and
  `components/official/entity-ref/__tests__/person-door.test.tsx` (the Quick look
  beside a Person's name, including the `openInNewTab` shape the card uses).

- 2026-09-18 — **F-44 (V17-5): `PRODUCT_BY_ITEM_TYPE` is DERIVED again, and censused against the server's attach registry.** The health strip's type → product map is built from the connectors' own `attachableResourceTypes` plus the aliases whose spelling differs, so a picked Slides deck (`google_presentation`) resolves to `workspace_files` instead of taking the honest-gap branch ("we cannot tell which connection refreshes it") with a console warning nobody reads. The fix shipped in `ec7ce701` and was lost when that commit was reverted for its package half (R21); this is the host-side piece re-landed, plus a new cross-repo leg over aidream's exported attach registry (`conversation_attachments/attachable_resource_kinds.json`, lane B-24) that fails when a type a person can attach maps to no product. A blocked account's strip states the reason and offers no Reconnect (`grant: "unknown"`, `onReconnect: null`). Red-then-green: `__tests__/every-attachable-type-has-a-product.test.ts` (4 declared types → null at the hand-typed map, 3 named by the cross-repo leg).

- 2026-09-17 — **`ItemDetailWindow` → the Detail primitive.** The generic window and its opener are deleted; `detail.tsx` (`resolveItemDetailType`) + `ItemDetailFrame.tsx` carry the identical body behind `lib/detail`'s contract, so every non-bespoke type opens as a window (default), a docked side panel or a page per `ui.detail.default_presentation`, with `[`/`]` list navigation, deep links (`?panels=detail:<type>.<id>:as-…`) and the associations + history sections. `file`/`image`/`video`/`audio` gained `FILE_DETAIL_SOURCE`.
- 2026-09-11 — **`conversation` is a first-class item type.** The reference chip's "Open conversation" silently no-oped (no registry entry → fallback config with no `open`). New entry (Chat label, `chat.conversation` detailSource) + `ItemOpenKind` `conversation` branch: resolves `initial_agent_id` then opens the floating Chat window on that conversation; lookup failure is a loud toast.

- `2026-08-24` — **The Item Detail window mounts its own right-click menu, and IS a surface.** Right-clicking inside the floating dossier was answered by whatever page sat underneath, handing the user THAT page's surface, values and agents while they looked at this record — so the platform's generic peek target could not even be copied for an AI. `ItemDetailWindow` now wraps its body in `NonEditableContextMenu` (`sourceFeature="system"`, `contentSource={{type:"raw"}}`, `entity` from the normalised `doorToken` whenever it is a registered `EntityTypeToken`), so Copy-as / Export / Download-as-Markdown / Convert / Attach To all act on the record. Content is resolved GENERICALLY from what the panel already rendered (title, type, id, the opener's one-liner, then every rendered field as `Label: value`) — never per-type, because the window shows an arbitrary entity by definition. New surface `matrx-user/item-detail` (`features/surfaces/manifests/item-detail.manifest.ts`, emitter = nested `SurfaceRuntimeProvider` at the window root) so a menu launch carries declared values instead of screaming a value-mapping gap. Body wrapper is `min-h-full` so the menu answers a right-click anywhere in the window, not just on the rows. Verified live: menu opens un-clipped over the window, no `INERT MENU` / `VALUE MAPPING GAP`, Export → Download as Markdown and Copy as → Copy text both carry the full dossier.
- `2026-06-15` — Closed the opener gap: built the generic `ItemDetailWindow` (overlay `itemDetailWindow`) and routed all non-bespoke types to it via `detailSource` in the registry; threaded a `{name,about}` seed through the openers. Fixed the agent-run window title (seed the known agent name through `agentRunWindow` so it shows before the agent list/definition loads). Fixed latent dynamic-table TS errors.
- `2026-06-15` — Built the block end-to-end (types, registry, enrichment + open hooks, renderer, splitter/registry wiring, DB round-trip, demo). Shipped the platform skill + 11 content blocks (`migrations/item_presentation_render_block.sql`, applied + verified live). Wired openers for agent/note/file/picklist; allowed click-through on `notFound`.
