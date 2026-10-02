# AI Core API — Developer Reference

Three endpoints. Every React feature that talks to our AI uses one of these.

---

## Base URL & Compat

All routes are under `/ai`. The `ApiPrefixCompatMiddleware` strips a leading `/api`, so `/api/ai/...` and `/ai/...` are identical.

---

## Authentication

All three routes require **guest-or-above** — anonymous (no auth at all) is rejected with `401`.

| Priority | Mechanism | How to send |
|----------|-----------|-------------|
| 1 | Supabase JWT | `Authorization: Bearer <jwt>` |
| 2 | Admin token | `Authorization: Bearer <admin_api_token>` |
| 3 | Guest / fingerprint | `X-Fingerprint-ID: <fingerprint>` header |

You may send `X-Fingerprint-ID` alongside a Bearer token; it is stored on context as `fingerprint_id` regardless.

A valid auth also causes guest activity to be logged automatically (fire-and-forget, no extra work needed).

---

## Streaming Response Format (V2)

All three main endpoints return **NDJSON** (`application/x-ndjson`) — one JSON object per line.

**Response headers always include:**
- `X-Request-ID` — unique ID for this HTTP request
- `X-Conversation-ID` — the conversation UUID (read this to track the conversation)

**Stream line sequence:**

```
// 1. Connection confirmed
{"event":"phase","data":{"phase":"connected"}}

// 2. Conversation ID (redundant with the header, same value)
{"event":"data","data":{"type":"conversation_id","conversation_id":"<uuid>"}}

// 3. Record reservations (database rows pre-created with stable UUIDs)
{"event":"record_reserved","data":{"db_project":"matrx","table":"cx_conversation","record_id":"<uuid>","status":"pending",...}}
{"event":"record_reserved","data":{"db_project":"matrx","table":"cx_user_request","record_id":"<uuid>","status":"pending",...}}

// 4. Processing begins
{"event":"phase","data":{"phase":"processing"}}
{"event":"init","data":{"operation":"user_request","operation_id":"<uuid>"}}

// 5. LLM streaming
{"event":"chunk","data":{"text":"Hello"}}
{"event":"chunk","data":{"text":" world"}}

// 6. Tool calls (if any)
{"event":"tool_event","data":{"event":"tool_started","call_id":"...","tool_name":"...","data":{"arguments":{...}}}}
{"event":"tool_event","data":{"event":"tool_completed","call_id":"...","tool_name":"...","data":{"result":{...}}}}

// 7. Persistence confirmations
{"event":"record_update","data":{"db_project":"matrx","table":"cx_conversation","record_id":"<uuid>","status":"active",...}}
{"event":"record_update","data":{"db_project":"matrx","table":"cx_user_request","record_id":"<uuid>","status":"completed",...}}

// 8. Completion + end
{"event":"completion","data":{"operation":"user_request","operation_id":"<uuid>","status":"success","result":{...}}}
{"event":"end","data":{"reason":"complete"}}
```

**All event types** (from `stream-events.ts`):

| `event` | Payload | Purpose |
|---------|---------|---------|
| `phase` | `PhasePayload` | State machine transition: `connected`, `processing`, `generating`, `using_tools`, `persisting`, `searching`, `scraping`, `analyzing`, `synthesizing`, `retrying`, `executing`, `complete` |
| `chunk` | `ChunkPayload` | Token-by-token LLM response text (`data.text`) |
| `reasoning_chunk` | `ReasoningChunkPayload` | Token-by-token LLM reasoning/thinking text (`data.text`) |
| `init` | `InitPayload` | Operation started — `operation` + `operation_id` identify what and which |
| `completion` | `CompletionPayload` | Operation finished — same `operation_id` as the matching `init`, with `status` and typed `result` |
| `data` | `TypedDataPayload` | Typed structured payload — switch on `data.type` (e.g. `conversation_id`, `audio_output`, `conversation_labeled`) |
| `warning` | `WarningPayload` | Non-fatal issue with `code`, `level` (`low`/`medium`/`high`), `recoverable` flag |
| `info` | `InfoPayload` | Lightweight FYI — ignorable. Has `code` and optional `user_message` |
| `tool_event` | `ToolEventPayload` | Tool lifecycle: `tool_started` → `tool_progress` → `tool_completed`/`tool_error`. Sub-typed `data` per sub-event |
| `error` | `ErrorPayload` | Fatal error — stream ends after this |
| `content_block` | `ContentBlockPayload` | Structured block streaming (text, code, table, diagram). See `content-blocks.ts` |
| `record_reserved` | `RecordReservedPayload` | Database row pre-created with `pending` status — `db_project`, `table`, `record_id`, `parent_refs` |
| `record_update` | `RecordUpdatePayload` | Previously reserved record changed status to `active`, `completed`, or `failed` |
| `heartbeat` | `HeartbeatPayload` | Keep-alive ping on long runs |
| `end` | `EndPayload` | Stream is done — always the last line |

