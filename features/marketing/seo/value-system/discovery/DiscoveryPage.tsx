"use client";

/** Route shell for the Business Discovery Ladder — resolves the site from
 *  the marketing context and mounts the canonical `DiscoveryWorkspace`. */

import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { DiscoveryWorkspace } from "./DiscoveryWorkspace";

export function DiscoveryPage() {
  const { site, brandId } = useMarketingSite();
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain p-3">
      <DiscoveryWorkspace
        siteId={site.id}
        brandId={brandId ?? null}
        organizationId={site.organization_id ?? null}
        siteLabel={site.domain ?? site.name ?? site.id}
      />
    </div>
  );
}
