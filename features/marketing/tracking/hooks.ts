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
import type { SiteTrackingStatusInput } from "@/features/marketing/lib/site-status";
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
 */
export function useSiteTrackingStatus(site: {
  id: string;
  organization_id: string;
}): SiteTrackingStatusInput & { isLoading: boolean } {
  const snapshot = useLatestTrackingSnapshot({
    siteId: site.id,
    organizationId: site.organization_id,
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
