# Python Backend — Failure Recovery & Truncation Spec

> **⚠ NOT the shipped resume.** This spec describes a proposed failure-recovery
> endpoint `{user_request_id, mode: "last_good_step" | "atomic"}` for
> recovering after a transient backend failure. It hasn't been built.
>
> The resume mechanism that **DOES** ship and is in use today is the
> durable client-tool resume — `POST /ai/conversations/{id}/resume`
> after a `continuation_needed: true` response from `/tool_results`.
> That round-trip is documented in
> [`CLIENT_TOOL_SUSPEND_RESUME.md`](./CLIENT_TOOL_SUSPEND_RESUME.md).
> Do not conflate the two.
>
> **Audience:** Python backend team.
> **Status:** Awaiting implementation. Client falls back to per-message
> soft-delete + atomic restart until the RPCs and resume endpoint ship.
> **Cross-references:** [`STREAMING_SYSTEM.md`](./STREAMING_SYSTEM.md),
> [`STREAM_STATUS_LIFECYCLE.md`](./STREAM_STATUS_LIFECYCLE.md).

---

## Why this spec exists

The frontend just shipped four message-level UX flows on the agent runner:
fork at message, edit & resubmit (with fork-or-overwrite), delete with
fork option, and retry on failure. Three of those flows need server work
to be **atomic, idempotent, and safe under concurrent writes**.

> **Status update (2026-06-14):** the two message-level RPCs below are now
> **BUILT and applied** — `migrations/cx_message_soft_delete_and_truncate.sql`
> (`cx_message_soft_delete` + `cx_truncate_conversation_after`, both with the
> tool-call/artifact/media cascade). Delete-message and the Overwrite branch
> call them directly now; the old "RPC missing" feature-detect fallback is
> deleted. Sections 1–2 below are retained as the design record. The
> `/resume` endpoint + schema additions (sections 3+) remain unbuilt.

Until this spec is implemented, the client uses fallback paths that work
but are racy and slow:

| Client flow | Current fallback | What this spec replaces it with |
|---|---|---|
| Edit & resubmit / **Overwrite** | ~~Per-message loop~~ → **`cx_truncate_conversation_after` (built 2026-06-14)** | Single transactional `cx_truncate_conversation_after` RPC ✅ |
| Delete a single message | ~~Per-message loop~~ → **`cx_message_soft_delete` (built 2026-06-14, cascades)** | Single transactional `cx_message_soft_delete` RPC ✅ |
| Retry on failure (atomic) | Same fallback as overwrite | Same atomic truncate RPC |
| Retry on failure (resume from last good step) | Not implemented — currently falls back to atomic restart | New `/ai/conversations/{id}/resume` endpoint |

---

## 1. New RPC: `cx_truncate_conversation_after`

**Signature.**

```sql
cx_truncate_conversation_after(
  p_conversation_id uuid,
  p_after_position integer
) returns void
```

**Behavior.** In a single transaction, soft-delete every:

- `cx_message` row where `conversation_id = p_conversation_id`
  and `position > p_after_position` and `deleted_at is null`.
- `cx_tool_call` row whose `message_id` is one of the messages above.
- Any artifacts / media rows whose owning message or tool call is
  in the truncated set.

Set `deleted_at = now()` everywhere. Do not renumber positions on
remaining messages — gaps are intentional and stable for any UI that
anchors to position (fork-at-position, retry).

**Concurrency.** Use a transaction-level advisory lock keyed on the
conversation_id so two concurrent overwrite-or-retry attempts can't
half-truncate. Returning silently is acceptable when nothing matched
(e.g. position is already the tail).

**Permissions.** RLS: only the conversation owner / org members with
write access. Mirror the policy set already used by `cx_message_edit`.

**Client callers** (already wired, ready to consume the RPC the moment
it ships):

- `features/agents/redux/execution-system/message-crud/overwrite-and-resend.thunk.ts`
- `features/agents/redux/execution-system/message-crud/atomic-retry.thunk.ts`

Both detect the absence of the function (`PGRST202` /
`function does not exist`) and fall back to the per-message loop. The
fallback is documented as temporary in the thunks themselves.

---

## 2. RPC: `cx_message_soft_delete` — cascade requirements

**Signature.**

```sql
cx_message_soft_delete(p_message_id uuid) returns uuid  -- returns the deleted id
```

