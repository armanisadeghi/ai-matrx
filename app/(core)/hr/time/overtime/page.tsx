import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { OvertimeQueuePage } from "@/features/hr/time/overtime/components/OvertimePages";

/**
 * Route 31a — `/hr/time/overtime` (SPEC-UI-IA §3.4, D24a).
 *
 * The pre-approval queue and the approaching-overtime watchlist. Unapproved overtime is still PAID:
 * it renders as flagged for review, never as unpaid or withheld.
 */
export const metadata = { title: "Overtime pre-approval" };

export default function HrTimeOvertimeRoute() {
    return (
        <>
            <PageHeader>
                <h1 className="text-sm font-semibold">Overtime pre-approval</h1>
            </PageHeader>
            <div className="h-full overflow-hidden">
                <Suspense
                    fallback={
                        <div className="h-full animate-pulse bg-card/40" aria-label="Loading overtime requests" />
                    }
                >
                    <OvertimeQueuePage />
                </Suspense>
            </div>
        </>
    );
}
