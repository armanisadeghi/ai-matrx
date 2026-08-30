import { Suspense } from "react";
import { notFound } from "next/navigation";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import LocalListingsWorkspace from "@/features/marketing/local/LocalListingsWorkspace";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";

/** One canonical location and its publisher-listing workspace. */
export default async function BrandLocationPage({
  params,
}: {
  params: Promise<{ brandId: string; locationId: string }>;
}) {
  const { brandId, locationId } = await params;
  const brand = await resolveBrandParam(brandId);
  if (!brand) notFound();
  return (
    <Suspense fallback={<LoadingSurface label="Loading location…" />}>
      <LocalListingsWorkspace brandId={brand.id} locationId={locationId} />
    </Suspense>
  );
}
