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

## 🎯 THE THREE SEND MODES — Arman's vision (ruling 2026-07-29, do not re-derive)

Every "send while the agent is running" is exactly one of these three user
intents. This section is the product truth; every composer, thunk, and doc
serves it. Never collapse two modes into one, never make Send a disguised
Stop, and never invent a fourth mode.

1. **QUEUE (the DEFAULT).** *"User wants to send a message but doesn't want it
   to go until the agent is completely done with everything it's doing and the
   turn ends."* The message sits and waits for everything to end; when we are
   DONE, THE NEXT QUEUED MESSAGE submits — it is a real FIFO **queue**, not
   just one message. Editable (and withdrawable) until it's officially sent.
   → **Server-held and durable** (2026-07-30): `POST …/inbox` with
   `delivery:"turn_end"`. The server holds it past every mid-run boundary and
   delivers exactly one queued item at the run's FINAL boundary, continuing
   the run on the same stream (`inbox_continue`) — so you can queue fifteen
   messages, close the laptop, and the agent keeps working through them.
   Reload-safe by construction; no client watcher exists anymore.

2. **STEER.** *"Allow the agent to do whatever it's doing right now, but at
   the next natural turn point, add the user's message."* In an agentic flow
   this normally means it rides in with a tool result, so the agent sees the
   result AND what the user wants to add. Usually delivered fast; can still
   queue several back-to-back (FIFO). Editable until it's officially
   delivered.
   → Server-held (`POST /ai/conversations/{id}/inbox` with the default
   `delivery:"next_boundary"`, drained at the next turn boundary, answered on
   the already-open stream, `injection_consumed` acks delivery).

3. **INTERRUPT.** *"User sees the agent doing something he doesn't like — this
   instantly STOPS whatever the agent is doing and essentially sends the user
   message as a reply."* Done right it is a clean **fork at the last clean
   point**: no tool-result mismatches, nothing corrupted. The run already in
   flight is NOT thrown away for cost purposes — **let it finish, keep the
   costs** — but its abandoned tail (partial text, unfinished tool calls) is
   marked `is_visible_to_user=false` AND `is_visible_to_model=false`, so it
   costs correctly and hurts nothing else.
   → **Fully shipped both halves (2026-07-30).** Client: `interruptAndSend`
   fires `POST /ai/cancel/{request_id}?mode=interrupt`, aborts the local
   stream instantly (ChatGPT-style — the UI stops NOW while the server winds
   down in the background), then sends the reply, retrying transparently on
   the turn lock's `run_in_flight` 409 until admitted. Server: the executor's
   interrupt fence hides the abandoned tail (`is_visible_to_user=false` +
   `is_visible_to_model=false`, tool pairs kept intact) while keeping costs.

## The one rule for the client

We are the most reliable judge of "is a run active" — **we opened the stream and
know if it's still emitting.** So the client decides, the server never guesses:

| Situation | Mode | Mechanics |
|---|---|---|
| **No open stream** (idle) | normal send | `POST /ai/conversations/{id}` — runs immediately, streams |
| **Open stream**, message should wait its turn | **QUEUE** (default: Enter / Send button) | `POST …/inbox` `delivery:"turn_end"` — server-held FIFO, one delivered per final boundary, run continues on the same stream |
| **Open stream**, message should reach the agent mid-run | **STEER** (⌘Enter, or "Deliver now" on a queued card) | `POST …/inbox` `delivery:"next_boundary"`; answered on the open stream at the next boundary |
| **Open stream**, stop and redirect | **INTERRUPT** (⌘⇧Enter) | `POST /ai/cancel/{request_id}?mode=interrupt` + instant local abort → send, retrying past the turn lock's `run_in_flight` 409 |

The server also enforces this with a **turn lock** (belt to our braces): a
second run on a busy conversation gets a 409 with `error.code:"run_in_flight"`
and a user-honest message; an IDENTICAL text from the same user within 45s is
treated as a duplicate fire and silently ignored (benign
`info: duplicate_turn_ignored` stream). The lock is staleness-bound (180s of
no activity ⇒ treated as free), so a crashed run can never brick a
conversation.

## Inbox endpoint

`POST /ai/conversations/{conversation_id}/inbox` (JSON, immediate — not a stream):

