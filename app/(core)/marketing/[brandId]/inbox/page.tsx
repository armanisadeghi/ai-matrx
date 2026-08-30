import { Suspense } from "react";
import { notFound } from "next/navigation";

import { DiscoveryInbox } from "@/features/marketing/components/discovery/DiscoveryInbox";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";

/** Review machine-found assets, properties, and facts before they join the brand. */
export default async function BrandInboxPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const brand = await resolveBrandParam(brandId);
  if (!brand) notFound();
  return (
    <Suspense fallback={<LoadingSurface label="Loading discoveries…" />}>
      <DiscoveryInbox brandId={brand.id} />
    </Suspense>
  );
}
