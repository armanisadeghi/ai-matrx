# STREAMING_SYSTEM.md

**Status:** `active` — canonical contract
**Tier:** 1 (cross-cutting; anchored here because the agents system owns the canonical implementation)
**Last updated:** `2026-06-23`

> This is the **single source of truth** for streaming across the app. Chat, conversation, artifacts, tool calls, and every long-running endpoint must conform. The detailed event-type and phase-value reference lives in [`STREAM_STATUS_LIFECYCLE.md`](./STREAM_STATUS_LIFECYCLE.md) — this doc is the higher-level contract and usage guide.

---

## Purpose

Every long-running operation in the app streams NDJSON. The stream carries the model output, tool lifecycle, phase transitions, record reservations, and errors. The client parses it into Redux (`activeRequests` slice) and every UI surface reads from there.

The contract is formalized because:
1. Agents, Chat, Runner, Shortcuts, Apps, and data-ingestion pipelines all use it.
2. Clients need timeout and heartbeat guarantees to handle network flake.
3. Observability, debugging, and replay all depend on a stable event shape.

---

## The wire format

- `Content-Type: application/x-ndjson`
- One JSON object per line, terminated by `\n`
- Every event has a `type` discriminator
- Ordering is load-bearing — events arrive in the order they happened

### Event types (summary — full detail in `STREAM_STATUS_LIFECYCLE.md`)

| Type | Purpose |
|---|---|
| `chunk` | Token-by-token LLM text |
| `reasoning_chunk` | Token-by-token thinking/reasoning |
| `phase` | State machine transition (`connected → processing → generating → using_tools → persisting → complete`) |
| `init` / `completion` | Identified operation bracket (user_request, llm_request, tool_execution, sub_agent, persistence) |
| `data` | Typed discriminated payload — switch on `data.type` |
| `warning` / `info` | Non-fatal notifications (warning has code + severity) |
| `provider_retry` | Recoverable provider overload/backoff state (`scheduled`, `retrying_now`, `recovered`, `cancelled`, `suspended`) |
| `tool_event` | Tool lifecycle update |
| `content_block` | Structured block streaming (artifacts, code, etc.) |
| `record_reserved` / `record_update` | DB row pre-announced then updated |
| `error` | Fatal — stream is about to end |
| `end` | Transport-level termination |
| `heartbeat` | Keep-alive |
| `broker` | Direct UI state update (frozen — no new usage) |

---

## Heartbeat + timeout contract

- Server emits `heartbeat` every **5s** (matrx-connect `StreamEmitter`, independent asyncio task) during the whole stream. Each beat carries `seq` (monotonic per stream — a mid-stream reset to 1 proves the heartbeat task died and auto-restarted) and `late_by_seconds` (set when the tick fired >2× late — event-loop starvation evidence).
- Client runs a timeout monitor (`lib/net/stream-monitor.ts`) that resets on every received event, including heartbeat. Watchdog default: **30s** (`runAiStream.heartbeatTimeoutMs`).
- Missing heartbeats beyond the threshold throws `HeartbeatTimeoutError` and aborts the fetch.
- **A dead stream is a DISPLAY problem, not a data problem.** The server runs `detach_on_disconnect=True` — it finishes and persists the turn regardless. The client therefore: (1) flushes + commits everything already streamed (`process-stream` commit path runs even on failure — partial content NEVER vanishes); (2) renders the error **below** the streamed content, never instead of it (`AgentAssistantMessage`); (3) self-heals via `recover-dropped-stream.thunk.ts` — polls `cx_user_request` for terminal status, rehydrates via `loadConversation`, and clears the error when the server completed the turn.

---

## Phase machine

Phases are a closed enum representing what the server is doing right now. Clients use phases to drive status UIs.

Standard happy path:

```
connected → processing → generating → using_tools → generating → persisting → complete
```

Phases can loop (`using_tools ↔ generating` is the tool-call cycle). Clients should handle any phase in any order — do not encode sequence assumptions.

