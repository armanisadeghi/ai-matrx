import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SiteKeywordsView } from "@/features/marketing/seo/keyword-research/components/SiteKeywordsView";

/**
 * THE KEYWORD FRONT DOOR — the map of every screen that gives keywords
 * meaning, each with a sentence saying what you do there.
 *
 * No fixed view: the bare URL renders "Start here", and a pre-restructure
 * `?view=performance|workbench` link still lands on the screen it names
 * (`/performance` and `/workbench` beside this file are those same screens as
 * their own routes).
 */
export default function MarketingSeoKeywordsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading keywords…" />}>
      <SiteKeywordsView />
    </Suspense>
  );
}
