# Streaming Events V2 — Frontend Integration Guide

## 1. Summary

This guide documents the complete V2 streaming event system. All events are fully typed, enum-driven, and generated from Python Pydantic models as the schema basis.

**Breaking changes from V1:**
- `status_update` is **removed** — replaced by `phase` (state transitions) and `info` (progress messages)
- `completion` is **redesigned** — now part of an `init` + `completion` paired lifecycle, keyed by `operation` and `operation_id`
- `data` now **requires a `type` discriminator** — every data event is a typed `DataPayload` subclass
- The initial `status_update` with `status: "connected"` is now `phase` with `phase: "connected"`
- The `conversation_id` data event now uses `type: "conversation_id"` (not `event: "conversation_id"`)

**All TypeScript types are auto-generated.** Import from `aidream/api/generated/stream-events.ts`. Never hand-write event types.

---

## 2. Complete Event Type Reference

All events arrive as JSONL lines using the envelope `{"event": "<type>", "data": {...}}`.

| Event | Wire name | Purpose | Payload |
|---|---|---|---|
| **Chunk** | `chunk` | Token-by-token LLM response text | `ChunkPayload` |
| **Reasoning Chunk** | `reasoning_chunk` | Token-by-token LLM reasoning/thinking text | `ReasoningChunkPayload` |
| **Phase** | `phase` | State machine transition (replaces `status_update`) | `PhasePayload` |
| **Warning** | `warning` | Non-fatal issue with severity and machine-readable code | `WarningPayload` |
| **Info** | `info` | Lightweight FYI notification (ignorable) | `InfoPayload` |
| **Data** | `data` | Typed, discriminated structured payload | `TypedDataPayload` |
| **Init** | `init` | An identifiable operation is starting | `InitPayload` |
| **Completion** | `completion` | An identifiable operation finished | `CompletionPayload` |
| **Error** | `error` | Fatal error — the stream is about to end | `ErrorPayload` |
| **Tool Event** | `tool_event` | Tool lifecycle update (sub-typed) | `ToolEventPayload` |
| **Broker** | `broker` | Direct UI state update (frozen — no new usage) | `BrokerPayload` |
| **Heartbeat** | `heartbeat` | Keep-alive ping | `HeartbeatPayload` |
| **End** | `end` | Transport-level stream termination | `EndPayload` |
| **Content Block** | `content_block` | Structured block streaming (text, timeline, quiz, code) | `ContentBlockPayload` |
| **Record Reserved** | `record_reserved` | Database row pre-created, UUID announced | `RecordReservedPayload` |
| **Record Update** | `record_update` | Previously reserved record changed status | `RecordUpdatePayload` |

---

## 3. New & Changed Events (V1 → V2)

### 3.1 `phase` (replaces `status_update`)

A closed-enum state machine transition. The frontend renders a progress indicator by switching on the phase value. No metadata, no messages — just the phase name.

**Wire:**
```json
{"event": "phase", "data": {"phase": "generating"}}
```

**Phase values:**

| Phase | Meaning |
|---|---|
| `connected` | Stream established (always the first event) |
| `processing` | General processing / input validation |
| `generating` | LLM is generating tokens |
| `using_tools` | Tools are being executed |
| `persisting` | Database writes in progress |
| `searching` | Search operations running |
| `scraping` | Web scraping in progress |
| `analyzing` | Analysis pipeline running |
| `synthesizing` | Synthesis / summarization running |
| `retrying` | Automatic retry in progress |
| `executing` | Generic execution phase |
| `complete` | All work done |

**Migration from `status_update`:** If you were switching on `status_update.status`, switch on `phase.phase` instead. Progress messages that were in `status_update.user_message` are now separate `info` events. The `status_update` event type no longer exists.

### 3.2 `init` + `completion` (paired lifecycle)

Every operation that has meaningful duration gets this pair. They are tied by `operation` (what kind) and `operation_id` (which specific instance). **You must always match an `init` to its `completion` by `operation_id`.**

**Init wire:**
```json
{
  "event": "init",
  "data": {
    "operation": "user_request",
    "operation_id": "af459bd8-2c78-4e95-9138-8625c187f248"
  }
}
```

