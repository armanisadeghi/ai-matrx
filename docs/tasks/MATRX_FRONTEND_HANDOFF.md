# Handoff: apply the 2026-06-09 client-tool resume fixes to matrx-frontend

> **Audience:** an agent working in the **matrx-frontend** repo (Next.js,
> aimatrx.com). You are mirroring fixes already implemented and verified for
> the matrx-extend Chrome extension. The aidream server half is done — your
> job is the client half plus adopting the new wire contract.
>
> Server reference: aidream branch `claude/extend-tool-execution-debug-146tjw`
> (commit `65fa0d4`) · full incident analysis:
> [DELEGATION_LOOP_BUGS.md](DELEGATION_LOOP_BUGS.md) Problems 8–10.
> Client reference implementation: matrx-extend branch
> `claude/extend-tool-execution-debug-146tjw` (commit `c04ccf8`).

---

## 1. The incident, in three sentences

Client-delegated tools hard-suspend the server loop; the client POSTs the
result to `/ai/conversations/{id}/tool_results` and, when
`continuation_needed=true`, opens `/ai/conversations/{id}/resume`. Because
`continuation_needed` is computed non-atomically AND clients could fire
multiple resumes, **several model loops raced the same conversation** —
duplicate `cx_message` positions, the model re-calling the same tool with
identical args until the duplicate-call guard errored, clobbered
`cx_user_request` stats. Separately, **resumed loops lost all request
context** (`ctx_get` → "No context objects are available") because nothing
re-applied `context` on resume.

Live evidence if you want to see the shape: conversation
`417e64ce-74ff-4fcd-b976-df1f0df56671` (2026-06-09) — duplicate assistant
rows at positions 19–27, `error_type='duplicate'` tool rows, empty
`status='abandoned'` user rows at 24–27.

## 2. What the server now does differently (already merged on the branch)

Adopt these wire-contract changes; they are backward-compatible:

1. **`POST /ai/conversations/{id}/resume` takes an atomic run claim.**
   Exactly one resume per `user_request_id` may run. Losers get **409** with a
   structured detail:
   - `{code: "outstanding_delegated_calls", ...}` — unchanged; answers still
     pending. Do not retry; leave the ask-cards interactive.
   - `{code: "resume_conflict", retryable: true, status: "pending"|"processing"}`
     — **NEW.** A run is still live for this request (usually the suspending
     run hasn't persisted `status='paused'` yet — a fast tool's result POST
     can beat that write). **Retry with backoff, bounded** (extension uses
     700ms × attempt, max 4).
   - `{code: "not_resumable", retryable: false, status: "completed"|…}` —
     **NEW.** Terminal request. Never retry.
   - **404** `{code: "user_request_not_found"}` — the user_request doesn't
     belong to this user/conversation.
2. **`ResumeRequest` now accepts `context` (dict), `writable_variables`
   (list[str]), `allow_context_create` (bool)** — same contract as the
   start/continue endpoints. The server re-applies them via
   `apply_context_objects`, restoring `ctx_get`/`ctx_batch` and the
   "Available Context" block for the resumed loop.
3. **`ClientToolResult` (tool_results POST items) accepts optional
   `duration_ms` (int)** — client-measured execution time, persisted to
   `cx_tool_call.duration_ms` (was always 0 for delegated calls).
4. `continuation_needed` remains **best-effort**: concurrent POSTs for
   parallel tool calls can BOTH return `true`. The server claim makes the
   duplicate harmless (409), but don't rely on it — single-flight client-side
   (below).

## 3. Client fixes to implement (mirror of matrx-extend)

Find matrx-frontend's equivalents of: the tool-execution dispatcher, the
tool-results POST helper, and the chat/agent stream hook(s) that handle the
resume handshake. The frontend's own protocol doc is
`features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md` — update it in the same
change.

### 3.1 Single-flight continuation per `user_request_id`
When a tool_results response carries `continuation_needed=true`, broadcast /
trigger the resume **at most once per `user_request_id`** until either a new
stream actually opens for that request or a ~10s TTL expires (the TTL stops a
never-opened resume from suppressing recovery forever). Reference:
`matrx-extend src/lib/tools/dispatch.ts` — `recentContinueBroadcasts` map,
re-armed in the STREAM_OPENED handler.

