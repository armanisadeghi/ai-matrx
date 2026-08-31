import { Suspense } from "react";

import { BacklinksGate } from "@/features/marketing/components/backlinks/BacklinksGate";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

/** Who wrote about this brand — most of which never links. */
export default function MarketingSeoBacklinksCoveragePage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading coverage…" />}>
      <BacklinksGate view="coverage" />
    </Suspense>
  );
}
