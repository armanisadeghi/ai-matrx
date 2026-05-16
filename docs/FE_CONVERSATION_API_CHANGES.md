# Conversation API — New Endpoints

All endpoints follow the existing auth pattern (`Authorization: Bearer …`) and live under both `/api/conversations/{id}/…` and `/api/conversation/{id}/…` (singular alias kept for back-compat).

---

## 1. Fork-and-Run — `POST /conversations/{id}/fork-and-run` (streaming)

**Purpose:** Fork a conversation and immediately run a new turn on the fork — one request, one stream. Replaces the two-step "POST /fork, then POST /conversations/{new_id}" pattern. The source conversation is never mutated.

**Request body** (`ForkAndRunRequest`): Extends `ConversationContinueRequest` (so all the usual `user_input`, `tools`, `client`, `config_overrides`, `context`, etc. apply) plus these new fields:

```ts
{
  // Selector — pick one, both omitted means "copy everything"
  up_to_position?: number | null;
  from_message_id?: string | null;
  exclusive?: boolean;             // default false — when true with from_message_id, the anchor is NOT copied
  fork_title?: string | null;

  // Plus everything ConversationContinueRequest carries
  user_input: string | object[];
  tools?: ToolSpec[];
  tools_replace?: ToolSpec[] | null;
  client?: ClientContext;
  // ...etc
}
```

**Canonical UX flow — "edit message N and resubmit":**

```ts
POST /conversations/abc-123/fork-and-run
{
  "from_message_id": "<id-of-the-message-being-edited>",
  "exclusive": true,               // drop the message being edited
  "user_input": "<the new edited content>",
  "tools": [...],                  // optional — same shape as POST /conversations/{id}
  "client": { "capabilities": [...] }
}
```

**Stream:** The **first data event** is always a `conversation.forked` payload so the FE can navigate to the new conversation before any tokens arrive:

```ts
// First event on the stream
{
  "kind": "conversation.forked",
  "new_conversation_id": "9f3c…",
  "source_conversation_id": "abc-123",
  "forked_at_position": 4,         // null if forked from the start
  "message_count": 5               // messages copied to the fork
}
```

After that, the stream produces normal agent output (chunks, tool events, end) — identical wire shape to `POST /conversations/{id}`.

> **Note:** `ConversationForkedEvent` is NOT in `api-types.ts` because stream-event payloads aren't OpenAPI-shaped. Mirror this TS interface manually (same pattern as `page_extraction` events):
>
> ```ts
> export interface ConversationForkedEvent {
>   kind: "conversation.forked";
>   new_conversation_id: string;
>   source_conversation_id: string;
>   forked_at_position: number | null;
>   message_count: number;
> }
> ```

---

## 2. Fork — `POST /conversations/{id}/fork` (existing, extended)

**Backwards-compatible additions** to `ForkRequest`:

```ts
{
  // Existing
  up_to_position?: number | null;
  title?: string | null;

  // NEW selectors
  from_message_id?: string | null;
  exclusive?: boolean;             // default false
}
```

Old shape still works. `from_message_id` translates to a position internally. `exclusive: true` lets the caller say "fork *before* this message" in one call.

---

## 3. Batch delete — `POST /conversations/{id}/messages/delete`

**Purpose:** Delete one or many messages with optional tool-pair cascading. Hard delete. Supersedes loops over the single-row `DELETE /messages/{id}`.

```ts
{
  selector: MessageSelector,       // see "Shared selector grammar" below
  cascade_tool_pairs?: boolean,    // default true — keeps tool_use/tool_result pairs together
  dry_run?: boolean                // default false — preview the resolved set without deleting
}
→ {
  deleted_ids: string[],
  cascaded_ids: string[],          // additional IDs the cascade pulled in
  remaining_count: number,
  dry_run: boolean
}
```

---

## 4. User-initiated compaction — `POST /conversations/{id}/messages/replace`

**Purpose:** Soft-delete a range of messages and insert a single summary message in their place. The summary is visible to both user and model; originals are hidden from both. Reversible.

```ts
{
  selector: MessageSelector,
  summary_content: object[],       // structured chat-content blocks, e.g. [{ type: "text", text: "..." }]
  summary_metadata?: object,       // arbitrary FE metadata copied to the summary row
  cascade_tool_pairs?: boolean     // default true
}
→ {
  summary_message_id: string,      // the new assistant row to render as "[N messages compacted]"
  compaction_group_id: string,     // pass to /messages/restore to undo
  stashed_message_ids: string[],
  summary_position: number
}
```

The summary row's `metadata.compaction_summary` carries `replaced_message_ids`, `replaced_position_range`, `replaced_count`, `mode: "user"`, and `created_at` so the UI can render an "N messages compacted — view originals" affordance.

---

## 5. System-initiated compaction — `POST /conversations/{id}/messages/hide`

**Purpose:** Hide messages from the **model** only. The user keeps seeing them in chat. Positions are not moved; status stays "active"; nothing is soft-deleted. No summary row inserted.

