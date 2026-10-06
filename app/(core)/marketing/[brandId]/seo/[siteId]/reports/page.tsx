import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SiteSeoReportsWorkspace } from "@/features/marketing/reports/saved/SiteSeoReportsWorkspace";

/**
 * The site's SEO reports: saved reports (one job, many versions) opening in the
 * artifact viewer, the report templates and which one is active here, and a
 * Generate button through the screen-run door. Brand and site come from the
 * SEO site layout's provider.
 */
export default function MarketingSeoReportsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading SEO reports…" />}>
      <SiteSeoReportsWorkspace />
    </Suspense>
  );
}