```jsonc
// request
{ "kind": "user_message",      // "user_message" | "system_message"
  "text": "Actually, focus on pricing.",
  "delivery": "next_boundary", // "next_boundary" (STEER, default) | "turn_end" (QUEUE)
  "is_visible_to_user": true, "is_visible_to_model": true }

// response
{ "injection_id": "8f3c…", "conversation_id": "5e8b…",
  "status": "pending", "run_active": true }
```

Manage while pending:
- `GET /ai/conversations/{id}/inbox?status=pending` → `[{injection_id, kind, text, delivery, status, queued_at, is_visible_to_user, is_visible_to_model}]` (FIFO) — rebuild "waiting" UI on reopen (`hydrateInbox` maps `delivery` back to the card's mode).
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
- **Stop & redirect** (`interruptAndSend`, `⌘/Ctrl+Shift+Enter`) — the full
  INTERRUPT vision, live 2026-07-30:
  1. Fire `POST /ai/cancel/{request_id}?mode=interrupt` (fire-and-forget).
  2. Abort the local stream + settle the UI **immediately** — the honest
     "lie" every top chat client tells: it looks stopped now; the server
     winds the in-flight provider call down in the background (cost kept).
  3. Wait for the local abort controller to clear, then send the reply,
     retrying transparently while the server's turn lock still answers 409
     `run_in_flight` (750ms interval, 120s window — the retry lives inside
     `executeInstance` around `runAiStream`, same requestId + same optimistic
     bubble, so no duplicates and the composer is never wrongly cleared).
  On the server, the executor's **interrupt fence** persists the abandoned
  tail — partial text and unfinished tool calls after the last clean
  boundary — with `is_visible_to_user=false` AND `is_visible_to_model=false`,
  as a complete pairing-safe unit. The user's message replies to the last
  thing they actually saw; costs of the in-flight call are fully recorded.
- The `[⚠️ Response interrupted…]` marker exists only on the server's
  hard-cancellation path (task cancelled mid-provider-call — shutdown or a
  `detach_on_disconnect=False` caller), where text really is truncated.

## Server-side producers — the inbox is not only a client queue

Server features write into the same table, with the same drain and guarantees.
Live today: **`source='agent_collab'`** — aidream's `agent_call` `remember=true`
enqueues the child agent's answer into the SOURCE conversation
(`kind='system_message'`, `delivery='turn_end'`, provenance under
`metadata.agent_collab`). Three client rules follow, all shipped 2026-08-11
(details + rationale in `features/agents/components/chat/FEATURE.md` Flow 6):

- **Render them as collaboration notes, not queued messages** — no edit, no
  "Deliver now"; withdraw stays. They show even when `is_visible_to_user` is
  false: the note stays out of the transcript, but the user must be able to see
  that one is waiting.
- **`hydrateInbox` runs on EVERY conversation load.** A server producer
  enqueues into an idle conversation and the self-drain exclusion holds the row
  for the NEXT run — the old "skip when the latest turn completed" gate made
  exactly those notes invisible.
- **A delivered note is a user-role row the user never typed.** Group and
  render it as a collaboration note, never a user bubble.

## FE client checklist — SHIPPED 2026-07-29/30

- [x] Composer **enabled while streaming**; `smartExecute` applies the three
      send modes through ONE funnel: `enqueueInboxMessage({mode})` →
      `POST …/inbox` with `delivery: turn_end` (QUEUE, the default) or
      `next_boundary` (STEER, `whileRunning:"steer"`) — never POST `/inbox`
      from anywhere else. Both modes are **server-held and reload-durable**;
      the old client FIFO + drain watcher are deleted. Second layer:
      `executeInstance` refuses a concurrent turn and reconciles to the QUEUE,
      loudly. Slice: `conversationInbox`
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
- [x] "Stop & redirect": `interruptAndSend` — instant local stop +
      `mode=interrupt` fork + turn-lock retry (see above). Plain Stop also
      signals the server now (was: local-abort only, run kept burning tokens).
- [x] Types already synced (`injection_consumed` + all four inbox endpoints in
      `types/python-generated/`).

## Not in this contract

Reactive *tool* auto-injection (e.g. "on a GitHub page → code-ingest tools appear")
is a separate, later phase; it will produce injections into this same inbox, so this
contract won't change when it lands.
