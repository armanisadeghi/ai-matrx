# Unified Layer Specification

> **Key Insight:** Most of the unified layer already exists. This spec defines the small gap pieces that need to be built and how to compose the existing infrastructure.

---

## What Already Exists (Do NOT Rebuild)

| Piece | File | Status |
|---|---|---|
| NDJSON stream parser (async generator) | `lib/api/stream-parser.ts` → `parseNdjsonStream()` | ✅ Production-ready |
| NDJSON callback consumer | `lib/api/stream-parser.ts` → `consumeStream()` | ✅ Production-ready |
| Stream event types | `@ai-matrx/agents/generated/stream-events` | ✅ Auto-generated from Python |
| Endpoint constants | `lib/api/endpoints.ts` → `ENDPOINTS` | ✅ All endpoints defined |
| Backend URL resolution | `lib/api/endpoints.ts` → `BACKEND_URLS` | ✅ Production + localhost |
| Auth headers hook | `hooks/useApiAuth.ts` → `useApiAuth()` | ✅ JWT + fingerprint |
| Backend API hook | `hooks/useBackendApi.ts` → `useBackendApi()` | ✅ URL + auth + fetch helpers |
| Error parsing (HTTP) | `lib/api/errors.ts` → `parseHttpError()` | ✅ Handles all legacy formats |
| Error parsing (stream) | `lib/api/errors.ts` → `parseStreamError()` | ✅ Handles all event formats |
| Agent chat hook | `features/public-chat/hooks/useAgentChat.ts` | ✅ Full agent execution flow |
| Chat context | `features/public-chat/context/ChatContext.tsx` | ✅ useReducer state management |
| Request type aliases | `lib/api/types.ts` → `AgentExecuteRequestBody`, `UnifiedChatRequestBody` | ✅ From Python OpenAPI |

---

## What Needs to Be Built

### 1. `executeMessageFastAPI` Thunk (For Prompt Execution Redux Path)

The single most important piece. This replaces `createAndSubmitTask` inside the existing `executeMessage` thunk flow, writing results back to the same Redux slices for backward compatibility.

**Location:** `lib/redux/prompt-execution/thunks/executeMessageFastAPIThunk.ts`

**Behavior:**
1. Accept the same `chatConfig` that `executeMessage` builds (model_id, messages, settings)
2. Call `/api/ai/chat/unified` via `fetch()` with auth headers
3. Parse the NDJSON stream using `parseNdjsonStream`
4. For each event, dispatch to the same Redux actions that `submitTaskThunk` currently dispatches:
   - `chunk` → dispatch `appendTextChunk` to `socketResponseSlice`
   - `error` → dispatch `updateErrorResponse`
   - `tool_event` → dispatch `updateToolUpdateResponse`
   - `completion` → dispatch `markResponseEnd` + `completeTask`
   - `broker` → dispatch `brokerActions.setValue`
   - `end` → dispatch `markResponseEnd`

**Why this approach:** Zero changes to consuming components. Every selector, every UI component that reads from `socketResponse` continues to work. The only change is HOW data gets into the slice — socket listener vs fetch stream.

```typescript
// Pseudocode — exact implementation in 03-MIGRATION-PLAYBOOK.md
import { parseNdjsonStream } from '@/lib/api/stream-parser';
import { ENDPOINTS, BACKEND_URLS } from '@/lib/api/endpoints';

export const executeMessageFastAPI = createAsyncThunk(
  'promptExecution/executeMessageFastAPI',
  async ({ chatConfig, taskId, runId }, { dispatch, getState }) => {
    // 1. Get auth token from Redux state
    const token = selectAccessToken(getState());
    const BACKEND_URL = selectIsUsingLocalhost(getState()) 
      ? BACKEND_URLS.localhost 
      : BACKEND_URLS.production;
    
    // 2. Initialize response slot (same as socket path)
    dispatch(addResponse({ listenerId: taskId }));
    dispatch(setTaskListenerIds({ taskId, listenerIds: [taskId] }));
    dispatch(setTaskStreaming({ taskId, isStreaming: true }));
    
    // 3. Make FastAPI request
    const response = await fetch(`${BACKEND_URL}${ENDPOINTS.ai.chatUnified}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: chatConfig.messages,
        ai_model_id: chatConfig.model_id,
        stream: true,
        ...chatConfig,
      }),
    });
    
    // 4. Stream events and dispatch to SAME Redux slices
    const { events, requestId } = parseNdjsonStream(response);
    
    for await (const event of events) {
      switch (event.event) {
        case 'chunk':
          dispatch(appendTextChunk({
            listenerId: taskId,
            chunk: (event.data as ChunkPayload).text,
          }));
          break;
        case 'error':
          dispatch(updateErrorResponse({
            listenerId: taskId,
            data: event.data,
          }));
          break;
        case 'tool_event':
          dispatch(updateToolUpdateResponse({
            listenerId: taskId,
            data: event.data,
          }));
          break;
        case 'end':
        case 'completion':
          dispatch(markResponseEnd({ listenerId: taskId }));
          dispatch(completeTask({ taskId }));
          break;
        case 'broker':
          const brokerData = event.data as BrokerPayload;
          dispatch(brokerActions.setValue({
            brokerId: brokerData.broker_id,
            value: brokerData.value,
          }));
          break;
      }
    }
    
    return taskId;
  }
);
```

### 2. `useScraperApi` Hook (For Scraper Route)

Replaces `useScraperSocket`. Calls FastAPI scraper endpoints directly.

**Location:** `features/scraper/hooks/useScraperApi.ts`

**Behavior:**
- Provides `quickScrape(url)`, `search(keywords)`, `searchAndScrape(keywords)` methods
- Uses `useBackendApi` for URL + auth
- For streaming endpoints: use `parseNdjsonStream`
- For JSON endpoints: use `response.json()`
- Returns `{ data, isLoading, error }` pattern

### 3. Prompt App Authenticated Renderer Update

Not a new file — update `features/prompt-apps/components/PromptAppRenderer.tsx` to use the FastAPI pattern from `PromptAppPublicRendererFastAPI.tsx`.

**Approach:** Copy the execution logic from the FastAPI renderer. The authenticated version already has access to `useApiAuth` which provides JWT headers. The key difference is that authenticated users don't need fingerprint/guest limit logic.

---

## Architecture: Two Execution Paths

After migration, the codebase will have two clean execution paths:

### Path 1: Redux-Integrated (Authenticated Routes)

For routes like `/ai/prompts` where the entire UI is built on Redux selectors:

```
Component 
  → dispatch(executeMessage({ runId, userInput }))
    → executeMessageThunk builds chatConfig
    → USE_FASTAPI flag:
        → true:  executeMessageFastAPI (fetch + parseNdjsonStream → Redux dispatches)
        → false: createAndSubmitTask (socket.io — fallback during migration)
    → Same Redux selectors read the results
  → Component renders from selectors (unchanged)
