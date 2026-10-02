# Chat Rewrite Gap Map

Inventory + salvage plan for the four dismantled chat-feature folders.
Reference when building the new `app/(a)/chat/...` route on `@matrx/agents`.

## Folder summary

| Folder | State | Files | Keep? |
|---|---|---|---|
| `features/cx-chat/` | Non-functional (57 files) | mostly broken | rewrite on new slices |
| `features/cx-conversation/` | Partially functional | 21 files; Runner depends on 3 | keep critical, rewrite rest |
| `features/conversation/` | Re-export layer (12 files) | utilities OK, barrels broken | keep utils, delete barrels |
| `features/chat/` | Utility + tool renderers (113 files) | print utils + tool overlays OK | keep utils, delete legacy stream |

## Runner-critical imports — MUST survive any deletion

The Agent Runner's `AgentAssistantMessage` transitively imports these four
from the chat folders. They are load-bearing:

| Import | Source | Notes |
|---|---|---|
| `AssistantActionBar` | `cx-conversation/AssistantActionBar.tsx` | Calls `messageActionsActions.registerInstance` — already wired to new slice |
| `MessageOptionsMenu` | `cx-conversation/MessageOptionsMenu.tsx` | Lazy-loaded; calls new message-actions slice |
| `ToolCallVisualization` | `cx-conversation/ToolCallVisualization.tsx` | Pure presentational — no Redux |
| `useDomCapturePrint` | `conversation/hooks/useDomCapturePrint.ts` | Pure utility; html2canvas + jsPDF |

Copy these four to `app/(a)/chat/components/` or hoist to a shared
components folder BEFORE deleting the cx-conversation / conversation
folders.

## Salvage list

### `features/cx-chat/`

- **Keep**: `types/cx-tables.ts`, `types/content.ts`, `utils/cx-content-converter.ts`, `utils/buildContentBlocksForSave.ts`, `utils/settings-diff.ts`.
- **Delete after rewrite**: all `components/**`, all `hooks/**`, `admin/ChatDebugModal.tsx`, `actions/messageActionRegistry.ts`.

### `features/cx-conversation/`

- **Keep (Runner critical)**: `AssistantActionBar.tsx`, `MessageOptionsMenu.tsx`, `ToolCallVisualization.tsx`, `HtmlPreviewBridge.tsx`.
- **Rewrite**: `useConversationSession.ts` (core hook; 13 call sites), `ConversationShell.tsx`, `UnifiedChatWrapper.tsx`.
- **Delete**: `useUnsavedChangesGuard.ts`, `useAuthenticatedChatProps.ts`, `actions/messageActionRegistry.ts`.

### `features/conversation/`

- **Keep**: `hooks/useDomCapturePrint.ts`, `utils/markdown-print.ts`, `utils/resource-parsing.ts`.
- **Delete**: `state/index.ts` (legacy-shim re-exports), `hooks/useAuthenticatedChatProps.ts`, `hooks/usePublicChatProps.ts`.

### `features/chat/`

- **Keep**: `utils/**` (print + block utilities), `components/response/tool-updates/**` (ToolUpdatesOverlay, stepDataRegistry), `components/response/tool-renderers/**` (domain-specific renderers).
- **Delete**: `hooks/useSocketIoSessionAdapter.ts`, `components/response/assistant-message/**` (legacy stream rendering — superseded by execution-system).

## What the rebuild consumes from `@matrx/agents`

Thunks:
- `launchConversation(invocation)` — first turn
- `loadConversation({ conversationId, surfaceKey })` — history
- `editMessage`, `forkConversation`, `softDeleteConversation`, `invalidateConversationCache`

Selectors:
- `selectDisplayMessages(cid)` — ordered turns projected from `byId`
- `selectMessageContent` / `selectMessageStatus` / etc. — narrow re-render-safe selectors
- `selectConversation(cid)` — entity read
- `selectGlobalConversationList` — sidebar

Actions:
- `messageActionsActions.registerInstance` — for per-message context menu
- `reserveMessage`, `updateMessageRecord`, `hydrateMessages` — stream commit path (usually dispatched by thunks, not components)

## Recommended rebuild order

1. **Week 1 — Protect.** Copy the 4 Runner-critical files into the new chat location (or shared folder). Verify Runner still builds.
2. **Week 1-2 — Rewrite `useConversationSession`** on `@matrx/agents` thunks + selectors.
3. **Week 3 — MessageList / AssistantMessage / UserMessage** on narrow selectors + DB-faithful `byId`.
4. **Week 4 — Route-level at `app/(a)/chat/**`**. Replace `app/(dev)/demos/chat/**` routes.
5. **Week 5 — Delete cx-chat / cx-conversation / conversation / chat legacy.** Unblocks legacy-shims deletion.
