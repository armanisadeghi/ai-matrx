# Matrx Envelope — frontend

The client mirror of the [Matrx Envelope](../../docs/protocol/MATRX_ENVELOPE.md) standard:
`{ matrx_version, kind, type, items: [...] }`. Recognize the outer canonical shell once,
route internal parts through a registry, render them, fall back gracefully.

**Protocol mirror pact:** `docs/protocol/MATRX_ENVELOPE.md` + `MATRX_REFERENCES.md` +
`matrx_envelope_registry.generated.json` are **byte-identical** with aidream's copies;
aidream is canonical (registry emitted by its `scripts/generate_envelope_registry.py` —
never edit the JSON by hand, and doc edits land in aidream FIRST). Guarded by
`pnpm check:protocol-sync` (in `check:release-gates`; `release.sh` auto-syncs + commits
on drift). `MATRX_ACTIONS.md` + `matrx_action_catalog.generated.json` are deliberately
NOT mirrored — pointer-only (`features/agents/types/matrx-actions.types.ts` names the
aidream doc as canonical); mirror them only if the FE gains a catalog consumer.

## The canonical reference item — FLAT identity (the load-bearing invariant)

A reference item is **pure flat identity ids + optional, non-authoritative display
hints. NOTHING else.** There is no `purpose` / `slot` / `ref` / `display` nesting —
intent is decided by the item's **position** (in-content fence = resolve in place;
variable binding = the variable-map key IS the slot), never a field on the item.
(Mirrors [`docs/protocol/MATRX_REFERENCES.md`](../../docs/protocol/MATRX_REFERENCES.md).)

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

- `envelope.ts` — the contract: `isMatrxEnvelope` (detect by `matrx_version`),
  `MatrxEnvelope`, the FLAT per-type `ReferenceItem` union + `REFERENCE_TYPES` / `ReferenceType`,
  the `directive_apply.*` receipt events (incl. `DirectiveProposed` / `DirectiveApplyBlocked`) +
  `isDirectiveApplyEvent` / `isDirectiveProposed`, and `buildEnvelopeOutputSchema` (mirrors
  aidream's schema-gen).
- `state/proposedDirectivesSlice.ts` — the per-conversation inbox of agent-proposed actions
  (`ask` policy); `proposeDirective` / `removeProposal` + `selectProposedDirectives`.
- `components/ProposedDirectivesZone.tsx` — the Approve/Decline card per pending proposal;
  Approve → `confirmDirective` (`features/action-catalog/service.ts`) → `POST /actions/confirm`.
- `registry.tsx` — the **renderer registry** (mirrors the backend shape registry):
  `registerEnvelopeRenderer(kind, renderer, type?)` + `getEnvelopeRenderer(kind, type)`
  (type-specific → kind-default → null). Built-in: `reference` → **live, clickable chips**
  (`ReferenceChip`, one per item); `output_directive:create_project_with_tasks` → optimistic
  project card + task list with DB polling (see `directives/createProjectWithTasks/`). Add
  a renderer = one register call.
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
- `MatrxEnvelopeBlock.tsx` — the ```matrx fence renderer: (1) parse + recognize the
  outer envelope (bad JSON → raw `<pre>`, never throws); (2) `getEnvelopeRenderer` →
  render the registered component; (3) none registered → a neutral muted card (kind/type
  + item count). **Graceful fallback at both layers** (unparseable, and unknown shape).

- `referenceText.ts` — **prose ↔ fence** for surfaces that carry raw text and do NOT run
  the markdown pipeline (direct messages, notifications, list previews):
  `splitMatrxFences(text)` (ordered text/envelope segments, unparseable fences stay literal
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

## Recognition contract (the four guarantees)

1. **Outer first** — `isMatrxEnvelope` recognizes `{matrx_version,kind,type,items}` before
   anything else (`MatrxEnvelopeBlock` step 1).
2. **Registry for internals** — internal parts route through `getEnvelopeRenderer(kind,type)`
   (`registry.tsx`), the same key shape the backend registry uses.
3. **Bring to life** — a registered renderer displays the part (reference → chips; add
   richer/interactive renderers, e.g. click-to-open, by registering them).
4. **Graceful fallback** — no renderer → neutral card; not an envelope → raw `<pre>`.

## Consumers / wiring

- `content-splitter-v2.ts` (`SPECIAL_CODE_LANGUAGES` += `matrx`) → block type `matrx`
  → `BlockRenderer` `case "matrx"` → `MatrxEnvelopeBlock`. Round-trip in
  `assemble-cx-content-blocks.ts`.
- Directive receipts: `process-stream.ts` routes `directive_apply.*` data events →
  `sonner` toasts (`isDirectiveApplyEvent`). The `directive_apply.completed`/`.failed`
  receipts toast; `directive_apply.proposed` (the `ask` apply policy) is handled below.
- **Proposed directives (`ask` policy):** when the backend resolves a directive's apply
  policy to `ask`, it streams `directive_apply.proposed` (carrying the round-tripped
  envelope + `proposal_id`). `process-stream.ts` enqueues it into `state/proposedDirectivesSlice.ts`;
  `components/ProposedDirectivesZone.tsx` (mounted beside the chat input in
  `AgentConversationColumn`) renders an Approve/Decline card. Approve POSTs the envelope to
  `POST /actions/confirm` via `features/action-catalog/service.ts::confirmDirective` (runs as
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
- Done: **`output_directive:create_project_with_tasks` renderer.** Optimistic project +
  task card from envelope items; polls Supabase at 0s / 2s / 5s by slug (or name); resolves
  to clickable project (`ItemDetailWindow` + route) and tasks (`taskEditorWindow`). Bare
  JSON envelopes (`matrx_version` root) classify as `matrx` blocks via `detectJsonBlockType`.
- Done: **generic reference attach + prose rendering** (2026-07-25) — `AttachReferenceButton`
  (the reference-insert authoring picker) + `TextWithReferences` / `referenceText.ts`; first
  consumer is direct messaging (`features/messaging`).
- Next: renderers for `secret` / other `output_directive` types if needed; a table/cell
  authoring picker emitting the flat fence; adopt `AttachReferenceButton` in the remaining
  composers (notes, tasks, comments).

## Change Log

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
  (auto-sync + commit on drift, before the version bump). MATRX_ACTIONS decided
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
  `MatrxEnvelopeBlock`. Stream wiring: `features/agents/docs/STREAMING_SYSTEM.md`
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
  `proposeDirective`. Approve applies via `confirmDirective` → `POST /actions/confirm`. Pairs
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