**Required cascade.** Soft-delete the row PLUS:

- Every `cx_tool_call` with `message_id = p_message_id` (set `deleted_at`).
- Any artifacts / media those tool calls produced.

Following messages stay in the chain — their `position` values are
unchanged. The frontend deliberately does NOT renumber.

**Visibility-to-model invariant.** Once `deleted_at` is set, the next
agent run for this conversation MUST rebuild its message stream with
the deleted row absent. The client flips `cache_bypass.conversation =
true` after every delete, so this is straightforward — but call it out
in the agent-cache rebuild logic so a stale cache never re-injects the
deleted message.

**Client caller:** `features/agents/redux/execution-system/message-crud/delete-message.thunk.ts`.

---

## 3. New endpoint: `POST /ai/conversations/{conversationId}/resume`

This is the long-running task this spec was written for. The client
already has an "atomic retry" path (delete the failed turn + resubmit
the original user message). For long agent runs that called several
tools before failing, atomic restart wastes work — the model has to
re-plan from scratch. The resume endpoint lets the server pick up where
it left off.

**Request body.**

```jsonc
{
  "user_request_id": "uuid",          // the failed cx_user_request
  "mode": "last_good_step" | "atomic"
}
```

**`mode: "atomic"`.** Server-side equivalent of the client's current
atomic retry. Soft-delete every cx_message with
`position > triggering_user_request.trigger_message_position`, then
replay the original user input. This is what we want long-term — keeps
the cleanup logic in one place and removes the client fallback. Once
this endpoint ships, the client's `atomicRetry` thunk should call it
instead of doing the truncate + executeInstance dance locally.

**`mode: "last_good_step"`.** The hard one. Server reads the failed
`cx_user_request` and walks its tool_call list:

1. Identify the last completed tool call (status `succeeded`, has
   non-null `output`, `is_resumable = true` — see § 4 below).
2. Identify the last completed content block emitted to the message
   (track `last_completed_block_index` on `cx_message` — see § 5).
3. Replay the LLM with:
   - Original user input.
   - Tool calls that already completed AND are marked
     `is_resumable = true` short-circuit to their stored result —
     the LLM sees the same tool-result message it would have seen if
     the call had succeeded the first time.
   - Tool calls that failed or aren't resumable get re-run.
   - The partial assistant message (`status = 'partial'`) is reused
     as the streaming target; do NOT create a fresh `cx_message`.
4. Stream as normal. Use the new `record_resumed` event (§ 6) at
   the start so the client knows to keep the existing assistant
   bubble in place.

**Client wiring once this ships:**

- The Retry button on `AgentAssistantMessage` gets a second option
  ("Retry from where it failed"). The current "Retry from scratch"
  becomes `mode: "atomic"`; the new one is `mode: "last_good_step"`.
- The client `atomicRetry` thunk in `message-crud/atomic-retry.thunk.ts`
  is replaced by a call to this endpoint with `mode: "atomic"`. Server
  cleanup is the same code path as the resume mode.

---

## 4. `cx_tool_call` — new column `is_resumable`

```sql
alter table cx_tool_call
  add column is_resumable boolean not null default true;
```

**Semantics.** `true` if the tool's result is safe to short-circuit on
resume — the tool is deterministic, side-effect-free, or the side
effect was already committed and reusing the cached result is correct.

**Tools that MUST be `false`:**

- Anything that posts external messages (Slack, email, SMS, webhook).
- Anything that creates persistent records the user might mutate
  between attempts (file uploads, payment intents, db writes).
- Tools that read live state (search results that could change,
  weather, stock quotes) — UNLESS the user explicitly opts in.

**Tools that can be `true` by default:**

- Read-only data lookups against immutable internal data.
- Pure transforms (text formatting, JSON manipulation, calculations).
- Code-execution sandbox tools where the input fully determines the
  output.

The resume endpoint walks the failed user_request's tool calls and
short-circuits the resumable ones, re-runs everything else.

---

## 5. `cx_message` — new columns for partial-resume

```sql
alter table cx_message
  add column last_completed_block_index integer,
  add column failure_reason text;
```

**`last_completed_block_index`.** Integer index into `content[]`
indicating the last fully-streamed block before the stream ended. Set
when the stream errored mid-message; null otherwise. Used by the
resume endpoint to know where to pick up the LLM continuation prompt.

