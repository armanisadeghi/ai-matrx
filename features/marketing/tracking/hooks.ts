"use client";

/**
 * The reads behind the tracking chip and the tracking panel. ONE hook, so the chip on a site row
 * and the panel in a window make the SAME query (react-query dedupes it by key) and can never
 * show two different verdicts for one site.
 */

import { useQuery } from "@tanstack/react-query";

import { marketingKeys } from "@/features/marketing/data/hooks";
import { readLatestTrackingSnapshot } from "@/features/marketing/tracking/service";
import { useTrackingSnapshotMaxAgeHours } from "@/features/marketing/tracking/knobs";
import {
  siteConnectionStatuses,
  siteHasTagManagerContainer,
  type SiteConnectionStatus,
  type SiteStatusInput,
  type SiteTrackingStatusInput,
} from "@/features/marketing/lib/site-status";
import type { MarketingSite } from "@/features/marketing/types";
import type { TagManagerSnapshotRow } from "@/features/marketing/tracking/types";

export function trackingSnapshotKey(siteId: string) {
  return [...marketingKeys.site(siteId), "tag-manager-snapshot"] as const;
}

export function useLatestTrackingSnapshot(args: {
  siteId: string;
  organizationId: string;
  enabled?: boolean;
}) {
  return useQuery<TagManagerSnapshotRow | null>({
    queryKey: trackingSnapshotKey(args.siteId),
    queryFn: ({ signal }) =>
      readLatestTrackingSnapshot({
        siteId: args.siteId,
        organizationId: args.organizationId,
        signal,
      }),
    enabled: args.enabled ?? true,
  });
}

/**
 * Everything `siteConnectionStatuses` needs for its sixth chip. While the read is in flight the
 * snapshot is `null`, which the derivation renders as the honest binding-only answer — never a
 * chip that flickers from "off" to "connected".
 *
 * The snapshot read is gated on the BINDING: a site with no container bound can have no
 * snapshot, and the verdict there comes from the binding alone, so a portfolio of unbound sites
 * costs no queries at all. The knob read is one shared query key for the whole screen.
 */
export function useSiteTrackingStatus(site: {
  id: string;
  organization_id: string;
  integrations: MarketingSite["integrations"];
}): SiteTrackingStatusInput & { isLoading: boolean } {
  const snapshot = useLatestTrackingSnapshot({
    siteId: site.id,
    organizationId: site.organization_id,
    enabled: siteHasTagManagerContainer(site),
  });
  const knob = useTrackingSnapshotMaxAgeHours();
  return {
    snapshot: snapshot.data ?? null,
    maxAgeHours: knob.hours,
    // 🚨 The knob's FAILURE travels with its value. Dropping it here is how the chip went on
    // quietly never calling anything stale, announcing nothing (V-27 NEW-5): `maxAgeHours: null`
    // and "the knob could not be read" look identical downstream unless the reason rides along.
    thresholdUnavailable: knob.unavailableReason,
    isLoading: snapshot.isLoading,
  };
}

/**
 * 🚨 THE ONE WAY A SURFACE GETS THE SIX CONNECTION STATUSES.
 *
 * The chip strip, the site record's Connections board, the brand's site table and cards, the
 * brand workspace's site list and the site surface's agent context all read this, so the
 * snapshot and the staleness knob — including WHY the knob could not be read — reach every one
 * of them identically. Before 2026-09-20 each surface chose whether to pass the tracking input
 * and four of five did not, so the knob's failure reason reached the panel and nothing else
 * (V-28 NEW-1). Nothing to choose now: the input is read where the statuses are derived.
 *
 * Both reads are React Query, keyed by site and by knob, so N surfaces over one site make one
 * request each and not N.
 */
export function useSiteConnectionStatuses(
  site: SiteStatusInput & {
    id: string;
    organization_id: string;
  },
): SiteConnectionStatus[] {
  const tracking = useSiteTrackingStatus(site);
  return siteConnectionStatuses(site, tracking);
}
