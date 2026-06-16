# FEATURE.md — `item-presentation`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-06-15`

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
- `features/window-panels/windows/item-detail/ItemDetailWindow.tsx` — the generic fallback detail window. Opens any `{type,id}`, seeds from the agent name/about, fetches the full row via the registry's `detailSource`, renders every populated scalar field. Registered overlay `itemDetailWindow`.

**Hooks**
- `useEnrichItem()` — soft-fails; fetches the authoritative row for a recognized type, returns `{ status, notFound, detail }`.
- `useOpenItemPresentation()` — dispatches the right window-panel opener by type, passing a `{ name, about }` seed. Bespoke windows for agent/note/file/picklist; **every other recognized type opens `ItemDetailWindow`**. Returns `false` only when there's no id or `config.open` is unset.
- `useOpenItemDetailWindow()` (`features/overlays/openers/itemDetailWindow.tsx`) — opener for the generic detail window.

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
- **`canOpen` does NOT gate on `notFound`** (`ItemPresentationBlock.tsx`) — deliberate; see flow 3.
- **Reconstruct as a ```json fence** on DB round-trip — the XML-wrapper default would corrupt the block.
- **Every recognized type is now clickable.** Bespoke windows: `agent` (run window — now seeded with the known name so the title shows instantly), `note`, `file`/`image`/`video`/`audio`, `picklist`. All others open the generic `ItemDetailWindow`. To upgrade a type to a bespoke window later, add a branch above the generic cases in `useOpenItemPresentation` — nothing else changes.
- **`detailSource` is the only thing the generic window needs.** A type with `detailSource: { table, titleField }` gets a full-record view; a recognized type without one (`session`, `message` — no single canonical table) opens seed-only. See KNOWN_DEFECTS D7.
- **Dynamic-table Supabase queries must use `string` variables, never literals.** `supabase.from("literal")` / `.select("*")` resolve the entire schema union and blow TS instantiation depth. `ItemDetailWindow` and `registry.fetchRow` both pass `string` variables to stay generic.

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

- `2026-06-15` — Closed the opener gap: built the generic `ItemDetailWindow` (overlay `itemDetailWindow`) and routed all non-bespoke types to it via `detailSource` in the registry; threaded a `{name,about}` seed through the openers. Fixed the agent-run window title (seed the known agent name through `agentRunWindow` so it shows before the agent list/definition loads). Fixed latent dynamic-table TS errors.
- `2026-06-15` — Built the block end-to-end (types, registry, enrichment + open hooks, renderer, splitter/registry wiring, DB round-trip, demo). Shipped the platform skill + 11 content blocks (`migrations/item_presentation_render_block.sql`, applied + verified live). Wired openers for agent/note/file/picklist; allowed click-through on `notFound`.
