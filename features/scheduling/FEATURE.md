# Scheduling

> **Status:** Active (v1)
> **Tier:** 1
> **Last updated:** 2026-05-16

User and admin surfaces for the platform-wide scheduling spine (`sch_*`
tables). Lets users create scheduled agent tasks, observe runs live, and
lets super-admins monitor system-wide health.

## Purpose

The `sch_*` tables are a kind-agnostic, multi-surface scheduling spine.
Any client can register a task; any executor surface can claim and run it.
matrx-frontend is the **control plane** — CRUD and observability.
Execution happens on:

- `'server'` — aidream Python via `matrx-scheduler` (always on when
  `AIDREAM_SCHEDULER=1`).
- `'chrome-extension-chat'` — matrx-extend (handles context-match
  triggers and DOM-tool agents).

## Entry points

- **User routes:** `app/(authenticated)/schedules/`
  - `page.tsx` — list view (Redux-hydrated, list-realtime subscribed)
  - `new/page.tsx` — create form
  - `[id]/page.tsx` — detail view
  - `[id]/edit/page.tsx` — edit form
- **Admin routes:** `app/(authenticated)/(admin-auth)/administration/automation/scheduling/`
  - `page.tsx` — overview tiles + live health stats
  - `tasks/page.tsx` — all-user tasks (filterable)
  - `runs/page.tsx` — all-user runs (status/surface filters)
  - `orphan-leases/page.tsx` — stuck claims + force-fail action
  - `cron-tester/page.tsx` — FE preview validator
  - `scanner-health/page.tsx` — aidream-backed status (auto-refresh)
  - `templates/page.tsx` — admin-curated starter schedules (stub)
- **Hooks:** `features/scheduling/hooks/`
  - `useScheduledTasks` — list hydration + Supabase realtime on
    `sch_task` (current user filter)
  - `useTaskListStream` — INSERT/UPDATE/DELETE subscription used by
    `useScheduledTasks`
  - `useTaskDetail` — single task + runs
  - `useTaskRuns` — run history
  - `useRunStream` — realtime on `sch_run` + `sch_task` for the
    visible task
- **Services:**
  - `features/scheduling/service/schedulerClient.ts` — typed HTTP
    client for the aidream `/scheduler/*` router (matrx-scheduler
    package). Primary path for **all user-facing writes** (task
    create/patch/soft-delete/run-now, trigger CRUD) and authoritative
    compute (cron validate, preview fires, next_due_at). Server
    recomputes `next_due_at` on every trigger write — FE never sends
    one.
  - `features/scheduling/service/queries.ts` — Supabase read façade
    (`listAgentTasks`, `getAgentTask`, `listRunsForTask`) + the
    `rowToAgendaTask` / `taskDetailToAgendaTask` reshapes. Also holds
    the single residual write (`updateAgentTaskFields`) until the
    backend exposes a PATCH for `sch_agent_task`. ONLY place that
    calls `.from('sch_*')`.
  - `lib/services/scheduling-admin-service.ts` — admin cross-user
    reads/writes using `is_super_admin()` RLS escape hatch. Stays on
    Supabase: `/scheduler/*` is RLS-scoped to the caller, so admins
    do NOT see other users' tasks/runs there. Orphan-lease cleanup
    and `markRunFailed` also have no HTTP equivalent yet.
  - `lib/scheduler-client/next-due.ts` — canonical TS twin of the
    Python `next_due` module. Used by live-typing previews
    (`CronForm`, admin cron-tester) and by non-HTTP clients (Chrome
    extension, edge functions) that can't round-trip on keystroke.
- **Redux state path:** `state.schedulingTasks`, `state.schedulingRuns`
- **Migrations:** 6 SQL files
  - `migrations/sch_admin_rls.sql` (initial admin policy)
  - `migrations/sch_server_surface.sql` (surfaces whitelist incl. 'server')
  - `migrations/sch_create_agent_task.sql` (atomic 3-table create)
  - `migrations/sch_next_due_at_trigger.sql` (DB-cascade trigger + backfill)
  - `migrations/sch_security_hardening.sql` (super_admin gate, input
    caps, REVOKE recompute)
  - `migrations/sch_cleanup_orphans_and_atomic_claim.sql` (partial
    unique index for atomic claim + `sch_enqueue_manual_run` RPC +
    `sch_recompute_task_next_due_at` auth re-check)

## Data model

Mirrors [`docs/SCHEDULING.md`](../../docs/SCHEDULING.md).

