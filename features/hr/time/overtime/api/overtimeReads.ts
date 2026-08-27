"use client";

/**
 * features/hr/time/overtime/api/overtimeReads.ts — the D24a lane's two transports.
 *
 * THE SPLIT, AND WHY IT IS NOT NEGOTIABLE (SPEC-CONTRACTS §3.2's D24a note):
 *
 *  • **The approval itself is `direct`** — an ordinary workflow instance through the ONE engine.
 *    🚨 Decisions go through `hr_wf_decide` and nothing else. This lane defines no approvals table,
 *    no approver column, no reminder job and no second inbox (SPEC-TIME §0 law 5). There is
 *    deliberately no `decideOvertimePreapproval` here that does anything other than call the shared
 *    workflow decision RPC, and adding an approver picker of our own would be the defect this
 *    comment exists to prevent.
 *
 *  • **The threshold evaluation is `server`** — E-55 `POST /hr/time/overtime/evaluate`. It reads
 *    the live punch stream and resolves jurisdiction rules as of each work date, and it must produce
 *    the same answer for the clock UI, the alerting worker and the workflow's `validate_fn`.
 *    Reimplementing it in a client would be the clients-consume-never-reimplement violation in its
 *    purest form.
 *
 * 🚨 E-55 IS ALWAYS `prospective`. It projects; it never writes hours. The authoritative overtime
 * answer is E-03 against a closed workweek, and the two must never be confused — a projection that
 * got stored as evidence is how a wage claim gets an answer we cannot defend. Anything rendered
 * from it is labelled a projection.
 *
 * 🚨 NOTHING IN THIS RESPONSE CAN SUPPRESS PAY. `preapproval.state = 'exceeded_without_approval'`
 * is a management flag with the hours intact beside it.
 */

import { hrApiPost } from "@/lib/api/hr-contract-client";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { callHrTimeRpc, type HrRpcOptions } from "../../api/rpc";
import type {
  OvertimePreapprovalRow,
  OvertimePreapprovalState,
  PageRequest,
  Paged,
} from "../../api/types";

// ---------------------------------------------------------------------------------------------
// The RPC lane — rows and the create
// ---------------------------------------------------------------------------------------------

export interface OvertimeListFilters {
  states?: OvertimePreapprovalState[];
  /** Only rows this viewer can decide. A manager sees their own reports, never the whole org. */
  awaitingMyDecision?: boolean;
  employmentIds?: string[];
  from?: string;
  to?: string;
  /** 🚨 Paid-and-flagged rows. A filter, never a payment state. */
  unapprovedFlaggedOnly?: boolean;
  search?: string;
}

/** Route 31a's queue read. Fully paginated — LAW 3. */
export function listOvertimePreapprovals(
  filters: OvertimeListFilters,
  page: PageRequest,
  opts?: HrRpcOptions,
): Promise<Paged<OvertimePreapprovalRow>> {
  return callHrTimeRpc<Paged<OvertimePreapprovalRow>>(
    "hr_overtime_preapproval_list",
    { p_filters: filters, p_page: page },
    opts,
  );
}

/** Route 31b's read. One request, whichever viewer is looking at it. */
export function getOvertimePreapproval(
  preapprovalId: string,
  opts?: HrRpcOptions,
): Promise<OvertimePreapprovalRow> {
  return callHrTimeRpc<OvertimePreapprovalRow>(
    "hr_overtime_preapproval_get",
    { p_preapproval_id: preapprovalId },
    opts,
  );
}

/**
 * 🚨 **The request is scoped by SHIFTS, not by a position assignment.**
 *
 * SPEC-TIME §4.8 proposed `hr.overtime_preapproval` columns `position_assignment_id` and
 * `threshold_axes text[]`. **Neither was built.** SPEC-DATA-MODEL §7.12 is the keystone that holds
 * the actual DDL, and what shipped is `shift_ids uuid[]` — verified against the live catalog. The
 * client was written to §4.8 and sent two parameters the function does not declare while omitting
 * the one it does, which is a runtime failure on route 31b, not a type error: PostgREST resolves an
 * RPC by argument NAME, so a wrong name is "function does not exist".
 *
 * `thresholdAxes` survives on the READ (`OvertimePreapprovalRow`) because the server derives and
 * returns it — it is a fact about which resolved thresholds the request crosses, not a stored
 * column, and that is the right place for it. It is simply not an input.
 *
 * **[amendment owed: SPEC-TIME §4.8 — reconcile its proposed columns against §7.12's shipped ones.]**
 */
