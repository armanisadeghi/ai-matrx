"use client";

/**
 * features/hr/time/overtime/components/OvertimePages.tsx — routes 31a and 31b's client bodies.
 *
 * 🚨 NO ALERT EVER APPEARS ON THE KIOSK. These surfaces live in `(core)` under the app shell and
 * behind the operator's own login; the `(kiosk)` group has no route to any other HR surface and no
 * personal notification surface at all. The employee's own channels carry their alert.
 */

import { useRouter } from "next/navigation";

import { useHrContext } from "@/features/hr/shared/useHrContext";
import { hrTimeOvertimeRequestHref } from "@/features/hr/routes";
import { useMockCase } from "../../periods/components/PayPeriodsPage";
import { useOvertimeEvaluation, useOvertimeQueue, useOvertimeRequest } from "../hooks/useOvertimeQueue";
import { ApproachingWatchlist } from "./ApproachingWatchlist";
import { OvertimeQueueTable } from "./OvertimeQueueTable";
import { OvertimeRequestPanel } from "./OvertimeRequestPanel";

export function OvertimeQueuePage() {
  const hr = useHrContext();
  const mockCase = useMockCase();
  const queue = useOvertimeQueue({}, mockCase);
  const router = useRouter();

  const organizationId = hr.active?.organization_id ?? null;
  // One watched employment in this build: the queue's first row. The scan that produces the full
  // watchlist is E-56 on the dedicated worker lane, and it is not this lane's to run.
  const watched = queue.page?.rows[0] ?? null;
  const evaluation = useOvertimeEvaluation(
    { organizationId, employmentId: watched?.employmentId ?? null },
    mockCase,
  );

  return (
    <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
      <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <header>
          <h1 className="text-base font-semibold text-foreground">Overtime pre-approval</h1>
          <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
            Requests awaiting a decision, and who is close to crossing an overtime threshold.
            Pre-approval decides whether overtime should be <em>worked</em>. It never decides whether
            it is paid — overtime that is worked is paid, approved or not.
          </p>
        </header>

        {queue.failure ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {queue.failure.userMessage}
          </p>
        ) : null}

        <ApproachingWatchlist
          entries={
            watched && evaluation.evaluation
              ? [
                  {
                    employmentId: watched.employmentId,
                    displayName: watched.employeeDisplayName,
                    evaluation: evaluation.evaluation,
                  },
                ]
              : []
          }
          isLoading={evaluation.isLoading}
          onRaiseRequest={({ employmentId }) => {
            // The door from an alert. Pre-filling happens on the request surface itself.
            router.push(hrTimeOvertimeRequestHref(employmentId, hr.orgRef));
          }}
        />

        <OvertimeQueueTable
          rows={queue.page?.rows ?? []}
          isLoading={queue.isLoading}
          hrefFor={(row) => hrTimeOvertimeRequestHref(row.id, hr.orgRef)}
        />
      </div>
    </div>
  );
}

export function OvertimeRequestPage({ requestId }: { requestId: string }) {
  const hr = useHrContext();
  const mockCase = useMockCase();
  const { request, isLoading, failure, reload } = useOvertimeRequest(requestId, mockCase);
  const organizationId = hr.active?.organization_id ?? null;
  const evaluation = useOvertimeEvaluation(
    { organizationId, employmentId: request?.employmentId ?? null },
    mockCase,
  );

  /**
   * 🚨 `viewer` IS DERIVED FROM THE CALLER'S RELATIONSHIP TO THE SUBJECT, NEVER FROM THE URL. A
   * query parameter here would let anybody hand themselves the decision view of somebody else's
   * request, and the server would refuse the write — but the SURFACE would have already shown a
   * manager's view of another person's overtime, which is the disclosure, not the write.
   */
  const viewer = hr.capabilities.includes("time.overtime_approve") ? "manager" : "employee";

  return (
    <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
      <div className="mx-auto max-w-[900px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        {failure ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {failure.userMessage}
          </p>
        ) : null}

        {isLoading && !request ? (
          <div className="rounded-lg border border-border bg-card p-4 text-[12px] text-muted-foreground">
            Loading this request…
          </div>
        ) : null}

        {request ? (
          <OvertimeRequestPanel
            request={request}
            viewer={viewer}
            evaluation={evaluation.evaluation}
            decidableStepId={viewer === "manager" ? request.workflowInstanceId : null}
            canOpenCorrectiveAction={hr.capabilities.includes("employee_relations.write")}
            openDisputeNote={null}
            mockCase={mockCase}
            onDecided={reload}
          />
        ) : null}
      </div>
    </div>
  );
}
