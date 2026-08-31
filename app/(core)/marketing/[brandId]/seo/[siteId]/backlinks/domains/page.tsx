import { Suspense } from "react";

import { BacklinksGate } from "@/features/marketing/components/backlinks/BacklinksGate";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

/** The sites linking to you, one row per referring domain. */
export default function MarketingSeoBacklinksDomainsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading referring domains…" />}>
      <BacklinksGate view="domains" />
    </Suspense>
  );
}
