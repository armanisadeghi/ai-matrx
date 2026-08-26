import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { HrLanePanel } from "@/features/hr/settings/components/HrLanePanel";

/**
 * Route 75 (SPEC-UI-IA §3.11) — SHELL ONLY.
 *
 * This lane ships the route, its tab, the uniform D13 override shape over every key
 * the owning lane has already registered, and an honest statement of what the panel
 * becomes. The lane's own editors are NOT built here: a second implementation is a
 * thing the owning lane then has to delete.
 */
export const metadata = { title: "Time rules" };

export default function Page() {
    return (
        <>
            <PageHeader>
                <h1 className="text-sm font-semibold">Time rules</h1>
            </PageHeader>
            <div className="h-full overflow-hidden">
                <Suspense fallback={<HrLoading variant="panel" rows={6} />}>
                    <HrLanePanel
                        section="time-rules"
                        features={["hr.time_and_attendance"]}
                        excludePrefixes={["kiosk_", "pairing_code", "pin_"]}
                        promise="Rounding, the overtime engine's posture, break and meal rules and attestation requirements, each shown against the jurisdiction floor beneath it — a floor renders as a locked control with its citation, never as a hidden one."
                    />
                </Suspense>
            </div>
        </>
    );
}
