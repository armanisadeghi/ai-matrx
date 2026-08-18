import type { Metadata } from "next";
import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import LocalListingsWorkspace from "@/features/marketing/local/LocalListingsWorkspace";

export const metadata: Metadata = {
  title: "Local & Listings",
  description:
    "Manage every physical location's canonical profile, track its presence across the directories that drive local rank, and keep name/address/phone consistent everywhere.",
};

export default function MarketingLocalPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center">
          <h1 className="truncate text-sm font-medium text-foreground">
            Local &amp; Listings
          </h1>
        </div>
      </PageHeader>
      <Suspense fallback={<LoadingSurface label="Loading locations…" />}>
        <LocalListingsWorkspace />
      </Suspense>
    </>
  );
}
