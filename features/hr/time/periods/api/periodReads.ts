/**
 * features/hr/time/periods/api/periodReads.ts — the pay-period LIST/GET reads for routes 32 and 33.
 *
 * WHY THIS FILE EXISTS BESIDE `features/hr/time/api/service.ts` RATHER THAN INSIDE IT
 * ----------------------------------------------------------------------------------
 * The shared service module is a different agent's file in a shared checkout, and these three reads
 * are wholly this lane's. They still go through **the one door** — `callHrTimeRpc` — so there is no
 * second transport, no second error class and no second mock lane. Fold them into `service.ts` the
 * day the wrappers land and `pnpm db-types` gives them generated `Returns` types; until then the
 * split keeps two agents out of one file.
 *
 * 🚨 THREE RPC NAMES WERE ADDED TO THE CLOSED UNION IN `../../api/rpc.ts` FOR THIS FILE
 * (`hr_pay_period_list`, `hr_pay_period_get`, `hr_time_adjustment_list`), plus three more for the
 * overtime lane. That union is deliberately closed so a typo is a compile error; extending it is the
 * only way to add a read without opening a second door, and a second door is the defect the union
 * exists to prevent. None of these RPCs exists yet — neither does any other RPC in this lane.
 *
 * 🚨 NO CLIENT COMPUTES HOURS. Nothing here subtracts a timestamp, multiplies a rate or sums a
 * column. `counts`, `totalHours` and every OT figure arrive computed and snapshot-backed.
 */

"use client";

import { callHrTimeRpc, type HrRpcOptions } from "../../api/rpc";
import type {
  PageRequest,
  Paged,
  PayPeriodRow,
  PayPeriodState,
} from "../../api/types";

/** Which periods the list is asking for. Every member is the server's filter, never a client sort. */
export interface PayPeriodListFilters {
  payGroupId?: string | null;
  states?: PayPeriodState[];
  /** `period_end_on >= this`. */
  endingOnOrAfter?: string | null;
  endingOnOrBefore?: string | null;
  search?: string | null;
}

/**
 * Route 32's read — the pay-period state machine per pay group.
 *
 * Fully paginated: LAW 3 — a list a caller treats as complete is never a capped fetch, and a pay
 * group with four years of history has ~104 periods, comfortably past any silent cap.
 */
export function listPayPeriods(
  filters: PayPeriodListFilters,
  page: PageRequest,
  opts?: HrRpcOptions,
): Promise<Paged<PayPeriodRow>> {
  return callHrTimeRpc<Paged<PayPeriodRow>>(
    "hr_pay_period_list",
    { p_filters: filters, p_page: page },
    opts,
  );
}

/** Route 33's header read. One period, with its counts and its boundary workweeks. */
export function getPayPeriod(
  payPeriodId: string,
  opts?: HrRpcOptions,
): Promise<PayPeriodRow> {
  return callHrTimeRpc<PayPeriodRow>(
    "hr_pay_period_get",
    { p_pay_period_id: payPeriodId },
    opts,
  );
}

/**
 * One post-lock correction, as route 33 renders it.
 *
 * 🚨 The two period ids are the whole point and must never be collapsed into one column.
 * `originalPayPeriodId` is the **locked** period the correction belongs to; `targetPayPeriodId` is
 * the **next open** period it will actually be paid in. A surface that shows only one of them is
 * telling a payroll administrator that a locked period was rewritten, which is exactly what did not
 * happen and exactly what must never happen.
 *
 * ⚠️ HAND-WRITTEN, and owed to `features/hr/time/api/types.ts` when `hr_time_adjustment_list` lands
 * with a generated return type. It is not in the shared file today because the shared file's author
 * had no list read to type.
 */
export interface TimeAdjustmentRow {
  id: string;
  employmentId: string;
  employeeDisplayName: string;
  /** The LOCKED period this correction is tagged to. Never rewritten. */
  originalPayPeriodId: string;
  /** The NEXT OPEN period the correction is paid in. Never the same as the original. */
  targetPayPeriodId: string | null;
  targetPeriodLabel: string | null;
  workDate: string;
  earningCodeId: string;
  /** 🚨 The label, never the token — LAW 3a: no cell prints a type name. */
  earningCodeName: string;
  hoursDelta: number;
  /** Null where a contributing rule is advisory. `amountWithheld` sits beside it so null ≠ zero. */
  amountDelta: number | null;
  amountWithheld: boolean;
  reasonCategoryName: string | null;
  reasonNote: string;
  /** The `timecard_correction` instance. The workflow engine is the only approval engine. */
  workflowInstanceId: string | null;
  workflowState: string;
  createdAt: string;
  createdByName: string | null;
  /** Set once the adjustment has actually ridden an export. */
  exportedInExportId: string | null;
}

/**
 * The adjustments tagged to ONE period — route 33's post-lock lane.
 *
 * `p_original_pay_period_id` is deliberate: these are the corrections **belonging to** this period,
 * wherever they end up being paid. Asking by target would answer a different question.
 */
export function listTimeAdjustments(
  originalPayPeriodId: string,
  page: PageRequest,
  opts?: HrRpcOptions,
): Promise<Paged<TimeAdjustmentRow>> {
  return callHrTimeRpc<Paged<TimeAdjustmentRow>>(
    "hr_time_adjustment_list",
    { p_original_pay_period_id: originalPayPeriodId, p_page: page },
    opts,
  );
}
