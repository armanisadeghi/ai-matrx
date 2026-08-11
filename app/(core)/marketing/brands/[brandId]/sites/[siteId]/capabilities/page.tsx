import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SeoCapabilitiesWorkspace } from "@/features/marketing/seo/capabilities/SeoCapabilitiesWorkspace";

export default function MarketingSiteSeoCapabilitiesPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading SEO capabilities…" />}>
      <SeoCapabilitiesWorkspace />
    </Suspense>
  );
}
