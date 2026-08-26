import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { HrDecisionPanel } from "@/features/hr/tasks/components/HrDecisionPanel";

/**
 * The decision panel a notification's deep link lands on
 * (SPEC-WORKFLOW-ENGINE §6.2). It opens the exact actionable object with the
 * approve/reject control focused — never a list containing it.
 */
export const metadata = { title: "HR request" };

export default async function HrTaskInstancePage({
    params,
    searchParams,
}: {
    params: Promise<{ instanceId: string }>;
    searchParams: Promise<{ step?: string; notice?: string }>;
}) {
    const { instanceId } = await params;
    const { step, notice } = await searchParams;

    return (
        <>
            <PageHeader>
                <h1 className="text-sm font-semibold">HR request</h1>
            </PageHeader>
            <div className="h-full overflow-hidden">
                <Suspense
                    fallback={
                        <div className="h-full animate-pulse bg-card/40" aria-label="Loading this request" />
                    }
                >
                    <HrDecisionPanel
                        instanceId={instanceId}
                        stepId={step ?? null}
                        noticeId={notice ?? null}
                    />
                </Suspense>
            </div>
        </>
    );
}
