
Here is a **gap analysis file list**: everything that ties into the current stream contract (`status_update`, old `completion` shape, undiscriminated `data` / `conversation_id` events, `StreamEvent` helpers, or Redux `activeRequests` stream fields) and therefore needs to move to **Streaming Events V2** (`phase`, `info`, `init`/`completion` pairing, typed `data`, etc.). Paths are **deduplicated**; no per-file detail.

### Generated types (single source of truth)
- `types/python-generated/stream-events.ts` (replace/regenerate to match V2; guide references `aidream/api/generated/stream-events.ts` — align import path or re-export as you standardize)

### Redux — agent execution system
- `features/agents/redux/execution-system/thunks/process-stream.ts`
- `features/agents/redux/execution-system/thunks/execute-instance.thunk.ts`
- `features/agents/redux/execution-system/thunks/execute-chat-instance.thunk.ts`
- `features/agents/redux/execution-system/thunks/create-instance.thunk.ts`
- `features/agents/redux/execution-system/active-requests/active-requests.slice.ts`
- `features/agents/redux/execution-system/active-requests/active-requests.selectors.ts`
- `features/agents/redux/execution-system/selectors/aggregate.selectors.ts`
- `features/agents/redux/execution-system/instance-conversation-history/instance-conversation-history.slice.ts` (turn payload uses `CompletionStats` from stream completion path)

### Agent feature types
- `features/agents/types/request.types.ts`
- `features/agents/types/instance.types.ts`
- `features/agents/types/agent-api-types.ts`

### Agent UI (debug + run; depends on selectors / raw event shapes)
- `features/agents/components/debug/StreamDebugPanel.tsx`
- `features/agents/components/debug/StreamDebugOverlay.tsx`
- `features/agents/components/run/AgentStreamingMessage.tsx`
- `features/agents/components/run/AgentConversationDisplay.tsx`
- `features/agents/components/run/AgentStatusIndicator.tsx`
- `features/agents/components/run-controls/CreatorRunPanel.tsx`

### Shared HTTP / streaming utilities
- `lib/api/stream-parser.ts`
- `lib/api/call-api.ts`
- `lib/api/types.ts`
- `lib/api/index.ts`

### Chat protocol & markdown streaming
- `lib/chat-protocol/from-stream.ts`
- `components/mardown-display/chat-markdown/types.ts`
- `components/mardown-display/chat-markdown/index.ts`
- `components/mardown-display/chat-markdown/StreamAwareChatMarkdown.tsx`
- `components/MarkdownStream.tsx`

### CX conversation / chat types
- `features/cx-conversation/redux/thunks/sendMessage.ts`
- `features/cx-conversation/redux/types.ts`
- `features/cx-conversation/redux/slice.ts`
- `features/cx-conversation/redux/selectors.ts`
- `features/cx-conversation/StreamingContentBlocks.tsx`
- `features/cx-chat/types/conversation.ts`

### Public chat, shared conversation types, prompt apps
- `features/conversation/types/index.ts`
- `features/public-chat/components/MessageDisplay.tsx`
- `features/public-chat/components/ChatContainer.tsx`
- `features/public-chat/hooks/DEPRECATED-useAgentChat.ts`
- `features/public-chat/context/DEPRECATED-ChatContext.tsx`
- `features/prompt-apps/components/PromptAppRenderer.tsx`
- `features/prompt-apps/components/PromptAppPublicRendererFastAPI.tsx`
- `features/prompt-apps/components/PromptAppPublicRendererDirect.tsx`
- `features/prompt-apps/sample-code/templates/index.ts`
- `features/chat/components/response/assistant-message/stream/ChatStreamDisplay.tsx`

### Other Redux thunks / socket layers using the same stream types
- `lib/redux/prompt-execution/thunks/executeMessageFastAPIThunk.ts`
- `lib/redux/socket-io/thunks/submitChatFastAPI.ts`
- `lib/redux/socket-io/thunks/submitAppletAgentThunk.ts`
- `lib/redux/socket-io/socket.types.ts`
- `lib/redux/socket-io/slices/socketResponseSlice.ts`
- `lib/redux/socket-io/selectors/socket-response-selectors.ts`

### Research (uses `stream-parser` + status/completion callbacks)
- `features/research/hooks/useResearchStream.ts`
- `features/research/types.ts`
- `features/research/state/topicStore.ts`
- `features/research/context/ResearchContext.tsx`
- `features/research/components/shared/StreamDebugOverlay.tsx`

### Scraper (explicit `status_update` handling / stream event union)
- `features/scraper/hooks/useScraperApi.ts`
- `features/scraper/types/scraper-api.ts`

### Applets
- `features/applet/runner/response/AppletFollowUpInput.tsx`

### Demos & admin tooling (parse or display `StreamEvent[]` / tool streams)
- `app/(public)/demos/api-tests/tool-testing/streaming-client.ts`
- `app/(public)/demos/api-tests/tool-testing/ToolTestingClient.tsx`
- `app/(public)/demos/api-tests/tool-testing/types.ts`
- `app/(public)/demos/api-tests/tool-testing/hooks/useSaveSample.ts`
- `app/(public)/demos/api-tests/tool-testing/components/StreamEventTimeline.tsx`
- `app/(public)/demos/api-tests/tool-testing/components/ResultsPanel.tsx`
- `app/(public)/demos/api-tests/unified-chat/ChatTestClient.tsx`
- `app/(public)/demos/api-tests/block-processing/BlockProcessingClient.tsx`
- `app/(public)/demos/api-tests/matrx-ai/chat-demo/ChatDemoClient.tsx`
- `app/(public)/demos/api-tests/matrx-ai/agent-demo/AgentDemoClient.tsx`
- `app/(public)/demos/api-tests/matrx-ai/conversation-demo/ConversationDemoClient.tsx`
- `components/admin/MarkdownTester.tsx`
- `components/admin/ContentBlocksManager.tsx`
- `components/admin/ToolUiComponentGenerator.tsx`
- `components/admin/mcp-tools/ToolComponentPreview.tsx`
- `components/admin/hooks/useToolComponentAgent.ts`
- `features/content-templates/admin/ContentTemplateManager.tsx`

### Repo docs / skills (not runtime code, but stale vs V2)
- `features/agents/docs/STREAM_STATUS_LIFECYCLE.md`
- `.claude/skills/agent-execution-redux/SKILL.md`

**Reference spec (no code change required unless you keep it in sync):** `features/agents/redux/execution-system/thunks/record_reservation_frontend_guide.md`

That set is the full blast radius for transitioning off V1 wire events and old TypeScript mirrors of them; starting in `process-stream` + `active-requests` will drive most downstream edits.