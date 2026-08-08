import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SiteIntakeWizard } from "@/features/marketing/search-console/intake/SiteIntakeWizard";

export default function MarketingSiteIntakePage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading site intake…" />}>
      <SiteIntakeWizard />
    </Suspense>
  );
}
