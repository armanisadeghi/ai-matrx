# Turn-Boundary Inbox + Interrupt — inbound contract (backend → FE)

> **Direction:** INBOUND (Python/backend → frontend). What the backend now ships
> to us and how to consume it.
> **Audience:** Frontend team, and any consumer of the AIDream chat stream.
> **Canonical source of truth:** aidream `docs/TURN_BOUNDARY_INBOX.md` (the server
> contract). This doc is the FE-facing summary + our client checklist; if anything
> here disagrees with the canonical doc, the canonical doc wins.
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
| **Open stream** (busy), and we want to *redirect* | **abort the stream**, then normal send | cuts the run, keeps the partial, fresh run answers the new message |

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

## Interrupt flow ("stop & redirect")

Fully server-managed — **no special endpoint, no client-supplied content:**
1. **Abort the current stream** (close the SSE connection). The server cancels the
   run and **saves the partial assistant turn** — the text streamed up to the last
   chunk — with an automatic marker appended:
   `\n\n[⚠️ Response interrupted by the user before completion.]`
2. **Send the new message normally** (`POST /ai/conversations/{id}`). The fresh run
   loads history (including that truncated, marked turn) and responds.

**Sequencing:** send the redirect *after* the aborted stream has fully closed, so
the partial turn persists before the new run loads history.

## FE client checklist

- [ ] Keep the composer **enabled while streaming**; route sends made during a
      stream to `/inbox`, sends while idle to the normal endpoint.
- [ ] Render queued messages as a distinct "waiting its turn" state; on
      `injection_consumed` (match by `injection_id`) flip to delivered.
- [ ] Wire retract (`DELETE`) and edit (`PATCH`) on pending items; handle `409`
      (drained — fall back to delivered) and `404` (gone).
- [ ] On reopen mid-run, `GET …/inbox?status=pending` to rebuild waiting cards.
- [ ] Add a "stop & redirect" affordance: abort stream → (after close) normal send.
      The interrupted assistant bubble will show the marker text — render it as a
      cut-off turn.
- [ ] After backend deploy: `pnpm sync-types`, then drop any defensive casts around
      `injection_consumed` fields.

## Not in this contract

Reactive *tool* auto-injection (e.g. "on a GitHub page → code-ingest tools appear")
is a separate, later phase; it will produce injections into this same inbox, so this
contract won't change when it lands.
