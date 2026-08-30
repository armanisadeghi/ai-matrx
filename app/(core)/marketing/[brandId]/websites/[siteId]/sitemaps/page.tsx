import { Suspense } from "react";
import { SitemapsWorkspace } from "@/features/marketing/components/sitemaps/SitemapsWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingSiteSitemapsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading sitemaps…" />}>
      <SitemapsWorkspace />
    </Suspense>
  );
}
