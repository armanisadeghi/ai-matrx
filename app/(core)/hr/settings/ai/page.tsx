import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { HrLanePanel } from "@/features/hr/settings/components/HrLanePanel";

/**
 * Route 80 (SPEC-UI-IA §3.11) — SHELL ONLY.
 *
 * This lane ships the route, its tab, the uniform D13 override shape over every key
 * the owning lane has already registered, and an honest statement of what the panel
 * becomes. The lane's own editors are NOT built here: a second implementation is a
 * thing the owning lane then has to delete.
 */
export const metadata = { title: "AI in HR" };

export default function Page() {
    return (
        <>
            <PageHeader>
                <h1 className="text-sm font-semibold">AI in HR</h1>
            </PageHeader>
            <div className="h-full overflow-hidden">
                <Suspense fallback={<HrLoading variant="panel" rows={6} />}>
                    <HrLanePanel
                        section="ai"
                        prefixes={["ai_", "employees_"]}
                        keys={["ai_screening_posture", "guidance_in_ai_provision"]}
                        promise="Every place AI helps in HR, how far it may go, how often it runs and over which people. Postures move downward only — an employer can always give an assistant less rope than the platform default, never more."
                    />
                </Suspense>
            </div>
        </>
    );
}
