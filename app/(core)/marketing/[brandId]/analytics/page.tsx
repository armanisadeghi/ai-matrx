import { Suspense } from "react";

import { MarketingAddressUnavailable } from "@/features/marketing/components/shared/MarketingAddressUnavailable";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { BrandAnalyticsWorkspace } from "@/features/marketing/analytics/components/BrandAnalyticsWorkspace";
import { BrandChannelPanel } from "@/features/marketing/youtube/components/BrandChannelPanel";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";

/**
 * This client's Analytics — the brand's websites with their Google Analytics
 * headline numbers, each opening the canonical `SiteAnalyticsPanel` in a window.
 * Replaces the Coming-Soon placeholder (google-native PLAN §4.9 Plane A).
 *
 * The owned YouTube channel sits under them (U-M3, PLAN §4.11 Plane A). It is
 * HERE rather than behind a new sidebar row because this section's own promise
 * is already "Google Analytics traffic and conversion per website today; the
 * other channels join it as they land" — a channel is one of those other
 * channels, and a second Insight row for one panel would be a route a person
 * has to learn before they can find their own videos.
 */
export default async function BrandAnalyticsPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const brand = await resolveBrandParam(brandId);
  if (!brand) {
    return <MarketingAddressUnavailable token="web_brand" address={brandId} />;
  }
  return (
    <div className="h-full overflow-y-auto p-3 pt-[calc(var(--shell-header-h)+0.75rem)] sm:p-4 sm:pt-[calc(var(--shell-header-h)+1rem)]">
      <Suspense fallback={<LoadingSurface label="Loading this client's Analytics…" />}>
        <BrandAnalyticsWorkspace brandId={brand.id} />
      </Suspense>
      <div className="mt-3">
        <Suspense
          fallback={<LoadingSurface label="Loading this client's YouTube channel…" />}
        >
          <BrandChannelPanel brandId={brand.id} />
        </Suspense>
      </div>
    </div>
  );
}
