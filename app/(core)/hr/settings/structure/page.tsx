import { Suspense } from "react";

import { HrLoading } from "@/features/hr/shared/HrStates";
import { HrStructurePanel } from "@/features/hr/settings/structure/HrStructurePanel";

/**
 * Route 69 (SPEC-UI-IA §3.11). Supports `?focus=<id>` — the profile's department, location and job-title doors land here.
 *
 * No `PageHeader` here: `HrShell` — mounted by this section's `layout.tsx` through
 * `HrSettingsChrome` — already injects the route header, and a second one collides
 * with it. The layout also owns the tab bar, the activation gate and the HR-admin
 * gate, so this file is only the panel.
 */
export const metadata = { title: "Structure" };

export default function Page() {
  return (
    <Suspense fallback={<HrLoading variant="panel" rows={6} />}>
      <HrStructurePanel />
    </Suspense>
  );
}
