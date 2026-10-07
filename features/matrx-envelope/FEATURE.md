# Kind Directives — frontend (`features/matrx-envelope/`)

> 🚨 **THE SHELL, THE GRAMMAR AND THE RENDERING LIVE IN THE PACKAGES.** A directive
> IS a kind instance — `{ "__kind": "directive_v1_<class>_<noun>", "items": [...] }` — and
> its grammar, detector, decoder, read-only legacy shim, naming, item summary and the
> DIRECTIVE⇄KIND seam are `@ai-matrx/content-ir/directives` (mirrored from aidream's
> `matrx_graph/content_ir/directives.py`); the renderer registry, `DirectiveRender`, the
> side-effect card, the fallback floor and `ApplyDirectiveButton` are
> `@ai-matrx/content-ir-react/directives`. Both since **0.11.0, 2026-09-08** — this repo
> CONSUMES them and keeps no copy. What lives in THIS directory is what is genuinely host
> property: the reference noun taxonomy, the live chips, the copy-shortcut builders, the
> host-specific renderer registrations (`registry.tsx`), and the HOST SEAMS
> (`directiveHost.tsx`).
>
> Source of record: `docs/protocol/KIND_DIRECTIVES.md` (byte-identical in aidream). Read
> [`/policies/strictness-law.md`](/Users/armanisadeghi/code/common-docs/policies/strictness-law.md)
> before changing anything here. Cross-repo SoR:
> `/Users/armanisadeghi/code/common-docs/systems/architecture/content-ir/FEATURE.md`.

**Detection is `__kind`, never `matrx_version`.** The retired 4-key shell
(`{matrx_version, kind, type, items}`) is READ-ONLY: it is understood in exactly one
module — package-internal to `@ai-matrx/content-ir`, whose only reader is its own
`decodeDirective`; `pnpm check:legacy-shim-containment` now guards this side by asserting
this repo neither re-creates a local copy nor imports one — it is emitted nowhere, and every
decision downstream is made once, on the translated new shell. There is no
"try the new shape, fall back to the old" branch anywhere — that is a defect the moment
it is written.

Recognize the shell once, route by SLUG (exact → class prefix rule), render, fall back
gracefully.

**Protocol mirror pact:** `docs/protocol/KIND_DIRECTIVES.md` (the ONE doc the merge
collapsed `MATRX_ENVELOPE.md` + `MATRX_DIRECTIVES.md` + `MATRX_REFERENCES.md` into) +
`kind_directive_registry.generated.json` + `kind_directives_catalog.generated.json` are
**byte-identical** with aidream's copies; aidream is canonical (registries emitted by its
`scripts/generate_kind_directive_registry.py` — never edit the JSON by hand, and doc edits
land in aidream FIRST). Guarded by `pnpm check:protocol-sync` (in `check:release-gates`;
`release.sh` auto-syncs + commits on drift). The catalog is mirrored because the FE has a
real consumer: `pnpm gen:directive-nouns` derives `catalog-nouns.generated.ts` from it.
The retired three-file mirror set is DELETED, not kept beside the new one.

## The canonical reference item — FLAT identity (the load-bearing invariant)

A reference item is **pure flat identity ids + optional, non-authoritative display
hints. NOTHING else.** There is no `purpose` / `slot` / `ref` / `display` nesting —
intent is decided by the item's **position** (in-content fence = resolve in place;
variable binding = the variable-map key IS the slot), never a field on the item.
(Mirrors [`docs/protocol/KIND_DIRECTIVES.md`](../../docs/protocol/KIND_DIRECTIVES.md).)

**8-type taxonomy** (`REFERENCE_TYPES`): `picklist`, `picklist_group`, `picklist_item`,
`table`, `table_column`, `table_row`, `table_cell` (+ `dataset_cell` as a registered
legacy alias of `table_cell`), and `url`. Example items: `picklist_item` = `{ list_id, item_id, label? }`;
`table_cell` = `{ table_id, row_id, column_name, table_name?, column_display_name? }`;
`url` (`UrlRefItem`) = `{ url, label? }` — the one type with **no Matrx-owned id**, a
plain external link. Never resolved server-side (nothing to look up); the chip opens
`url` directly in a new tab instead of routing through `resolveValue`/`openItemType`.
Built via `urlReference.ts` (`buildUrlReferenceFence`/`buildMultiUrlReferenceFence`).
First consumer: context reference cells (`features/scopes/FEATURE.md` §"Context
reference cells") — a `reference` context item can allow `url` alongside `file`/`scope`/etc.

**Bookmarks ARE reference items.** The UI's `input_table` / `input_list` bookmarks
carry the same identity ids under a bookmark-spelled `type`; `bookmarkToReference.ts`
maps them onto the taxonomy (mirror of backend `BOOKMARK_TYPE_TO_REFERENCE`) so they
render through the SAME live chip renderer.

## Parts

- `@ai-matrx/content-ir/directives` (a PACKAGE, not a directory here) — the grammar (the
  reserved prefix, the CLOSED 8-class vocabulary, derived capability, `buildDirectiveSlug` /
  `parseDirectiveSlug`, the position law as `executesAtOutputRoot` / `resolvesInContent`),
  the legacy shim, the decoder (`decodeDirective` / `tryDecodeDirective` /
  `tryDecodeDirectiveContent`), the auto-view's catalog-derived naming (`directiveDisplay`,
  `nounLabel`, `nounFamily`, `nounTitleColumn` — each taking an optional host catalog), the
  item summary (`itemTitle(item, titleColumn, index, total)`, `itemSubtitle`, `itemFacts`)
  and the seam (`asKindInstance(item, kind)`, `directiveItemKindFromEdges`). Parity with
  aidream is machine-checked: `pnpm sync:directive-grammar`
  extracts the Python constants into `docs/protocol/kind_directive_grammar.generated.json`,
  an offline jest test asserts the TS mirror against it (so CI can measure it), and
  `pnpm check:directive-grammar` verifies the artifact against a live aidream checkout —
  exiting 2 (UNMEASURED), never 0, when it cannot reach the source.
- `envelope.ts` — the FLAT per-type `ReferenceItem` union + `REFERENCE_TYPES` /
  `ReferenceType`, the `directive_apply.*` receipt events (incl. `DirectiveProposed` /
  `DirectiveApplyBlocked`) + `isDirectiveApplyEvent` / `isDirectiveProposed`, and
  `buildDirectiveOutputSchema` (mirrors aidream's schema-gen; pins `__kind` `const` and
  FIRST). **Every receipt's identity field is `directive` and it carries the SLUG** — one
  field, one name for the thing.
- `@ai-matrx/content-ir-react/directives` (a PACKAGE) — `DirectiveRender` (THE renderer:
  decode → host-registered renderer → `SideEffectDirectiveCard` for side-effect classes →
  `DirectiveFallbackCard`; **never null**), the registry (`registerDirectiveRenderer` /
  `getDirectiveRenderer` / `resetDirectiveRenderers`), `ApplyDirectiveButton`, and the
  `DirectiveHost` seam type + `DirectiveHostProvider` / `useDirectiveHost`. The
  side-effect card is registered by the package's own tier, so all 56 registered shapes
  (and every future one) get it with zero edits, on **every** AI Matrx client. The icon is
  **class first** (create/update/delete/action): on a card whose job is authorizing a
  write, a delete that looks like a create is a trap.
- `directiveHost.tsx` — 🚨 **THE HOST SEAMS, wired once.** `matrxDirectiveHost` supplies the
  six things the package refuses to own: `confirm` (`confirmDirective` → `POST
  /directives/confirm`, base URL from the store), `openItem` (the `directiveItemWindow`
  overlay), `renderCopy` (`CopyButtons`), `nouns` (`matrxDirectiveNouns`, from
  `catalog-nouns.generated.ts`), `itemKind` (`matrxDirectiveItemKind`, THE DIRECTIVE⇄KIND
  SEAM), and `reportError` (`captureError`). A seam that cannot do its job is ABSENT, never
  dead: no `confirm` → no Apply button. Mounted by `MatrxEnvelopeBlock` via
  `DirectiveHostProvider` **and** hung on `matrxContentIrHost.directives`, so a directive
  gets its seams whether or not it renders under `ContentIrRenderProvider`.
- `../aidream/apps/shared/chat/src/agents/redux/proposed-directives/proposedDirectivesSlice.ts` (package-owned since P17b) — the per-conversation inbox of agent-proposed actions
  (`ask` policy); `proposeDirective` / `removeProposal` + `selectProposedDirectives`.
