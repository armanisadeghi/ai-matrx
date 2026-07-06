# v2 Runtime Spine — Phase 2 Spec (Full Lifecycle + Observability)

**Status of Phase 1:** ✅ **Shipped and live.** All four core AI surfaces
(`chat`, `manual`, `agents/{id}`, `conversations/{id}`) route through the
backend's `/v2` runtime spine by default. Frontend commit `ab8596e42`; running
in production with no issues. See `aidream/docs/runtime/V2_FRONTEND_MIGRATION.md`
for Phase 1 and `lib/api/ai-api-version.ts` for the single source of truth.

**What Phase 2 is:** close the remaining lifecycle gaps so the spine tracks a
request's **whole** life (not just the opening turn), and **surface** the
tracking the spine already collects (nothing reads it today).

**Repos:** Frontend = `matrx-frontend` (this repo). Backend = `aidream`
(`/Users/armanisadeghi/code/aidream/`).

**The one format rule (do not regress):** `/v2` is inserted at the **FRONT** of
the in-app path — `/ai/chat` → `/v2/ai/chat`. **Never** nested as `/ai/v2/chat`.
`toV2Path` in `lib/api/ai-api-version.ts` is the only place this transform is
spelled out.

---

## 0. Where we actually are (verified)

The backend exposes **exactly six** `/v2` routes today: the four surfaces plus
the `agent`/`conversation` singular aliases. The frontend routes **all** of
them through v2. **There is nothing half-migrated on the FE.** Everything below
is *new* coverage, not cleanup.

Everything else stays on v1 **by design** — the server does **not**
auto-downgrade, so a `/v2` call to a route that doesn't exist is a hard `404`.
Two buckets of "not on v2":

- **Intentionally v1 forever:** `cancel` / `retry-now` are domain-agnostic; a
  v2 request is cancelled with the same `/ai/cancel/{request_id}` using the
  `request_id` the stream reports (which *is* `runtime.global_request.id`). Also
  `warm`, `invalidate-cache`, `pending_calls`, `inbox`, `memory_cost`,
  `sandbox`, `agents-blocks`, `prompts` — no execution to track. **No action.**
- **The Phase 2 coverage gaps** (continuation ops with a real execution but no
  v2 form yet): **`resume`**, **`fork-and-run`**, **`tool_results`**. These are
  the whole of Part A.

---

## Part A — Backend (aidream)

All three v1 handlers live in
`aidream/api/routers/conversations.py` (mounted at `/ai`). The six existing v2
routes are thin delegators in `aidream/api/routers/v2.py` (mounted at top-level
`/v2`; `include_router` already wired in `app.py:1016` — **new v2 routes need no
`app.py` change**). The spine wrapper is `run_ai_task_on_spine`
(`aidream/services/runtime/conversation.py:78`), a drop-in for `run_ai_task`.

The three gaps are **not equal difficulty.** Do them in this order.

### A1 — `POST /v2/ai/conversations/{id}/fork-and-run`  ·  difficulty: LOW  ·  do first

Fork creates a brand-new conversation + fresh turn, so a **new**
`global_execution` row is the correct semantics — identical to the six routes
already wrapped.

- **v1 handler:** `fork_and_run` — `conversations.py:381-546`. Streams via
  `create_prepared_streaming_response(ctx, _prepare, _fork_and_run_task, ...)`
  at `conversations.py:540`.
- **The one wrinkle:** its `run_fn` is not `run_ai_task` — it's a custom closure
  `_fork_and_run_task(emitter, fork_event, config)` (`conversations.py:376`)
  that emits `conversation.forked` first, then calls `run_ai_task(emitter,
  config)` **hardcoded**. `prepare_fn` returns a **3-tuple**
  `(ctx, fork_event, config)`, so `run_fn` is invoked as
  `run_fn(emitter, fork_event, config)`. The spine runner's shape is
  `run_ai_task_on_spine(emitter, config, ...)` — the extra `fork_event`
  positional won't match.
- **Fix (choose one):**
  1. Parameterize the inner call: give `_fork_and_run_task` a `run_fn=run_ai_task`
     kwarg and have it call `run_fn(emitter, config)` after emitting the fork
     event; the v2 route passes `run_fn=run_ai_task_on_spine`. **Recommended** —
     mirrors the existing pattern exactly and keeps v1 untouched by default.
  2. Have `_fork_and_run_task` call `run_ai_task_on_spine` directly (simpler,
     but couples fork to the spine with no v1 fallback closure).
