import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { createRouteMetadata } from "@/utils/route-metadata";
import { OvertimeRequestPage } from "@/features/hr/time/overtime/components/OvertimePages";

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
    return (
        <>
            <PageHeader>
                <h1 className="text-sm font-semibold">Overtime request</h1>
            </PageHeader>
            <div className="h-full overflow-hidden">
                <Suspense
                    fallback={
                        <div className="h-full animate-pulse bg-card/40" aria-label="Loading this request" />
                    }
                >
                    <OvertimeRequestPage requestId={requestId} />
                </Suspense>
            </div>
        </>
    );
}
