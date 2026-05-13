# `@matrx/scheduler-client`

TypeScript twin of the Python [`matrx-scheduler`](../../../aidream/packages/matrx-scheduler/) package. This is the **canonical home** of the TS scheduler client. matrx-extend vendors/mirrors a copy of this module (see Phase 3c of the scheduler rollout for the sync plan).

## Why this exists

The Python `matrx-scheduler` is the authoritative scanner — it runs in aidream, polls `sch_task.next_due_at`, claims due rows by inserting `sch_run` records, and dispatches to the host's agent runner.

But not every Matrx surface can host a Python process:

- **matrx-extend** (Chrome extension) — JS/MV3, no Python runtime.
- **matrx-frontend** (Next.js web) — needs to subscribe to `sch_task` realtime for the admin UI and may pick up `surface: 'web'` tasks once that surface starts executing.
- **Future**: mobile, sandbox.

These clients need a TS implementation of the same claim semantics (atomic INSERT into `sch_run`, lease-token gating, surface filtering) against the same `sch_*` tables. This package provides that.

## What this package mirrors

The TS API is intentionally shaped to match the Python module:

| TS                              | Python (`matrx_scheduler/`)              |
| ------------------------------- | ---------------------------------------- |
| `createSchedulerClient(cfg)`    | `configure(...)` + module singleton      |
| `claimTask(opts)`               | `queries.py::claim_task`                 |
| `markRunRunning(opts)`          | `queries.py::mark_run_running`           |
| `completeRun(opts)`             | `queries.py::finalize_run(status='success')` |
| `failRun(opts)`                 | `queries.py::finalize_run(status='failed')` |
| `subscribeToTasks(opts)`        | (no Python equivalent — Python polls)    |
| `computeNextDueAt(trigger)`     | `next_due.py::compute_next_due_at`       |
| `TaskClaimRaceError`            | `claim_task` returning `None` on 23505   |
| `SCHEDULER_SURFACES`            | hard-coded list (must match DB CHECK)    |

For the authoritative claim/lease semantics, **read the Python module** — that's where the design lives. This TS package follows it.

## Usage

```ts
import { createSchedulerClient } from "@/lib/scheduler-client";
import { supabase } from "@/utils/supabase/client";

const scheduler = createSchedulerClient({
    supabaseClient: supabase,
    surface: "web",
    instanceId: crypto.randomUUID(), // stable per-process
});

// Subscribe to schedule changes for the current user.
const stop = scheduler.subscribeToTasks({
    userId: currentUserId,
    onTask: ({ type, task }) => {
        console.log(`sch_task ${type}`, task.id, task.next_due_at);
    },
});

// Atomically claim a due task. Throws TaskClaimRaceError if another
// scanner won the race — back off and try the next task.
try {
    const run = await scheduler.claimTask({ task });
    // ... do work ...
    const won = await scheduler.completeRun({
        runId: run.id,
        claimToken: run.claim_token!,
        resultSummary: "ok",
    });
    if (!won) {
        // Lease lapsed mid-flight; another claimer owns this run now.
    }
} catch (err) {
    if (err instanceof TaskClaimRaceError) {
        // Expected race loss — log at debug, move on.
    }
}
```

## Race-loss handling

The DB has a partial unique index `sch_run_unique_active_per_task` on `(task_id) WHERE status IN ('queued','claimed','running')`. The second concurrent claimer trips a SQLSTATE `23505` unique violation; `claimTask` catches that and re-throws `TaskClaimRaceError` (which carries the task id and the underlying PostgrestError as `cause`).

`completeRun`, `failRun`, and `markRunRunning` gate their UPDATE on `claim_token` — a stale lease can't overwrite a re-claimed run. They return `boolean`; `false` means the lease was lost and the caller should stop writing.

## Mirroring policy

| Repo              | Path                                  | Role                                                          |
| ----------------- | ------------------------------------- | ------------------------------------------------------------- |
| matrx-frontend    | `lib/scheduler-client/`               | **Canonical TS home.** Edits here first.                      |
| matrx-extend      | `src/lib/scheduler-client/` *(future)* | Mirrored / vendored from matrx-frontend in Phase 3c.          |
| aidream           | `packages/matrx-scheduler/`           | **Canonical Python.** TS follows; never the other way around. |

When changing claim semantics: update the Python module first, then port the change here, then re-vendor into matrx-extend.

## File layout

- `index.ts` — public re-exports (the only file external callers should import from).
- `client.ts` — `createSchedulerClient` factory.
- `claim.ts` — `claimTask`, `markRunRunning`, `completeRun`, `failRun`.
- `subscribe.ts` — `subscribeToTasks` (Realtime postgres_changes).
- `next-due.ts` — TS twin of Python `next_due.py`. Lifted from `features/scheduling/utils/nextFireTime.ts`.
- `surfaces.ts` — `SCHEDULER_SURFACES` whitelist + `SchedulerSurface` type.
- `types.ts` — wire types lifted from `types/database.types.ts` + literal unions for run status / trigger type / auth mode.
- `errors.ts` — `SchedulerClientError`, `TaskClaimRaceError`, `isClaimRaceLoss`.

## Verification

This package has no external test framework; the smoke check is the import graph:

```bash
pnpm tsc --noEmit 2>&1 | grep "lib/scheduler-client"
# Expect: no output.
```

The first real consumer (matrx-extend's vendored copy or matrx-frontend's `features/scheduling/` once it's consolidated) will exercise the runtime paths against a Supabase test project.
