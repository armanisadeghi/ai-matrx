# Client-tool suspend → submit → resume

> **The load-bearing invariant:** When the agent delegates a client-side tool,
> the original stream **ends**. Never wait on it. After POSTing the tool
> result, read `continuation_needed` and — if true — open a fresh stream
> against `/ai/conversations/{id}/resume`. Both clients (the Next.js admin
> app and the matrx-extend Chrome extension) must do this. The backend is
> already built; the only way this regresses is a client that forgets to
> resume.

This document is the **single source of truth** for the client-tool
human-in-the-loop round-trip. It supersedes the older
`DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md` and `PYTHON_RESUME_SPEC.md` in
this folder (which describe a different, unbuilt resume mechanism — see
[§6 Related-but-different](#6-related-but-different)).

---

## 1. The problem this fixes

The agent can call tools mid-stream. Some tools require the **client** to do
work and return a result — ask-user prompts, widget setters, capability calls
(read_page, click, etc.). The loop pauses until the client posts the result.

The backend used to **block in-stream**, awaiting the result while the SSE
stayed open. That broke: background-cleanup of stale rows raced the wait,
the wait returned with an empty/error result, and the loop re-issued the
same tool forever (runaway loop). The "immediate fix"
([aidream commit `662912d7`](#ref-aidream)) changed delegation to a **hard
suspend**: persist the turn to the DB, emit a `complete` phase, **end the
stream**, return.

That fix exposed the next bug. The original stream is now gone the moment a
client tool is delegated. Both clients used to assume the SAME stream would
keep emitting events after the tool result POSTed. With hard suspend, no
events ever arrive — answer submitted, nothing happens, agent never
continues. This document specifies the wire round-trip that closes that gap
and the client-side wiring on both repos.

---

## 2. The wire protocol

### 2.1 Suspend phase (server-driven, automatic)

When the agent decides to call a client-delegated tool the server emits:

```
event: tool_event
data:  { event: "tool_delegated", call_id, tool_name, data: { arguments, … } }
```

Then internally `_suspend_for_delegation` runs:

1. Persists the assistant message + any completed server-tool results.
2. Emits `phase: "complete"`.
3. Emits `info: { code: "suspended_awaiting_client" }`.
4. Calls `_finalize_and_persist`.
5. **Returns. The streaming task ends. The HTTP response closes.**

The client's reducer (frontend: `processStream`; extension: the
STREAM_CHUNK consumer) sees the stream cleanly end. Importantly the
**conversation is not done** — it's mid-flight waiting on the client.

### 2.2 Submit phase (client → server)

The client funnels every tool result through ONE path:

```
POST /ai/conversations/{conversation_id}/tool_results
Content-Type: application/json
Authorization: Bearer <jwt>   (or X-Fingerprint-ID for guests)

{ "results": [
    { "call_id": "...", "tool_name": "...",
      "output": <any>, "is_error": false, "error_message": null }
  ] }
```

Server response (200):

```json
{
  "resolved": ["call_id_a", "call_id_b"],
  "already_resolved": [],
  "not_found": [],
  "continuation_needed": true,
  "user_request_id": "4e43…",
  "conversation_id": "abcd…"
}
```

The exact contract for `continuation_needed`:

- `true` ⟺ result(s) resolved AND the live in-memory waiter on the
  originating SSE did NOT pick them up (the original stream is GONE) AND no
  delegated calls remain outstanding for the `user_request_id`. In plain
  English: *"the loop is ready to continue and nobody is running it."*
- `false` in every other case (the original stream is still alive and just
  picked up the result via its in-memory waiter; more delegated calls
  pending; partial 404; etc.).

This is the authoritative, race-proof, tool-type-agnostic signal. The
client doesn't need to know whether it's a ui-first tool, a widget tool, or
a capability tool — the same flag answers "resume now?" for all of them.

### 2.3 Resume phase (client → server)

When `continuation_needed === true`, the client MUST:

```
POST /ai/conversations/{conversation_id}/resume
Content-Type: application/json
Authorization: Bearer <jwt>   (or X-Fingerprint-ID for guests)

{ "user_request_id": "4e43…",
  "client": { "capabilities": [...], "state": { ... } },
  "tools":  [...],            // optional, additive
  "tools_replace": [...],     // optional, replace
  "config_overrides": {...},  // optional
  "debug": false              // optional
}
```

The server:

1. Verifies the conversation exists and is owned by the caller.
2. Checks `cx_tl_call` for any rows still in `status='delegated'` for this
   `user_request_id`. If any remain, returns **409**
   `{code: "outstanding_delegated_calls", outstanding_call_ids: [...]}`.
3. Reuses the original `user_request_id` (idempotent) so token / cost
   aggregation stays under the same row.
4. `ConversationResolver.from_conversation_id` reconstructs the full
   history from `cx_message` + `cx_tl_call`. The answer the client just
   POSTed is already embedded — the server reads it from the resolved
   conversation, not from the request body.
5. Streams the continuation through `run_ai_task` — same NDJSON event
   stream as a normal turn. The first events are `init` / `phase=processing`,
   then the model's next iteration.

### 2.4 Re-entrancy

The resumed loop may itself delegate another client tool. That's expected
and works for free: the new stream hits the same `tool_delegated` →
hard-suspend path, the client funnels through `submitToolResult` → server
returns `continuation_needed:true` → client opens another `/resume`. The
chain continues until the model emits its final assistant message.

### 2.5 Status codes summary

| Endpoint | 200 | 4xx |
|---|---|---|
| `POST .../tool_results` | `ToolResultsResponse` with `continuation_needed` | 404 ⟺ every call_id was genuinely unknown (partial success returns 200 with `not_found` populated) |
| `POST .../resume` | NDJSON stream of the continuation | **409** `outstanding_delegated_calls`; **404** conversation not found / not owned |

The 409 is the only "expected" non-2xx on resume and is **benign** — it
means more client-tool calls remain unanswered. The client should NOT
treat it as an error; instead reset the instance to `paused` and wait for
the next `tool_results` POST to clear the remaining calls (which will
re-trigger resume).

---

## 3. Frontend implementation (matrx-frontend)

### 3.1 The funnel — one POST path, one resume trigger

Every tool result flows through:

```
dispatchUiFirstTool | dispatchWidgetAction
        ↓
submitToolResult         ← features/agents/api/submit-tool-results.ts
        ↓
queueMicrotask flush     ← coalesces simultaneous results
        ↓
POST /tool_results       ← reads response.data.continuation_needed
        ↓
[if continuation_needed && user_request_id]
        ↓
dispatch(resumeInstance({ conversationId, userRequestId }))
```

This is enforced structurally: an ESLint `no-restricted-syntax` rule bans
any literal or template containing `/tool_results` outside
`features/agents/api/submit-tool-results.ts`. See
[`eslint.config.mjs`](../../../eslint.config.mjs) (search
`toolResultsChokepointSyntaxRestrictions`). The rule mirrors the existing
chokepoints for `supabase.storage` and `ctx_*` table writes — same shape,
same allowlist pattern, same flat-config gotcha (`no-restricted-syntax`
arrays replace, not merge, per-file).

### 3.2 The shared stream runner

`features/agents/redux/execution-system/thunks/run-ai-stream.ts` —
`runAiStream(args)` is the ONE place that:

1. Stamps the routing telemetry record.
2. Opens the abort-able `fetch` and registers the controller.
3. Validates the response (`!ok` → 409 / 404 / 422 + tool-injection toast).
4. Asserts X-Conversation-ID drift.
5. Drives `processStream` (heartbeat-monitored, end-of-stream-committing).
6. Owns cancel / heartbeat-timeout / total-timeout / client-error
   classification plus `failPendingToolLifecycle` so the LiveToolCallCard
   never shimmers forever.

Both `executeInstance` (initial turn) and `resumeInstance` (continuation)
call it. Resume is structurally a peer of a turn — the only divergence
points are the `kind: "turn" | "resume"` discriminator (409 throws for
turns, is benign for resume) and `clearInputOnError` (turn-only). Errors
already cleaned up by `runAiStream` are surfaced via the
`StreamPhaseError` / `StreamCancelledError` marker classes so the caller's
catch block can short-circuit instead of double-cleaning.

### 3.3 The resume thunk

`features/agents/redux/execution-system/thunks/resume-instance.thunk.ts` —
`resumeInstance({ conversationId, userRequestId })`:

1. Bails if `hasAbortController(conversationId)` returns true
   (double-resume guard).
2. Bails if the instance is `cancelled` or `error` (silent restart after
   user cancel is surprising).
3. `resolveBackendForConversation` → same server + auth as the turn.
4. `buildToolInjection(state, conversationId, {mode: "additive"})` →
   mirrors the launch capability surface.
5. Builds the body — `{user_request_id, ...tools, ...client, debug?}`.
   No optimistic user message. No top-level `sandbox` (rides on
   `client.state["sandbox-fs"]`).
6. Flips the instance status: `paused` → `running`. `runAiStream` will
   advance to `streaming` once the response opens.
7. Hits `POST /ai/conversations/{conversationId}/resume` (canonical plural
   path) through `runAiStream` with `kind: "resume"`.

### 3.4 Honest status during the wait

[`dispatchUiFirstTool`](../ui-first-tools/dispatcher/dispatch-ui-first-tool.thunk.ts)
sets `setInstanceStatus({status: "paused"})` *before* awaiting the
handler. The `paused` status already existed on `InstanceStatus` with the
meaning "Waiting for client tool results"; this is the first place that
actually sets it. `selectIsAwaitingTools` already reads it. The
end-of-stream `setInstanceStatus("complete")` paths in
[`process-stream.ts`](../redux/execution-system/thunks/process-stream.ts)
(the `isEndEvent` branch and the post-loop safety net) are guarded so the
hard-suspend stream-end doesn't overwrite `paused`. The request can still
transition to `complete` — that stream genuinely ended — while the
instance stays `paused` until resume flips it back to `running`.

### 3.5 Manual verification (live backend)

1. Dev-login: `http://localhost:3000/api/dev-login?token=$DEV_LOGIN_TOKEN&next=/chat`.
2. In `/chat/new`, type:
   `"Use the user tool to ask me what my favorite color is, then tell me a fun fact about that color."`
3. The agent emits `tool_delegated user`. The original stream
   hard-suspends; an `AskCard` renders with color options.
4. Pick Blue, click Send.
5. Open DevTools → Network. You should see, in order:
   - `POST /ai/agents/{agentId} → 200` (the initial turn; closed after
     suspension).
   - `POST /ai/conversations/{id}/tool_results → 200` with response body
     `{continuation_needed: true, user_request_id: "..."}`.
   - `POST /ai/conversations/{id}/resume → 200` (streaming the
     continuation).
6. The chat shows the agent's continuation. If the agent delegates again,
   the cycle repeats automatically.

The pre-fix symptom was: step 4 fired the `/tool_results` POST and then
nothing else — `/resume` never opened. The fix is verified the moment
`/resume` appears in the network log.

---

## 4. Extension implementation (matrx-extend)

The extension cannot fire resume from the SW because the
`runIdRef`/`targetIdRef` that gate which assistant bubble incoming
`STREAM_CHUNK`s append to live in the **sidepanel React hook**, and they
get cleared when the original stream ends. So the trigger has to round-trip
SW → sidepanel.

### 4.1 SW broker

`src/lib/tools/dispatch.ts::postResult` now captures the `postToolResults`
return value. On `r.ok && r.data.continuation_needed &&
r.data.user_request_id`, it broadcasts the new
`CHANNELS.STREAM_CONTINUE` channel with `{conversationId, userRequestId}`.

### 4.2 Sidepanel consumer

`src/hooks/use-chat-stream.ts::resumeRun` (and its `STREAM_CONTINUE`
`useEffect` subscription):

1. Ignores continuations for non-selected conversations (the hook's
   runId/targetId can only hold one run at a time; redirecting them would
   race the live run if any). Per-conversation state is a future
   improvement.
2. Bails if a run is already active (defensive — shouldn't happen since
   the server flagged us idle).
3. Pushes a fresh pending assistant message and allocates a new `runId`.
4. Rebuilds the `client.state["browser-dom"]` capability state via
   `buildBrowserDomState` against the user's CURRENT active tab — the
   resumed loop's tools target current page state, not a stale snapshot.
5. Sends `STREAM_START` with `endpoint: conversationResumePath(conversationId)`
   and `body: {user_request_id, client: {...}}`.
6. The existing `STREAM_CHUNK` consumer then routes continuation chunks
   into the new bubble. No new rendering code.

### 4.3 The cursor-replay scaffold is a different feature

`src/lib/stream/resume.ts::attemptResume` (called from the watchdog's
`onStall`) is the **future cursor-replay stall-recovery** path — keyed by
`request_id` + a `cursor` count of events seen, replays the unsent tail of
a still-live run, must not trigger tool side effects. It is NOT the
durable client-tool resume documented here. Header comments in
`resume.ts` and `docs/STREAM_RESUME_PROTOCOL.md` now say so prominently
(this distinction tripped an investigation earlier — keep it explicit).

### 4.4 Manual verification

1. Build the extension and load the unpacked dist in Chrome
   (`pnpm dev` for dev mode).
2. Open the sidepanel on any page, sign in.
3. Send the same prompt as the frontend verification (§3.5 step 2).
4. The agent emits `tool_delegated user`. A `tool:ask-user-request` card
   renders in the sidepanel.
5. Pick / type an answer and submit.
6. Watch the SW console (chrome://extensions → service worker logs):
   - `→ POST /ai/conversations/{id}/tool_results (1)`
   - `← tool_results ok { continuation_needed: true, user_request_id: ... }`
   - `continuation_needed → broadcast STREAM_CONTINUE for {conversationId}`
   - `resume started for {conversationId}` (sidepanel log)
7. The chat continues in a fresh assistant bubble.

---

## 5. Anti-patterns (what reintroduces the bug)

If you find yourself doing any of these, stop. You are reintroducing the
class of failure this document exists to kill.

1. **Posting `/tool_results` outside the funnel.** Direct `fetch` /
   `apiPost` / `callApi` to `/tool_results` from anywhere except the
   per-repo funnel forfeits the `continuation_needed` → resume handoff.
   ESLint chokepoint on frontend; convention on extension. Either way,
   bypassing it is the bug.
2. **Treating `continuation_needed` as optional.** It's the
   authoritative, race-proof signal. Not reading the response body is the
   bug.
3. **Waiting on the original stream after a `tool_delegated`.** After the
   hard suspend, the stream ENDS. Adding a "stay tuned" listener won't
   bring back events. Resume is the only way.
4. **Reusing the cursor-replay `attemptResume` for durable resume**
   (extension). They're separate features with different endpoints,
   triggers, and semantics. The cursor-replay endpoint isn't built; the
   durable resume endpoint is.
5. **Creating a parallel resume function** instead of routing through
   `runAiStream` (frontend) or `STREAM_START` (extension). The shared
   runner / shared start path is where heartbeat, abort, status, commit,
   and `failPendingToolLifecycle` live. Resume MUST inherit them.
6. **Setting `complete` on the instance the moment the stream ends**
   (frontend). The hard-suspend stream legitimately ends, but the
   instance is still mid-flight. Use `paused` and let `resumeInstance`
   flip it back. See the guards in
   [`process-stream.ts`](../redux/execution-system/thunks/process-stream.ts).
7. **Adding a server-side "wait" that depends on the client tool
   completing inline.** That is the original bug. The server's job is to
   suspend cleanly; the client's job is to resume cleanly. No middle
   ground.

---

## 6. Related-but-different

These exist nearby and look adjacent but solve different problems. Don't
conflate.

- `docs/PYTHON_RESUME_SPEC.md` (this folder) — a proposed
  failure-recovery endpoint `{user_request_id, mode: "last_good_step" |
  "atomic"}` for retrying after a transient backend failure. **Not the
  shipped mechanism.** It hasn't been built.
- `docs/DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md` (this folder) — earlier
  attempt at this same problem; references a non-existent
  `processStreamEvent` Redux action and proposes routing through
  `callApi.onStreamEvent`. **Stale.** The pipeline that actually drives
  the UI is `processStream`; the trigger is `continuation_needed`. This
  document supersedes it; follow this one.
- `matrx-extend/docs/STREAM_RESUME_PROTOCOL.md` + `src/lib/stream/resume.ts`
  — the **cursor-replay stall-recovery** for live-stream interruption.
  Different endpoint shape (`GET .../runs/{request_id}/resume?cursor=`),
  different trigger (watchdog stall), different semantics (no tool side
  effects). Not built yet.
- `features/agents/api/resume-conversation.ts` — **deleted.** Was an
  unused thunk built around the divergent `callApi.onStreamEvent`
  pipeline. Resume now goes through `runAiStream` like every other
  agent stream.
- `submitToolResults` (plural) `createAsyncThunk` in
  `execute-instance.thunk.ts` — **deleted.** Was a second dead
  `/tool_results` POST door that bypassed both the batcher and the
  continuation handling. Per-doctrine ("deprecated/fallback code gets
  deleted"), removed alongside the wiring fix.

---

## 7. References

- aidream backend
  - `aidream/api/routers/conversations.py:475-713` — `POST /tool_results`
    + `ToolResultsResponse`.
  - `aidream/api/routers/conversations.py:1015-1126` — `POST /resume`
    (plural and singular aliases).
  - `packages/matrx-ai/matrx_ai/orchestrator/executor.py:269-329` —
    `_suspend_for_delegation`.
  - <a id="ref-aidream"></a>aidream commit `662912d7` ("A lot of fixes to
    apis…") — the hard-suspend change that necessitated this client
    wiring.
  - `aidream/MATRX_EXTEND_CONNECTION.md` §3 — also documents
    `continuation_needed`.
- matrx-frontend
  - `features/agents/api/submit-tool-results.ts` — the funnel.
  - `features/agents/redux/execution-system/thunks/run-ai-stream.ts` —
    shared runner.
  - `features/agents/redux/execution-system/thunks/resume-instance.thunk.ts`
    — the resume thunk.
  - `features/agents/redux/execution-system/thunks/process-stream.ts`
    `:1356-1374` and `:1529-1543` — the `paused` guards.
  - `features/agents/ui-first-tools/dispatcher/dispatch-ui-first-tool.thunk.ts`
    — sets `paused`.
  - `eslint.config.mjs` `toolResultsChokepointSyntaxRestrictions` — the
    chokepoint.
- matrx-extend
  - `src/lib/tools/dispatch.ts::postResult` — broadcast trigger.
  - `src/hooks/use-chat-stream.ts::resumeRun` — sidepanel resume.
  - `src/lib/api/routes/tool-results.ts` — funnel + `conversationResumePath`.
  - `src/lib/messaging/schemas.ts` `STREAM_CONTINUE` — the channel.

## Change log

| Date | Change |
|---|---|
| 2026-05-25 | Initial — captures the suspend → submit → resume protocol; supersedes `DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md` and clarifies the boundary against `PYTHON_RESUME_SPEC.md` and the extension's cursor-replay scaffold. Both clients ship the wiring; ESLint chokepoint protects the frontend funnel. |
