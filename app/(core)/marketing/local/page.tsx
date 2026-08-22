import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import LocalListingsWorkspace from "@/features/marketing/local/LocalListingsWorkspace";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import RouteHeader from "@/features/shell/components/header/RouteHeader";

export const metadata: Metadata = {
  title: "Local & Listings",
  description:
    "Manage every physical location's canonical profile, track its presence across the directories that drive local rank, and keep name/address/phone consistent everywhere.",
};

export default async function MarketingLocalPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; location?: string }>;
}) {
  const { brand, location } = await searchParams;
  if (brand) {
    redirect(
      location
        ? marketingRoutes.brandLocation(brand, location)
        : marketingRoutes.brandLocal(brand),
    );
  }
  return (
    <>
      <RouteHeader
        left={
          <div className="flex min-w-0 items-center">
            <ChevronLeftTapButton
              href={marketingRoutes.home()}
              ariaLabel="Marketing"
            />
            <h1 className="truncate text-sm font-medium text-foreground">
              Local &amp; Listings
            </h1>
          </div>
        }
      />
      <Suspense fallback={<LoadingSurface label="Loading locations…" />}>
        <LocalListingsWorkspace />
      </Suspense>
    </>
  );
}
