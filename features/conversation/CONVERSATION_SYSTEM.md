# Unified Conversation System — Complete Reference

> **Branch:** `dev` | **Last updated:** 2026-03-17  
> **Commit that created the infrastructure:** `aa1f584f`  
> **Status:** Infrastructure built. Zero routes migrated. Step 1 (file move) is next.

This document is the single source of truth for the unified conversation system.  
It contains: what exists, where it lives, what it depends on, what needs to happen, and how to track progress.

---

## Table of Contents

1. [Background and Goals](#1-background-and-goals)
2. [System Overview](#2-system-overview)
3. [All Files Created (Inventory)](#3-all-files-created-inventory)
4. [External Dependencies](#4-external-dependencies)
5. [Current State of Every Route](#5-current-state-of-every-route)
6. [Migration Task List](#6-migration-task-list)
7. [Do-Not-Break Checklist](#7-do-not-break-checklist)
8. [Files Safe vs Risky to Modify](#8-files-safe-vs-risky-to-modify)

---

## 1. Background and Goals

### The Problem

Six routes all render a conversation (user + assistant messages + tool calls + input). They diverged into completely separate codebases. The best version of every feature lives in a different route. Critical features include:

- Dual-protocol NDJSON streaming (new canonical) and Socket.IO (legacy, `/chat` only during cutover)
- Per-message error isolation (`MessageErrorBoundary`)
- Auth-gated message options (14 actions, works in public and authenticated contexts)
- Variable inputs (guided and classic modes)
- Canvas panel (required for block types)
- TTS / Cartesia
- ThumbsUp / ThumbsDown
- DOM-capture PDF export
- `HtmlPreviewFullScreenEditor` (lazy-loaded, 6 tabs)
- Tool call inline renderers registry
- Optional model picker with runtime config override

### The Solution

Create one `ConversationShell` component tree driven by a single Redux slice (`chatConversations`). All six routes will render `ConversationShell sessionId="..."`. Route-specific chrome (sidebar, header, canvas panel) stays outside the shell.

### Constraints

- **dev branch only** — nothing goes to `main` until fully tested
- **No feature regressions** — every feature every route has today must exist in the unified system before the old code is deleted
- **Incremental** — routes migrate one by one; the old code continues working until cut over
- **Feature directory** — all new code must live under `features/conversation/`, not scattered in `components/`, `lib/`, or `features/[other-feature]/`

---

## 2. System Overview

```
features/conversation/
├── components/           ← All UI components (currently at components/conversation/)
│   ├── ConversationShell.tsx
│   ├── MessageList.tsx
│   ├── AssistantMessage.tsx
│   ├── UserMessage.tsx
│   ├── MessageOptionsMenu.tsx
│   ├── StreamingContentBlocks.tsx
│   └── MessageErrorBoundary.tsx
├── hooks/                ← Adapter hooks (currently split across features/chat and features/prompts)
│   ├── useSocketIoSessionAdapter.ts   (deprecated — for /chat transition)
│   ├── usePromptExecutionAdapter.ts   (deprecated — for prompts/run transition)
│   └── usePromptBuilderAdapter.ts     (deprecated — for prompts/edit transition)
├── redux/                ← State slice (currently at lib/redux/chatConversations/)
│   ├── types.ts
│   ├── slice.ts
│   ├── selectors.ts
│   ├── index.ts
│   └── thunks/
│       ├── sendMessage.ts
│       └── loadConversationHistory.ts
├── index.ts              ← Barrel export for everything
└── CONVERSATION_SYSTEM.md (this file)
```

> Tool-call rendering is delegated to `@/features/tool-call-visualization` — the shell component, renderer registry, dynamic renderers, and admin UI all live there. Conversation surfaces just import `ToolCallVisualization` and hand it a `ToolLifecycleEntry`.

The `ConversationShell` requires only `sessionId`. The parent route must:
1. Initialize the session: `dispatch(chatConversationsActions.startSession({ sessionId, agentId }))`
2. Render `<ConversationShell sessionId={sessionId} />`

Everything else — streaming, message state, variables, resources — is managed internally.

### Data Flow

```
User types → ConversationInput → dispatch(sendMessage) → NDJSON stream
                                                        → chatConversationsSlice[sessionId]
                                                        → MessageList re-renders
                                                        → AssistantMessage shows streaming content
```

For legacy routes (during transition):
```
Socket.IO task → useSocketIoSessionAdapter → chatConversationsSlice[sessionId] → MessageList
prompt-execution → usePromptExecutionAdapter → chatConversationsSlice[sessionId] → MessageList
```

---

## 3. All Files Created (Inventory)

### 3a. UI Components (currently at `components/conversation/`)

> **Must move to** `features/conversation/components/` — see Step 1.

| File | What it does | External consumers today |
|------|-------------|--------------------------|
| `ConversationShell.tsx` | Top-level layout: header slot + `MessageList` + `ConversationInput` + optional canvas panel | **None** |
| `MessageList.tsx` | Renders all messages with `MessageErrorBoundary` per message, auto-scroll, condensed dimming, streaming leaf | `ConversationShell` only |
| `AssistantMessage.tsx` | 3 content modes (pending/streaming/static), Cartesia TTS, ThumbsUp/Down, copy, edit, PDF export, HTML preview, tool calls | `MessageList` only |
| `UserMessage.tsx` | XML resource parsing, `ResourcesContainer`, `AttachedResourcesDisplay`, 48px collapse, inline edit (no window.confirm) | `MessageList` only |
| `MessageOptionsMenu.tsx` | 14-item auth-aware menu: copy variants, edit, HTML preview, email, print/PDF, tasks, scratch, notes, save file, audio, brokers | Lazy-loaded by `AssistantMessage` only |
| `StreamingContentBlocks.tsx` | NDJSON normal-mode: `buildCanonicalBlocks` → interleaved `MarkdownStream` + `ToolCallVisualization` blocks (the shell is imported from `@/features/tool-call-visualization`) | `AssistantMessage` only |
| `MessageErrorBoundary.tsx` | Class-based error boundary; amber warning card per message | `MessageList` only |
| `index.ts` | Barrel export | N/A |

### 3b. Redux Slice (currently at `lib/redux/chatConversations/`)

> **Must move to** `features/conversation/redux/` — see Step 1. `rootReducer.ts` import path must update.

| File | What it does |
|------|-------------|
| `types.ts` | `ConversationMessage`, `ConversationSession`, `ChatConversationsState`, all payload types, `MessageRole`, `MessageStatus`, `SessionStatus`, `SessionUIState` |
| `slice.ts` | All reducers: `startSession`, `loadConversation`, `removeSession`, `setSessionStatus`, `setConversationId`, `addMessage`, `updateMessage`, `appendStreamChunk`, `pushStreamEvent`, `clearMessages`, `setCurrentInput`, `updateVariable`, `setExpandedVariable`, `addResource`, `removeResource`, `clearResources`, `updateUIState`, `setModelOverride` |
| `selectors.ts` | Memoized selectors: `selectSession`, `selectMessages`, `selectIsStreaming`, `selectIsExecuting`, `selectCurrentInput`, `selectResources`, `selectVariableDefaults`, `selectUIState`, `selectExpandedVariable`, `selectShowVariables`, `selectModelOverride`, `selectConversationId`, `selectAgentId` |
| `thunks/sendMessage.ts` | Full NDJSON streaming thunk. Routes to `/agents/{id}` (first message) or `/conversations/{id}` (follow-up). Handles block mode and normal mode. Stores `conversationId` from response header. Best-effort cancel via `DELETE /api/ai/cancel/{requestId}`. |
| `thunks/loadConversationHistory.ts` | Fetches history from `/api/ai/conversations/{id}/messages`, maps to `ConversationMessage[]`, dispatches `loadConversation`. |
| `index.ts` | Barrel export: reducer, actions, types, selectors, thunks |

### 3c. Adapter Hooks (currently split)

> **Must move to** `features/conversation/hooks/` — see Step 1.

| File | Current location | What it does | Consumers today |
|------|-----------------|-------------|-----------------|
| `useSocketIoSessionAdapter.ts` | `features/chat/hooks/` | Reads `selectPrimaryResponseTextByTaskId` + `selectResponseToolUpdatesByListenerId` from socket-io slice, writes chunks into `chatConversations` | **None** |
| `usePromptExecutionAdapter.ts` | `features/prompts/hooks/` | Reads `promptExecution` slice (messages, streaming text, status), mirrors into `chatConversations` | Only by `usePromptBuilderAdapter` |
| `usePromptBuilderAdapter.ts` | `features/prompts/hooks/` | Wraps `usePromptExecutionAdapter` for prompt builder context | **None** |

### 3d. Tool Renderer Registry (delegated)

Tool rendering is owned by `@/features/tool-call-visualization`. See `features/tool-call-visualization/FEATURE.md` for the renderer contract (`ToolRendererProps`, `ToolLifecycleEntry`), the static registry, and the dynamic/DB-stored renderer pipeline. Conversation components only import the `ToolCallVisualization` shell.

### 3e. Deprecated Legacy Files (tagged, still in production)

| File | Deprecated tag | Still actively used by |
|------|----------------|----------------------|
| `features/prompts/components/results-display/PromptRunner.tsx` | ✅ | `PromptRunPage.tsx` → `/ai/prompts/run` and `/ssr/prompts/run` |
| `features/prompts/components/smart/SmartMessageList.tsx` | ✅ | `PromptRunner.tsx` |
| `features/prompts/components/smart/SmartPromptInput.tsx` | ✅ | `PromptRunner.tsx` |
| `features/chat/components/response/user-message/UserMessage.tsx` | ✅ | `ResponseColumn.tsx` → `/chat` |

---

## 4. External Dependencies

These are all non-generic dependencies the unified system relies on. They live outside `features/conversation/` and must either remain as-is, be moved here eventually, or have their API contracts locked.

### 4a. Redux Slices (read-only access — must not be modified)

| Slice | Location | Used by | What it provides |
|-------|----------|---------|-----------------|
| `userSlice` | `lib/redux/slices/userSlice.ts` | `sendMessage` thunk, `AssistantMessage`, `MessageOptionsMenu` | `selectAccessToken`, `selectUser`, `selectIsAdmin` |
| `adminPreferencesSlice` | `lib/redux/slices/adminPreferencesSlice.ts` | `sendMessage` thunk | `selectIsUsingLocalhost` (routes to localhost backend for admins) |
| `socket-io` slice | `lib/redux/socket-io/` | `useSocketIoSessionAdapter` | `selectPrimaryResponseTextByTaskId`, `selectResponseToolUpdatesByListenerId` |
| `prompt-execution` slice | `lib/redux/prompt-execution/` | `usePromptExecutionAdapter` | `selectMessages`, `selectIsExecuting`, `selectStreamingTextForInstance` |
| `canvasSlice` | `features/canvas/redux/canvasSlice.ts` | `ConversationShell` (via `CanvasRenderer`) | Canvas state, `selectCurrentCanvasItem` |

### 4b. API Infrastructure

| Module | Location | Used by | What it provides |
|--------|----------|---------|-----------------|
| `ENDPOINTS` | `lib/api/endpoints.ts` | `sendMessage` thunk | `ai.agentStart(id)`, `ai.agentBlocksStart(id)`, `ai.conversationContinue(id)`, `ai.cancel(requestId)` |
| `BACKEND_URLS` | `lib/api/endpoints.ts` | `sendMessage` thunk | `production`, `localhost` |
| `parseNdjsonStream` | `lib/api/stream-parser.ts` | `sendMessage` thunk | Parses the NDJSON response body, yields `StreamEvent[]`, extracts `requestId` and `conversationId` header |
| Next.js `/api/ai/conversations/{id}/messages` | Internal Next.js API route | `loadConversationHistory` thunk | Fetches message history from DB |
| `/api/chat/email-response` | Internal Next.js API route | `MessageOptionsMenu` | Sends content via email to the authenticated user |

### 4c. Chat Protocol Library

| Module | Location | Used by | What it provides |
|--------|----------|---------|-----------------|
| `buildCanonicalBlocks` | `lib/chat-protocol/index.ts` | `StreamingContentBlocks` | Converts `StreamEvent[]` into ordered `(text | tool_call)[]` blocks |
| `extractPersistableToolBlocks` | `lib/chat-protocol/index.ts` | `sendMessage` thunk | Extracts completed tool blocks for DB persistence |
| `ToolCallBlock` type | `lib/chat-protocol/index.ts` | `StreamingContentBlocks` | Type definition — mapped to `ToolLifecycleEntry` before being handed to `ToolCallVisualization` |
| `ToolCallVisualization`, `ToolRendererProps` | `@/features/tool-call-visualization` | `StreamingContentBlocks`, `AssistantMessage` | Tool rendering shell and renderer contract |
| `StreamEvent` / `ToolEventPayload` types | `types/python-generated/stream-events.ts` | Everywhere streaming is handled | NDJSON wire event shape |

### 4d. Hooks (used but not owned by this feature)

| Hook | Location | Used by | What it provides |
|------|----------|---------|-----------------|
| `useCartesiaControls` | `hooks/tts/simple/useCartesiaControls.ts` | `ConversationShell` (creates one connection, passes controls down) | `speak`, `pause`, `resume`, `connectionState`, `playerState`, `handleScriptChange` |
| `useCartesiaWithPreferences` | `hooks/tts/simple/useCartesiaWithPreferences.ts` | `MessageOptionsMenu` | Higher-level Cartesia: `speak`, `isGenerating`, `isPlaying` |
| `useDomCapturePrint` | `features/chat/hooks/useDomCapturePrint.ts` | `AssistantMessage` | `captureRef` (attach to DOM element), `captureAsPDF({ filename })` |
| `useHtmlPreviewState` | `features/html-pages/hooks/useHtmlPreviewState.ts` | `AssistantMessage` | Manages state for the 6-tab HTML preview editor |
| `useRecordAndTranscribe` | `features/audio/hooks/useRecordAndTranscribe.ts` | `ConversationInput` | `startRecording`, `stopRecording`, `isRecording`, `isTranscribing`, `onTranscriptionComplete` |
| `useFileUpload` | `@/features/files` | `ConversationInput` | `upload(source)` / `uploadMany(sources)` → fileId + share URL, plus per-file progress state |
| `useClipboardPaste` | `components/ui/file-upload/useClipboardPaste.ts` | `ConversationInput` | Intercepts clipboard paste events on a textarea, calls `onPasteImage` for image items |
| `useQuickActions` | `features/quick-actions/hooks/useQuickActions.ts` | `MessageOptionsMenu` | `openQuickTasks({ content, prePopulate })` |

### 4e. Components (used but not owned)

| Component | Location | Used by | What it provides |
|-----------|----------|---------|-----------------|
| `MarkdownStream` | `components/MarkdownStream/` | `AssistantMessage`, `StreamingContentBlocks` | Full markdown renderer with streaming cursor, code highlighting, block extraction. The unified markdown system. |
| `FullScreenMarkdownEditor` | `components/mardown-display/chat-markdown/FullScreenMarkdownEditor.tsx` | `AssistantMessage` (lazy) | 4-tab editor: write / markdown / wysiwyg / preview |
| `HtmlPreviewFullScreenEditor` | `features/html-pages/components/HtmlPreviewFullScreenEditor.tsx` | `AssistantMessage` (lazy) | 6-tab HTML preview + publishing editor |
| `ResourcesContainer` | `features/prompts/components/resource-display/ResourceDisplay.tsx` | `UserMessage` | Renders XML-parsed resources as expandable typed cards (tables, images, notes, tasks) |
| `ResourceChips` | `features/prompts/components/resource-display/` | `ConversationInput` | Chips showing attached resources with remove + preview |
| `AdvancedMenu` | `components/official/AdvancedMenu.tsx` | `MessageOptionsMenu` | Positioned menu with categorized items, loading states, toast feedback. Accepts `MenuItem[]`. |
| `AuthGateDialog` | `components/dialogs/AuthGateDialog.tsx` | `MessageOptionsMenu` | Modal prompting login for auth-required features. Accepts `featureName`, `featureDescription`. |
| `EmailInputDialog` | `components/dialogs/EmailInputDialog.tsx` | `MessageOptionsMenu` | Collects email for unauthenticated users, calls `onSubmit(email)`. |
| `QuickSaveModal` | `features/notes/actions/QuickNoteSaveModal.tsx` (via `features/notes` barrel as `QuickSaveModal`) | `MessageOptionsMenu` | Save-to-notes modal with folder selector |
| `NotesAPI` | `features/notes/` (barrel) | `MessageOptionsMenu` | `NotesAPI.create({ label, content, folder_name, tags })` |
| `TranscriptionLoader` | `features/audio/` (barrel) | `ConversationInput` | Loading indicator shown while transcription is in progress |
| `ResizableCanvas` | `features/canvas/core/ResizableCanvas.tsx` | `ConversationShell` (lazy) | Draggable width canvas panel wrapper |
| `CanvasRenderer` | `features/canvas/core/CanvasRenderer.tsx` | `ConversationShell` (lazy) | Renders canvas content (quiz, slideshow, code, etc.) from Redux `canvasSlice` |

### 4f. Utilities (used but not owned)

| Utility | Location | Used by | What it provides |
|---------|----------|---------|-----------------|
| `parseResourcesFromMessage` | `features/prompts/utils/resource-parsing.ts` | `UserMessage` | Parses XML-encoded resources from message string |
| `extractMessageWithoutResources` | `features/prompts/utils/resource-parsing.ts` | `UserMessage` | Strips resource XML from message string, returns clean text |
| `messageContainsResources` | `features/prompts/utils/resource-parsing.ts` | `UserMessage` | Returns `true` if message string contains resource XML |
| `parseMarkdownToText` | `utils/markdown-processors/parse-markdown-for-speech.ts` | `AssistantMessage` | Strips markdown syntax to plain text for TTS |
| `copyToClipboard` | `components/matrx/buttons/markdown-copy-utils.ts` | `MessageOptionsMenu` | Rich copy with Google Docs / WordPress / thinking variants |
| `printMarkdownContent` | `features/chat/utils/markdown-print-utils.ts` | `MessageOptionsMenu` | Opens browser print dialog with styled markdown |
| `loadWordPressCSS` | `features/html-pages/css/wordpress-styles.ts` | `MessageOptionsMenu` | Fetches WordPress CSS for copying a complete standalone HTML page |

### 4g. Types (imported)

| Type | Location | Used by |
|------|----------|---------|
| `CartesiaControls` | `hooks/tts/simple/useCartesiaControls.ts` | `AssistantMessage`, `ConversationShell`, `MessageList` |
| `Resource` | `features/prompts/types/resources.ts` | `ConversationInput` |
| `PromptVariable` | `features/prompts/types/core.ts` | `chatConversations/types.ts`, `chatConversations/slice.ts` |

---

## 5. Current State of Every Route

### Routes and their conversation components (pre-migration — unchanged)

| Route | Messages | Input | State | Top Container |
|-------|----------|-------|-------|---------------|
| `/p/chat` | `MessageList` in `features/public-chat/components/MessageDisplay.tsx` | `ChatInputWithControls` | `ChatContext` (useReducer) | `ChatLayoutShell` → `ChatContainer` |
| `/ssr/chat` | Same `MessageList` | Same `ChatInputWithControls` | `ChatContext` + `SsrAgentContext` | `ChatLayout` → `ChatWorkspace` |
| `/chat` | `ResponseColumn` → `MessageItem` list | `PromptInputContainer` | Redux `chatConversations` (old entity slice) + socket-io | `ChatLayoutClient` |
| `/ai/prompts/run` | `SmartMessageList` | `SmartPromptInput` | Redux `promptExecution` slice | `PromptRunPage` → `PromptRunner` |
| `/ai/prompts/edit` | `PromptUserMessage`/`PromptAssistantMessage` | `PromptInput` | Local component state + Redux socket-io | `PromptBuilder` → `PromptBuilderRightPanel` |
| `/ssr/prompts/run` | Same as `/ai/prompts/run` | Same | Same | Shared `PromptRunPage` |

### Unique features per route (must survive migration)

| Route | Features that must be preserved |
|-------|--------------------------------|
| `/p/chat` | `AgentPickerSheet`, `ChatSidebar` with conversation history, `ChatMobileHeader`, URL `/p/chat/c/[id]` + `/p/chat/a/[agentId]`, guided/classic variable mode on welcome screen |
| `/ssr/chat` | CSS-grid shell layout, `SsrAgentContext`, `ShareModal`, `ChatHeaderControls`, URL via `window.history.pushState`, sidebar sync via `CustomEvent` |
| `/chat` | Full socket-io pipeline, `InputBottomControls` (broker/tools/search toggles), `BrokerSheet`, `AIToolsSheet`, file upload with chips, model picker, debug overlay, TTS |
| `/ai/prompts/run` | `PromptRunsSidebar` (run history), `ResizableCanvas` side panel, `PromptModeNavigation` header (Edit/Run toggle), `SharedPromptBanner`, run ID in URL |
| `/ai/prompts/edit` | Entire left panel: system message editor, variable defaults editor, tool selector, model config, `FullScreenEditor`, `ModelSettingsDialog`, `SystemPromptOptimizer`. Right panel is ephemeral test preview — must NOT persist to DB. |
| `/ssr/prompts/run` | SSR shell chrome, `usePromptsBasePath()` for correct back-navigation |

---

## 6. Migration Task List

Each step is independent of the next **except ordering**. A step must pass tsc + manual route test before the next step begins.

---

### ✅ Step 0: Infrastructure (DONE — commit aa1f584f)

- [x] Created `components/conversation/` with all UI components
- [x] Created `lib/redux/chatConversations/` slice + thunks
- [x] Created adapter hooks (in wrong locations — see Step 1)
- [x] Registered `chatConversations` in `rootReducer`
- [x] All TypeScript errors in new files resolved
- [x] Pushed to `origin/dev`

---

### 🔲 Step 1: Relocate to `features/conversation/` (NEXT)

**Status:** Not started  
**Risk:** Low — almost no external consumers yet  
**Prerequisite:** None

**Tasks:**
- [ ] `mkdir -p features/conversation/components features/conversation/hooks features/conversation/redux/thunks`
- [ ] Move `components/conversation/*.tsx` → `features/conversation/components/`
- [ ] Move `components/conversation/index.ts` → `features/conversation/index.ts` (update barrel paths)
- [ ] Move `lib/redux/chatConversations/` → `features/conversation/redux/`
- [ ] Move `features/chat/hooks/useSocketIoSessionAdapter.ts` → `features/conversation/hooks/`
- [ ] Move `features/prompts/hooks/usePromptExecutionAdapter.ts` → `features/conversation/hooks/`
- [ ] Move `features/prompts/hooks/usePromptBuilderAdapter.ts` → `features/conversation/hooks/`
- [ ] Update `lib/redux/rootReducer.ts` import path to `@/features/conversation/redux`
- [ ] Update all internal cross-references within the moved files
- [ ] Create `features/conversation/index.ts` barrel exporting all public API
- [ ] Run `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit` — zero new errors
- [ ] Commit: `refactor: relocate conversation system to features/conversation/`

**Verification:** `/chat` route still works.

---

### 🔲 Step 2: Migrate `/ai/prompts/run` and `/ssr/prompts/run`

**Status:** Not started  
**Risk:** Medium  
**Prerequisite:** Step 1 complete

**What changes:**
- `features/prompts/components/PromptRunPage.tsx` — add adapter call, swap `PromptRunner` for `ConversationShell`
- No changes to `startPromptInstance`, `executeMessage`, `finalizeExecution` thunks
- `PromptRunner.tsx`, `SmartMessageList.tsx`, `SmartPromptInput.tsx` remain (still tagged `@deprecated`)

**Tasks:**
- [ ] In `PromptRunPage.tsx`, after `startPromptInstance` completes, call `usePromptExecutionAdapter({ runId, agentId })` 
- [ ] Replace `<PromptRunner runId={runId} />` with `<ConversationShell sessionId={runId} enableInlineCanvas={true} inputProps={{ showVariables: true, showSubmitOnEnterToggle: true }} />`
- [ ] Verify `PromptRunsSidebar` still works (not touched)
- [ ] Verify `ResizableCanvas` / `CanvasRenderer` still works (now handled inside `ConversationShell`)
- [ ] Verify `PromptModeNavigation` still works (layout chrome, not touched)
- [ ] Verify variable inputs appear (guided mode via `showVariables=true`)
- [ ] Verify streaming works end-to-end (adapter must correctly mirror chunks)
- [ ] Verify tool calls display correctly
- [ ] Test on `/ssr/prompts/run` (uses same `PromptRunPage` component — automatic)
- [ ] Run tsc — zero new errors
- [ ] Commit: `feat: migrate prompts/run to ConversationShell (adapter bridge)`

**Known risk:** Adapter creates messages by generating new UUIDs — IDs will not match IDs in `promptExecution` slice. This is fine since `chatConversations` is the display slice; `promptExecution` remains the execution source of truth.

---

### 🔲 Step 3: Migrate `/ai/prompts/edit`

**Status:** Not started  
**Risk:** Medium-High  
**Prerequisite:** Step 2 complete and stable

**What changes:**
- `features/prompts/components/builder/PromptBuilder.tsx` — initialize session, wire adapter
- `features/prompts/components/builder/PromptBuilderDesktop.tsx` — swap right panel
- `features/prompts/components/builder/PromptBuilderMobile.tsx` — swap right panel

**Critical constraint:** The right panel is an ephemeral **test preview**. Messages must NOT persist to DB. The `sendMessage` thunk would create real DB conversations. Solution: for this route, keep using `executeMessage` from `prompt-execution` and rely on `usePromptBuilderAdapter` to mirror results into `chatConversations` for display only.

**Tasks:**
- [ ] Complete `usePromptBuilderAdapter` implementation (currently just wraps `usePromptExecutionAdapter` — may need test-preview-specific logic)
- [ ] In `PromptBuilder`, call `usePromptBuilderAdapter({ runId, promptId })` after instance is ready
- [ ] Replace `<PromptBuilderRightPanel sharedProps={...} />` with `<ConversationShell sessionId={runId} inputProps={{ showVariables: true, showSubmitOnEnterToggle: true, showAutoClearToggle: true }} />`
- [ ] Remove the `sharedProps` object entirely from `PromptBuilder` and all children that received it
- [ ] Keep entire `PromptBuilderLeftPanel` completely untouched
- [ ] Verify variable values flow from the left panel's variable editor into `ConversationInput`
- [ ] Verify `executeMessage` thunk is still what fires on submit (not `sendMessage`)
- [ ] Verify streaming displays correctly via adapter
- [ ] Run tsc — zero new errors
- [ ] Commit: `feat: migrate prompts/edit to ConversationShell (adapter bridge)`

---

### 🔲 Step 4: Migrate `/chat` (Authenticated)

**Status:** Not started  
**Risk:** High  
**Prerequisite:** Step 3 complete and stable

**What changes:**
- `app/(authenticated)/chat/ChatLayoutClient.tsx` — initialize session, wire socket adapter
- `features/chat/components/views/ChatConversationView.tsx` — swap input
- `features/chat/components/response/ResponseColumn.tsx` — swap messages

**Tasks:**
- [ ] In `ChatLayoutClient.tsx`, when a new socket task starts (via `submitChatFastAPI` thunk), dispatch `chatConversationsActions.startSession` and call `useSocketIoSessionAdapter({ sessionId, taskId })`
- [ ] Replace `ResponseColumn` with `ConversationShell`'s `MessageList` (or full `ConversationShell` if layout allows)
- [ ] Replace `PromptInputContainer` + `TextInput` with `ConversationInput` (keeping `InputBottomControls` temporarily as a `headerSlot` or adjacent component — it holds broker/tools/search toggles not yet ported to `ConversationInput`)
- [ ] Wire TTS: `ConversationShell` creates the single `useCartesiaControls` connection; pass down to messages
- [ ] Retire `features/chat/components/response/user-message/UserMessage.tsx` (currently deprecated)
- [ ] Verify socket-io streaming still works end-to-end
- [ ] Verify tool call display works
- [ ] Verify `InputBottomControls` still shows broker/tools toggles
- [ ] Run tsc — zero new errors
- [ ] Commit: `feat: migrate /chat to ConversationShell (socket-io adapter bridge)`

**Future work (NOT in this step):** Port `InputBottomControls` broker/tools/search toggles into `ConversationInput` as additional feature flags. Migrate `/chat` fully to NDJSON `sendMessage` thunk, retiring `useSocketIoSessionAdapter`.

---

### 🔲 Step 5: Migrate `/p/chat`

**Status:** Not started  
**Risk:** High  
**Prerequisite:** Step 4 complete and stable

**Key challenge:** `ChatContext` owns both conversation state AND agent-selection state. Must carefully split:
- Conversation state (messages, streaming, conversationId) → `chatConversations` slice
- Agent-selection state (selectedAgent, isSidebarOpen) → stays in `ChatContext` or moves to separate context

**Tasks:**
- [ ] Audit `ChatContext.tsx` — identify exactly which state fields drive messages vs. which drive sidebar/agent
- [ ] In `ChatLayoutShell`, after agent is resolved, call `dispatch(chatConversationsActions.startSession({ sessionId: crypto.randomUUID(), agentId }))` and keep the `sessionId` in context or a ref
- [ ] Replace `ChatContainer`'s `MessageList` (from `MessageDisplay.tsx`) with `features/conversation/components/MessageList`
- [ ] Replace `ChatInputWithControls` with `ConversationInput` (`showAgentPicker=true`, `showVoice=true`, `showResourcePicker=true`)
- [ ] Wire `GuidedVariableInputs` → `showVariables=true` on `ConversationInput`
- [ ] Wire `startConversation` thunk (or `sendMessage`) — note: for `/p/chat`, the new session hits `/agents/{agentId}` which is what `sendMessage` already does
- [ ] Keep `AgentPickerSheet`, `ChatSidebar`, `ChatMobileHeader` completely untouched
- [ ] Verify URL patterns `/p/chat/c/[id]` and `/p/chat/a/[agentId]` still work
- [ ] Verify conversation loading from DB (existing `/p/chat/c/[id]` conversations must load)
- [ ] Verify sidebar conversation list still populates
- [ ] Run tsc — zero new errors
- [ ] Commit: `feat: migrate /p/chat to ConversationShell`

---

### 🔲 Step 6: Migrate `/ssr/chat`

**Status:** Not started  
**Risk:** High  
**Prerequisite:** Step 5 complete and stable

Same components as `/p/chat` (`ChatContext`, `ChatInputWithControls`, `MessageDisplay.tsx`). Differences:
- CSS-grid layout (not flex) — don't touch the layout
- `SsrAgentContext` instead of `LayoutAgentContext`
- URL sync via `window.history.pushState` (not Next.js router)
- `ShareModal` — keep untouched
- `ChatHeaderControls` — keep untouched

**Tasks:**
- [ ] Apply same `MessageList` and `ConversationInput` swap as Step 5
- [ ] Keep `SsrAgentContext` fully intact (it drives sidebar + agent picker)
- [ ] Verify URL sync (`window.history.pushState`) still works correctly
- [ ] Verify `ShareModal` still launches from `ChatHeaderControls`
- [ ] Run tsc — zero new errors
- [ ] Commit: `feat: migrate /ssr/chat to ConversationShell`

---

### 🔲 Step 7: Cleanup

**Status:** Not started  
**Prerequisite:** All steps 2–6 complete and stable on `dev`

**Tasks:**
- [ ] Delete `features/prompts/components/results-display/PromptRunner.tsx`
- [ ] Delete `features/prompts/components/smart/SmartMessageList.tsx`
- [ ] Delete `features/prompts/components/smart/SmartPromptInput.tsx`
- [ ] Delete `features/chat/components/response/user-message/UserMessage.tsx`
- [ ] Delete `features/public-chat/components/MessageDisplay.tsx` (after verifying no remaining imports)
- [ ] Delete `features/public-chat/hooks/useAgentChat.ts` (after verifying `/p/chat` streaming works via `sendMessage` thunk)
- [ ] Run tsc — zero errors
- [ ] Final commit: `feat: remove deprecated conversation UI legacy code`

---

## 7. Do-Not-Break Checklist

Run before each step and after migration:

**Streaming**
- [ ] NDJSON streaming shows content as it arrives (no full-page re-render)
- [ ] Tool calls appear inline during streaming with phase-driven spinners
- [ ] Streaming cursor shows in `MarkdownStream` during active stream
- [ ] Stream stops cleanly — no ghost "Planning..." state after completion

**Content Rendering**
- [ ] `HtmlPreviewFullScreenEditor` opens from message options menu and has all 6 tabs
- [ ] `FullScreenMarkdownEditor` opens, edit saves content back to the message in Redux
- [ ] `ResourcesContainer` renders table, image, note, task resources from XML-encoded messages
- [ ] `AttachedResourcesDisplay` shows image thumbnails in user messages (file upload path)
- [ ] Code blocks in `MarkdownStream` have syntax highlighting and copy button

**Input**
- [ ] Variable inputs appear when agent has variables (guided mode: inline; classic: stacked)
- [ ] File upload works and resource chip appears in input
- [ ] Voice input works (microphone → transcription → appended to input)
- [ ] Clipboard paste of image works (uploads, chip appears)
- [ ] `Enter` / `Shift+Enter` / `⌘+Enter` behavior matches the route's expected UX

**Message Actions**
- [ ] ThumbsUp / ThumbsDown toggle correctly
- [ ] Copy (plain) works
- [ ] More options menu opens from `MoreHorizontal` button
- [ ] "Email to me" sends for authenticated users; shows `EmailInputDialog` for public
- [ ] "Save to Scratch" and "Save to Notes" trigger `AuthGateDialog` for public users
- [ ] `sessionStorage` pending action resumes after login (public auth gate flow)
- [ ] "Print / Save PDF" opens browser print dialog
- [ ] "Full Print" calls `captureAsPDF` and generates PDF from DOM

**TTS / Cartesia**
- [ ] Volume button appears in action bar
- [ ] Speak starts on click; Pause/Resume works
- [ ] Single Cartesia connection per `ConversationShell` (no multiple connections)

**Canvas**
- [ ] `enableInlineCanvas` shows resizable canvas panel on the right
- [ ] Canvas renders quiz, slideshow, code, and other block types correctly

**Error Handling**
- [ ] A message that fails to render does not crash the whole message list
- [ ] `MessageErrorBoundary` amber card shows with message ID
- [ ] Stream errors show an error state in the assistant message bubble

**Mobile**
- [ ] No nested scroll containers — single scroll area per view
- [ ] `pb-safe` padding on input container
- [ ] Textarea font-size ≥ 16px (prevents iOS zoom)
- [ ] No `window.confirm()` calls anywhere

---

## 8. Files Safe vs Risky to Modify

### Safe to modify freely (no external consumers)

These are new files with zero production consumers. Changes will not break any working route:

- All files under `components/conversation/` (about to move to `features/conversation/components/`)
- All files under `lib/redux/chatConversations/` (about to move to `features/conversation/redux/`)
- `features/conversation/hooks/useSocketIoSessionAdapter.ts`
- `features/conversation/hooks/usePromptExecutionAdapter.ts`
- `features/conversation/hooks/usePromptBuilderAdapter.ts`

### Risky to modify (active production consumers — verify before touching)

| File | Routes that depend on it |
|------|--------------------------|
| `features/prompts/components/results-display/PromptRunner.tsx` | `/ai/prompts/run`, `/ssr/prompts/run` |
| `features/prompts/components/smart/SmartMessageList.tsx` | same |
| `features/prompts/components/smart/SmartPromptInput.tsx` | same |
| `features/chat/components/response/user-message/UserMessage.tsx` | `/chat` |
| `features/chat/components/response/assistant-message/stream/ChatStreamDisplay.tsx` | `/chat` |
| `features/public-chat/components/MessageDisplay.tsx` | `/p/chat`, `/ssr/chat` |
| `features/public-chat/components/ChatInputWithControls.tsx` | `/p/chat`, `/ssr/chat` |
| `features/public-chat/context/ChatContext.tsx` | `/p/chat`, `/ssr/chat` |
| `lib/redux/rootReducer.ts` | entire app |
| `lib/chat-protocol/` | `StreamingContentBlocks`, `sendMessage` thunk |
| `lib/api/stream-parser.ts` | `sendMessage` thunk |
| `lib/api/endpoints.ts` | `sendMessage` thunk |
