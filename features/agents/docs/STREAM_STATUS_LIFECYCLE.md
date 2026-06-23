# Stream Status Lifecycle — V2 Event System

## Event Types

| Event | Wire name | Purpose |
|---|---|---|
| **Chunk** | `chunk` | Token-by-token LLM response text |
| **Reasoning Chunk** | `reasoning_chunk` | Token-by-token LLM reasoning/thinking text |
| **Phase** | `phase` | State machine transition (replaces `status_update`) |
| **Init** | `init` | An identifiable operation is starting |
| **Completion** | `completion` | An identifiable operation finished |
| **Data** | `data` | Typed, discriminated structured payload (switch on `data.type`) |
| **Warning** | `warning` | Non-fatal issue with severity and machine-readable code |
| **Info** | `info` | Lightweight FYI notification (ignorable) |
| **Provider Retry** | `provider_retry` | Recoverable provider-capacity backoff and control state |
| **Tool Event** | `tool_event` | Tool lifecycle update (sub-typed) |
| **Content Block** | `content_block` | Structured block streaming |
| **Record Reserved** | `record_reserved` | Database row pre-created, UUID announced |
| **Record Update** | `record_update` | Previously reserved record changed status |
| **Error** | `error` | Fatal error — the stream is about to end |
| **End** | `end` | Transport-level stream termination |
| **Heartbeat** | `heartbeat` | Keep-alive ping |
| **Broker** | `broker` | Direct UI state update (frozen — no new usage) |

---

## Phase Values (closed enum)

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

---

## Operations (init/completion pairs)

| Operation | Description |
|---|---|
| `user_request` | The entire user request lifecycle (always present) |
| `llm_request` | A single LLM API call |
| `tool_execution` | A single tool execution |
| `sub_agent` | A sub-agent invocation |
| `persistence` | A database write operation |

---

## Timeline: Submit → Complete (Happy Path)

```
Client: dispatch(executeInstance)
  └─ submitAt = performance.now()

Client: HTTP POST → server

← phase: "connected"
   Redux: setCurrentPhase("connected"), appendTimeline(phase)

← data: {type: "conversation_id", conversation_id: "..."}
   Redux: setConversationId, appendTimeline(data)

← record_reserved: {table: "cx_conversation", ...}
← record_reserved: {table: "cx_user_request", ...}
   Redux: upsertReservation × 2, appendTimeline(record_reserved) × 2

← phase: "processing"
   Redux: setCurrentPhase("processing"), appendTimeline(phase)

← init: {operation: "user_request", operation_id: "..."}
   Redux: trackOperationInit, appendTimeline(init)

← warning: {code: "unrecognized_config", ...}  (if applicable)
   Redux: addWarning, appendTimeline(warning)

← record_reserved: {table: "cx_request", ...}
   Redux: upsertReservation, appendTimeline(record_reserved)

← info: {code: "iteration_update", ...}
   Redux: addInfoEvent, appendTimeline(info)

← phase: "generating"
   Redux: setCurrentPhase("generating"), appendTimeline(phase)

← reasoning_chunk × N  (if model supports reasoning)
   Redux: markReasoningStreamStart (first), appendReasoningChunk × N
   Timeline: reasoning_start entry (coalesced)

← chunk × N  (streaming text tokens)
   Redux: closeReasoningRun (if reasoning was active)
   Redux: markTextStreamStart (first), appendChunk × N
   Timeline: text_start entry (coalesced)
   Client: clientFirstChunkAt = performance.now()

← data: {type: "conversation_labeled", ...}  (async, timing varies)
   Redux: setConversationLabel, appendTimeline(data)
   Timeline: text_end (auto-close text run)

← chunk × N  (may resume text streaming)
   Redux: markTextStreamStart, appendChunk × N
   Timeline: text_start entry

← record_update: {table: "cx_conversation", status: "active"}
← record_update: {table: "cx_request", status: "active"}
← record_update: {table: "cx_user_request", status: "completed"}
   Redux: upsertReservation × 3, appendTimeline(record_update) × 3

← completion: {operation: "user_request", operation_id: "...", status: "success", result: {...}}
   Redux: trackOperationCompletion, setCompletion, appendTimeline(completion)
   Client: Extract CompletionStats from result

← end: {reason: "complete"}
   Redux: setRequestStatus("complete"), setInstanceStatus("complete"), appendTimeline(end)

Post-stream finalization:
  1. closeTextRun / closeReasoningRun (if still open)
  2. finalizeAccumulatedText
  3. finalizeAccumulatedReasoning
  4. commitAssistantTurn (writes to conversation history)
  5. clearUserInput, clearAllResources
  6. Compute & dispatch ClientMetrics
```

---

## Error Recovery Path

```
← record_update: {table: "cx_request", status: "failed"}
← record_update: {table: "cx_message", status: "failed"}
   Redux: upsertReservation (status changes)

← completion: {operation: "user_request", status: "failed", ...}
   Redux: trackOperationCompletion (status: "failed")

← error: {error_type: "...", message: "...", user_message: "..."}
   Redux: setRequestStatus("error"), setInstanceStatus("error")

← end: {reason: "complete"}
   Redux: appendTimeline(end)
```

---

## Redux State Map

| Event | Redux field(s) |
|---|---|
| `chunk` | `textChunks[]`, `accumulatedText` |
| `reasoning_chunk` | `reasoningChunks[]`, `accumulatedReasoning` |
| `phase` | `currentPhase`, `phaseHistory[]` |
| `init` | `activeOperations[operation_id]` |
| `completion` | `completedOperations[operation_id]`, `completion` (user_request) |
| `data` (typed) | `dataPayloads[]` (catch-all) or side-effects (conversation_id, labels) |
| `warning` | `warnings[]` |
| `info` | `infoEvents[]` |
| `provider_retry` | `providerRetry`, `providerRetryHistory[]`, timeline (`suspended` also sets conversation status `paused`) |
| `tool_event` | `toolLifecycle[callId]`, `pendingToolCalls[]` |
| `content_block` | `contentBlocks[blockId]`, `contentBlockOrder[]` |
| `record_reserved` | `reservations[recordId]` |
| `record_update` | `reservations[recordId]` (status update) |
| `error` | `error` (verbatim `ErrorPayload`), `status` (set to `"error"` — fatal by definition; the wire has no `is_fatal` field) |
| `end` | `status` change |
| `heartbeat` | timeline only |
| `broker` | `dataPayloads[]` (frozen) |

---

## Client-Side Stream Phase (selectStreamPhase)

| Phase | Condition |
|---|---|
| `idle` | No request or instance in draft/ready |
| `connecting` | HTTP request in flight, no events yet |
| `pre_token` | Events arriving but no text chunks yet |
| `reasoning` | Reasoning chunks actively streaming |
| `text_streaming` | Text chunks actively flowing |
| `interstitial` | Between text runs (tools, phases, planning) |
| `complete` | Stream finished |
| `error` | Fatal error |

---

## V1 → V2 Migration (completed)

| V1 | V2 |
|---|---|
| `status_update` event | `phase` event |
| `StatusUpdatePayload.status` | `PhasePayload.phase` |
| `StatusUpdatePayload.user_message` | `InfoPayload.user_message` |
| `data.event === "conversation_id"` | `data.type === "conversation_id"` |
| `completion` (flat output/metadata) | `completion` (operation/operation_id/status/result) |
| No "started" event | `init` event (paired with `completion`) |
| `CompletionStats` (hand-written) | `CompletionStats` = `UserRequestResult` (auto-generated, deeply typed: total_usage, timing_stats, tool_call_stats) |
