"use client";

/**
 * Visual render-blocks playground (dev demo) — exercises the Map, Stats (KPI),
 * and Diff render blocks directly (no chat pipeline) with realistic sample
 * content, so we can eyeball leaflet tiles, the KPI cards, and the diff lib
 * rendering without standing up a full agent turn.
 */

import React from "react";
import dynamic from "next/dynamic";

const MapBlock = dynamic(() => import("@/components/mardown-display/blocks/map/MapBlock").then((m) => m.MapBlock), { ssr: false });
const StatsBlock = dynamic(() => import("@/components/mardown-display/blocks/stats/StatsBlock").then((m) => m.StatsBlock), { ssr: false });
const DiffBlock = dynamic(() => import("@/components/mardown-display/blocks/diff/DiffBlock").then((m) => m.DiffBlock), { ssr: false });

const MAP = JSON.stringify({
  title: "Trip itinerary",
  markers: [
    { lat: 48.8584, lng: 2.2945, label: "Eiffel Tower", description: "Day 1 — morning" },
    { lat: 48.8606, lng: 2.3376, label: "Louvre", description: "Day 1 — afternoon" },
    { lat: 48.8530, lng: 2.3499, label: "Notre-Dame", description: "Day 2" },
  ],
});

const STATS = JSON.stringify({
  title: "Q3 results",
  stats: [
    { label: "Revenue", value: "$1.2M", change: "+12%", trend: "up" },
    { label: "Active users", value: "8,400", change: "+5%", trend: "up" },
    { label: "Churn", value: "2.1%", change: "-0.4pt", trend: "down" },
    { label: "NPS", value: "52", hint: "up from 47" },
  ],
});

const DIFF = JSON.stringify({
  title: "Refactor: guard clause",
  old: "function f(x) {\n  if (x) {\n    return x.value;\n  }\n  return null;\n}",
  new: "function f(x) {\n  if (!x) return null;\n  return x.value;\n}",
  split: true,
});

export default function VisualBlocksDemoPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Visual render blocks</h1>
        <p className="text-sm text-muted-foreground">Map · Stats (KPI) · Diff — rendered directly from their JSON specs.</p>
      </header>

      <section>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">```map</h2>
        <MapBlock content={MAP} />
      </section>

      <section>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">```stats</h2>
        <StatsBlock content={STATS} />
      </section>

      <section>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">```diff</h2>
        <DiffBlock content={DIFF} />
      </section>
    </div>
  );
}
