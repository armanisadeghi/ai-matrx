import { Suspense } from "react";

import { BrandAssetsWorkspace } from "@/features/marketing/components/brands/BrandAssetsWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default async function MarketingBrandAssetsPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  return (
    <Suspense fallback={<LoadingSurface label="Loading brand assets…" />}>
      <BrandAssetsWorkspace brandId={brandId} />
    </Suspense>
  );
}
