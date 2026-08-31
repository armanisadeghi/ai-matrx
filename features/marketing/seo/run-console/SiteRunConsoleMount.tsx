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

import { usePathname } from "next/navigation";

import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { RunConsole } from "./RunConsole";
import { runConsoleBasePath } from "./routed-view";

export function SiteRunConsoleMount({
  /**
   * The result view fixed by the ROUTE — `…/automations/{proposals,unplaced,
   * history}`, the bare `…/automations` being This run. Left out, the console
   * keeps its own local tab state.
   */
  view,
}: {
  view?: string;
} = {}) {
  const { site } = useMarketingSite();
  const pathname = usePathname();
  const basePath = pathname ? runConsoleBasePath(pathname, view) : undefined;
  return (
    <RunConsole
      scope={{ tier: "site", siteId: site.id }}
      view={view}
      basePath={basePath}
    />
  );
}
