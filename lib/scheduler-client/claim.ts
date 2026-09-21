// lib/scheduler-client/claim.ts
//
// The atomic claim primitives. Mirrors the semantics of
// packages/matrx-scheduler/matrx_scheduler/queries.py::claim_task,
// finalize_run, and the lease-token gating used for status transitions.
//
// Claim works by INSERTing a sch_run row with status='claimed'. The
// partial unique index sch_run_unique_active_per_task (created in
// migrations/2026_05_10_sch_v0.sql) guarantees that at most one
// non-terminal run exists per (task_id), so the second concurrent
// claimer trips a SQLSTATE 23505 unique-violation. We surface that as
// TaskClaimRaceError instead of propagating it.
//
// completeRun / failRun gate their UPDATE on `claim_token` so a stale
// lease can't overwrite a re-claimed run. The boolean return tells the
// caller whether the write actually landed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import { schedulerDb } from "@/utils/supabase/schedulerDb";

import {
  SchedulerClientError,
  TaskClaimRaceError,
  isClaimRaceLoss,
} from "./errors";
import type {
  Json,
  OutputRef,
  RunStatus,
  SchRunRow,
  SchTaskRow,
} from "./types";

/** Default claim lease — matches Python scanner.DEFAULT_LEASE_SECONDS. */
const DEFAULT_LEASE_SECONDS = 600;

/**
 * 🚨 THE CLAIM PROTOCOL MARKER NOW LIVES IN THE DOOR. (SECURITY-SWEEP, 2026-09-21.)
 * `scheduler.sch_run_claim` writes `metadata.claim_protocol = 2` itself, so the constant that
 * used to live here — and had to stay in lockstep with `matrx_scheduler/queries.py::CLAIM_PROTOCOL`
 * by hand, and once went missing entirely, silently failing every claim against the two CHECK
 * constraints — is no longer a thing two languages can disagree about. The constraints
 * `sch_run_claim_protocol_chk` and `sch_run_claim_protocol_by_claimed_at_chk` are unchanged and
 * still refuse any claim without it.
 */

const OrganizationIdSchema = z.string().uuid();

// ── claimTask ──────────────────────────────────────────────────────────────

export interface ClaimTaskOptions {
  /** The persisted task is the authoritative organization source for its run. */
  task: Pick<
    SchTaskRow,
    "id" | "user_id" | "organization_id" | "next_due_at"
  >;
  /** Surface of the claiming host (e.g. 'chrome-extension-chat'). */
  surface: string;
  /** Stable per-host instance id. Not written to the row today, but tracked
   *  in the client envelope for future correlation. */
  instanceId: string;
  /** Optional trigger id, written when claiming a scheduled (not manual) run. */
  triggerId?: string | null;
  /** Optional queue name (passthrough of sch_task.queue). */
  queue?: string | null;
  /** Lease length in seconds. Default 600s, matching Python. */
  leaseSeconds?: number;
}

/**
 * Atomic claim THROUGH THE DOOR: `scheduler.sch_run_claim` mints the lease token and inserts
 * the run. The partial unique index `sch_run_unique_active_per_task` still decides the race
 * and the door lets the `23505` propagate, so `isClaimRaceLoss` classifies it exactly as
 * before.
 *
 * 🚨 THE TOKEN IS NOT MINTED HERE ANY MORE. This function used to call `crypto.randomUUID()`
 * in the page and INSERT the result — and holding a run's claim token IS holding the run
 * (`completeRun`, `failRun` and `markRunRunning` all gate their UPDATE on it), so a client
 * that chose the token could write one it already knew onto somebody else's run and then
 * finish, fail or re-point their scheduled work. A trigger on `scheduler.sch_run` now refuses
 * any client INSERT that carries a token at all.
 *
 * The task is still read here for its organization, because the caller already has the row
 * and the refusal reads better locally; the DOOR re-reads the task and is the authority —
 * it takes `organization_id`, `user_id`, `due_at` and `queue` from the persisted task, so a
 * client cannot file a run in an organization the task does not belong to.
 *
 * Returns the freshly-created sch_run row (including the claim_token the caller will need for
 * subsequent updates).
 */
export async function claimTask(
  supabase: SupabaseClient,
  opts: ClaimTaskOptions,
): Promise<SchRunRow> {
  const organizationId = OrganizationIdSchema.safeParse(
    opts.task.organization_id,
  );
  if (!organizationId.success) {
    throw new SchedulerClientError(
      `Refusing to claim task ${opts.task.id}: task has no valid organization_id`,
    );
  }

  const { data, error } = await schedulerDb(supabase)
    .schema("scheduler")
    .rpc("sch_run_claim", {
      p_task_id: opts.task.id,
      p_surface: opts.surface,
      ...(opts.triggerId == null
        ? {}
        : { p_trigger_id: opts.triggerId }),
      ...(opts.queue == null ? {} : { p_queue: opts.queue }),
      p_lease_seconds: opts.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
    })
    .single();

  if (error) {
    if (isClaimRaceLoss(error)) {
      throw new TaskClaimRaceError(opts.task.id, error);
    }
    throw new SchedulerClientError(
      `claimTask failed for task ${opts.task.id}: ${error.message}`,
      error,
    );
  }

  if (!data) {
    throw new SchedulerClientError(
      `claimTask returned no row for task ${opts.task.id}`,
    );
  }

  return data as SchRunRow;
}

