# message-crud / server

> Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/STATE.md` § 4 — the endpoint inventory for these thunks lives there. Read it before touching this feature in ANY repo.

Thunks that talk to the **Python backend** via `callApi()` instead of going direct to Supabase via
`supabase.rpc()`.

- **Every file here is paired with — and intentionally NOT a replacement for — a thunk in the parent
  directory.** They exist so the two paths can be A/B'd in production, measured, and the loser
  deleted.
- **Do not wire these into existing call sites silently; opt in per surface.**
- `batchDeleteMessages` is a **hard** delete (the Supabase twin soft-deletes). Do not swap one for
  the other on the assumption that they are equivalent.
- `ConversationForkedEvent` (`features/agents/types/conversation-stream-events.ts`) is deliberately
  NOT in `api-types.ts` — stream-event payloads are not OpenAPI-shaped. Do not "fix" that by adding
  it to the generated types.
