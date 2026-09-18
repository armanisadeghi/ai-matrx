"use client";

/**
 * OUTLINE — the map's index screen, and the one that owns `seo.map_diagnostics`.
 *
 * Phase 0 renders the U1 harness (`MapTreeHarness`); Lane A replaces the body
 * with the real outline drawing and keeps the same props, the same selectors
 * and the same reads.
 *
 * It also carries the door to the topic panel. The harness list itself is
 * coordinator-owned, so the control lives beside it rather than on its rows —
 * that is a Phase 0 shape, not the destination: Lane A puts the door on the row
 * (THE DOOR LAW) when it draws them.
 */

import { BookOpen } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";

import { useOpenTopicPanel } from "@/features/overlays/openers/topicalMapTopicPanel";

import type { MapViewProps } from "../components/TopicalMapWorkspaceBody";
import { selectMapSelectedSlug } from "../redux/selectors";
import { MapTreeHarness } from "./MapTreeHarness";

export function OutlineView({ mapId, siteId }: MapViewProps) {
  return (
    <MapTreeHarness
      mapId={mapId}
      siteId={siteId}
      view="outline"
      showDiagnostics
      actions={<OpenTopicControl mapId={mapId} siteId={siteId} />}
    />
  );
}

/**
 * The topic panel's door.
 *
 * With nothing selected this says so in words rather than rendering a greyed
 * button: a control that looks clickable and is not is the exact defect the
 * "nothing fails silently" law names.
 */
function OpenTopicControl({
  mapId,
  siteId,
}: {
  mapId: string;
  siteId: string | null;
}) {
  const selectedSlug = useAppSelector(selectMapSelectedSlug(mapId));
  const openTopicPanel = useOpenTopicPanel();

  if (!selectedSlug) {
    return (
      <p className="text-xs text-muted-foreground">
        Pick a topic in the list below to open its panel.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => openTopicPanel({ mapId, slug: selectedSlug, siteId })}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <BookOpen className="h-4 w-4" aria-hidden />
      Open topic
      <span className="font-mono text-xs text-muted-foreground">
        {selectedSlug}
      </span>
    </button>
  );
}
