# Agent Tasks

Active worklist managed by agents. **See `AGENT_INSTRUCTIONS.md` for rules** — especially around task format, condensation, and when to ask the user.

> Quick scan order for arriving agents:
> 1. **Needs Clarification** below (questions waiting on the user)
> 2. **Blocked** (waiting on external)
> 3. **Active** (`ready` and `in-progress`)
> 4. **Completed** (recent context, condensed)

---

## Needs Clarification

_(none)_

## Blocked

_(none)_

## Active

### TASK-001: Integrate Agent Handoff + Conversation Value Store (backend shipped)
- **Status:** ready
- **Created:** 2026-07-07
- **Source:** Backend shipped two agent patterns (2026-07-02); FE integration is a cross-repo handoff from aidream.

**Goal**
The chat UI correctly renders the two new backend agent patterns: (1) Agent Handoff — a front agent hands a turn to a specialist whose answer persists as the conversation's own reply; (2) Conversation Value Store — pass-by-reference results between agent calls. No raw handoff plumbing bubbles appear; the streaming answer bubble survives refetch; value-store cards/fences render.

**Why**
matrx-frontend reads `chat.message` from Supabase directly, so the server cannot filter plumbing rows for us. Without the §1 read filter, users see raw tool_use/tool_result plumbing bubbles from every handoff turn.

**Subtasks**
- [ ] **(load-bearing)** Add `is_visible_to_user` filter to EVERY conversation message-list read: `.or('is_visible_to_user.is.null,is_visible_to_user.eq.true')` (column is nullable; NULL = visible).
- [ ] Rebind the live streaming bubble to the durable row id announced on the handoff's `record_reserved` event (`table:"message"`, `metadata.handoff:true`) — the answer streams under a loop-start placeholder id but persists at a later position.
- [ ] On a `completion` event `operation:"sub_agent", status:"failed"` (never suppressed), truncate the live bubble back to pre-handoff text; the caller's retry streams after.
- [ ] Render `value_store.stored` (`ValueStoredEvent`) as a compact "result ready" card; render the `descriptor.fence` (a ```matrx block) via the existing envelope chip renderer, never as prose/code.
- [ ] Handle `value_store.groomed` (`ContextGroomedEvent`) — user-facing view unchanged (keep reading full `cx_tool_call.output`); optional subtle "context compacted" indicator.
- [ ] Render inline `context_groom` ```matrx fences in assistant prose via the existing fence chip renderer (kind/type are in the 65-shape manifest).
- [ ] Run `pnpm sync-types` so `ValueStoredEvent` / `ContextGroomedEvent` land in `stream-events.ts`.

**Notes**
- Full contract (events, columns, rendering hooks): `aidream/docs/cx_chat/FE_HANDOFF_AGENT_PATTERNS.md` (in the aidream repo at `/Users/armanisadeghi/code/aidream/docs/cx_chat/FE_HANDOFF_AGENT_PATTERNS.md`). Server contracts of record: `aidream/services/agent_handoff/FEATURE.md` + `aidream/services/conversation_values/FEATURE.md`.
- **OPEN DECISION for Arman (not for the agent to decide):** whether to ALSO add server-side RLS/view hardening for `is_visible_to_user`. Deliberately NOT done on the backend because it would also hide these rows from admin/debug surfaces. Until decided, the FE read filter above is the ONLY thing hiding plumbing bubbles — it is mandatory.

---

## Completed

_(none yet)_
