import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { HrLanePanel } from "@/features/hr/settings/components/HrLanePanel";

/**
 * Route 81 (SPEC-UI-IA §3.11) — SHELL ONLY.
 *
 * This lane ships the route, its tab, the uniform D13 override shape over every key
 * the owning lane has already registered, and an honest statement of what the panel
 * becomes. The lane's own editors are NOT built here: a second implementation is a
 * thing the owning lane then has to delete.
 */
export const metadata = { title: "Retention" };

export default function Page() {
    return (
        <>
            <PageHeader>
                <h1 className="text-sm font-semibold">Retention</h1>
            </PageHeader>
            <div className="h-full overflow-hidden">
                <Suspense fallback={<HrLoading variant="panel" rows={6} />}>
                    <HrLanePanel
                        section="retention"
                        features={["hr.records"]}
                        prefixes={["retention_", "disposition_", "ai_evidence_"]}
                        promise="How long each class of record is kept, what puts a legal hold on it, which disposals are approved, and the evidence that a destruction actually happened. The personnel file, the separation record and the payroll computation always appear, because §1 writes to all three."
                    />
                </Suspense>
            </div>
        </>
    );
}
