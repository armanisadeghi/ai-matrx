import { MarketingAddressUnavailable } from "@/features/marketing/components/shared/MarketingAddressUnavailable";
import { Suspense } from "react";

import { BrandAssetsWorkspace } from "@/features/marketing/components/brands/BrandAssetsWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";

export default async function BrandMediaResearchPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const brand = await resolveBrandParam(brandId);
  if (!brand) return <MarketingAddressUnavailable token="web_brand" address={brandId} />;
  return (
    <Suspense fallback={<LoadingSurface label="Loading research media…" />}>
      <BrandAssetsWorkspace brandId={brand.id} view="research" />
    </Suspense>
  );
}
