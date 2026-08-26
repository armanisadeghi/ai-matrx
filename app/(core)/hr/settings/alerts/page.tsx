import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { HrLanePanel } from "@/features/hr/settings/components/HrLanePanel";

/**
 * Route 79a (SPEC-UI-IA §3.11) — SHELL ONLY.
 *
 * This lane ships the route, its tab, the uniform D13 override shape over every key
 * the owning lane has already registered, and an honest statement of what the panel
 * becomes. The lane's own editors are NOT built here: a second implementation is a
 * thing the owning lane then has to delete.
 */
export const metadata = { title: "Alerts" };

export default function Page() {
    return (
        <>
            <PageHeader>
                <h1 className="text-sm font-semibold">Alerts</h1>
            </PageHeader>
            <div className="h-full overflow-hidden">
                <Suspense fallback={<HrLoading variant="panel" rows={6} />}>
                    <HrLanePanel
                        section="alerts"
                        prefixes={["ot_alert_", "alert_"]}
                        promise="Which roles receive which alert tiers, on which channels — a routing matrix owned by the principal, over events the notification spine already declares."
                    />
                </Suspense>
            </div>
        </>
    );
}
