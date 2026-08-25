# Kind Directives — frontend (`features/matrx-envelope/`)

> 🚨 **THE SHELL AND THE GRAMMAR LIVE IN `features/content-ir/directives/`.** A directive
> IS a kind instance — `{ "__kind": "directive_v1_<class>_<noun>", "items": [...] }` — and
> its grammar, detector, decoder and read-only legacy shim are there, mirrored from
> aidream's `matrx_graph/content_ir/directives.py`. What lives in THIS directory is what is
> genuinely reference-specific: the reference noun taxonomy, the chips, the copy-shortcut
> builders, the renderer registry, and the apply/confirm affordances.
>
> Plan of record: `/Users/armanisadeghi/code/common-docs/projects/kind-directives/PLAN.md`
> (read § THE STRICTNESS LAW before changing anything here). Cross-repo SoR:
> `/Users/armanisadeghi/code/common-docs/systems/matrx-envelope/FEATURE.md`.

**Detection is `__kind`, never `matrx_version`.** The retired 4-key shell
(`{matrx_version, kind, type, items}`) is READ-ONLY: it is understood in exactly one
module (`features/content-ir/directives/legacyShell.ts`, single importer `decode.ts`,
enforced by `pnpm check:legacy-shim-containment`), it is emitted nowhere, and every
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

- `features/content-ir/directives/` (NOT here) — `grammar.ts` (the reserved prefix, the
  CLOSED 8-class vocabulary, derived capability, `buildDirectiveSlug` / `parseDirectiveSlug`,
  the position law as `executesAtOutputRoot` / `resolvesInContent`), `legacyShell.ts`,
  `decode.ts` (`decodeDirective` / `tryDecodeDirective`), `nounDisplay.ts` (the auto-view's
  catalog-derived naming). Parity with aidream is machine-checked: `pnpm sync:directive-grammar`
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
- `state/proposedDirectivesSlice.ts` — the per-conversation inbox of agent-proposed actions
  (`ask` policy); `proposeDirective` / `removeProposal` + `selectProposedDirectives`.
- `components/ProposedDirectivesZone.tsx` — the Approve/Decline card per pending proposal;
  Approve → `confirmDirective` (`features/directive-catalog/service.ts`) → `POST /directives/confirm`.
- `registry.tsx` — the **renderer registry and THE PREFIX TIER**:
  `registerDirectiveRenderer(class, renderer, noun?)` + `getDirectiveRenderer(directive)`
  (exact slug → the CLASS prefix rule → null). **The prefix rule is the routing language
  made real:** registering `reference` once renders every `directive_v1_reference_*` slug
  the 419-noun catalog can mint, so a brand-new server noun renders with ZERO frontend
  edits; an exact slug overrides it. Built-in: `reference` → **live, clickable chips**
  (`ReferenceChip`, one per item); `action:create_project_with_tasks` → optimistic project
  card + task list with DB polling; `action:plan_tree` / `action:plan_node_patch` /
  `action:context_groom`. A noun is passed as a NOUN, never a hand-typed slug — the slug is
  BUILT by the grammar, so an unparseable registration is unconstructable.
- `referenceFence.ts` — the **reference-fence serializer + reader**:
  `buildReferenceFence({type,items})` / `buildPicklistItemFence(...)` emit the canonical
  ` ```matrx ` `kind:"reference"` fence with FLAT items (`{ list_id, item_id, label? }` — no
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
  `KnownItemType` reused for click-to-open, `openId` is the underlying entity (picklist / table,
  NOT the cell). All 7 record types registered (+ `dataset_cell` alias): `picklist`/`picklist_group`/
  `picklist_item` over `udt_picklists`/`udt_picklist_items`; `table`/`table_column`/`table_row`/
  `table_cell` over `udt_datasets`/`udt_dataset_fields`/`udt_dataset_rows`. `url` is registered too
  but returns the URL/label as-is (`resolveValue` is a no-op — nothing to look up). Adding a reference
  type = one entry here.
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

## A REGISTERED RENDERER MUST NEVER RETURN `null`

`MatrxEnvelopeBlock` step 2 renders a found renderer's output **verbatim** — so a
renderer that bails with `null` deletes the assistant's whole message block, on
first paint and every reload, with no error anywhere. The step-3 neutral card
cannot save it: a renderer *was* found. **Degrade to
`<EnvelopeFallbackCard directive reason="…" />`** (`EnvelopeFallbackCard.tsx`),
never to nothing. That card is also **THE PREFIX FLOOR**: a slug whose class nothing
claims lands there, named from the catalog ("Create Agent · Agents"), with an Apply button
when the class is a side effect. A shape this frontend has never heard of is still legible
and still actionable.

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
  envelope + `proposal_id`). `process-stream.ts` enqueues it into `state/proposedDirectivesSlice.ts`;
  `components/ProposedDirectivesZone.tsx` (mounted beside the chat input in
  `AgentConversationColumn`) renders an Approve/Decline card. Approve POSTs the envelope to
  `POST /directives/confirm` via `features/directive-catalog/service.ts::confirmDirective` (runs as
  the user, RLS; idempotent by `proposal_id`); Decline dismisses. NOT the `pendingAsks`
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
  `MatrxEnvelopeBlock`. Stream wiring: `/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/CLIENT-RUNTIME.md`
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
