import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { HrDecisionPanel } from "@/features/hr/tasks/components/HrDecisionPanel";
import { notFound } from "next/navigation";
import { isFullUuid } from "@/utils/supabase-search";

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
    searchParams: Promise<{ step?: string; notice?: string; failure?: string }>;
}) {
    const { instanceId } = await params;

    // 🚨 A MALFORMED ID IN THE URL IS REFUSED HERE, BEFORE ANY READ. Postgres casts
    // the route text to `uuid` inside the door and raises `22P02`, which reached the
    // person as a sentence about a value in the wrong format — on a READ, with no
    // form on screen and nothing to save (D11). The three `/hr/people/[employeeId]`
    // routes were guarded on 2026-08-28; the other nine dynamic HR routes were not.
    if (!isFullUuid(instanceId)) notFound();
    const { step, notice, failure } = await searchParams;

    return (
        <>
            <PageHeader>
                <h1 className="text-sm font-semibold">HR request</h1>
            </PageHeader>
            {/*
              The shell-header offset every `(core)` route owns for itself. Without it the
              panel's own top row — the "← All HR tasks" link and the restricted-record
              notice — was drawn inside the header band, behind `.shell-header-inject`, so
              the back link rendered perfectly and could not be clicked.
            */}
            <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
                <Suspense
                    fallback={
                        <div className="h-full animate-pulse bg-card/40" aria-label="Loading this request" />
                    }
                >
                    <HrDecisionPanel
                        instanceId={instanceId}
                        stepId={step ?? null}
                        noticeId={notice ?? null}
                        failureId={failure ?? null}
                    />
                </Suspense>
            </div>
        </>
    );
}
