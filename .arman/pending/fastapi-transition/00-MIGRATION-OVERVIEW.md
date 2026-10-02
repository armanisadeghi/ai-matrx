# Socket.io → FastAPI Migration: Master Overview

> **Status:** In Progress  
> **Deadline:** ~2 weeks until Socket.io is fully deprecated  
> **Last Updated:** 2026-02-19 (code-verified, not speculative)

---

## Start Here

This is the **single source of truth** for the entire migration. All other docs in this directory are subordinate.

| Document | Purpose |
|---|---|
| **00-MIGRATION-OVERVIEW.md** (this file) | Master plan, architecture, what's already done |
| [01-ROUTE-INVENTORY.md](./01-ROUTE-INVENTORY.md) | Per-route audit with verified facts |
| [02-UNIFIED-LAYER-SPEC.md](./02-UNIFIED-LAYER-SPEC.md) | Spec for the unified FastAPI layer — what to build |
| [03-MIGRATION-PLAYBOOK.md](./03-MIGRATION-PLAYBOOK.md) | Step-by-step execution order and checklists |

---

## The Problem

The app dispatches AI requests (prompts, builtins, agents, chat) through two transport layers:

1. **Socket.io** (deprecated) — Complex Redux infrastructure: 3 slices, middleware, connection manager, task thunks
2. **FastAPI HTTP streaming** (target) — Lean NDJSON over `fetch()`, battle-tested in production

Socket.io must be fully removed within 2 weeks. The FastAPI path is already proven.

---

## The Mental Model

```
IF the request calls a Prompt or Builtin  →  AGENT endpoint (/api/ai/agent/execute)
IF the request packages raw messages       →  CHAT endpoint  (/api/ai/chat/unified)
```

There is no meaningful difference. Both return NDJSON streaming responses with the same event types.

---

## What Already Works (Do NOT Rebuild)

These pieces are battle-tested and production-ready. All new migration work should use them:

