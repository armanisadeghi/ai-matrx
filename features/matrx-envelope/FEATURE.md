# Matrx Envelope — frontend

The client mirror of the [Matrx Envelope](../../docs/protocol/MATRX_ENVELOPE.md) standard:
`{ matrx_version, kind, type, items: [...] }`. Recognize the outer canonical shell once,
route internal parts through a registry, render them, fall back gracefully.

## Parts

- `envelope.ts` — the contract: `isMatrxEnvelope` (detect by `matrx_version`),
  `MatrxEnvelope` / `ReferenceItem` types, the `directive_apply.*` receipt events +
  `isDirectiveApplyEvent`, and `buildEnvelopeOutputSchema` (mirrors aidream's schema-gen).
- `registry.tsx` — the **renderer registry** (mirrors the backend shape registry):
  `registerEnvelopeRenderer(kind, renderer, type?)` + `getEnvelopeRenderer(kind, type)`
  (type-specific → kind-default → null). Built-in: `reference` → **live, clickable chips**
  (`ReferenceChip`, one per item). Add a renderer = one register call.
- `referenceResolvers.ts` — the **reference resolver registry** (the data-driven mirror for
  the `reference` kind): one entry per reference `type` → `{ resolveValue(supabase, ref),
  openItemType, openId(ref) }`. `resolveValue` fetches the LIVE value from Supabase
  (never throws; returns `undefined` on miss → chip falls back to `display.label`);
  `openItemType` is the `item-presentation` `KnownItemType` reused for click-to-open, and
  `openId` is the underlying entity (the picklist / dataset, NOT the cell). Registered types:
  `picklist_item` (value = `udt_picklist_items.description ?? .label` by `ref.item_id`; opens
  picklist `ref.list_id` via `"picklist"`) and `dataset_cell` (value = `udt_dataset_rows.data[ref.field_name]`
  by `ref.row_id`; opens dataset `ref.dataset_id` via `"table"`). Adding a reference type =
  one entry here; no new opener if item-presentation already has the entity's window.
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
  `sonner` toasts (`isDirectiveApplyEvent`).
- Schema-proposal (a separate `schema_proposal` json block, NOT an envelope): see
  `features/agents/components/schema-proposal/` — agent's `{name,schema}` output →
  "Apply to an agent".

## Status

- Done: envelope module, renderer registry + reference resolver registry — `reference` chips
  now **come to life** (live Supabase fetch of the underlying value + click-to-open the entity
  in a window panel, graceful fallback to `display.label`) — outer-first recognition + graceful
  fallback, fence wiring, directive receipts, schema-proposal apply flow.
- Next: renderers for `secret` / `output_directive`-receipt-in-content if needed; the
  reference-insert authoring picker.

## Change Log

- 2026-06-19 — `reference` blocks come to life: each chip now fetches its LIVE value from
  Supabase (`picklist_item` → picklist item description/label; `dataset_cell` → dataset-row
  cell) and is clickable to open the underlying picklist/table in a window panel (reusing the
  item-presentation opener), with graceful fallback to `display.label`. New
  `referenceResolvers.ts` resolver registry. Hardened after adversarial review: chips keyed by
  content (not index), non-string `ref` values coerced loudly (`coerceRefToStrings`), the
  "never throws" contract defended at the call site, label-less fallback humanized.
- 2026-06-19 — Created. Outer-first recognition + renderer registry + graceful fallback;
  fence rendering, directive receipts, schema-proposal apply.
