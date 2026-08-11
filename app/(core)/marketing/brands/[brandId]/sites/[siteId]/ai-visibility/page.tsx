import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SiteAiVisibilityWorkspace } from "@/features/marketing/seo/ai-visibility/SiteAiVisibilityWorkspace";

export default function MarketingSiteAiVisibilityPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading AI visibility…" />}>
      <SiteAiVisibilityWorkspace />
    </Suspense>
  );
}
