# Chat Protocol Migration Audit

Exhaustive list of every route, component, hook, thunk, and utility that currently touches
the old chat data formats (`ChatMessage`, `ToolCallObject`, `processDbMessagesForDisplay`,
`buildStreamBlocks`, `tool-event-engine`, etc.) and must be updated to consume the canonical
`CanonicalMessage` / `CanonicalBlock` format from `@/lib/chat-protocol`.

---

## Legend


| Status              | Meaning                                                |
| ------------------- | ------------------------------------------------------ |
| ✅ Already converted | Uses `@/lib/chat-protocol` today                       |
| 🔴 Must update      | Still uses the old formats                             |
| ⚠️ Evaluate         | May or may not need changes (utility/admin/deprecated) |


---

## 1. CHAT ROUTES (Pages)

These are the routes users interact with. Each loads conversations from the DB and/or
streams live responses.


| Route                                        | Status | Current Format                                           | Notes                                                                 |
| -------------------------------------------- | ------ | -------------------------------------------------------- | --------------------------------------------------------------------- |
| `app/(dev)/demos/chat/`                        | ✅      | Uses `buildCanonicalMessages` + `canonicalArrayToLegacy` | Converted in Phase 1. Still uses legacy adapter.                      |
| `app/(public)/p/chat/`                       | 🔴     | `processDbMessagesForDisplay`                            | `ChatLayoutShell.tsx` imports directly from `cx-content-converter.ts` |
| `app/(authenticated)/chat/`                  | 🔴     | `ChatContext.ChatMessage`                                | Uses `ChatLayoutClient.tsx` → `ChatContext` → `useAgentChat`          |
| `app/(public)/demos/api-tests/chat/`         | ⚠️     | `ChatDemoClient.tsx` — raw stream parsing                | Demo/test route, lower priority                                       |
| `app/(public)/demos/api-tests/unified-chat/` | ⚠️     | `ChatTestClient.tsx` — raw `StreamEvent`                 | Demo/test route                                                       |
| `app/(public)/demos/api-tests/agent/`        | ⚠️     | `AgentTestClient.tsx` — raw `StreamEvent`                | Demo/test route                                                       |
| `app/(public)/demos/api-tests/tool-testing/` | ⚠️     | Uses `StreamEvent`, `ToolCallObject` directly            | Test harness for tool renderers                                       |
| `app/api/chat/email-response/`               | ⚠️     | API route only, no rendering                             | Probably unaffected                                                   |


---

## 2. PROMPT ROUTES

These routes run prompts (AI execution + streaming) and display the results.


| Route                                       | Status | Current Format                                                 | Notes                                                   |
| ------------------------------------------- | ------ | -------------------------------------------------------------- | ------------------------------------------------------- |
| `app/(authenticated)/ai/prompts/run/[id]/`  | 🔴     | Redux `submitChatFastAPI` → `socketResponseSlice.toolUpdates`  | Uses Redux pipeline, renders via `EnhancedChatMarkdown` |
| `app/(dev)/demos/prompts/run/[id]/`           | 🔴     | Same Redux pipeline                                            | SSR variant of the run route                            |
| `app/(authenticated)/ai/prompts/edit/[id]/` | 🔴     | `PromptTestPanel` → `usePromptExecution` → `submitChatFastAPI` | The "test" panel inside the editor                      |
| `app/(dev)/demos/prompts/edit/[id]/`          | 🔴     | Same as above                                                  | SSR variant                                             |


---

## 3. PROMPT APPS

These are public-facing AI apps built on prompts.


| File                                                                 | Status | Current Format                                 | Notes                            |
| -------------------------------------------------------------------- | ------ | ---------------------------------------------- | -------------------------------- |
| `features/prompt-apps/components/PromptAppPublicRendererFastAPI.tsx` | 🔴     | `StreamEvent` → raw parsing + `ToolCallObject` | Main public prompt app renderer  |
| `features/prompt-apps/components/PromptAppRenderer.tsx`              | 🔴     | `StreamEvent` usage                            | Alternate renderer               |
| `features/prompt-apps/components/PromptAppPublicRendererDirect.tsx`  | 🔴     | Similar stream handling                        | Direct execution variant         |
| `app/(authenticated)/prompt-apps/[id]/`                              | 🔴     | Uses one of the above renderers                | Route wrapper                    |
| `app/(authenticated)/org/[slug]/prompt-apps/`                        | ⚠️     | Organization prompt apps listing               | May not touch chat data directly |


---

## 4. CORE STREAMING & DATA HOOKS

These are the hooks and utilities that process stream and DB data.