- `components/ProposedDirectivesZone.tsx` — the Approve/Decline card per pending proposal;
  Approve → `confirmDirective` (`features/directive-catalog/service.ts`) → `POST /directives/confirm`.
- `registry.tsx` — **this app's renderers, registered into the PACKAGE registry** through
  `registerDirectiveRenderer(class, renderer, noun?)` from `@ai-matrx/content-ir-react`
  (resolution is the package's: exact slug → the CLASS prefix rule → null). **The prefix
  rule is the routing language made real:** registering `reference` once renders every
  `directive_v1_reference_*` slug the 419-noun catalog can mint, so a brand-new server noun
  renders with ZERO frontend edits; an exact slug overrides it. The four side-effect classes
  are deliberately NOT registered here — the package tier owns them. Registered here:
  `reference` → **live, clickable chips**
  (`ReferenceChip`, one per item); `action:create_project_with_tasks` → optimistic project
  card + task list with DB polling; `action:plan_tree` / `action:plan_node_patch` /
  `action:context_groom`. A noun is passed as a NOUN, never a hand-typed slug — the slug is
  BUILT by the grammar, so an unparseable registration is unconstructable. `MatrxEnvelopeBlock`
  imports this module for its side effects so the registrations run before anything renders.
- `referenceFence.ts` — the **reference-fence serializer + reader**:
  `buildReferenceFence({type,items})` / `buildPicklistItemFence(...)` emit the canonical
  ` ```matrx ` fence with its directive shell minified onto one JSON line and FLAT items
  (`{ list_id, item_id, label? }` — no
  `purpose`/`slot`/`ref`/`display`); `parseReferenceFence(value)` reads it back (tolerant of a
  missing ``` wrapper). `readPicklistSelection(value)` → `{ refs, otherText, labels }` reads the
  fence — the ONLY picklist encoding (`legacyTranslate.ts` + the `picklist_ref` dual-read were
  deleted 2026-07-08 after the stored-value backfill). Pure module (no React).
  Never hand-assemble a fence elsewhere.
- `bookmarkToReference.ts` — `bookmarkToReference(bm)` → `{ type, item }` and
  `bookmarksToReferenceEnvelopes(bm[])` → one `reference` envelope per type. The single seam
  that turns `input_table` / `input_list` bookmarks into reference envelopes for the live renderer.
