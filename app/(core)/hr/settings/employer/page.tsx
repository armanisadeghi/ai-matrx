import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { HrEmployerPanel } from "@/features/hr/settings/employer/HrEmployerPanel";

/**
 * Route 68 (SPEC-UI-IA §3.11). The tab bar, the activation gate and the
 * HR-admin gate all live in `HrSettingsShell`, which the panel mounts — a route file
 * that repeated any of them would be a second gate that can disagree with the first.
 */
export const metadata = { title: "Employer of record" };

export default function Page() {
    return (
        <>
            <PageHeader>
                <h1 className="text-sm font-semibold">Employer of record</h1>
            </PageHeader>
            <div className="h-full overflow-hidden">
                <Suspense fallback={<HrLoading variant="panel" rows={6} />}>
                    <HrEmployerPanel />
                </Suspense>
            </div>
        </>
    );
}
