import { Suspense } from "react";
import { notFound } from "next/navigation";

import { BrandAssetsWorkspace } from "@/features/marketing/components/brands/BrandAssetsWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";

/** The brand's asset desk — Library is the index of the media room. */
export default async function BrandMediaPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const brand = await resolveBrandParam(brandId);
  if (!brand) notFound();
  return (
    <Suspense fallback={<LoadingSurface label="Loading brand media…" />}>
      <BrandAssetsWorkspace brandId={brand.id} view="library" />
    </Suspense>
  );
}
