// app/(core)/marketing/monitoring/page.tsx
//
// The Marketing pillar's front door to monitoring: coverage, link changes, AI
// visibility and reputation all live in a WEBSITE's own workspace, so this
// route scopes to a site and opens them. It never re-renders them.

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

export default function MarketingMonitoringPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center pr-14">
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
