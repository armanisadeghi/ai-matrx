import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { HrTaskInbox } from "@/features/hr/tasks/components/HrTaskInbox";
import type { HrInboxScope } from "@/features/hr/tasks/types";

/**
 * Route 64 — THE one HR task inbox (SPEC-UI-IA §5.9).
 *
 * There is exactly one of these. Every pillar routes its actionable items here;
 * a second HR inbox at any other path is a defect, not a variant.
 */
export const metadata = { title: "HR tasks" };

export default async function HrTasksPage({
    searchParams,
}: {
    searchParams: Promise<{ scope?: string }>;
}) {
    const { scope } = await searchParams;
    const initial: HrInboxScope =
        scope === "team" || scope === "queue" ? scope : "mine";

    return (
        <>
            <PageHeader>
                <h1 className="text-sm font-semibold">HR tasks</h1>
            </PageHeader>
            <div className="h-full overflow-hidden">
                <Suspense
                    fallback={
                        <div className="h-full animate-pulse bg-card/40" aria-label="Loading your HR inbox" />
                    }
                >
                    <HrTaskInbox initialScope={initial} />
                </Suspense>
            </div>
        </>
    );
}
