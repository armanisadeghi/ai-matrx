// The cross-client rank roll-up — an AGENCY-plane report, moved here from the
// flat `/marketing/ranks` in the 2026-08-28 agency restructure. One site's
// rankings live at /marketing/[brand]/seo/[site]/rankings; this is the
// portfolio view across every client. `/marketing/ranks` is now a 308 shim.

import { Suspense } from "react";
import { CrossSiteRanksHub } from "@/features/marketing/components/ranks/CrossSiteRanksHub";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingRanksReportPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading rank portfolio…" />}>
      <CrossSiteRanksHub />
    </Suspense>
  );
}