**`failure_reason`.** Free-form text from the upstream error
(LLM provider error message, network error, tool error). Surfaces in
the UI when the user mouses over the failed message — currently the
frontend just shows a generic "An error occurred during streaming."

**`status` enum doc.** Today the column is `text`. The observed
values are `reserved`, `streaming`, `active`, `edited`, `deleted`.
Add a documented `partial` value for stream-interrupted rows. The
frontend `MessageRecord.status` is already typed as `string` so no
client work is needed; this is a documentation pass.

---

## 6. Stream contract additions

### New event: `record_resumed`

Emitted at the start of a resume stream (`mode = last_good_step` only).
Tells the client to attach this stream to an existing assistant
message rather than creating a fresh bubble.

```jsonc
// stream event
{
  "type": "record_resumed",
  "table": "cx_message",
  "id": "uuid-of-the-existing-cx_message-row",
  "from_block_index": 7,            // last_completed_block_index + 1
  "user_request_id": "uuid"         // the new cx_user_request
}
```

After this event, normal stream events follow (`chunk`, `tool_started`,
etc.). The `record_update` events apply to the same `id` — no second
reservation.

The atomic mode (`mode = "atomic"`) does NOT emit `record_resumed` —
it behaves exactly like a fresh turn (record_reserved, then chunks,
then completion).

### Existing events affected

- `record_update {table: "cx_message", status: "failed"}` — already
  emitted on stream error. Continue emitting; add the
  `last_completed_block_index` and `failure_reason` to the row when
  patching. Document this in `STREAM_STATUS_LIFECYCLE.md`.
- `record_update {table: "cx_message", status: "partial"}` —
  alternative emission when the message actually has partial content
  worth resuming. The client doesn't need to differentiate from
  `failed` for the v1 retry button (both show the same error block);
  the resume endpoint reads `status` to decide whether `last_good_step`
  is meaningful.

---

## 7. Tool idempotency reference

The `is_resumable` flag is the single source of truth, but the
following table documents the current built-in tool inventory so the
default values can be set sensibly:

| Tool | Default `is_resumable` | Why |
|---|---|---|
| `web_search` | `false` | Live data; results change. |
| `fetch_url` | `false` | Live data; SSRF / rate-limit risk on re-run. |
| `read_note` | `true` | Read-only against owned data. |
| `read_code_file` | `true` | Read-only. |
| `query_table` | `true` | Read-only against the user's own DB rows. |
| `create_note` | `false` | Side effect — creating duplicate notes on retry is bad. |
| `update_note` | `false` | Side effect with potential conflict. |
| `send_email` | `false` | External side effect. Never resume. |
| `code_exec` (sandbox) | `true` | Pure-input pure-output; sandbox is recreated. |

Tools added later should default to `false` unless the implementer
explicitly marks them safe.

---

## 8. Migration order

Recommend rolling out in this order to keep the client stable:

1. ~~**`cx_message_soft_delete` cascade tightening.**~~ **DONE 2026-06-14** —
   created with the tool-call + artifact + media cascade.
2. ~~**`cx_truncate_conversation_after`.**~~ **DONE 2026-06-14** — created;
   frontend calls it directly (feature-detect fallback removed).
3. **Schema additions** (`is_resumable`, `last_completed_block_index`,
   `failure_reason`).
4. **`POST /resume` endpoint, `mode: "atomic"` first.** Frontend
   updates `atomicRetry` to call this.
5. **`POST /resume` endpoint, `mode: "last_good_step"`.** Frontend
   adds the second Retry option.

Each step is independently shippable.

---

## 9. Open questions for the Python team

1. The `cx_user_request` row's `trigger_message_position` is the
   anchor for "the user message that triggered this turn". Is that
   field always populated reliably? The atomic-mode resume needs it.
2. Are sub-agent invocations represented as nested `cx_user_request`
   rows? If so, does resume need to handle "failed in a sub-agent"
   specially?
3. Tool call deduplication on resume: if a tool was started but never
   completed (no `tool_completed` event), do we re-run it
   regardless of `is_resumable`? (Recommendation: yes — incomplete
   means the side effect either didn't happen or was rolled back.)
4. Should `failure_reason` be exposed in the bundle response so the
   client can display it inline, or is it admin-only? (Recommendation:
   surface a sanitized message; hide stack traces.)

Send answers to these back as comments on the PR that introduces
this file.
