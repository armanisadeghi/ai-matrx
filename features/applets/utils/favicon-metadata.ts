import { generateSVGFavicon, svgToDataURI } from "@/utils/favicon-utils";
import type { Metadata } from "next";

const DEFAULT_APPLET_FAVICON = { color: "#6366f1", letter: "AA" };

export type AppletIconsVariant = "default" | "demo";

/**
 * Deterministic per-app badge palette. Same name always yields the same color,
 * so an app's icon is stable without persisting anything.
 */
const APPLET_FAVICON_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#6366f1",
  "#a855f7",
  "#f43f5e",
  "#0ea5e9",
  "#84cc16",
  "#d946ef",
] as const;

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash = hash & hash;
  }
  return APPLET_FAVICON_COLORS[
    Math.abs(hash) % APPLET_FAVICON_COLORS.length
  ];
}

function initialsForName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return DEFAULT_APPLET_FAVICON.letter;
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** The retired database's project ref — its storage host serves nothing any more. */
const RETIRED_STORAGE_HOST_REF = "txzxabzwovsujtloxrus";

/**
 * Agent-app tab icon.
 *
 * Computed inline as a `data:` URI — there is no hosted favicon file and no
 * server round-trip. `faviconUrl` is only honoured for legacy rows that were
 * populated before the badge became render-time-generated (2026-07-26); new
 * apps never write it.
 */
export function getAppletIconsMetadata(
  faviconUrl?: string | null,
  name?: string | null,
  _variant: AppletIconsVariant = "default",
): Metadata["icons"] {
  // A stored URL on the RETIRED database host points at a file that no longer exists (20 legacy
  // published Applets carried one — feedback c59b2e74): it is never honoured, the badge is drawn.
  if (faviconUrl && !faviconUrl.includes(RETIRED_STORAGE_HOST_REF)) {
    return {
      icon: [{ url: faviconUrl, type: "image/svg+xml" }],
    };
  }

  const config = name
    ? { color: colorForName(name), letter: initialsForName(name) }
    : DEFAULT_APPLET_FAVICON;

  const svg = generateSVGFavicon(config);
  const dataURI = svgToDataURI(svg);

  return {
    icon: [{ url: dataURI, type: "image/svg+xml" }],
  };
}