// ── completeRun ────────────────────────────────────────────────────────────

export interface CompleteRunOptions {
  runId: string;
  /** Token returned by claimTask — gates the UPDATE so stale leases can't write. */
  claimToken: string;
  /** Truncated to 2000 chars to match Python queries.py:273. */
  resultSummary?: string | null;
  resultMetadata?: Record<string, Json> | null;
  outputRef?: OutputRef | null;
}

/**
 * Mark a run successful. Returns true if the UPDATE matched a row (lease
 * still held), false if 0 rows matched (lease lost — another claimer
 * owns this run, do not write).
 */
export async function completeRun(
  supabase: SupabaseClient,
  opts: CompleteRunOptions,
): Promise<boolean> {
  const { data, error } = await schedulerDb(supabase)
    .schema("scheduler")
    .from("sch_run")
    .update({
      status: "success" satisfies RunStatus,
      finished_at: new Date().toISOString(),
      claim_token: null,
      result_summary: opts.resultSummary?.slice(0, 2000) ?? null,
      result_metadata: (opts.resultMetadata ?? null) as Json | null,
      output_ref: (opts.outputRef ?? null) as Json | null,
    })
    .eq("id", opts.runId)
    .eq("claim_token", opts.claimToken)
    .select("id");

  if (error) {
    throw new SchedulerClientError(
      `completeRun failed for run ${opts.runId}: ${error.message}`,
      error,
    );
  }

  return (data?.length ?? 0) > 0;
}

// ── failRun ────────────────────────────────────────────────────────────────

export interface FailRunOptions {
  runId: string;
  claimToken: string;
  /** Truncated to 2000 chars to match Python queries.py:275. */
  errorMessage: string;
  resultMetadata?: Record<string, Json> | null;
  outputRef?: OutputRef | null;
}

/**
 * Mark a run failed. Lease-gated like completeRun; returns false if the
 * UPDATE matched 0 rows (caller should not retry the same run id).
 */
export async function failRun(
  supabase: SupabaseClient,
  opts: FailRunOptions,
): Promise<boolean> {
  const { data, error } = await schedulerDb(supabase)
    .schema("scheduler")
    .from("sch_run")
    .update({
      status: "failed" satisfies RunStatus,
      finished_at: new Date().toISOString(),
      claim_token: null,
      error_message: opts.errorMessage.slice(0, 2000),
      result_metadata: (opts.resultMetadata ?? null) as Json | null,
      output_ref: (opts.outputRef ?? null) as Json | null,
    })
    .eq("id", opts.runId)
    .eq("claim_token", opts.claimToken)
    .select("id");

  if (error) {
    throw new SchedulerClientError(
      `failRun failed for run ${opts.runId}: ${error.message}`,
      error,
    );
  }

  return (data?.length ?? 0) > 0;
}

// ── markRunRunning ─────────────────────────────────────────────────────────

export interface MarkRunRunningOptions {
  runId: string;
  claimToken: string;
  outputRef?: OutputRef | null;
}

/**
 * Optional intermediate transition: claimed → running. Useful when a
 * runner wants to bind an output_ref (e.g. conversation_id) as soon as
 * it starts work but the terminal state will land later. Mirrors
 * Python queries.py::mark_run_running.
 *
 * Returns false if the lease was lost.
 */
export async function markRunRunning(
  supabase: SupabaseClient,
  opts: MarkRunRunningOptions,
): Promise<boolean> {
  const patch: Database["scheduler"]["Tables"]["sch_run"]["Update"] = {
    status: "running" satisfies RunStatus,
    started_at: new Date().toISOString(),
  };
  if (opts.outputRef !== undefined) {
    patch.output_ref = (opts.outputRef ?? null) as Json | null;
  }

  const { data, error } = await schedulerDb(supabase)
    .schema("scheduler")
    .from("sch_run")
    .update(patch)
    .eq("id", opts.runId)
    .eq("claim_token", opts.claimToken)
    .select("id");

  if (error) {
    throw new SchedulerClientError(
      `markRunRunning failed for run ${opts.runId}: ${error.message}`,
      error,
    );
  }

  return (data?.length ?? 0) > 0;
}
