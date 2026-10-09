// app/(core)/marketing/[brandId]/planning/calendar/page.tsx
//
// THE BRAND'S PR CALENDAR — the reserved calendar route, filled by the PR calendar
// (BRIEFS-STRATEGY-AND-ORG-CHART §3.2: "that is where the plan renders"). Route chrome
// only; everything interactive lives in `features/marketing/pr/calendar/`. The wider
// promise (content, social, email and paid publishes on the same timeline) is still
// tracked as `marketing.calendar` in lib/coming-soon/registry.ts and is shown on the page.

import { Suspense } from "react";

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { PrCalendarPage } from "@/features/marketing/pr/calendar/PrCalendarPage";

export default function BrandCalendarPage() {
  return (
    <>
      <RecordPageHeader record={{ name: "PR Calendar" }} />
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <Suspense fallback={<LoadingSurface label="Loading the PR calendar…" />}>
          <PrCalendarPage />
        </Suspense>
      </div>
    </>
  );
}
