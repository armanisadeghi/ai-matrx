# Durable Client-Delegated Tool Calls — Client Integration Brief

> **⚠ SUPERSEDED.** The canonical protocol lives at
> [`CLIENT_TOOL_SUSPEND_RESUME.md`](./CLIENT_TOOL_SUSPEND_RESUME.md) — read
> that instead. This document captures useful background on the durable
> ledger and idempotent `/tool_results` semantics, but its UI-wiring
> recommendations are STALE: it references a `processStreamEvent` Redux
> action that does not exist (the canonical reducer is the
> [`processStream`](../redux/execution-system/thunks/process-stream.ts)
> async function), and it proposes plumbing resume through `callApi`'s
> `onStreamEvent` callback — bypassing the heartbeat-monitored
> `processStream` pipeline that drives every other agent stream.
>
> The shipped implementation goes through
> [`runAiStream`](../redux/execution-system/thunks/run-ai-stream.ts) (the
> shared runner extracted from `executeInstance`) and
> [`resumeInstance`](../redux/execution-system/thunks/resume-instance.thunk.ts).
> Follow the canonical doc — not the recommendations below — for any new
> wiring.

**Status:** Backend landed; client API wrappers added. UI wiring TBD by React team.

## What changed on the backend

A client-delegated tool call (anything you ship in `client_tools` — widget tools, approval dialogs, form fills, uploads) now has a **durable database-backed ledger**:

- The `cx_tool_call` row is flipped to `status='delegated'` and stamped with `expires_at = now() + 7d` **before** the `tool_delegated` stream event is emitted. The assistant `cx_message` row is flushed at the same boundary with the real tool_calls content — so the conversation is fully reconstructable on reload.
- If the SSE connection dies, the server no longer flips the row to `abandoned`. The row stays in `delegated` until either the client POSTs a result or the 7-day expiry sweep fires.
- `POST /ai/conversation/{id}/tool_results` is now **idempotent** and **DB-backed**. It works even when the original in-memory `asyncio.Future` is gone (server restart, browser closed, whatever).

This means the existing `submit-tool-results.ts` no longer needs to treat 404 as a normal outcome — 404 only happens for genuinely unknown call_ids now. Retry safety is automatic: a duplicate POST for an already-resolved call returns 200 with `already_resolved: ["<call_id>"]`.

## Three new endpoints

### `GET /ai/conversation/{conversation_id}/pending_calls`

Returns the client-delegated tool calls awaiting this user's response in this conversation.

Response body: `PendingCallSummary[]` — shape:

```ts
{
  id: string;                // cx_tool_call.id
  call_id: string;           // the id tool_delegated carried
  conversation_id: string;
  user_request_id: string | null;
  message_id: string | null; // the assistant cx_message that triggered this
  tool_name: string;
  arguments: Record<string, unknown>;
  iteration: number;
  created_at: string | null; // ISO-8601
  expires_at: string | null; // ISO-8601; sweep fires after this
}
```

### `GET /ai/user/pending_calls`

Same shape, but scoped to every conversation the user owns. Drives a global "N tool prompts waiting" badge.

### `POST /ai/conversation/{conversation_id}/resume`

Resume a stalled AI loop after client-delegated tool calls have been answered via `/tool_results`. Request body:

```ts
{
  user_request_id: string;
  config_overrides?: LLMParams;
  client_tools?: string[];
  custom_tools?: Record<string, unknown>[];
  debug?: boolean;
}
```

Returns an NDJSON stream identical to a normal turn — the same events the existing `process-stream` reducer already handles (`init`, `phase`, `tool_event`, `chunk`, `completion`, `end`, etc).

Status codes:

- **200**: streaming continuation (the expected happy path).
- **409 `outstanding_delegated_calls`**: the server still has ≥1 call in `status='delegated'` for this user_request_id. Keep prompting the user and retry once `/tool_results` has cleared them. Body: `{ outstanding_call_ids: string[], ... }`.
- **404**: conversation not found or not owned by this user.

## `POST /tool_results` — updated response shape

The body now carries extra fields for continuation orchestration:

```ts
{
  resolved: string[];
  already_resolved: string[];
  not_found: string[];
  continuation_needed: boolean;      // NEW — see below
  user_request_id: string | null;    // NEW
  conversation_id: string;           // NEW
}
```

**`continuation_needed` semantics:**

- `false` when the in-memory waiter (the live SSE task) picked up at least one resolution. The existing stream is still alive and will continue naturally — no client action required.
- `true` when every resolution landed in the DB only (no in-memory future was there, i.e. the original loop is gone) **and** no client-delegated calls remain for this `user_request_id`. The client should now `POST /ai/conversation/{id}/resume` to continue the loop.

## New client-side modules

| File | Purpose |
|---|---|
| [`features/agents/api/fetch-pending-calls.ts`](../api/fetch-pending-calls.ts) | `fetchConversationPendingCalls(id)` and `fetchUserPendingCalls()` thunks |
| [`features/agents/api/resume-conversation.ts`](../api/resume-conversation.ts) | `resumeConversation(id, options)` streaming thunk |
| [`features/agents/hooks/useConversationPendingCalls.ts`](../hooks/useConversationPendingCalls.ts) | React hook: fetch on mount, expose `{ pendingCalls, isLoading, refresh }` |

All three use local TypeScript interfaces until the python-generated types regenerate. To switch over, regenerate `types/python-generated/api-types.ts` against a backend that exposes the new endpoints and replace the local interfaces with `components["schemas"]["PendingCallSummary"]` / `ToolResultsResponse` / `ResumeRequest`.

