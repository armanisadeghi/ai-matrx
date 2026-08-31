import { Suspense } from "react";

import { BacklinksGate } from "@/features/marketing/components/backlinks/BacklinksGate";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

/** The words other people use when they link to you. */
export default function MarketingSeoBacklinksAnchorsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading anchors…" />}>
      <BacklinksGate view="anchors" />
    </Suspense>
  );
}
