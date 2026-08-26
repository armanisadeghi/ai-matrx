import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { createRouteMetadata } from "@/utils/route-metadata";
import { PayPeriodsPage } from "@/features/hr/time/periods/components/PayPeriodsPage";

/**
 * Route 32 — `/hr/time/periods` (SPEC-UI-IA §3.4). The pay-period state machine per pay group,
 * plus the org-wide export history that row 32 also names.
 *
 * Metadata goes through `createRouteMetadata` — the identifier `scripts/check-route-metadata.ts`
 * recognises. The tab-title rule is the SPECIFIC word first and the category last, so this reads
 * "Pay periods | Time": a payroll administrator with nine tabs open finds theirs by the first word.
 */
export const metadata = createRouteMetadata("/hr/time/periods", {
    titlePrefix: "Pay periods",
    title: "Time",
    description:
        "Every pay group's periods and where each one is in its lifecycle, with the payroll files this employer has produced.",
});

export default function HrTimePeriodsRoute() {
    return (
        <>
            <PageHeader>
                <h1 className="text-sm font-semibold">Pay periods</h1>
            </PageHeader>
            <div className="h-full overflow-hidden">
                <Suspense
                    fallback={
                        <div className="h-full animate-pulse bg-card/40" aria-label="Loading pay periods" />
                    }
                >
                    <PayPeriodsPage />
                </Suspense>
            </div>
        </>
    );
}
