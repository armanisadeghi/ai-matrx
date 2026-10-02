# Current API Callers

## FastAPI Backend Callers — Full Inventory

### Core Infrastructure (shared layer)

| File | Role |
|------|------|
| useApiAuth.ts | Provides auth headers (JWT / fingerprint) — consumed by everything below |
| useBackendApi.ts | Thin wrapper: URL selection + `get`/`post` with auth headers |
| useBackendClient.ts | React hook wrapping the `BackendClient` class |
| backend-client.ts | Class-based `BackendClient` — `get`, `post`, `stream` |
| endpoints.ts | Single source of truth for all FastAPI route paths + `BACKEND_URLS` |
| stream-parser.ts | NDJSON stream parser used by all streaming callers |

---

### AI / Chat / Agents

| File | Endpoints hit |
|------|---------------|
| useAgentChat.ts | `POST /api/ai/agents/{id}`, `POST /api/ai/conversations/{id}`, `DELETE /api/ai/cancel/{id}` |
| sendMessage.ts | `POST /api/ai/agents/{id}`, `POST /api/ai/agents-blocks/{id}`, `POST /api/ai/conversations/{id}`, cancel |
| executeMessageFastAPIThunk.ts | `POST /api/ai/agents/{id}`, cancel |
| submitChatFastAPI.ts | `POST /api/ai/chat` (direct fetch, despite being in socket-io folder) |
| submitAppletAgentThunk.ts | `POST /api/ai/agents/{id}` (direct fetch, despite being in socket-io folder) |
| useToolComponentAgent.ts | `POST /api/ai/agents/{id}` |

---

### Prompt Apps

| File | Endpoints hit |
|------|---------------|
| PromptAppRenderer.tsx | `POST /api/ai/agents/{id}` (authenticated) |
| PromptAppPublicRenderer.tsx | `POST /api/ai/agents/{id}` (public) |
| PromptAppPublicRendererFastAPI.tsx | `POST /api/ai/agents/{id}` (public, explicit FastAPI renderer) |
| PromptAppPublicRendererDirect.tsx | `POST /api/ai/agents/{id}` (direct, no Redux) |
| AppletFollowUpInput.tsx | `POST /api/ai/conversations/{id}` |

---

### Warm-up (Server Components)

| File | Endpoints hit |
|------|---------------|
| [app/(public)/p/chat/a/[id]/page.tsx](app/(public)/p/chat/a/%5Bid%5D/page.tsx) | `POST /api/ai/agents/{id}/warm` |
| [app/(public)/p/chat/c/[id]/page.tsx](app/(public)/p/chat/c/%5Bid%5D/page.tsx) | `POST /api/ai/conversations/{id}/warm` |
| app/(public)/p/chat/ChatLayoutShell.tsx/p/chat/ChatLayoutShell.tsx) | `POST /api/ai/agents-blocks/{id}/warm` |

---

### Block Processing

| File | Endpoints hit |
|------|---------------|
| MarkdownTester.tsx | `POST /api/utilities/block-processing/process`, `.../stream` |
| ContentBlocksManager.tsx | `POST /api/utilities/block-processing/process`, `.../stream` |
| StreamAwareChatMarkdown.tsx | `POST /api/utilities/block-processing/process/stream` |
| ContentTemplateManager.tsx | `POST /api/utilities/block-processing/process`, `.../stream` |

---

### Scraper

| File | Endpoints hit |
|------|---------------|
| scraperApiService.ts | `POST /api/scraper/*` (service layer) |
| usePublicScraperStream.ts | `POST /api/scraper/*` via scraperApiService |
| useScraperApi.ts | `POST /api/scraper/quick-scrape` |

---

### Research

| File | Endpoints hit |
|------|---------------|
| useResearchApi.ts | `GET/POST /api/research/*` via `useBackendApi` |
| useResearchStream.ts | Stream `/api/research/*` via `consumeStream` |
| research-endpoints.ts | Defines research endpoint paths |

---

### Prompts & Built-in Agents

| File | Endpoints hit |
|------|---------------|
| usePromptCategorizer.ts | `POST /api/builtin/agents/categorize` (sync) |
| AssetUploader.tsx | Posts to podcast asset endpoint via `useBackendApi` |