**V2 breaking changes:** `status_update` is removed (replaced by `phase` + `info`). `completion` is redesigned as a paired lifecycle with `init`. `data` events now require a `type` discriminator field. Full migration details in `record_reservation_frontend_guide.md`.

Use the **type guards** in `stream-events.ts` (`isChunkEvent`, `isPhaseEvent`, `isInitEvent`, `isCompletionEvent`, `isTypedDataEvent`, etc.) to narrow events safely.

---

## Organizational Scope — Automatic on All Requests

All three endpoints accept four optional scope fields in the request body:

```typescript
organization_id?: string;
workspace_id?: string;
project_id?: string;
task_id?: string;
```

**You don't need to set these manually.** The frontend `callApi()` infrastructure reads them from Redux (`appContextSlice`) and injects them into every request body automatically. If the user has an active project selected, it flows through on every call without any extra work at the call site.

If you need to override for a specific call, pass them in `scopeOverrides`:
```typescript
dispatch(callAgentStart({ agentId, body, scopeOverrides: { project_id: 'abc-123' } }));
```

**On the backend**, these fields are read from the body and set on `AppContext`. All tools (memory, filesystem, code execution, etc.) automatically use the correct scoped namespaces from context — the model never needs to pass them explicitly in tool calls.

**Adding scope to a new router** is a one-liner — inherit from `ScopedRequest` and call `apply_scope(ctx, request)`:
```python
from aidream.api.utils.scope import ScopedRequest, apply_scope

class MyRequest(ScopedRequest):
    ...

@router.post("/my-endpoint")
async def my_endpoint(request: MyRequest, ctx: AppContext = Depends(context_dep)):
    apply_scope(ctx, request)
    ...
```

---

## Database Persistence — What We Write (All Three Endpoints)

Every request — agents, chat, and conversation — automatically writes to the database. You do not need to do anything for persistence.

| Table | When written | What |
|-------|-------------|------|
| `cx_conversation` | On first request for a given `conversation_id` | Creates the row with status, user_id, initial variables/overrides; idempotent — no-op if it exists |
| `cx_user_request` | On every request | One row per HTTP call, starts as `pending`, updated with token totals and final status on completion |
| `cx_message` | After each AI turn completes | Every message produced by that execution (user, assistant, tool result) |
| `cx_request` | Inside each iteration | One per AI API call; aggregated into `cx_user_request` on finish |
| `cx_tool_call` | When tools run | Per tool invocation, linked back to the `cx_message` row |

**Important:** The `store` field in the `ChatRequest` body is an **AI provider parameter** (e.g., OpenAI stored completions), not a flag to skip our persistence. Our persistence always runs.

If the user refreshes the page you can reconstruct the full conversation from the database — you never need to maintain your own message history.

---

---

## 1. Start Agent — `POST /ai/agents/{agent_id}`

**Purpose:** Kicks off a brand-new agent run. This is call number one — you call it once, get a `conversation_id` back, then switch to the conversation endpoint for every subsequent turn.

**The key difference from normal chat:** The first call to an agent is *structured and data-driven*, not just a user typing a message. The agent definition (stored in the database by `agent_id`) contains the system prompt, model config, and variable slots. You fill those slots with your data. `user_input` is optional — many agents launch purely from variables with no user-typed text at all.

### Path parameter

| Param | Description |
|-------|-------------|
| `agent_id` | UUID of the agent definition in the database |

### Request body (`AgentStartRequest`)

