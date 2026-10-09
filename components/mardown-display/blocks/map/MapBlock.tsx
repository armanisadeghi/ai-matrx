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

import { parseMap } from "./parseMap";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useCanvasPresentation } from "@ai-matrx/canvas/react";
import { mapPlacesList } from "@ai-matrx/rich-content/display/blocks/canvas-adaptive";
import { Button, Tile } from "@ai-matrx/design-system/controls";


const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

export interface MapBlockProps {
  content?: string;
  isStreamActive?: boolean;
  className?: string;
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
    if (!(await copyText(content.trim()))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
              // Full Print draws this map through the host's tile-aware capture.
              data-matrx-print-picture=""
              aria-label={spec.title ?? "Map"}
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
