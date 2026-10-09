/**
 * The ONE reader of a ```map fence: a JSON object with `markers` (or
 * `places`, or a bare array) → a map spec, or the reason it is not one. Used
 * by the live MapBlock and by the map's print adapter (no React, no Leaflet).
 */

import type { MapMarker } from "./MapCanvas";
import { soleFence } from "@/lib/markdown/code-ranges";

export interface MapSpec {
  title?: string;
  center?: [number, number];
  zoom?: number;
  markers: MapMarker[];
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export function parseMap(raw: string): MapSpec | { error: string } {
  let s = raw.trim();
  // A wrapping fence by THE one code-range rule.
  const fenced = soleFence(s);
  if (fenced && ["", "json", "map"].includes(fenced.lang.toLowerCase()))
    s = fenced.body.trim();
  let obj: unknown;
  try {
    obj = JSON.parse(s);
  } catch {
    try {
      obj = JSON.parse(s.replace(/,(\s*[}\]])/g, "$1"));
    } catch {
      return { error: "Map needs a JSON object with a `markers` array." };
    }
  }
  const o = (Array.isArray(obj) ? { markers: obj } : obj) as Record<
    string,
    unknown
  >;
  const rawMarkers = Array.isArray(o.markers)
    ? o.markers
    : Array.isArray(o.places)
      ? o.places
      : [];
  const markers: MapMarker[] = (rawMarkers as Record<string, unknown>[])
    .map((m): MapMarker | null => {
      const lat = num(
        m?.lat ??
          m?.latitude ??
          (Array.isArray(m?.coordinates) ? m.coordinates[0] : undefined) ??
          (Array.isArray(m?.coords) ? m.coords[0] : undefined),
      );
      const lng = num(
        m?.lng ??
          m?.lon ??
          m?.longitude ??
          (Array.isArray(m?.coordinates) ? m.coordinates[1] : undefined) ??
          (Array.isArray(m?.coords) ? m.coords[1] : undefined),
      );
      if (lat == null || lng == null) return null;
      return {
        lat,
        lng,
        label:
          m?.label != null
            ? String(m.label ?? m.name)
            : m?.name != null
              ? String(m.name)
              : undefined,
        description: m?.description != null ? String(m.description) : undefined,
      };
    })
    .filter((m): m is MapMarker => m != null);
  if (markers.length === 0)
    return { error: "Map `markers` need at least one {lat, lng} point." };
  const c = o.center as unknown;
  let center: [number, number] | undefined;
  if (Array.isArray(c)) {
    const centerLat = num(c[0]);
    const centerLng = num(c[1]);
    if (centerLat != null && centerLng != null) {
      center = [centerLat, centerLng];
    }
  }
  return {
    title: typeof o.title === "string" ? o.title : undefined,
    center,
    zoom: num(o.zoom),
    markers,
  };
}