---

### Next.js API Routes (Proxies to FastAPI)

| File | Proxy target |
|------|--------------|
| route.ts | `POST /api/scraper/quick-scrape` on production backend |
| route.ts | PDF compress endpoint on production backend |
| [app/api/html/[id]/route.js](app/api/html/%5Bid%5D/route.js) | Hardcoded subdomain (`d88ooscwwggkcwswg8gks4s8.matrxserver.com:3000`) |
| route.ts | `MATRX_ORCHESTRATOR_URL` (separate Python service, `/sandboxes`) |
| [app/api/sandbox/[id]/route.ts](app/api/sandbox/%5Bid%5D/route.ts) | Orchestrator `/sandboxes/{id}` |
| [app/api/sandbox/[id]/exec/route.ts](app/api/sandbox/%5Bid%5D/exec/route.ts) | Orchestrator `/sandboxes/{id}/exec` |
| [app/api/sandbox/[id]/access/route.ts](app/api/sandbox/%5Bid%5D/access/route.ts) | Orchestrator `/sandboxes/{id}/access` |
| [app/api/admin/sandbox/[id]/route.ts](app/api/admin/sandbox/%5Bid%5D/route.ts) | Orchestrator `/sandboxes/{id}` (admin) |

---

### Test / Demo Clients (not production paths, but make real calls)

| File | What it calls |
|------|---------------|
| app/(authenticated)/tests/direct-chat-test/DirectChatClient.tsx/tests/direct-chat-test/DirectChatClient.tsx) | Direct AI endpoints |
| app/(public)/demos/api-tests/chat/ChatDemoClient.tsx/demos/api-tests/chat/ChatDemoClient.tsx) | `/api/ai/chat` |
| app/(public)/demos/api-tests/unified-chat/ChatTestClient.tsx/demos/api-tests/unified-chat/ChatTestClient.tsx) | AI chat endpoints |
| app/(public)/demos/api-tests/matrx-ai/agent-demo/AgentDemoClient.tsx/demos/api-tests/matrx-ai/agent-demo/AgentDemoClient.tsx) | Agent endpoints |
| app/(public)/demos/api-tests/matrx-ai/conversation-demo/ConversationDemoClient.tsx/demos/api-tests/matrx-ai/conversation-demo/ConversationDemoClient.tsx) | Conversation endpoints |
| app/(public)/demos/api-tests/matrx-ai/dynamic-api/DynamicApiClient.tsx/demos/api-tests/matrx-ai/dynamic-api/DynamicApiClient.tsx) | Any endpoint (configurable) |
| app/(public)/demos/api-tests/matrx-ai/chat-demo/ChatDemoClient.tsx/demos/api-tests/matrx-ai/chat-demo/ChatDemoClient.tsx) | `/api/ai/chat` |
| app/(public)/demos/api-tests/matrx-ai/tools-demo/ToolsDemoClient.tsx/demos/api-tests/matrx-ai/tools-demo/ToolsDemoClient.tsx) | `GET /api/tools/test/list`, `POST /api/tools/test/execute` |
| app/(public)/demos/api-tests/tool-testing/ToolTestingClient.tsx/demos/api-tests/tool-testing/ToolTestingClient.tsx) | Tools test endpoints |
| app/(public)/demos/api-tests/tool-testing/streaming-client.ts/demos/api-tests/tool-testing/streaming-client.ts) | `POST /api/tools/test/execute` |
| app/(public)/demos/api-tests/block-processing/BlockProcessingClient.tsx/demos/api-tests/block-processing/BlockProcessingClient.tsx) | Block processing endpoints |
| app/(public)/demos/scraper//demos/scraper/) (5 pages) | Via `usePublicScraperStream` |

---

**Key note on the two Socket.IO thunks:** submitChatFastAPI.ts and submitAppletAgentThunk.ts sit in the `socket-io` folder but make **direct `fetch()` calls** to FastAPI (not Socket.IO). They're part of this overhaul.

**Sandbox orchestrator** (`MATRX_ORCHESTRATOR_URL`) is a **separate Python service** from the main `matrxserver.com` backend — same pattern but different deployment.