- **v2 route to add** (`v2.py`, copy the delegator shape):
  ```python
  @router.post("/ai/conversations/{conversation_id}/fork-and-run")
  async def fork_and_run_v2(conversation_id, request: ForkAndRunRequest,
                            ctx=Depends(context_dep), fastapi_request=None):
      return await fork_and_run(conversation_id, request, ctx,
                                run_fn=_spine_runner())
  ```
  (Requires threading `run_fn` down `fork_and_run` → `_fork_and_run_task`.)
- **Acceptance:** a fork emits `conversation.forked`, streams identically, and
  lands a new `runtime.global_execution` row (a new root, `type="conversation"`,
  `link_id` = the forked conversation id), settling to `complete`/`failed` to
  match the run outcome.

### A2 — `POST /v2/ai/conversations/{id}/resume`  ·  difficulty: HIGH  ·  the linchpin

**Why this one matters most:** resume is how a *tool-using* turn actually
finishes. When a turn pauses for a delegated/widget tool, the spine already
settles that execution to **`WAITING_INPUT`** (`_settle_completed` maps
`RESUMABLE_SUSPEND_STATUSES` → `scope.request_input()`,
`conversation.py:268-313`). The client records tool outputs via `tool_results`
(A3) and then calls `/resume` to re-enter the orchestrator loop. **Today
`/resume` runs entirely off-spine** (`run_ai_task` is hardcoded at
`conversations.py:1410`), so that `WAITING_INPUT` execution is never
transitioned back to running/complete — it dangles until the reaper/integrity
watchdog sweeps it. Closing resume closes both the tool-turn hole **and** makes
crash-recovery itself spine-tracked.

- **v1 handler:** `resume_conversation` — `conversations.py:1147-1416`. Request
  model `ResumeRequest` (`conversations.py:912`), keyed on
  `user_request_id`.
- **Why it's not a copy-paste:**
  1. **It reuses the original request identity.** `conversations.py:1301`:
     `ctx = ctx.with_overrides(..., request_id=request.user_request_id, ...)` —
     deliberately, so tokens/cost keep aggregating on the same
     `cx_user_request` row. But `open_request_execution`
     (`services/runtime/entry.py:70`) **always creates a new `global_request`**
     (`entry.py:144`). A naive spine wrap would fork a second execution tree for
     the same logical request.
  2. **It takes an atomic run-claim** (`try_claim_for_run`,
     `conversations.py:1233`) and releases it on prep failure (`:1400`). The
     spine open must not double-claim or leak the claim.
- **Required new engine support** (this is the real build, in
  `packages/matrx-runtime` + `services/runtime`): a **"resume existing
  execution"** entry point that, given the original `request_id`:
  - finds the `global_execution` row for that request in `WAITING_INPUT`
    (there is a `find_by_link` + status filter path already used by the admin
    reader — reuse it),
  - transitions it back to `running` (new `started_at`? or a resume event —
    record a `scope.note("resumed")` + status flip), re-establishes the lease
    (`_heartbeat_lease`), and
  - runs `run_ai_task` under it, then settles normally.
  Call it e.g. `resume_request_execution(ctx, ...)` alongside
  `open_request_execution`. **If time-boxed:** an acceptable v1 of this is to
  create a *child* execution linked to the original root
  (`parent_execution_id` / `root_execution_id` already exist on
  `global_execution`) rather than reopen the paused row — simpler, still keeps
  the resume on-spine and under the same root for cost aggregation. Flag which
  you chose in the settle log.
- **v2 route to add** (`v2.py`): delegate to `resume_conversation(..., run_fn=
  <spine resume runner>)` once the handler accepts a `run_fn` / resume-runner
  param.
- **Acceptance:** resuming a paused (tool) or failed turn continues the stream,
  and the **same** execution tree (same root as the original turn) shows the
  resumed activity and settles to `complete`/`failed` — no orphan
  `WAITING_INPUT` row left behind, no duplicate root for one logical request.

### A3 — `POST /v2/ai/conversations/{id}/tool_results`  ·  difficulty: MED (definitional)  ·  do last / optional

