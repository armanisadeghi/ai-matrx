import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { PeriodDetailPage } from "@/features/hr/time/periods/components/PeriodDetailPage";

/**
 * Route 33 — `/hr/time/periods/[periodId]` (SPEC-UI-IA §3.4).
 *
 * One period: approval progress across two distinct state machines, the boundary-weeks panel, the
 * payroll-export runs with their delivery states, and the post-lock adjustment lane.
 */
export const metadata = { title: "Pay period" };

export default async function HrTimePeriodRoute({
    params,
}: {
    params: Promise<{ periodId: string }>;
}) {
    const { periodId } = await params;
    return (
        <>
            <PageHeader>
                <h1 className="text-sm font-semibold">Pay period</h1>
            </PageHeader>
            <div className="h-full overflow-hidden">
                <Suspense
                    fallback={
                        <div className="h-full animate-pulse bg-card/40" aria-label="Loading this pay period" />
                    }
                >
                    <PeriodDetailPage payPeriodId={periodId} />
                </Suspense>
            </div>
        </>
    );
}
