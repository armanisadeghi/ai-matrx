// app/(core)/marketing/[brandId]/intelligence/monitoring/setup/page.tsx
//
// The tracker editor — ONE editor for both monitor lenses (coverage and
// opportunity), opened from the brand's Monitoring front door and from a
// site's Coverage tab. `?tracker=<id>` edits a saved monitor; `?site=<id>`
// preselects the website for a new one.

import { Suspense } from "react";
import type { Metadata } from "next";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { MonitorSetupEditor } from "@/features/marketing/monitor-setup/MonitorSetupEditor";

export const metadata: Metadata = {
  title: "News monitor setup",
  description:
    "Choose what to watch — who writes about you and the news you can join — starting from what we already know.",
};

export default function MonitorSetupPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center">
          <h1 className="truncate text-sm font-medium text-foreground">
            News monitor
          </h1>
        </div>
      </PageHeader>
      <Suspense fallback={<LoadingSurface label="Loading the monitor…" />}>
        <MonitorSetupEditor />
      </Suspense>
    </>
  );
}
