# Streaming Contract (Client ↔ Python Backend)

Describes the NDJSON stream contract that every Matrx client consumes. The Python reference implementation lives in `matrx_connect.emitters.stream_emitter.StreamEmitter` (aidream repo). Web client enforcement of timing lives in `lib/net/stream-monitor.ts` — servers that violate the deadlines will have their streams aborted client-side with `HeartbeatTimeoutError`.

## Status

Wire format and timing are already implemented by the Python side (StreamEmitter, 5 s heartbeat default, `send_end` on every termination path including `fatal_error` and `send_cancelled`). The 19-scenario mock router at `POST /ai/mock-stream/{scenario}` exercises every failure mode this contract implies — use it for client conformance testing.

## Timing guarantees (server MUST meet)

| Phase | Deadline | Notes |
|---|---|---|
| HTTP connect → response headers | ≤ **15 s** | First byte of the response. |
| First event emitted | ≤ **15 s** after headers | Typically `{event:"phase", data:{phase:"connected"}}`. |
| Max silence between events | ≤ **20 s** | `HeartbeatPayload` fills gaps — default emit interval is 5 s. Client deadline is 30 s; the 15 s margin absorbs network jitter. |
| Absolute stream lifetime | ≤ **10 min** | Configurable per endpoint; client-side ceiling. |
| Stream termination | Always | Every path — success, error, fatal, cancel — emits `{event:"end", data:{reason}}` as the final event. |

## Wire format

All events are NDJSON (`\n`-delimited JSON), one object per line. Every line is:

```ts
type StreamEvent = {
  event: EventType;
  data: Record<string, unknown>;   // shape depends on `event`
};
```

No `seq` numbers; ordering is guaranteed by the stream itself. No `kind` field — the field is `event`.

### Event types

Authoritative enum: `matrx_connect.context.events.EventType`. Current set:

| `event` | Purpose | `data` shape (key fields) |
|---|---|---|
| `phase` | Lifecycle marker (`connected` → `processing` → `finalizing`, etc.) | `{ phase: string }` |
| `chunk` | Streamed text. Client parser may use compact form `{e:"c", t:"..."}` on the wire. | `{ text: string }` |
| `reasoning_chunk` | Streamed reasoning/thinking text. Compact form `{e:"r", t:"..."}`. | `{ text: string }` |
| `init` | Start of a logical operation (e.g. tool call, sub-task). | `{ operation, operation_id, ... }` |
| `completion` | End of a logical operation. | `{ operation, operation_id, status }` |
| `data` | Arbitrary structured payload for the UI. | `DataPayload` |
| `info` | Non-fatal advisory (code + message). | `{ code, system_message, user_message?, metadata }` |
| `warning` | Advisory about a delivered response (decorates, doesn't invalidate). | `{ code, level, system_message, user_message?, recoverable, metadata }` |
| `error` | Response failed. Use ONLY when content has NOT reached the client. | `{ error_type, message, user_message, code?, details? }` |
| `tool_event` | Tool call lifecycle (started, progress, result_preview, completed, error, delegated). | `ToolEventPayload` |
| `broker` | Broker variable update. | `{ broker_id, value, source?, source_id? }` |
| `render_block` | Structured UI block (text, timeline, quiz, etc.). | `{ blockId, blockIndex, type, status, content?, data?, metadata }` |
| `record_reserved` | DB record pre-allocated. | `{ db_project, table, record_id, status:"pending", ... }` |
| `record_update` | DB record transitioned. | `{ db_project, table, record_id, status, metadata }` |
| `heartbeat` | Keep-alive only; no semantic payload. | `{ timestamp: number }` |
| `end` | Final event. Always present. | `{ reason: "complete" \| "error" \| "cancelled" }` |

### Error vs warning discipline

`StreamEmitter.send_error` docstring is the source of truth:

- Use `error` ONLY when the response has NOT been delivered (API exceptions before any chunk, stream corruption in-flight, hard cancellation).
- Use `warning` when content was delivered but needs a caveat (unexpected `finish_reason`, truncation, post-response side-effect failure the user should know about).
- Never use `error` for post-response side effects (snapshot writes, labeling, caching).

## Client behavior (`lib/net/stream-monitor.ts`)

- **Before first event**: 15 s timeout. On expiry → `ConnectTimeoutError`, request marked `phase: "timed-out"`.
- **Between events**: 30 s timeout. On expiry → `HeartbeatTimeoutError`, request marked `"timed-out"`.
- **Absolute ceiling**: 10 min (`maxLifetimeMs: 600_000`). On expiry → `TotalTimeoutError`.
- **On `{event:"end"}`**: stream completes normally; request marked `"completed"`.
- **On abort**: client cancels via `AbortController`; server stops via its own task cancellation (already wired in `StreamEmitter.generate`).

## Non-streaming (request/response) endpoints

- Connect timeout: 15 s
- Total timeout: 30 s (configurable per endpoint)
- Initialization/bootstrap fetches: 15 s + up to 2 retries (`lib/net/retry.ts`)

## Mock endpoints (server-side conformance suite)

The Python side exposes `POST /ai/mock-stream/{scenario}` with 19 scenarios. Use them to drive the resilience lab:

- `happy-path`, `slow-chunks`, `rapid-chunks`, `oversized-chunk`
- `headers-silence`, `phase-then-silence`, `heartbeat-only`
- `truncated-ndjson`, `partial-json-recovery`, `empty-ndjson-lines`
- `no-end-event`, `duplicate-end`, `error-no-end`, `chunked-error`
- `html-response`, `503-error`, `reset-mid-stream`
- `unknown-event-types`, `out-of-order-events`

Catalogue: `GET /ai/mock-stream/scenarios`.
