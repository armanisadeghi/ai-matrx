"use client";

/**
 * features/hr/time/shared/workflowApi.ts — the ONE workflow door the timesheet surfaces use.
 *
 * 🚨 SPEC-TIME §0 law 5: **the approval engine is the only approval engine.** This feature defines
 * no approvals table, no approver column and no second inbox. Attesting, approving one timecard,
 * rejecting one, and bulk-approving are all `hr.wf_decide` / `hr.wf_bulk_decide` — verified live
 * 2026-08-26 as `public.hr_wf_decide(p_step_id, p_decision, p_reason, p_payload)` and
 * `public.hr_wf_bulk_decide(p_step_ids, p_decision, p_reason)`.
 *
 * ♻️ WHY THIS IS NOT `features/hr/tasks/service.ts#decideStep`, WHICH CALLS THE SAME RPC.
 * That one is the ONE HR task inbox's door: it builds its own Supabase client, returns the engine
 * envelope rather than throwing, and — decisively — does not read `NEXT_PUBLIC_HR_MOCK`, so under
 * the serverless build flag (L3-78) it would reach past the fixture lane to a live database. The
 * time lane's calls therefore go through `callHrTimeRpc`, the single mock-aware door this lane
 * already owns.
 * ⚠️ DEBT (lane owner): once the RPC lane is live everywhere, these two doors should collapse into
 * one. Two clients for one RPC is a fork with a reason, and the reason expires.
 */

import { callHrTimeRpc, type HrRpcOptions } from "../api/rpc";

/**
 * The engine's decision vocabulary, read out of the live engine by the inbox lane
 * (`features/hr/tasks/types.ts#HrDecision`) rather than invented here.
 *
 * SPEC-TIME §2.2 speaks of *"`hr.wf_decide` with `attested`"* and *"with `attested_with_exception`"*.
 * Those are the ACTIONS, not the decision tokens: the engine takes `approve` and carries the rest
 * in `p_payload`. {@link attestTimecard} is where that mapping lives, once.
 */
export type HrWorkflowDecision = "approve" | "reject" | "return" | "acknowledge";

export interface HrWorkflowStep {
  step_id: string;
  instance_id: string;
  flow_key: string;
  state: string;
  allows_self?: boolean;
  [key: string]: unknown;
}

/** `hr_wf_for_target` — the open steps on one row. Route 5 uses it to find the attestation step. */
export function getWorkflowForTarget(
  targetToken: string,
  targetId: string,
  opts?: HrRpcOptions,
): Promise<{ steps: HrWorkflowStep[] } & Record<string, unknown>> {
  return callHrTimeRpc("hr_wf_for_target", {
    p_target_token: targetToken,
    p_target_id: targetId,
  }, opts);
}

export interface WorkflowDecisionResult {
  stepId: string;
  decision: HrWorkflowDecision;
  [key: string]: unknown;
}

/** One step, one decision. A refusal arrives as `HrRpcError` and its sentence is rendered verbatim. */
export function decideWorkflowStep(
  stepId: string,
  decision: HrWorkflowDecision,
  reason: string | null,
  payload: Record<string, unknown> = {},
  opts?: HrRpcOptions,
): Promise<WorkflowDecisionResult> {
  return callHrTimeRpc("hr_wf_decide", {
    p_step_id: stepId,
    p_decision: decision,
    p_reason: reason,
    p_payload: payload,
  }, opts);
}

/**
 * 🚨 THE ATTESTATION, AND THE ONE PLACE ITS TWO SHAPES ARE DECIDED (SPEC-TIME §2.2).
 *
 * *Attest* is a plain `approve`. *Attest with exception* is the same decision carrying the
 * employee's own words, which the engine writes to `disputed_at` + `dispute_note` — and **from that
 * moment both the computed value and the employee's stated value show, side by side, permanently.**
 * Nothing can later edit `dispute_note`, so this call is the only chance to get it right, which is
 * why the reason is required by the caller before it ever reaches here.
 *
 * ⚠️ OWED TO THE SQL LANE: `p_payload.dispute_note` is the key this client sends. If the
 * `timecard_attestation` step's apply hook reads a different key, this constant is the single place
 * to change — and the disagreement would otherwise be silently dropped, which is the worst possible
 * failure mode for this particular field.
 */
export function attestTimecard(
  stepId: string,
  options: { disputeNote?: string | null } = {},
  opts?: HrRpcOptions,
): Promise<WorkflowDecisionResult> {
  const note = options.disputeNote?.trim();
  return decideWorkflowStep(
    stepId,
    "approve",
    note ? note : null,
    note ? { attested_with_exception: true, dispute_note: note } : {},
    opts,
  );
}

export interface BulkDecisionOutcome {
  step_id: string;
  granted: boolean;
  reason: string | null;
  detail: string | null;
}

export interface BulkDecisionResult {
  outcomes: BulkDecisionOutcome[];
  [key: string]: unknown;
}

/**
 * 🚨 PER-STEP OUTCOMES, NEVER ALL-OR-NOTHING (SPEC-TIME §6.3). The engine returns one row per step
 * and the surface renders successes and failures **separately, with each failure's reason** — a
 * bulk action that reports only "3 failed" leaves a manager with no idea which three.
 */
export function bulkDecideWorkflowSteps(
  stepIds: string[],
  decision: HrWorkflowDecision,
  reason: string | null,
  opts?: HrRpcOptions,
): Promise<BulkDecisionResult> {
  return callHrTimeRpc("hr_wf_bulk_decide", {
    p_step_ids: stepIds,
    p_decision: decision,
    p_reason: reason,
  }, opts);
}