### FastAPI Endpoints (Python backend)
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/ai/chat/unified` | POST | Direct chat with messages array |
| `/api/ai/agent/execute` | POST | Execute a prompt/builtin via agent |
| `/api/ai/agent/warm` | POST | Pre-warm agent cache (non-critical) |
| `/api/ai/cancel/{request_id}` | POST | Cancel a running stream |
| `/api/tools/test/execute` | POST | Execute a tool with streaming |
| `/api/scraper/*` | POST | Scraper operations (already FastAPI) |
| `/api/research/*` | Various | Research pipeline (already FastAPI) |

### Frontend Infrastructure (Already Built)
| File | Purpose | Use It |
|---|---|---|
| `lib/api/stream-parser.ts` | NDJSON async generator + callback consumer | **YES — this IS the stream handler** |
| `lib/api/endpoints.ts` | All endpoint paths as constants | **YES — never hardcode paths** |
| `lib/api/types.ts` | Re-exports auto-generated request/response types | **YES** |
| `lib/api/errors.ts` | `BackendApiError` class, HTTP + stream error parsing | **YES** |
| `@ai-matrx/agents/generated/stream-events` | Auto-generated `StreamEvent` types with type guards | **YES** |
| `hooks/useApiAuth.ts` | Auth headers (JWT or fingerprint) | **YES** |
| `hooks/useBackendApi.ts` | Backend URL + auth + fetch helpers | **YES** |

### Reference Implementations (Already Migrated)
| File | Pattern | Notes |
|---|---|---|
| `features/public-chat/hooks/useAgentChat.ts` | Agent streaming with context | **Primary reference for agent calls** |
| `features/public-chat/context/ChatContext.tsx` | Chat state via `useReducer` | **Reference for non-Redux state** |
| `features/prompt-apps/components/PromptAppPublicRendererFastAPI.tsx` | Prompt app via agent API | **Reference for prompt app execution** |
| `app/(public)/demos/api-tests/unified-chat/ChatTestClient.tsx` | Direct chat streaming | **Reference for raw chat calls** |
| `app/(public)/demos/api-tests/tool-testing/streaming-client.ts` | Tool execution streaming | **Reference for tool calls** |

---

## What We're Replacing (Socket.io Stack)

### Infrastructure to Bypass (Not Delete Yet)
| File | What It Does | Status |
|---|---|---|
| `lib/redux/socket-io/connection/socketConnectionManager.ts` | Singleton managing socket connections | Keep for deferred routes |
| `lib/redux/socket-io/connection/socketMiddleware.ts` | Redux middleware for socket lifecycle | Keep for deferred routes |
| `lib/redux/socket-io/connection/SocketInitializer.tsx` | Initialized in authenticated layout | Keep — serves deferred routes |
| `lib/redux/socket-io/thunks/submitTaskThunk.ts` | `createAndSubmitTask` — core socket execution | **Replace with FastAPI calls** |

### Redux Slices (Socket-Dependent)
| Slice | File | What It Does |
|---|---|---|
| `socketConnections` | `lib/redux/socket-io/slices/socketConnectionsSlice.ts` | Connection registry, status, auth |
| `socketTasks` | `lib/redux/socket-io/slices/socketTasksSlice.ts` | Task tracking, validation, listener IDs |
| `socketResponse` | `lib/redux/socket-io/slices/socketResponseSlice.ts` | Streaming text, data, errors, tool updates |

### Redux Slices (Indirectly Socket-Dependent)
| Slice | File | Socket Dependency |
|---|---|---|
| `promptExecution` | `lib/redux/prompt-execution/slice.ts` | Thunks call `createAndSubmitTask`; selectors read from `socketResponse` |
| `promptRunner` | `lib/redux/slices/promptRunnerSlice.ts` | Tracks `taskId` which maps to socket tasks |
| `broker` | `lib/redux/brokerSlice/slice.ts` | Receives broker updates from socket response |
| `conversation` | `lib/redux/features/aiChats/conversationSlice.ts` | Thunks use socket task submission |
| `messages` | `lib/redux/features/aiChats/messagesSlice.ts` | Populated from socket responses |

### Critical Thunk Chain (What executeMessage Does)
```
executeMessage (prompt-execution/thunks/executeMessageThunk.ts)
  → processMessagesForExecution (builds chat config)
  → createAndSubmitTask (socket-io/thunks/submitTaskThunk.ts)
    → socket.emit('chat_service', { taskName: 'direct_chat', taskData })
    → Sets up socket listeners for response events
    → Populates socketResponse slice with chunks
  → Selectors read from socketResponse for streaming display
```

**Migration target:** Replace `createAndSubmitTask` with a FastAPI fetch + `parseNdjsonStream`, then write results back to the same Redux slices (or use local state).

---

## Stream Event Protocol (Shared by All Endpoints)

All FastAPI streaming endpoints return NDJSON (one JSON object per line). Event types:

| Event | Payload Type | Description |
|---|---|---|
| `chunk` | `{ text: string }` | Incremental text content |
| `status_update` | `{ status, system_message?, user_message?, metadata? }` | Progress updates |
| `tool_event` | `{ event, call_id, tool_name, message?, data? }` | Tool lifecycle events |
| `completion` | `{ status, output?, total_usage?, timing_stats? }` | Final completion with stats |
| `data` | `{}` | Arbitrary data payload |
| `error` | `{ error_type, message, user_message?, code? }` | Error event |
| `broker` | `{ broker_id, value, source? }` | Broker value updates |
| `heartbeat` | `{ timestamp? }` | Connection keepalive |
| `end` | `{ reason? }` | Stream termination |

---

## Routes: Migration Status at a Glance

### Already Done (Use as References)
| Route | Transport | Notes |
|---|---|---|
| `app/(public)/p/chat` | FastAPI Agent API | Primary reference |
| `app/(public)/p/fast/[slug]` | FastAPI Agent API | Parallel fast path |
| `app/(public)/p/fast-test/[slug]` | FastAPI Agent API | Test harness |
| `app/(public)/p/research` | FastAPI via `useBackendApi` | Research pipeline |

### Must Migrate Now
| Route | Current Transport | Complexity | Details in 01-ROUTE-INVENTORY.md |
|---|---|---|---|
| `app/(authenticated)/ai/prompts` | Socket.io (Redux) | HIGH | `executeMessage` → `createAndSubmitTask` |
| `app/(authenticated)/prompt-apps` | Socket.io (Redux, auth path) | HIGH | Authenticated renderer uses Redux socket |
| `app/(authenticated)/scraper` | Socket.io (Redux) | MEDIUM | `useScraperSocket` → `createAndSubmitTask` |
| `app/(public)/p/[slug]` | Socket.io (direct) | LOW | Parallel path exists at `/p/fast/[slug]` |
| `app/(public)/canvas` | Socket.io (Redux) | MEDIUM | Canvas AI generation calls |

### No Migration Needed
| Route | Reason |
|---|---|
| `app/(authenticated)/ai/runs` | Supabase only — no socket.io |
| `app/(authenticated)/notes` | Supabase only — no socket.io |
| `app/(public)/p` (listing) | Server-side data only |

### Deferred (Keep on Socket.io for Now)
| Route | Reason |
|---|---|
| `app/(authenticated)/ai/cockpit` | Lower priority, complex |
| `app/(authenticated)/ai/recipes` | Lower priority |
| `app/(authenticated)/applets` | Lower priority |
| `app/(authenticated)/apps` | Lower priority |
| `app/(authenticated)/chat` | Separate migration track |

---

## Guiding Constraints

1. **Lazy load everything.** No submission logic loads at module level. Use `React.lazy()` for page shells, dynamic `import()` for hooks/services.
2. **Do not buffer streams.** Pass chunks through immediately. 2,000–10,000 chunks per 30s stream — any batching creates lag.
3. **Non-breaking parallel paths.** For Redux-dependent routes, build the FastAPI path alongside the socket path. Gate with a flag. Don't remove the old path yet.
4. **New tools structure.** Use the `ToolEventPayload` type from `stream-events.ts`. Reference `tool-testing/streaming-client.ts` for the execution pattern.
5. **Use existing infrastructure.** `parseNdjsonStream`, `useApiAuth`, `useBackendApi`, `ENDPOINTS` — these are all production-ready. Don't rebuild.
6. **Keep `SocketInitializer` in authenticated layout.** Deferred routes still need it. Don't remove until everything is migrated.
