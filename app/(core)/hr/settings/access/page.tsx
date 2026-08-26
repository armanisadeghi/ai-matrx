import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { HrLanePanel } from "@/features/hr/settings/components/HrLanePanel";

/**
 * Route 77 (SPEC-UI-IA §3.11) — SHELL ONLY.
 *
 * This lane ships the route, its tab, the uniform D13 override shape over every key
 * the owning lane has already registered, and an honest statement of what the panel
 * becomes. The lane's own editors are NOT built here: a second implementation is a
 * thing the owning lane then has to delete.
 */
export const metadata = { title: "Access levels" };

export default function Page() {
    return (
        <>
            <PageHeader>
                <h1 className="text-sm font-semibold">Access levels</h1>
            </PageHeader>
            <div className="h-full overflow-hidden">
                <Suspense fallback={<HrLoading variant="panel" rows={6} />}>
                    <HrLanePanel
                        section="access"
                        features={["hr.access"]}
                        promise="Who can see and change what, over which people — assigned over a population rather than person by person, with the blast radius stated in words before it commits (\u201cthis grants pay visibility over 412 people\u201d)."
                    />
                </Suspense>
            </div>
        </>
    );
}
