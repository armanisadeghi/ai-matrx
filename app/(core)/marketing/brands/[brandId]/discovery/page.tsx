import { Suspense } from "react";

import { DiscoveryInbox } from "@/features/marketing/components/discovery/DiscoveryInbox";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default async function MarketingBrandDiscoveryPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  return (
    <Suspense fallback={<LoadingSurface label="Loading discoveries…" />}>
      <DiscoveryInbox brandId={brandId} />
    </Suspense>
  );
}