| File                                                 | Status  | Impact                                                           | Notes                                                 |
| ---------------------------------------------------- | ------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| `features/public-chat/hooks/useAgentChat.ts`         | 🔴 HIGH | Imports `extractPersistableToolUpdates` from `tool-event-engine` | Core streaming hook for public chat                   |
| `features/public-chat/hooks/useChatPersistence.ts`   | 🔴 HIGH | Loads conversations → feeds `ChatContext`                        | DB loading hook                                       |
| `features/public-chat/context/ChatContext.tsx`       | 🔴 HIGH | Defines `ChatMessage { content: string; toolUpdates?: any[] }`   | **Central context**. Must accept `CanonicalMessage[]` |
| `features/public-chat/components/MessageDisplay.tsx` | 🔴 HIGH | Imports `buildStreamBlocks` from `tool-event-engine`             | Main message renderer — block-level                   |
| `features/public-chat/components/ChatContainer.tsx`  | 🔴      | Uses `useAgentChat`                                              | Wrapper above `MessageDisplay`                        |
| `features/prompts/hooks/usePromptExecution.ts`       | 🔴      | Uses `submitChatFastAPI` thunk                                   | Prompt-specific execution hook                        |
| `features/chat/hooks/useNewChat.ts`                  | 🔴      | Redux `submitChatFastAPI`                                        | Authenticated chat hook                               |
| `features/chat/hooks/useExistingChat.ts`             | 🔴      | Redux `submitChatFastAPI` → `executeMessageFastAPIThunk`         | Existing conversation hook                            |


---

## 5. REDUX LAYER (Thunks + Slices + Selectors)


| File                                                                         | Status  | Impact                                                             | Notes                                                  |
| ---------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| `lib/redux/socket-io/thunks/submitChatFastAPI.ts`                            | 🔴 HIGH | Casts tool data to `ToolCallObject` and dispatches `addToolUpdate` | Core submission thunk                                  |
| `lib/redux/prompt-execution/thunks/executeMessageFastAPIThunk.ts`            | 🔴 HIGH | Same pattern as `submitChatFastAPI`                                | Prompt execution thunk                                 |
| `lib/redux/prompt-execution/thunks/executeMessageThunk.ts`                   | 🔴      | Socket-based variant                                               | Used by older execution paths                          |
| `lib/redux/prompt-execution/thunks/executeBuiltinWithJsonExtractionThunk.ts` | ⚠️      | Builtin prompt thunk                                               | May be specialized enough to skip                      |
| `lib/redux/prompt-execution/thunks/executeBuiltinWithCodeExtractionThunk.ts` | ⚠️      | Builtin prompt thunk                                               | Same as above                                          |
| `lib/redux/socket-io/slices/socketResponseSlice.ts`                          | 🔴      | Stores `toolUpdates: ToolCallObject[]`                             | Needs to store `ToolCallBlock[]` or `CanonicalBlock[]` |
| `lib/redux/socket-io/selectors/socket-response-selectors.ts`                 | 🔴      | 12+ selectors reference `toolUpdates`                              | Must be updated in tandem with the slice               |
| `lib/redux/socket-io/socket.types.ts`                                        | 🔴      | Defines `ResponseState.toolUpdates: ToolCallObject[]`              | Type definition                                        |
| `lib/redux/features/aiChats/chatDisplaySlice.ts`                             | 🔴      | Defines its own `ChatMessage` interface                            | Separate from `ChatContext.ChatMessage`                |
| `lib/redux/thunks/promptSystemThunks.ts`                                     | 🔴      | Uses `submitChatFastAPI`                                           | Prompt system orchestration                            |


---

## 6. MARKDOWN & RENDERING COMPONENTS


| File                                                                   | Status    | Impact                                                        | Notes                                           |
| ---------------------------------------------------------------------- | --------- | ------------------------------------------------------------- | ----------------------------------------------- |
| `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx`    | 🔴 HIGH   | Accepts `toolUpdates?: any[]`, reads from Redux or props      | Central markdown renderer                       |
| `components/mardown-display/chat-markdown/StreamAwareChatMarkdown.tsx` | 🔴 HIGH   | Uses `convertStreamEventToToolCall` from `tool-event-engine`  | Streaming wrapper around `EnhancedChatMarkdown` |
| `components/mardown-display/chat-markdown/tool-event-engine.ts`        | 🔴 DELETE | Parallel stream normalizer — **replaced by `from-stream.ts`** | Must be removed entirely                        |
| `components/MarkdownStream.tsx`                                        | 🔴        | Uses `EnhancedChatMarkdown`                                   | Wrapper component                               |


---

## 7. TOOL RENDERERS & VISUALIZATION

