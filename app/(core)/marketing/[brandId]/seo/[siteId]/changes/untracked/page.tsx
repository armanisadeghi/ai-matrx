import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SeoChangeTrackingWorkspace } from "@/features/marketing/change-tracking/SeoChangeTrackingWorkspace";

/**
 * Observed page changes nobody has claimed — the ones with no documented
 * intervention behind them.
 *
 * `?change=<id>` selects a row here exactly as it does on the tracked route —
 * a filter, not a screen, so it stays a query.
 */
export default function MarketingSeoChangesUntrackedPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading untracked changes…" />}>
      <SeoChangeTrackingWorkspace view="untracked" />
    </Suspense>
  );
}
