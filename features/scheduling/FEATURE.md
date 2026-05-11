# Scheduling

> **Status:** Active (v1)
> **Tier:** 1
> **Last updated:** 2026-05-10

User and admin surfaces for the platform-wide scheduling spine (`sch_*`
tables). Lets users create scheduled agent tasks, observe runs live, and lets
super-admins monitor system-wide health.

## Purpose

The `sch_*` tables are a kind-agnostic, multi-surface scheduling spine.
Any client can register a task; any executor surface can claim and run it.
matrx-frontend is the **control plane** — CRUD and observability. Execution
happens on the `'server'` surface (aidream Python via `matrx-scheduler`) and
the `'chrome-extension-chat'` surface (matrx-extend, for context-match
triggers and DOM-tool agents).

## Entry points

- **User routes:** `app/(authenticated)/schedules/`
  - `page.tsx` — list view
  - `new/page.tsx` — create form
  - `[id]/page.tsx` — detail view
  - `[id]/edit/page.tsx` — edit form
- **Admin routes:** `app/(authenticated)/(admin-auth)/administration/scheduling/`
  - `page.tsx` — overview tiles + health stats
  - `tasks/page.tsx` — all-user tasks
  - `runs/page.tsx` — all-user runs
  - `orphan-leases/page.tsx` — stuck claims
  - `cron-tester/page.tsx` — FE-only validator
  - `scanner-health/page.tsx` — aidream-backed status
  - `templates/page.tsx` — admin-curated starter schedules (stub)
- **Hooks:** `features/scheduling/hooks/`
  - `useScheduledTasks` — list hydration
  - `useTaskDetail` — single task + runs
  - `useTaskRuns` — run history
  - `useRunStream` — Supabase realtime on `sch_run`
- **Services:**
  - `features/scheduling/service/queries.ts` — Supabase façade (the ONLY
    place that calls `.from('sch_*')`)
  - `features/scheduling/service/pythonClient.ts` — aidream `/scheduling/*`
    routes (cron validation, compute-next-due-at, run-now, scanner-status)
  - `lib/services/scheduling-admin-service.ts` — admin reads / writes
    (uses the `is_platform_admin()` RLS escape hatch in `sch_*`)
- **Redux state path:** `state.schedulingTasks`, `state.schedulingRuns`
- **Related migrations:** `migrations/sch_admin_rls.sql`,
  `migrations/sch_server_surface.sql`,
  `migrations/sch_create_agent_task.sql`,
  `migrations/sch_next_due_at_trigger.sql`

## Data model

Mirrors the spec in [`docs/SCHEDULING.md`](../../docs/SCHEDULING.md).

```
sch_task            kind-agnostic spine (the WHAT)
  ↳ sch_agent_task    agent-kind extension (1:1 by id)
sch_trigger         when it fires (many per task in future; 1 today)
sch_run             each execution
```

**Trigger types:** `one-shot`, `interval`, `cron`, `heartbeat`,
`context-match`, plus `event`/`manual`/`dependency` reserved.

**Surfaces:** `'any' | 'server' | 'chrome-extension-chat' | 'desktop' | 'web'
| 'mobile' | 'sandbox'`. CHECK constraint on `sch_task.surfaces` whitelists
exactly these (`migrations/sch_server_surface.sql`).

**RLS:** owner-or-admin policies on all four tables. Admin pages use the
regular browser client; `is_platform_admin()` is the escape hatch.

## Key flows

1. **Create a scheduled task** — `ScheduleForm` builds a `CreateAgentTaskInput`,
   `createScheduledTask` thunk computes `next_due_at` locally and calls the
   `create_agent_task` RPC (atomic 3-table insert).
2. **Pause / resume** — `toggleTaskEnabled` thunk; optimistic-then-reconcile.
3. **Run now** — Inserts a `sch_run` row with `status='queued'`. The aidream
   scanner picks it up within ~5 seconds.
4. **Live updates** — `useRunStream` subscribes to `postgres_changes` on
   `sch_run` for the visible task and to `sch_task` UPDATEs for the current
   user, keeping `next_due_at` and `last_run_at` fresh.
5. **Cron preview** — `CronForm` shows next 5 fires inline using
   `cron-parser` + `cronstrue`. The authoritative value comes from
   `POST /scheduling/compute-next-due-at` on aidream (server-side `croniter`).
6. **Admin orphan-lease remediation** — `OrphanLeasesPage` lists runs whose
   `claim_expires_at < now()`, with a Force-fail button that calls
   `markRunFailedAdmin`. The scanner re-enqueues recurring triggers on the
   next tick.

## Invariants

1. **Never call `.from('sch_*')` outside `service/queries.ts` or
   `lib/services/scheduling-admin-service.ts`.** The query shape needs to be
   consistent for the SELECT join to work and for selectors to flatten.
2. **The DB owns `sch_task.next_due_at`.** `sch_trigger_cascade_next_due_at`
   recomputes it on every trigger insert/update/delete. Application code
   that bypasses this will desync the scanner.
3. **No bare `confirm()` / `alert()` / `prompt()`** — use
   `<ConfirmDialog>` or imperative `confirm()` from
   `components/dialogs/confirm/ConfirmDialogHost.tsx` (per CLAUDE.md).
4. **One trigger per task in v1.** Schema supports many; the form is built
   so a future "add another" button isn&apos;t a rewrite.
5. **matrx-frontend doesn&apos;t execute.** The `'web'` surface stays in the
   enum but is observe-only. Server-side execution is `'server'` (aidream)
   and browser-context execution is `'chrome-extension-chat'`.

## Related features

- **agents** — `agx_agent` is the FK target for `sch_agent_task.agent_id`.
- **conversations** — `cx_conversation` is the deep-link target for
  `sch_run.output_ref.kind === 'conversation'`.
- **window-panels** — future v1.5 will register a Quick Schedule overlay.
- **scope-system** — v1 is user-scoped only; future org/project scoping
  would add columns and tighten RLS.

## Current work

- Templates library (admin-curated, user-cloneable) — UI stubbed, DB
  backing yet to land.
- Multi-trigger UI — form structured so adding it is mechanical.
- Replace the v0 FE cron-parser fallback with the aidream-authoritative
  value during create/update — currently the FE computes `next_due_at`
  locally before insert; the Python value is the long-term source of truth.

## Change log

- **2026-05-10** — Initial release. 4 migrations (`sch_admin_rls`,
  `sch_server_surface`, `sch_create_agent_task`, `sch_next_due_at_trigger`),
  full user UI (`/schedules`), full admin UI
  (`/administration/scheduling/*`), `matrx-scheduler` Python package
  scaffolded with 13 unit tests passing, aidream router with 5 endpoints
  mounted under `/scheduling`.
