// lib/scheduler-client/errors.ts
//
// Race-loss detection: when two scanners try to claim the same task,
// the second INSERT into sch_run fails with SQLSTATE 23505 (unique
// violation on the sch_run_unique_active_per_task partial index — see
// migrations/2026_05_10_sch_v0.sql). The TS client must catch this
// specific code as "another claimer won" rather than propagating it.
//
// Mirrors packages/matrx-scheduler/matrx_scheduler/queries.py:184-188.

/**
 * Returns true if `error` looks like a race-lost unique-violation on
 * sch_run_unique_active_per_task. Accepts a few message shapes because
 * supabase-js / PostgREST may wrap the error differently depending on
 * version (.code vs .message stringification).
 */
export function isClaimRaceLoss(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    const err = error as { code?: string; message?: string; details?: string };
    if (err.code === "23505") return true;
    const haystack = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
    if (haystack.includes("23505")) return true;
    if (haystack.includes("sch_run_unique_active_per_task")) return true;
    if (haystack.includes("duplicate key")) return true;
    return false;
}

/**
 * Base error class for everything thrown out of the scheduler-client.
 * `cause` carries the underlying PostgrestError so callers can inspect
 * code / hint / details when they need to.
 */
export class SchedulerClientError extends Error {
    public readonly cause?: unknown;

    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = "SchedulerClientError";
        this.cause = cause;
    }
}

/**
 * Thrown by claimTask when another scanner won the race. Callers should
 * back off and look at the next due task rather than retry the same one.
 */
export class TaskClaimRaceError extends SchedulerClientError {
    public readonly taskId: string;

    constructor(taskId: string, cause?: unknown) {
        super(`Lost race to claim task ${taskId}`, cause);
        this.name = "TaskClaimRaceError";
        this.taskId = taskId;
    }
}
