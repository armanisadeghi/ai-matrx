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
import type { Metadata } from "next";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { BrandScopedMonitoring } from "@/features/marketing/front-doors/BrandScopedMonitoring";

export const metadata: Metadata = {
  title: "Monitoring",
  description:
    "Who wrote about you, what happened to your links, and whether the answer engines cite you — watched per website.",
};

export default function BrandMonitoringPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center">
          <h1 className="truncate text-sm font-medium text-foreground">
            Monitoring
          </h1>
        </div>
      </PageHeader>
      {/* The site selector reads `?site=` on the client. */}
      <Suspense fallback={<LoadingSurface label="Loading monitoring…" />}>
        <BrandScopedMonitoring />
      </Suspense>
    </>
  );
}
