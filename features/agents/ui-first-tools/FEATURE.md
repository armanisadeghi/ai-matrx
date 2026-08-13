# FEATURE.md — `ui-first-tools`

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-08-09` (canonical tool vocabulary, live schema names, and `matrx-user` executor identity)

> Universal client-delegated tool layer + ambient context envelope for the
> Next.js surface. Mirrors the matrx-extend Chrome extension's UI-first
> tools so the same agent prompt works on either surface.

---

## Purpose

The agent calls a small set of "UI-first" tools (`user`, `update_plan`,
`request_user_takeover`, `user_todos`, `scratchpad`, `storage`) that
have no server-side execution — the Next.js client validates the args,
runs a handler (UI render or Supabase CRUD), and POSTs `tool_results`
back so the model resumes. These tools come online via the request's
**surface**: the six frontend handlers have active Bindings to executor
`matrx-user` in `tool.binding`; Surface defaults include them on
`matrx-user/chat` and are resolved server-side. There are 132
`ui.ui_surface` rows for client `matrx-user`; only two have their own
`tool.surface_defaults` row, while the rest correctly inherit through
`parent_surface_name` per S4. Browser reads of `tool.definition`,
`tool.binding`, `tool.executor`, or `tool.surface_defaults` must use
`.schema("tool")` (or PostgREST's `Accept-Profile: tool` header); unqualified
names resolve against `public` and fail with `PGRST205`. Ambient context
(user / route / scope) is seeded separately into the `context` payload.

> **`tasks` moved server-side (2026-07-22).** It used to be in this set, but it
> was a pure `chat.agent_task` write with no client-only work, so delegating it
> hard-suspended the loop on every task update — a stall that became
> deterministic whenever a desktop companion (`matrx-local`) was attached. It now
> runs in-loop in aidream (`aidream/tools/agent_tasks_tool.py`, executor
> `matrx-ai-core`) with its `matrx-user` Binding removed. `tasks` and `memory`
> remain advertised on `matrx-user/chat`, but execute on `matrx-ai-core`, so
> they correctly have no `matrx-user` Binding. The client keeps
> only the *read* side — `TaskPanel` / the `agent-lists` slice / `agent-task.service.ts`
> — kept fresh by the Supabase Realtime subscription on `chat.agent_task`. Rule of
> thumb: a UI-first tool must do genuine client-only work (await a human, render
> UI, touch browser-local state); a plain DB write belongs server-side.

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
- `<PendingAsksZone conversationId={id} />` — renders pending ask cards. Two
  presentations of one content, chosen by `useIsMobile()`:
  - **Desktop:** cards stack inline directly above the chat input. **Never
    disables the input** — the user can answer cards, type, and submit either or
    both independently.
  - **Mobile:** cards live in a bottom **Drawer** (`MobileAsksDrawer`) that
    auto-opens the moment the agent raises an interaction (re-opens for any
    genuinely new ask callId). Closing it (swipe / tap-out / Minimize) is
    **non-destructive** — asks stay pending; a compact "N questions from the
    agent" pill appears above the input to re-open. Open/closed is pure UI state,
    never a resolve/cancel. The drawer carries its own optional note, so covering
    the chat input while open costs nothing.

  Folds asks into render groups via `groupPendingAsks`
  (`redux/pending-asks.slice.ts`): asks sharing a `batchId` collapse into one
  `<BatchAskCard>` wizard; `kind:"approval"` routes to `<ApprovalCard>`; every
  other singleton routes to `<AskCard>`.
- `<BatchAskCard asks={[...]} />` (`ui/BatchAskCard.tsx`) — the wizard for a
  batched `user` ask (multiple questions sharing a `batchId`). **One card, free
  back/forth navigation** so the user is never trapped answering in order: every
  question's body is mounted at once (only the active one visible, so selections /
  typed text survive navigation), Back/Next appear whenever a prior/next question
  exists, and progress dots jump + show answered state. Answering records a DRAFT
  (auto-advances); nothing reaches the agent until all questions are answered and
  the user hits Submit. Skip cancels the whole batch; "Write message instead"
  resolves it as a freeform reply. Reuses `AskBody` / `presentation` /
  `WriteInsteadBody` (exported from `<AskCard>`).
- `<ApprovalCard ask={ask} />` (`ui/ApprovalCard.tsx`) — the agent-edit
  approval surface. Renders an `ApprovalChange` (`ui/approval-types.ts`):
  verb-tinted icon + "{Verb} {entity}" eyebrow + headline, a before→after
  diff body, and one action row (Approve · Decline · Respond) plus an opt-in
  "always approve {noun}". States the change **once** — no chip+context+question
  triple. Producers emit `ApprovalChange`; the card is feature-agnostic.

**Shared card primitives (one look across every inline agent card)**
- `<AgentCardShell>` (`ui/AgentCardShell.tsx`) — the chrome both `<AskCard>` and
  `<ApprovalCard>` render through: rounded-2xl elevated card, tone-tinted accent +
  icon chip, eyebrow→title→subtitle header, dismiss ×, body slot, optional footer
  band, bottom countdown slot. `AccentTone` drives the color. **New inline agent
  cards must use this shell — never hand-roll the chrome.**
- `<ChangeDiff>` (`@/components/ui/change-diff`) — the app-wide before→after diff
  list (`ChangeFieldDiff[]`; `ApprovalFieldDiff` is an alias). Tone-neutral, no
  feature coupling — reusable by any "here's what changed" surface (project /
  settings updates, version history), not just agents.
- **Gallery:** `/demos/agent-cards` (`app/(dev)/demos/agent-cards/page.dev.tsx`)
  previews every card kind live (clicks resolve + log the envelope) — the design
  reference for this family.
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

**Surface inclusion (server-resolved)**
- Surface defaults include these tools on `matrx-user/chat`. The request
  declares `client.surface` (route →
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

**Ownership is `created_by`** (canonical, stamped by the `_stamp_actor`
trigger) — never client-set, never `user_id`. Two consequences the code
depends on:

- **`chat.agent_task` has NO owner column of its own.** It is owned through
  its parent conversation, so a cross-conversation read declares that scope
  as an inner join (`ListsHubView`: `conversation!inner(created_by)`), never
  a bare RLS-filtered list. Its `creator_kind` enum (`agent` | `user`)
  records who AUTHORED the task — it is not an owner and must never be read
  as one.
- **No project FK.** `agent_plan.project_id` is gone: a feature table may not
  depend on a project FK. Project membership, if it is ever wanted, is a
  `platform.associations` edge on the conversation.

`cx_user_todo.ctx_task_id` → `ctx_tasks.id` (NULL, ON DELETE SET NULL)
remains, for the "elevate to task" UX.

All four conversation-scoped tables are in the `supabase_realtime`
publication; every subscription filters on `conversation_id`.

**Key types**

- `CxAgentPlanRow` / `CxAgentTaskRow` / `CxUserTodoRow` /
  `CxAgentMemoryRow` / `AgentUserKvRow` — `tools/types.ts`. Hand-typed
  because `steps`/`value` come back as `Json` from the generator. **The
  type gate therefore does NOT catch column renames here** — compare
  against the live table whenever the schema changes.

---

## Key flows

### Flow 1 — Agent calls `user_todos({action:'add', items:[...]})`

> `tasks` used to be the canonical example here. It is server-executed in aidream
> now (see Purpose) and never takes this delegated path. `user_todos` is the same
> delegated Supabase-CRUD mechanic.

1. Stream emits `tool_event{event:'tool_delegated', tool_name:'user_todos', ...}`.
2. `process-stream.ts` checks `isUiFirstToolName('user_todos')` → true.
3. Dispatches `dispatchUiFirstTool({ conversationId, callId, toolName, args })`.
4. Dispatcher looks up registry → Zod-validates args → runs
   `userTodosHandler.run(args, { conversationId, userId, callId, ... })`.
5. Handler routes by `args.action`:
   - `add` → service `addUserTodo(...)` → inserts rows into `cx_user_todo`
     → returns the open + recently-done summary.
6. Supabase Realtime fires → `subscribeAgentLists` channel → dispatches
   `upsertUserTodo` for each new row → `<TaskPanelChip>` count updates.
7. Dispatcher POSTs result via `submitToolResult` → stream resumes.

The agent's own `tasks` writes, by contrast, land in `chat.agent_task`
server-side; the same Realtime subscription updates the panel with no delegation.

### Flow 2 — Agent calls `user({type:'confirm', question:'...'})`

1. Same delegation path as Flow 1.
2. `userHandler.run` builds a `PendingAsk` descriptor with `kind:'confirm'`,
   registers a resolver in `ask-resolver-registry`, dispatches
   `enqueuePendingAsk`.
3. `<PendingAsksZone>` re-renders, showing a `<AskCard kind="confirm">`.
   Desktop: inline above the chat input (**input stays interactive**). Mobile:
   inside the auto-opening bottom drawer.
4. User clicks Yes → `AskCard` calls `resolveAskByCallId(callId, {confirmed: true, ...})`.
5. Resolver fires → handler's `await` returns → handler returns the
   `AskUserResponse` envelope.
6. Dispatcher POSTs result → stream resumes.

### Flow 2b — Agent calls `user({questions:[q0,q1,q2]})` (batched)

1. Same delegation path; `userHandler.run` detects the batched form and calls
   `runBatched`, which enqueues **all** questions up front (each a `PendingAsk`
   with `batchId = parentCallId`, distinct `callId = ${parent}.${i}`,
   `batchIndex`/`batchTotal`) and registers all resolvers, then awaits every
   promise via `Promise.all`. (No sequential short-circuit — all cards coexist.)
2. `<PendingAsksZone>` groups them by `batchId` → one `<BatchAskCard>` wizard.
3. The user navigates freely (Back/Next/dots), fills each question (drafts held
   locally), and reviews before sending. Nothing resolves yet.
4. On Submit, the wizard resolves every `callId` with its draft (the batch note
   rides on the final answer); Skip cancels all; Write-instead resolves all with
   `wrote_instead`. Each per-question timeout still resolves its own card.
5. `runBatched` computes the batch flags from the answers and returns
   `{answers, cancelled, timed_out, wrote_instead, additional_instructions}` →
   dispatcher POSTs → stream resumes. **Agent-facing result is unchanged from the
   old sequential model** — only the UX (free navigation) changed.

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
2. aidream resolves `client.surface` → `tool.surface_defaults` and folds the
   surface's default tools into the turn's tool set. The six frontend handlers
   have active `tool.binding` rows for executor `matrx-user`; `tasks` and `memory`
   are also advertised on chat but execute on `matrx-ai-core`, so they correctly
   have no `matrx-user` Binding. Surface defaults are sparse: only two of the
   132 `matrx-user` surfaces own a defaults row; the rest inherit through
   `parent_surface_name` per S4. A surface's toolset is resolved from that
   inheritance chain, not from a supposed surface “binding.”
3. The wire request to aidream carries just the surface — no per-client
   capability, because the server is surface-agnostic:
   ```jsonc
   "client": { "surface": "matrx-user/chat" }
   ```

---

## Invariants & gotchas

- **The chat input is never disabled by an ask card, but a submit is never
  allowed to leave a delegated tool on deck.** The user can freely answer cards
  or type into the composer. If they hit Send WHILE asks are still pending,
  `smartExecute` does NOT start a colliding new turn (which would dangle the
  outstanding `delegated` tool calls — see `docs/CLIENT_TOOL_SUSPEND_RESUME.md`).
  Instead `resolvePendingAsksWithInput` delivers the composer text as the answer
  to every pending ask (write-instead freeform when text is present; cancel — an
  empty, non-error result — when empty), which resolves the tool calls and lets
  the normal `continuation_needed → resumeInstance` flow continue the
  conversation with the user's message embedded. For `approval`-kind asks a
  freeform envelope maps to "instructions", so a stray Send never silently
  approves a destructive write. Multiple parallel asks are supported.
- **Tool name registry must agree with matrx-extend.** Both surfaces
  declare the same names; aidream's tool discovery treats them
  identically. Tested via the shared canonical list in
  `tools/names.ts`. Adding a tool name = add it on BOTH sides + update
  `tool.definition`.
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

- `2026-08-12` — **chat legacy owner cut: `user_id` → `created_by`, `project_id`
  dropped, `agent_task.created_by` → `creator_kind`.** Every insert stopped
  passing an owner (the `_stamp_actor` trigger stamps `created_by`);
  `CreateAgentPlanInput` / `CreateAgentTaskInput` / `CreateUserTodoInput` lost
  their `user_id` field, and `agent_task` writes now set `creator_kind`
  (`agent` | `user`) — the enum that was squatting on the canonical
  `created_by` name. `agent_plan.project_id` reads/writes deleted outright
  (forbidden project FK). `ListsHubView` filters plans/todos on `created_by`
  and scopes tasks through `conversation!inner(created_by)`, since
  `agent_task` has no owner column. The three dead hand-mirrored `*Insert`
  interfaces in `service/supabase-typed.ts` were deleted rather than
  repointed. Forward-only: no dual-read, no fallback.
- `2026-08-09` — Adopted the canonical tool vocabulary and live schema names.
  The frontend Executor is `matrx-user`; its six active Bindings are `user`,
  `update_plan`, `request_user_takeover`, `user_todos`, `scratchpad`, and
  `storage`. `tasks` and `memory` are offered on `matrx-user/chat` but execute
  on `matrx-ai-core`. Surface defaults are sparse: 132 `matrx-user` surfaces,
  two own defaults rows, and the rest inherit through `parent_surface_name`.
- `2026-07-22` — **`tasks` moved from client-delegated to server-executed.** It
  was a pure `chat.agent_task` write with no client-only work; delegating it
  hard-suspended the loop on every task update, stalling deterministically when a
  desktop companion (`matrx-local`) was attached. Removed from `UI_FIRST_TOOL_NAMES`
  / the registry / `check-tool-db-drift.ts`, and `tasks.handler.ts` +
  `tasksArgsSchema` deleted. Now runs in-loop in aidream
  (`aidream/tools/agent_tasks_tool.py`); the two client `tool.binding` rows are
  dropped by `migrations/tasks_tool_server_side_unbind.sql`. The read-side layer
  (`TaskPanel`, `agent-lists` slice, `agent-task.service.ts`, Realtime) is
  unchanged. Rollout order: deploy aidream → apply migration → deploy frontend.
- `2026-07-06` — **Fix ApprovalCard unreachable while awaiting user action.**
  `<ApprovalCard>` passed `pending={ask.status === "pending"}` to
  `<AgentCardShell>`, but that prop dims + disables once *resolved* (same contract
  as `<AskCard>` / `<BatchAskCard>`). Inverted logic made every live approval
  card `opacity-50 pointer-events-none` — Approve/Decline/Respond were visible but
  unclickable (War Room HITL gate). Fixed to `pending={ask.status !== "pending"}`.

- `2026-07-01` — **On-deck submit guard + animated reopen pill.** Two related
  polish items for the pending-ask flow:
  - **Submit never dangles a delegated tool.** New `resolvePendingAsksWithInput`
    thunk (`redux/resolve-asks-with-input.thunk.ts`), wired at the top of
    `smartExecute`. If the user types in the composer and hits Send while asks are
    pending, we no longer start a colliding new turn (which left the outstanding
    `delegated` `cx_tool_call` rows unresolvable — a "failed tool call with no
    result"). Instead the composer text is delivered as the answer to every
    pending ask (write-instead freeform when present; cancel/empty result when
    blank), resolving the tool calls so the normal `continuation_needed →
    resumeInstance` flow continues with the user's message embedded. Approval
    asks treat a freeform envelope as "instructions" — a stray Send never silently
    approves a destructive write. The composer clears via the normal
    `markInputSubmitted → clearUserInput` lifecycle (draft-protection intact).
  - **Reopen pill draws attention.** The minimized "N questions from the agent"
    pill (`MobileAsksDrawer`) now has an animated shimmering primary-gradient
    border (same `--animate-shimmer` cue as the active "User >" tool-call chip) +
    a pulsing icon, so it unmistakably reads as the next action. Honors
    `prefers-reduced-motion`.
- `2026-07-01` — **Mobile: asks now surface as a non-destructive bottom drawer.**
  On mobile (`useIsMobile()`) `<PendingAsksZone>` renders the cards in a bottom
  `Drawer` (`MobileAsksDrawer`) instead of stacked over the input — it auto-opens
  the moment the agent raises an interaction (and re-opens for any new ask callId).
  Closing (swipe / tap-out / Minimize) is **pure UI state**, never a resolve/cancel;
  a "N questions from the agent" pill appears above the input to re-open, so the
  user can read the conversation and return with one tap. Desktop keeps the inline
  presentation unchanged.
- `2026-07-01` — **Full-width title header (`<AgentCardShell>`).** The question no
  longer sits boxed in a narrow middle column between the icon chip and the ×
  (which wrapped long questions into a tall, side-padded block). Header is now a
  compact top row (plain tone-tinted icon — no chip background/padding — + eyebrow +
  badge + dismiss ×) with the title on its **own full-width row** below, so it uses
  the entire card width. Applies to every ask + approval card.
- `2026-07-01` — **Batched asks are now a free-navigation wizard (`<BatchAskCard>`).**
  Batched `user` questions used to render one card at a time, resolved sequentially —
  the user could never go back to review or change an earlier answer (a "trapped"
  feeling on a disruptive surface). `runBatched` now enqueues all questions up front
  (each tagged with a shared `batchId`) and awaits them together; `groupPendingAsks`
  folds them and `<PendingAsksZone>` renders one `<BatchAskCard>` wizard. It mounts
  every question's body at once (state survives navigation), shows Back/Next whenever
  a prior/next question exists + jump dots, records drafts, and only resolves the
  whole batch on Submit (Skip cancels all; write-instead resolves all as freeform).
  The agent-facing `BatchedAskUserResponse` is identical to before — only the UX
  changed. `AskBody`/`presentation`/`WriteInsteadBody` are now exported from
  `<AskCard>` for reuse; `TextBody` no longer clears on submit (so a revisited answer
  still shows). Demo: `/demos/agent-cards` gains a 3-question batch sample.
- `2026-07-01` — **Mobile-friendly card height guard.** `<AgentCardShell>` is now a
  capped flex column (`max-h-[70dvh]`): the header stays pinned, a very long
  question title caps + scrolls (`max-h-[28dvh]`), the body region scrolls internally
  (`flex-1 min-h-0 overflow-y-auto`), and the footer/countdown stay pinned. Long asks
  (many `choice_many` options, long questions) no longer grow past the viewport and
  cut off the action button on mobile — the card stops growing and scrolls instead.
  Benefits every ask + `<ApprovalCard>` (its footer action row is now always visible).
- `2026-06-23` — **Shared card design language + AskCard redesign.** Extracted
  the quality of `<ApprovalCard>` into two reusable primitives: `<AgentCardShell>`
  (`ui/AgentCardShell.tsx` — the rounded-2xl, tone-tinted, elevated chrome with a
  consistent icon-chip + header hierarchy + optional footer band + countdown slot)
  and `<ChangeDiff>` (`@/components/ui/change-diff` — the app-wide before→after diff
  list, tone-neutral so project/settings/version surfaces can reuse it; `ApprovalFieldDiff`
  is now an alias of `ChangeFieldDiff`). Refactored `<ApprovalCard>` onto both (no
  behavior change) and **redesigned the dated `<AskCard>`** (all 8 kinds: confirm /
  choice / choice_many / text / secret / notify / plan_approval / takeover) onto the
  shell — per-kind icon + tone, the question promoted to the prominent title,
  modernized option rows; batching / timeout / write-instead / additional-instructions
  all preserved. New live gallery at `/demos/agent-cards`. Typecheck + lint clean;
  rendered + verified on the running dev server.
- `2026-06-23` — Added the `approval` `PendingAsk` kind + `<ApprovalCard>`
  (`ui/ApprovalCard.tsx`) and the generic `ApprovalChange` descriptor
  (`ui/approval-types.ts`). Replaces the old reuse-the-confirm-AskCard approach
  for War Room tile edits, which said the same thing three ways (chip + context
  line + question) and stacked an extra note + "Write message instead". The card
  states the change once: an add shows new values, an update shows before→after.
  `PendingAsksZone` routes `kind:"approval"` here; `AskCard` is untouched.
  Consumed by `features/agents/war-room-tools` (the producer of `ApprovalChange`
  + the auto-approve grant); see that dispatcher for the "always approve" path.
- `2026-05-24` — Removed the `nextjs-surface` client capability — a
  frontend-specific name whose payload (route/scope/admin/permission/theme)
  nothing on the server consumed. The seven UI-first tools now come online
  purely via the request's `client.surface` → server-resolved Surface defaults
  on `matrx-user/chat`. The base surface `matrx-default/default` was emptied,
  so tool-less agents and non-chat surfaces (agent-builder/agent-run) no
  longer get auto-attached tools. Provider file + Capability removed from
  both repos; surfaces are now data-only.
- `2026-05-24` — Registered-tool contract reconciliation with matrx-extend.
  Fixed stale `memory` references to `scratchpad`
  (the ephemeral client tool was renamed; `memory` is reserved for the
  persistent server-side semantic tool). Tightened `scratchpadArgsSchema.value`
  from `z.unknown()` to `z.string()` to match `tool.definition` exactly (matrx-extend
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
