import { MarketingAddressUnavailable } from "@/features/marketing/components/shared/MarketingAddressUnavailable";
import { RankGridWorkspace } from "@/features/marketing/local/rank-grid/RankGridWorkspace";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";

/** One location's Google Maps rank grid: preview free, then a confirmed run. */
export default async function BrandLocationGridPage({
  params,
}: {
  params: Promise<{ brandId: string; locationId: string }>;
}) {
  const { brandId, locationId } = await params;
  const brand = await resolveBrandParam(brandId);
  if (!brand) return <MarketingAddressUnavailable token="web_brand" address={brandId} />;
  return <RankGridWorkspace brandId={brand.id} locationId={locationId} />;
}
