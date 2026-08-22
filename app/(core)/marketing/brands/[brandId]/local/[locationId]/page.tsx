import { Suspense } from "react";

import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import LocalListingsWorkspace from "@/features/marketing/local/LocalListingsWorkspace";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import RouteHeader from "@/features/shell/components/header/RouteHeader";

export default async function BrandLocationPage({
  params,
}: {
  params: Promise<{ brandId: string; locationId: string }>;
}) {
  const { brandId, locationId } = await params;
  return (
    <>
      <RouteHeader
        left={
          <div className="flex min-w-0 items-center">
            <ChevronLeftTapButton
              href={marketingRoutes.brandLocal(brandId)}
              ariaLabel="Brand locations"
            />
            <h1 className="truncate text-sm font-medium text-foreground">
              Local &amp; Listings
            </h1>
          </div>
        }
      />
      <Suspense fallback={<LoadingSurface label="Loading location…" />}>
        <LocalListingsWorkspace brandId={brandId} locationId={locationId} />
      </Suspense>
    </>
  );
}
