import { Suspense } from "react";

import { HrLoading } from "@/features/hr/shared/HrStates";
import { HrPayGroupsPanel } from "@/features/hr/settings/pay-groups/HrPayGroupsPanel";

/**
 * Route 70 (SPEC-UI-IA §3.11).
 *
 * No `PageHeader` here: `HrShell` — mounted by this section's `layout.tsx` through
 * `HrSettingsChrome` — already injects the route header, and a second one collides
 * with it. The layout also owns the tab bar, the activation gate and the HR-admin
 * gate, so this file is only the panel.
 */
export const metadata = { title: "Pay groups" };

export default function Page() {
  return (
    <Suspense fallback={<HrLoading variant="panel" rows={6} />}>
      <HrPayGroupsPanel />
    </Suspense>
  );
}
