# Client-Handled Tool Calls

How to make the React frontend execute a tool call locally instead of the server. End-to-end contract, no surprises.

---

## Mental model

The AI loop decides what tool to call. The server normally executes it. If you tell the server **"this tool is mine — I'll execute it"** for a given request, the server:

1. Emits a `tool_event` with `event: "tool_delegated"` over the stream.
2. **Suspends the AI loop** on that call.
3. Waits for you to POST the result back.
4. Resumes the loop with your result and continues.

This per-conversation switch is **Arming**. Its wire field is `client_tools`;
frontend state lives in the `instanceClientTools` slice; aidream consumes it in
`tool_merge.py`. Arming is not a Binding and does not describe which Client is
running. It says only that this tool is live for this conversation right now.

---

## Two permanent paths to tool existence

### 1. Registered tool

A Registered tool has a durable row in `tool.definition`. To arm it for one
conversation, include its name in `client_tools`.

There is no "always client-handled" flag on the definition. Execution reach is
represented by a Binding to an Executor; default offering is represented by
Surface defaults; live UI availability is represented by Arming. Do not merge
those three questions into a tool-row flag.

### 2. Inline tool

An Inline tool is declared on the request and has no DB row. Inline tools are a
permanent, first-class capability for tools authored by an agent or user at
runtime. Never remove or discourage this path.

Durability decides which path is correct: did the tool exist before the request
arrived? No means Inline tool. Yes means Registered tool. A code-defined tool
that ships in this repo is durable and belongs in `tool.definition`, even if its
current implementation still sends an inline spec.

On the legacy wire, pass an inline definition in `custom_tools`; inline tools
are delegated to the caller because the server has no implementation for them.
The current frontend funnels both paths through `buildToolInjection` as
`ToolSpec` entries (`kind: "registered"` or `kind: "inline"`).

```ts
custom_tools: [
  {
    name: "open_file_in_editor",
    description: "Open a file in the user's IDE at a specific line.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute file path" },
        line: { type: "number", description: "1-indexed line number" }
      },
      required: ["path"]
    }
  }
]
```

---

## Endpoints that accept `client_tools` and `custom_tools`

All three streaming endpoints in `/ai/*` accept these fields on the request body:

| Endpoint | When to use |
|---|---|
| `POST /ai/manual` (alias: `/ai/chat`) | Starting a manual / chat-style turn |
| `POST /ai/agent/{agent_id}` (alias: `/ai/agents/{agent_id}`) | Starting an agent turn |
| `POST /ai/conversation/{conversation_id}` (alias: `/ai/conversations/{conversation_id}`) | Continuing an existing conversation |

Request body shape (shared across all three):

```ts
{
  // ...endpoint-specific fields (user_input, config_overrides, etc.)...

  client_tools: string[],           // names of DB tools YOU will execute
  custom_tools: CustomTool[],       // inline tools (always delegated)
}
```

Both default to `[]` — omit entirely if not using client tools.

---

## The stream event you listen for

When the AI loop hits a delegated tool, you receive a `tool_event` envelope with `event: "tool_delegated"`. It is already present in `aidream/api/generated/stream-events.ts`:

```ts
export interface ToolDelegatedToolEvent {
  event: "tool_delegated";
  call_id: string;        // REQUIRED — use this when posting the result
  tool_name: string;      // which tool the model invoked
  timestamp?: number;
  message?: string | null;
  show_spinner?: boolean;
  data: ToolDelegatedData; // { arguments: Record<string, unknown> }
}
```

To narrow it in your stream handler:

```ts
import type { ToolEventPayload } from "@/generated/stream-events";

if (event.type === "tool_event") {
  const payload = event.payload as ToolEventPayload;
  if (payload.event === "tool_delegated") {
    // payload.data.arguments is the args the model passed
    // payload.call_id is the handle you MUST echo back
    await runLocallyAndPostResult(payload);
  }
}
```

After you execute the tool locally, emit the exact same lifecycle other tools do (optional — purely for UI symmetry; the server does not need these):

| Event | When | Required? |
|---|---|---|
| `tool_delegated` | Sent by server — this is your trigger | — |
| `tool_started` | (optional) when you begin executing | No |
| `tool_progress` / `tool_step` | (optional) progress updates, UI only | No |
| `tool_completed` / `tool_error` | (optional) after you POST the result | No |

The server only cares about **the POST callback** described next.

---

## Posting the result back

Call this exactly once per delegated `call_id`:

```
POST /ai/conversation/{conversation_id}/tool_results
```

(Alias `POST /ai/conversations/{conversation_id}/tool_results` also works.)

Body:

```ts
{
  results: Array<{
    call_id: string;          // MUST match the call_id from tool_delegated
    tool_name: string;        // for logging / audit
    output?: unknown;         // success payload (string or JSON-serializable object)
    is_error?: boolean;       // default false
    error_message?: string;   // required when is_error === true
  }>;
}
```

You can batch multiple results in one POST if the model issued multiple tool calls in one iteration and you executed them concurrently. Typical pattern: one call per POST.

Response:

```ts
{ resolved: string[]; count: number }
// OR 404 if any call_ids were unknown:
{ message: string; not_found: string[]; resolved: string[] }
```