**Completion wire:**
```json
{
  "event": "completion",
  "data": {
    "operation": "user_request",
    "operation_id": "af459bd8-2c78-4e95-9138-8625c187f248",
    "status": "success",
    "result": {
      "iterations": 1,
      "total_tokens_in": 150,
      "total_tokens_out": 42,
      "total_duration_ms": 1478,
      "finish_reason": "stop"
    }
  }
}
```

**Operations:**

| Operation | Description | Result model |
|---|---|---|
| `user_request` | The entire user request lifecycle (always present) | `UserRequestResult` |
| `llm_request` | A single LLM API call | `LlmRequestResult` |
| `tool_execution` | A single tool execution | `ToolExecutionResult` |
| `sub_agent` | A sub-agent invocation | `SubAgentResult` |
| `persistence` | A database write operation | `PersistenceResult` |

**Completion status values:** `"success"`, `"failed"`, `"cancelled"`

**What's guaranteed now:** Every streaming response emits an `init` with `operation: "user_request"` at the start and a matching `completion` at the end. Additional `init`/`completion` pairs for `llm_request`, `tool_execution`, etc. will be added incrementally.

**Migration from old `completion`:** The old completion had no matching "started" event and used `output`/`metadata`. The new system uses `init` to mark the start and `completion` with `operation`/`operation_id`/`status`/`result` for the end. Match `init` and `completion` events by their shared `operation_id`.

### 3.3 `data` (typed, with `type` discriminator)

Every `data` event now carries a `type` field that names the payload model. Switch on `type` to narrow to the exact shape.

**Wire:**
```json
{"event": "data", "data": {"type": "conversation_id", "conversation_id": "6a8ffe0b-..."}}
```

```json
{"event": "data", "data": {"type": "audio_output", "url": "https://...", "mime_type": "audio/mp3"}}
```

**Core data types (TypeScript types generated):**

| `type` value | Model | Fields |
|---|---|---|
| `conversation_id` | `ConversationIdData` | `conversation_id` |
| `audio_output` | `AudioOutputData` | `url`, `mime_type` |
| `image_output` | `ImageOutputData` | `url`, `mime_type` |
| `video_output` | `VideoOutputData` | `url`, `mime_type` |
| `conversation_labeled` | `ConversationLabeledData` | `conversation_id`, `title`, `description`, `keywords` |
| `structured_input_warning` | `StructuredInputWarningData` | `block_type`, `failures` |
| `categorization_result` | `CategorizationResultData` | `prompt_id`, `category`, `metadata` |
| `podcast_stage` | `PodcastStageData` | `stage`, `success`, `error`, `result_keys` |
| `podcast_complete` | `PodcastCompleteData` | `show_id`, `success`, `episode_count`, `error` |
| `workflow_step` | `WorkflowStepData` | `step_name`, `status`, `data` |
| `function_result` | `FunctionResultData` | `function_name`, `success`, `result`, `error`, `duration_ms` |
| `display_questionnaire` | `QuestionnaireDisplayData` | `introduction`, `questions` |
| `scrape_batch_complete` | `ScrapeBatchCompleteData` | `total_scraped` |
| `fetch_results` | `FetchResultsData` | `metadata`, `results` |
| `search_results` | `SearchResultsData` | `metadata`, `results` |
| `search_error` | `SearchErrorData` | `metadata`, `error` |

**Research pipeline data types (typed in Python, TS generation pending):**

The research module emits additional data types like `search_page_start`, `scrape_complete`, `analysis_start`, `synthesis_complete`, `pipeline_complete`, etc. These all have `type` discriminators and extend `DataPayload` in Python. Their TypeScript types will be added to `TypedDataPayload` in a future generation pass. For now, they arrive as `Record<string, unknown>` on the TypeScript side — check for `"type" in d` and switch on the string value.

**Frontend handling:**