```
sch_task            kind-agnostic spine (the WHAT)
  ↳ sch_agent_task    1:1 by id (agent extension)
sch_trigger         when it fires (v1: one per task)
sch_run             each execution; partial-unique on task_id WHERE active
```

**Trigger types** — 5 active (`one-shot`, `interval`, `cron`,
`heartbeat`, `context-match`), 3 reserved (`event`, `manual`,
`dependency`).

**Surfaces** — `any | server | chrome-extension-chat | desktop | web |
mobile | sandbox`. CHECK constraint whitelists exactly these 7.

**RLS** — owner-or-`is_super_admin()` on all four tables. Cross-table
`WITH CHECK` clauses on `sch_trigger` and `sch_run` enforce that
inserted rows reference an owned `sch_task` (prevents cross-user
injection of triggers/runs).

## Key flows

1. **Create a scheduled task** — Form runs Zod validation, builds
   `CreateAgentTaskInput`, calls `scheduler.createTask(...)` (POST
   `/scheduler/tasks`). The server atomically inserts `sch_task` +
   `sch_agent_task` + `sch_trigger`, computes `next_due_at`, and
   returns the hydrated `TaskDetailResponse` — no separate re-fetch.
2. **Pause / resume** — `toggleTaskEnabled` thunk; PATCH
   `/scheduler/tasks/{id}` with `{ enabled }`; optimistic-then-reconcile.
3. **Run now** — POST `/scheduler/tasks/{id}/run-now`. Server invokes
   `sch_enqueue_manual_run` RPC under the user's JWT (validates
   ownership, stamps `user_id` from the task, sets `status='queued'`,
   `surface=NULL`). The aidream scanner picks it up within ~5 seconds.
4. **Live updates** —
   - List view: `useTaskListStream` subscribes to INSERT/UPDATE/DELETE
     on `sch_task` filtered by `user_id=eq.${userId}`.
   - Detail view: `useRunStream` subscribes to `sch_run` for the task
     AND `sch_task` UPDATEs.
5. **Cron preview** — FE renders `next 5 fires` inline via
   `lib/scheduler-client/next-due` (TS twin of the Python `next_due`
   module) + `cronstrue`. Authoritative `next_due_at` written to the
   DB always comes from aidream `croniter` (the server recomputes on
   every trigger write).
6. **Admin orphan-lease remediation** — `OrphanLeasesPage` lists runs
   with `claim_expires_at < now()`, plus a Force-fail button. The
   scanner re-enqueues recurring triggers on the next tick.
7. **Server-side execution** — `matrx-scheduler` scanner (every 5s):
   sweeps expired leases, finds queued runs (manual fires), finds due
   scheduled tasks, claims atomically (partial unique index), advances
   `next_due_at` immediately on claim, dispatches to runner. Runner
   drives the matrx-ai bridge in `aidream/services/scheduling/
   agent_runner_adapter.py` and writes results back with `claim_token`
   gating.

## Invariants

1. **Never call `.from('sch_*')` outside `service/queries.ts` or
   `lib/services/scheduling-admin-service.ts`.** New user-facing
   writes go through `service/schedulerClient.ts` (HTTP); don't add
   parallel writes to `queries.ts`.
2. **Never use the aidream service_role supabase singleton in
   scheduling routes** — `make_user_supabase_client(jwt)` is mandatory
   so RLS binds to the caller.
3. **Never insert into `sch_run` directly from the FE** — use the
   `sch_enqueue_manual_run` RPC.
4. **The DB owns `sch_task.next_due_at`.** Write to
   `sch_trigger.next_due_at`; the cascade trigger updates the parent.
5. **No bare `confirm()` / `alert()` / `prompt()`** — use
   `<ConfirmDialog>` per CLAUDE.md.
6. **One trigger per task in v1** (schema supports many).
7. **matrx-frontend doesn't execute** — `'web'` is observe-only.
8. **All status-writing updates inside the runner are gated by
   `claim_token`** so a lapsed-and-re-claimed run can't be stomped on.

## Related features

- **agents** — `agx_agent` is the FK target for
  `sch_agent_task.agent_id`. Agent picker queries directly.
- **conversations** — `cx_conversation` is the deep-link target for
  `sch_run.output_ref.kind === 'conversation'`.
- **window-panels** — v1.5 will register a Quick Schedule overlay.
- **scope-system** — v1 is user-scoped only.

## Tests

| Layer | Count | Location |
|---|---|---|
| Python | 25 (cron + edge cases + DST + malformed inputs) | `aidream/packages/matrx-scheduler/tests/` |
| FE Jest | triggerHumanize + validation | `features/scheduling/utils/__tests__/` |

