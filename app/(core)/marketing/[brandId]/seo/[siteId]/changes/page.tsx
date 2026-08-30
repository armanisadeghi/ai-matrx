import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SeoChangeTrackingWorkspace } from "@/features/marketing/change-tracking/SeoChangeTrackingWorkspace";

/** `?change=<id>` selects a row — a filter, not a screen, so it stays a query. */
export default function MarketingSeoChangesPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading SEO change tracking…" />}>
      <SeoChangeTrackingWorkspace />
    </Suspense>
  );
}