All tool renderers currently expect `ToolCallObject[]` (the `mcp_input` / `mcp_output` array format).

### Core Infrastructure


| File                                                                                   | Status | Notes                                                         |
| -------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------- |
| `features/chat/components/response/tool-renderers/types.ts`                            | 🔴     | Defines `ToolRendererProps.toolUpdates: ToolCallObject[]`     |
| `features/chat/components/response/tool-renderers/registry.tsx`                        | 🔴     | Routes tool names → renderer components                       |
| `features/chat/components/response/assistant-message/stream/ToolCallVisualization.tsx` | 🔴     | Groups `ToolCallObject[]` by callId, renders inline + overlay |
| `features/chat/components/response/assistant-message/stream/ChatStreamDisplay.tsx`     | 🔴     | Wires `ToolCallVisualization` into stream display             |
| `features/chat/components/response/tool-updates/ToolUpdatesOverlay.tsx`                | 🔴     | Full-screen tool result overlay                               |
| `features/chat/components/response/tool-renderers/GenericRenderer.tsx`                 | 🔴     | Fallback renderer                                             |


### Built-in Tool Renderers (each expects `toolUpdates: ToolCallObject[]`)


| Tool Renderer         | File                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------- |
| News API              | `news-api/NewsInline.tsx`, `news-api/NewsOverlay.tsx`                                 |
| Core Web Search       | `core-web-search/CoreWebSearchInline.tsx`, `core-web-search/CoreWebSearchOverlay.tsx` |
| Web Research          | `web-research/WebResearchInline.tsx`, `web-research/WebResearchOverlay.tsx`           |
| Deep Research         | `deep-research/DeepResearchInline.tsx`, `deep-research/DeepResearchOverlay.tsx`       |
| User Lists            | `get-user-lists/UserListsInline.tsx`, `get-user-lists/UserListsOverlay.tsx`           |
| Brave Search          | `brave-search/BraveSearchInline.tsx`                                                  |
| SEO Meta Descriptions | `seo-meta-descriptions/SeoMetaDescriptionsInline.tsx`                                 |
| SEO Meta Tags         | `seo-meta-tags/SeoMetaTagsInline.tsx`, `seo-meta-tags/SeoMetaTagsOverlay.tsx`         |
| SEO Meta Titles       | `seo-meta-titles/SeoMetaTitlesInline.tsx`                                             |


### Dynamic Tool Renderer System


| File                              | Status | Notes                                                                     |
| --------------------------------- | ------ | ------------------------------------------------------------------------- |
| `dynamic/DynamicToolRenderer.tsx` | 🔴     | Compiles AI-generated tool UIs at runtime                                 |
| `dynamic/fetcher.ts`              | 🔴     | Fetches tool UI component definitions from backend                        |
| `dynamic/compiler.ts`             | 🔴     | Transpiles + sandboxes dynamic components                                 |
| `dynamic/types.ts`                | 🔴     | Defines `ToolUiComponentConfig` — references `ToolCallObject` in examples |


---

## 8. LEGACY UTILITIES (to be deleted after migration)


| File                                                            | Action | Notes                                                                             |
| --------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| `features/public-chat/utils/cx-content-converter.ts`            | DELETE | `processDbMessagesForDisplay` replaced by `from-db.ts`                            |
| `components/mardown-display/chat-markdown/tool-event-engine.ts` | DELETE | `buildStreamBlocks` / `convertStreamEventToToolCall` replaced by `from-stream.ts` |
| `lib/api/tool-call.types.ts`                                    | DELETE | `ToolCallObject` interface replaced by `ToolCallBlock`                            |
| `lib/chat-protocol/adapters.ts`                                 | DELETE | Once all consumers are updated                                                    |


---

## 9. ADMIN / INTERNAL TOOLS


| File                                                                       | Status | Notes                                                         |
| -------------------------------------------------------------------------- | ------ | ------------------------------------------------------------- |
| `components/admin/ToolUiComponentGenerator.tsx`                            | ⚠️     | Tool UI component generator — uses `StreamEvent` for testing  |
| `components/admin/hooks/useToolComponentAgent.ts`                          | ⚠️     | Pattern mirrors `useAgentChat` but specialized                |
| `components/admin/current-prompt.md`                                       | ⚠️     | Prompt template — references `toolUpdates` / `ToolCallObject` |
| `components/socket/streaming/ActiveEventsPanel.tsx`                        | ⚠️     | Debug panel — references `toolUpdates`                        |
| `components/socket/streaming/SocketStreamMonitor.tsx`                      | ⚠️     | Debug panel                                                   |
| `features/prompts/components/builder-new/PromptTestPanel.tsx`              | 🔴     | Test execution panel in prompt builder                        |
| `features/prompts/components/builder/PromptBuilder.tsx`                    | 🔴     | Uses `submitChatFastAPI`                                      |
| `features/prompts/components/actions/prompt-optimizers/*.tsx`              | 🔴     | System/full prompt optimizers use `submitChatFastAPI`         |
| `features/prompts/components/actions/prompt-generator/PromptGenerator.tsx` | 🔴     | Uses `submitChatFastAPI`                                      |
| `features/prompt-builtins/admin/GeneratePromptForBuiltinModal.tsx`         | ⚠️     | Admin tool                                                    |
| `components/admin/GeneratePromptForSystemModal.tsx`                        | ⚠️     | Admin tool                                                    |


