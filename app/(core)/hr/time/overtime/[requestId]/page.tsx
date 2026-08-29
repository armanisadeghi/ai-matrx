import { Suspense } from "react";

import { HrTimeShell } from "@/features/hr/time/HrTimeShell";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { createRouteMetadata } from "@/utils/route-metadata";
import { OvertimeRequestPage } from "@/features/hr/time/overtime/components/OvertimePages";
import { notFound } from "next/navigation";
import { isFullUuid } from "@/utils/supabase-search";

/**
 * Route 31b — `/hr/time/overtime/[requestId]` (SPEC-UI-IA §3.4, D24a).
 *
 * ONE route and ONE component for both sides: the employee's request view and the manager's
 * decision view are the same panel with `viewer` swapped, resolved from the caller's relationship
 * to the subject rather than from the URL.
 *
 * The subject's NAME is deliberately kept out of the tab title. A browser tab reading "Dana Ruiz |
 * Time" discloses whose overtime is being reviewed to anyone glancing at the screen, and this
 * surface can carry a corrective-action door.
 */
export const metadata = createRouteMetadata("/hr/time/overtime", {
  titlePrefix: "Overtime request",
  title: "Time",
  description:
    "One overtime request: the thresholds it would cross, the decision trail, and what happens if the hours are worked anyway.",
});

export default async function HrTimeOvertimeRequestRoute({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;

  // 🚨 A MALFORMED ID IN THE URL IS REFUSED HERE, BEFORE ANY READ. Postgres casts
  // the route text to `uuid` inside the door and raises `22P02`, which reached the
  // person as a sentence about a value in the wrong format — on a READ, with no
  // form on screen and nothing to save (D11). The three `/hr/people/[employeeId]`
  // routes were guarded on 2026-08-28; the other nine dynamic HR routes were not.
  if (!isFullUuid(requestId)) notFound();
  return (
    <HrTimeShell title="Overtime request">
      <Suspense fallback={<HrLoading variant="panel" rows={6} />}>
        <OvertimeRequestPage requestId={requestId} />
      </Suspense>
    </HrTimeShell>
  );
}
