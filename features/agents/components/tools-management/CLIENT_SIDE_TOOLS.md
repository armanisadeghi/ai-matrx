# Client-Handled Tool Calls

How to make the React frontend execute a tool call locally instead of the server. End-to-end contract, no surprises.

---

## Mental model

The AI loop decides what tool to call. The server normally executes it. If you tell the server **"this tool is mine — I'll execute it"** for a given request, the server:

1. Emits a `tool_event` with `event: "tool_delegated"` over the stream.
2. **Suspends the AI loop** on that call.
3. Waits for you to POST the result back.
4. Resumes the loop with your result and continues.

There is one control knob: the `client_tools` array in the request body. Any tool name in that array is delegated. Everything else runs on the server.

---

## Two ways to register a client-handled tool

### 1. Database-registered tool (recommended, shared across users)

The tool exists in the `tools` table like any other tool — same schema, same `parameters`, `description`, etc. It is **not** marked specially in the DB. To make a specific request treat it as client-handled, include its name in `client_tools`.

> **Important:** there is no "always client-handled" flag on the tool row today. It is a per-request decision. If you always want a given DB tool delegated, the frontend is responsible for always adding it to `client_tools`. See the [Open question](#open-question-mark-db-tools-as-client-handled-permanently) section at the bottom.

### 2. Inline custom tool (one-off or client-only tool)

Pass a `custom_tools: [...]` array in the request. Each entry follows the MCP `Tool` spec. **You do not need to add its name to `client_tools`** — custom tools are **always** delegated back to the caller (that's their entire purpose; the server has no implementation for them).

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

**The AI loop continues on the same stream** you're already reading. You do NOT open a new stream after posting results.

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
                              ◀───   { resolved:["call_abc123"], count:1 }
                                     [AI loop resumes — streams more events]
                              ◀───   chunk, tool_event(...), ... end
```

---

## Quick reference — what to implement

1. **Register tool names** you handle locally:
   - DB tool → add its exact `name` to `client_tools` on every request where it should be delegated.
   - Inline tool → put it in `custom_tools` (no `client_tools` entry needed).
2. **Listen for** `tool_event` with `event === "tool_delegated"`. Use `ToolDelegatedToolEvent` from `stream-events.ts`.
3. **Execute** using `payload.data.arguments`.
4. **POST** to `/ai/conversation/{conversation_id}/tool_results` with the same `call_id`.
5. **Keep reading the same stream** — the AI loop resumes automatically.

---

## Failure modes you should handle

| Symptom | Cause | Fix |
|---|---|---|
| `404 not_found` from tool_results POST | `call_id` genuinely unknown — a stale POST or wrong client (NOT a normal timeout: a delegated row lives ~30 days and a late answer is accepted/superseded) | Don't POST a `call_id` the server never delegated; the stream stays alive |
| Stream ends before you POST | AI loop hit a `client_tool_timeout` error and the model finished without you | Execute faster, or raise `tool_def.timeout_seconds` in the DB for that tool |
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

## Open question: mark DB tools as "client-handled" permanently?

Today, if you want a DB-registered tool to always be executed client-side, the frontend has to remember to include its name in `client_tools` on every request. There is no `is_client_handled` column on the `tools` table.

If we want a "set it once, forget it" story for DB tools, the cleanest addition is:

- Add `tools.execution_side` (`'server' | 'client'`, default `'server'`).
- When the registry loads a row with `execution_side = 'client'`, the executor auto-delegates even if the name isn't in the request's `client_tools`.

**This change has not been made yet — flag it if you want it and we'll add the column + type regeneration in one pass.** For now: just include the tool name in `client_tools` per request.

---

## Widget Actions — the canonical widget_* family

For UI-driven agent actions (replace selected text, insert text, update a record field, attach media, create an artifact), **don't hand-build the `client_tools` array**. Use the **WidgetHandle** system:

1. 10 canonical `widget_*` tools are seeded in `public.tools` (tag: `widget-capable`). See [`WIDGET_TOOLS_SEED.sql`](WIDGET_TOOLS_SEED.sql).
2. A widget registers a `WidgetHandle` object once via `useWidgetHandle()`. The handle exposes method implementations (`onTextReplace`, `onAttachMedia`, ...) plus lifecycle (`onComplete`, `onError`).
3. The submit-body assembler in `execute-instance.thunk.ts` reads the handle live per-turn and derives `client_tools = deriveClientToolsFromHandle(handle)`. **You do not manage `client_tools` manually for widget tools.**
4. When the model invokes a `widget_*` tool, `process-stream.ts` branches to `dispatchWidgetAction`, which calls the matching handle method and POSTs the result through a microtask batcher that coalesces concurrent tool calls into one request.

**Full contract + example:** [`../docs/WIDGET_HANDLE_SYSTEM.md`](../docs/WIDGET_HANDLE_SYSTEM.md).

**Why a per-turn derivation** (instead of dispatching `setClientTools` once at launch): a rehydrated conversation that attaches a widget post-reopen, a widget that adds a method between turns, or a widget that unmounts mid-conversation — all three "just work" because the handle is the source of truth every turn, not a frozen snapshot from launch time.

**Non-widget client tools** (custom inline `custom_tools`, or any DB-registered tool you want delegated per-request) still live in the `instanceClientTools` slice and are merged with the widget-derived list at assembly time. The two are orthogonal.
