# FEATURE.md — `ui-first-tools`

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-05-19` (user-tool parity refresh)

> Universal client-delegated tool layer + ambient context envelope for the
> Next.js surface. Mirrors the matrx-extend Chrome extension's UI-first
> tools so the same agent prompt works on either surface.

---

## Purpose

The agent calls a small set of "UI-first" tools (`user`, `update_plan`,
`request_user_takeover`, `tasks`, `user_todos`, `memory`, `storage`) that
have no server-side execution — the Next.js client validates the args,
runs a handler (UI render or Supabase CRUD), and POSTs `tool_results`
back so the model resumes. Tightly paired with the `nextjs-surface`
client capability that brings these tools online AND publishes ambient
context the model templates into prompts.

This feature exists because:

1. Before this, the dispatcher in `process-stream.ts` paused indefinitely
   on any non-widget delegated tool. Generic client tools were unreachable.
2. The model lacked ambient awareness — no automatic `user`, `client`,
   `route_brief`, `active_scope` keys in `context`. Every agent prompt
   had to hand-wire its slots.

---

## Entry points

**Routes**
- `app/(authenticated)/agent-lists/page.tsx` — aggregate hub showing
  every conversation's plan / tasks / user todos for triage.

**Hooks / components (consumed by chat surfaces)**
- `<TaskPanelChip conversationId={id} />` — header chip in
  `AgentConversationColumn` showing live task / todo counts. Hidden when
  the conversation has no lists.
- `<PendingAsksZone conversationId={id} />` — renders pending ask cards
  directly above the chat input. **Never disables the input.** The user
  can answer cards, type into the input, and submit either or both
  independently.
- `<TaskPanel ...>` — drawer panel opened by the chip.

**Services**
- `service/agent-plan.service.ts` — cx_agent_plan CRUD
- `service/agent-task.service.ts` — cx_agent_task CRUD
- `service/user-todo.service.ts` — cx_user_todo CRUD
- `service/agent-memory.service.ts` — cx_agent_memory KV
- `service/agent-user-kv.service.ts` — agent_user_kv KV

**Redux slices**
- `pendingAsks` (`redux/pending-asks.slice.ts`) — pending ask inbox per
  conversation. Resolution promises live in a sibling module
  (`redux/ask-resolver-registry.ts`) so non-serializable callbacks stay
  out of Redux.
- `agentLists` (`redux/agent-lists.slice.ts`) — live mirror of plan +
  tasks + user todos per conversation. Hydrated on mount, kept fresh by
  Supabase Realtime subscriptions.

**Capability provider**
- `capability/nextjs-surface.provider.ts` — registers the
  `nextjs-surface` `ClientCapabilityProvider`. Always active when the
  user is authenticated. Brings the seven UI-first tools online.

**Dispatcher**
- `dispatcher/dispatch-ui-first-tool.thunk.ts` — wired into
  `features/agents/redux/execution-system/thunks/process-stream.ts` to
  route `tool_delegated` events for UI-first tool names.

---

## Data model

**Database tables** (`migrations/cx_agent_lists.sql`)

| Table | Scope | Purpose |
|---|---|---|
| `cx_agent_plan` | per-conversation | proposed/approved/rejected plans; status flows once and locks on approve |
| `cx_agent_task` | per-conversation | agent's own tasklist; status: pending/in_progress/done/blocked/skipped |
| `cx_user_todo` | per-conversation | items the agent assigns BACK to the user; checkbox done/not-done |
| `cx_agent_memory` | per-conversation | ephemeral KV scratchpad (cleared on conversation delete) |
| `agent_user_kv` | per-user | persistent KV (survives conversation reset) |

RLS: `auth.uid() = user_id` on all five; `service_role` bypass for
admin maintenance. All four conversation-scoped tables added to
`supabase_realtime` publication.

Optional FKs for future "elevate to project / task" UX:
- `cx_agent_plan.project_id` → `ctx_projects.id` (NULL, ON DELETE SET NULL)
- `cx_user_todo.ctx_task_id` → `ctx_tasks.id` (NULL, ON DELETE SET NULL)

**Key types**

- `CxAgentPlanRow` / `CxAgentTaskRow` / `CxUserTodoRow` /
  `CxAgentMemoryRow` / `AgentUserKvRow` — `tools/types.ts`. Hand-typed
  to mirror the migration; the global `database.types.ts` is only
  regenerated on demand.

---

## Key flows

### Flow 1 — Agent calls `tasks({action:'add', items:[...]})`

1. Stream emits `tool_event{event:'tool_delegated', tool_name:'tasks', ...}`.
2. `process-stream.ts` checks `isUiFirstToolName('tasks')` → true.
3. Dispatches `dispatchUiFirstTool({ conversationId, callId, toolName, args })`.
4. Dispatcher looks up registry → Zod-validates args → runs
   `tasksHandler.run(args, { conversationId, userId, callId, ... })`.
5. Handler routes by `args.action`:
   - `add` → service `addTasks(...)` → inserts rows into `cx_agent_task`
     → returns updated task list summary.
6. Supabase Realtime fires → `subscribeAgentLists` channel → dispatches
   `upsertTask` for each new row → `<TaskPanelChip>` count updates.
7. Dispatcher POSTs result via `submitToolResult` → stream resumes.

### Flow 2 — Agent calls `user({type:'confirm', question:'...'})`

1. Same delegation path as Flow 1.
2. `userHandler.run` builds a `PendingAsk` descriptor with `kind:'confirm'`,
   registers a resolver in `ask-resolver-registry`, dispatches
   `enqueuePendingAsk`.
3. `<PendingAsksZone>` re-renders, showing a `<AskCard kind="confirm">`
   above the chat input. **Input stays interactive.**
4. User clicks Yes → `AskCard` calls `resolveAskByCallId(callId, {confirmed: true, ...})`.
5. Resolver fires → handler's `await` returns → handler returns the
   `AskUserResponse` envelope.
6. Dispatcher POSTs result → stream resumes.

### Flow 3 — Agent calls `update_plan({title, steps})`

1. Same delegation path.
2. `updatePlanHandler` first calls `createPlan(...)` (status='proposed').
   Any earlier non-superseded plan for the conversation is bulk-updated
   to `superseded` first.
3. Dispatches `enqueuePendingAsk` with `kind:'plan_approval'`.
   `<AskCard>` renders the plan body + Approve/Reject.
4. User clicks Approve → handler patches status to `approved` AND
   calls `addTasks(...)` to fan out one `cx_agent_task` row per step,
   each with `plan_id` set so the chip can group them.
5. Dispatcher POSTs `{ ok:true, plan:{...}, status:'approved' }` →
   stream resumes.

### Flow 4 — Ambient context seeding on every send

1. `executeInstance` thunk runs `seedAmbientContextKeys(conversationId)`
   before `assembleRequest`.
2. The seed reads userAuth + appContext + scope selections from Redux
   and writes them via `setContextEntries` into the existing
   `instanceContext` slice.
3. `selectContextPayload(...)` (unchanged) reads these entries and
   produces the `context` field of the agent POST.
4. Server-side, the agent sees `{{user.name}}`, `{{route_brief.url}}`,
   `{{active_scopes}}`, `{{organization.name}}`, etc.

### Flow 5 — `nextjs-surface` capability publication

1. `buildToolInjection` walks the capability registry (provider
   registered at boot via `register-all.ts`).
2. `nextjs-surface` provider returns a `NextjsSurfaceState` with the
   orchestration envelope (route, route_kind, is_admin, theme,
   active_scopes, ...).
3. Because the capability is active, `buildToolInjection` also auto-
   merges the seven UI-first tool specs (`{kind:'registered', name, delegate:true}`)
   into `payload.tools`.
4. The wire request to aidream carries:
   ```jsonc
   "client": {
     "capabilities": [..., "nextjs-surface"],
     "state": { "nextjs-surface": {...} }
   },
   "tools": [..., { name: "user", delegate: true }, ...]
   ```

---

## Invariants & gotchas

- **The chat input is never disabled by an ask card.** The user can
  answer cards, type into the input, and submit either independently.
  Multiple parallel asks are supported.
- **Tool name registry must agree with matrx-extend.** Both surfaces
  declare the same names; aidream's tool discovery treats them
  identically. Tested via the shared canonical list in
  `tools/names.ts`. Adding a tool name = add it on BOTH sides + update
  `tl_def`.
- **Resolver registry holds promises, not Redux state.** Cancelling /
  expiring / resolving all go through `ask-resolver-registry.ts`. Each
  ask resolves exactly once.
- **One active plan per conversation.** `createPlan` always supersedes
  prior non-superseded plans. The current plan is whichever
  non-superseded row has the most-recent `updated_at`.
- **Realtime subscription is per-conversation.** Each
  `<TaskPanelChip>` mount opens a channel on the active conversation
  and closes it on unmount. Multiple mounts of the same conversation
  share the channel via the module-level `activeChannels` map.
- **The dispatcher never throws.** Schema fail / handler throw / unknown
  tool all POST a `{is_error: true}` envelope; the stream stays alive.

---

## Related features

- **Depends on:** `features/agents/redux/execution-system/` (client
  capabilities registry, build-tool-injection, submit-tool-results,
  process-stream), `lib/redux/slices/appContextSlice.ts` (scope
  context), `features/scopes/` (closest-wins scope resolution).
- **Depended on by:** the chat surface
  (`features/agents/components/shared/AgentConversationColumn.tsx`),
  the new `/agent-lists` route.
- **Mirror surface:** the matrx-extend Chrome extension at
  `/Users/armanisadeghi/code/matrx-extend/src/lib/tools/handlers/{user,lists}.ts`.

---

## Change Log

- `2026-05-19` — `user` tool parity refresh to match matrx-extend's
  May 2026 updates. Schema now accepts rich `options` objects
  (`{label, description?, preview?}`) alongside bare strings, an optional
  `header` chip (≤12 chars), `allow_other: true` (appends a dashed
  "Other" option with embedded textarea on choice / choice_many), and a
  batched form (`questions: SingleQuestion[]`, 1–4) that returns
  `{answers: Envelope[], cancelled, timed_out}` and short-circuits on
  the first cancel/timeout. `PendingAsk` carries `header`, `allowOther`,
  `batchIndex`/`batchTotal`, and a normalized `UserAskOption[]`. AskCard
  renders the header chip, "N of M" pill, option descriptions, and the
  side-by-side preview grid when any single-select option has a
  `preview`. `update_plan` now enqueues rich `{label}` options. Wire
  envelope unchanged.
- `2026-05-19` — Initial port from matrx-extend. Five new tables, seven
  tool handlers, `nextjs-surface` capability + ambient context seeding,
  inline ask card UX (above the input, never blocks), TaskPanel +
  chip + `/agent-lists` aggregate route.
