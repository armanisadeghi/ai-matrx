"use client";

/**
 * features/hr/time/overtime/api/overtimeReads.ts — the D24a lane's two transports.
 *
 * THE SPLIT, AND WHY IT IS NOT NEGOTIABLE (SPEC-CONTRACTS §3.2's D24a note):
 *
 *  • **The approval itself is `direct`** — an ordinary workflow instance through the ONE engine.
 *    🚨 Decisions go through `hr_wf_decide` and nothing else. This lane defines no approvals table,
 *    no approver column, no reminder job and no second inbox (SPEC-TIME §0 law 5). The server says
 *    so in the list envelope itself: `decision_door: 'hr_wf_decide'`.
 *
 *  • **The threshold evaluation is `server`** — E-55 `POST /hr/time/overtime/evaluate`. It reads the
 *    live punch stream and resolves jurisdiction rules as of each work date, and must produce the
 *    same answer for the clock UI, the alerting worker and the workflow's `validate_fn`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🚨 MAPPED, NOT CAST. `callHrTimeRpc<T>` camelizes and then casts, and a cast cannot fail. Mapping
 * these four seams against the live function bodies (2026-08-26) found **three call sites that
 * could never have worked**, all of which a cast had been hiding:
 *
 *   1. `hr_overtime_preapproval_get` takes **`p_preapproval_id`**. This file passed `p_request_id`.
 *   2. `hr_overtime_preapproval_create` takes
 *      `(p_employment_id, p_covers_from, p_covers_to, p_requested_hours, p_request_kind,
 *        p_reason_category_id, p_reason_note, p_shift_ids)`.
 *      This file passed `p_position_assignment_id` and `p_threshold_axes` — **neither parameter
 *      exists** — and omitted `p_shift_ids` entirely.
 *   3. `threshold_axes` is not a column. The server reads it out of `calc -> 'threshold_axes'`.
 *
 * Each would have failed as PGRST202 the first time a real user pressed the button.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🚨 E-55 IS ALWAYS `prospective`. It projects; it never writes hours. The authoritative overtime
 * answer is E-03 against a closed workweek — a projection stored as evidence is how a wage claim
 * gets an answer we cannot defend.
 *
 * 🚨 NOTHING IN ANY RESPONSE HERE CAN SUPPRESS PAY. The server ships `payment_withheld: false` and
 * a `payment_note` on every row, and this lane surfaces both rather than paraphrasing them.
 */

import { hrApiPost } from "@/lib/api/hr-contract-client";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { callHrTimeRpc, type HrRpcOptions } from "../../api/rpc";
import type {
  CalcBlock,
  OvertimePreapprovalState,
  PageRequest,
  Paged,
} from "../../api/types";
import type { WorkflowRef } from "../../periods/api/periodReads";

// ---------------------------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------------------------

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function numOrNull(value: unknown): number | null {
  if (typeof value === "number") return value;
  // `numeric` arrives as a string. Parsing a server-computed value is not computing one.
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}
function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function mapWorkflow(raw: unknown): { open: WorkflowRef[]; history: WorkflowRef[] } {
  const w = rec(raw);
  const list = (v: unknown): WorkflowRef[] =>
    (Array.isArray(v) ? v : []).map((entry) => {
      const e = rec(entry);
      return {
        instanceId: str(e.instanceId),
        flowKey: str(e.flowKey),
        state: str(e.state),
        deepLink: strOrNull(e.deepLink),
      };
    });
  return { open: list(w.open), history: list(w.history) };
}

function mapCalc(raw: unknown): CalcBlock {
  const c = rec(raw);
  return {
    ruleVersionIds: strArray(c.ruleVersionIds),
    engineKey: strOrNull(c.engineKey),
    engineVersion: strOrNull(c.engineVersion),
    computedAt: strOrNull(c.computedAt),
    calc: rec(c.calc),
  };
}

/**
 * One overtime request, mapped from `hr._time_ot_preapproval_json`.
 *
 * This shape is the lane's own rather than `types.ts`'s `OvertimePreapprovalRow`, because the live
 * payload carries four members that type does not declare — `workflow`, `shiftIds`, `paymentNote`
 * and `paymentWithheld` — and two of those are load-bearing. `types.ts` is deliberately not
 * rewritten: three lanes are mid-build against it, and rewriting it would not settle which side is
 * right. When the two are reconciled this interface collapses into it.
 */
