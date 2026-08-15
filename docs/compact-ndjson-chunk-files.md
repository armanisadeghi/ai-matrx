# Compact NDJSON chunk format — files to update

Server now sends high-frequency lines as `{"e":"c","t":"..."}` (text) and `{"e":"r","t":"..."}` (reasoning) instead of full `event`/`data` objects. **`lib/api/stream-parser.ts` already normalizes these inside `parseNdjsonStream` / `consumeStream`.** Anything that parses NDJSON **without** that path must apply the same normalization (or call a shared helper).

## Must update (parses agent NDJSON strings / objects outside stream-parser)

| File | Why |
|------|-----|
| `features/tool-call-visualization/testing/stream-processing/ndjson.ts` | `parseNdjsonStringToStreamEvents` uses raw `JSON.parse` per line — no `normalizeCompactEvent`. Breaks captured/replayed tool-test NDJSON and `ndjsonToFoldState` / `ndjsonToRenderedToolCalls`. |

## Downstream of the above (ok once `ndjson.ts` normalizes)

| File | Why |
|------|-----|
| `features/tool-call-visualization/testing/stream-processing/fold-stream-events.ts` | Expects `event.event === "chunk"` / `"reasoning_chunk"` and `event.data`; fails on compact lines if fed unnormalized events. |

## Optional / edge cases

| File | Why |
|------|-----|
| `app/(public)/demos/api-tests/unified-chat/stream-event-classifier.ts` | Live unified-chat uses `parseNdjsonStream` (normalized). Only needed if **raw** compact objects are ever passed into `classifyEvent` (e.g. pasted logs). |

## Already covered (uses `parseNdjsonStream` or `consumeStream`)

Demo clients, test pages, FastAPI thunks (`submitChatFastAPI`, `submitAppletAgentThunk`, `executeMessageFastAPIThunk`), `call-api`, `backend-client`, `process-stream`, prompt-app renderers, `StreamAwareChatMarkdown` (when it parses via stream-parser), research/scraper hooks using `consumeStream`, etc. — **no change for compact chunks** as long as they keep using the shared parser.

## Socket.IO legacy

`lib/redux/socket-io/thunks/submitTaskThunk.ts` and related listeners use string/object socket payloads, not this NDJSON line format — **out of scope** unless the socket server starts emitting the same compact JSONL objects.

## Docs / examples (non-runtime; update when you refresh protocol docs)

Examples still show only the verbose shape: `types/python-generated/AI_CORE_API.md`, `/Users/armanisadeghi/code/common-docs/systems/research/STREAMING_GUIDE.md`, `features/agents/redux/execution-system/thunks/event-change-documentation.md`, and similar.
