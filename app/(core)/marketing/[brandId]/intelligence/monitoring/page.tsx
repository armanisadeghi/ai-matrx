// app/(core)/marketing/[brandId]/intelligence/monitoring/page.tsx
//
// Coverage, link changes, AI visibility and reputation all live in a WEBSITE's
// own workspace, so this section scopes to a site and opens them. It never
// re-renders them.
//
// 🚨 BRAND SCOPE (2026-08-30). `MonitoringFrontDoor` is the canonical component
// the flat `/marketing/monitoring` route uses, mounted here WITH this brand's
// scope. Mounted without it (as it was until today) the picker was org-wide and
// defaulted to the first site on the platform: All Green Recycling's Monitoring
// page opened on AI Matrx's website, every door beneath it linked into that
// other client's workspace, and choosing the right site appeared to do nothing.

import { Suspense } from "react";

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { BrandScopedMonitoring } from "@/features/marketing/front-doors/BrandScopedMonitoring";

export default function BrandMonitoringPage() {
  return (
    <>
      <RecordPageHeader record={{ name: "Monitoring" }} />
      {/* The site selector reads `?site=` on the client. */}
      <Suspense fallback={<LoadingSurface label="Loading monitoring…" />}>
        <BrandScopedMonitoring />
      </Suspense>
    </>
  );
}
