# Matrx Envelope — frontend

The client mirror of the [Matrx Envelope](../../docs/protocol/MATRX_ENVELOPE.md) standard:
`{ matrx_version, kind, type, items: [...] }`. Recognize the outer canonical shell once,
route internal parts through a registry, render them, fall back gracefully.

## The canonical reference item — FLAT identity (the load-bearing invariant)

A reference item is **pure flat identity ids + optional, non-authoritative display
hints. NOTHING else.** There is no `purpose` / `slot` / `ref` / `display` nesting —
intent is decided by the item's **position** (in-content fence = resolve in place;
variable binding = the variable-map key IS the slot), never a field on the item.
(Mirrors [`docs/protocol/MATRX_REFERENCES.md`](../../docs/protocol/MATRX_REFERENCES.md).)

**7-type taxonomy** (`REFERENCE_TYPES`): `picklist`, `picklist_group`, `picklist_item`,
`table`, `table_column`, `table_row`, `table_cell` (+ `dataset_cell` as a registered
legacy alias of `table_cell`). Example items: `picklist_item` = `{ list_id, item_id, label? }`;
`table_cell` = `{ table_id, row_id, column_name, table_name?, column_display_name? }`.

**Bookmarks ARE reference items.** The UI's `input_table` / `input_list` bookmarks
carry the same identity ids under a bookmark-spelled `type`; `bookmarkToReference.ts`
maps them onto the taxonomy (mirror of backend `BOOKMARK_TYPE_TO_REFERENCE`) so they
render through the SAME live chip renderer.

## Parts

- `envelope.ts` — the contract: `isMatrxEnvelope` (detect by `matrx_version`),
  `MatrxEnvelope`, the FLAT per-type `ReferenceItem` union + `REFERENCE_TYPES` / `ReferenceType`,
  the `directive_apply.*` receipt events (incl. `DirectiveProposed` / `DirectiveApplyBlocked`) +
  `isDirectiveApplyEvent` / `isDirectiveProposed`, and `buildEnvelopeOutputSchema` (mirrors
  aidream's schema-gen). `ReferencePurpose` is `@deprecated` (kept only to type the
  legacy-translation input).
- `state/proposedDirectivesSlice.ts` — the per-conversation inbox of agent-proposed actions
  (`ask` policy); `proposeDirective` / `removeProposal` + `selectProposedDirectives`.
- `components/ProposedDirectivesZone.tsx` — the Approve/Decline card per pending proposal;
  Approve → `confirmDirective` (`features/action-catalog/service.ts`) → `POST /actions/confirm`.
- `legacyTranslate.ts` — the **loud HARD-CUT seam**. `translateLegacyReferenceItem(raw,type)`
  flattens an old nested item (`{purpose,ref:{…},display:{…}}`) and
  `translateLegacyPicklistRef(env)` flattens the legacy `picklist_ref` object; both fire a
  one-per-value `console.error` so admins notice stale data and migrate it. Every legacy
  read routes through here — no silent dual-read anywhere else.
- `registry.tsx` — the **renderer registry** (mirrors the backend shape registry):
  `registerEnvelopeRenderer(kind, renderer, type?)` + `getEnvelopeRenderer(kind, type)`
  (type-specific → kind-default → null). Built-in: `reference` → **live, clickable chips**
  (`ReferenceChip`, one per item) reading FLAT ids + display hints; per-type `chipIcon`. Add
  a renderer = one register call.
- `referenceFence.ts` — the **reference-fence serializer + reader**:
  `buildReferenceFence({type,items})` / `buildPicklistItemFence(...)` emit the canonical
  ` ```matrx ` `kind:"reference"` fence with FLAT items (`{ list_id, item_id, label? }` — no
  `purpose`/`slot`/`ref`/`display`); `parseReferenceFence(value)` reads it back (tolerant of a
  missing ``` wrapper). `readPicklistSelection(value)` → `{ refs, otherText, labels }` reads the
  new fence AND routes any legacy shape through `legacyTranslate` (loud). Pure module (no React).
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
  NOT the cell). All 7 types registered (+ `dataset_cell` alias): `picklist`/`picklist_group`/
  `picklist_item` over `udt_picklists`/`udt_picklist_items`; `table`/`table_column`/`table_row`/
  `table_cell` over `udt_datasets`/`udt_dataset_fields`/`udt_dataset_rows`. Adding a reference
  type = one entry here.
- `MatrxEnvelopeBlock.tsx` — the ```matrx fence renderer: (1) parse + recognize the
  outer envelope (bad JSON → raw `<pre>`, never throws); (2) `getEnvelopeRenderer` →
  render the registered component; (3) none registered → a neutral muted card (kind/type
  + item count). **Graceful fallback at both layers** (unparseable, and unknown shape).

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
  live chips in the context drawer. HARD CUT: new writes emit FLAT items; legacy shapes are
  loud-translated (`legacyTranslate`, `console.error` per value).
- Done: envelope module, renderer registry + reference resolver registry — `reference` chips
  **come to life** (live Supabase fetch + click-to-open the entity, graceful fallback to the
  item's display hint) — outer-first recognition + graceful fallback, fence wiring, directive
  receipts, schema-proposal apply flow.
- Done: **authoring (picklist).** Picklist-bound variables emit the ` ```matrx ` `picklist_item`
  reference fence (FLAT items) instead of the legacy `picklist_ref` envelope. The value is a fence
  STRING (single = one item; multi = N items + any "Other" free-text lines) → persists to
  `value_text`. The FE-controlled direct/override `variables` path is live.
- Next: renderers for `secret` / `output_directive`-receipt-in-content if needed; the
  reference-insert authoring picker; a table/cell authoring picker emitting the flat fence.

## Change Log

- 2026-06-24 — **Proposed directives (`ask` apply policy).** Added `DirectiveProposed` +
  `DirectiveApplyBlocked` to `envelope.ts` (+ `isDirectiveProposed`); `state/proposedDirectivesSlice.ts`
  (the per-conversation inbox); `components/ProposedDirectivesZone.tsx` (Approve/Decline card,
  mounted beside the chat input). `process-stream.ts` routes `directive_apply.proposed` →
  `proposeDirective`. Approve applies via `confirmDirective` → `POST /actions/confirm`. Pairs
  with the backend apply-policy cascade (aidream `services/output_directives/`).
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
