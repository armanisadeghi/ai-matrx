"use client";

/**
 * SiteQuickViewWindow — one site, in place, from nothing but its id.
 *
 * 🚨 F-87 — THE PANEL WRAPS THE CANONICAL COMPONENT. The platform already has a
 * site Quick view: `features/marketing/components/sites/SitePeekBody.tsx`, the
 * content the Sites portfolio and the Content Plan list show when they open a
 * row (its KPI tiles, its 90-day Search Console trend, its top pages, its
 * connection chips and a door to the full workspace). Nothing here re-renders
 * any of that — a bespoke body would be the second renderer the window-panels
 * law forbids (`features/window-panels/FEATURE.md` § A PANEL WRAPS THE
 * CANONICAL COMPONENT).
 *
 * WHAT THIS ADDS, and only this: the READ. The Quick view takes a
 * `SiteListRow` — the site row merged with `web.v_site_kpis` and
 * `web.v_site_score` — which a list already holds and a door does not. The
 * canonical single-site read for exactly this shape already exists too
 * (`getSiteListRow`, "the exact enriched shape consumed by the shared Quick
 * view", reusing `listSites` so the metric semantics stay in one merge), and
 * the Content Plan list opens the Quick view through it. So this window is that
 * same fetch, made available to every surface that only knows a site's id — an
 * agent's answer about Search Console, a reference chip, a table cell.
 *
 * 🚨 F-88 — ONE PANEL, FOR THE WINDOW'S WHOLE LIFE. The body swaps; the panel
 * never does. F-87 shipped this window returning `SitePeekWindow` — a second,
 * standalone `WindowPanel` carrying no `overlayId` — as soon as the read
 * resolved, so the `siteQuickViewWindow`-bound panel UNMOUNTED at that moment:
 * the overlay stopped owning the window on screen (its `onCollectData`, its
 * tray row, its restore and its close from the `OverlayController` all applied
 * to a panel that was gone), and the chrome blinked out while the lazy peek
 * module loaded. The fix is the SLOTS contract read literally — the panel is
 * the chrome and the content is `children`, so `id`, `overlayId` and
 * `onCollectData` are constant from the first paint (same shape as the Detail
 * primitive: `detail/shells/DetailWindowShell.tsx` owns one panel and the
 * presentation fills it, loading state included).
 *
 * WHILE THE READ IS IN FLIGHT the panel says so, and a failed read says THAT
 * with a retry (law 4) — never an empty frame and never a click that appears to
 * do nothing.
 */

import { useQuery } from "@tanstack/react-query";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import SitePeekBody from "@/features/marketing/components/sites/SitePeekBody";
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
  return (
    <WindowPanel
      id="site-quick-view-window"
      overlayId="siteQuickViewWindow"
      // The row's own name once it is known — the panel identity above is what
      // persistence and the tray key on, so the title is free to sharpen.
      title={site.data?.name ?? siteLabel?.trim() ?? "Site"}
      // V-23 / R35 — the site id IS the address. Without this the URL would
      // carry `site_quick_view:siteQuickViewWindow` and the link would reopen
      // an empty frame instead of this site.
      urlSyncId={siteId}
      onClose={onClose}
      // The peek's own geometry from the first paint: a panel that resized
      // itself when the read landed would move under the person's cursor and
      // fight the rect the workspace restored.
      width={460}
      height={620}
      minWidth={380}
      minHeight={400}
      position="top-right"
      onCollectData={() => ({ siteId, siteLabel: siteLabel ?? "" })}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      {site.data ? (
        // THE CANONICAL QUICK VIEW CONTENT, unchanged — the same component the
        // two list callers mount inside their own panel.
        <SitePeekBody site={site.data} />
      ) : (
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
      )}
    </WindowPanel>
  );
}
