import { Suspense } from "react";

import { HrTimeShell } from "@/features/hr/time/HrTimeShell";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { createRouteMetadata } from "@/utils/route-metadata";
import { PeriodDetailPage } from "@/features/hr/time/periods/components/PeriodDetailPage";
import { notFound } from "next/navigation";
import { isFullUuid } from "@/utils/supabase-search";

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

  // 🚨 A MALFORMED ID IN THE URL IS REFUSED HERE, BEFORE ANY READ. Postgres casts
  // the route text to `uuid` inside the door and raises `22P02`, which reached the
  // person as a sentence about a value in the wrong format — on a READ, with no
  // form on screen and nothing to save (D11). The three `/hr/people/[employeeId]`
  // routes were guarded on 2026-08-28; the other nine dynamic HR routes were not.
  if (!isFullUuid(periodId)) notFound();
  return (
    <HrTimeShell title="Pay period">
      <Suspense fallback={<HrLoading variant="panel" rows={8} />}>
        <PeriodDetailPage payPeriodId={periodId} />
      </Suspense>
    </HrTimeShell>
  );
}