Run: `pnpm exec jest features/scheduling/` and (inside aidream)
`uv run pytest packages/matrx-scheduler/tests`.

## Current work / known gaps

- **Templates DB backing** — UI stubbed; `sch_template` table not
  built yet.
- **Multi-trigger UI** — form structured so adding it is mechanical.
- **Status badge polish** for admin run table — XSS-safe today (plain
  text rendering everywhere) but no friendly mapping of raw Postgres
  errors yet.

## Change log

- **2026-08-12** — The ADMIN console's Cron tester is agent-writable, and it is the first page under `/administration/automation/scheduling` to emit a surface at all. New `lib/cron-tester-surface.ts` holds the scope builder and the two write handlers for `matrx-admin/scheduling`'s new `cron_expression` / `cron_timezone` targets (both `applyPolicy: "ask"`, both `mode: "ui"`), and `cron-tester/page.tsx` mounts that surface's FIRST `SurfaceRuntimeProvider` — the manifest had 27 declared values with no runtime behind any of them, so readiness moves `"stub"` → `"partial"` (only this tab is wired; the other six still emit nothing). Invariant 1 is untouched by construction: the tester is a pure client-side validator that schedules nothing, reads no `sch_*` row and writes none, so there is no service call to route through — the handlers drive two `useState` values and nothing else. Validation reuses `validateCron` from `lib/scheduler-client/next-due`, the exact function the page's error alert renders from, so an accepted value and a previewable value cannot drift; `COMMON_TZ` moved out of the page into the new module as `CRON_TESTER_TIMEZONES` so the picker and the handler's enum check read one list. Deliberately NOT declared anywhere in this console: enable/disable, re-cron, and the orphan-lease "mark failed" action, which change what the scheduler actually runs for real users; the Runs/Overview/Scanner-health/Orphan-leases report tabs; the hardcoded Templates `SEEDS` array; and the tester's own "Show next N" view knob. This is a separate set from the `matrx-user/schedules` targets below and does not overlap them — that surface's `schedule_draft_trigger` stages a REAL task's trigger through `ScheduleForm.tsx`, which this admin subtree does not render. Live-verified with four Badass Agent runs: per-target confirms carrying the manifest prose, Apply landing `*/15 9-17 * * 1-5` + `Asia/Tokyo` in the real inputs with the fire preview recomputing, "Keep as is" declining cleanly, an enable/disable request refused with nothing staged, and a forced `0 99 * * *` returning the cron parser's own `Constraint error, got value 99 expected range 0-23` through the handler's throw with the form unchanged. Zero `surface-writeback` captures on the clean load (5 on the deliberately-invalid load, which is the seam being loud by design); `pnpm check:surface-drift` + `pnpm type-check` clean.
- **2026-08-10** — The detail route is agent-writable too, completing the surface's write half. `ScheduleDetail` now passes `getWriteHandlers` on its `SurfaceRuntimeProvider` and wires exactly two new manifest targets — `schedule_title` and `schedule_description`, both `applyPolicy: "ask"` and `mode: "entity"` — through the canonical `updateScheduledTask` thunk, so invariant 1 holds (no new `.from('sch_*')` write; the title/description patch goes out as the existing `taskPatch` → `scheduler.patchTask` HTTP call). They are entity rather than draft because this route owns no form state and has no Save bar, so a staged value would have nowhere to live. Scope is deliberately narrow: these are the only two fields that change how a schedule reads to a human without changing what it runs or when it fires. Prompt, trigger, variables and tags stay editor-only (the 2026-08-09 draft targets) so the user reviews the whole schedule before re-arming it, and enable/disable, delete, auth mode, execution surfaces/limits, expiry, the target agent and the persistent conversation id remain non-writable on every mount. Live-verified with a Badass Agent run on `/schedules/[id]`: both targets raised their own confirm carrying the manifest prose, Apply persisted through a full page reload, and a request to pause the schedule was refused — the agent reported that only the two targets exist rather than reaching around them. Zero `surface-writeback` error captures; `pnpm check:surface-drift` + `pnpm type-check` clean.
- **2026-08-09** — The editor is agent-writable. `features/surfaces/manifests/schedules.manifest.ts` declares 6 `applyPolicy: "ask"`, `mode: "draft"` write targets (`schedule_draft_title` / `_description` / `_prompt` / `_trigger` / `_variables` / `_tags`); `ScheduleForm` registers the handlers on its existing `SurfaceRuntimeProvider` via `getWriteHandlers`, staging through the same `patch` / `setTrigger` setters the user's typing uses — the user still presses Save, and submit re-runs the canonical Zod schema. Handlers validate and THROW; the trigger handler runs `triggerConfigSchema` **and** `validateCron` (`lib/scheduler-client/next-due`), because the Zod cron branch only requires a non-empty string and would otherwise stage prose like "every monday at 8:30am" that fails at save. Enable/disable, delete, auth mode, execution surfaces/limits, expiry, the target agent and the persistent conversation id are deliberately NOT agent-writable. Recipe + verification contract: the `surface-write-targets` skill.
- **2026-07-22** — Added a `// VIEW LAW:` comment to `service/queries.ts` `listAgentTasks` noting the existing RLS container-scope (sch_task rows are user-scoped by policy), clearing THE VIEW LAW's bare-RLS guard finding (no behavior change).
- **2026-07-13** (later) — `EntityModeHeader` v2 on `/schedules/[id]`: actions are declarative — Run now (solid primary), Pause/Enable (glass, replaces the Switch — one canonical control), Delete (solid destructive); on mobile the header is back + title + one `…` opening a bottom drawer with View/Edit/New + all actions.
- **2026-07-13** — `/schedules/[id]` view + edit now consume the new `EntityModeHeader` shell template (back + title sibling-dropdown + View|Edit|New center nav + enabled-switch/run/delete as glass tap targets); `ScheduleDetail`'s in-body back row, h1 title block, and button row are deleted; body widened to `max-w-5xl`.
- **2026-07-13** — `/schedules`, `/schedules/new`, `/schedules/[id]/edit` conformed to the (core) shell-header doctrine (`core-route-headers` skill): in-body faux headers + `h-[calc(100dvh-2.5rem)]` replaced with `RouteHeader` injection (title/back left, count center on the list, refresh + new as tap targets right) and `h-full` bodies with `var(--shell-header-h)` top clearance.
- **2026-05-16** — Soft-delete semantics + HTTP wire-type cleanup.
  Decoupled "deleted" from "paused" on `sch_task` so the Delete action
  actually hides the row from the user's view (previously a deleted
  task reappeared on the next list fetch because the FE / scanner
  couldn't distinguish a soft-deleted row from a paused row — both
  used `enabled=false`). Five-part change:
  * **Migration** `migrations/sch_task_deleted_at.sql` — added
    `sch_task.deleted_at TIMESTAMPTZ NULL` plus a partial index
    `sch_task_user_id_active_idx ON (user_id, updated_at DESC) WHERE
    deleted_at IS NULL` so the common "my schedules, newest first"
    query stays fast.
  * **matrx-scheduler package** (`api/user_queries.py`) — `list_tasks`
    / `count_tasks` / `get_task` filter `deleted_at IS NULL`;
    `soft_delete_task` now writes `deleted_at = now()` *and* keeps
    `enabled = false` (belt + suspenders for the scanner);
    `update_task` refuses to PATCH a soft-deleted row (returns None
    → router 404) so a misbehaving FE can't silently revive a
    deleted task. `queries.py` (scanner) also defensively filters
    `deleted_at IS NULL`. Test asserting GET-after-delete is now
    updated to expect 404 (was 200); 75 / 75 pass.
  * **FE reads** (`features/scheduling/service/queries.ts`) —
    `listAgentTasks` and `getAgentTask` add `.is("deleted_at", null)`
    so the list view and detail / edit pages match the HTTP surface.
    `useTaskListStream` now treats an UPDATE that flips
    `deleted_at != null` as a removal (other tabs / sessions drop the
    row immediately).
  * **Wire-type cleanup** —
    `features/scheduling/service/schedulerApi.types.ts:RunResponse`
    dropped `claim_token` and `claim_expires_at` to match the
    package's Pydantic schema (internal scheduler-lease state, never
    exposed via the HTTP surface; the admin orphan-leases page still
    reads them directly via `scheduling-admin-service.ts` against
    `SchRunRow`).
  * **Confirm-dialog copy** — `ScheduleRow` and `ScheduleDetail`
    "Delete schedule" dialogs no longer claim "and its run history"
    (run history is preserved by FK; only the schedule row is
    hidden).
  * **`types/database.types.ts`** — `sch_task` Row / Insert / Update
    sections updated to include `deleted_at: string | null`.

  Net effect: pressing Delete now does what users expect (gone from
  view, doesn't reappear, never fires again) while Pause / Resume
  remain a pure toggle on `enabled`. Run history is preserved either
  way.

- **2026-05-16** — Wired the matrx-scheduler `/scheduler/*` HTTP router
  into aidream. The router shipped on 2026-05-13 in the
  `matrx-scheduler` package but was never mounted on the aidream
  FastAPI app, so every user-facing CRUD call (create / edit /
  soft-delete / run-now / toggle-enabled) was 404'ing in prod while
  reads (Supabase-direct) and execution (scanner-direct) continued to
  work — masking the gap. Two surgical edits in aidream: (1)
  `aidream/api/app.py` now calls
  `matrx_scheduler.api.include_routers(fastapi_app, prefix="/scheduler")`
  right after the legacy `/scheduling/*` mount so both surfaces
  coexist; (2) `aidream/package_integration.py` injects
  `user_supabase_factory=make_user_supabase_client` into
  `matrx_scheduler.configure(...)` so the new routes RLS-bind to the
  caller via the same per-request builder the legacy routes already
  used (env-based fallback would have worked too because both read
  `SUPABASE_MATRIX_URL` + `SUPABASE_MATRIX_PUBLISHABLE_KEY`, but
  injecting keeps both surfaces on the exact same code path). ASGI
  smoke shows all 16 `/scheduler/*` routes registering alongside the
  5 legacy `/scheduling/*` routes; matrx-scheduler package tests
  remain 75/75. No FE changes required — `schedulerClient.ts` was
  already targeting the now-mounted endpoints.
- **2026-05-13** — Migrated FE to aidream's new `/scheduler/*` HTTP
  router (matrx-scheduler package): created typed
  `service/schedulerClient.ts` covering all 16 endpoints; rewired
  Redux thunks so `createScheduledTask`, `updateScheduledTask`
  (task + trigger), `toggleTaskEnabled`, `deleteScheduledTask`
  (soft-delete), and `runTaskNowThunk` go through HTTP; stripped
  task/trigger writes out of `queries.ts` (left a single residual
  `updateAgentTaskFields` write for the unmodelled `sch_agent_task`
  PATCH gap); pointed admin scanner-health page at `/scheduler/status`
  (gained `last_tick_manual_claimed` + `in_flight_count` stats);
  pointed admin cron-tester and `CronForm` preview at the canonical
  TS twin in `lib/scheduler-client/next-due`; deleted the
  `features/scheduling/utils/nextFireTime.ts` FE-only fallback shim
  and its Jest suite; deleted `service/pythonClient.ts`. Admin
  cross-user surfaces (all-tasks list, orphan-leases,
  `markRunFailed`) remain on Supabase via
  `lib/services/scheduling-admin-service.ts` until aidream exposes
  admin HTTP endpoints.
- **2026-05-11** — Audit pass + hardening:
  - DB: super_admin RLS narrowing (was platform-admin); input CHECK caps
    on title/prompt/runtime/concurrent/tags/cron-expression; partial
    unique index `sch_run_unique_active_per_task` for atomic claim;
    `sch_enqueue_manual_run` RPC; `sch_recompute_task_next_due_at` auth
    re-check; REVOKE EXECUTE for non-trigger callers.
  - Python: per-request JWT supabase client (no more service_role
    bypass); claim race fixed via unique-violation catch; next_due_at
    advanced at claim time; queued-run pickup pass; claim_token gating
    on all run-row writes; surface filter SQL-side; exponential
    backoff on scanner errors; graceful in-flight task drain on
    stop_scanner; real matrx-ai bridge replacing the stub.
  - FE: selector factory anti-pattern removed (flat selectors); manual
    `useMemo`/`useCallback` removed (React Compiler); IntervalForm
    `useEffect`-loop fixed; `useRunStream` null-overwrite fixed; list
    view realtime added (`useTaskListStream`); `OutputRef` union
    fixed; Zod validation wired into form; Python authoritative cron
    compute on writes; Run-now goes via `sch_enqueue_manual_run` RPC;
    agent picker; Variables key/value editor; expires_at,
    max_concurrent, persistent_conversation_id form fields; cron
    expression length cap.
  - Tests + docs: 25 Python tests (2 bugs found and fixed), 34 FE
    tests (1 bug found and fixed), `.claude/skills/scheduling/SKILL.md`.
- **2026-05-10** — Initial release. 4 migrations, full user UI,
  full admin UI, matrx-scheduler Python package, aidream router with
  5 endpoints under `/scheduling`.
