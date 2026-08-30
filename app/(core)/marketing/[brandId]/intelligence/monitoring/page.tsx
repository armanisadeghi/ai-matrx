// app/(core)/marketing/[brandId]/intelligence/monitoring/page.tsx
//
// Coverage, link changes, AI visibility and reputation all live in a WEBSITE's
// own workspace, so this section scopes to a site and opens them. It never
// re-renders them.
//
// NOTE (agency restructure, 2026-08-29): `MonitoringFrontDoor` is the canonical
// component the flat `/marketing/monitoring` route used and is mounted here
// unchanged. Its site picker is still org-wide (`?site=`) rather than scoped to
// the brand in the path; scoping it is a component change, tracked in the
// restructure handoff.

import { Suspense } from "react";
import type { Metadata } from "next";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { MonitoringFrontDoor } from "@/features/marketing/front-doors/MonitoringFrontDoor";

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
        <MonitoringFrontDoor />
      </Suspense>
    </>
  );
}
