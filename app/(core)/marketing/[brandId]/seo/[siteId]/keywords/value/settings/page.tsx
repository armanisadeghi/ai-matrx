"use client";

/**
 * Site keyword-value settings — the last rung of the ladder (KI-046):
 * platform → organization → brand → SITE. What this one site uses, and what it
 * inherits from its brand when it says nothing.
 *
 * The site UUID comes from the resolved site context, never from the route
 * param: under the agency-model tree `[siteId]` is an ADDRESS and is usually
 * the site's key.
 */

import { AutonomyModesEditor } from "@/features/marketing/seo/value-system/settings/AutonomyModesEditor";
import { CopyMeaningFromSite } from "@/features/marketing/seo/value-system/settings/CopyMeaningFromSite";
import { CopyKeywordsFromSite } from "@/features/marketing/seo/keyword-research/components/CopyKeywordsFromSite";
import { ValueSettingsEditor } from "@/features/marketing/seo/value-system/settings/ValueSettingsEditor";
import { useMarketingSite } from "@/features/marketing/lib/brand-context";

export default function MarketingSeoKeywordValueSettingsPage() {
  const site = useMarketingSite();
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <ValueSettingsEditor scope="site" id={site.id} />
        <AutonomyModesEditor scope="site" id={site.id} />
        <CopyMeaningFromSite siteId={site.id} />
        <CopyKeywordsFromSite siteId={site.id} />
      </div>
    </div>
  );
}
