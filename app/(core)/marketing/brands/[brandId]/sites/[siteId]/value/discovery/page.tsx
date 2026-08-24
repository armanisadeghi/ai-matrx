import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { DiscoveryPage } from "@/features/marketing/seo/value-system/discovery/DiscoveryPage";

/**
 * Business Discovery Ladder — AI reads the site cold and proposes its
 * business model, customers, money map, Offerings, and their worth; the
 * human rules each rung. Register item KI-040. SoR:
 * common-docs/systems/marketing/seo/seo-keywords/REGISTER.md
 */
export default function BusinessDiscoveryPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading business discovery…" />}>
      <DiscoveryPage />
    </Suspense>
  );
}
