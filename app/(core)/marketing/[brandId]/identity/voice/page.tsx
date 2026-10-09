import { MarketingAddressUnavailable } from "@/features/marketing/components/shared/MarketingAddressUnavailable";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";
import { VoicePage } from "@/features/marketing/voice/VoicePage";

/** How this brand writes — measured from its real writing, confirmed, and enforced on every draft. */
export default async function BrandVoicePage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const brand = await resolveBrandParam(brandId);
  if (!brand) return <MarketingAddressUnavailable token="web_brand" address={brandId} />;
  return (
    <VoicePage
      scope="brand"
      ownerId={brand.id}
      ownerName={brand.name}
      organizationId={brand.organization_id}
      brandKind={brand.kind}
      personUserId={brand.person_user_id}
    />
  );
}
