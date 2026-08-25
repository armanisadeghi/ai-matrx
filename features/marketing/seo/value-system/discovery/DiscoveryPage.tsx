"use client";

/** Route shell for the Business Discovery Ladder — resolves the site from
 *  the marketing context and hands the ladder its one input. */

import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { ValueDoors } from "../ValueDoors";
import { DiscoveryLadder } from "./DiscoveryLadder";

export function DiscoveryPage() {
  const { site, brandId } = useMarketingSite();
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Let AI read <span className="font-medium text-foreground">{site.domain}</span>{" "}
          cold and propose what it is, who pays it, and what each Offering is
          worth — you rule every step.
        </p>
        <ValueDoors brandId={brandId} siteId={site.id} />
      </div>
      <DiscoveryLadder siteId={site.id} />
    </div>
  );
}