export interface OvertimeRequestRow {
  id: string;
  employmentId: string;
  employeeDisplayName: string;
  workweekId: string | null;
  requestedByName: string | null;
  requestKind: "advance" | "retroactive" | "standing";
  coversFrom: string;
  coversTo: string;
  requestedHours: number | null;
  /** Below `requestedHours` when approved with a cap. The cap is what intervals match against. */
  approvedHours: number | null;
  reasonCategoryId: string | null;
  reasonNote: string | null;
  shiftIds: string[];
  state: OvertimePreapprovalState;
  workflowInstanceId: string | null;
  /**
   * 🚨 THE DECISION DOOR. `workflow.open[0].deepLink` is `/hr/tasks/<instanceId>` — the ONE HR task
   * inbox, which is where an overtime decision is actually taken. This lane builds no second
   * decision store, and the server's own `decision_note` says the same thing.
   */
  workflow: { open: WorkflowRef[]; history: WorkflowRef[] };
  decidedAt: string | null;
  decidedByName: string | null;
  actualOtHours: number | null;
  varianceHours: number | null;
  unapprovedOtFlagged: boolean;
  correctiveActionId: string | null;
  /** Resolved threshold axes, read by the server out of `calc -> 'threshold_axes'`. */
  thresholdAxes: string[];
  /**
   * 🚨 The server's own sentence: *"Overtime that is worked is PAID whether or not this request was
   * approved."* Rendered verbatim wherever a decision is shown — never paraphrased away.
   */
  paymentNote: string | null;
  /** Ships `false`, always. It exists so the absence of withholding is explicit rather than assumed. */
  paymentWithheld: boolean;
  calc: CalcBlock;
}

function mapOvertimeRequest(raw: unknown): OvertimeRequestRow {
  const r = rec(raw);
  return {
    id: str(r.id),
    employmentId: str(r.employmentId),
    employeeDisplayName: str(r.employeeDisplayName),
    workweekId: strOrNull(r.workweekId),
    requestedByName: strOrNull(r.requestedByName),
    requestKind: (str(r.requestKind) || "advance") as OvertimeRequestRow["requestKind"],
    coversFrom: str(r.coversFrom),
    coversTo: str(r.coversTo),
    requestedHours: numOrNull(r.requestedHours),
    approvedHours: numOrNull(r.approvedHours),
    reasonCategoryId: strOrNull(r.reasonCategoryId),
    reasonNote: strOrNull(r.reasonNote),
    shiftIds: strArray(r.shiftIds),
    state: str(r.state) as OvertimePreapprovalState,
    workflowInstanceId: strOrNull(r.workflowInstanceId),
    workflow: mapWorkflow(r.workflow),
    decidedAt: strOrNull(r.decidedAt),
    decidedByName: strOrNull(r.decidedByName),
    actualOtHours: numOrNull(r.actualOtHours),
    varianceHours: numOrNull(r.varianceHours),
    unapprovedOtFlagged: r.unapprovedOtFlagged === true,
    correctiveActionId: strOrNull(r.correctiveActionId),
    thresholdAxes: strArray(r.thresholdAxes),
    paymentNote: strOrNull(r.paymentNote),
    // 🚨 Only an explicit `true` from the server could ever make this true, and the server ships
    // `false`. Defaulting the other way would let a missing field read as "pay withheld".
    paymentWithheld: r.paymentWithheld === true,
    calc: mapCalc(r.calc),
  };
}

function mapPaged<T>(raw: unknown, mapRow: (row: unknown) => T): Paged<T> {
  const r = rec(raw);
  const rows = Array.isArray(r.rows) ? r.rows : [];
  return {
    rows: rows.map(mapRow),
    page: numOrNull(r.page) ?? 1,
    pageSize: numOrNull(r.pageSize) ?? rows.length,
    totalRows: numOrNull(r.totalRows) ?? rows.length,
    hasMore: r.hasMore === true,
  };
}

function pageArg(page: PageRequest): Record<string, unknown> {
  return { limit: page.pageSize, offset: Math.max(0, (page.page - 1) * page.pageSize) };
}

// ---------------------------------------------------------------------------------------------
// The RPC lane
// ---------------------------------------------------------------------------------------------

export interface OvertimeListFilters {
  state?: OvertimePreapprovalState[];
  employmentId?: string | null;
  requestKind?: Array<"advance" | "retroactive" | "standing">;
  from?: string | null;
  to?: string | null;
  /** 🚨 Paid-and-flagged rows. A filter over a management flag, never a payment state. */
  unapprovedOtFlagged?: boolean;
}

function filterArg(filters: OvertimeListFilters): Record<string, unknown> {
  // Snake_case: the SQL body reads `f ->> 'employment_id'`. Only keys the server actually reads are
  // sent — an unread key looks like a working filter and silently filters nothing.
  const out: Record<string, unknown> = {};
  if (filters.state && filters.state.length > 0) out.state = filters.state;
  if (filters.employmentId) out.employment_id = filters.employmentId;
  if (filters.requestKind && filters.requestKind.length > 0) out.request_kind = filters.requestKind;
  if (filters.from) out.from = filters.from;
  if (filters.to) out.to = filters.to;
  if (filters.unapprovedOtFlagged !== undefined) {
    out.unapproved_ot_flagged = filters.unapprovedOtFlagged;
  }
  return out;
}

