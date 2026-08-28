/**
 * features/hr/leave/manager/useLeaveQueue.ts — SPEC-LEAVE §4.4's read, and only its read.
 *
 * 🚨 `/hr/leave` IS A PROJECTION OF `hr.workflow_step`, NOT A SECOND QUEUE.
 * §4.4, verbatim: *"It is a projection of `hr.workflow_step`; it is not a second queue, and
 * every action on it is `hr.wf_decide`."* So this hook calls the SAME `public.hr_wf_inbox`
 * door `/hr/tasks` calls, through the SAME `features/hr/tasks/service.ts`, filtered to the two
 * leave flow keys. It stores nothing, ranks nothing of its own, and defines no state. A second
 * queue — or a second decision path — is the defect §4.4 exists to prevent.
 *
 * 🚨 THE INBOX DOOR TAKES ONE `flow_key`, SO THIS MAKES TWO CALLS.
 * `hr.wf_pending` reads `p_filters ->> 'flow_key'` as a single value (verified live
 * 2026-08-27). `leave_request` and `leave_cancellation` are both leave decisions, so both are
 * fetched and merged. Fetching everything and filtering in the browser would pull an approver's
 * termination and pay-change steps into a page that has no business holding them.
 *
 * 🚨 AND THE LEAVE FACTS COME FROM `hr_my_time_off`, WHICH IS THE ONLY DOOR THAT HAS THEM.
 * The inbox row carries the step, the flow, the due date and the subject's name — never the
 * dates, the hours, the balance or the `conflict_check` findings §4.4 puts on every row.
 * `hr.my_time_off(<the subject's employment>)` returns exactly those, and reaches a report
 * because `hr._leave_viewer` grants `delegated` to a holder of `working_record.read` on that
 * employment. One read per distinct subject, in parallel, matched back by
 * `workflow_instance_id`.
 *
 * A subject whose hydration is refused keeps its row: the step is still decidable, and the
 * columns that would have carried leave facts say so rather than rendering blank. An approval
 * queue that drops rows it could not decorate is the one lie it must never tell.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchHrInbox } from "@/features/hr/tasks/service";
import { isRefusal } from "@/features/hr/tasks/types";
import type {
  HrInbox,
  HrInboxRow,
  HrInboxScope,
  HrRefusal,
} from "@/features/hr/tasks/types";

import { fetchMyTimeOff } from "../api/service";
import type { MyLeaveRequest } from "../api/types";

/** The two flow types SPEC-LEAVE §0 declares. This lane declares no third. */
export const LEAVE_FLOW_KEYS = ["leave_request", "leave_cancellation"] as const;

export type LeaveQueueRow = HrInboxRow & {
  /**
   * The leave request behind the step, or `null` when the subject's leave could not be read
   * (a restricted-tier row whose subject is withheld, or a viewer with no reach on that
   * employment). Null means WITHHELD, never "there is no request".
   */
  request: MyLeaveRequest | null;
};

export type LeaveQueueState = {
  /** Steps waiting on THIS person, decorated. Pending by definition — a step is active. */
  mine: LeaveQueueRow[];
  /** Steps waiting on somebody else, for the `team` and `queue` scopes. Not decidable here. */
  others: LeaveQueueRow[];
  /** The inbox envelope's own metadata — `bulk_max`, `can_view_queue`, `as_of`. */
  meta: HrInbox | null;
  refusal: HrRefusal | null;
  error: string | null;
  loading: boolean;
  /** True when at least one subject's leave facts could not be read. Said out loud on screen. */
  partiallyHydrated: boolean;
};

const INITIAL: LeaveQueueState = {
  mine: [],
  others: [],
  meta: null,
  refusal: null,
  error: null,
  loading: true,
  partiallyHydrated: false,
};

function dedupeBySteps(rows: HrInboxRow[]): HrInboxRow[] {
  const seen = new Set<string>();
  const out: HrInboxRow[] = [];
  for (const row of rows) {
    if (seen.has(row.step_id)) continue;
    seen.add(row.step_id);
    out.push(row);
  }
  return out;
}

export function useLeaveQueue(scope: HrInboxScope) {
  const [state, setState] = useState<LeaveQueueState>(INITIAL);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setState((s) => ({ ...s, loading: true }));

      try {
        const envelopes = await Promise.all(
          LEAVE_FLOW_KEYS.map((flowKey) => fetchHrInbox(scope, { flowKey })),
        );

        // A refusal on the FIRST call is the scope refusing (`no_queue_authority`) and is the
        // answer for the whole page. §5.9: a scope the caller may not use refuses rather than
        // returning an empty list that reads as "nothing waiting".
        const refused = envelopes.find(isRefusal);
        if (refused && isRefusal(refused)) {
          setState({ ...INITIAL, refusal: refused, loading: false });
          return;
        }

        const inboxes = envelopes.filter(
          (envelope): envelope is { granted: true; data: HrInbox } => !isRefusal(envelope),
        );
        const meta = inboxes[0]?.data ?? null;
        const mine = dedupeBySteps(inboxes.flatMap((e) => e.data.needs_my_decision));
        const others = dedupeBySteps(inboxes.flatMap((e) => e.data.scope_rows));

        // One hydration read per distinct subject, in parallel.
        const subjects = Array.from(
          new Set(
            [...mine, ...others]
              .map((row) => row.subject_employment_id)
              .filter((id): id is string => typeof id === "string" && id.length > 0),
          ),
        );

        const hydrations = await Promise.all(
          subjects.map(async (employmentId) => {
            const result = await fetchMyTimeOff({ employmentId });
            return { employmentId, result };
          }),
        );

        const byInstance = new Map<string, MyLeaveRequest>();
        let partiallyHydrated = false;
        for (const { result } of hydrations) {
          if (!result.ok) {
            partiallyHydrated = true;
            continue;
          }
          for (const request of result.data.requests) {
            if (request.workflowInstanceId) {
              byInstance.set(request.workflowInstanceId, request);
            }
          }
        }

        const decorate = (row: HrInboxRow): LeaveQueueRow => ({
          ...row,
          request: byInstance.get(row.instance_id) ?? null,
        });

        setState({
          mine: mine.map(decorate),
          others: others.map(decorate),
          meta,
          refusal: null,
          error: null,
          loading: false,
          partiallyHydrated,
        });
      } catch (cause) {
        setState({
          ...INITIAL,
          error:
            cause instanceof Error
              ? cause.message
              : "We could not load the time-off decisions waiting on you.",
          loading: false,
        });
      }
    },
    [scope],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