```typescript
if (isTypedDataEvent(event)) {
  const d = event.data;
  if ("type" in d) {
    switch (d.type) {
      case "conversation_id":
        setConversationId((d as ConversationIdData).conversation_id);
        break;
      case "conversation_labeled":
        const labeled = d as ConversationLabeledData;
        setConversationTitle(labeled.title);
        break;
      case "audio_output":
        playAudio((d as AudioOutputData).url);
        break;
      default:
        console.log(`Unhandled data type: ${d.type}`, d);
    }
  }
}
```

### 3.4 `warning`

Structured warnings with severity levels and machine-readable codes.

**Wire:**
```json
{
  "event": "warning",
  "data": {
    "code": "unrecognized_config",
    "system_message": "Unrecognized config keys ignored by server: ['image_urls', 'youtube_videos', 'file_urls']",
    "user_message": null,
    "level": "low",
    "recoverable": true,
    "metadata": {}
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `code` | `string` | yes | Machine-readable code for programmatic handling |
| `system_message` | `string` | yes | Technical message for logging |
| `user_message` | `string \| null` | no | User-friendly message (display if non-null) |
| `level` | `"low" \| "medium" \| "high"` | no (default `"medium"`) | Severity |
| `recoverable` | `boolean` | no (default `true`) | Whether the operation continues |
| `metadata` | `Record<string, unknown>` | no (default `{}`) | Structured context |

**Known warning codes:** `model_retry`, `tools_missing`, `unrecognized_config`

### 3.5 `info`

Lightweight FYI notifications. **If the frontend ignores all `info` events, nothing breaks.** These are purely informational.

**Wire:**
```json
{
  "event": "info",
  "data": {
    "code": "iteration_update",
    "system_message": "Processing update",
    "user_message": null,
    "metadata": {}
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `code` | `string` | yes | Machine-readable info code |
| `system_message` | `string` | yes | Technical message |
| `user_message` | `string \| null` | no | Optional display message |
| `metadata` | `Record<string, unknown>` | no (default `{}`) | Structured context |

**Known info codes (partial list):** `debug_mode_active`, `iteration_update`, `provider_retry`, `tool_processing`, `scrape_start`, `scraping_progress`, `search_progress`, `pdf_page_progress`, `categorizing`, `podcast_start`, `tts_generating`, `video_generating`

### 3.6 `reasoning_chunk`

Token-level streaming for LLM reasoning/thinking content.

**Wire:**
```json
{"event": "reasoning_chunk", "data": {"text": "Let me think about this..."}}
```

Accumulate all `reasoning_chunk` texts in order for the full reasoning trace. Reasoning tokens arrive before content `chunk` tokens within a single LLM iteration. Only emitted when the model supports reasoning/thinking output.

### 3.7 `tool_event` (sub-typed data)

Tool events carry typed `data` sub-models for each sub-event type.

| Sub-event | Data model | Fields |
|---|---|---|
| `tool_started` | `ToolStartedData` | `arguments` |
| `tool_progress` | `ToolProgressData` | `percent`, `metadata` |
| `tool_step` | `ToolStepData` | `step`, `metadata` |
| `tool_result_preview` | `ToolResultPreviewData` | `preview` |
| `tool_completed` | `ToolCompletedData` | `result` |
| `tool_error` | `ToolErrorData` | `error_type`, `detail` |
| `tool_delegated` | `ToolDelegatedData` | `arguments` |

Switch on `event` within the `ToolEventPayload` to narrow `data`:

```typescript
if (isToolEventEvent(event)) {
  const d = event.data;
  switch (d.event) {
    case "tool_started":
      showToolSpinner(d.tool_name, (d.data as ToolStartedData).arguments);
      break;
    case "tool_completed":
      hideToolSpinner(d.tool_name);
      break;
    case "tool_error":
      showToolError(d.tool_name, (d.data as ToolErrorData).error_type);
      break;
  }
}
```

---

## 4. Record Reservation System

The backend pre-creates database rows and announces their UUIDs to the frontend as early as possible during a streaming response.

### `record_reserved`

**Wire:**
```json
{
  "event": "record_reserved",
  "data": {
    "db_project": "matrx",
    "table": "cx_request",
    "record_id": "c7314f1f-a514-4f48-8640-e7ef0bb4efe5",
    "status": "pending",
    "parent_refs": {"user_request_id": "3c0818a0-..."},
    "metadata": {"iteration": 1}
  }
}
```

### `record_update`

**Wire:**
```json
{
  "event": "record_update",
  "data": {
    "db_project": "matrx",
    "table": "cx_request",
    "record_id": "c7314f1f-a514-4f48-8640-e7ef0bb4efe5",
    "status": "active",
    "metadata": {}
  }
}
```

**Status lifecycle:** `pending` → `active` | `completed` | `failed`

### Tables

| Table | Description | Typical `parent_refs` |
|---|---|---|
| `cx_conversation` | Conversation container | (none) |
| `cx_user_request` | Single API call from user | `conversation_id` |
| `cx_message` | Single message | `conversation_id`, `user_request_id` |
| `cx_request` | Single LLM API call | `user_request_id` |
| `cx_tool_call` | Single tool execution | `user_request_id`, `call_id` |

---

## 5. TypeScript Types

All types are auto-generated and live in `aidream/api/generated/stream-events.ts`. Regenerate with:

```bash
.venv/bin/python scripts/generate_types.py stream
```

Check if types are up to date (CI-friendly):

```bash
.venv/bin/python scripts/generate_types.py stream --check
```

### Key types

**Literal union types:**
- `Phase` — all phase values (`"connected" | "processing" | "generating" | ...`)
- `Operation` — all operation values (`"llm_request" | "tool_execution" | "user_request" | "sub_agent" | "persistence"`)
- `ToolEventType` — all tool sub-event values (`"tool_started" | "tool_completed" | ...`)
- `WarningLevel` — `"low" | "medium" | "high"`
- `InitCompletionStatus` — `"success" | "failed" | "cancelled"`

**Discriminated unions:**
- `TypedDataPayload` — all registered `DataPayload` subclasses, discriminated by `type`
- `TypedToolEventData` — all tool event data models
- `TypedStreamEvent` — all stream events, discriminated by `event`

**Completion result models (per operation):**
- `LlmRequestResult` — `tokens_in`, `tokens_out`, `duration_ms`, `finish_reason`, `model`
- `ToolExecutionResult` — `success`, `duration_ms`, `error`
- `UserRequestResult` — `iterations`, `total_tokens_in`, `total_tokens_out`, `total_duration_ms`, `finish_reason`
- `SubAgentResult` — `agent_name`, `success`, `error`
- `PersistenceResult` — `records_written`, `duration_ms`

**Type guards (one per event type):**
`isChunkEvent()`, `isReasoningChunkEvent()`, `isPhaseEvent()`, `isWarningEvent()`, `isInfoEvent()`, `isTypedDataEvent()`, `isInitEvent()`, `isCompletionEvent()`, `isErrorEvent()`, `isToolEventEvent()`, `isBrokerEvent()`, `isHeartbeatEvent()`, `isEndEvent()`, `isContentBlockEvent()`, `isRecordReservedEvent()`, `isRecordUpdateEvent()`

---

## 6. Event Timeline (Actual Chat Request)

This is the exact sequence from a real chat request (verified against live server output):

```
← HTTP headers: X-Conversation-ID, X-Request-ID

← {"event":"phase","data":{"phase":"connected"}}

← {"event":"data","data":{"type":"conversation_id","conversation_id":"6a8ffe0b-..."}}

← {"event":"record_reserved","data":{"db_project":"matrx","table":"cx_conversation","record_id":"6a8ffe0b-...","status":"pending","parent_refs":{},"metadata":{}}}
← {"event":"record_reserved","data":{"db_project":"matrx","table":"cx_user_request","record_id":"3c0818a0-...","status":"pending","parent_refs":{"conversation_id":"6a8ffe0b-..."},"metadata":{}}}

← {"event":"phase","data":{"phase":"processing"}}

← {"event":"init","data":{"operation":"user_request","operation_id":"af459bd8-..."}}

← {"event":"warning","data":{"code":"unrecognized_config","level":"low",...}}
   (only if client sent unrecognized config keys)

← {"event":"record_reserved","data":{"db_project":"matrx","table":"cx_request","record_id":"c7314f1f-...","status":"pending","parent_refs":{"user_request_id":"3c0818a0-..."},"metadata":{}}}

← {"event":"phase","data":{"phase":"processing"}}

← {"event":"info","data":{"code":"iteration_update","system_message":"Processing update"}}

← {"event":"chunk","data":{"text":"..."}}
← {"event":"chunk","data":{"text":"..."}}
   (streaming text tokens)

← {"event":"data","data":{"type":"conversation_labeled","conversation_id":"6a8ffe0b-...","title":"...","description":"...","keywords":[...]}}

← {"event":"record_update","data":{"db_project":"matrx","table":"cx_conversation","record_id":"6a8ffe0b-...","status":"active","metadata":{}}}
← {"event":"record_update","data":{"db_project":"matrx","table":"cx_request","record_id":"c7314f1f-...","status":"active","metadata":{}}}
← {"event":"record_update","data":{"db_project":"matrx","table":"cx_user_request","record_id":"3c0818a0-...","status":"completed","metadata":{}}}

← {"event":"completion","data":{"operation":"user_request","operation_id":"af459bd8-...","status":"success","result":{"iterations":1,"total_tokens_in":0,"total_tokens_out":0,"total_duration_ms":1478,"finish_reason":"stop"}}}

← {"event":"end","data":{"reason":"complete"}}
```

**Notes on the timeline:**
- `cx_message` reservations are attempted but may fail due to database constraints (the backend logs this as a warning and continues). When they succeed, `record_reserved` events for messages will appear between the user_request reservation and the processing phase.
- The `conversation_labeled` data event arrives asynchronously during streaming — it fires whenever the conversation labeler finishes, which may be before or after the LLM response completes.
- `init`/`completion` for `llm_request` will be added in a future update. Currently only `user_request` is guaranteed.

---

## 7. Error Recovery

When a fatal error occurs:

1. Every reservation still in `"pending"` receives `record_update` with `"status": "failed"`
2. A `completion` event fires with `"status": "failed"` for the active `user_request` operation
3. The `error` event fires
4. The `end` event fires

Records already `"active"` or `"completed"` are not affected.

```
← {"event":"record_update","data":{"db_project":"matrx","table":"cx_request","record_id":"req-uuid","status":"failed","metadata":{}}}
← {"event":"record_update","data":{"db_project":"matrx","table":"cx_message","record_id":"msg-asst-uuid","status":"failed","metadata":{}}}
← {"event":"error","data":{"error_type":"ProviderTimeout","message":"LLM provider timed out","user_message":"The AI service timed out. Please try again."}}
← {"event":"end","data":{"reason":"complete"}}
```

---

## 8. Recommended Frontend Implementation

### Core Event Handler

```typescript
import {
  isChunkEvent,
  isReasoningChunkEvent,
  isPhaseEvent,
  isInitEvent,
  isCompletionEvent,
  isTypedDataEvent,
  isToolEventEvent,
  isWarningEvent,
  isInfoEvent,
  isErrorEvent,
  isEndEvent,
  isRecordReservedEvent,
  isRecordUpdateEvent,
  type StreamEvent,
  type Phase,
  type Operation,
  type ConversationIdData,
  type ConversationLabeledData,
  type ToolStartedData,
  type ToolErrorData,
} from "@/generated/stream-events";

function handleStreamEvent(event: StreamEvent) {
  if (isChunkEvent(event)) {
    appendText(event.data.text);
    return;
  }

  if (isReasoningChunkEvent(event)) {
    appendReasoning(event.data.text);
    return;
  }

  if (isPhaseEvent(event)) {
    updatePhaseIndicator(event.data.phase);
    return;
  }

  if (isInitEvent(event)) {
    const { operation, operation_id, parent_operation_id } = event.data;
    trackOperationStart(operation, operation_id, parent_operation_id ?? null);
    return;
  }

  if (isCompletionEvent(event)) {
    const { operation, operation_id, status, result } = event.data;
    trackOperationEnd(operation, operation_id, status, result);
    return;
  }

  if (isTypedDataEvent(event)) {
    const d = event.data;
    if ("type" in d) {
      switch (d.type) {
        case "conversation_id":
          setConversationId((d as ConversationIdData).conversation_id);
          break;
        case "conversation_labeled":
          const labeled = d as ConversationLabeledData;
          setConversationTitle(labeled.title);
          break;
        default:
          console.log(`Data event: ${d.type}`, d);
      }
    }
    return;
  }

  if (isToolEventEvent(event)) {
    const d = event.data;
    switch (d.event) {
      case "tool_started":
        showToolSpinner(d.tool_name, (d.data as ToolStartedData).arguments);
        break;
      case "tool_completed":
        hideToolSpinner(d.tool_name);
        break;
      case "tool_error":
        showToolError(d.tool_name, (d.data as ToolErrorData).error_type);
        break;
    }
    return;
  }

  if (isWarningEvent(event)) {
    const { code, level, user_message, system_message } = event.data;
    if (level === "high" && user_message) {
      showToast({ type: "warning", message: user_message });
    }
    console.warn(`[warning:${code}]`, system_message);
    return;
  }

  if (isInfoEvent(event)) {
    const { user_message, code, system_message } = event.data;
    if (user_message) {
      showStatusMessage(user_message);
    }
    console.info(`[info:${code}]`, system_message);
    return;
  }

  if (isRecordReservedEvent(event)) {
    reservations.set(event.data.record_id, {
      dbProject: event.data.db_project,
      table: event.data.table,
      recordId: event.data.record_id,
      status: "pending",
      parentRefs: event.data.parent_refs ?? {},
      metadata: event.data.metadata ?? {},
    });
    return;
  }

  if (isRecordUpdateEvent(event)) {
    const existing = reservations.get(event.data.record_id);
    if (existing) {
      existing.status = event.data.status;
    }
    return;
  }

  if (isErrorEvent(event)) {
    showError(event.data.user_message);
    return;
  }

  if (isEndEvent(event)) {
    finalizeStream(event.data.reason);
    return;
  }
}
```

### Operation Tracking

Track `init`/`completion` pairs to show operation-level progress:

```typescript
const activeOperations = new Map<string, { operation: Operation; startTime: number }>();

function trackOperationStart(operation: Operation, id: string, parentId: string | null) {
  activeOperations.set(id, { operation, startTime: Date.now() });
}

function trackOperationEnd(
  operation: Operation,
  id: string,
  status: string,
  result: Record<string, unknown>,
) {
  const op = activeOperations.get(id);
  if (op) {
    activeOperations.delete(id);
  }
}
```

---

## 9. Migration Checklist (V1 → V2)

| V1 Pattern | V2 Replacement |
|---|---|
| `event === "status_update"` | `event === "phase"` for transitions, `event === "info"` for progress messages |
| `StatusUpdatePayload.status` | `PhasePayload.phase` |
| `StatusUpdatePayload.user_message` | `InfoPayload.user_message` |
| `data.event === "conversation_id"` | `data.type === "conversation_id"` (discriminator key changed from `event` to `type`) |
| `event === "completion"` (old, with `output`) | `event === "completion"` (new, with `operation`/`operation_id`/`status`/`result`) |
| `event === "data"` with unknown shape | `event === "data"` then switch on `data.type` |
| `CompletionPayload.output` | `CompletionPayload.result` (typed per operation) |
| `CompletionPayload.metadata` | `CompletionPayload.result` (merged into result) |

**There is no backward compatibility period.** Update your handlers to V2 before deploying.

---

## 10. Future Expansion

The `db_project` field on `record_reserved`/`record_update` supports multiple database projects. Currently all chat records use `"matrx"`. Future services will add their own projects:

- `"scraper"` — scrape jobs, parsed pages, domain configs
- `"research"` — topics, search results, synthesized reports

New `DataPayload` types, `Phase` values, and `Operation` values will be added to the Python source and auto-generated into TypeScript. The frontend's `switch` statements will get compile-time warnings for unhandled cases.

Additional `init`/`completion` pairs for `llm_request`, `tool_execution`, `sub_agent`, and `persistence` operations will be wired up incrementally. The `user_request` pair is the guaranteed baseline.
