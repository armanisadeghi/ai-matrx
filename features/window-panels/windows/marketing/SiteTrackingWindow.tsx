"use client";

/**
 * SiteTrackingWindow — one site's Tag Manager tracking beside whatever the reader was already
 * looking at.
 *
 * The window is the FRAME only: it wraps the canonical `SiteTrackingPanel`, the same component
 * the site's Integrations settings section mounts. A bespoke body here would be a second renderer
 * that drifts (the window-panels law, `features/window-panels/FEATURE.md`).
 */

import { useQuery } from "@tanstack/react-query";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { SiteTrackingPanel } from "@/features/marketing/tracking/components/SiteTrackingPanel";
import { getSite } from "@/features/marketing/data/service";
import { marketingKeys } from "@/features/marketing/data/hooks";
import {
  InlineQueryError,
  LoadingSurface,
} from "@/features/marketing/components/shared/MarketingUi";

export interface SiteTrackingWindowProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  siteLabel?: string | null;
}

export default function SiteTrackingWindow({
  isOpen,
  onClose,
  siteId,
  siteLabel,
}: SiteTrackingWindowProps) {
  const site = useQuery({
    queryKey: [...marketingKeys.site(siteId), "record"] as const,
    queryFn: ({ signal }) => getSite(siteId, signal),
    enabled: isOpen,
  });
  if (!isOpen) return null;
  return (
    <WindowPanel
      id="site-tracking-window"
      overlayId="siteTrackingWindow"
      title={siteLabel ? `Tracking — ${siteLabel}` : "Tracking"}
      onClose={onClose}
      width={760}
      height={700}
      minWidth={420}
      minHeight={360}
      position="top-right"
      urlSyncId={siteId}
      onCollectData={() => ({ siteId, siteLabel: siteLabel ?? "" })}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {site.isLoading ? (
          <LoadingSurface label="Loading this site's tracking…" />
        ) : site.isError ? (
          <InlineQueryError
            what="this site"
            error={site.error}
            onRetry={() => void site.refetch()}
          />
        ) : site.data ? (
          <SiteTrackingPanel site={site.data} variant="bare" />
        ) : null}
      </div>
    </WindowPanel>
  );
}
