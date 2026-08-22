import { Suspense } from "react";

import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import LocalListingsWorkspace from "@/features/marketing/local/LocalListingsWorkspace";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import RouteHeader from "@/features/shell/components/header/RouteHeader";

export default async function BrandLocalPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  return (
    <>
      <RouteHeader
        left={
          <div className="flex min-w-0 items-center">
            <ChevronLeftTapButton
              href={marketingRoutes.local()}
              ariaLabel="All local listings"
            />
            <h1 className="truncate text-sm font-medium text-foreground">
              Local &amp; Listings
            </h1>
          </div>
        }
      />
      <Suspense fallback={<LoadingSurface label="Loading locations…" />}>
        <LocalListingsWorkspace brandId={brandId} />
      </Suspense>
    </>
  );
}
