import { Suspense } from "react";
import { SiteMediaWorkspace } from "@/features/marketing/components/media/SiteMediaWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingSiteMediaPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading site media…" />}>
      <SiteMediaWorkspace />
    </Suspense>
  );
}
