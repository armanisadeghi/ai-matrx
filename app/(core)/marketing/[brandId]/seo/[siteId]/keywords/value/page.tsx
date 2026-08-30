import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { ValueWorkbench } from "@/features/marketing/seo/value-system/workbench/ValueWorkbench";

/**
 * THE Keyword Value workbench — what this site's keywords are worth and why.
 *
 * The rest of the family sits beside this route: Dimensions (the questions
 * keywords are sorted by), Rulebook (what earns points), Industry packs, and
 * this site's value settings. The business-knowledge screens that used to live
 * here — discovery, offerings, topics, guidelines — moved to the brand's
 * Identity section, because business truth belongs to the brand and valuation
 * only consumes it.
 */
export default function MarketingSeoKeywordValuePage() {
  return (
    <Suspense
      fallback={<LoadingSurface label="Loading keyword value workbench…" />}
    >
      <ValueWorkbench />
    </Suspense>
  );
}