Full phase list: `STREAM_STATUS_LIFECYCLE.md`.

---

## Operation brackets (`init` / `completion`)

Every long operation is bracketed:

```
init: { operation: "llm_request", operation_id: "abc" }
...chunks, phases, tool events...
completion: { operation: "llm_request", operation_id: "abc", result_summary: {...} }
```

Five operations are tracked: `user_request`, `llm_request`, `tool_execution`, `sub_agent`, `persistence`.

The Redux slice stores these as a tree under `activeRequests[requestId].operations`. Clients read this to show "thinking ↔ using tools ↔ synthesizing" phases.

---

## Redux integration

State lives under `activeRequests` keyed by request ID. Each request's slice tracks:

- `accumulatedText` — concatenated chunks
- `reasoningText` — concatenated reasoning chunks
- `currentStatus` / `statusHistory` — phase and phase history
- `contentBlocks` / `contentBlockOrder` — streamed structured blocks keyed by blockId
- `toolLifecycle` — per-callId state machine for each tool call
- `pendingToolCalls` — durable + widget delegations awaiting client action
- `completion` — terminal result
- `error` — verbatim backend `ErrorPayload` (`error_type`, `message`, `user_message?`, `code?`, `details?`); `null` until an error event fires. The client never collapses `message` into `user_message` — both are preserved. There is no `is_fatal` flag on the wire; error events ARE fatal by definition (stream killed) — derive from `request.status === "error"`.
- `providerRetry` / `providerRetryHistory` — recoverable provider-capacity retry state. Anthropic 529 overloads render as a live card with countdown + server-backed Cancel / Retry now controls; they do not populate `error` unless the server later emits a fatal `error` event.
- `dataPayloads` — catch-all for unstructured `data` events only (typed events go to their dedicated buckets)

See [`AGENTS_OVERVIEW.MD`](./AGENTS_OVERVIEW.MD) §Layer 3 for the full slice inventory.

---

## Client side — where parsing happens

- `lib/api/stream-parser.ts` — NDJSON parser. Reads ReadableStream, splits on newlines, JSON-parses each line.
- `features/agents/redux/execution-system/process-stream.ts` — the dispatcher. Takes a parsed event, routes to the right action on `activeRequests`, `instanceConversationHistory`, or tool result handlers.
- `features/agents/redux/execution-system/thunks/execute-instance.thunk.ts` — the convergence point. Fires fetch, pipes to parser, pipes to process-stream.

---

## Record reservations

Before the DB row exists, the server announces it with its UUID:

```
record_reserved: { table: "cx_conversation", id: "abc...", ... }
```

The client stores the reservation immediately so optimistic UI can link to the conversation or reference its ID. Later `record_update` events fire as the row's status advances (`pending → persisted → error`).

This is how the client knows the conversation ID mid-stream, before persistence completes.

---

## Durable + widget tool integration

When the server emits `tool_delegated` (a specific flavor of `tool_event`):

- **Widget tools** (name matches `isWidgetActionName`): the stream **continues**. Client fires the widget action and batches results for one consolidated `POST /ai/conversations/{id}/tool_results`. See [`WIDGET_HANDLE_SYSTEM.md`](./WIDGET_HANDLE_SYSTEM.md).
- **Non-widget delegated tools**: the stream **pauses**. Client executes, POSTs result, server resumes. See [`DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md`](./DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md).

---

## Invariants & gotchas

- **NDJSON, not SSE.** Do not add `data: ` prefixes or `event: ` lines. One JSON per line.
- **Heartbeat is MANDATORY** for any stream expected to run longer than ~15s. Without heartbeat the client will time out.
- **`end` is the transport signal, `completion` is the semantic signal.** A well-formed stream emits both.
- **`error` events are fatal.** The stream ends right after. For recoverable issues, use `warning`.
- **Ordering matters.** A `phase: "complete"` before all `content_block` deltas is a bug.
- **`data` events are the fallback bucket** for unstructured payloads. If you find yourself adding a new typed stream concept, prefer a new event `type`, not overloading `data`.
- **Server is source of truth for conversationId.** Clients never mint one. Wait for `record_reserved` for `cx_conversation`.
- **The `broker` event type is frozen.** Do not introduce new usage; it's legacy direct UI state updates.
- **Do NOT add a new stream event type without updating this doc + `STREAM_STATUS_LIFECYCLE.md`.**