```ts
{
  selector: MessageSelector,
  cascade_tool_pairs?: boolean     // default true
}
→ {
  compaction_group_id: string,     // pass to /messages/restore to undo
  hidden_message_ids: string[]
}
```

Use this for silent context optimization — agent sees fewer tokens, user's chat history is undisturbed.

---

## 6. Restore — `POST /conversations/{id}/messages/restore`

**Purpose:** Reverse a `/messages/replace` or `/messages/hide`.

```ts
{
  // Identify the operation — provide one
  compaction_group_id?: string,
  summary_message_id?: string,     // replace operations only
  delete_summary?: boolean         // default true — remove the inserted summary row
}
→ {
  restored_message_ids: string[],
  deleted_summary_id: string | null,
  compaction_group_id: string
}
```

> The OpenAPI generator namespaces this response as `aidream__api__routers__cx_data__RestoreResponse` (there's an unrelated `RestoreResponse` in `file_analysis`). Type it as `components["schemas"]["aidream__api__routers__cx_data__RestoreResponse"]` or alias it on import.

---

## 7. Turn compaction — `POST /conversations/{id}/turns/compact`

**Purpose:** Compact one or more **whole turns** at once. A turn = one `role: "user"` message → next `role: "user"` message (exclusive). Resolves the turn boundary from the live conversation, then delegates to `/messages/replace` (mode=user) or `/messages/hide` (mode=system).

```ts
{
  range: {
    from_user_message_id: string,        // must be a live role: "user" message
    to_user_message_id?: string | null   // also a user message; the turn-range ends BEFORE this. omit = compact to end.
  },
  summary_content: object[],
  mode?: "user" | "system",              // default "user"
  cascade_tool_pairs?: boolean,
  summary_metadata?: object
}
→ {
  compaction_group_id: string,
  summary_message_id: string | null,     // null for system mode (no summary inserted)
  compacted_message_ids: string[],
  turn_count: number,
  position_range: [number, number]
}
```

---

## Shared selector grammar — `MessageSelector`

Used by `/messages/delete`, `/messages/replace`, `/messages/hide`. **Pick exactly one form** — conflicting selectors return 422.

```ts
type MessageSelector = {
  message_ids?: string[];               // explicit list
} | {
  from_position?: number;               // inclusive numeric range
  to_position?: number;
} | {
  from_message_id?: string;             // inclusive id range
  to_message_id?: string;
  inclusive?: boolean;                  // when to_message_id omitted: true = to end, false = just this one
} | {
  after_message_id?: string;            // truncate everything strictly AFTER the anchor
};
```

---

## Quick reference

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/conversations/{id}/fork-and-run` | Stream: fork + run new turn (the "edit and resubmit" flow) |
| `POST` | `/conversations/{id}/fork` | Just fork the data (now accepts `from_message_id` + `exclusive`) |
| `POST` | `/conversations/{id}/messages/delete` | Hard batch delete with cascade |
| `POST` | `/conversations/{id}/messages/replace` | User compaction (soft delete + visible summary) |
| `POST` | `/conversations/{id}/messages/hide` | System compaction (hide from model only) |
| `POST` | `/conversations/{id}/messages/restore` | Undo replace/hide |
| `POST` | `/conversations/{id}/turns/compact` | Compact whole user→user turn(s) |

---

## Type-generation status

Generated TS types via `python scripts/generate_types.py api`:

- ✅ 474 routes, 538 schemas
- ✅ All new endpoints in `openapi.json` and `api-types.ts`
- ✅ Request types: `BatchDeleteRequest`, `ReplaceRequest`, `HideRequest`, `RestoreRequest`, `CompactTurnsRequest`, `ForkAndRunRequest`, `MessageSelector`
- ✅ Response types: `BatchDeleteResponse`, `ReplaceResponse`, `HideResponse`, `RestoreResponse` (namespaced), `CompactTurnsResponse`, `ForkConversationResponse`
- ✅ Existing `ForkRequest` updated with `from_message_id` + `exclusive`
- ⚠️ `ConversationForkedEvent` (stream payload) is NOT in api-types.ts — same pattern as `page_extraction` events. FE needs to mirror the small TS interface (snippet in §1).

The audit `python scripts/audit_api_types.py --baseline scripts/audit_baseline.json` reports **zero new violations** — every new field is concretely typed, every endpoint has a `response_model`, no `send_data({…})` dict literals.

---

## Backwards compatibility

Everything in this batch is **purely additive**:

- The existing single-row endpoints (`PATCH /messages/{id}`, `DELETE /messages/{id}`, `DELETE /messages`, the original `POST /fork`) are unchanged and continue to work.
- The `ForkRequest` shape adds optional fields only — existing callers using `up_to_position` keep working.
- No request bodies were renamed or moved.

The new endpoints are wrappers / batch versions of the primitives, not replacements.
