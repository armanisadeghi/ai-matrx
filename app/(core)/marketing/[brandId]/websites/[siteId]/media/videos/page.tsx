import { Suspense } from "react";

import { SiteMediaWorkspace } from "@/features/marketing/components/media/SiteMediaWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

/** Crawled video/embed evidence and this site's owned video assets. */
export default function MarketingSiteMediaVideosPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading site videos…" />}>
      <SiteMediaWorkspace view="videos" />
    </Suspense>
  );
}
