"use client";

/**
 * MapBlock — the in-chat render block for ```map fences.
 *
 * A JSON spec of markers/places renders as an interactive Leaflet map (pan,
 * zoom, marker popups, auto-fit bounds). Great for itineraries, store locators,
 * "where is X". Light shell: leaflet is isolated in MapCanvas, loaded ONLY via
 * `next/dynamic ssr:false` so it never enters the server build.
 */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Copy, List, MapPin, TriangleAlert } from "lucide-react";
import { toast } from "@/lib/toast";

import { Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";

import type { MapMarker } from "./MapCanvas";
import { soleFence } from "@/lib/markdown/code-ranges";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useCanvasPresentation } from "@ai-matrx/canvas/react";
import { mapPlacesList } from "@/components/mardown-display/blocks/canvas-adaptive";
import { Button, Tile } from "@ai-matrx/design-system/controls";

interface MapSpec {
  title?: string;
  center?: [number, number];
  zoom?: number;
  markers: MapMarker[];
}

const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

export interface MapBlockProps {
  content?: string;
  isStreamActive?: boolean;
  className?: string;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function parseMap(raw: string): MapSpec | { error: string } {
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

export const MapBlock: React.FC<MapBlockProps> = ({
  content = "",
  isStreamActive = false,
  className,
}) => {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  const parsed = useMemo(
    () => (isStreamActive ? null : parseMap(content)),
    [content, isStreamActive],
  );
  const spec = parsed && !("error" in parsed) ? parsed : null;
  const error = parsed && "error" in parsed ? parsed.error : null;
  const [copied, setCopied] = useState(false);
  // In a canvas pane the map carries its list of places: beside it in a wide
  // pane, behind a toggle in a narrow one. Outside the canvas: map only.
  const placesList = mapPlacesList(useCanvasPresentation());
  const [listOpen, setListOpen] = useState(false);
  const [focus, setFocus] = useState<{
    lat: number;
    lng: number;
    seq: number;
  } | null>(null);
  const showList =
    placesList === "side" || (placesList === "toggle" && listOpen);

  const handleCopy = async () => {
    try {
      if (!(await copyText(content.trim()))) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <div
      className={cn(
        "my-3 overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium text-foreground">
            {spec?.title ?? "Map"}
          </span>
          {spec && (
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              {spec.markers.length}{" "}
              {spec.markers.length === 1 ? "place" : "places"}
            </span>
          )}
          {isStreamActive && (
            <span className="shrink-0 animate-pulse text-xs text-muted-foreground">
              …
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {!isStreamActive && spec && placesList === "toggle" && (
            <Button variant="quiet" pressed={listOpen} icon={<List />} aria-label={listOpen ? "Hide places" : "Show places"} title={listOpen ? "Hide places" : "Show places"} onClick={() => setListOpen((v) => !v)} />
          )}
          {!isStreamActive && spec && (
            <Button variant="quiet" icon={copied ? (
                <Check />
              ) : (
                <Copy />
              )} aria-label={copied ? "Copied" : "Copy source"} title={copied ? "Copied" : "Copy source"} onClick={handleCopy} />
          )}
        </div>
      </div>
      <div className="p-3">
        {isStreamActive ? (
          <Skeleton className="h-72 w-full" />
        ) : error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-xs text-muted-foreground">{error}</p>
            <ErrorAlchemyMenu error={error} />
          </div>
        ) : spec ? (
          <div
            data-map-places={placesList ?? "none"}
            className={cn(
              "flex w-full gap-2",
              placesList === "side" ? "flex-row" : "flex-col",
            )}
          >
            <div
              className={cn(
                "w-full min-w-0 overflow-hidden rounded-md border border-border",
                placesList === "side" && "flex-1",
                placesList ? "h-96" : "h-72",
              )}
            >
              <MapCanvas
                markers={spec.markers}
                center={spec.center}
                zoom={spec.zoom}
                focus={focus}
              />
            </div>
            {showList && (
              <ol
                aria-label="Places"
                className={cn(
                  "overflow-y-auto rounded-md border border-border bg-background/60 p-1",
                  placesList === "side"
                    ? "h-96 w-60 shrink-0"
                    : "max-h-56 w-full",
                )}
              >
                {spec.markers.map((m, i) => (
                  <li key={i}>
                    <Tile
                      variant="quiet"
                      onClick={() =>
                        setFocus({
                          lat: m.lat,
                          lng: m.lng,
                          seq: i + Date.now(),
                        })
                      }
                      icon={<MapPin />}
                      glyphTone="primary"
                      title={m.label ?? `${m.lat.toFixed(3)}, ${m.lng.toFixed(3)}`}
                      line={m.description || undefined}
                    />
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default MapBlock;