---

## 10. OTHER SYSTEMS USING `StreamEvent` (but NOT chat-specific)

These use the same `StreamEvent` type but for non-chat purposes. They should **not** be
converted to `chat-protocol` — they have their own domain-specific processing.


| File                                               | Notes                          |
| -------------------------------------------------- | ------------------------------ |
| `features/scraper/services/scraperApiService.ts`   | Scraper-specific stream events |
| `features/scraper/hooks/usePublicScraperStream.ts` | Scraper streaming              |
| `features/research/hooks/useResearchStream.ts`     | Research-specific streaming    |
| `features/research/state/topicStore.ts`            | Research state management      |
| `features/research/context/ResearchContext.tsx`    | Research context               |


---

## Recommended Migration Order

### Phase 2A — Core Data Path (unblocks everything else)

1. `ChatContext.tsx` — Change `ChatMessage` to accept `CanonicalMessage[]`
2. `useAgentChat.ts` — Replace `tool-event-engine` imports with `@/lib/chat-protocol`
3. `useChatPersistence.ts` — Replace `processDbMessagesForDisplay` with `buildCanonicalMessages`
4. `MessageDisplay.tsx` — Replace `buildStreamBlocks` with canonical block rendering

### Phase 2B — Public Chat Routes

1. `app/(public)/p/chat/ChatLayoutShell.tsx` — Replace `processDbMessagesForDisplay`
2. `app/(authenticated)/chat/ChatLayoutClient.tsx` — Wire through `ChatContext`

### Phase 2C — Redux Pipeline

1. `socketResponseSlice.ts` — Change `toolUpdates: ToolCallObject[]` → `toolBlocks: ToolCallBlock[]`
2. `submitChatFastAPI.ts` — Use `from-stream.ts` instead of raw casting
3. `executeMessageFastAPIThunk.ts` — Same
4. `socket-response-selectors.ts` — Update all 12 selectors

### Phase 2D — Rendering Components

1. `EnhancedChatMarkdown.tsx` — Accept `CanonicalBlock[]` instead of `toolUpdates`
2. `StreamAwareChatMarkdown.tsx` — Use `buildStreamingState` instead of `tool-event-engine`
3. `ToolCallVisualization.tsx` — Accept `ToolCallBlock` instead of `ToolCallObject[]`
4. `ToolUpdatesOverlay.tsx` — Same

### Phase 2E — Tool Renderers

1. `types.ts` (tool-renderers) — Change `ToolRendererProps.toolUpdates` to `ToolCallBlock`
2. `registry.tsx` — Update dispatching
3. All 18 individual inline/overlay renderers — Update props
4. `dynamic/` system — Update the prompt template and compiler contract

### Phase 2F — Prompt Execution System

1. `usePromptExecution.ts` → `PromptTestPanel.tsx` → `PromptBuilder.tsx`
2. Prompt optimizers and generators
3. Prompt app renderers

### Phase 3 — Cleanup

1. Delete `cx-content-converter.ts`
2. Delete `tool-event-engine.ts`
3. Delete `lib/api/tool-call.types.ts`
4. Delete `lib/chat-protocol/adapters.ts`

---

## Summary Counts


| Category           | 🔴 Must Update | ⚠️ Evaluate | ✅ Done |
| ------------------ | -------------- | ----------- | ------ |
| Chat Routes        | 2              | 4           | 1      |
| Prompt Routes      | 4              | 0           | 0      |
| Prompt Apps        | 4              | 1           | 0      |
| Core Hooks         | 8              | 0           | 0      |
| Redux Layer        | 10             | 2           | 0      |
| Markdown/Rendering | 4              | 0           | 0      |
| Tool Renderers     | 24             | 0           | 0      |
| Legacy (delete)    | 4              | 0           | 0      |
| Admin/Internal     | 4              | 6           | 0      |
| **TOTAL**          | **64**         | **13**      | **1**  |


