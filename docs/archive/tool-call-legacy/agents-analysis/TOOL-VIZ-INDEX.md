# Tool call visualization & parsers — file index

**Canonical UI:** [`ToolCallVisualization.tsx`](ToolCallVisualization.tsx) consumes `ToolCallObject[]`, uses [`lib/tool-renderers`](../../lib/tool-renderers/README.md), and [`features/chat/components/response/tool-updates`](../../features/chat/components/response/tool-updates/ToolUpdatesOverlay.tsx).

**Shim:** [`features/chat/components/response/assistant-message/stream/ToolCallVisualization.tsx`](../../features/chat/components/response/assistant-message/stream/ToolCallVisualization.tsx) re-exports the canonical component.

---

## Stream / protocol parsers (`ToolCallBlock`, legacy conversion)

| File | Role |
|------|------|
| [`lib/chat-protocol/index.ts`](../../lib/chat-protocol/index.ts) | Public API exports |
| [`lib/chat-protocol/types.ts`](../../lib/chat-protocol/types.ts) | `ToolCallBlock`, `CanonicalBlock` |
| [`lib/chat-protocol/from-stream.ts`](../../lib/chat-protocol/from-stream.ts) | `buildCanonicalBlocks` |
| [`lib/chat-protocol/from-db.ts`](../../lib/chat-protocol/from-db.ts) | DB → canonical blocks |
| [`lib/chat-protocol/adapters.ts`](../../lib/chat-protocol/adapters.ts) | `toolCallBlockToLegacy` |
| [`lib/api/tool-call.types.ts`](../../lib/api/tool-call.types.ts) | `ToolCallObject`, phases, renderer contract |

---

## DB / CX message converters → `toolUpdates`

| File | Role |
|------|------|
| [`packages/chat/src/cx-chat/utils/cx-content-converter.ts`](../../packages/chat/src/cx-chat/utils/cx-content-converter.ts) | CX tables → display + `toolUpdates` |
| [`features/public-chat/utils/cx-content-converter.ts`](../../features/public-chat/utils/cx-content-converter.ts) | Same pattern, public-chat |

---

## Renderer registry (canonical): `lib/tool-renderers`

Core: [`index.ts`](../../lib/tool-renderers/index.ts) · [`registry.tsx`](../../lib/tool-renderers/registry.tsx) · [`types.ts`](../../lib/tool-renderers/types.ts) · [`GenericRenderer.tsx`](../../lib/tool-renderers/GenericRenderer.tsx)

**Dynamic MCP:** [`dynamic/DynamicToolRenderer.tsx`](../../lib/tool-renderers/dynamic/DynamicToolRenderer.tsx) · [`dynamic/compiler.ts`](../../lib/tool-renderers/dynamic/compiler.ts) · [`dynamic/fetcher.ts`](../../lib/tool-renderers/dynamic/fetcher.ts) · [`dynamic/cache.ts`](../../lib/tool-renderers/dynamic/cache.ts) · [`dynamic/types.ts`](../../lib/tool-renderers/dynamic/types.ts) · [`dynamic/allowed-imports.ts`](../../lib/tool-renderers/dynamic/allowed-imports.ts) · [`dynamic/incident-reporter.ts`](../../lib/tool-renderers/dynamic/incident-reporter.ts) · [`dynamic/DynamicToolErrorBoundary.tsx`](../../lib/tool-renderers/dynamic/DynamicToolErrorBoundary.tsx) · [`dynamic/index.ts`](../../lib/tool-renderers/dynamic/index.ts)

**Per-tool packages (every file):**

- **brave-search:** [`BraveSearchInline.tsx`](../../lib/tool-renderers/brave-search/BraveSearchInline.tsx) · [`index.ts`](../../lib/tool-renderers/brave-search/index.ts)
- **news-api:** [`NewsInline.tsx`](../../lib/tool-renderers/news-api/NewsInline.tsx) · [`NewsOverlay.tsx`](../../lib/tool-renderers/news-api/NewsOverlay.tsx) · [`index.ts`](../../lib/tool-renderers/news-api/index.ts)
- **web-research:** [`WebResearchInline.tsx`](../../lib/tool-renderers/web-research/WebResearchInline.tsx) · [`WebResearchOverlay.tsx`](../../lib/tool-renderers/web-research/WebResearchOverlay.tsx) · [`index.ts`](../../lib/tool-renderers/web-research/index.ts)
- **core-web-search:** [`CoreWebSearchInline.tsx`](../../lib/tool-renderers/core-web-search/CoreWebSearchInline.tsx) · [`CoreWebSearchOverlay.tsx`](../../lib/tool-renderers/core-web-search/CoreWebSearchOverlay.tsx) · [`index.ts`](../../lib/tool-renderers/core-web-search/index.ts)
- **deep-research:** [`DeepResearchInline.tsx`](../../lib/tool-renderers/deep-research/DeepResearchInline.tsx) · [`DeepResearchOverlay.tsx`](../../lib/tool-renderers/deep-research/DeepResearchOverlay.tsx) · [`index.ts`](../../lib/tool-renderers/deep-research/index.ts)
- **get-user-lists:** [`UserListsInline.tsx`](../../lib/tool-renderers/get-user-lists/UserListsInline.tsx) · [`UserListsOverlay.tsx`](../../lib/tool-renderers/get-user-lists/UserListsOverlay.tsx) · [`index.ts`](../../lib/tool-renderers/get-user-lists/index.ts)
- **seo-meta-tags:** [`SeoMetaTagsInline.tsx`](../../lib/tool-renderers/seo-meta-tags/SeoMetaTagsInline.tsx) · [`SeoMetaTagsOverlay.tsx`](../../lib/tool-renderers/seo-meta-tags/SeoMetaTagsOverlay.tsx) · [`index.ts`](../../lib/tool-renderers/seo-meta-tags/index.ts)
- **seo-meta-titles:** [`SeoMetaTitlesInline.tsx`](../../lib/tool-renderers/seo-meta-titles/SeoMetaTitlesInline.tsx) · [`index.ts`](../../lib/tool-renderers/seo-meta-titles/index.ts)
- **seo-meta-descriptions:** [`SeoMetaDescriptionsInline.tsx`](../../lib/tool-renderers/seo-meta-descriptions/SeoMetaDescriptionsInline.tsx) · [`index.ts`](../../lib/tool-renderers/seo-meta-descriptions/index.ts)