export interface CreateOvertimePreapprovalInput {
  employmentId: string;
  requestKind: "advance" | "retroactive" | "standing";
  coversFrom: string;
  coversTo: string;
  requestedHours: number;
  /** The shifts this overtime will be worked on. The live scope; see the note above. */
  shiftIds?: string[];
  reasonCategoryId?: string | null;
  reasonNote: string;
}

/**
 * Raise a request. The RPC opens the `overtime_preapproval` workflow instance itself — the same
 * shape `hr_time_adjustment_create` uses for `timecard_correction`, so a client never orchestrates
 * a two-step create-then-request that could half-fail.
 *
 * Refuses at validate when the assignment is FLSA-exempt, when the employment is not active, when
 * the date is inside a locked period, or when estimated hours are not above zero — with the reason
 * NAMED, never a bare refusal.
 */
export function createOvertimePreapproval(
  input: CreateOvertimePreapprovalInput,
  opts?: HrRpcOptions,
): Promise<OvertimePreapprovalRow> {
  return callHrTimeRpc<OvertimePreapprovalRow>(
    "hr_overtime_preapproval_create",
    {
      p_employment_id: input.employmentId,
      p_request_kind: input.requestKind,
      p_covers_from: input.coversFrom,
      p_covers_to: input.coversTo,
      p_requested_hours: input.requestedHours,
      p_reason_category_id: input.reasonCategoryId ?? null,
      p_reason_note: input.reasonNote,
      p_shift_ids: input.shiftIds ?? [],
    },
    opts,
  );
}

export interface OvertimeDecisionInput {
  /** The workflow STEP, not the request. The engine owns the routing; we answer its step. */
  stepId: string;
  decision: "approve" | "reject";
  /**
   * 🚨 The CAP. Approving with fewer hours than requested is a first-class outcome, and the cap is
   * what later intervals are matched against (§4.4). Overtime beyond the cap lands in §4.6's
   * paid-and-flagged lane exactly as unapproved overtime does.
   */
  approvedHours?: number | null;
  reason: string;
}

/**
 * 🚨 THE ONLY APPROVAL WRITER IN THIS LANE. `hr_wf_decide` is the shared engine's decision RPC and
 * is the sole path by which an overtime request changes state. There is no second door.
 *
 * `ot_preapproval_wf_conflict` re-runs at EVERY decision, not just at submit — the employment may
 * have terminated, the date may have entered a locked period, the week's hours may already have
 * crossed the threshold on their own, or a competing approval may already cover the window. A
 * conflict arrives as `WF_CONFLICT` and shows the approver exactly what changed; **it never
 * silently rejects.**
 */
export function decideOvertimePreapproval(
  input: OvertimeDecisionInput,
  opts?: HrRpcOptions,
): Promise<{ stepId: string; instanceState: string; conflict?: Record<string, unknown> }> {
  return callHrTimeRpc(
    "hr_wf_decide",
    {
      p_step_id: input.stepId,
      p_decision: input.decision,
      p_reason: input.reason,
      p_payload: { approved_hours: input.approvedHours ?? null },
    },
    opts,
  );
}

// ---------------------------------------------------------------------------------------------
// The HTTP engine lane — E-55
// ---------------------------------------------------------------------------------------------

export interface EvaluateOvertimeInput {
  organizationId: string;
  employmentId: string;
  /** The evaluation instant. The workweek is DERIVED by the server, never passed by a client. */
  asOf: string;
  includeScheduled?: boolean;
}

/**
 * E-55 `POST /hr/time/overtime/evaluate` — synchronous, one employment, cheap enough for a clock
 * screen to call on every punch.
 *
 * Everything it returns is the server's: the thresholds, the grace minutes and whether pre-approval
 * is required at all are **knobs the endpoint resolves**, and the client never carries a default
 * for any of them.
 */
export async function evaluateOvertime(
  input: EvaluateOvertimeInput,
  opts?: { mockCase?: HrFixtureCase },
) {
  const { data } = await hrApiPost(
    "/hr/time/overtime/evaluate",
    {
      organization_id: input.organizationId,
      employment_id: input.employmentId,
      as_of: input.asOf,
      include_scheduled: input.includeScheduled ?? true,
    },
    opts,
  );
  return data;
}

export type OvertimeEvaluation = Awaited<ReturnType<typeof evaluateOvertime>>;
