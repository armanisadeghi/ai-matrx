# message-crud / server

> Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/STATE.md` § 4 — the endpoint inventory for these thunks lives there. Read it before touching this feature in ANY repo.

Thunks that talk to the **Python backend** via `callApi()` instead of going direct to Supabase via
`supabase.rpc()`.

- **Every file here is paired with — and intentionally NOT a replacement for — a thunk in the parent
  directory.** They exist so the two paths can be A/B'd in production, measured, and the loser
  deleted.
- **Do not wire these into existing call sites silently; opt in per surface.**
- `batchDeleteMessages` archives (sets `deleted_at` on the messages and their tool calls,
  artifacts and media — the server twin of `cx_message_soft_delete`). It differs from the
  Supabase path only in its selector grammar and tool-pair cascade. Nothing here destroys a row.
- `ConversationForkedEvent` (`features/agents/types/conversation-stream-events.ts`) is deliberately
  NOT in `api-types.ts` — stream-event payloads are not OpenAPI-shaped. Do not "fix" that by adding
  it to the generated types.