Docs: [`lib/tool-renderers/README.md`](../../lib/tool-renderers/README.md)

---

## Legacy import path (`features/chat/.../tool-renderers`)

Same layout as `lib/tool-renderers`; **prefer `@/lib/tool-renderers`.** [`index.ts`](../../features/chat/components/response/tool-renderers/index.ts) · [`registry.tsx`](../../features/chat/components/response/tool-renderers/registry.tsx) · [`types.ts`](../../features/chat/components/response/tool-renderers/types.ts) · [`GenericRenderer.tsx`](../../features/chat/components/response/tool-renderers/GenericRenderer.tsx) · [`README.md`](../../features/chat/components/response/tool-renderers/README.md) · [`dynamic/`](../../features/chat/components/response/tool-renderers/dynamic/) (same filenames as lib) · [`brave-search/`](../../features/chat/components/response/tool-renderers/brave-search/) · [`news-api/`](../../features/chat/components/response/tool-renderers/news-api/) · [`web-research/`](../../features/chat/components/response/tool-renderers/web-research/) · [`core-web-search/`](../../features/chat/components/response/tool-renderers/core-web-search/) · [`deep-research/`](../../features/chat/components/response/tool-renderers/deep-research/) · [`get-user-lists/`](../../features/chat/components/response/tool-renderers/get-user-lists/) · [`seo-meta-tags/`](../../features/chat/components/response/tool-renderers/seo-meta-tags/) · [`seo-meta-titles/`](../../features/chat/components/response/tool-renderers/seo-meta-titles/) · [`seo-meta-descriptions/`](../../features/chat/components/response/tool-renderers/seo-meta-descriptions/)

---

## Fullscreen overlay chrome

| File | Role |
|------|------|
| [`ToolUpdatesOverlay.tsx`](../../features/chat/components/response/tool-updates/ToolUpdatesOverlay.tsx) | Fullscreen tool detail |
| [`stepDataRegistry.tsx`](../../features/chat/components/response/tool-updates/stepDataRegistry.tsx) | Step-data views |
| [`index.ts`](../../features/chat/components/response/tool-updates/index.ts) | Barrel |

---

## Alternate adapter: agent execution → same UI

| File | Role |
|------|------|
| [`features/agents/components/run/AgentToolDisplay.tsx`](../agents/components/run/AgentToolDisplay.tsx) | `ToolLifecycleEntry[]` → `ToolCallObject[]` → `ToolCallVisualization` |
| [`packages/chat/src/agents/redux/execution-system/active-requests/active-requests.selectors.ts`](../agents/redux/execution-system/active-requests/active-requests.selectors.ts) | Tool lifecycle state |
| [`packages/chat/src/agents/types/request.types.ts`](../agents/types/request.types.ts) | `ToolLifecycleEntry` |

---

## Major consumers (wiring)

- [`packages/chat/src/cx-conversation/AssistantMessage.tsx`](AssistantMessage.tsx)
- [`features/chat/components/response/assistant-message/stream/ChatStreamDisplay.tsx`](../../features/chat/components/response/assistant-message/stream/ChatStreamDisplay.tsx)
- [`components/mardown-display/chat-markdown/StreamAwareChatMarkdown.tsx`](../../components/mardown-display/chat-markdown/StreamAwareChatMarkdown.tsx)
- [`components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx`](../../components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx)
- [`features/public-chat/components/MessageDisplay.tsx`](../../features/public-chat/components/MessageDisplay.tsx)
- [`app/(public)/demos/api-tests/tool-testing/components/ToolRendererPreview.tsx`](../../app/(public)/demos/api-tests/tool-testing/components/ToolRendererPreview.tsx)
- [`components/admin/mcp-tools/ToolComponentPreview.tsx`](../../components/admin/mcp-tools/ToolComponentPreview.tsx)
- [`components/admin/ToolUiComponentGenerator.tsx`](../../components/admin/ToolUiComponentGenerator.tsx)

---

## Raw `tool_event` → state (upstream of `buildCanonicalBlocks`)

- [`lib/redux/socket-io/selectors/socket-response-selectors.ts`](../../lib/redux/socket-io/selectors/socket-response-selectors.ts)
- [`lib/redux/socket-io/thunks/submitChatFastAPI.ts`](../../lib/redux/socket-io/thunks/submitChatFastAPI.ts)
- [`lib/redux/prompt-execution/thunks/executeMessageFastAPIThunk.ts`](../../lib/redux/prompt-execution/thunks/executeMessageFastAPIThunk.ts)
- [`features/cx-conversation/redux/thunks/sendMessage.ts`](redux/thunks/sendMessage.ts)

---

## Related shim / docs

- [`features/cx-conversation/StreamingContentBlocks.tsx`](StreamingContentBlocks.tsx) — forwards to `MarkdownStream` (tool interleaving in markdown layer)
- [`docs/other/markdown-stream-python-migration-parsers-audit.md`](../../docs/other/markdown-stream-python-migration-parsers-audit.md) · [`components/mardown-display/chat-markdown/MARKDOWN_PARSING.md`](../../components/mardown-display/chat-markdown/MARKDOWN_PARSING.md)
