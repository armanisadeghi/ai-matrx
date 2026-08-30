import { Suspense } from "react";
import { notFound } from "next/navigation";

import { BrandWorkspace } from "@/features/marketing/components/brands/BrandWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";

export default async function MarketingBrandPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  // Cache hit — the layout already resolved this address.
  const brand = await resolveBrandParam(brandId);
  if (!brand) notFound();
  return (
    <Suspense fallback={<LoadingSurface label="Loading brand…" />}>
      <BrandWorkspace brandId={brand.id} />
    </Suspense>
  );
}
