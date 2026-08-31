import { Suspense } from "react";

import { SiteMediaWorkspace } from "@/features/marketing/components/media/SiteMediaWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

/** The image sizes and rules this website holds itself to. */
export default function MarketingSiteMediaStandardsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading media standards…" />}>
      <SiteMediaWorkspace view="standards" />
    </Suspense>
  );
}
