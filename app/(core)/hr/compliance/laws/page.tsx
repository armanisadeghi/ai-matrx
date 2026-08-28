import { Suspense } from "react";

import { HrComplianceChrome } from "@/features/hr/compliance/HrComplianceShell";
import { LawPortalSurface } from "@/features/hr/compliance/LawPortalSurface";
import { HrLoading } from "@/features/hr/shared/HrStates";

/**
 * Route 85c — THE ORG LAW PORTAL (owner ruling D25, 2026-08-28).
 *
 * The employment-law rules that reach this employer (platform baseline, read-only)
 * and the rules this organization layers over them. The platform rule LIBRARY —
 * drafting, promoting, retiring law — is a superadmin surface in the admin portal
 * and is deliberately unreachable from here.
 *
 * No `PageHeader`: `HrComplianceChrome` → `HrSubShell` → `HrShell` injects the route
 * header and the section's tab bar, and owns the scroll chain.
 */
export const metadata = { title: "Laws & rules" };

export default function Page() {
  return (
    <HrComplianceChrome tab="laws">
      <Suspense fallback={<HrLoading variant="panel" rows={8} />}>
        <LawPortalSurface />
      </Suspense>
    </HrComplianceChrome>
  );
}
