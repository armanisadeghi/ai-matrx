"use client";

/**
 * The brand-level door into REPUTATION.
 *
 * Reputation is answered per WEBSITE — the cases, publications and narratives
 * all hang off a site row — so the brand-level route is a chooser, not a second
 * workspace (the front-door pattern: name what exists, count it, open it). One
 * card per site, each opening that site's reputation workspace at
 * `intelligence/reputation/<siteKey>`.
 *
 * The brand comes from `MarketingBrandProvider` (a real UUID), never from the
 * route param — the param is an address and is usually a key.
 */

import { ShieldCheck } from "lucide-react";

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { useBrandSites } from "@/features/marketing/data/hooks";
import { marketingSeg } from "@/features/marketing/lib/keys";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  MarketingDoorBoard,
  MarketingFrontDoorPage,
  type MarketingDoor,
} from "@/features/marketing/front-doors/MarketingDoorBoard";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";

export function BrandReputationSites() {
  const brand = useMarketingBrand();
  const sites = useBrandSites(brand.id);

  const doors: MarketingDoor[] = (sites.data ?? []).map((site) => ({
    label: site.name ?? site.domain,
    href: marketingRoutes.brandReputation(brand.seg, marketingSeg(site)),
    description: site.domain,
    Icon: ShieldCheck,
  }));

  return (
    <MarketingFrontDoorPage
      title="Reputation"
      lede="Which published pages hurt this client, what each one needs, and the pitch angle that fixes it — read per website. Pick a site to open its decision brief."
    >
      {sites.isError ? <QueryError error={sites.error} /> : null}

      {sites.isPending ? (
        <LoadingSurface label="Loading websites…" />
      ) : doors.length > 0 ? (
        <MarketingDoorBoard
          title={brand.name}
          description="Each brief lives in that website's own workspace — this page is the way in, not a second copy."
          doors={doors}
        />
      ) : sites.isError ? null : (
        <p className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Reputation reads a website&apos;s published pages. Add a site to this
          brand and the brief turns on with the first crawl.
        </p>
      )}
    </MarketingFrontDoorPage>
  );
}