**Timing:** the server does NOT hold a connection open waiting for you — a delegated call HARD-SUSPENDS the loop (the stream ends) and the turn is persisted as `paused`. You may answer in seconds, minutes, hours, or weeks; when you POST results the server returns `continuation_needed` and you open `/resume`. The only timeout is a far-future server-side **abandonment backstop** on `cx_tool_call.expires_at` (default 30 days, per-tool override via `tools.max_client_wait_seconds`) — and even an expired call is superseded by a late genuine answer. The client never enforces its own answer deadline. (For *long-running* local work, still prefer a background job + short-circuit so the user isn't staring at a spinner.)

The original stream has ended. If the callback says continuation is needed,
open the conversation's `/resume` stream.

---

## End-to-end flow (sequence)

```
Client                                Server
──────                                ──────
POST /ai/manual                 ───▶
  { client_tools: ["write_file"] }
                                     [streams events...]
                              ◀───   tool_event { event:"tool_started", ... }
                              ◀───   tool_event { event:"tool_completed", ... }  // regular server tool
                              ◀───   tool_event {
                                       event: "tool_delegated",
                                       call_id: "call_abc123",
                                       tool_name: "write_file",
                                       data: { arguments: {...} }
                                     }
  // server is now SUSPENDED on this call_id
  ...execute locally...
POST /ai/conversation/{id}/tool_results ───▶
  { results: [{ call_id:"call_abc123", tool_name:"write_file",
                output:"wrote 128 bytes" }] }
                              ◀───   { resolved:["call_abc123"], count:1,
                                      continuation_needed:true }
POST /ai/conversation/{id}/resume ───▶
                                     [AI loop resumes — streams more events]
                              ◀───   chunk, tool_event(...), ... end
```

---

## Quick reference — what to implement

1. **Choose the correct existence path**:
   - Registered tool → durable `tool.definition` row; arm its exact name in `client_tools` when live UI state is required.
   - Inline tool → declare its full contract on the request.
2. **Listen for** `tool_event` with `event === "tool_delegated"`. Use `ToolDelegatedToolEvent` from `stream-events.ts`.
3. **Execute** using `payload.data.arguments`.
4. **POST** to `/ai/conversation/{conversation_id}/tool_results` with the same `call_id`.
5. **Resume when requested** — open the conversation's `/resume` stream after posting results.

---

## Failure modes you should handle

| Symptom | Cause | Fix |
|---|---|---|
| `404 not_found` from tool_results POST | `call_id` genuinely unknown — a stale POST or wrong client (NOT a normal timeout: a delegated row lives ~30 days and a late answer is accepted/superseded) | Don't POST a `call_id` the server never delegated; surface the stale callback loudly |
| Resume does not start | The result callback did not request continuation, or the conversation is no longer paused | Inspect the callback envelope and current conversation state before opening `/resume` |
| Tool invoked but never delegated | Tool name was not in `client_tools`, or inline `custom_tools` entry had a different name than what the model called | Verify `client_tools` contains the *exact* tool `name`; for `custom_tools`, the `name` field *is* what the model sees |
| `is_error: true` result | Your local executor reported an error | Include `error_message`; the server feeds it back to the model as a tool error and the loop continues gracefully |

---

## Types you'll use

All already generated in `aidream/api/generated/stream-events.ts`:

- `ToolEventPayload` — the top-level `tool_event` envelope.
- `ToolEventType` — union including `"tool_delegated"`.
- `ToolDelegatedToolEvent` — narrowed shape for the delegated event.
- `ToolDelegatedData` — `{ arguments: Record<string, unknown> }`.
- `isTypedToolEvent(e)` — type guard to narrow any `ToolEventPayload`.

Request/response types for the endpoints are in `aidream/api/generated/api-types.ts` under their OpenAPI paths (`/ai/manual`, `/ai/agent/{agent_id}`, `/ai/conversation/{conversation_id}`, `/ai/conversation/{conversation_id}/tool_results`).

---

## Reach: answer the right question

| Question | Concept | Lifetime |
|---|---|---|
| Where can this code run? | Executor via Binding | Durable |
| Where is it offered by default? | Surface via Surface defaults | Durable |
| Is it live for this conversation right now? | Arming via `client_tools` | Per-conversation |

A page needing a different set of tools does not justify a sub-executor. Use
Surface defaults for durable inclusion or Arming when live UI state is required.

---

## Widget Actions — the canonical widget_* family

For UI-driven agent actions (replace selected text, insert text, update a record field, attach media, create an artifact), **don't hand-build the `client_tools` array**. Use the **WidgetHandle** system:

1. 10 canonical `widget_*` tools live in `tool.definition` (tag: `widget-capable`) with active `tool.binding` rows for `matrx-ai-core`. See [`WIDGET_TOOLS_SEED.sql`](WIDGET_TOOLS_SEED.sql).
2. A widget registers a `WidgetHandle` object once via `useWidgetHandle()`. The handle exposes method implementations (`onTextReplace`, `onAttachMedia`, ...) plus lifecycle (`onComplete`, `onError`).
3. The submit-body assembler in `execute-instance.thunk.ts` reads the handle live per-turn and derives `client_tools = deriveClientToolsFromHandle(handle)`. **You do not manage `client_tools` manually for widget tools.**
4. When the model invokes a `widget_*` tool, `process-stream.ts` branches to `dispatchWidgetAction`, which calls the matching handle method and POSTs the result through a microtask batcher that coalesces concurrent tool calls into one request.

**Full contract + example:** [`../docs/WIDGET_HANDLE_SYSTEM.md`](../docs/WIDGET_HANDLE_SYSTEM.md).

**Why a per-turn derivation** (instead of dispatching `setClientTools` once at launch): a rehydrated conversation that attaches a widget post-reopen, a widget that adds a method between turns, or a widget that unmounts mid-conversation — all three "just work" because the handle is the source of truth every turn, not a frozen snapshot from launch time.

**Non-widget client tools** (custom inline `custom_tools`, or any DB-registered tool you want delegated per-request) still live in the `instanceClientTools` slice and are merged with the widget-derived list at assembly time. The two are orthogonal.
