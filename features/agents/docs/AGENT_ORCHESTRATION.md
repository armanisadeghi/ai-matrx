# AGENT_ORCHESTRATION.md

**Status:** `active`
**Tier:** 1 (sub-feature of `features/agents/`)
**Last updated:** `2026-04-22`

> Read [`features/agents/FEATURE.md`](../FEATURE.md) first. This doc covers what happens inside a single agent turn — iteration, retries, self-correction, and state persistence.

---

## Purpose

A single user-visible "turn" is rarely a single LLM call. The orchestrator drives a loop that may include: generating a response, calling tools, receiving tool results, re-generating, retrying failed tool calls, and persisting state. This doc covers the knobs and invariants.

---

## The loop

```
turn start
  │
  ├─> LLM generates
  │
  ├─> tool calls requested?
  │     ├─ yes → execute tools (server-side + durable + widget delegated)
  │     │         ├─ widget tools: fire-and-forget via client delegation, stream NOT paused
  │     │         └─ non-widget delegated tools: stream pauses, client submits results
  │     │           │
  │     │           └─> POST /ai/conversations/{id}/tool_results
  │     │                 │
  │     │                 └─> loop resumes with tool results → LLM generates again
  │     └─ no → final response, stream ends
  │
  └─> turn end
```

### Iteration cap

`builder.maxIterations` limits how many LLM↔tools cycles a single turn may run. Default is set per agent in the Builder. Exceeding it fires a `warning` event and terminates with a final response.

### Per-iteration retries

`builder.maxRetriesPerIteration` caps retries for transient failures inside a single iteration (e.g. tool timeouts, model 5xx). Applies to Builder mode; normal consumer surfaces use server defaults.

### Self-correction

When a tool fails in a recoverable way, the orchestrator feeds the error back to the LLM as a structured tool_result with `status: error`. The LLM may retry with corrected inputs. This is indistinguishable from the LLM naturally reconsidering — it's just the loop executing again.

---

## Three kinds of tool calls

| Kind | Executed where | Stream behavior |
|---|---|---|
| **Server-side tools** | Server (Python tool executors) | Stream continues; tool result flows inline as part of the next model generation. |
| **Durable delegated tools** | Server emits `tool_delegated` → client executes → client POSTs result | Stream **pauses** until the client submits results via `POST /ai/conversations/{id}/tool_results`. See [`/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/RESUME-AND-RECOVERY.md`]/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/RESUME-AND-RECOVERY.md). |
| **Widget tools** | Client (via `useWidgetHandle`) | Stream is **NOT paused**. Widget actions are fire-and-forget; results batched via microtask queue and POSTed in one consolidated request. See [`WIDGET_HANDLE_SYSTEM.md`](./WIDGET_HANDLE_SYSTEM.md). |

The widget-tool non-pause is a deliberate performance choice: widget actions are UI-effectful, not semantically critical for the next LLM iteration.

---

## State persistence

All state the server needs for a long-running task is persisted in `cx_conversation` + related tables. Client state is transient — it rehydrates from server on page refresh via `resume-conversation.ts`.

What survives a refresh:
- Conversation history
- Tool call lifecycle (completed + in-flight)
- Pending delegated tool calls (client must POST results to resume)
- Reserved record IDs (announced via `record_reserved` stream events)

What does NOT survive:
- Ephemeral conversations (by design — no DB row)
- Client UI state (display mode, expansion, panels) unless the caller persists it

---

## Builder advanced settings

These are Builder-only and travel on `ConversationInvocation.builder`:

| Setting | Role |
|---|---|
| `debug` | Enables extra logging + debug stream events |
| `store` | If false, the invocation is NOT persisted (ephemeral-like even in manual mode) |
| `maxIterations` | Orchestrator iteration cap |
| `maxRetriesPerIteration` | Retries for transient failures per iteration |
| `useStructuredSystemInstruction` | Flag: use structured instruction object instead of flat prompt |
| `structuredInstruction` | The structured instruction object |

**None of these are applicable to Runner/Chat/Shortcut/App invocations.** The server uses its own defaults there.

---

## Key flows

### Flow 1 — Simple one-shot turn

1. User sends message. Turn starts.
2. LLM generates, no tools requested.
3. Stream ends with completion.

### Flow 2 — Tool-heavy turn

1. User sends message. LLM requests 3 server-side tools.
2. Server runs them sequentially, feeds results back to LLM.
3. LLM generates final response.
4. Stream ends.

### Flow 3 — Durable delegated tool

1. LLM requests a delegated tool (e.g. external API via MCP that needs client-side auth).
2. Server emits `tool_delegated`, pauses stream.
3. Client receives event, executes tool, posts results to `/ai/conversations/{id}/tool_results`.
4. Server resumes, continues orchestration loop.

### Flow 4 — Widget action during stream

1. LLM requests `widget_text_replace`.
2. Server emits `tool_delegated`; client `process-stream.ts` branches on `isWidgetActionName(tool_name)`.
3. `dispatchWidgetAction` routes to the matching handle method, batches through microtask queue.
4. One consolidated `POST /ai/conversations/{id}/tool_results` covers all widget actions in the batch.
5. Stream continues uninterrupted.
6. On stream end, `handle.onComplete` fires regardless of display mode.

### Flow 5 — Iteration cap hit

1. Agent loops through 10 iterations without resolving (tools keep calling tools).
2. `maxIterations` reached → orchestrator terminates with a `warning` event and a final response explaining it hit the cap.
3. No error — this is graceful termination.

---

## Invariants & gotchas

- **Widget tools NEVER pause the stream.** They are fire-and-forget. Do not add widget tools that need synchronous LLM feedback; use durable delegated tools for that.
- **Durable tool results MUST be POSTed to resume.** If the client drops the ball, the conversation hangs until the user refreshes → `resume-conversation.ts` rehydrates + reports pending tools.
- **Client state is not load-bearing for the agent.** Rehydrate from server; don't try to restore client-only ephemeral state across refresh.
- **`maxIterations` is a safety net, not a design tool.** If you routinely hit it, restructure the agent's tools or prompt.
- **Builder advanced settings don't apply outside Builder.** Setting `maxIterations` on a Runner invocation is a no-op.
- **Self-correction is implicit.** Do not add explicit retry-with-feedback logic in the orchestrator — the loop handles it via tool error payloads.

---

## Related

- [`/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/INVOCATION-CONTRACT.md`]/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/INVOCATION-CONTRACT.md) — endpoint routing
- [`/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/CLIENT-RUNTIME.md`]/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/CLIENT-RUNTIME.md) — wire protocol
- [`/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/RESUME-AND-RECOVERY.md`]/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/RESUME-AND-RECOVERY.md) — delegated tools contract
- [`WIDGET_HANDLE_SYSTEM.md`](./WIDGET_HANDLE_SYSTEM.md) — widget tools
- `features/tool-call-visualization/FEATURE.md` — rendering tool calls in the UI

---

## Change log

- `2026-04-22` — claude: initial doc. Builder advanced settings + iteration cap + tool-kind matrix extracted from source + existing docs.

---

> **Keep-docs-live:** any change to iteration, retry, or tool-kind semantics must update this doc. Changes to widget-vs-durable stream behavior must cross-update `WIDGET_HANDLE_SYSTEM.md` and `/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/RESUME-AND-RECOVERY.md`.
