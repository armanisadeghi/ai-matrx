> **HISTORICAL — `matrxBroker` no longer exists (deleted 2026-08-20, Arman's ruling).**
> The `<<<MATRX_START>>>…<<<MATRX_END>>>` encoding, the `matrxBroker` block type, its
> parser/model/renderer, and the `broker` stream event were all removed from every repo.
> Every mention of them below describes the system as it WAS; do not build against it.
> Current protocol: `docs/protocol/MATRX_ENVELOPE.md`.

Here is the complete picture of the streaming protocol.

---

## 1. All Event Types — `types/python-generated/stream-events.ts`

This file is auto-generated from Python Pydantic models. There are **16 event types** in the `EventType` const enum:

```5:22:types/python-generated/stream-events.ts
export const EventType = {
  CHUNK: "chunk",
  REASONING_CHUNK: "reasoning_chunk",
  PHASE: "phase",
  WARNING: "warning",
  INFO: "info",
  DATA: "data",
  INIT: "init",
  COMPLETION: "completion",
  ERROR: "error",
  TOOL_EVENT: "tool_event",
  BROKER: "broker",
  HEARTBEAT: "heartbeat",
  END: "end",
  CONTENT_BLOCK: "content_block",
  RECORD_RESERVED: "record_reserved",
  RECORD_UPDATE: "record_update",
} as const;
```

### Payload Interfaces (lines 66–166)

Each event type has a dedicated payload interface:

| Event | Payload Interface | Key Fields |
|---|---|---|
| `chunk` | `ChunkPayload` | `text` |
| `reasoning_chunk` | `ReasoningChunkPayload` | `text` |
| `phase` | `PhasePayload` | `phase` (closed enum of 12 values) |
| `warning` | `WarningPayload` | `code`, `system_message`, `user_message?`, `level?`, `recoverable?`, `metadata?` |
| `info` | `InfoPayload` | `code`, `system_message`, `user_message?`, `metadata?` |
| `data` | `DataPayload` / `TypedDataPayload` | `type` discriminator + per-type fields |
| `init` | `InitPayload` | `operation`, `operation_id`, `parent_operation_id?`, `metadata?` |
| `completion` | `CompletionPayload` | `operation`, `operation_id`, `status`, `result?` |
| `error` | `ErrorPayload` | `error_type`, `message`, `user_message?`, `code?`, `details?` |
| `tool_event` | `ToolEventPayload` | `event` (7 sub-types), `call_id`, `tool_name`, `timestamp?`, `message?`, `show_spinner?`, `data?` |
| `broker` | `BrokerPayload` | `broker_id`, `value`, `source?`, `source_id?` |
| `heartbeat` | `HeartbeatPayload` | `timestamp?` |
| `end` | `EndPayload` | `reason?` |
| `content_block` | `ContentBlockPayload` | `blockId`, `blockIndex`, `type`, `status`, `content?`, `data?`, `metadata?` |
| `record_reserved` | `RecordReservedPayload` | `db_project`, `table`, `record_id`, `status?`, `parent_refs?`, `metadata?` |
| `record_update` | `RecordUpdatePayload` | `db_project`, `table`, `record_id`, `status`, `metadata?` |

### The Discriminated Union (line 513)

```513:529:types/python-generated/stream-events.ts
export type TypedStreamEvent =
  | ChunkEvent
  | ReasoningChunkEvent
  | PhaseEvent
  | WarningEvent
  | InfoEvent
  | TypedDataEvent
  | InitEvent
  | CompletionEvent
  | ErrorEvent
  | ToolEventEvent
  | BrokerEvent
  | HeartbeatEvent
  | EndEvent
  | ContentBlockEvent
  | RecordReservedEvent
  | RecordUpdateEvent;
```

### Typed Data Payload Union (16 sub-types, line 282)

The `data` event is itself discriminated by a `type` field:

```282:298:types/python-generated/stream-events.ts
export type TypedDataPayload =
  | AudioOutputData
  | CategorizationResultData
  | ConversationIdData
  | ConversationLabeledData
  | FetchResultsData
  | FunctionResultData
  | ImageOutputData
  | PodcastCompleteData
  | PodcastStageData
  | QuestionnaireDisplayData
  | ScrapeBatchCompleteData
  | SearchErrorData
  | SearchResultsData
  | StructuredInputWarningData
  | VideoOutputData
  | WorkflowStepData;
```

### Tool Event Sub-types (7 sub-events, line 47)

```47:54:types/python-generated/stream-events.ts
export type ToolEventType =
  | "tool_started"
  | "tool_progress"
  | "tool_step"
  | "tool_result_preview"
  | "tool_completed"
  | "tool_error"
  | "tool_delegated";
```

### Type Guards (lines 532–594)

16 type guard functions, one per event: `isChunkEvent()`, `isReasoningChunkEvent()`, `isPhaseEvent()`, etc.

---

## 2. Event Routing Logic — `process-stream.ts`

The complete if/else chain in `processStream()` starts at line 165 and runs through line 722. Here's the routing logic with every branch:

```165:722:features/agents/redux/execution-system/thunks/process-stream.ts
  for await (const event of events) {
    totalEvents++;
    const now = performance.now();

    dispatch(
      appendRawEvent({
        requestId,
        event: {
          idx: totalEvents,
          timestamp: now,
          eventType: event.event,
          data: event.data,
        },
      }),
    );

    if (isChunkEvent(event)) {
      // ... append text chunk, track JSON, manage text/reasoning run state
    } else if (isReasoningChunkEvent(event)) {
      // ... append reasoning text, manage reasoning run state
    } else {
      // Close any open text/reasoning runs first, then:

      if (isPhaseEvent(event)) {
        // dispatch setCurrentPhase + appendTimeline
      } else if (isInitEvent(event)) {
        // dispatch trackOperationInit + appendTimeline
      } else if (isCompletionEvent(event)) {
        // dispatch trackOperationCompletion
        // if operation === "user_request" → extract CompletionStats, tokenUsage, finishReason
        // dispatch appendTimeline
      } else if (isTypedDataEvent(event)) {
        // dispatch appendDataPayload (always)
        // if type === "conversation_id" → setConversationId + sync agent conversations
        // else if type === "conversation_labeled" → setConversationLabel + patchMetadata
        // else → promote to content block via upsertContentBlock (known types get their type, unknown → "unknown_data_event")
        // dispatch appendTimeline
      } else if (isToolEventEvent(event)) {
        // if event === "tool_delegated" → addPendingToolCall + upsertToolLifecycle(isDelegated) + setInstanceStatus("paused")
        // else → upsertToolLifecycle with status derived from sub-event name
        //   special fields for tool_completed (result), tool_result_preview (preview), tool_error (errorType)
        // dispatch appendTimeline
      } else if (isContentBlockEvent(event)) {
        // dispatch upsertContentBlock + appendTimeline
      } else if (isWarningEvent(event)) {
        // dispatch addWarning + appendTimeline
      } else if (isInfoEvent(event)) {
        // dispatch addInfoEvent + appendTimeline
      } else if (isRecordReservedEvent(event)) {
        // dispatch upsertReservation
        // if table === "cx_conversation" → setConversationId + sync
        // dispatch appendTimeline
      } else if (isRecordUpdateEvent(event)) {
        // dispatch upsertReservation(status update) + appendTimeline
      } else if (isErrorEvent(event)) {
        // dispatch setRequestStatus("error") + setInstanceStatus("error") + appendTimeline
      } else if (isEndEvent(event)) {
        // if status !== "error" → setRequestStatus("complete") + setInstanceStatus("complete")
        // dispatch appendTimeline
      } else if (isBrokerEvent(event)) {
        // dispatch appendDataPayload({broker: data}) + appendTimeline
      } else if (isHeartbeatEvent(event)) {
        // dispatch appendTimeline only
      } else {
        // UNKNOWN → console.warn + appendTimeline(kind: "unknown")
      }
    }
  }
```

**All 16 event types are handled.** Every event (including unknown ones) gets `appendRawEvent` and `appendTimeline` for full debug visibility.

---

## 3. BlockType Enum and BlockDataTypeMap — `content-blocks.ts`

### BlockType (28 values)

```13:48:types/python-generated/content-blocks.ts
export const BlockType = {
  TEXT: "text",
  CODE: "code",
  TABLE: "table",
  THINKING: "thinking",
  REASONING: "reasoning",
  CONSOLIDATED_REASONING: "consolidated_reasoning",
  IMAGE: "image",
  VIDEO: "video",
  TASKS: "tasks",
  TRANSCRIPT: "transcript",
  STRUCTURED_INFO: "structured_info",
  MATRX_BROKER: "matrxBroker",
  QUESTIONNAIRE: "questionnaire",
  FLASHCARDS: "flashcards",
  QUIZ: "quiz",
  PRESENTATION: "presentation",
  COOKING_RECIPE: "cooking_recipe",
  TIMELINE: "timeline",
  PROGRESS_TRACKER: "progress_tracker",
  COMPARISON_TABLE: "comparison_table",
  TROUBLESHOOTING: "troubleshooting",
  RESOURCES: "resources",
  DECISION_TREE: "decision_tree",
  RESEARCH: "research",
  DIAGRAM: "diagram",
  MATH_PROBLEM: "math_problem",
  INFO: "info",
  TASK: "task",
  DATABASE: "database",
  PRIVATE: "private",
  PLAN: "plan",
  EVENT: "event",
  TOOL: "tool",
  SEARCH_REPLACE: "search_replace",
} as const;
```

### BlockDataTypeMap

```450:478:types/python-generated/content-blocks.ts
export interface BlockDataTypeMap {
  text: null;
  code: CodeBlockData;
  table: TableBlockData;
  thinking: null;
  reasoning: null;
  consolidated_reasoning: ConsolidatedReasoningBlockData;
  image: ImageBlockData;
  video: VideoBlockData;
  flashcards: FlashcardsBlockData;
  transcript: TranscriptBlockData;
  tasks: TasksBlockData;
  quiz: QuizBlockData;
  presentation: PresentationBlockData;
  cooking_recipe: RecipeBlockData;
  timeline: TimelineBlockData;
  progress_tracker: ProgressTrackerBlockData;
  comparison_table: ComparisonBlockData;
  troubleshooting: TroubleshootingBlockData;
  resources: ResourcesBlockData;
  research: ResearchBlockData;
  decision_tree: DecisionTreeBlockData;
  diagram: DiagramBlockData;
  math_problem: MathProblemBlockData;
  questionnaire: QuestionnaireBlockData;
  matrxBroker: MatrxBrokerBlockData;
  diff: DiffBlockData;
  search_replace: SearchReplaceBlockData;
}
```

---

## 4. Socket.IO System — Disabled but Still Present

The `lib/redux/socket-io/` directory contains 32 files with a full Socket.IO infrastructure. However, **it is effectively disabled**. The smoking gun is in `socketConnectionManager.ts` line 118-121:

```118:123:lib/redux/socket-io/connection/socketConnectionManager.ts
  private async establishConnection(
    connectionId: string,
    url: string,
    namespace: string,
  ): Promise<any> {
    // Socket.io disabled — server no longer supports it.
    console.warn(
      `[SOCKET] Connection attempt blocked — socket.io is disabled (connectionId: ${connectionId})`,
    );
    return null;
```

The `establishConnection` method returns `null` immediately — all code after line 123 is unreachable. The system was designed to connect to the Python backend at `BACKEND_URLS.production` (or localhost:8000) on namespace `/UserSession`, but the Python server no longer supports Socket.IO. The middleware in `socketMiddleware.ts` still wires up Redux actions, but since no socket ever connects, it's dead code.

**The active streaming transport is pure HTTP NDJSON** — there is no websocket/Socket.IO path used in production.

---

## 5. NDJSON Stream Parser — `lib/api/stream-parser.ts`

The parser is `parseNdjsonStream()` in `lib/api/stream-parser.ts`. It uses a **read-ahead queue architecture** to avoid TCP backpressure issues:

```62:77:lib/api/stream-parser.ts
export function parseNdjsonStream(
  response: Response,
  signal?: AbortSignal,
): {
  events: AsyncGenerator<StreamEvent, void, undefined>;
  requestId: string | null;
  conversationId: string | null;
} {
  const requestId = response.headers.get("X-Request-ID");
  const conversationId = response.headers.get("X-Conversation-ID");
  return {
    events: _parseNdjsonStream(response, signal),
    requestId,
    conversationId,
  };
}
```

The internal `_parseNdjsonStream` (line 79-215) works as:

1. **Background reader loop** (line 121-179): Reads from `response.body.getReader()`, splits on `\n`, `JSON.parse`s each line, pushes `StreamEvent` objects into a queue. Never blocks on the consumer.
2. **Consumer async generator** (line 186-211): Yields events from the queue, sleeping when empty via a Promise + wakeup counter pattern.
3. **Backpressure fix**: The read-ahead queue decouples reader from consumer — the comment at line 91 explains this was added because large payloads (e.g. Brave search results) would cause React's processing to stall `reader.read()`, filling the server-side send buffer and dropping events.

The file also exports a **callback-based consumer** `consumeStream()` (line 285-341) with the `StreamCallbacks` interface (line 255-273) for non-Redux consumers.

---

## 6. Streaming Protocol Documentation

Two documentation files exist:

### `event-change-documentation.md` (640 lines)

The complete V2 streaming protocol guide. Key sections:

- **Section 2**: Complete event type reference table (all 16 events)
- **Section 3**: V1-to-V2 migration details for each changed event (`status_update` -> `phase`, old `completion` -> `init`/`completion` pairs, `data` type discriminator change)
- **Section 4**: Record reservation system (`record_reserved`/`record_update` lifecycle)
- **Section 6**: Full event timeline from a real chat request showing exact order
- **Section 7**: Error recovery protocol
- **Section 9**: V1-to-V2 migration checklist

### `event-change-code-analysis.md` (109 lines)

A gap analysis listing every file that ties into the streaming contract — the complete "blast radius" for the V1 -> V2 migration. Organized by layer (generated types, Redux, agent UI, HTTP utilities, chat protocol, CX conversation, public chat, Socket.IO, research, scraper, demos).

---

## Summary: The Protocol at a Glance

**Transport**: HTTP POST -> NDJSON response (`\n`-delimited JSON lines)

**Envelope**: `{"event": "<type>", "data": {...}}`

**Headers**: `X-Request-ID`, `X-Conversation-ID`

**16 event types**, in typical order during a chat request:
1. `phase` ("connected") — stream established
2. `data` (type: "conversation_id") — conversation ID assigned
3. `record_reserved` — DB rows pre-created (cx_conversation, cx_user_request, cx_request, etc.)
4. `phase` ("processing") — validation
5. `init` (operation: "user_request") — operation lifecycle start
6. `warning` — optional config warnings
7. `info` — optional progress FYIs
8. `reasoning_chunk` — reasoning tokens (if model supports it)
9. `chunk` — LLM response tokens
10. `tool_event` — tool lifecycle (started/progress/step/preview/completed/error/delegated)
11. `content_block` — structured blocks (code, quiz, timeline, etc.)
12. `data` (type: "conversation_labeled") — async labeling result
13. `record_update` — DB rows status changes
14. `completion` (operation: "user_request") — operation lifecycle end with stats
15. `error` — fatal error (if any)
16. `end` — stream termination

`broker` and `heartbeat` can appear at any point. Socket.IO exists as dead code — all streaming is pure HTTP NDJSON.