- `referenceResolvers.ts` — the **reference resolver registry** (the data-driven mirror for
  the `reference` kind): one entry per reference `type` → `{ resolveValue(supabase, ref),
  openItemType, openId(ref) }`, reading FLAT ids (`ref.list_id`, `ref.table_id`, …).
  `resolveValue` fetches the LIVE value from Supabase (never throws; returns `undefined` on miss
  → chip falls back to the item's display hint); `openItemType` is the `item-presentation`
  `KnownItemType` reused for click-to-open (optional — omit it and the door derives from
  `opensTable`, the `"schema.table"` the record lives in), `openId` is the underlying entity
  (picklist / table, NOT the cell). All 7 record types registered (+ `dataset_cell` alias): `structured_list`/`_group`/
  `_item` through the list doors (`get_structured_list_for_selection`, `get_user_list_with_items`);
  `table`/`table_schema`/`table_column`/`table_row`/`table_cell` through the record store's data seam
  (`locateTable` → `features/data-tables/service`). `url` is registered too
  but returns the URL/label as-is (`resolveValue` is a no-op — nothing to look up). Adding a reference
  type = one entry here.
- `referenceDoor.ts` + `components/useReferenceDoor.tsx` — **THE DOOR of every reference** (chip,
  directive record link, authored picker chip). Ladder, the same one `RecordDoor` climbs (R35):
  `open` (an item type opens the record IN PLACE and loads it — `opensTheRecord` in
  `item-presentation/registry.tsx`: a bespoke window, or Detail with `detailSource`/`refineDetail`;
  the GENERIC Detail never beats the entity's own bespoke peek — `opensOwnPresentation` + `hasPeek`)
  → `address` (the entity registry's peek, else its route, via `resolveEntityDoors`) → `none`
  (an honest name, never a button). The item type comes from `recordTableTarget(opensTable)`,
  never `noun as KnownItemType`. Chips with a route also offer open-in-new-tab on hover.
  Guard: `__tests__/every-reference-chip-opens-its-record.test.ts` — every catalog noun, alias
  and bespoke noun has a resolver and a real door; `NO_DOOR_YET` (shrink-only) names the 10
  title-less child rows with no route or peek anywhere.
- `MatrxEnvelopeBlock.tsx` — the ```matrx fence renderer, and **the prefix-DEFAULT
  component** for every `directive_v1_*` shape (not a parallel dispatch entry): (1) parse +
  `decodeDirective` (bad JSON / no reserved `__kind` → raw `<pre>`, never throws; a
  malformed reserved slug is captured to the Error Inspector, never swallowed);
  (2) `getDirectiveRenderer` → render the registered component; (3) none registered → the
  prefix floor card. **Graceful fallback at both layers** (unparseable, and unknown shape).

- `referenceText.ts` — **prose ↔ fence** for surfaces that carry raw text and do NOT run
  the markdown pipeline (direct messages, notifications, list previews):
  `splitMatrxFences(text)` (ordered text/directive segments, undecodable fences stay literal
  text), `hasMatrxFence`, `summarizeMatrxText(text)` (one line, each fence collapsed to its
  human label — a preview must NEVER show envelope JSON), and the authoring side
  `buildFencesFromAttachments(refs)` / `composeTextWithAttachments(text, refs)` (one fence
  per `type`, in first-pick order).
- `components/TextWithReferences.tsx` — render a plain-text string with its fences as the
  SAME live chips the markdown pipeline renders. Never hand-parse a fence at a callsite.
- `components/AttachReferenceButton.tsx` — THE generic "attach a reference" `+`: type chips
  (note / file / link / task / project / agent / … from `curatedTokens()`) over the shared
  `ReferenceTypeAdder`, `file` opening THE canonical `FilePickerWindow`. Emits
  `{type, item}` picks; the caller serializes with `buildFencesFromAttachments`. It exists
  so a human never copies fence JSON between surfaces.
- `components/ReferenceTypeAdder.tsx` + `components/ReferencePickerChip.tsx` — the per-type
  sub-picker (file / url / scope / entity-search) and the authoring chip, extracted from
  `features/scopes/.../ReferenceValuePicker.tsx` (2026-07-25) so scope reference cells and
  every new authoring surface share ONE implementation. `ReferenceValuePicker` still owns
  cell semantics (`max_items`, one type per cell, fence ↔ `value_text`).
- Chip labels: `referenceChipLabel(display)` (`referenceResolvers.ts`) — a chip is a NAME,
  and record resolvers return `"heading\nbody"`, so both chips print the first line and keep
  the full value in the tooltip.

## 🚨 THE DIRECTIVE⇄KIND SEAM — the item is a kind, so the kind system draws it

**Arman, 2026-08-26:** the envelope / Matrx-Actions system and the Shape (kind) system are
**ONE system with several methods inside it.** They meet at the ITEM.

A directive is a container; its items are the payload. `matrxDirectiveItemKind`
(`directiveHost.tsx`) resolves `slug → item kind` from the **server-derived** map in `catalog-nouns.generated.ts`
(aidream `ShapeSpec.item_kind` → the catalog manifest). `asKindInstance` stamps `__kind`
first — added, never overwritten — so the item is an ordinary kind instance on the wire.

**What this buys, and why there is no directive-specific rendering code for it:** the
side-effect card hands each item to `DirectiveItemWindow`, which renders it through
`DbKindComponent` — the kind pipeline's own renderer. An `agent_definition` proposal
therefore shows the real agent card, drawn by the same component that draws an agent
everywhere else. **The directive layer owns the ACTION; the kind system owns the DISPLAY.**

A slug with **no** item kind falls to `StructuredValueView`, THE FLOOR — honest, because the
item genuinely has no registered kind. Never invent one.

## A REGISTERED RENDERER MUST NEVER RETURN `null`

`DirectiveRender` renders a found renderer's output **verbatim** — so a
renderer that bails with `null` deletes the assistant's whole message block, on
first paint and every reload, with no error anywhere. The floor tier
cannot save it: a renderer *was* found. **Degrade to
`<DirectiveFallbackCard directive reason="…" />`** (`@ai-matrx/content-ir-react`),
never to nothing. That card is also **THE PREFIX FLOOR**: a slug whose class nothing
claims lands there, named from the catalog ("Create Agent · Agents"), with an Apply button
when the class is a side effect. A shape this frontend has never heard of is still legible
and still actionable. **Since 2026-08-26 the four SIDE-EFFECT classes no longer reach it** —
the package's `SideEffectDirectiveCard` tier claims them, because "named and never dropped" was never enough
for a write: it asked a person to approve a potentially destructive action with no idea what
it would do. The floor's real job — the never-`null` degrade target, and the truly unclaimed
class (`validation`) — is unchanged.

Cost of learning this (2026-07-26): `plan_tree` items addressed by plain-text
`site` (instead of `site_id`) parsed to an empty list → `return null` → a 70KB
content plan, prose included, vanished permanently while sitting intact in the
DB. **Parsers are the other half:** a directive parser must accept every
addressing form its aidream item model accepts (`site_id` OR `site`), or it
silently drops items the server would have happily applied.

## Recognition contract (the four guarantees)

1. **Decode first** — `decodeDirective` recognizes the reserved `__kind` (translating a
   stored 4-key shell on the way in) before anything else (`MatrxEnvelopeBlock` step 1). A
   slug that claims the reserved namespace but does not parse is REPORTED, never treated as
   an ordinary kind.
2. **Registry by slug** — `getDirectiveRenderer(directive)` (`registry.tsx`): exact slug,
   then the class prefix rule — the same shape the kind component resolver uses.
3. **Bring to life** — a registered renderer displays the part (reference → chips; add
   richer/interactive renderers, e.g. click-to-open, by registering them).
4. **Graceful fallback** — no renderer → the prefix floor card; not a directive → raw `<pre>`.

## Consumers / wiring

- `content-splitter-v2.ts` (`SPECIAL_CODE_LANGUAGES` += `matrx`) → block type `matrx`
  → `BlockRenderer` `case "matrx"` → `MatrxEnvelopeBlock`. Round-trip in
  `assemble-cx-content-blocks.ts`. **A ```matrx fence is a CONTAINER** — like an artifact,
  `recoverEmbeddedKindJsonBlocks` must never explode it; since the merge its body
  legitimately declares `__kind`, and without that guard the fence lost its `matrx`
  identity and rendered as a JSON code viewer. A BARE directive object recovered from
  prose is typed `matrx` too, so a directive routes the same way however it arrived.
- **Live proof:** `/demos/kind-directives` renders one real fence per class — current
  shell, stored 4-key shell, a write, an action, and an ordinary kind that must stay raw —
  through the real pipeline. Run it after any change here.
- Directive receipts: `process-stream.ts` routes `directive_apply.*` data events →
  `sonner` toasts (`isDirectiveApplyEvent`). The `directive_apply.completed`/`.failed`
  receipts toast; `directive_apply.proposed` (the `ask` apply policy) is handled below.
- **Proposed directives (`ask` policy):** when the backend resolves a directive's apply
  policy to `ask`, it streams `directive_apply.proposed` (carrying the round-tripped
  envelope + `proposal_id`). `process-stream.ts` enqueues it into `../aidream/apps/shared/chat/src/agents/redux/proposed-directives/proposedDirectivesSlice.ts`;
  `components/ProposedDirectivesZone.tsx` (mounted beside the chat input in
  `AgentConversationColumn`) renders an Approve/Decline card. Approve POSTs the envelope to
  `POST /directives/confirm` via `features/directive-catalog/service.ts::confirmDirective` (runs as
  the user, RLS; idempotent by `proposal_id`); Decline dismisses. **After a reload the card is
  rebuilt from the stored message** (`conversationProposals.ts` → `POST /directives/apply_state`,
  DD-144) — the server says which shells are still approvable, because the apply key is frozen and
  hashes the validated item model. NOT the `pendingAsks`
  rail — a proposed directive is a terminal side effect, not a suspended tool call. Backend
  cascade (agent → surface → user, default `ask`): aidream `services/output_directives/`.
- Schema-proposal (a separate `schema_proposal` json block, NOT an envelope): see
  `features/agents/components/schema-proposal/` — agent's `{name,schema}` output →
  "Apply to an agent".

## Status

- Done: **unified flat reference model.** `ReferenceItem` is the FLAT 7-type taxonomy (no
  `purpose`/`slot`/`ref`/`display`). All 7 types + `dataset_cell` alias resolve live; bookmarks
  converge onto reference items (`bookmarkToReference`); `input_table`/`input_list` render as
  live chips in the context drawer. HARD CUT COMPLETE (2026-07-08): all stored legacy shapes
  were backfilled to flat fences and the `legacyTranslate.ts` seam was deleted.
- Done: envelope module, renderer registry + reference resolver registry — `reference` chips
  **come to life** (live Supabase fetch + click-to-open the entity, graceful fallback to the
  item's display hint) — outer-first recognition + graceful fallback, fence wiring, directive
  receipts, schema-proposal apply flow.
- Done: **authoring (picklist).** Picklist-bound variables emit the ` ```matrx ` `picklist_item`
  reference fence (FLAT items) instead of the legacy `picklist_ref` envelope. The value is a fence
  STRING (single = one item; multi = N items + any "Other" free-text lines) → persists to
  `value_text`. The FE-controlled direct/override `variables` path is live.
- Done: **`directive_v1_action_create_project_with_tasks` renderer.** Optimistic project +
  task card from the shell's items; polls Supabase at 0s / 2s / 5s by slug (or name);
  resolves to clickable project (`ItemDetailWindow` + route) and tasks (`taskEditorWindow`).
  Bare directive JSON (a reserved `__kind` first key) classifies as a `matrx` block via
  `detectJsonBlockType`.
- Done: **generic reference attach + prose rendering** (2026-07-25) — `AttachReferenceButton`
  (the reference-insert authoring picker) + `TextWithReferences` / `referenceText.ts`; first
  consumer is direct messaging (`features/messaging`).
- Next: renderers for `secret` / other `output_directive` types if needed; a table/cell
  authoring picker emitting the flat fence; adopt `AttachReferenceButton` in the remaining
  composers (notes, tasks, comments).

## Change Log

- 2026-10-07 — **G11A picker review, closed at the class (items 1–3, 5; item 4 not reproduced).** (1) The action list never states a guess: `useDirectiveNoun` DERIVES `loading` from the (baseUrl, token) answer it holds, so the render between opening "Change…" and the fetch starting is loading, not "Linking is the only action". The catalog (~2.4 MB, 5–7 s from the server) has ONE client cache, `features/directive-catalog/catalogCache.ts`: the picker prefetches it on open, and a slim persisted copy of each type's create/update/delete flags answers the action list at once on later visits (`useNounActions`); every full load rewrites it. (2) One name per type: `document` (content.document) reads "Markdown Document", `udt_document` reads "Document" — a real type never reads as a catalog alias of its own name (`canonicalTypeToken`; the catalog both lists `document` and aliases it to `udt_document`; same for `context_item_value`); `findNoun`/`gen-directive-nouns` follow the same rule. (3) Mandate, Tool Bundle, Data Store, Code Repository, Canvas Item (no door) join `platform.reference_picker.hidden_types` (`migrations/reference_picker_hidden_types_machinery_g11a.sql`, applied); no group holds one type — lone schemas fold into the group a person looks in (`PERSON_GROUP_SCHEMA`: Chat/Content/Scope → Workspace, Apps/Skills/Tools/Rulebook → Agents, Public Form/User Profile → Communication, SEO → Marketing & Web, Scheduled Task → Workflows, Web Link → Files). The directive-catalog mirror was regenerated from the live catalog (retired `flexible_data`, `working_document` left). (5) The context menu warms its one engine chunk once when the page goes idle (`warmMenuContent`, same specifier, no new boundary). Guards: `reference-picker/__tests__/actions-are-never-guessed-while-loading.test.tsx` (2 red before), `one-name-per-type-no-group-of-one.test.ts` (4 red before), `context-menu-v3/__tests__/first-open-is-already-loaded.test.tsx` (red before).
- 2026-10-07 — **G11B action-card review (partial).** Adopted `@ai-matrx/content-ir-react` 0.25.0 + `@ai-matrx/rich-editor` 0.3.0. Confirm (`DirectiveConsequence.tsx`): an update whose record already holds every value says "Nothing to change" (first ask and Run again, `changesNothing`); a title being read is a whole sentence ("Update this Task?") — never "Update Task ?". Server (aidream `directive_apply/executor.py`): such an update writes nothing and answers "The task was already up to date." Card: muted Apply + "Nothing to change"; row names wrap to two lines on a phone; a Write-view card takes the full line on a phone. Guards: `__tests__/a-confirm-never-asks-before-it-can-say.test.tsx` (G11B block, red on the pre-fix host), package `directive-card-g11b.test.tsx`, aidream `test_an_update_that_changes_nothing_says_so.py`. OPEN: the first Create confirm's ~2 s delay (root cause not found) and the host record link still truncates (`DirectiveRecordLink`).

- 2026-10-07 — **G10B action-card review, closed.** Package `@ai-matrx/content-ir-react` 0.21.0 (adopted; app on 0.24.5): no id is ever shown — a nameless item's fallback is its type, a nameless create says "with no title", Apply hover warms the record read. Host (`DirectiveConsequence.tsx`, `directiveFailureWords.ts`, `directiveRecordRow.ts`): confirm titles use the type's display name ("Create Task …", never "Create task Item?"); a create with no title says so; a refused write names fields as the form does (`wordServerFieldNames` via `directiveFieldLabel` + the form's title column: "Title is required", never "name is required") and offers "Ask for a corrected version, then apply it." instead of "Edit the block"; a record sharing its name with another of its type gains "(Created Oct 7, 1:09 PM)" from `createdLabel` (features/scopes/service/recordFacts.ts); a finished record read is kept briefly so the confirm opens from it, and the dialog opens at once in its "Reading…" state (`ready`); a link to a missing record says "Not found" with no id in text, title or aria-label. Guards: `__tests__/g10b-a-confirm-says-what-it-means.test.tsx` + `g10b-a-record-read-is-kept-for-the-confirm.test.ts` (8/8 red on the pre-fix host files, 8/8 green), package `directive-card-g10b.test.tsx` (5 red on 0.20.2).

- 2026-10-02 — **G10A picker review (nightly clone), closed at the class.** (1) Same-named rows climb a LADDER until they read differently — one rung at a time, only while they still collide: created day → minute → second → last edit to the second → a quiet "1 of 3" (`recordRows` in `ReferenceTypeAdder.tsx`, `stampLabel` in `features/scopes/service/recordFacts.ts`); never an id. The first pass is computed with `created = null` so the created-at read is keyed to the real collisions; the hook returns `null` until that read answers (no flicker). Census: all 116 listable types carry `created_at`/`updated_at`/`created_by`, 23 carry `status`, 6 have a declared fact (`RECORD_FACTS`) — the ladder reaches every type; creator is not a rung (seeded collisions share one creator). (2) The record list fills the dialog and the phone sheet: `ReferenceTypeAdder`/`RecordReferencePicker` take `fill` (list `flex-1 min-h-0`, no `max-h-56`), and the picker's record and write steps are `flex-1 flex-col min-h-0` down to it; popover and cell hosts keep the cap. (3) The Update form's empty words come from one place (directive-catalog log). (4) Chip peeks are titled by the record's name: `WorkbookPeek` read `description` (organizations/peek). Guards: `reference-picker/__tests__/same-named-records-tell-apart.test.tsx` (+5, red before), `the-record-list-fills-the-sheet.test.tsx` (red: `max-h-56`), `organizations/peek/__tests__/every-peek-shows-the-record-name.test.tsx` (all 16 bespoke peeks vs the registry title column; red on workbook).

- 2026-10-02 — **G8B picker review (nightly clone), closed at the class.** (1) Same-named records: a title wraps to two lines (`line-clamp-2`) instead of cutting off "(checkout)"; rows whose title AND secondary line still collide trade the shared edit date for when each was created, with the time when two share a day (`collidingRowIds`, `createdLabel`, `fetchRecordCreatedAt` in `features/scopes/service/recordFacts.ts` — a separate small read, only for colliding rows; ≤60 characters; never an id). (2) One name, singular and plural: `referenceTypeDisplayPlural` (`referencePickerTypes.ts`, same rule as `referenceTypeDisplayLabel`) feeds every record-list placeholder, empty state, "Show more" and aria label — Chat searched "Search conversations…". (3) "Change…" opens the action list in a popover (`ActionRow`), so nothing under it moves while the actions load (it pushed the list ~140px). (4) Copy mode is titled "Copy a reference" (`REFERENCE_PICKER_TEXT`); a pick whose handler throws still closes the dialog and announces it. Guards: `reference-picker/__tests__/same-named-records-tell-apart.test.tsx` (+4; 3 red before), `one-type-one-name-plural.test.ts` (census of every type, red with the registry plural), `the-action-list-never-moves-the-list.test.tsx` (red inline), `overlays/components/__tests__/reference-picker-says-what-it-does.test.tsx` (2 red before).
- 2026-10-02 — **G8A action-card review (nightly clone), closed at the class.** Packages: `@ai-matrx/kit` 0.22.0, `@ai-matrx/design-system` 0.54.0, `@ai-matrx/content-ir-react` 0.20.0 (published, adopted). (1) **A confirm never asks before it can say what it will do.** Clicked within seconds of a reload, the update confirm read "Update note Note ae33f4e0?" "in its organization" with no current value and still ran on yes: names, values and the organization were each read by their own component AFTER the dialog opened. Now `prepareDirectiveQuestion` (`DirectiveConsequence.tsx`) reads every named record first — live name (`resolveReferenceName`, the label hook's own read and cache), fields and trash state (`readDirectiveRecord`), organization name (memberships, else `getOrganization`) — and the dialog is drawn from that one snapshot; it opens at once with "Reading this note…", a name placeholder and NO Confirm (`ConfirmOptions.ready`, held by design-system's host), then the full question. A failed or >8 s read says "Current values couldn't be read." and offers the yes anyway. A record with no readable name is "this note", never an id. "Delete again" on a trashed record says it is already in the trash. (2) **One value, one word:** the package's new `valueLabel` seam is `matrxDirectiveValueLabel` (`directiveHost.tsx`) — `valueWord` for every pick-list field the catalog declares (`catalog-enum-fields.generated.ts`, written by `scripts/gen-directive-nouns.mjs`), the value as written for any other field; card rows, facts and the confirm say "Status Inbox → Completed"; empty reads "None". (3) **Never cut:** the change list wraps and stacks label / old / new below a 20rem container (package); the dialog list is full width (a `w-fit` container collapses). (4) Record links show a neutral placeholder while their name loads (`DirectiveRecordLink`), never "Task 9e11b091"; card facts use the confirm's field-label rule (no "workbook name"). Guards: `__tests__/a-confirm-never-asks-before-it-can-say.test.tsx` (4 red before), `__tests__/a-value-has-one-word.test.ts` (3 red before), design-system `confirm-host-ready.test.tsx` (2 red), content-ir-react `directive-card-g8a.test.tsx` (4 red).
- 2026-10-02 — **G7: a confirm shows the record as it is NOW.** An Update card's confirm said the old title was "G6A renamed target" while the database held "G6A second rename". Root cause: the record's current values (`useRecordValues` over `readDirectiveRecord`) were read ONCE per `noun:id` with no change signal — after Update A applied, everything already drawing that record (Update B's row; a confirm body the dialog layer kept mounted, where B's `ChangeList` sits at the same slot as A's and is reused) kept A's OLD value as "old"; and `readDirectiveRecord`'s in-flight sharing could hand a read started BEFORE a write to a reader asking after it. Fix at the class: ONE change counter per record for the page — `@ai-matrx/content-ir-react` 0.19.0/0.19.1 `noteRecordChanged` / `recordRevision` / `useRecordRevision` (a `globalThis` slot, since each package entry is bundled self-contained) — bumped by every apply (update/delete targets + written records) and re-keying every `useRecordValues`; `referenceResolvers.ts` drops its own parallel counter, so `invalidateReferenceLabel` IS `noteRecordChanged` and labels, trash state and old values all refresh from one signal; `readDirectiveRecord` shares in-flight reads only within one revision. Guards: `__tests__/a-confirm-shows-the-record-as-it-is-now.test.tsx` (2 red on 0.18.1, green), package `directive-record-values-g7.test.tsx` (2 red on 0.18.1, +1 red on 0.19.0).
- 2026-10-02 — **One record type, one name (G6A follow-up).** An action card named its type from the server catalog ("Update Conversation") while the picker said "Chat". `matrxDirectiveNouns` (the package's `nouns` seam) now answers `referenceTypeDisplayLabel` for every noun and alias, so cards, confirms and tallies read the picker's word; the rule itself gained the catalog's label as the fallback before the token ("Settings Profile", not "Ai Setting Profile"), and `titleCaseGroupLabel` keeps a brand's own casing ("eBay", not "EBay"). `ReferencePickerChip` says "(in trash)" like every other chip. Guards: `__tests__/a-record-type-has-one-name.test.ts` (every catalog noun + alias; 352 mismatches red before, green after), `__tests__/a-trashed-record-says-so-and-opens-its-trash-door.test.tsx` (picker chip case red before).
- 2026-10-02 — **G6B picker review (nightly clone), closed at the class.** (1) Words: "Context › Record" → **Scopes › Scope** and "Platform › Rulebook" → **Masterwork › Rulebook** (`PERSON_GROUP_TYPE` in `referenceTypeGroups.ts`, each a vocabulary ruling — a scope is not context; Rulebook is Masterwork's); `category` (platform taxonomy rows) joins the hidden-types knob (`migrations/reference_picker_hidden_types_taxonomy.sql`, applied to the clone; production on the release sweep). Rows under a group heading no longer repeat it (`components/reference-picker/TypeStep.tsx`, split out of the body). An action card's group is now the picker's group: `scripts/gen-directive-nouns.mjs` imports `referenceTypeGroups.ts` (plain Node strips its types) and writes every record type's `family` with it — a Note card said "Sources & Outputs" (`platform.entity_types.category`, a second, older grouping). (2) Write forms speak the record's words: `features/directive-catalog/valueVocabulary.ts` (directive-catalog log); the record search line names a task's status the same way ("Inbox", not "Incomplete"). (3) The dialog holds a fixed size (`h-[min(600px,80dvh)]`, sheet `h-[85dvh]`) so it never re-centres under the pointer while a list loads (`ReferencePickerOverlay.tsx`). (4) Menu header follows a rename (context-menu-v3 log). Guards: `reference-picker/__tests__/a-type-names-its-group-once.test.tsx`, `referenceTypeGroups.test.ts` ("no visible group is a storage word"), `overlays/components/__tests__/reference-picker-holds-its-size.test.tsx`, `directive-catalog/__tests__/a-person-form-asks-only-what-a-person-sets.test.tsx`.

- 2026-10-02 — **G6A action-card review (nightly clone), four defects closed at the class.** Packages: `@ai-matrx/content-ir-react` 0.18.0 (published, adopted). (1) An applied Update said "Title → X (no change)": the old value was read LIVE, and after the apply it IS the new value. aidream now ledgers what an update replaced (`DirectiveReceipt.before` → ledger receipt → `applied_summary` → `/directives/apply_state` items and the confirm's per-item receipts, 1122747fb5); `directiveHost.tsx` passes `before` to the card (`beforeOf`/`beforeByIndex`, narrowed until `@ai-matrx/agents`' generated contract carries it), and the package draws an applied change from it — or only "→ new" without it — never from a live re-read. (2) A chip pointing at a trashed record showed its plain name and opened a window that said "We couldn't open this task…": `referenceTrash.ts` answers trash state for every door from the record the door opens (resolver `opensTable` + `openId`, `deleted_at` only, re-read on `invalidateReferenceLabel`); `useReferenceDoor` returns `trashed` and, for a trashed record, opens `ReferenceTrashDoor` (click-loaded) — the access gate's "in Trash" view with Restore through Trash's one door (`restoreFromTrash`) or the way out — instead of the window; `ReferenceChip` and `DirectiveRecordLink` say "(in trash)". `useDirectiveRecordTrashed` is deleted (one answer). Census: every bespoke `createRecordResolver` noun and every catalog-derived noun (they carry `opensTable`) gets the answer; a resolver without `opensTable` (lists, tables, datasets, store records, files, urls) answers unknown and keeps its door; workbook sheets, document pages and conversation values already read trashed rows as "Not found". `ReferencePickerChip` (another lane's) inherits the trash door through the hook but does not yet print "(in trash)". (3) Update, Delete and every Run again name the organization: an update/delete names the organization the RECORD lives in (read from the record; `organizationNameOf` from the person's memberships), a create/action the one the write is sent with. (4) An update that sets no field shows "Nothing to change" beside a muted Apply that still works (package). (5) Found while verifying: a note re-renders its blocks while the confirm dialog is open, so the card that asked was unmounted and the fresh card — which read the ledger before the write landed — offered "Apply" for an update that had already run; `@ai-matrx/content-ir-react` 0.18.1 holds an apply's progress and outcome per apply authority (`confirm`) + block identity, so every card drawing the block shows the real outcome. Guards: aidream `test_an_applied_update_keeps_what_it_replaced.py`, package `directive-card-g6a.test.tsx`, `__tests__/a-trashed-record-says-so-and-opens-its-trash-door.test.tsx`, `__tests__/every-confirm-names-its-organization.test.tsx`.
- 2026-10-02 — **G5 picker review (nightly clone), five defects closed at the class.** (1) Same-named records: `features/scopes/service/recordFacts.ts` reads, per loaded page, the registry's organization column + one declared fact per type (task/project status, a note's first words, a chat's message count, a contact's headline/kind, a record's description); when rows span organizations each line names its organization from the person's memberships (never the active org); `composeRecordSecondaryLine` keeps it ≤60 chars. (2) All types: `referenceTypeDisplayLabel` (party → Contact, scope → Record, Title Case everywhere); `referenceTypeGroupKey` folds workbench→workspace and marketing→web; `titleCaseGroupLabel` decodes HTML entities; the count shows only once the hidden-types knob settles (`allTypesToggleLabel`); five more machinery types join the knob (`migrations/reference_picker_hidden_types_people_words.sql`, applied to the clone; production on the release sweep). (3) Write form: no lifecycle stamps (`*_at` date-times) or timezone; a person field uses the people search; Title from `formTitleColumn` (directive-catalog log). (4) A reference inserts as a block at the caret line's end, never inside a word (context-menu-v3 + rich-editor logs). (5) Action-card failures speak plainly with Details — `@ai-matrx/content-ir-react` 0.17.0 (published and adopted); the host's `explainFailure` (`directiveFailureWords.ts`) names the non-writable / planned-noun case and passes a server "Nothing was applied — …" sentence through with its remedy (guard `__tests__/a-failed-card-says-what-to-do.test.tsx`). Guards: `referenceTypeGroups.test.ts`, `reference-picker/__tests__/same-named-records-tell-apart.test.tsx`, `directive-catalog/__tests__/a-person-form-asks-only-what-a-person-sets.test.tsx`, `context-menu-v3/utils/__tests__/a-block-never-splits-a-word.test.ts`, `components/rich-editor/__tests__/block-insert.test.ts`.
- 2026-10-02 — **G3 action-card review (nightly clone), host half.** Packages: `@ai-matrx/content-ir-react` 0.16.0/0.16.1, `@ai-matrx/design-system` 0.51.0, `@ai-matrx/kit` 0.19.0. (1) An update says **old → new**: `directiveRecordRow.ts` `readDirectiveRecord` is the package's new `readRecord` seam (catalog table, the reader's own RLS, one in-flight read per record), and the confirm's `ChangeList` draws the package's ONE `DirectiveChangeList` with the current values and the noun's title column ("Title", never "Label"). (2) A Delete card's Apply is destructive (package). (3) The create confirm names the organization the write lands in — `selectActiveOrganizationName`, the org every directive write is sent with — never "your workspace". (4) The confirm no longer fades out through an empty dialog (design-system `ConfirmDialogHost` draws from kit `useOpenerHost().shown`). (5) Run again: `toApplyState` passes the server's per-item `copies` (aidream `applied_summary`; read by `in`-narrowing until the generated contract in `@ai-matrx/agents` carries it) and the newest copy's records; the card says "2 copies" and links the latest. (6) `DirectiveRecordLink` reads trash state live (`useDirectiveRecordTrashed`, re-read on `invalidateReferenceLabel` via the new `useReferenceRecordVersion`), so a Create card whose record was deleted says "(in trash)". (7) Root cause of "an applied Update flipped back to Apply after a block was inserted": the Apply control's state belonged to its React SLOT, so a host keying blocks by position handed it another block (package fix: state resets and re-reads when its block changes). Not reproduced live in the notes textarea editor; proven by the package guard. Guards: package `__tests__/directive-card-g3.test.tsx`, aidream `test_run_again_copies.py`, design-system `confirm-host-exit.test.tsx`, `__tests__/a-confirm-names-the-title-column.test.tsx`.

- 2026-10-02 — **G2 picker review, five defects closed at the class.** (1) Type groups come from `features/scopes/utils/referenceTypeGroups.ts` (admin chooser bucket → schema display name → Title Cased schema), shared with `ReferenceConfigFields` — the catalogue `family` left ~90 of 116 types under "Other" and printed "documentation"/"seo"; the visible set drops every `is_component` type and the new org knob `platform.reference_picker.hidden_types` (machinery; `useHiddenReferenceTypes`; seeded by `migrations/reference_picker_hidden_types_knob.sql`, applied to the clone — production gets it on the release sweep; until then the picker shows every type and screams). (3) `RecordReferencePicker` reads `useKindItems` (recent first, every record the person can see, paged) with a ≤60-char "Edited …" line; registry `listCandidates` types keep their source. (4) A task link opens the task editor window; project/workbook/transcript open their own peek instead of the generic Detail row dump; resolvers return `null` for a confirmed-absent record → status `missing` → `components/MissingReferenceChip.tsx` ("Not found", no door) on both chips. (5) The file picker opened from the dialog sank under it — fixed in `WindowPanel` (see window-panels). OPEN: system-managed fields + CHECK-constrained pick-lists need the server catalogue (aidream `directive_apply/shapes.py`); the confirmation's "Label" for a note title lives in the action-card lane's `DirectiveConsequence`. Guards: `features/scopes/utils/__tests__/referenceTypeGroups.test.ts`, `reference-picker/__tests__/record-search-is-recent-first.test.tsx`, `__tests__/a-missing-record-says-so-before-the-click.test.tsx`, `item-presentation/__tests__/a-reference-opens-the-record-it-names.test.tsx`.

- 2026-10-02 — **Every reference chip opens the record it names.** Root cause of the reviewer's Note defect (a chip opening the Note-info stats panel, "0 Words, 0 Characters") was a door chosen by a hand-cast item type that nobody checked against what that type opens; the note branch itself was fixed 2026-09-30. Census of all 159 nouns found the class: ≈90 catalog nouns (tool, skill, workflow, crm_deal, hr_*, research_*, …) cast to unregistered item types → enabled chips whose click did nothing; 8 education nouns opened the FILE preview with a non-file id; studio sessions opened a seed-only Detail panel; `organization` and `conversation_value` chips were disabled. New `referenceDoor` derives the door from the record's table (in-place opener that loads the record → peek → route → honest name) and is shared by `ReferenceChip`, `DirectiveRecordLink` and `ReferencePickerChip` (whose name is now a door too). Guard `__tests__/every-reference-chip-opens-its-record.test.ts`: 118 of 159 red on the old door model, 159 green after.

- 2026-10-02 — **A write-action card survives a reload, and the honest card is documented.** Reviewer defects on the in-content create/update/delete card, all five closed: (1) update/delete rows name the record by its live name and an update lists every field → new value (`@ai-matrx/content-ir-react` 0.12.0 `renderRecord` + `itemChanges`; host half `components/DirectiveConsequence.tsx` `DirectiveRecordLink`, which reuses `useResolvedReferenceLabel` and the reference resolver's door); (2) the dialog names the record and a delete is `variant: "destructive"` and says it goes to the trash (`directiveConsequenceDialog`, through the package's `ask` seam); (3) Apply stays idle while the dialog asks, then shows a spinner, the item count and an elapsed clock; (4) the tally is the server's receipt sentence plus each written record as a door (`appliedRecords`); (5) NEW: `directiveHost.applyState` reads `POST /directives/apply_state` on mount — batched per tick into one request, no `conversation_id` (the person's namespace, the same one `confirm` applies a note's block in — aidream `keys.human_door_namespace`), never raising the organization picker (`fetchDirectiveApplyState(..., { interactive: false })`, also applied to the DD-144 hydration) — so an applied block mounts as its tally instead of Apply (package 0.14.0). Also (package 0.15.0): a card in a chat message applies under ITS conversation — `block-dispatch` passes `conversationId` → `MatrxEnvelopeBlock` → `DirectiveRender conversationId`, and the host forwards it as `conversation_id` to confirm and groups ledger reads per conversation — so the in-message card and the agent proposal's Approve share one key and can never apply twice; a clean tally offers **Run again** (dialog says "This already ran once.", then `force: true`) and a failed one **Retry**; dialog copy trimmed to the 140-character budget; and `invalidateReferenceLabel(id)` (`referenceResolvers.ts`) re-resolves every live label naming a record an apply changed, so the card's own row never keeps the name it just overwrote; every label naming one record now shares ONE read (in-flight dedupe + 30 s memory, `readLabelOnce`), so a dialog's title and sentence never disagree (guard `__tests__/a-record-name-is-read-once-and-refreshed.test.tsx`, red → green). Guards: `__tests__/side-effect-needs-consent.test.tsx` (dialog words, variant, records), `__tests__/directive-card-survives-reload.test.ts` (4 red → green), package `__tests__/directive-honesty.test.tsx`, aidream `test_apply_state_human_door_namespace.py`.

- 2026-09-30 — **Every action the server supports is real in the reference picker.** Create/Update were greyed out ("not available from this picker yet"); they now open a form generated from the server's item schema (`features/directive-catalog/components/SchemaFieldsForm.tsx`). Create skips the search; Update searches the record, then sends only the fields set; Delete is unchanged. Each inserts a button that asks before it runs. `wireItems` (`referencePickerTypes.ts`) strips the display `label` from identity items only — a note's title column IS `label`, so payloads stay verbatim. Also fixed: the action list spun on "Loading actions…" forever (its effect listed its own loading state as a dependency and cancelled its own request), so no action beyond Link was ever reachable; it now reads the one `useDirectiveNoun` hook.

- 2026-09-13 — **A proposal survives a reload (DD-144, chair ruling: the read door).** The approve card existed only for as long as the stream event that made it; a refresh erased an action the agent had proposed, with nothing on screen to say so. The shell was never lost — it IS the assistant message's stored text (`chat.message.content` parts; a bare `{"__kind":…,"items":[…]}` object, usually followed by prose). New `conversationProposals.ts` reads those messages back (client-direct, RLS, like the ledger read), extracts shells through the ONE decoder, and asks the SERVER which are still approvable via `POST /directives/apply_state` (`fetchDirectiveApplyState`). It must be the server: the apply key is FROZEN and hashes the VALIDATED item model, so a client that computed it would be a second author of it — and a client that guessed would render an Approve button beside that proposal's own receipt. `not_applied` → the card, in `proposed_sentence`'s words and with the same proposal id the live event mints; `applied` → nothing (the ledger receipt is already on screen); `in_flight` → nothing, because it is neither. A shell the server cannot read is stated with its reason, never dropped. Guard `__tests__/dd144-proposal-survives-reload.test.tsx`, proven failing-then-passing (RED: a fresh mount renders empty); server half live-proven by `aidream/tests_trials/dd144_proposal_survives_reload.py`.

- 2026-09-13 — **The concurrent loser ends up with the receipt, not "it's happening" (DD-145).** When two confirms race, the server's loser waits for the holder and replays its receipt; that wait was 20 s against a 17 s handler (V-24) and lost by 0.23 s, after which the loser answered "that is already being applied right now" — true, but not what happened. The wait is now derived from the door itself (aidream `CLAIM_WAIT_SECONDS` = 45 s, under the public ALB's 60 s idle timeout), so any holder that can answer its own caller at all is waited for. The client half is the residue: an `already_applied` receipt that names NO resource ids is not a replay of a finished apply (a real one carries the holder's ids), so the card enters a stated **Finishing** state with the server's sentence and remedy, `useConversationReceipts` re-reads the ledger every 2 s for up to 60 s, and the waiting card stands down the instant the receipt lands — the apply is on screen exactly once, never twice. Guard `__tests__/dd145-loser-gets-the-receipt.test.tsx`, proven failing-then-passing; the server half is proven RED→GREEN against the live DB by `aidream/tests_trials/dd145_loser_waits_for_the_receipt.py`.

- 2026-09-12 — **A side effect found in content names its consequence before it runs.** `directiveHost.confirm` — the single seam every in-content directive executes through — now gates `create`/`update`/`delete`/`action` behind `ConfirmDialogHost.confirm` with a verb-and-noun sentence ("Delete this note? … runs now, as you, and removes it from where it lives — not just from this text"), so a `directive_v1_delete_*` block pasted into a note can no longer delete server-side on one unexplained click. Declining throws (the package treats any return as "Applied", so a returned result would read "Applied 0"). `ProposedDirectivesZone` bypasses this seam and already carries the server's sentence — agent proposals are not double-confirmed. Guard `__tests__/side-effect-needs-consent.test.ts`, proven failing-then-passing; live-verified on `/notes` — no `/directives/confirm` request fires until the dialog is accepted.

- 2026-09-12 — **The reference picker's curated tier is an org knob.** The eleven types offered first were hardcoded in `referencePickerTypes.ts`; they now come from `platform.reference_picker.common_types` (JSON list, seeded + applied live, org-overridable) via `useCommonReferenceTypes` (law 6). The knob only orders the shortcut — "All types" still lists every reference-pickable entity, so no value can hide a type; a missing/malformed row costs the user nothing (full list, expanded, and a console scream). New knob reader `knobStringList` (raises on a non-string member). Live-verified: the picker showed exactly the eleven, and the flow inserts the minified `matrx` fence + renders the chip.

- 2026-09-11 — **User-grade reference picker.** `components/reference-picker/` (ReferencePickerBody + referencePickerTypes) is the "Add a reference" flow behind the v3 menu's Insert/Copy reference action — composes `ReferenceTypeAdder`/`RecordReferencePicker`, the entity registry, and the directive catalog (other actions loaded lazily, Link default). `referenceFence.ts` gained `buildDirectiveFence(class, noun, items)` — the same ONE minting seam, class-generic; `buildReferenceFence` now delegates to it.

- 2026-09-08 — Two defects found on the SHIPPED card at demos.aimatrx.com and fixed: a full
  UUID rendered as a fact chip (`model_id` is 36 chars, the scalar cutoff was 40 — an id is
  now never a chip, guarded by two regression tests), and the item name lost the space fight
  to its own fact chips ("Masterwork Conductor" at 37px against a 141px need). Open: the
  `action` class double-verbs its title — "Run Create agent definition" — in `nounDisplay.ts`.
  Work order: `common-docs/systems/architecture/content-ir/FEATURE.md`.
- 2026-09-01 — **Reference copy has a non-dead-end clipboard fallback.** All record,
  file, compound, menu, and bulk reference-copy controls now route through the canonical
  clipboard primitive. When browser clipboard access is blocked, the global manual-copy
  dialog presents and selects the exact fence instead of emitting a terminal failure toast;
  copied state and success feedback remain reserved for confirmed clipboard writes.

- 2026-08-26 — **THE DIRECTIVE⇄KIND SEAM + the side-effect card.** `itemKind.ts` /
  `itemSummary.ts`, `SideEffectDirectiveCard` registered for all four side-effect classes,
  and `DirectiveItemWindow` (Pretty = the item's own kind component, Raw = JSON, plus
  CopyButtons). Replaces "a name and a blind Apply button" for all 56 registered shapes.
  Tests: `__tests__/side-effect-directive-card.test.tsx` (15, against the real 22KB
  Masterwork Conductor item). Demo rows 6–8 on `/demos/kind-directives`.

- 2026-09-08 — **C9 full elimination: the directive tier is the PACKAGES.** Root cause:
  the grammar, decoder, legacy shim, naming, item summary, kind seam, renderer registry,
  side-effect card, fallback floor and Apply control all lived app-local, so every other AI
  Matrx client had to grow its own copy and drift. Deleted here:
  `features/content-ir/directives/{grammar,decode,legacyShell,itemKind,itemSummary,nounDisplay}.ts`,
  `EnvelopeFallbackCard.tsx`, `ApplyDirectiveButton.tsx`,
  `directives/sideEffect/{SideEffectDirectiveCard.tsx,classIcon.ts}`, and the registry core
  in `registry.tsx`. Consumed instead from `@ai-matrx/content-ir` 0.11.0 +
  `@ai-matrx/content-ir-react` 0.11.0. `registry.tsx` keeps ONLY this app's renderers
  (reference chips, context-groom receipt, plan tree / plan-node-patch /
  create-project-with-tasks) and registers them through the package;
  `MatrxEnvelopeBlock.tsx` is a thin `DirectiveHostProvider` + `DirectiveRender` wrapper;
  the new `directiveHost.tsx` is the whole seam surface. `check:legacy-shim-containment`
  was re-aimed at "no local copy, no importer". Tests became HOST tests:
  `__tests__/side-effect-directive-card.test.tsx` renders `MatrxEnvelopeBlock` with a real
  store and proves Apply is present, the item row dispatches the real overlay kind-stamped,
  and an unknown noun is still named from the catalog.

- 2026-08-30 — **Reference copy fences emit minified JSON.** The shared
  `buildReferenceFence` serializer now writes the two-key directive shell on one line, so
  every bookmark/reference button copies the compact canonical envelope. The Content IR
  suite pins the exact `directive_v1_reference_agent` clipboard artifact and its parse round-trip.
- 2026-08-26 — **A-10.2 closed: `url` is a REGISTERED server shape + a parity guard.** The
  messaging attach flow mints `directive_v1_reference_url` live, and the server registry had
  no such shape — aidream now registers `UrlRef {url, label?}` + `resolve_url` (renders the
  link, never fetches it). `features/content-ir/__tests__/reference-noun-parity.test.ts`
  (runs in CI's `test:content-ir`) pins every `REFERENCE_TYPES` noun against the committed
  `docs/protocol/kind_directive_registry.generated.json` mirror, so an FE noun the server
  cannot resolve can no longer ship.
- 2026-08-25 — Claude (KD3/KD4/KD5b): **the Kind Directives merge, frontend half.**
  aidream had minted the two-key `__kind` shell in production since 2026-08-23 while this
  repo still detected `matrx_version`, so a server-minted reference fence rendered to the
  user as RAW JSON. Detection now reads `__kind`; the grammar/decoder/legacy shim moved to
  `features/content-ir/directives/` and are parity-checked against aidream; the renderer
  registry is slug-keyed with a CLASS PREFIX TIER; the fallback card became the prefix
  floor and names shapes from the catalog (`label`/`family`); every copy-shortcut builder
  emits the new shell; the receipt wire moved to `directive` + `shell`. A second half of
  the break — a ```matrx fence being exploded by `recoverEmbeddedKindJsonBlocks` because
  its body now declares `__kind` — was found IN THE BROWSER, not by a test, and is now
  pinned by one. Guards: `check:legacy-shim-containment` (per-PR CI),
  `check:directive-grammar`, and an offline grammar-parity test.

- 2026-08-23 — Directive execute/confirm consumers now translate Matrx envelopes to
  the unified API request contract (`directive` slug + items) instead of sending the
  retired multi-field directive shell.

- 2026-07-26 — Claude: **The FE derives nouns from the server catalog — zero edits for a
  new action.** `catalog-nouns.generated.ts` (from the mirrored
  `kind_directives_catalog.generated.json`, via `pnpm gen:directive-nouns`, auto-run by
  `check-protocol-sync --fix`) feeds a catalog-derived generic reference resolver:
  `getReferenceResolver` = bespoke `RESOLVERS` overlay → derived
  (schema.table + title_column + identity_fields) → graceful chip. Aliases are the
  server-published map (hand legacy map deleted). `kind:"function"` (Plane 2) added to
  `MatrxKind`; plan_tree/plan_node_patch/context_groom renderers dual-registered under
  it; `ApplyDirectiveButton` confirms both executing kinds — so an UNKNOWN
  directive/function type still renders (`EnvelopeFallbackCard`) with a working Apply.
  Orphaned `output-schema/applyDirectives.ts` deleted (zero importers).
- 2026-07-26 — Claude: **`plan_tree` text `site` resolves on the client.**
  Card polls/deep-links via domain→`web.site` lookup (`resolvePlanTreeSiteId`);
  Content Plan href uses `marketingRoutes.contentPlan()` + `?site=`.
- 2026-07-26 — Claude: **Apply/confirm failures speak gently.** `ApplyDirectiveButton`
  and `ProposedDirectivesZone` show the server's `user_message` (via
  `BackendApiError`), never a Pydantic dump. Clean red error text — not a
  traceback wall.
- 2026-07-25 — Claude: **References work in prose, and are attached without copy-pasting JSON.**
  A ```matrx fence pasted into a direct message rendered as raw code — the messaging surface
  printed `content` as plain text and never ran fence detection. New shared primitives:
  `referenceText.ts` (split / summarize / build-from-attachments),
  `components/TextWithReferences.tsx`, `components/AttachReferenceButton.tsx`, plus
  `ReferenceTypeAdder` / `ReferencePickerChip` extracted out of `ReferenceValuePicker` (one
  implementation, not a second). Chips now show `referenceChipLabel(display)` (first line)
  instead of a note's whole body. Consumers: `MessageBubble` (chips), `MessageInput`
  (paperclip → chips → fences on send), `ConversationList` + desktop notifications
  (`summarizeMatrxText`). Also fixed along the way: `NoteInfoPanel` self-hydrates via
  `fetchNoteContent` (opening a note from a DM chip showed "Note not loaded"), and
  `MessagingService.subscribeToPresence` crashed the whole `/messages/[id]` route
  ("cannot add `presence` callbacks after `subscribe()`") — presence now uses the same
  callback registry as typing and never removes the shared channel.

- 2026-07-25 — Claude: **Protocol mirror drift check.** `MATRX_REFERENCES.md` re-synced
  from aidream (FE copy was a 6KB ancestor of aidream's 18KB current doc). New
  `scripts/check-protocol-sync.ts` (`pnpm check:protocol-sync` / `:strict` / `:fix`)
  byte-compares the three mirrored files against the co-located aidream checkout
  (`AIDREAM_DIR` override); wired into `run-release-gates.sh` and `release.sh`
  (auto-sync + commit on drift, before the version bump). MATRX_DIRECTIVES decided
  pointer-only, not mirrored.
- 2026-07-25 — Claude: **Content Planning directives** —
  `directives/planTree/` renders `output_directive:plan_tree` /
  `plan_node_patch` receipts (tolerant parse, 0/2/5s read-only resolve
  against the content-plan service, live routes + `/content-plan` deep
  link); both registered in `registry.tsx`. Protocol manifest +
  MATRX_ENVELOPE.md re-synced from aidream (FE copy had drifted to 11/87
  shapes). This is now the THIRD copy of the 0/2/5s poll-until-resolved
  pattern (`resolveCreatedProject`, `resolvePlanTree`) — extract a shared
  scheduler before adding a fourth. E2E verified against production
  aidream (plan.node rows applied from an agent run). Provider gotcha:
  Anthropic structured outputs reject RECURSIVE $defs — directive item
  schemas must be depth-flattened (see applyDirectives.ts `plan_tree`).

- 2026-07-12 — **Conversation Value Store + groom fences (backend Pattern 2).**
  `registry.tsx` gained `output_directive:context_groom` — the inline groom fence an
  agent emits in its prose renders as a quiet "Context compacted · N results stubbed"
  line (a receipt; position rule: never executed in content). The existing
  `conversation_value` resolver in `referenceResolvers.ts` now live-fetches
  `key — description` from `chat.conversation_value` (descriptor fences always carry
  `conversation_id`; without it the key is the display). Consumed by the new
  `value_store_stored` "result ready" card (`components/mardown-display/blocks/
  data-events/ValueStoreStoredBlock.tsx`), which renders the descriptor's fence via
  `MatrxEnvelopeBlock`. Stream wiring: `/Users/armanisadeghi/code/common-docs/systems/architecture/execution-runtime/CLIENT-RUNTIME.md`
  change log 2026-07-12.
- 2026-07-11 — **`url` added to the reference taxonomy (8-type).** New `UrlRefItem { url, label? }`
  in `envelope.ts`; `urlReference.ts` (`buildUrlReferenceFence`/`buildMultiUrlReferenceFence`);
  `registry.tsx` `ReferenceChip` opens `url` directly via `window.open` (never routes through
  `resolveValue`/`openItemType` — nothing to look up); `referenceResolvers.ts` gained a `url`
  entry that returns the URL/label as-is. First consumer: `features/scopes/FEATURE.md`
  §"Context reference cells" — a `reference` context item's `allowed_reference_types` can now
  include `url` for plain external links alongside `file`/`scope`/etc.
- 2026-06-24 — **`create_project_with_tasks` envelope renderer.** New
  `directives/createProjectWithTasks/` (optimistic card, 3-poll DB resolve, click-to-open).
  Registered in `registry.tsx`. Bare structured-output JSON with `matrx_version` now
  classifies as block type `matrx` in `detectJsonBlockType`.
- 2026-06-24 — **Proposed directives (`ask` apply policy).** Added `DirectiveProposed` +
  `DirectiveApplyBlocked` to `envelope.ts` (+ `isDirectiveProposed`); `state/proposedDirectivesSlice.ts`
  (the per-conversation inbox); `components/ProposedDirectivesZone.tsx` (Approve/Decline card,
  mounted beside the chat input). `process-stream.ts` routes `directive_apply.proposed` →
  `proposeDirective`. Approve applies via `confirmDirective` → `POST /directives/confirm`. Pairs
  with the backend apply-policy cascade (aidream `services/output_directives/`).
- 2026-07-08 — **Legacy `picklist_ref` annihilated.** All stored legacy envelopes backfilled to
  canonical fences (4 scope-cell rows in `context.context_item_values`; agent definitions/versions
  already clean). Deleted `legacyTranslate.ts`, `PicklistRefEnvelope`/`isPicklistRef`
  (agent-definition.types.ts), `ReferencePurpose`, and every dual-read branch
  (`readPicklistSelection`, `variableValueToDisplay`). aidream's envelope-registry allowlist
  entries retired in the same change; the server's scope-binding legacy decoder remains as a
  LOUD recovery layer only. Note: 7 stale pre-migration conversations still carry envelopes in
  `chat.conversation.variables` — the server's client-envelope continue-turn pipeline handles
  them; converting them would break their frozen turn-1 placeholder tokens.
- 2026-06-20 — **Unified Matrx References (full alignment).** Purified `ReferenceItem` to the
  FLAT per-type model + `REFERENCE_TYPES` 7-type taxonomy (dropped `purpose`/`slot`/`ref`/`display`;
  `ReferencePurpose` `@deprecated`). New `legacyTranslate.ts` (loud hard-cut) + `bookmarkToReference.ts`.
  `referenceFence.ts` emits flat items + routes legacy reads through the translator;
  `referenceResolvers.ts` reads flat ids and registers all 7 types (+ `dataset_cell` alias);
  `registry.tsx` chips/icons read flat ids. Bookmark types deduped onto the generated wire types
  (`message-types`, `user-lists`, `prompts/data-sources`, `tableReferences`); `input_table`/`input_list`
  now render as live reference chips in the context-item drawer (`BookmarkReferenceBody`). `item_label`
  → `label`. D10 closed.
- 2026-06-19 — **Authoring migration (deliverable b, picklist-only).** Added `referenceFence.ts`
  (`buildReferenceFence` / `buildPicklistItemFence` / `parseReferenceFence` + the dual-read
  `readPicklistSelection`). Switched `PicklistVariableInput` to emit the ` ```matrx ` fence;
  `variableValueToDisplay`, `componentToValueType` (picklist → `string`/`value_text`), and the
  picklist type docs updated; `PicklistRefEnvelope` / `isPicklistRef` marked `@deprecated`
  read-only back-compat. Bound scope-cell path gated on aidream (D10).
- 2026-06-19 — `reference` blocks come to life: each chip now fetches its LIVE value from
  Supabase (`picklist_item` → picklist item description/label; `dataset_cell` → dataset-row
  cell) and is clickable to open the underlying picklist/table in a window panel (reusing the
  item-presentation opener), with graceful fallback to `display.label`. New
  `referenceResolvers.ts` resolver registry. Hardened after adversarial review: chips keyed by
  content (not index), non-string `ref` values coerced loudly (`coerceRefToStrings`), the
  "never throws" contract defended at the call site, label-less fallback humanized.
- 2026-06-19 — Created. Outer-first recognition + renderer registry + graceful fallback;
  fence rendering, directive receipts, schema-proposal apply.