```typescript
// All fields are optional unless noted
{
  // Primary:
  variables?: Record<string, unknown>;           // Template variable values that fill slots in the agent prompt
  user_input?: string | MessageDict[] | null;    // Optional. Appended to agent config as __agent_user_input__
  context?: Record<string, unknown>;             // Structured context objects mapped to agent context slots

// Important: Organizational scope — scopes all tool calls (memory, filesystem, etc.)
  organization_id?: string | null;
  workspace_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;

  // Extras: not critical unless needed (Config overrides shold be used with caution)
  config_overrides?: LLMParams | null;           // Override model, temperature, etc. (IMPORTANT: Agent overrides often fail. Agents are tuned already so modify with caution.)
  stream?: boolean;                              // default: true
  debug?: boolean;                               // default: false
  
  
  // Relevant for custom tools and tools you will run yourself
  client_tools?: string[];                       // Tool names the CLIENT will execute (not the server)
  custom_tools?: object[];                       // Inline tool definitions — always delegated back to client
  
  // Relevant for IDE Only
  ide_state?: IdeState | null;                   // Editor snapshot: active file, diagnostics, git, workspace

}
```

**Content in `user_input`** can be plain text or a list of message-shaped dicts supporting text, images, and files (multimodal). When sent as a list, each item is a content part.

**`variables`** is the primary driver on a first call. The agent prompt contains named slots; you populate them. Example: an agent that generates a report might have slots for `company_name`, `date_range`, `report_type` — you supply those, not a chat message.

**`context`** maps to named context slots defined on the agent (e.g., `{"user_profile": {...}, "recent_activity": [...]}`). The backend merges these into the prompt according to the agent's slot definitions.

### Conversation ID

The server **always generates** a new UUID. It is never taken from the request body. You get it from:
- `X-Conversation-ID` response header (available immediately)
- The `data` event with `type: "conversation_id"` (early in the stream)

**Store this ID.** Every subsequent turn uses it via the conversation endpoint.

### After the first response

Once you receive the `end` event, this agent run is complete. Do not call this endpoint again for follow-up turns — use `POST /ai/conversations/{conversation_id}` instead.

---

## 2. Continue Conversation — `POST /ai/conversations/{conversation_id}`

**Purpose:** Every turn after the first. The backend loads the full conversation history and agent configuration automatically — you only send what's new.

This is the simplest endpoint to use. The backend does all the heavy lifting: loads history, applies the right model and system prompt, handles tool calls, streams the response, and persists everything.

### Path parameter

| Param | Description |
|-------|-------------|
| `conversation_id` | UUID from the `X-Conversation-ID` header of the first agent call |

### Request body (`ConversationContinueRequest`)

```typescript
{
  user_input: string | MessageDict[];    // REQUIRED — the new user turn
  config_overrides?: LLMParams | null;   // Optional per-turn model overrides
  stream?: boolean;                      // default: true
  debug?: boolean;                       // default: false
  client_tools?: string[];
  custom_tools?: object[];
  ide_state?: IdeState | null;           // Ephemeral state only (selected_text, diagnostics)
                                         // Stable session state from turn 1 is already stored
  context?: Record<string, unknown>;     // Context updates for this turn

  // Override organizational scope for just this turn (usually omitted)
  organization_id?: string | null;
  workspace_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
}
```

`user_input` supports the same multimodal format as the agent endpoint (text, images, files).

`ide_state` on conversation turns only picks up **ephemeral** fields (selected text, current diagnostics). The stable session fields (git state, workspace, active file) were captured on turn 1 and are already in the stored conversation config — don't re-send them here.

### Conversation ID

Comes from the **URL path only**. The response still echoes it in `X-Conversation-ID` and the NDJSON data event.

---

## 3. Chat — `POST /ai/chat`

**Purpose:** Full manual control. You provide the complete message history and model config on every call. Use this when you want to manage the conversation yourself and treat us like a standard AI API endpoint.

Unlike the agent and conversation endpoints, you send the full `messages` array each time. There is no server-side conversation history lookup — you own the state.

> **Note:** Even though you manage the messages yourself, we still write `cx_conversation`, `cx_user_request`, `cx_message`, and `cx_request` rows to the database on every call. Persistence is always on.

### Request body (`ChatRequest`)

