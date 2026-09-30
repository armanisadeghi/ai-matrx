// app/(core)/marketing/[brandId]/planning/calendar/page.tsx
//
// THE BRAND'S PR CALENDAR — the reserved calendar route, filled by the PR calendar
// (BRIEFS-STRATEGY-AND-ORG-CHART §3.2: "that is where the plan renders"). Route chrome
// only; everything interactive lives in `features/marketing/pr/calendar/`. The wider
// promise (content, social, email and paid publishes on the same timeline) is still
// tracked as `marketing.calendar` in lib/coming-soon/registry.ts and is shown on the page.

import type { Metadata } from "next";
import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { PrCalendarPage } from "@/features/marketing/pr/calendar/PrCalendarPage";

export const metadata: Metadata = {
  title: "PR Calendar",
  description:
    "The sourced moments worth pitching over the next six months, with pitch windows for every kind of outlet.",
};

export default function BrandCalendarPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-medium text-foreground">PR Calendar</h1>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            Pitch-ready · watch · avoid, with the dates that matter
          </span>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <Suspense fallback={<LoadingSurface label="Loading the PR calendar…" />}>
          <PrCalendarPage />
        </Suspense>
      </div>
    </>
  );
}
