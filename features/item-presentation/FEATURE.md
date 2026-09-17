# FEATURE.md — `item-presentation`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-17`

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
- **`canOpen` does NOT gate on `notFound`** (`ItemPresentationBlock.tsx`) — deliberate; see flow 3.
- **Reconstruct as a ```json fence** on DB round-trip — the XML-wrapper default would corrupt the block.
- **Every recognized type is now clickable.** Bespoke windows: `agent` (run window — now seeded with the known name so the title shows instantly), `note`, `file`/`image`/`video`/`audio`, `picklist`. All others open the Detail primitive. To upgrade a type to a bespoke window later, add a branch above the generic cases in `useOpenItemPresentation` — nothing else changes.
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

- 2026-09-17 — **`ItemDetailWindow` → the Detail primitive.** The generic window and its opener are deleted; `detail.tsx` (`resolveItemDetailType`) + `ItemDetailFrame.tsx` carry the identical body behind `lib/detail`'s contract, so every non-bespoke type opens as a window (default), a docked side panel or a page per `ui.detail.default_presentation`, with `[`/`]` list navigation, deep links (`?panels=detail:<type>.<id>:as-…`) and the associations + history sections. `file`/`image`/`video`/`audio` gained `FILE_DETAIL_SOURCE`.
- 2026-09-11 — **`conversation` is a first-class item type.** The reference chip's "Open conversation" silently no-oped (no registry entry → fallback config with no `open`). New entry (Chat label, `chat.conversation` detailSource) + `ItemOpenKind` `conversation` branch: resolves `initial_agent_id` then opens the floating Chat window on that conversation; lookup failure is a loud toast.

- `2026-08-24` — **The Item Detail window mounts its own right-click menu, and IS a surface.** Right-clicking inside the floating dossier was answered by whatever page sat underneath, handing the user THAT page's surface, values and agents while they looked at this record — so the platform's generic peek target could not even be copied for an AI. `ItemDetailWindow` now wraps its body in `NonEditableContextMenu` (`sourceFeature="system"`, `contentSource={{type:"raw"}}`, `entity` from the normalised `doorToken` whenever it is a registered `EntityTypeToken`), so Copy-as / Export / Download-as-Markdown / Convert / Attach To all act on the record. Content is resolved GENERICALLY from what the panel already rendered (title, type, id, the opener's one-liner, then every rendered field as `Label: value`) — never per-type, because the window shows an arbitrary entity by definition. New surface `matrx-user/item-detail` (`features/surfaces/manifests/item-detail.manifest.ts`, emitter = nested `SurfaceRuntimeProvider` at the window root) so a menu launch carries declared values instead of screaming a value-mapping gap. Body wrapper is `min-h-full` so the menu answers a right-click anywhere in the window, not just on the rows. Verified live: menu opens un-clipped over the window, no `INERT MENU` / `VALUE MAPPING GAP`, Export → Download as Markdown and Copy as → Copy text both carry the full dossier.
- `2026-06-15` — Closed the opener gap: built the generic `ItemDetailWindow` (overlay `itemDetailWindow`) and routed all non-bespoke types to it via `detailSource` in the registry; threaded a `{name,about}` seed through the openers. Fixed the agent-run window title (seed the known agent name through `agentRunWindow` so it shows before the agent list/definition loads). Fixed latent dynamic-table TS errors.
- `2026-06-15` — Built the block end-to-end (types, registry, enrichment + open hooks, renderer, splitter/registry wiring, DB round-trip, demo). Shipped the platform skill + 11 content blocks (`migrations/item_presentation_render_block.sql`, applied + verified live). Wired openers for agent/note/file/picklist; allowed click-through on `notFound`.