```typescript
{
  // Required
  ai_model_id: string;                   // Model identifier (e.g. "gpt-4o", "claude-3-5-sonnet")
  messages: MessageDict[];               // Full conversation history — OpenAI-style message objects

  // Conversation tracking
  conversation_id?: string | null;       // Optional. Server generates UUID if omitted.

  // Execution control
  max_iterations?: number;               // default: 100
  max_retries_per_iteration?: number;    // default: 2
  stream?: boolean;                      // default: true
  debug?: boolean;                       // default: false

  // Model config (all optional — also available via config_overrides)
  system_instruction?: string | null;
  tools?: string[] | null;               // Registered server-side tool names
  config_overrides?: LLMParams | null;

  // Client tools
  client_tools?: string[];
  
  // Context and IDE
  ide_state?: IdeState | null;
  context?: Record<string, unknown>;

  // Metadata
  metadata?: Record<string, unknown> | null;
  store?: boolean;                       // default: true — passed to the AI provider (e.g. OpenAI stored completions)
                                         // NOT a flag to disable our persistence

  // Plus all LLMParams fields directly on the body (temperature, top_p, max_output_tokens, etc.)
}
```

### LLMParams fields (inline or via `config_overrides`)

These can be set directly on the `ChatRequest` body or nested under `config_overrides`. `config_overrides` is applied on top and wins:

`model`, `max_output_tokens`, `temperature`, `top_p`, `top_k`, `tool_choice`, `parallel_tool_calls`, `reasoning_effort`, `reasoning_summary`, `thinking_level`, `include_thoughts`, `thinking_budget`, `response_format`, `stop_sequences`, `internal_web_search`, `internal_url_context`, image/audio/video generation params (`size`, `quality`, `count`, `tts_voice`, `audio_format`, `fps`, etc.) — see `llm-params.schema.json` for the full list.

---

## 4. Submit Client Tool Results — `POST /ai/conversations/{conversation_id}/tool_results`

**Purpose:** When a tool was delegated to the client (via a `tool_event` with `event: "tool_delegated"`), you execute it on your side and POST the results here. The suspended AI loop unblocks and continues automatically.

This is a **synchronous JSON endpoint** (not streaming).

### Request body

```typescript
{
  results: Array<{
    call_id: string;       // Must match the call_id from the tool_delegated event
    tool_name: string;
    output?: unknown;      // Your tool's return value
    is_error?: boolean;    // default: false
    error_message?: string | null;
  }>
}
```

### Response

- `200` — `{ "resolved": ["<call_id>", ...], "count": N }`
- `404` — Some `call_id`s were not found (timed out or unknown): `{ "message": "...", "not_found": [...], "resolved": [...] }`

---

## Quick Reference

| Route | First call? | Manages history? | Conversation ID source | Persists? |
|-------|-------------|-----------------|------------------------|-----------|
| `POST /ai/agents/{agent_id}` | Yes — starts the conversation | Server loads agent config | Server-generated | Always |
| `POST /ai/conversations/{conversation_id}` | No — subsequent turns | Server loads from DB | URL path | Always |
| `POST /ai/chat` | Either — you manage state | You send full messages | Body or server-generated | Always |
| `POST /ai/conversations/{id}/tool_results` | N/A | N/A | URL path | N/A (unblocks stream) |

## When to use which

```
Building a feature backed by one of our configured agents?
  → POST /ai/agents/{agent_id} to start, then POST /ai/conversations/{id} for each turn.
  → You only pass variables and context. We handle everything else.

Building a custom chat UI where you control the full message history?
  → POST /ai/chat every turn with your complete messages array.
  → You own the state; we process and stream the response.
```

## Typical flow (agent-based)

```
1.  Client calls POST /ai/agents/{agent_id}
      - sends: variables, optional user_input, optional context
      - receives: stream starts, X-Conversation-ID: abc-123
      - we write: cx_conversation (new), cx_user_request, cx_message(s)

2.  User reads the response (stream to end event)

3.  User types a follow-up message

4.  Client calls POST /ai/conversations/abc-123
      - sends: { user_input: "follow up text" }
      - receives: stream continues on same conversation
      - we write: cx_user_request (new), cx_message(s) appended to same conversation

5.  Repeat step 3–4 for every subsequent turn.

6.  User refreshes the page
      - Client fetches conversation history from Supabase (cx_message for conversation abc-123)
      - All messages are there — no state was ever on the client
```
