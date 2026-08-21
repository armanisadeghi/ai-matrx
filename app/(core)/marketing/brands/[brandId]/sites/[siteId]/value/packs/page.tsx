import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { StarterPackCatalog } from "@/features/marketing/seo/value-system/packs/StarterPackCatalog";

export default function StarterPacksPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading industry starter packs…" />}>
      <StarterPackCatalog />
    </Suspense>
  );
}
