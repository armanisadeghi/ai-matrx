"use client";

/**
 * features/hr/time/timesheet/decisionSource.ts — the ONE source of "is there a decision to make on
 * this timecard?" (G2 round-5, T4).
 *
 * 🚨 WHAT WENT WRONG, AND WHY THE FIX IS A SOURCE CHANGE RATHER THAN A CONDITION CHANGE.
 * Route 29 decided whether to show approve/reject from `timesheet.attestation.stepId` — the
 * ATTESTATION step — and rendered "There is no open decision on this timecard right now" whenever
 * it was absent. Meanwhile a live attestation instance existed on that employment's period row: the
 * period page said "Awaiting decision 1" and the database agreed. **Two surfaces, two sources, two
 * different answers about the same row.**
 *
 * So this reads the exact projection the period page reads — `hr_pay_period_get`'s per-row
 * `workflow.rows[]` — and route 29 renders from it. That is S3's whole point: the two cannot
 * disagree again, because there is only one answer.
 *
 * 🚨 `health` IS THE FIELD THAT MATTERS, AND ROW STATE CANNOT SUBSTITUTE FOR IT. The SQL says so in
 * its own comment: *"an `open` row with a failed instance behind it reads identically to one with a
 * live instance, which is how a stuck period looked 'awaiting' for four rounds."* A timecard whose
 * flow is DEAD must not offer a decision control that will refuse — it must say the flow failed.
 */

import { callHrTimeRpc, type HrRpcOptions } from "../api/rpc";
import { arr, nstr, obj, str, type Live } from "./fromLiveTimesheet";

/**
 * The four states the workflow projection reports per row.
 *
 * `awaiting` — a live instance is waiting on a person. This is the only one that offers a decision.
 * `stuck`    — the instance exists and its flow has failed. Naming it is the whole point.
 * `no_flow`  — no instance has been opened for this row yet.
 * `done`     — decided.
 */
export type TimecardDecisionHealth = "awaiting" | "stuck" | "no_flow" | "done";

export interface TimecardDecisionState {
  health: TimecardDecisionHealth;
  rowState: string | null;
  flowKey: string | null;
  instanceId: string | null;
  instanceState: string | null;
  failureClass: string | null;
  /** The step to decide, when the projection carries one. */
  stepId: string | null;
}

/** Nothing is known — used before the read resolves and when the row is absent from the period. */
export const UNKNOWN_DECISION: TimecardDecisionState = {
  health: "no_flow",
  rowState: null,
  flowKey: null,
  instanceId: null,
  instanceState: null,
  failureClass: null,
  stepId: null,
};

function isHealth(value: string): value is TimecardDecisionHealth {
  return value === "awaiting" || value === "stuck" || value === "no_flow" || value === "done";
}

/**
 * Read one employment's decision state out of the period's workflow projection.
 *
 * The whole period is fetched because that is the read the period page already makes and the only
 * one that carries `health`. Asking for a narrower per-row read would mean a second contract that
 * could drift from this one — which is the defect being fixed, reintroduced.
 */
export async function getTimecardDecisionState(
  payPeriodId: string,
  employmentId: string,
  opts?: HrRpcOptions,
): Promise<TimecardDecisionState> {
  const payload = await callHrTimeRpc<unknown>(
    "hr_pay_period_get",
    { p_pay_period_id: payPeriodId },
    opts,
  );
  return pickDecisionState(payload, employmentId);
}

/** Exported for the mapper's own sake: the projection is nested and worth reading in one place. */
export function pickDecisionState(payload: unknown, employmentId: string): TimecardDecisionState {
  const live = obj(payload);
  const rows = arr(obj(live.workflow).rows);
  const mine = rows.find((r: Live) => str(r.employmentId) === employmentId);
  if (!mine) return UNKNOWN_DECISION;

  const health = str(mine.health, "no_flow");
  return {
    health: isHealth(health) ? health : "no_flow",
    rowState: nstr(mine.rowState),
    flowKey: nstr(mine.flowKey),
    instanceId: nstr(mine.instanceId),
    instanceState: nstr(mine.instanceState),
    failureClass: nstr(mine.failureClass),
    stepId: nstr(mine.stepId ?? obj(mine.routing).stepId),
  };
}
