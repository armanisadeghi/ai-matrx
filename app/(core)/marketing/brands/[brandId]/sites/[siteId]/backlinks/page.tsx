import { Suspense } from "react";
import { BacklinksWorkspace } from "@/features/marketing/components/backlinks/BacklinksWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingSiteBacklinksPage() {
  return (
    <Suspense
      fallback={<LoadingSurface label="Loading backlink intelligence…" />}
    >
      <BacklinksWorkspace />
    </Suspense>
  );
}
