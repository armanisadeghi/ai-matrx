"use client";

// features/marketing/seo/topical-map/views/pages/runs/MapRunControls.tsx
//
// THE THREE RUNS OF THE PAGES WORKSPACE, in one dense header row: put the pages
// on the map, give them their regions, propose where each one is going. Entry
// point of lane F's run piece — props frozen in `../seams.ts`.
//
// 🚨 `readOnly` MEANS ABSENT, NOT DISABLED. A record-only grantee and a canvas
// viewer get no row at all. A greyed-out "Map the pages" would be a control that
// looks like it could act and cannot, which is the same defect as a dead link.
//
// ONE SITE, CHOSEN ONCE. All three endpoints are `/seo/sites/{site_id}/map/…`,
// so when the workspace was opened without `?site=` each popover offers the
// chooser instead of Start. The choice is held HERE rather than in each control:
// picking the site for the mapper and then being asked again by the proposer is
// the same question three times.

import { useState } from "react";

import type { MapRunControlsProps } from "../seams";
import { MapPagesRunControl } from "./MapPagesRunControl";
import { MapRegionsRunControl } from "./MapRegionsRunControl";
import { ProposeIntentsRunControl } from "./ProposeIntentsRunControl";

export function MapRunControls({ context }: MapRunControlsProps) {
  const [chosenSiteId, setChosenSiteId] = useState<string | null>(null);

  if (context.readOnly) return null;

  const siteId = context.siteId ?? chosenSiteId;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MapPagesRunControl
        context={context}
        siteId={siteId}
        onChooseSite={setChosenSiteId}
      />
      <MapRegionsRunControl
        context={context}
        siteId={siteId}
        onChooseSite={setChosenSiteId}
      />
      <ProposeIntentsRunControl
        context={context}
        siteId={siteId}
        onChooseSite={setChosenSiteId}
      />
    </div>
  );
}
