import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { PayPeriodsPage } from "@/features/hr/time/periods/components/PayPeriodsPage";

/** Route 32 — `/hr/time/periods` (SPEC-UI-IA §3.4). The pay-period state machine per pay group. */
export const metadata = { title: "Pay periods" };

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
