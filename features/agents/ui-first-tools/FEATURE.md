# FEATURE.md — `ui-first-tools`

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-05-24` (nextjs-surface capability removed; UI-first tools resolve via surface)

> Universal client-delegated tool layer + ambient context envelope for the
> Next.js surface. Mirrors the matrx-extend Chrome extension's UI-first
> tools so the same agent prompt works on either surface.

---

## Purpose

The agent calls a small set of "UI-first" tools (`user`, `update_plan`,
`request_user_takeover`, `tasks`, `user_todos`, `scratchpad`, `storage`) that
have no server-side execution — the Next.js client validates the args,
runs a handler (UI render or Supabase CRUD), and POSTs `tool_results`
back so the model resumes. These tools come online via the request's
**surface**: they're bound to `matrx-user/chat` in `public.tl_def_surface`
and resolved server-side (most other surfaces carry none). Ambient context
(user / route / scope) is seeded separately into the `context` payload.

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

**Surface binding (server-resolved)**
- These tools are bound to the `matrx-user/chat` surface in
  `public.tl_def_surface`. The request declares `client.surface` (route →
  surface via `features/surfaces/utils/route-to-surface.ts`) and aidream
  resolves it to this tool set. There is no client capability for this —
  surfaces are data, not capabilities.

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

### Flow 5 — UI-first tools come online via the request's surface

1. `buildToolInjection` sets `client.surface` from the active route
   (`detectActiveSurface()`) — unless a Surface Simulator override or the
   disable-injection brake is in effect.
2. aidream resolves `client.surface` → `public.tl_def_surface` and folds the
   surface's default tools into the turn's tool set. The seven UI-first tools
   are bound to `matrx-user/chat`, so chat agents get them; surfaces with no
   bindings (the now-empty `matrx-default/default` base, `agent-builder`,
   `agent-run`, …) get none.
3. The wire request to aidream carries just the surface — no per-client
   capability, because the server is surface-agnostic:
   ```jsonc
   "client": { "surface": "matrx-user/chat" }
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

- `2026-05-24` — Removed the `nextjs-surface` client capability — a
  frontend-specific name whose payload (route/scope/admin/permission/theme)
  nothing on the server consumed. The seven UI-first tools now come online
  purely via the request's `client.surface` → `public.tl_def_surface`, bound
  to `matrx-user/chat`. The base surface `matrx-default/default` was emptied,
  so tool-less agents and non-chat surfaces (agent-builder/agent-run) no
  longer get auto-attached tools. Provider file + Capability removed from
  both repos; surfaces are now data-only.
- `2026-05-24` — Tool↔DB reconciliation with matrx-extend (cross-surface
  `tl_def` drift work). Fixed stale `memory` references to `scratchpad`
  (the ephemeral client tool was renamed; `memory` is reserved for the
  persistent server-side semantic tool). Tightened `scratchpadArgsSchema.value`
  from `z.unknown()` to `z.string()` to match `tl_def` exactly (matrx-extend
  parity). `scripts/check-tool-db-drift.ts` now also diffs each parameter's
  `default` (the last piece of the shared "what match means" spec). Verified
  the `user` tool honors the always-append-"Other" escape, the
  `additional_instructions` / `wrote_instead` envelope fields, and `secret`
  UI masking; no hardcoded tool descriptions in code. All drift checks green.
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
