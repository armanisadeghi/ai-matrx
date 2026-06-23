# Phase 5 — Context-Menu Integration Sweep

**Status:** complete
**Owner:** claude (phase-5 task)
**Prerequisites:** Phase 3, Phase 4
**Unblocks:** Phase 6, Phase 7

## Goal

Swap every consumer of the old `UnifiedContextMenu` to the new agent-native menu from Phase 3, and wire the additive `get_ssr_agent_shell_data` RPC shipped in Phase 3 so SSR hydration pre-populates the agent-side context-menu cache.

## Call sites to rewire
- `features/notes/components/NoteEditor.tsx` (NOT `NoteEditorCore.tsx` — the core does not wrap the menu; the parent does)
- `features/code-editor/components/CodeEditorContextMenu.tsx`
- `features/agents/components/builder/message-builders/MessageItem.tsx`
- `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx`
- Any other wrapper found via grep for `UnifiedContextMenu` or `useUnifiedContextMenu` outside `features/prompts/**`, `features/prompt-builtins/**`, `features/context-menu/**`, `app/(authenticated)/ai/prompts/**` (all scheduled for Phase 16/18 removal).

## Success criteria
- [x] All listed files reference the new component/hook.
- [x] Grep for the old symbols returns only files inside `features/prompt-builtins/`, `features/context-menu/`, `features/prompts/`, and `app/(authenticated)/ai/prompts/experimental/` (all scheduled for Phase 16/18 removal), plus the unrelated file-manager `components/file-system/context-menu.tsx` which happens to share the class name.
- [x] `get_ssr_agent_shell_data` RPC wired into `DeferredShellData` as a parallel call alongside the legacy RPC; new `agentContextMenuCache` slice added and registered in both `rootReducer` and `liteRootReducer`; v2 hook now prefers the agent cache over the legacy one.
- [ ] Manual smoke test: right-click in Notes, code editor, agent builder messages — menus look and behave identical to pre-migration. *(Requires human verification in-browser; all touched files compiled via existing types.)*
- [x] `INVENTORY.md` + Change Log updated.

## Non-consumers flagged during the sweep
- **`components/file-system/context-menu.tsx`** — a distinct component that happens to be named `UnifiedContextMenu`. Pure file/folder/bucket operations (download, move, rename, etc.), zero coupling to prompts or agents. Left as-is.
- **`app/(dev)/demos/notes/_components/NoteContextMenuContent.tsx`** (+ `useNoteContextMenuGroups.ts`) — a hand-rolled SSR parity menu, not a wrapper over `UnifiedContextMenu`. It still imports `features/prompt-builtins/{types,utils,constants}` and `usePromptRunner`. Porting the SSR notes menu to agent hooks is a separate surface — tracked in `INVENTORY.md` as a later phase (Phase 7 or Phase 18).

## Change log
| Date | Who | Change |
|---|---|---|
| 2026-04-20 | initial plan | Phase created. |
| 2026-04-21 | claude (phase-5) | **Status → complete.** Rewired 4 consumer files to `UnifiedAgentContextMenu` via `@/features/context-menu-v2`: (1) `features/notes/components/NoteEditor.tsx` — swapped the dynamic import source + renamed the local `UnifiedContextMenu` alias to `UnifiedAgentContextMenu` across all 4 editor-mode branches (plain, wysiwyg, markdown, preview); (2) `features/code-editor/components/CodeEditorContextMenu.tsx` — also swapped `PLACEMENT_TYPES` import from `@/features/prompt-builtins/constants` to `@/features/agent-shortcuts/constants`; (3) `features/agents/components/builder/message-builders/MessageItem.tsx`; (4) `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx`. SSR RPC handling: chose the **parallel-call** path because the legacy prompt system is still live and swapping would regress it. Added `getSSRAgentShellData()` helper in `utils/supabase/ssrShellData.ts`; `features/shell/components/DeferredShellData.tsx` now fires both RPCs in `Promise.all` and dispatches to the new `agentContextMenuCache` slice. New files: `lib/redux/slices/agentContextMenuCacheSlice.ts`. Touched: `lib/redux/rootReducer.ts`, `lib/redux/liteRootReducer.ts`, `lib/redux/store.ts`, `types/reduxTypes.ts`, `features/context-menu-v2/hooks/useUnifiedAgentContextMenu.ts` (prefers the new agent SSR cache, falls back to legacy). Surprises: the phase plan listed `NoteEditorCore.tsx` but that file does not host the menu — the real consumer is `NoteEditor.tsx`. The file-manager component at `components/file-system/context-menu.tsx` is a same-named but completely unrelated component and was left untouched. The SSR notes route has its own hand-rolled menu that still couples to prompt-builtins — flagged in `INVENTORY.md` for a later phase. All 4 consumers ship without prop changes (v2's `scope` / `scopeId` optional props default to `"global"` / `null`, so existing call sites behave identically). |
