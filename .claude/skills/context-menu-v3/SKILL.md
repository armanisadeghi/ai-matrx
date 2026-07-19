---
name: context-menu-v3
description: >-
  Wire the universal v3 right-click context menu (`EditableContextMenu` /
  `NonEditableContextMenu`) onto a surface, or fix a surface's wiring. Use
  whenever a task says "add a right-click menu to <surface>", "wire <surface>
  to the context menu", "the menu is fake / can't copy / has no Export on
  <surface>", "Download as Markdown is missing", or collapses a leftover
  bespoke per-surface menu. Covers the wrapper choice, the value props,
  `contentSource` + `entity` to unlock Copy-as/Export/Convert/Attach/Share,
  and the no-fake-menu verification. NOT for editing the v3 internals —
  that's `features/context-menu-v3/FEATURE.md`.
---

# context-menu-v3 — wire the universal menu onto a surface

The deep contract is **[`features/context-menu-v3/FEATURE.md`](../../../features/context-menu-v3/FEATURE.md)** — read it once. This skill is the rollout recipe. The proven reference is **`/demos/context-menu/canonical`** (every panel is a real v3 wiring; copy the one that matches your surface). The v2 menu (`UnifiedAgentContextMenu`) was deleted 2026-07-19 — every surface renders v3.

## Pick the wrapper

- **`EditableContextMenu`** — a textarea / editor. Gives Cut / Paste / Insert / Save / Delete on top of everything else.
- **`NonEditableContextMenu`** — a viewer / rendered display / read-only text. No text mutation; **Copy / AI / Export / Download / Convert still work** because the menu self-resolves content from the DOM.

A surface with both modes (editor + preview) uses **both** — one per mode.

## Wire a surface — the mechanical steps

1. **Import the wrapper statically** — it's the light shell; children render synchronously, and only `MenuContent` lazy-loads on first open. Never wrap it in a per-consumer `next/dynamic` (that re-adds a loading fallback and a layout-collapse null state for zero benefit).
   ```tsx
   import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
   ```
2. **Wrap the region** in `<EditableContextMenu …>` (or `NonEditableContextMenu`).
3. **Pass the identity + value props:** `sourceFeature` (required), `surfaceName` (registry surface → AI actions + bound agents + value mappings), `getApplicationScope` (live, preferred) / `contextData` (static), `extraSections`, and for editables `getTextarea` + `onTextReplace` / `onTextInsertBefore|After`; history props and `scope` / `scopeId` as the surface needs. Use `placementMode` for per-placement visibility. Types: `@/features/context-menu-v3/types` (`EditableContextMenuProps` / `NonEditableContextMenuProps`).
4. Build scope through **`buildApplicationScopeFromMenuContext`** (`@/features/context-menu-v3/utils/build-application-scope`) — it guarantees the 5 baselines from the live DOM.

## Unlock the new capabilities (do this, don't skip it)

- **`contentSource?: ContentSource`** (rich-document source: `{type:"note",noteId}`, `{type:"chat-message",…}`, `{type:"raw"}` default) → lights up **Copy-as variants, Export, Download as Markdown, Convert** and links Convert→Task to the right parent. A surface with a real entity should pass its source, not raw.
- **`entity?: {type,id,title,resourceType?,isOwner?}`** → lights up **Attach To** (scope tagging) and **Share**. Omit on raw fragments.

## Verify — non-negotiable

- `pnpm type-check` clean.
- **Open the menu on the surface and watch the console.** v3 SCREAMS in dev if the menu opens inert ("INERT MENU on …") or a surface dropped a declared value ("VALUE MAPPING GAP on …"). A clean open = the values are wired. A scream = fix the wiring (provide `getApplicationScope`/`contextData.content`, or make the wrapped content selectable for the DOM fallback).
- The acceptance test for any content surface: right-click **without selecting** → **Export → Download as Markdown** saves the whole content as `.md`; highlight first → saves the selection.

## Doctrine

- **Reuse, never fork.** Every action (copy/export/convert/print/attach/share/AI) delegates to an existing system. A surface contributes its own items via **`extraSections`** (declarative anchors), never a bespoke menu.
- **One menu.** No per-surface context-menu component. If a surface still has one, collapse it into a direct `Editable/NonEditableContextMenu` usage.
