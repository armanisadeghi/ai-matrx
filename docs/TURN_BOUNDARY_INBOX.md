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
   → Client-held (`conversationInbox` slice, `mode:"queue"`); the drain
   watcher sends each item as a normal turn once the run fully settles, one
   per turn.

2. **STEER.** *"Allow the agent to do whatever it's doing right now, but at
   the next natural turn point, add the user's message."* In an agentic flow
   this normally means it rides in with a tool result, so the agent sees the
   result AND what the user wants to add. Usually delivered fast; can still
   queue several back-to-back (FIFO). Editable until it's officially
   delivered.
   → Server-held (`POST /ai/conversations/{id}/inbox`, drained at the next
   turn boundary, answered on the already-open stream, `injection_consumed`
   acks delivery).

3. **INTERRUPT.** *"User sees the agent doing something he doesn't like — this
   instantly STOPS whatever the agent is doing and essentially sends the user
   message as a reply."* Done right it is a clean **fork at the last clean
   point**: no tool-result mismatches, nothing corrupted. The run already in
   flight is NOT thrown away for cost purposes — **let it finish, keep the
   costs** — but its abandoned tail (partial text, unfinished tool calls) is
   marked `is_visible_to_user=false` AND `is_visible_to_model=false`, so it
   costs correctly and hurts nothing else.
   → Client half shipped (`interruptAndSend`: server cancel → wait for the
   stream to close → send). The instant-fork server half (immediate new turn
   + invisible abandoned tail) is a pending aidream build — see "Interrupt
   flow" below for what runs today.

## The one rule for the client

We are the most reliable judge of "is a run active" — **we opened the stream and
know if it's still emitting.** So the client decides, the server never guesses:

| Situation | Mode | Mechanics |
|---|---|---|
| **No open stream** (idle) | normal send | `POST /ai/conversations/{id}` — runs immediately, streams |
| **Open stream**, message should wait its turn | **QUEUE** (default: Enter / Send button) | client-held FIFO; drain watcher sends it as the next normal turn when the run fully ends |
| **Open stream**, message should reach the agent mid-run | **STEER** (⌘Enter, or "Deliver now" on a queued card) | `POST /ai/conversations/{id}/inbox`; answered on the open stream at the next boundary |
| **Open stream**, stop and redirect | **INTERRUPT** (⌘⇧Enter) | today: `POST /ai/cancel/{request_id}` → wait for stream end → normal send. Target: instant fork (server work pending) |

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

**Target (Arman's INTERRUPT vision — server build pending, aidream):** the
stop should be INSTANT from the user's perspective — a clean fork at the last
clean point. The in-flight provider call still finishes (its cost is committed;
**keep the costs**), but the abandoned tail — partial assistant text and any
unfinished tool calls — persists with `is_visible_to_user=false` AND
`is_visible_to_model=false`, hidden as a complete, pairing-safe unit (never
orphan a `tool_use` from its `tool_result`). The user's message then sends
immediately as the reply without waiting for the old call to wind down. Until
that ships, `interruptAndSend` waits for the stream to end before sending —
correct, just not instant.

## FE client checklist — SHIPPED 2026-07-29/30

- [x] Composer **enabled while streaming**; `smartExecute` applies the three
      send modes: default **QUEUE** (`queueMessage` — client FIFO + drain
      watcher sending each item as a normal turn via `userTextOverride`, the
      composer's live draft untouched), explicit **STEER**
      (`whileRunning:"steer"` → `enqueueInboxMessage` → `POST …/inbox`, the
      single funnel — never POST `/inbox` from anywhere else). Second layer:
      `executeInstance` refuses a concurrent turn and reconciles to the QUEUE,
      loudly. Slice: `conversationInbox`
      (`features/agents/redux/execution-system/inbox/`).
      ⚠️ Durability note: QUEUE items are client-held — a page reload loses
      not-yet-sent queued messages (steer items survive server-side). A
      server-held deferred queue (`deliver:"turn_end"` inbox kind) is the
      future fix if this bites.
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
