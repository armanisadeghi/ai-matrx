import { MarketingAddressUnavailable } from "@/features/marketing/components/shared/MarketingAddressUnavailable";
import { BrandMessagingPage } from "@/features/marketing/components/brand/BrandProfilePages";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";

/** What the brand stands for and how it says it — mission, vision, story, pitches, pillars, hashtags. */
export default async function BrandMessagingPageRoute({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const brand = await resolveBrandParam(brandId);
  if (!brand) return <MarketingAddressUnavailable token="web_brand" address={brandId} />;
  return <BrandMessagingPage brandId={brand.id} />;
}
