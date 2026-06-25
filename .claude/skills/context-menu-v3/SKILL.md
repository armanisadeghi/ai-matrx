---
name: context-menu-v3
description: >-
  Roll out (or add) the universal v3 right-click context menu on a surface —
  migrating a consumer off the frozen v2 `UnifiedAgentContextMenu` to
  `EditableContextMenu` / `NonEditableContextMenu`, or wiring the menu onto a new
  surface. Use whenever a task says "migrate <surface> to v3 / the context
  menu", "add a right-click menu to <surface>", "the menu is fake / can't copy /
  has no Export on <surface>", "Download as Markdown is missing", or touches a
  consumer of `@/features/context-menu-v2/UnifiedAgentContextMenu`. Covers the
  exact prop mapping, `contentSource` + `entity` to unlock
  Copy-as/Export/Convert/Attach/Share, and the no-fake-menu verification. NOT for
  editing the v3 internals — that's `features/context-menu-v3/FEATURE.md`.
---

# context-menu-v3 — roll the universal menu onto a surface

The deep contract is **[`features/context-menu-v3/FEATURE.md`](../../../features/context-menu-v3/FEATURE.md)** — read it once. This skill is the rollout recipe. The proven reference is **`/demos/context-menu/canonical`** (every panel is a real v3 wiring; copy the one that matches your surface).

## Pick the wrapper

- **`EditableContextMenu`** — a textarea / editor. Gives Cut / Paste / Insert / Save / Delete on top of everything else.
- **`NonEditableContextMenu`** — a viewer / rendered display / read-only text. No text mutation; **Copy / AI / Export / Download / Convert still work** because the menu self-resolves content from the DOM.

A surface with both modes (editor + preview) uses **both** — one per mode, exactly where v2 had `isEditable` vs `isEditable={false}`.

## Migrate a v2 consumer — the mechanical diff

1. **Delete** the `const UnifiedAgentContextMenu = dynamic(() => import("@/features/context-menu-v2/UnifiedAgentContextMenu")…)` block **and its `loading` fallback**. v3's wrapper is light — import it **statically**; the shell renders children synchronously (no layout-collapse null state), and only `MenuContent` lazy-loads on first open.
   ```diff
   - const UnifiedAgentContextMenu = dynamic(() => import(".../UnifiedAgentContextMenu")…, {ssr:false, loading: …});
   + import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
   ```
   (Drop the now-unused `import dynamic from "next/dynamic"` if nothing else uses it.)
2. **Rename the JSX tag** `<UnifiedAgentContextMenu …>` → `<EditableContextMenu …>` (or `NonEditableContextMenu`). Update the closing tag.
3. **Drop `isEditable`** (the wrapper presets it — spreading a props constant that still contains it is harmless) and **`enabledPlacements`** (deprecated; use `placementMode`).
4. **Props are otherwise 1:1** — `sourceFeature`, `surfaceName`, `getApplicationScope` / `contextData`, `extraSections`, `getTextarea`, `onTextReplace` / `onTextInsertBefore|After`, history props, `scope` / `scopeId` all carry over unchanged.
5. **Types:** a `Partial<UnifiedAgentContextMenuProps>` override type becomes `Partial<EditableContextMenuProps>` (import from `@/features/context-menu-v3/types`).

## Unlock the new capabilities (do this, don't skip it)

- **`contentSource?: ContentSource`** (rich-document source: `{type:"note",noteId}`, `{type:"chat-message",…}`, `{type:"raw"}` default) → lights up **Copy-as variants, Export, Download as Markdown, Convert** and links Convert→Task to the right parent. A surface with a real entity should pass its source, not raw.
- **`entity?: {type,id,title,resourceType?,isOwner?}`** → lights up **Attach To** (scope tagging) and **Share**. Omit on raw fragments.

## Verify — non-negotiable

- `pnpm type-check` clean.
- **Open the menu on the surface and watch the console.** v3 SCREAMS in dev if the menu opens inert ("INERT MENU on …") or a surface dropped a declared value ("VALUE MAPPING GAP on …"). A clean open = the values are wired. A scream = fix the wiring (provide `getApplicationScope`/`contextData.content`, or make the wrapped content selectable for the DOM fallback).
- The acceptance test for any content surface: right-click **without selecting** → **Export → Download as Markdown** saves the whole content as `.md`; highlight first → saves the selection.

## Doctrine

- **Reuse, never fork.** Every action (copy/export/convert/print/attach/share/AI) delegates to an existing system. A surface contributes its own items via **`extraSections`** (declarative anchors), never a bespoke menu.
- **One menu.** No per-surface context-menu component. If a surface still has one (e.g. `CodeReadonlyContextMenu`, `CodeWorkspaceContextMenu` are thin wrappers), collapse it into a direct `Editable/NonEditableContextMenu` usage.
- v2 (`features/context-menu-v2/`) is **frozen** — never add to it; it's deleted once every consumer is migrated.

## Consumer rollout list

The full list of remaining v2 consumers lives in `features/context-menu-v3/FEATURE.md` (the "Consumers to migrate" section). Work top-value first: read-only viewers (the "can't copy" pain) and the high-traffic editors (notes, code, agents).
