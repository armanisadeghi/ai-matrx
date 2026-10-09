import { MarketingAddressUnavailable } from "@/features/marketing/components/shared/MarketingAddressUnavailable";
import { BrandAudiencePage } from "@/features/marketing/components/brand/BrandAudiencePage";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";

/** Who this brand sells to — named personas every brief and agent writes for. */
export default async function BrandAudienceRoute({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const brand = await resolveBrandParam(brandId);
  if (!brand) return <MarketingAddressUnavailable token="web_brand" address={brandId} />;
  return (
    <BrandAudiencePage
      brandId={brand.id}
      brandName={brand.name}
      organizationId={brand.organization_id}
    />
  );
}