### 3.2 Synchronous resume guard in the hook/state machine
Whatever guards "is a run already active" must be claimed **synchronously,
before the first `await`** in the resume function. The Pilot hook's bug:
`await resolveActiveTab()` ran before `runIdRef.current = runId`, so two
near-simultaneous triggers both passed the idle check and raced two resumes.
Reference: `matrx-extend src/hooks/use-pilot-chat-stream.ts::resumeRun`
(reordered) and `use-chat-stream.ts::resumeRun` (already-correct ordering).

### 3.3 Re-send fresh `context` in the resume body
Build the same per-message context bundle the normal send builds (whatever
matrx-frontend attaches as `context` on `POST /ai/agent/{id}` /
`/conversations/{id}`) and include it in the resume POST. Without it the
resumed loop runs context-blind. Skip any heavy pre-send refresh — the cached
state is current enough; the resume must open fast. Reference: both
matrx-extend hooks' `resumeRun` (`buildChatContext` → `body.context`).

### 3.4 Handle the new 409 codes
- `resume_conflict` → bounded retry with backoff (see 2.1). Keep retry state
  per `user_request_id` so attempts are bounded across retries.
- `not_resumable` / `outstanding_delegated_calls` → no retry; log as benign.
- Don't render any 409-on-resume as a user-facing stream error.
Reference: `matrx-extend src/hooks/use-chat-stream.ts` — the 409 branch of the
STREAM_CHUNK error handler + `resumeRetryRef`.

### 3.5 Report `duration_ms`
Measure handler execution and include `duration_ms` in each tool_results item.
Reference: `matrx-extend src/lib/tools/dispatch.ts::postResult` +
`src/lib/api/routes/tool-results.ts::ClientToolResultBody`.

## 4. Likely-shared bugs worth checking while you're in there

These were real in the extension; the frontend may have its own versions:

- **Raw exceptions leaking as tool errors.** Every client tool handler must
  return a structured `{is_error: true, error_message}` result — a raw
  `"document is not defined"`-style message gives the model nothing to act
  on. (The extension's instance was an MV3 service-worker chunk-loading
  hazard; the frontend's failure modes will differ, but audit the dispatch
  path for unhandled throws.)
- **Agent system-prompt drift vs. real tool schemas.** The extension agent's
  prompt documented `tabs` actions `get_active`/`get_info` and args
  `tabId`/`value` — the real schema is `active`/`info`/`tab_id`/`on`. If
  matrx-frontend surfaces use agents whose prompts enumerate tool
  actions/args, diff them against the live `tool_def.parameters`.
- **Prompt never says the page/app context is attached.** The extension agent
  did web searches instead of reading the user's page because nothing told it
  "context about what the user is looking at arrives in the 'Available
  Context' block — prefer it." If frontend agents show similar
  ignore-the-context behavior, the same one-paragraph prompt fix applies
  (see the "read it FIRST" section added to agent
  `443dd7ff-e7cc-47b8-907a-0a14834caa48`).

## 5. Verification (run after wiring, against a deployed server with the branch)

1. Trigger a turn with **one** client tool → result POST → exactly one resume;
   conversation continues with the result visible to the model.
2. Trigger a turn where the model calls **two client tools in parallel** →
   both results POST → at most one resume opens (logs show the duplicate
   suppressed or a benign 409 `resume_conflict` retry).
3. Mid-conversation after a resume, have the model call `ctx_get` (or ask
   "what page/screen am I on?") → context resolves; NO "No context objects
   are available".
4. DB checks on the test conversation:
   ```sql
   -- no duplicate positions:
   SELECT position, count(*) FROM cx_message
    WHERE conversation_id='<id>' GROUP BY position HAVING count(*) > 1;
   -- no loop-blocked duplicates, durations populated:
   SELECT tool_name, error_type, duration_ms FROM cx_tool_call
    WHERE conversation_id='<id>' ORDER BY created_at;
   -- no leaked empty user rows:
   SELECT id FROM cx_message WHERE conversation_id='<id>'
    AND role='user' AND status IN ('pending','abandoned') AND content_chars=0;
   ```
5. Update `features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md` with the new
   409 codes + `ResumeRequest.context` + single-flight requirement.
