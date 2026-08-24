"use client";

/**
 * WHICH LOCATION — the whole C10 answer on one screen: what is ready, and how
 * traffic actually splits across the branches.
 *
 * ORDER IS THE ARGUMENT. Readiness first, decomposition second. On real data
 * today the split for both test sites is "essentially everything is
 * non-location-specific", and that is only an honest sentence if the reader has
 * already been told why — no locations yet, or no keyword read for a place yet.
 * Numbers on top of an unexplained zero is how a dashboard lies without saying
 * anything false.
 *
 * It lives on the rules bench because that is where geography is authored on
 * this site today (service areas + the place-detection strip). The Insights tab
 * gets the same component the moment the drill-panels chip lands — this is a
 * composed panel with no page of its own, precisely so it can be mounted twice
 * without a second implementation appearing.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md § C10.
 */

import { useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { LocationDecomposition } from "./LocationDecomposition";
import { LocationReadiness } from "./LocationReadiness";
import { locationSurfaceQueryKeys } from "./data";

export function LocationPanel({
  siteId,
  brandId,
  organizationId,
  window,
  windowLabel,
  onGoToPlaceDetection,
  onBindArea,
}: {
  siteId: string;
  brandId: string;
  organizationId: string | null;
  window: {
    start: string;
    end: string;
    compareStart: string | null;
    compareEnd: string | null;
  };
  windowLabel: string;
  onGoToPlaceDetection?: () => void;
  onBindArea?: () => void;
}) {
  const queryClient = useQueryClient();
  const refreshAll = () => {
    for (const key of locationSurfaceQueryKeys(siteId)) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  return (
    <section className="space-y-2">
      <div>
        <h2 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Building2 className="h-3.5 w-3.5 text-primary" aria-hidden />
          Which location
        </h2>
        <p className="mt-0.5 max-w-2xl text-[11px] leading-4 text-muted-foreground">
          For a business with more than one address, &ldquo;local&rdquo; is not
          the answer — <em>which branch</em> is. Every local search is attributed
          to one location by the strongest evidence available, and what could not
          be placed stays visible as its own row rather than disappearing.
        </p>
      </div>

      <LocationReadiness
        siteId={siteId}
        brandId={brandId}
        organizationId={organizationId}
        onGoToPlaceDetection={onGoToPlaceDetection}
        onBindArea={onBindArea}
        onChanged={refreshAll}
      />

      <LocationDecomposition
        siteId={siteId}
        brandId={brandId}
        window={window}
        windowLabel={windowLabel}
      />
    </section>
  );
}
