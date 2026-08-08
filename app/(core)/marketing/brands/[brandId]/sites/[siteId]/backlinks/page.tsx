import { Suspense } from "react";
import { BacklinksGate } from "@/features/marketing/components/backlinks/BacklinksGate";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingSiteBacklinksPage() {
  return (
    <Suspense
      fallback={<LoadingSurface label="Loading backlink intelligence…" />}
    >
      <BacklinksGate />
    </Suspense>
  );
}
