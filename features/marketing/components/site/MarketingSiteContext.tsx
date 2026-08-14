"use client";

/**
 * The site context every Marketing site-level surface reads from — the site
 * row, its canonical brand-first path, the brand that owns it, and the live
 * crawl/command activity.
 *
 * It lives in its own module (not in `MarketingSiteLayoutClient`) for two
 * reasons: the layout and `lib/scopes/site-surface-base` would otherwise
 * import each other, and a HOST OUTSIDE `/marketing` can now supply the same
 * value and mount the same components. The CMS page editor's Measure tab does
 * exactly that — it reuses `PageWorkspace` wholesale rather than rebuilding a
 * poorer copy of it.
 *
 * `brandId` is part of the value on purpose: descendants used to read it from
 * `useParams()`, which only works under the `/marketing/brands/[brandId]/...`
 * route. An embedded host resolves it from the site row instead.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { SiteCrawlActivity } from "@/features/marketing/data/useSiteCrawlActivity";
import type { MarketingSite } from "@/features/marketing/types";

export interface MarketingSiteContextValue {
  site: MarketingSite;
  /** Canonical brand-first base path for this site (no trailing slash). */
  sitePath: string;
  /** The brand that owns this site — from the URL in the route layout. */
  brandId: string;
  crawlActivity: SiteCrawlActivity;
}

const MarketingSiteContext = createContext<MarketingSiteContextValue | null>(
  null,
);

export function useMarketingSite() {
  const value = useContext(MarketingSiteContext);
  if (!value)
    throw new Error(
      "useMarketingSite must be used inside a MarketingSiteProvider.",
    );
  return value;
}

export function MarketingSiteProvider({
  value,
  children,
}: {
  value: MarketingSiteContextValue;
  children: ReactNode;
}) {
  return (
    <MarketingSiteContext.Provider value={value}>
      {children}
    </MarketingSiteContext.Provider>
  );
}