---

## Beyond agents — who else streams

The same contract applies to:

- Data ingestion pipelines (scraper, PDF extractor, research) — see `features/scraper/FEATURE.md`
- Any `app/api/*` route that runs >2s
- Agent apps public execution — see `features/agent-apps/FEATURE.md`
- Tool call visualization overlays — see `features/tool-call-visualization/FEATURE.md`

If you build a new long-running endpoint, conform to this contract. Do not invent a second streaming protocol.

---

## Related

- [`STREAM_STATUS_LIFECYCLE.md`](./STREAM_STATUS_LIFECYCLE.md) — detailed event + phase reference
- [`WIDGET_HANDLE_SYSTEM.md`](./WIDGET_HANDLE_SYSTEM.md) — widget tool stream integration
- [`DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md`](./DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md) — durable delegated tools
- [`AGENT_ORCHESTRATION.md`](./AGENT_ORCHESTRATION.md) — turn-level loop semantics
- [`PYTHON_RESUME_SPEC.md`](./PYTHON_RESUME_SPEC.md) — failure recovery + truncation contract for the Python team (atomic retry, last-good-step resume, `record_resumed` event)

---

## Change log

- `2026-06-23` — codex: **Provider-overload retry is first-class stream state.** Backend `provider_retry` events (Anthropic 529/provider overloaded) now regenerate into `types/python-generated/stream-events.ts`, route through `process-stream`, store latest/history on `activeRequests`, append a `provider_retry` timeline entry, and count in client metrics. `AgentAssistantMessage` renders a compact `ProviderRetryCard` during live overload waits: provider-busy copy, retry attempt, countdown, Cancel, and Retry now. Button clicks call the server action URLs from the payload through the same conversation-aware backend routing/auth used by `runAiStream`. `suspended` maps the conversation to the existing `paused` lifecycle instead of a fatal failed-turn UI.
- `2026-06-15` — claude: **A mid-turn error now holds its chronological position instead of floating to the bottom (streaming path only).** Same class of bug as the tool-ordering fix below, but for `error` events: an error the model emitted mid-turn and then recovered from (e.g. a `web.read` summarization sub-step that retried and succeeded) rendered as a trailing element at the BOTTOM of the message and slid further down as later iterations streamed in — even though the content flowed correctly. Root cause: errors were rendered by `AgentAssistantMessage`'s trailing `failedError` node, entirely OUTSIDE the chronological `selectUnifiedSlots` stream (the selector even discarded `error` timeline entries). Fix: `selectUnifiedSlots` now emits an inline `error` slot **only when content follows the error in the timeline** (a mid-turn error), pinned to that spot; `EnhancedChatMarkdown` renders it via the new self-contained `InlineAssistantError` (`components/mardown-display/chat-markdown/internal-handlers/InlineAssistantError.tsx`, reads `selectRequestError` by `requestId`, no Retry — a recovered mid-turn error isn't the turn's terminal state). `AgentAssistantMessage` suppresses its trailing copy via the new `selectHasInlineError` (derived from the same slot list, so the two can never disagree → no duplicate, no lost error). A **FATAL** error (nothing after it — the stream died) emits NO inline slot and is left to the trailing render exactly as before, Retry affordance and all — so the failed-turn UX is untouched. Presentation only; no wire/data-contract change; persistence and reload path unaffected (a recovered turn persists as `completed` and reloads with no error, as it did before).
- `2026-06-15` — claude: **Tool calls no longer drop below text during streaming (chronological-order fix, streaming path only).** A `text → tool_call → text` turn rendered live as `[merged text, tool]` — the tool card sank below all the prose — yet reloaded from the DB perfectly. Root cause: `StreamBlockAccumulator` (`redux/execution-system/utils/stream-block-accumulator.ts`) lives for the whole stream and was never told about tool calls, so text emitted AFTER a tool kept appending to the SAME `client_block_N` as the text before it. Both runs collapsed into one render block; the second run's `text_end` timeline entry got an empty `[blockStartIndex, blockEndIndex)` range, so `selectUnifiedSlots` emitted `[merged_text, tool]`. (The persisted/DB path was correct because `assembleMessageParts` rebuilds each run's text from `text_end.rawText`, flushing at tool boundaries.) Fix: new `StreamBlockAccumulator.breakTextBlock()` closes the current text block at a tool boundary so the next run opens a fresh block; `process-stream` calls it once per `tool_event` (before the tool's `appendTimeline`, after the generic `dispatchBatch()` flush). No-op when there is no open text to break. Presentation/segmentation only — no wire/data-contract change; persistence, bubble count, and the reload path are untouched.
- `2026-06-10` — claude: **Dropped-stream resilience — errors never wipe streamed content, and heartbeat timeouts self-heal.** Incident: a 31s server-side heartbeat gap during a 40s sandbox `shell_execute` made the client watchdog kill a healthy stream AND the error UI replaced the whole turn (the end-of-stream commit never ran, so every reserved assistant record stayed empty and was skipped as `isEmptyReservedAssistant`). Fixes: (1) `process-stream` wraps the event loop — on any stream failure it still flushes buffers and commits partial content to `messages.byId` (only the final iteration carries `_clientStatus:"error"`), then re-throws; (2) `AgentAssistantMessage` renders the error BELOW any existing content (error-only solely when nothing streamed); (3) new `recover-dropped-stream.thunk.ts` polls `cx_user_request` after a heartbeat timeout and rehydrates via `loadConversation` — completed turns clear the error with a "Connection recovered" toast; (4) server (aidream matrx-connect `StreamEmitter`): heartbeats now carry `seq` + `late_by_seconds`, scream to stderr on late ticks (loop starvation) or task death, and the heartbeat task auto-restarts if it dies mid-stream. Heartbeat interval documented as 5s (was wrongly noted as 10s).
- `2026-05-25` — claude: **Thinking/reasoning and tool calls now render as inline text, unified across stream / static / DB.** Reasoning is a new canonical `ThinkingTrace` (`components/mardown-display/blocks/thinking-reasoning/ThinkingTrace.tsx`): a quiet, text-based, click-to-expand line — collapsed by default (no box/border/gradient), the live tail streams in on one line, expand for the full trace. The old boxes (`ThinkingVisualization` / `ReasoningVisualization` / `ConsolidatedReasoningVisualization`) are now thin adapters over it, so every render path (`BlockRenderer` live + DB, legacy chat stream, demos) shows the identical trace. Tool calls collapsed to a single inline line by default with a proper error state — see `features/tool-call-visualization/FEATURE.md`. No wire/data-contract changes; this is presentation only.
- `2026-05-24` — claude: **Persisted failed turns now render identically to live errors.** A failed turn is kept in history (`cx_message.status='failed'`) and shown as a standalone error bubble with retry — see the chat route FEATURE.md Flow 4 and `CONVERSATION_FAILURE_AND_RETRY_FE_GUIDE.md`. Streaming-side change: on a `record_update` for `cx_message` with `status:"failed"`, `process-stream` now also patches the row's `metadata` (not status-only) so an in-session failure carries `{failed,error}` exactly as the DB serves it on reload — the renderer reads `metadata.error`. The error event handling is otherwise unchanged (`error` events stay fatal; `selectRequestError` still feeds the live bubble's friendly line + Details). Note: as of this date the deployed backend does not yet populate `metadata.error` (it lives on `cx_request.error`) nor accept `retry:true`; the client degrades gracefully.
- `2026-05-23` — claude: Status wording finalized (two distinct shimmer indicators). The **client pre-token** shimmer (`EnhancedChatMarkdown` `isWaitingForContent` branch) reads **"Processing…"** — the client handling/awaiting the request. The **server** `processing` phase label (`PHASE_LABELS` in `active-requests.selectors.ts`, rendered via `InlineStatusIndicator`) reads **"Planning…"** — the agent planning its response. On-screen order: client "Processing…" → server "Planning…" → "Generating…" / "Using tools…" / etc.
- `2026-05-23` — claude: **Pre-token loader is now a subtle ShimmerText, not "Initializing Matrx".** Follow-up to the entry below. Restoring the virtual streaming entry also un-blocked `EnhancedChatMarkdown`'s own `isWaitingForContent` branch, which was rendering the dramatic `MatrxMiniLoader` ("Initializing Matrx" + progress bar) during the pre-token window. Swapped it for the quiet left-to-right `ShimmerText` ("Processing…") — the same treatment used for server status messages. Extracted `ShimmerText` into a single shared primitive (`components/loaders/ShimmerText.tsx`) and pointed the two duplicate copies (`AgentStatusIndicator`, `AgentPlanningIndicator`) at it. The breathing orb in `AgentAssistantMessage` now renders ONLY during content phases (`text_streaming` / `interstitial`), so the engine's ShimmerText owns the pre-token/connecting beat and the two indicators never overlap. Net pre-content UX: subtle "Processing…" shimmer → orb once tokens flow → action bar at completion. Verified live: "Initializing Matrx" gone, "Processing…" shimmer at ~120ms, orb during streaming.
- `2026-05-23` — claude: **Pre-token indicator + error surfacing restored in the transcript.** Three coupled regressions fixed in the shared display path, so they land once for chat / run / build / widgets and all three endpoints (agents, conversation, manual). (1) `AgentConversationDisplay` had stopped synthesizing the virtual streaming entry, so whenever a request was active but the server had not yet reserved its assistant `cx_message` — the pre-token gap on *every* turn, and **permanently** on an immediate `Failed to fetch` (`chunkCount: 0`, `firstChunkAt: null`) — no assistant bubble rendered, leaving nowhere to show the indicator OR the error (the conversation just sat blank/stuck). Restored the synthetic `__streaming__` entry (`{ messageId: null, requestId: latestRequestId, isStreamActive: true }`); the `DisplayEntry` / `AssistantTurnGroupMember` interfaces already documented this null-`messageId` live entry, and `AssistantTurnGroup` already tolerated it — only the synthesis was missing. (2) `AgentAssistantMessage` now renders a two-state live indicator below the content, driven by `selectStreamPhase`: a brief **"Processing…" text on `connecting` (no animation)**, then the **`BreathingOrb`** (new primitive, ported from matrx-extend, SMIL-based) from `pre_token` through `interstitial`, unmounting at completion (its slot becomes the action bar). Server-driven statuses keep coming from the stream itself — that flow is untouched. The default-off `bufferStream` loader was swapped from `Loader2` to the orb for consistency. (3) The fatal-error branch now surfaces the real `error.user_message ?? error.message` (e.g. "Failed to fetch") via the new `selectRequestError(requestId)` selector, instead of a hardcoded "An error occurred during streaming."
- `2026-04-24` — claude: linked the new `PYTHON_RESUME_SPEC.md`. Documents the future `record_resumed` event, `cx_truncate_conversation_after` RPC, and `cx_message.last_completed_block_index`/`failure_reason` columns that the failure-recovery client flows are designed for.
- `2026-04-22` — claude: initial higher-level contract doc. Promotes the existing `STREAM_STATUS_LIFECYCLE.md` as the reference.

---

> **Keep-docs-live:** streaming is cross-cutting. Any change to event types, phase values, heartbeat timing, or NDJSON format must update this doc and `STREAM_STATUS_LIFECYCLE.md`. Every long-running endpoint depends on this contract being accurate.
