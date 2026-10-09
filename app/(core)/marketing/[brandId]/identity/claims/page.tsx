import { MarketingAddressUnavailable } from "@/features/marketing/components/shared/MarketingAddressUnavailable";
import { BrandClaimsPage } from "@/features/marketing/components/brand/BrandProfilePages";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";

/** What this brand may say, what it never may, and the disclaimers that go with it. */
export default async function BrandClaimsPageRoute({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const brand = await resolveBrandParam(brandId);
  if (!brand) return <MarketingAddressUnavailable token="web_brand" address={brandId} />;
  return <BrandClaimsPage brandId={brand.id} />;
}
