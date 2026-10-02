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
 * narrow screen or for someone who reads one topic at a time. The `drawer`
 * answer is the app's right-hand region — a `topical-map-topic` canvas tab —
 * so this overlay hands the topic to the canvas and closes itself.
 *
 * A missing knob row RAISES by design (there is no code default anywhere in
 * this feature), so nothing is framed while the read is in flight and a failed
 * read is announced with the function's own sentence — never a guessed frame.
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useEffect, useRef } from "react";
import { useOptionalCanvas } from "@ai-matrx/canvas/react";
import { openCanvasItem } from "@/features/canvas/host/openCanvasItem";
import { topicTabOpenInput } from "@/features/marketing/seo/topical-map/canvas/topicKind";
import { toast } from "@/lib/toast";
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

  const canvas = useOptionalCanvas();
  const frame = loading || (!knobs && !error) ? "pending" : !knobs ? "failed" : knobs.detail_panel;
  const handed = useRef(false);

  // The drawer is a canvas tab; a failed knob read is said aloud. Either way
  // this overlay instance has nothing left to frame and closes.
  useEffect(() => {
    if (handed.current || (frame !== "drawer" && frame !== "failed")) return;
    handed.current = true;
    if (frame === "drawer") {
      openCanvasItem(canvas, topicTabOpenInput({ mapId, slug, siteId }));
    } else {
      toast.error("Couldn't read this organization's map settings", error ? { description: error.message } : undefined);
    }
    onClose();
  }, [frame, canvas, mapId, slug, siteId, error, onClose]);

  if (frame !== "window") return null;

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