## Client-side integration plan

### 1. On conversation load — show any pending prompts

```tsx
const { pendingCalls, isLoading, refresh } =
  useConversationPendingCalls(conversationId);

if (pendingCalls.length > 0) {
  // Render each PendingCallSummary as if the live SSE had just emitted
  // a `tool_delegated` event with its tool_name + arguments.
  //
  // For widget_* tool_names, route to the existing widget-handle path —
  // the registered useWidgetHandle will dispatch the right method.
  //
  // For non-widget delegated tools (approval dialogs, form fills), render
  // your existing per-tool UI.
}
```

`expires_at` is exposed so the UI can show a "your answer is needed by X" hint for long-pending calls.

### 2. When the user answers — POST the result as today

No changes to `submit-tool-results.ts` for the happy path. The microtask batcher still coalesces results into one POST per conversation. The response body now exposes `continuation_needed`.

### 3. Inspect the `/tool_results` response and resume when needed

Recommended — handle continuation inside `submit-tool-results.ts`. The minimal change in [`submit-tool-results.ts`](../api/submit-tool-results.ts) is to inspect `result.data` from the POST and, if `continuation_needed === true`, dispatch `resumeConversation(...)` with the `user_request_id` the server returned. Feed its `onStreamEvent` callback into the same `processStreamEvent` reducer the `execute-instance.thunk.ts` uses for fresh turns — the event shapes are identical.

Sketch:

```ts
// features/agents/api/submit-tool-results.ts — inside the flush
const response = await dispatch(
  callApi({
    path: "/ai/conversations/{conversation_id}/tool_results",
    method: "POST",
    pathParams: { conversation_id: conversationId },
    body: { results },
  }),
);

if (!response.error && response.data?.continuation_needed && response.data?.user_request_id) {
  // The originating loop died while waiting. Re-enter it.
  // Build the same tool-injection envelope the original turn shipped so the
  // model sees the same capability surface as before the suspend.
  const injection = await buildToolInjection(state, conversationId, {
    mode: "additive",
  });
  dispatch(
    resumeConversation(conversationId, {
      userRequestId: response.data.user_request_id,
      tools: injection.tools,
      client: injection.client,
      onStreamStart: (requestId) => {
        /* optional — thread requestId into active instance state */
      },
      onStreamEvent: (event) => {
        dispatch(processStreamEvent({ conversationId, event }));
      },
    }),
  );
}
```

### 4. Optional — global pending-calls badge

```tsx
const pending = useAppSelector(/* or local state */ ...);
useEffect(() => {
  dispatch(fetchUserPendingCalls()).then(setPending);
}, [dispatch]);

// Render badge: pending.length > 0 → "N tool prompts waiting"
```

Poll on app focus, not on a timer.

## The "user closes laptop overnight" path — end to end

1. **Day 1.** User sends message. Agent responds with an `approve_migration` delegated tool. React renders the dialog. User walks away.
2. **Mid-day stream dies** (laptop sleeps, network drops, browser killed). Server's SSE task hits `CancelledError`; the cx_tool_call row stays in `status='delegated'`. Row has `expires_at = day 8`.
3. **Day 2.** User opens the app. Conversation list loads via existing thunks.
4. **On conversation open**, `useConversationPendingCalls(id)` fires. The API returns one `PendingCallSummary` — the approval dialog. UI re-renders the dialog pre-filled with `arguments`.
5. User clicks **Approve**. `submitToolResult` flushes. POST hits `/tool_results`. Response: `{ resolved: [...], continuation_needed: true, user_request_id: X }`.
6. `submit-tool-results` sees `continuation_needed` and dispatches `resumeConversation(id, { userRequestId: X, ... })`. SSE opens; the agent's next iteration streams back.
7. `process-stream` receives chunks, tool_events, completion — all into the existing instance state. UI updates in real time.

No tab never gets "stuck." No 404s. The agent picks up where it left off.

## Edge cases

- **Duplicate POST** (same `call_id` twice): `already_resolved: [call_id]`, `continuation_needed: false` on the second attempt. Safe.
- **Late POST after expiry sweep**: the sweep already flipped the row to `status='error'`, `error_type='client_tool_timeout'`. The POST sees the row as resolved (terminal) and returns `already_resolved` — lenient, so the user's answer isn't silently dropped. The continuation still needs a new turn to move forward; the frontend can treat this case like a regular 409 and prompt the user to retry with a fresh ask.
- **Outstanding calls at resume**: server returns 409 with `outstanding_call_ids`. UI should re-render the dialogs for those calls and try resume again after the user answers.
- **Widget handle re-registration**: after a page reload, `useWidgetHandle` registers a new handle id. As long as the widget remounts BEFORE `useConversationPendingCalls` fires the resume dispatch, `dispatchWidgetAction` finds the handle and routes normally. If the user navigates away before answering a widget prompt, the row will sit in `delegated` until expiry — same durability guarantees as non-widget tools.

## Open questions for the React team

1. **Where should `continuation_needed` handling live?** Inside `submit-tool-results.ts` (simplest, proposed above), or as a middleware watching for a new `toolResultsPosted` action? Either works — the simpler option probably wins.
2. **Should the pending-calls fetch hook integrate with Redux?** Current proposal keeps it stateless / local. If the global badge needs the same data, we can promote to a slice with a selector.
3. **Do widget tools need the pending-calls treatment?** They currently fire-and-forget without pausing. A widget tool whose POST failed mid-flight would leave a `delegated` row on the server that the pending-calls endpoint would return. Handling it the same way as non-widget delegated tools (re-render the prompt) is the safest default.
