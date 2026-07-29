# Turn-Boundary Inbox + Interrupt — inbound contract (backend → FE)

> **Direction:** INBOUND (Python/backend → frontend). What the backend now ships
> to us and how to consume it.
> **Audience:** Frontend team, and any consumer of the AIDream chat stream.
> **Server contract reference:** aidream `docs/TURN_BOUNDARY_INBOX.md` (the server
> contract). This doc is the FE-facing summary + our client checklist; if anything
> here disagrees with that server-side contract, the server-side contract wins.
> **Deploy gate:** everything below is on aidream `main`; it must be **deployed**
> before we can exercise it. Re-run `pnpm sync-types` after the backend deploys to
> pick up the typed `injection_consumed` event.

---

## What changed for us

Two new capabilities on an existing conversation, plus one new stream event:

1. **Send while a run is streaming (inbox).** The user no longer has to wait for
   the agent to finish or cancel it. While a run streams, a "send" queues the
   message; the running agent picks it up at its next natural pause and answers it
   on the same stream.
2. **Manage queued messages** — list / retract / edit while still pending.
3. **Interrupt ("stop & redirect").** Cut the run now, keep what the model already
   said (as a truncated assistant turn with a marker), and send a new direction.

## The one rule for the client

We are the most reliable judge of "is a run active" — **we opened the stream and
know if it's still emitting.** So the client decides, the server never guesses:

| Situation | Call | Result |
|---|---|---|
| **No open stream** (idle) | normal send `POST /ai/conversations/{id}` | runs immediately, streams |
| **Open stream** (busy), and we want to *add* to it | `POST /ai/conversations/{id}/inbox` | queues; answered on the open stream at the next boundary |
| **Open stream** (busy), and we want to *redirect* | `POST /ai/cancel/{request_id}`, wait for the stream to end, then normal send | stops the run at its next boundary (everything streamed persists), fresh run answers the new message — see "Interrupt flow" below |

## Inbox endpoint

`POST /ai/conversations/{conversation_id}/inbox` (JSON, immediate — not a stream):

```jsonc
// request
{ "kind": "user_message",      // "user_message" | "system_message"
  "text": "Actually, focus on pricing.",
  "is_visible_to_user": true, "is_visible_to_model": true }

// response
{ "injection_id": "8f3c…", "conversation_id": "5e8b…",
  "status": "pending", "run_active": true }
```

Manage while pending:
- `GET /ai/conversations/{id}/inbox?status=pending` → `[{injection_id, kind, text, status, queued_at, is_visible_to_user, is_visible_to_model}]` (FIFO) — rebuild "waiting" UI on reopen.
- `DELETE /ai/conversations/{id}/inbox/{injection_id}` → retract. `409` if it already drained, `404` if gone.
- `PATCH  /ai/conversations/{id}/inbox/{injection_id}` `{ "text": "…" }` → edit. Same `409` / `404`.

## New stream event — `injection_consumed`

Emitted on the **existing** stream when the running agent drains queued item(s):

```jsonc
{ "event": "injection_consumed",
  "data": { "conversation_id": "5e8b…", "count": 1,
    "items": [ { "injection_id": "8f3c…", "kind": "user_message",
                 "text": "Actually, focus on pricing.",   // echoed — render from this
                 "is_visible_to_user": true, "position": 7, "message_id": null } ] } }
}
```

Move the bubble from "queued" → "delivered" and honor `is_visible_to_user`. Because
`text` is echoed, a client that didn't originate the queue (reopened panel, other
device) can still render it. (Also: an `info` event with `code:"inbox_continue"`
fires if the agent had to continue past its final turn to answer a just-queued msg.)

## Interrupt flow ("stop & redirect") — the REAL contract

> ⚠️ An earlier revision of this doc said "abort the SSE and the server saves a
> truncated turn with a marker." That was never how production behaves: aidream
> streams with `detach_on_disconnect=True` (a client disconnect NEVER stops
> server work — the run loops to completion on the server's dime). Closing your
> read of the stream stops nothing.

The server-side stop is **`POST /ai/cancel/{request_id}`** — cooperative: the
run stops at its next iteration boundary, the in-flight provider call finishes
by design (its cost is committed the instant it starts), and **everything
streamed persists as normal history** (no truncation, so no marker is needed).

- **`request_id`** is the server's id from the stream response's
  **`X-Request-ID` header** — captured by `runAiStream` into
  `activeRequests.byRequestId[*].serverRequestId`. The client-local `req_*` id
  means nothing to the server.
- **Stop** (`cancelExecution`) fires the cancel POST best-effort AND aborts the
  local stream so the UI settles instantly.
- **Stop & redirect** (`interruptAndSend`) fires the cancel POST, keeps reading
  the stream until it ends (stream end ⇒ the run finalized and persisted — the
  continue endpoint takes no run claim, so sending earlier would start a
  CONCURRENT run), then submits normally. `⌘/Ctrl+Shift+Enter` in the composer.
- The `[⚠️ Response interrupted…]` marker exists only on the server's
  hard-cancellation path (task cancelled mid-provider-call — shutdown or a
  `detach_on_disconnect=False` caller), where text really is truncated.

## FE client checklist — SHIPPED 2026-07-29

- [x] Composer **enabled while streaming**; `smartExecute` routes a send during
      a live run to `enqueueInboxMessage` → `POST …/inbox` (single funnel —
      never POST `/inbox` from anywhere else), idle sends run normally. Second
      layer: `executeInstance` refuses a concurrent turn and reconciles to the
      inbox, loudly. Slice: `conversationInbox`
      (`features/agents/redux/execution-system/inbox/`).
- [x] Queued messages render as "waiting its turn" cards (`InboxQueueStrip`,
      mounted by SmartAgentInput both variants + CompactAssistantInput +
      NewChatLandingInput); on `injection_consumed`, `process-stream` retires
      the card and seeds the transcript bubble from the echoed `text`
      (promoted to the durable id by the matching `record_reserved`).
- [x] Retract (`DELETE`) and edit (`PATCH`) wired with 409 (drained →
      delivered) and 404 handling — `retractInboxItem` / `editInboxItem`.
- [x] Reopen mid-run rebuilds waiting cards — `hydrateInbox` from
      `loadConversation` (gated: skipped when the latest turn completed, since
      a completed run cannot strand items — the no-stranding drain).
- [x] "Stop & redirect": `interruptAndSend` (see above). Plain Stop also
      signals the server now (was: local-abort only, run kept burning tokens).
- [x] Types already synced (`injection_consumed` + all four inbox endpoints in
      `types/python-generated/`).

## Not in this contract

Reactive *tool* auto-injection (e.g. "on a GitHub page → code-ingest tools appear")
is a separate, later phase; it will produce injections into this same inbox, so this
contract won't change when it lands.
