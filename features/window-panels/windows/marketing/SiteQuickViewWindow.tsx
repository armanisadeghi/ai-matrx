"use client";

/**
 * SiteQuickViewWindow — one site, in place, from nothing but its id.
 *
 * 🚨 F-87 — THE PANEL WRAPS THE CANONICAL COMPONENT. The platform already has a
 * site Quick view: `features/marketing/components/sites/SitePeekWindow.tsx`,
 * the floating panel the Sites portfolio and the Content Plan list open on a
 * row (its KPI tiles, its 90-day Search Console trend, its top pages, its
 * connection chips and a door to the full workspace). Nothing here re-renders
 * any of that — a bespoke body would be the second renderer the window-panels
 * law forbids (`features/window-panels/FEATURE.md` § A PANEL WRAPS THE
 * CANONICAL COMPONENT).
 *
 * WHAT THIS ADDS, and only this: the READ. `SitePeekWindow` takes a
 * `SiteListRow` — the site row merged with `web.v_site_kpis` and
 * `web.v_site_score` — which a list already holds and a door does not. The
 * canonical single-site read for exactly this shape already exists too
 * (`getSiteListRow`, "the exact enriched shape consumed by the shared Quick
 * view", reusing `listSites` so the metric semantics stay in one merge), and
 * the Content Plan list opens the Quick view through it. So this window is that
 * same fetch, made available to every surface that only knows a site's id — an
 * agent's answer about Search Console, a reference chip, a table cell.
 *
 * WHILE THE READ IS IN FLIGHT the window is a panel that says so, and a failed
 * read says THAT with a retry (law 4) — never an empty frame and never a click
 * that appears to do nothing.
 */

import { useQuery } from "@tanstack/react-query";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import SitePeekWindow from "@/features/marketing/components/sites/SitePeekWindow";
import { getSiteListRow } from "@/features/marketing/data/service";
import { marketingKeys } from "@/features/marketing/data/hooks";
import {
  InlineQueryError,
  LoadingSurface,
} from "@/features/marketing/components/shared/MarketingUi";

export interface SiteQuickViewWindowProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  /** The site's name as the opener already knew it, for the loading title. */
  siteLabel?: string | null;
}

export default function SiteQuickViewWindow({
  isOpen,
  onClose,
  siteId,
  siteLabel,
}: SiteQuickViewWindowProps) {
  const site = useQuery({
    // The SAME key the Content Plan list's Quick view uses, so opening a site
    // from a chat answer and from the list share one cached row.
    queryKey: [...marketingKeys.site(siteId), "list-row"] as const,
    queryFn: ({ signal }) => getSiteListRow(siteId, signal),
    enabled: isOpen,
    staleTime: 60_000,
  });
  if (!isOpen) return null;
  // THE CANONICAL QUICK VIEW, unchanged.
  if (site.data) return <SitePeekWindow site={site.data} onClose={onClose} />;
  return (
    <WindowPanel
      id="site-quick-view-window"
      overlayId="siteQuickViewWindow"
      title={siteLabel?.trim() || "Site"}
      onClose={onClose}
      width={460}
      height={320}
      minWidth={340}
      minHeight={220}
      position="top-right"
      onCollectData={() => ({ siteId, siteLabel: siteLabel ?? "" })}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {site.isError ? (
          <InlineQueryError
            what="this site"
            error={site.error}
            onRetry={() => void site.refetch()}
          />
        ) : (
          <LoadingSurface label="Loading this site…" />
        )}
      </div>
    </WindowPanel>
  );
}
