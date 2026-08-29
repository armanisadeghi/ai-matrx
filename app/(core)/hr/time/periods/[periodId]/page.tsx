import { Suspense } from "react";

import { HrTimeShell } from "@/features/hr/time/HrTimeShell";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { createRouteMetadata } from "@/utils/route-metadata";
import { PeriodDetailPage } from "@/features/hr/time/periods/components/PeriodDetailPage";

/**
 * Route 33 — `/hr/time/periods/[periodId]` (SPEC-UI-IA §3.4).
 *
 * One period: approval progress across two distinct state machines, the boundary-weeks panel, the
 * payroll-export runs with their delivery states, and the post-lock adjustment lane.
 *
 * The period id is not in the tab title on purpose: a uuid is not a word anyone recognises, and the
 * period's own dates are not known until the client read resolves. "Pay period | Time" is honest and
 * findable; `createDynamicRouteMetadata` would only add a uuid.
 */
export const metadata = createRouteMetadata("/hr/time/periods", {
  titlePrefix: "Pay period",
  title: "Time",
  description:
    "One pay period: approval progress, its payroll export runs and their delivery states, and the corrections tagged to it after lock.",
});

export default async function HrTimePeriodRoute({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  const { periodId } = await params;
  return (
    <HrTimeShell title="Pay period">
      <Suspense fallback={<HrLoading variant="panel" rows={8} />}>
        <PeriodDetailPage payPeriodId={periodId} />
      </Suspense>
    </HrTimeShell>
  );
}
