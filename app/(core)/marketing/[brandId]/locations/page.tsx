import { MarketingAddressUnavailable } from "@/features/marketing/components/shared/MarketingAddressUnavailable";
import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import LocalListingsWorkspace from "@/features/marketing/local/LocalListingsWorkspace";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";

/** This client's business locations, listings, and reviews. */
export default async function BrandLocationsPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const brand = await resolveBrandParam(brandId);
  if (!brand) return <MarketingAddressUnavailable token="web_brand" address={brandId} />;
  return (
    <Suspense fallback={<LoadingSurface label="Loading locations…" />}>
      <LocalListingsWorkspace brandId={brand.id} />
    </Suspense>
  );
}
