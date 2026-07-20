import { Suspense } from "react";
import { DiscoveryInbox } from "@/features/marketing/components/discovery/DiscoveryInbox";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingSiteDiscoveryPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading discoveries…" />}>
      <DiscoveryInbox />
    </Suspense>
  );
}
