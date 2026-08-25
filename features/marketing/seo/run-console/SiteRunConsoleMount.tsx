"use client";

/**
 * The run console at the SITE (brand) tier — this brand alone.
 *
 * KI-049 (Arman's ruling, 2026-08-25): the same `RunConsole` component the
 * system and organization tiers mount, scoped to the one site this route sits
 * under. `siteId` comes from `MarketingSiteContext`, which the site layout
 * (`.../sites/[siteId]/layout.tsx` → `MarketingSiteLayoutClient`) already
 * resolves, access-gates, and provides — never re-read from `useParams()`
 * here (see `MarketingSiteContext.tsx`'s header comment on why).
 */

import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { RunConsole } from "./RunConsole";

export function SiteRunConsoleMount() {
  const { site } = useMarketingSite();
  return <RunConsole scope={{ tier: "site", siteId: site.id }} />;
}