```

### Path 2: Context/Local State (Public & New Routes)

For routes like `/p/chat`, `/p/[slug]`, scraper, canvas:

```
Component 
  → useAgentChat.sendMessage() or direct fetch()
    → fetch(BACKEND_URL + endpoint, { headers: useApiAuth().getHeaders() })
    → parseNdjsonStream(response)
    → Process events → update local state / context
  → Component renders from local state
```

---

## Endpoint Contracts (Verified)

### Agent Execute
```
POST {BACKEND_URL}/api/ai/agent/execute
Headers: Authorization: Bearer {JWT}, Content-Type: application/json
Body: {
  prompt_id: string,          // Required
  conversation_id: string,    // Required
  user_input: string | ContentItem[],
  variables?: Record<string, unknown>,
  config_overrides?: Record<string, unknown>,
  stream: boolean,            // true for streaming
  debug: boolean,
  is_builtin: boolean,
  is_new_conversation: boolean,
}
Response: NDJSON stream (StreamEvent per line)
```

### Unified Chat
```
POST {BACKEND_URL}/api/ai/chat/unified
Headers: Authorization: Bearer {JWT}, Content-Type: application/json
Body: {
  messages: Array<{ role: string, content: string }>,
  ai_model_id: string,
  stream: boolean,
  debug?: boolean,
  is_new_conversation?: boolean,
  // Plus any model config (temperature, max_output_tokens, tools, etc.)
}
Response: NDJSON stream (StreamEvent per line)
```

### Tool Test Execute
```
POST {BACKEND_URL}/api/tools/test/execute
Headers: Authorization: Bearer {JWT}, Content-Type: application/json
Body: {
  tool_name: string,
  arguments: Record<string, unknown>,
  conversation_id?: string,
  organization_id?: string,
  project_id?: string,
  task_id?: string,
}
Response: NDJSON stream (StreamEvent per line)
```

### Scraper Quick Scrape
```
POST {BACKEND_URL}/api/scraper/quick-scrape
Headers: Authorization: Bearer {JWT}, Content-Type: application/json
Body: { url: string, ... }
Response: JSON or NDJSON stream (verify backend)
```

---

## Stream Parsing Pattern (Copy This)

This is the canonical pattern for consuming a FastAPI NDJSON stream. Copy it verbatim:

```typescript
import { parseNdjsonStream } from '@/lib/api/stream-parser';
import type { StreamEvent, ChunkPayload, ErrorPayload } from '@/@ai-matrx/agents/generated/stream-events';

// Make the request
const response = await fetch(url, {
  method: 'POST',
  headers: getHeaders(), // from useApiAuth
  body: JSON.stringify(requestBody),
  signal: abortController.signal,
});

if (!response.ok) {
  // Use parseHttpError from lib/api/errors.ts for structured errors
  throw await parseHttpError(response);
}

// Parse the stream
const { events, requestId } = parseNdjsonStream(response, abortController.signal);

let accumulatedText = '';

for await (const event of events) {
  switch (event.event) {
    case 'chunk': {
      const { text } = event.data as unknown as ChunkPayload;
      accumulatedText += text;
      // Update your state with accumulatedText
      break;
    }
    case 'error': {
      const { user_message, message } = event.data as unknown as ErrorPayload;
      // Show error to user
      break;
    }
    case 'tool_event':
      // Forward to MarkdownStream or tool visualization
      break;
    case 'completion':
      // Capture usage stats if needed
      break;
    case 'end':
      // Stream complete
      break;
  }
}
```

---

## What the Unified Layer Does NOT Do

- Does NOT manage prompt configuration — stays in the route or data-fetching layer
- Does NOT handle auth refresh — `useApiAuth` handles that
- Does NOT retry failed requests — caller's responsibility
- Does NOT buffer or transform chunks — raw pass-through
- Does NOT manage conversation state — consumers own their state (Redux or Context)
