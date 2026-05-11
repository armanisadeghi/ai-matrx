# Scheduling

> **Status:** Active (v1)
> **Tier:** 1
> **Last updated:** 2026-05-11

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
- **Admin routes:** `app/(authenticated)/(admin-auth)/administration/scheduling/`
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
  - `features/scheduling/service/queries.ts` — Supabase façade. ONLY
    place that calls `.from('sch_*')`.
  - `features/scheduling/service/pythonClient.ts` — aidream `/scheduling/*`
    routes (cron validation, compute-next-due-at, run-now,
    scanner-status).
  - `lib/services/scheduling-admin-service.ts` — admin reads / writes
    using `is_super_admin()` RLS escape hatch.
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
   `CreateAgentTaskInput`, computes `next_due_at` via aidream
   (`/scheduling/compute-next-due-at`) with FE shim fallback, calls
   `create_agent_task` RPC (atomic 3-table insert).
2. **Pause / resume** — `toggleTaskEnabled` thunk; optimistic-then-reconcile.
3. **Run now** — `sch_enqueue_manual_run(p_task_id)` RPC. Validates
   ownership server-side, stamps `user_id` from the task, sets
   `status='queued'`, `surface=NULL`. The aidream scanner picks it up
   within ~5 seconds.
4. **Live updates** —
   - List view: `useTaskListStream` subscribes to INSERT/UPDATE/DELETE
     on `sch_task` filtered by `user_id=eq.${userId}`.
   - Detail view: `useRunStream` subscribes to `sch_run` for the task
     AND `sch_task` UPDATEs.
5. **Cron preview** — FE renders `next 5 fires` inline via `cron-parser`
   + `cronstrue`. Authoritative `next_due_at` written to DB comes from
   aidream `croniter`.
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
   `lib/services/scheduling-admin-service.ts`.**
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
| FE Jest | 34 (nextFireTime + triggerHumanize + validation) | `features/scheduling/utils/__tests__/` |

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
