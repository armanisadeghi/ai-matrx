import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SeoChangeTrackingWorkspace } from "@/features/marketing/change-tracking/SeoChangeTrackingWorkspace";

export default function MarketingSiteChangesPage() {
  return (
    <Suspense
      fallback={<LoadingSurface label="Loading SEO change tracking…" />}
    >
      <SeoChangeTrackingWorkspace />
    </Suspense>
  );
}
