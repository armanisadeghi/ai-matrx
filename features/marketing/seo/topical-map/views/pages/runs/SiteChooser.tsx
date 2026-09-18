"use client";

// features/marketing/seo/topical-map/views/pages/runs/SiteChooser.tsx
//
// 🚨 ALL THREE RUNS ARE RUN FOR ONE SITE. The endpoints are
// `POST /seo/sites/{site_id}/map/…`: the ledger a run works belongs to a SITE,
// not to the map, and a map can be used by several. When the workspace was
// opened without `?site=`, `context.siteId` is null and there is nothing to run
// against yet — so the popover offers the choice INSTEAD of Start rather than
// showing a Start button that would launch against "none" and come back as a
// uuid cast error.
//
// Doors, not labels: every site named here opens (peek + new tab) through
// `EntityRef`, which is the only reason a person can tell two of their own
// sites apart from a uuid.

import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";

export interface SiteChooserProps {
  /** `seo.map_diagnostics.sites_using_map` — every site this map is used by. */
  siteIds: readonly string[];
  onChoose: (siteId: string) => void;
}

export function SiteChooser({ siteIds, onChoose }: SiteChooserProps) {
  if (siteIds.length === 0) {
    return (
      <p className="text-muted-foreground">
        This map is not used by any site you can view — bind one from the map
        home.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground">
        This runs for one site. Pick which one.
      </p>
      <ul className="space-y-1">
        {siteIds.map((siteId) => (
          <li key={siteId} className="flex items-center justify-between gap-2">
            <EntityRef token="web_site" id={siteId} className="min-w-0" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 shrink-0 text-xs"
              onClick={() => onChoose(siteId)}
            >
              Use this site
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
