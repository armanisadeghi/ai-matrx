---
type: Handoff
status: active
updated: 2026-09-11
repos: [matrx-frontend]
scope: subfeature
feature: Context Menu v3
vision: []
---

# References everywhere — insert or copy a live reference from any surface

**What this is:** From the system-wide right-click menu on any surface, a user picks a kind of thing (Chat, Note, Task, …), searches for the record, and inserts (or copies) the minified Kind Directive reference `{"__kind":"directive_v1_reference_<noun>","items":[{"id":"…"}]}` that the platform already renders as a clickable chip — replacing the raw-UUID admin builder flow for users.
**Scope:** Sub-feature
**Feature:** Context Menu v3 (`features/context-menu-v3/FEATURE.md`)
**Vision:** VISION MISSING — Arman's spoken brief (2026-09-11, this session) is the only source: type first → action defaults to "reference" but offer the others where they exist → a real search UI → insert the minified form; common types (chat, note, task, project) by the names users know, everything else behind "more"; hiding the marker inside the plain-text note editor is explicitly NOT wanted if it needs a rich editor.

## Resources
- Plan with full inventory + decisions: `/Users/armanisadeghi/.claude/plans/reference-inserter-everywhere.md`
- Fence minting (THE ONE PLACE): `features/matrx-envelope/referenceFence.ts` (`buildReferenceFence`, `buildDirectiveFence`)
- Picker pieces reused: `features/matrx-envelope/components/ReferenceTypeAdder.tsx` (`RecordReferencePicker`, file/url adders), `features/scopes/registry/entityRegistry.ts` (`listableTokens`, `getEntityInfo`), `features/matrx-envelope/directiveHost.tsx` (`matrxDirectiveNouns` → label/family)
- New picker: `features/matrx-envelope/components/reference-picker/` (`ReferencePickerBody.tsx`, `referencePickerTypes.ts`)
- Overlay wiring: `features/overlays/catalogue.ts` (`referencePicker`), `features/overlays/openers/referencePicker.tsx`, `features/overlays/callbacks/referencePicker.ts`, `features/overlays/components/ReferencePickerOverlay.tsx`, render block in `features/overlays/OverlayController.tsx`
- Menu wiring: `features/context-menu-v3/hooks/useContextMenuActions.ts` (`handleInsertReference`), `model/menu-model.ts` (node `insert-reference`, role `insertReference`), `model/layouts.ts` (tiered clipboard tail), parity test `model/__tests__/layout-parity.test.ts`
- Skills: `context-menu-v3`, `overlay-system`, `picker-custom-entry`
- Test routes (dev server `pnpm preview:start`, login as admin): `/notes` (insert → switch to preview/split → chip → click opens the chat), `/chat` (paste renders), `/administration/agents/relationships/directives` (admin unchanged)

## Remaining work
1. Build the picker body + overlay + menu action (files above) — in progress this session.
2. `pnpm type-check`; run `features/context-menu-v3` jest tests (layout parity).
3. Live verify on `/notes` desktop + mobile drawer; watch the dev console for `INERT MENU` / `VALUE MAPPING GAP`.
4. Update `features/context-menu-v3/FEATURE.md` + `features/matrx-envelope/FEATURE.md` change logs; delete this handoff.

## Decisions needed
None — naming and defaults were delegated to the agent (Arman, 2026-09-11: "I'll leave the naming up to you").
