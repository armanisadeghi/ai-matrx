import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { StarterPackCatalog } from "@/features/marketing/seo/value-system/packs/StarterPackCatalog";

/** Industry starter packs — a ready set of meaning to adopt and then edit. */
export default function MarketingSeoKeywordValuePacksPage() {
  return (
    <Suspense
      fallback={<LoadingSurface label="Loading industry starter packs…" />}
    >
      <StarterPackCatalog />
    </Suspense>
  );
}
