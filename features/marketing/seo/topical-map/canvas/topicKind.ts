"use client";

/**
 * One topic of a topical map as a canvas tab (`topical-map-topic`), keyed by
 * (map, topic) — the same identity the floating window uses — so opening the
 * same topic again focuses its tab and another topic gets its own tab beside
 * it. This is the `drawer` answer of the map's `detail_panel` knob: the
 * right-hand region is the canvas. The topic is read again from its row, so
 * the tab comes back after a reload. Light: the body loads only when a tab
 * renders.
 */

import { Brain } from "lucide-react";
import type { CanvasOpenInput } from "@ai-matrx/canvas";
import { defineCanvasKind, type AnyCanvasKind } from "@ai-matrx/canvas/react";
import { topicPanelInstanceId } from "../panel/topicPanelInstance";

export const TOPICAL_MAP_TOPIC_KIND = "topical-map-topic";

export type TopicTabData = {
  mapId: string;
  slug: string;
  siteId: string | null;
};

/** The tab's name until the body has read the topic: its slug, in words. */
function slugWords(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Topic";
}

export function topicTabOpenInput(data: TopicTabData): CanvasOpenInput {
  return { kind: TOPICAL_MAP_TOPIC_KIND, key: topicPanelInstanceId(data), title: slugWords(data.slug), data };
}

export function readTopicTabData(data: unknown): TopicTabData | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const { mapId, slug, siteId } = data as Record<string, unknown>;
  if (typeof mapId !== "string" || !mapId || typeof slug !== "string" || !slug) return null;
  return { mapId, slug, siteId: typeof siteId === "string" && siteId ? siteId : null };
}

export const TOPICAL_MAP_TOPIC_CANVAS_KIND: AnyCanvasKind = defineCanvasKind<TopicTabData>({
  id: TOPICAL_MAP_TOPIC_KIND,
  surface: "dom",
  label: "Topic",
  icon: Brain,
  load: () => import("./TopicCanvasView"),
  title: (data) => slugWords(data.slug),
  restore: true,
});