**This is not a streaming route and has no orchestrator loop to wrap.**
`submit_tool_results` (`conversations.py:576-838`) returns a plain
`ToolResultsResponse`, flips `cx_tool_call` rows to completed/error, and computes
`continuation_needed`. There is no `run_ai_task` here — the execution
continuation is A2 (`/resume`).

So "v2 tool_results" must be **defined, not copied.** Recommended minimal
meaning: **record a lifecycle NOTE on the existing `WAITING_INPUT` execution** so
the tracking timeline shows the tool round-trip:

- Look up the execution for `ctx.request_id` (same finder as A2), and
  `engine.record_note(execution_id, label="tool_results", detail={ n_results,
  continuation_needed, call_ids })` → appends a `runtime.global_execution_event`
  row. No status change (A2's resume flips it back to running).
- The v2 route is then a thin wrapper that calls the v1 `submit_tool_results`
  and, best-effort/detached (never on the hot path, matching the spine's
  `detached_task` discipline), records the note.

**Decision to confirm:** if A2 already gives full tool-turn visibility (the
resumed execution shows the continuation), A3 is **pure nice-to-have** timeline
granularity and can be deferred. Recommend shipping A1 + A2, then deciding
whether A3's note earns its keep.

### A — Backend notes that apply to all three

- **No `app.py` change** — `v2.router` is already mounted; new routes in
  `v2.py` are auto-exposed under `/v2/ai/...` (and `/api/v2/ai/...` via the
  `ApiPrefixCompatMiddleware`, `app.py:840`).
- **Regenerate the OpenAPI schema** after adding routes so the FE's generated
  types pick them up (the FE `sync-types` step reads them).
- Row/table reference (`runtime.global_execution`): `id, request_id,
  parent_execution_id, root_execution_id, type, status, cost, meters, link_kind,
  link_id, context, error, created_at/started_at/ended_at, lease_holder,
  lease_expires_at, version` — `packages/matrx-runtime/.../models_runtime.py:46`.

---

## Part B — Frontend (matrx-frontend)

### B1 — Route the three new surfaces to v2 (trivial, gated on Part A)

Each is a one-touch change; **do not** land these until the matching backend
route exists (else 404, no auto-downgrade). Behind the same `AI_API_VERSION_DEFAULT`
flag + admin toggle automatically.

| Surface | FE call site | Change |
|---|---|---|
| **fork-and-run** | `features/agents/redux/execution-system/message-crud/server/fork-and-run-server.thunk.ts` (builds `${baseUrl}/ai/conversations/{id}/fork-and-run`) | Wrap the in-app path with `applyAiApiVersion(path, version)` and add `/ai/conversations/{conversation_id}/fork-and-run` to the covered set. |
| **resume** | `resume-instance.thunk.ts:213` — hardcoded `${backend.baseUrl}/ai/conversations/${conversationId}/resume` | Same: apply `applyAiApiVersion`. |
| **tool_results** (if A3 ships) | `features/agents/api/submit-tool-results.ts:119` — goes through `callApi({ path: "/ai/conversations/{conversation_id}/tool_results" })` | Add that template to `V2_COVERED_AI_PATH_TEMPLATES` — it then rides `resolveEndpointPath` automatically, **zero** call-site change. |

**Important nuance:** `resume` and `fork-and-run` are **sub-paths**
(`/ai/conversations/{id}/resume`). The current `isCoveredAiPath` regex in
`lib/api/ai-api-version.ts` deliberately **excludes** sub-paths (so `/warm`,
`/invalidate-cache` stay v1). To bring resume/fork on board, extend the
allowlist explicitly — add two anchored patterns
(`/^(?:\/api)?\/ai\/conversations\/[^/]+\/(resume|fork-and-run)$/`) rather than
loosening the existing ones. Keep `warm` / `invalidate-cache` / `pending_calls`
/ `inbox` / `sandbox` **out**. tool_results (via the registry) just needs the
template in the map.

Add a short unit block to the existing path-transform checks proving
resume/fork upgrade and warm/cancel/pending_calls do **not**.

### B2 — Runtime observability surface (the payoff — buildable now, no BE work)

Today we POST everything to the spine but **read nothing back** — the
`runtime.global_execution` rows and `/admin/runtime/*` endpoints have zero FE
consumers. The backend read endpoints **already exist** (verified):

| Endpoint | Response | Use |
|---|---|---|
| `GET /admin/runtime/recent?roots_only=true&limit=&type=&status=` | `{ count, executions: ExecutionTreeNode[] }` | Dashboard list |
| `GET /admin/runtime/conversations/{conversation_id}` | `{ conversation_id, execution_count, trees: ExecutionTree[] }` | Per-conversation panel |
| `GET /admin/runtime/executions/{execution_id}/tree` | `ExecutionTree` | Drill-in |
| `GET /admin/runtime/executions/{execution_id}/events` | `ExecutionEventsResponse` | Timeline |
| `GET /admin/runtime/workflows/{run_id}` | `ConversationExecutionsResponse` | Workflow runs |

**Recommended build — an admin runtime dashboard** at
`app/(admin)/administration/runtime/` (super-admin gated; these endpoints
enforce `ctx.is_admin` server-side too):

- **List view:** recent executions (roots-only), columns: status (running /
  waiting_input / complete / failed / cancelled), type, cost, started, duration,
  link (conversation id → deep link). Filters for `status` / `type`; auto-refresh
  for live rows.
- **Detail view:** the `ExecutionTree` (parent/child executions), the event
  timeline (`/events`), meters/cost, lease + cancellation state.
- All reads go through the existing `callApi` + `ENDPOINTS` system (add an
  `ENDPOINTS.adminRuntime.*` group). No new backend needed.

This is a **new admin surface** → per CLAUDE.md it needs a nod on placement
before build. Alternative/lighter: an inline "Spine" panel on the conversation
you're viewing (consumes only `/conversations/{id}`), shippable as a first slice.

FE type note: `ExecutionTree` / `ExecutionTreeNode` / `ExecutionStatus` are
Pydantic models in `aidream/packages/matrx-runtime/.../models.py`. After the BE
schema regen, they land in `types/python-generated/api-types.ts` via
`pnpm sync-types` — consume the generated types, do not hand-mirror.

---

## Sequencing, ownership, effort

| # | Task | Repo | Effort | Depends on | Value |
|---|---|---|---|---|---|
| A1 | fork-and-run → v2 | aidream | S | — | Med |
| A2 | resume → v2 + resume-execution engine support | aidream | **L** | — | **High** (closes tool-turn + crash-recovery) |
| A3 | tool_results v2 note (optional) | aidream | S | A2 | Low |
| B2 | Runtime observability dashboard | matrx-frontend | M | — (reads exist) | **High** (unlocks the value) |
| B1a | FE route fork-and-run to v2 | matrx-frontend | XS | A1 | Med |
| B1b | FE route resume to v2 | matrx-frontend | XS | A2 | High |
| B1c | FE route tool_results to v2 | matrx-frontend | XS | A3 | Low |

**Two independent tracks — run in parallel:**
- **Track 1 (coverage):** A1 → B1a, then A2 → B1b, then optionally A3 → B1c.
- **Track 2 (payoff):** B2 needs **no backend work** — start immediately.

**Recommended first moves:** B2 (observability — pure FE, immediate value) and
A1 (fork-and-run — low-risk BE) in parallel. A2 (resume) is the meaty one; scope
the "resume existing execution" engine decision (reopen the `WAITING_INPUT` row
vs. child-under-root) before writing it.

## Testing & rollback

- **Rollback is already global and instant:** flip `AI_API_VERSION_DEFAULT` to
  `"v1"` (or the admin sidebar toggle) — reverts **all** covered surfaces,
  including any Phase 2 additions, with no deploy.
- **Per-surface verification (BE):** each new v2 route must stream
  byte-identically to its v1 sibling and land/settle the correct
  `global_execution` row. Verify live (`GET /admin/runtime/recent`), not from a
  mock.
- **FE:** extend the path-transform unit checks (resume/fork upgrade;
  warm/cancel/pending_calls do not). Drive a real tool-using turn end-to-end and
  confirm one execution tree spans turn → tool_results → resume with no orphan
  `WAITING_INPUT`.
- **No fake/simulated verification** — a coverage claim means the row was
  observed live in `runtime.global_execution`.
