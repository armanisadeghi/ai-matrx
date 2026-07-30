import { Suspense } from "react";
import { SearchConsoleGate } from "@/features/marketing/search-console/components/SearchConsoleGate";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingSearchConsolePage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading Search Console…" />}>
      <SearchConsoleGate />
    </Suspense>
  );
}
