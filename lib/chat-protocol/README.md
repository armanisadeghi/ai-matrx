# `lib/chat-protocol/`

Pure TypeScript helpers for turning raw chat inputs (stream events or DB rows) into a normalized, renderer-friendly shape. No React, no browser APIs — safe to import from any runtime.

## Files

| File | Purpose |
|---|---|
| `types.ts` | `CanonicalBlock` discriminated union (`TextBlock`, `ThinkingBlock`, `MediaBlock`, `ToolCallBlock`, `ErrorBlock`), `CanonicalMessage`, `StreamingState`, and narrowing helpers (`isToolCallBlock`, etc.). |
| `from-stream.ts` | `buildCanonicalBlocks(events: TypedStreamEvent[])`, `buildStreamingState(...)`, `buildCanonicalMessageFromStream(...)`, `extractPersistableToolBlocks(...)`. Converts wire events to normalized blocks. |
| `from-db.ts` | `buildCanonicalMessages(cxMessages, cxToolCalls?)` and `buildCanonicalMessage(...)`. Exported but not yet wired into app code — retained for the SSR/DB rendering path. |
| `index.ts` | Barrel — always import from `@/lib/chat-protocol`, never from a subfile. |

## Scope

This package only produces **canonical blocks**. It is *not* the tool rendering system.

Tool rendering goes through **`features/tool-call-visualization/`**. That feature's renderer contract is `ToolRendererProps { entry: ToolLifecycleEntry, events?: ToolEventPayload[], ... }` — it does not consume `CanonicalBlock` or `ToolCallBlock` directly.

Non-agent-runner surfaces that already speak in `CanonicalBlock` (`StreamAwareChatMarkdown`, public-chat `MessageDisplay`) map each `ToolCallBlock` into a synthetic `ToolLifecycleEntry` before handing it to `ToolCallVisualization`. That mapping is done at the call site, not here.

## Stream contract

`buildCanonicalBlocks` consumes `TypedStreamEvent[]` from `types/python-generated/stream-events.ts` and folds:

- `chunk` / `reasoning_chunk` → merged into trailing `TextBlock` / `ThinkingBlock`
- `tool_event` (`tool_started`, `tool_progress`, `tool_step`, `tool_result_preview`, `tool_completed`, `tool_error`) → a single `ToolCallBlock` per `call_id`, anchored at first-appearance position
- `error` → `ErrorBlock`

All other events (`status_update`, `broker`, `heartbeat`, `end`, `completion`) carry no renderable content and are ignored.

## Versioning

`PROTOCOL_VERSION` in `types.ts` is bumped when `CanonicalMessage` / `CanonicalBlock` shape changes. Add a migration shim in the same release.
