"use client";

/**
 * The topical map's topic panel (CONTRACTS.md §5).
 *
 * This file is CHROME ONLY. It decides which frame the panel wears and wraps
 * exactly ONE `<TopicDetailBody>` — the same component the peek renders and the
 * same one the canvas will. A second, panel-flavoured body would be a second
 * renderer that drifts (CLAUDE.md § A WINDOW PANEL WRAPS THE CANONICAL
 * COMPONENT).
 *
 * WHICH FRAME IS AN ORGANIZATION'S CHOICE, NOT OURS: the `detail_panel` knob
 * (`seo.topical_map`) says `window` or `drawer`, and both are real answers —
 * a window keeps the map visible behind it, a drawer is the right shape on a
 * narrow screen or for someone who reads one topic at a time.
 *
 * A missing knob row RAISES by design (there is no code default anywhere in
 * this feature), so this renders the component-library loading state while the
 * read is in flight and the function's own sentence when it fails — never a
 * guessed frame.
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { SidePanelSurface } from "@/features/overlays/surfaces/SidePanelSurface";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { TopicalMapFailed } from "@/features/marketing/seo/topical-map/components/TopicalMapStates";
import { TopicDetailBody } from "@/features/marketing/seo/topical-map/panel/TopicDetailBody";
import { useTopicalMapKnobs } from "@/features/marketing/seo/topical-map/knobs";

export interface TopicalMapTopicPanelProps {
  onClose: () => void;
  /** The overlay instanceId — also the window-manager id, so re-open can focus it. */
  instanceId: string;
  /** How many topic panels were already open — cascades the initial rect. */
  stackIndex?: number;
  mapId: string;
  slug: string;
  siteId: string | null;
}

export default function TopicalMapTopicPanel({
  onClose,
  instanceId,
  stackIndex = 0,
  mapId,
  slug,
  siteId,
}: TopicalMapTopicPanelProps) {
  const { knobs, loading, error } = useTopicalMapKnobs();

  // The frame is not known yet. A takeover would be a guess, so the loading
  // state goes in the lighter of the two frames and says what it is waiting on.
  if (loading || (!knobs && !error)) {
    return (
      <SidePanelSurface title="Topic" onClose={onClose}>
        <SuspenseLoader message="Loading this organization's panel settings…" />
      </SidePanelSurface>
    );
  }

  if (!knobs) {
    return (
      <SidePanelSurface title="Topic" onClose={onClose}>
        <div className="p-4">
          <TopicalMapFailed what="this organization's map settings" error={error} />
        </div>
      </SidePanelSurface>
    );
  }

  // Cascade so a second topic never lands perfectly on top of the first —
  // reading two topics side by side is the reason this panel floats.
  const cascade = (stackIndex % 8) * 28;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const rect = {
    width: Math.min(480, vw - 32),
    height: Math.min(560, vh - 32),
    x: Math.max(0, Math.min((vw - 480) / 2 + cascade, vw - 320)),
    y: Math.max(0, Math.min((vh - 560) / 4 + cascade, vh - 240)),
  };

  if (knobs.detail_panel === "drawer") {
    return (
      <SidePanelSurface
        title="Topic"
        description="One topic of this brand's topical map."
        onClose={onClose}
      >
        <TopicDetailBody
          mapId={mapId}
          slug={slug}
          siteId={siteId}
          host="drawer"
          onClose={onClose}
        />
      </SidePanelSurface>
    );
  }

  return (
    <WindowPanel
      id={instanceId}
      title="Topic"
      onClose={onClose}
      overlayId="topicalMapTopicPanel"
      overlayInstanceId={instanceId}
      // V-23 / R35 — the registry has declared `urlSync: { key: "topic" }`
      // since this panel shipped, but with no `urlSyncId` every instance wrote
      // the SAME token (`topic:topicalMapTopicPanel`), so two open topics
      // collapsed to one address. The instance id is already `<mapId>|<slug>`
      // — the panel's identity — so it is the address, and the site in scope
      // rides as an arg.
      urlSyncId={instanceId}
      urlSyncArgs={siteId ? { s: siteId } : undefined}
      minWidth={360}
      minHeight={280}
      initialRect={rect}
      onCollectData={() => ({ mapId, slug, siteId })}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <TopicDetailBody
        mapId={mapId}
        slug={slug}
        siteId={siteId}
        host="window"
        onClose={onClose}
      />
    </WindowPanel>
  );
}
