import { Suspense } from "react";

import { BacklinksGate } from "@/features/marketing/components/backlinks/BacklinksGate";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

/** Every link this site has right now, as it stands today. */
export default function MarketingSeoBacklinksLinksPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading your backlinks…" />}>
      <BacklinksGate view="links" />
    </Suspense>
  );
}
