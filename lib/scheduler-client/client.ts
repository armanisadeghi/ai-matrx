// lib/scheduler-client/client.ts
//
// Factory for the scheduler client. Bundles surface + instanceId into
// the closure so callers don't have to thread them through every op.
// Mirrors the configure() + module-singleton pattern in
// packages/matrx-scheduler/matrx_scheduler/_ext.py, but stays functional
// so multiple clients can coexist (e.g. tests, multi-tenant servers).

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    type ClaimTaskOptions,
    type CompleteRunOptions,
    type FailRunOptions,
    type MarkRunRunningOptions,
    claimTask,
    completeRun,
    failRun,
    markRunRunning,
} from "./claim";
import { type SubscribeOptions, subscribeToTasks } from "./subscribe";
import type { SchedulerSurface } from "./surfaces";

export interface SchedulerClientConfig {
    /** Authenticated supabase-js client. Service-role for scanners,
     *  user JWT for UI surfaces. The client picks neither — it's the
     *  caller's job to give us the right one. */
    supabaseClient: SupabaseClient;
    /** Surface identity of this host. Goes into sch_run.surface on claim. */
    surface: SchedulerSurface;
    /** Stable per-process instance UUID. Used by callers to correlate
     *  events back to a specific host across restarts. */
    instanceId: string;
}

export interface SchedulerClient {
    readonly surface: SchedulerSurface;
    readonly instanceId: string;
    readonly supabaseClient: SupabaseClient;

    /**
     * Subscribe to sch_task changes for `userId`. Returns a teardown
     * function. The host's surface is applied as a client-side filter.
     */
    subscribeToTasks(
        opts: Omit<SubscribeOptions, "surface">,
    ): () => Promise<void>;

    /**
     * Atomic claim — INSERT a sch_run row with status='claimed'. Throws
     * TaskClaimRaceError on race-loss; other PostgrestErrors surface as
     * SchedulerClientError.
     */
    claimTask(
        opts: Omit<ClaimTaskOptions, "surface" | "instanceId">,
    ): ReturnType<typeof claimTask>;

    /**
     * Optional intermediate transition: claimed → running. Returns
     * false if the lease was lost.
     */
    markRunRunning(opts: MarkRunRunningOptions): Promise<boolean>;

    /** Terminal success state. Returns false if the lease was lost. */
    completeRun(opts: CompleteRunOptions): Promise<boolean>;

    /** Terminal failure state. Returns false if the lease was lost. */
    failRun(opts: FailRunOptions): Promise<boolean>;
}

/**
 * Build a SchedulerClient bound to one SupabaseClient + surface +
 * instanceId. Callers should hold onto the returned object for the
 * lifetime of the host process.
 */
export function createSchedulerClient(
    cfg: SchedulerClientConfig,
): SchedulerClient {
    const { supabaseClient, surface, instanceId } = cfg;

    return {
        surface,
        instanceId,
        supabaseClient,
        subscribeToTasks: (opts) =>
            subscribeToTasks(supabaseClient, { ...opts, surface }),
        claimTask: (opts) =>
            claimTask(supabaseClient, { ...opts, surface, instanceId }),
        markRunRunning: (opts) => markRunRunning(supabaseClient, opts),
        completeRun: (opts) => completeRun(supabaseClient, opts),
        failRun: (opts) => failRun(supabaseClient, opts),
    };
}
