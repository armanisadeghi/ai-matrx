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
            {/*
              🚨 `pt-[var(--shell-header-h)]` IS NOT DECORATION — IT IS WHAT MAKES THIS PAGE
              CLICKABLE. `.shell-main` is pulled up by the header's height so page content
              starts BEHIND the transparent shell header, and each route owns its own top
              offset (`app/(core)/_read_first_route_rules/docs/overview.md` §3; `RouteHeader`
              says the same). Without it, this page's scope-tab row was painted inside the
              header band — under the full-width `.shell-header-inject` wrapper that carries
              the "HR tasks" title — and "Mine" / "My team" / "HR queue" swallowed every
              click. Visible, and completely dead: a person could not change task scope at all.
            */}
            <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
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
