// app/(core)/marketing/monitoring/page.tsx
//
// The agency plane's news monitors: every tracker the person administers
// across brands, with what its relevance check receives and what it cost.
// A brand's own Monitoring page stays at /marketing/[brandId]/intelligence/monitoring.


import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { NewsTrackersList } from "@/features/marketing/monitor-setup/inputs/NewsTrackersList";

export default function MarketingNewsMonitorsPage() {
  return (
    <>
      <RecordPageHeader record={{ name: "News monitors" }} />
      <div className="h-full min-h-0 overflow-hidden">
        <NewsTrackersList />
      </div>
    </>
  );
}
