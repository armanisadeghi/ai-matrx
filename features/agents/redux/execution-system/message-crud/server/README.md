# message-crud / server

Thunks that talk to the **Python backend** via `callApi()` instead of going
direct to Supabase via `supabase.rpc()`. Every file here is paired with —
and intentionally NOT a replacement for — a thunk in the parent directory.

These exist so we can A/B the two paths in production surfaces, measure,
and then delete the loser. Do not wire these into existing call sites
silently; opt in per surface.

## Pairing table

| Existing (Supabase RPC) | Server-backed (here) | Notes |
| --- | --- | --- |
| `forkConversation` (`cx_fork_conversation` RPC) | `forkConversationServer` (`POST /cx/conversations/{id}/fork`) | Server version accepts `from_message_id` + `exclusive` for cleaner "fork before this message" semantics |
| `forkConversation` + `editMessage` + `executeInstance` (3-call combo for "Edit & Resubmit (Fork)") | `forkAndRunServer` (`POST /ai/conversations/{id}/fork-and-run`, streaming) | Collapses the entire edit-and-fork flow into one atomic streamed call |
| `deleteMessage` (`cx_message_soft_delete` RPC, looped for batch) | `batchDeleteMessages` (`POST /cx/conversations/{id}/messages/delete`) | Hard delete; cascades tool_use ↔ tool_result pairs; supports `dry_run: true` |
| _(no existing equivalent)_ | `replaceMessages` (`POST /cx/conversations/{id}/messages/replace`) | User-initiated compaction: soft-delete a range, insert a single visible summary, reversible |
| _(no existing equivalent)_ | `hideMessages` (`POST /cx/conversations/{id}/messages/hide`) | System compaction: hide from the model only; user UI unchanged |
| _(no existing equivalent)_ | `restoreCompaction` (`POST /cx/conversations/{id}/messages/restore`) | Reverse a `replace` or `hide` |
| _(no existing equivalent)_ | `compactTurns` (`POST /cx/conversations/{id}/turns/compact`) | Compact whole user→user turns; delegates to replace/hide |

## Spec

`/docs/FE_CONVERSATION_API_CHANGES.md` — server-team contract for every
endpoint listed above. Request/response types are also in
`types/python-generated/api-types.ts` (auto-generated).

## Stream event

`features/agents/types/conversation-stream-events.ts` defines the
`ConversationForkedEvent` payload that `fork-and-run` emits as the first
NDJSON event. That type is NOT in `api-types.ts` because stream-event
payloads aren't OpenAPI-shaped (same situation as the scraper's
`page_extraction` events).
