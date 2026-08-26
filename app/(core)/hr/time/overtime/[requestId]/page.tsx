import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { OvertimeRequestPage } from "@/features/hr/time/overtime/components/OvertimePages";

/**
 * Route 31b — `/hr/time/overtime/[requestId]` (SPEC-UI-IA §3.4, D24a).
 *
 * ONE route and ONE component for both sides: the employee's request view and the manager's
 * decision view are the same panel with `viewer` swapped, resolved from the caller's relationship
 * to the subject rather than from the URL.
 */
export const metadata = { title: "Overtime request" };

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