/** Route 31a's queue read. Fully paginated — LAW 3. Requested rows sort first, server-side. */
export async function listOvertimePreapprovals(
  filters: OvertimeListFilters,
  page: PageRequest,
  opts?: HrRpcOptions,
): Promise<Paged<OvertimeRequestRow>> {
  const raw = await callHrTimeRpc<unknown>(
    "hr_overtime_preapproval_list",
    { p_filters: filterArg(filters), p_page: pageArg(page) },
    opts,
  );
  return mapPaged(raw, mapOvertimeRequest);
}

/** Route 31b's read. One request, whichever viewer is looking at it. */
export async function getOvertimePreapproval(
  preapprovalId: string,
  opts?: HrRpcOptions,
): Promise<OvertimeRequestRow> {
  const raw = await callHrTimeRpc<unknown>(
    "hr_overtime_preapproval_get",
    // 🚨 `p_preapproval_id`. It was `p_request_id` here, which is not a parameter of this function.
    { p_preapproval_id: preapprovalId },
    opts,
  );
  return mapOvertimeRequest(raw);
}

export interface CreateOvertimePreapprovalInput {
  employmentId: string;
  requestKind: "advance" | "retroactive" | "standing";
  coversFrom: string;
  coversTo: string;
  requestedHours: number;
  reasonCategoryId?: string | null;
  reasonNote: string;
  /** The shifts this request covers. The server stores these; there is no position-assignment arg. */
  shiftIds?: string[];
}

/**
 * Raise a request. The RPC opens the `overtime_preapproval` workflow instance itself — the same
 * shape `hr_time_adjustment_create` uses, so a client never orchestrates a two-step create-then-
 * request that could half-fail.
 *
 * Refuses at validate when the assignment is FLSA-exempt, when the employment is not active, when
 * the date is inside a locked period, or when estimated hours are not above zero — with the reason
 * NAMED, never a bare refusal.
 */
export async function createOvertimePreapproval(
  input: CreateOvertimePreapprovalInput,
  opts?: HrRpcOptions,
): Promise<OvertimeRequestRow> {
  const raw = await callHrTimeRpc<unknown>(
    "hr_overtime_preapproval_create",
    {
      p_employment_id: input.employmentId,
      p_covers_from: input.coversFrom,
      p_covers_to: input.coversTo,
      p_requested_hours: input.requestedHours,
      p_request_kind: input.requestKind,
      p_reason_category_id: input.reasonCategoryId ?? null,
      p_reason_note: input.reasonNote,
      p_shift_ids: input.shiftIds ?? [],
    },
    opts,
  );
  return mapOvertimeRequest(raw);
}

export interface OvertimeDecisionInput {
  /** The workflow STEP, not the request. The engine owns the routing; we answer its step. */
  stepId: string;
  decision: "approve" | "reject";
  /**
   * 🚨 The CAP. Approving with fewer hours than requested is a first-class outcome, and the cap is
   * what later intervals are matched against. Overtime beyond the cap lands in the paid-and-flagged
   * lane exactly as unapproved overtime does — it is never withheld.
   */
  approvedHours?: number | null;
  reason: string;
}

export interface OvertimeDecisionResult {
  ok: boolean;
  instanceState: string | null;
  /**
   * 🚨 Shown to the approver, never swallowed. `ot_preapproval_wf_conflict` re-runs at EVERY
   * decision — the employment may have terminated, the date may have entered a locked period, or a
   * competing approval may already cover the window. A conflict never silently rejects.
   */
  conflict: Record<string, unknown> | null;
}

/**
 * 🚨 THE ONLY APPROVAL WRITER IN THIS LANE. `hr_wf_decide` is the shared engine's decision RPC and
 * is the sole path by which an overtime request changes state. There is no second door, and the
 * server's list envelope names this function explicitly as `decision_door`.
 */
export async function decideOvertimePreapproval(
  input: OvertimeDecisionInput,
  opts?: HrRpcOptions,
): Promise<OvertimeDecisionResult> {
  const raw = await callHrTimeRpc<unknown>(
    "hr_wf_decide",
    {
      p_step_id: input.stepId,
      p_decision: input.decision,
      p_reason: input.reason,
      p_payload: { approved_hours: input.approvedHours ?? null },
    },
    opts,
  );
  const r = rec(raw);
  const conflict = rec(r.conflict);
  return {
    ok: r.ok !== false,
    instanceState: strOrNull(r.instanceState) ?? strOrNull(r.state),
    conflict: Object.keys(conflict).length > 0 ? conflict : null,
  };
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
 * is required at all are **knobs the endpoint resolves**, and the client carries no default for any
 * of them. This one is left typed by the generated contract rather than hand-mapped, because unlike
 * the RPC lane it IS generated — from `hr-contracts.openapi.json` — so the compiler is already
 * checking it and a hand mapper would only add a second opinion.
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
