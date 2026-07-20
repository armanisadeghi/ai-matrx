import { Suspense } from "react";
import { BrandWorkspace } from "@/features/marketing/components/brands/BrandWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default async function MarketingBrandPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  return (
    <Suspense fallback={<LoadingSurface label="Loading brand…" />}>
      <BrandWorkspace brandId={brandId} />
    </Suspense>
  );
}
